// SPDX-License-Identifier: AGPL-3.0-only
// Settings (Wave 4c section 7.6): one page, one section per part, each
// setting owned and enforced by the part that has it. Engine: read only,
// with the flags to paste when a change needs a restart. Desk: identity
// mode, engine URL, session lifetime, export permission, retention; users
// in local mode. Kvasir: backends and health, the models table, minted
// keys, the organisation's commercial key. Assistant: what its document
// says. Apps: the registry. Every write here sits behind the same identity
// as the data.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../sections";
import { type Backend, kvasir, type KeyRow, opening, type PurposeRow } from "./kvasir";

export function Settings({ caps }: { caps: Capabilities }) {
  const admin = holds(caps, "admin");
  return (
    <section className="ops settings">
      <header className="ask-head">
        <div>
          <h1>Settings</h1>
          <p className="meta">One section per part. A setting is owned and enforced by the part that has it; the desk only shows and, where a door exists, sends.</p>
        </div>
      </header>
      <Engine caps={caps} />
      <Desk caps={caps} />
      {caps.kvasir !== null && caps.desk.settings?.kvasir_url && <Kvasir caps={caps} admin={admin} />}
      {caps.assistant !== null && <Assistant caps={caps} />}
      <Apps caps={caps} />
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function Engine({ caps }: { caps: Capabilities }) {
  const e = caps.engine;
  if (!e) return <div className="panel"><h2>Engine</h2><p className="warn">The engine did not answer.</p></div>;
  const reg = e.registry as { epoch: number; schema_version?: number; node?: string };
  return (
    <div className="panel">
      <h2>Engine</h2>
      <p className="meta">Read only: everything the engine's capabilities document says. A change is a flag on <code>nils serve</code> and a restart.</p>
      <dl className="provenance">
        <Row k="engine" v={`${e.engine.name} ${e.engine.version}`} />
        <Row k="contracts" v={Object.entries(e.contracts).map(([k, v]) => `${k} ${v}`).join(", ")} />
        <Row k="auth" v={e.auth} />
        <Row k="principal" v={<>{e.principal} as {e.roles.join(", ")}</>} />
        <Row k="registry" v={<>epoch {reg.epoch}{reg.schema_version !== undefined ? `, schema ${reg.schema_version}` : ""}{reg.node ? `, node ${reg.node}` : ""}</>} />
        <Row k="packs" v={e.packs.map((p) => `${p.name} ${p.version}`).join(", ")} />
        <Row k="doors" v={`${e.doors.length} doors, ${e.policy.length} policy rows`} />
        <Row k="event streams" v={String(e.event_streams ?? 0)} />
        <Row k="ingest locations" v={(e.ingest_roots ?? []).length > 0 ? (e.ingest_roots ?? []).join(", ") : "none registered (--ingest-root name=path)"} />
        <Row k="backup directory" v={e.backup_dir ? "set" : "not set (--backup-dir)"} />
        <Row k="assist" v={e.assist ? String(e.assist) : "none (--assist URL)"} />
      </dl>
      {caps.desk.settings?.engine_flags && (
        <div>
          <p><strong>The flags to paste</strong> for this desk's identity mode, on the engine's command line:</p>
          <pre className="procedure">nils serve {caps.desk.settings.engine_flags}</pre>
        </div>
      )}
      <details>
        <summary>the policy table</summary>
        <div className="scroll">
          <table className="thin">
            <thead><tr><th>door</th><th>role</th><th>writes</th><th>idempotent</th><th>cost</th><th>cap</th><th>label</th></tr></thead>
            <tbody>{e.policy.map((r) => <tr key={r.door}><td><code>{r.door}</code></td><td>{r.role}</td><td>{r.writes ? "yes" : ""}</td><td>{r.idempotent ? "yes" : ""}</td><td>{r.cost}</td><td>{r.result_cap}</td><td>{r.label?.present}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Desk({ caps }: { caps: Capabilities }) {
  const d = caps.desk;
  const s = d.settings;
  return (
    <div className="panel">
      <h2>Desk</h2>
      <dl className="provenance">
        <Row k="version" v={d.version} />
        <Row k="identity mode" v={<>{d.mode}{d.mode === "off" ? ": one person on one machine, every entitlement, no login" : d.mode === "local" ? ": users the desk keeps; the desk is a small issuer the engine trusts" : ": an identity provider; the desk is a confidential client with PKCE"}</>} />
        {s && (
          <>
            <Row k="origin" v={<code>{s.origin}</code>} />
            <Row k="engine" v={<code>{s.engine_url}</code>} />
            {s.kvasir_url && <Row k="kvasir" v={<code>{s.kvasir_url}</code>} />}
            {s.assistant_url && <Row k="assistant" v={<code>{s.assistant_url}</code>} />}
            <Row k="session lifetime" v={<>{s.session_hours} hours; a minted engine token lives {s.token_minutes} minutes, a command line token {s.cli_token_hours} hours</>} />
            <Row k="export" v={s.export === "off" ? "off" : `needs the ${s.export} entitlement; every page is audited by the engine`} />
            <Row k="store" v={<code>{s.store}</code>} />
            <Row k="retention" v={s.retention} />
          </>
        )}
        <Row k="contracts" v={Object.entries(d.contracts).map(([k, v]) => `${k} ${v}`).join(", ")} />
      </dl>
      <p className="meta">These are set in the desk's configuration file and take a restart; none is changed from a browser.</p>
      {d.mode === "local" && holds(caps, "admin") && <Users />}
      {d.signed_in && d.login && (
        <div className="row">
          <button type="button" onClick={() => fetch("/desk/logout", { method: "POST", headers: { "X-Nils-Desk": "1" } }).then(() => location.reload())}>Log out</button>
        </div>
      )}
    </div>
  );
}

function Kvasir({ caps, admin }: { caps: Capabilities; admin: boolean }) {
  const [backends, setBackends] = useState<Backend[] | null>(null);
  const [table, setTable] = useState<PurposeRow[] | null>(null);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [ack, setAck] = useState<Record<string, string>>({});
  const [mint, setMint] = useState({ principal: "", purposes: "", max_class: "catalog", days: "" });
  const [minted, setMinted] = useState<{ id: string; key: string } | null>(null);
  const [cred, setCred] = useState({ provider: "", secret: "" });
  const load = useCallback(() => {
    kvasir.backends().then((b) => setBackends(b.backends)).catch((e: Error) => setWhy(e.message));
    kvasir.purposes().then((p) => setTable(p.purposes)).catch((e: Error) => setWhy(e.message));
    if (admin) kvasir.keys().then((k) => setKeys(k.keys)).catch(() => setKeys([]));
  }, [admin]);
  useEffect(() => {
    load();
  }, [load]);
  const models = (caps.kvasir?.models as { id: string; name?: string }[] | undefined) ?? [];
  const setPolicy = (p: PurposeRow) => {
    const b = pick[p.purpose] ?? p.backend ?? "";
    const backend = backends?.find((x) => x.id === b);
    if (!backend) return;
    const need = opening(p, backend);
    if (need === "never") return setWhy(`${p.purpose} carries identifiers and never opens to a remote backend.`);
    const text = need === "acknowledge" ? (ack[p.purpose] ?? "").trim() : "";
    if (need === "acknowledge" && !text) return setWhy(`${p.purpose} carries rows of the archive: write the acknowledgement that rows will leave the site, under your name.`);
    setWhy(null);
    kvasir.setPolicy(p.purpose, b, text || null).then(() => { setNote(`${p.purpose} now runs on ${b}.`); load(); }).catch((e: Error) => setWhy(e.message));
  };
  const doMint = (e: React.FormEvent) => {
    e.preventDefault();
    const purposes = mint.purposes.split(/[\s,]+/).filter(Boolean);
    const days = Number(mint.days);
    const expires = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : null;
    kvasir.mint(mint.principal.trim(), purposes, mint.max_class, expires).then((m) => { setMinted({ id: m.id, key: m.key }); load(); }).catch((e: Error) => setWhy(e.message));
  };
  const providers = [...new Set((backends ?? []).map((b) => b.provider).filter((p): p is string => Boolean(p)))];
  return (
    <div className="panel">
      <h2>Kvasir</h2>
      <p className="meta">The model gateway. {models.length} models advertised{caps.kvasir && (caps.kvasir as { health?: { warming?: boolean } }).health?.warming ? "; warming" : ""}.</p>
      {why && <p className="warn">{why}</p>}
      {note && <p>{note}</p>}
      <h3>Backends</h3>
      {backends === null ? <p>Reading</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr><th>backend</th><th>kind</th><th>locality</th><th>provider</th><th>credential</th><th>models</th><th>health</th></tr></thead>
            <tbody>
              {backends.map((b) => (
                <tr key={b.id}><td>{b.id}</td><td>{b.kind}</td><td>{b.locality}</td><td>{b.provider ?? ""}</td><td>{b.credential === null ? "" : b.credential ? "stored" : "none"}</td><td>{b.models.join(", ")}</td><td>{healthWords(b.health)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>Models table</h3>
      <p className="meta">One row per registered purpose: its app, its content class, its current backend, what its class allows, and the acknowledgement an admin gave where a rows purpose was opened to a remote backend.</p>
      {table === null ? <p>Reading</p> : table.length === 0 ? <p>No purpose is registered; an app registers its purposes in Kvasir's configuration.</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr><th>purpose</th><th>app</th><th>content</th><th>kind</th><th>backend</th><th>may open remote</th><th>acknowledged</th>{admin && <th>set</th>}</tr></thead>
            <tbody>
              {table.map((p) => {
                const chosen = pick[p.purpose] ?? p.backend ?? "";
                const b = backends?.find((x) => x.id === chosen);
                const need = b ? opening(p, b) : "yes";
                return (
                  <tr key={p.purpose}>
                    <td>{p.purpose}</td><td>{p.app}</td><td>{p.content}</td><td>{p.kind}</td>
                    <td>{p.backend ?? "none"}{p.locality ? ` (${p.locality})` : ""}{p.default ? " by default" : ""}</td>
                    <td>{p.may_open_remote}</td>
                    <td>{p.acknowledged ? <>{p.acknowledged.by}: <em>{p.acknowledged.text}</em></> : ""}</td>
                    {admin && (
                      <td>
                        <div className="row">
                          <select value={chosen} onChange={(e) => setPick({ ...pick, [p.purpose]: e.target.value })} aria-label={`backend for ${p.purpose}`}>
                            {(backends ?? []).map((x) => <option key={x.id} value={x.id} disabled={opening(p, x) === "never"}>{x.id} ({x.locality})</option>)}
                          </select>
                          {need === "acknowledge" && (
                            <input value={ack[p.purpose] ?? ""} onChange={(e) => setAck({ ...ack, [p.purpose]: e.target.value })} placeholder="the acknowledgement, under your name" size={36} />
                          )}
                          <button type="button" disabled={!chosen || chosen === p.backend && !p.default && need !== "acknowledge"} onClick={() => setPolicy(p)}>Set</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {admin && (
        <div>
          <h3>Minted keys</h3>
          {keys === null ? <p>Reading</p> : keys.length === 0 ? <p className="meta">No key minted.</p> : (
            <table className="thin">
              <thead><tr><th>key</th><th>principal</th><th>purposes</th><th>class</th><th>expires</th><th></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}><td><code>{k.id}</code></td><td>{k.principal}</td><td>{k.purposes.join(", ")}</td><td>{String(k.max_class ?? k.maxClass ?? "")}</td><td>{k.expires_at ?? k.expiresAt ? new Date(Number(k.expires_at ?? k.expiresAt) * 1000).toISOString() : "never"}</td>
                    <td><button type="button" onClick={() => kvasir.revoke(k.id).then(load).catch((e: Error) => setWhy(e.message))}>Revoke</button></td></tr>
                ))}
              </tbody>
            </table>
          )}
          <form className="row" onSubmit={doMint}>
            <input value={mint.principal} onChange={(e) => setMint({ ...mint, principal: e.target.value })} placeholder="principal the key acts as" size={22} />
            <input value={mint.purposes} onChange={(e) => setMint({ ...mint, purposes: e.target.value })} placeholder="purposes, comma separated" size={26} />
            <select value={mint.max_class} onChange={(e) => setMint({ ...mint, max_class: e.target.value })}><option>catalog</option><option>rows</option><option>identifiers</option></select>
            <input value={mint.days} onChange={(e) => setMint({ ...mint, days: e.target.value })} placeholder="days, blank for never" size={16} inputMode="numeric" />
            <button type="submit" disabled={!mint.principal.trim()}>Mint</button>
          </form>
          {minted && <p className="overlay">Key <code>{minted.id}</code> minted. Its secret is shown once, here, and never again: <code>{minted.key}</code></p>}
          <h3>The organisation's commercial key</h3>
          <p className="meta">Stored sealed in Kvasir, shown never. A provider's backend reaches its service only while a credential is stored.</p>
          <form className="row" onSubmit={(e) => { e.preventDefault(); kvasir.credential(cred.provider.trim(), cred.secret).then((r) => { setNote(`the credential of ${r.provider} is stored; shown ${r.shown}.`); setCred({ provider: "", secret: "" }); load(); }).catch((e: Error) => setWhy(e.message)); }}>
            <input value={cred.provider} onChange={(e) => setCred({ ...cred, provider: e.target.value })} placeholder="provider" list="providers" size={14} />
            <datalist id="providers">{providers.map((p) => <option key={p} value={p} />)}</datalist>
            <input type="password" value={cred.secret} onChange={(e) => setCred({ ...cred, secret: e.target.value })} placeholder="the key" size={30} autoComplete="off" />
            <button type="submit" disabled={!cred.provider.trim() || cred.secret.length < 8}>Store</button>
            {cred.provider.trim() && <button type="button" onClick={() => kvasir.forget(cred.provider.trim()).then(() => { setNote(`the credential of ${cred.provider.trim()} is forgotten.`); load(); }).catch((e: Error) => setWhy(e.message))}>Forget</button>}
          </form>
        </div>
      )}
    </div>
  );
}

/** The health rule in words: warming until the first token; the rest as counts. */
function healthWords(h: Backend["health"]): string {
  const parts: string[] = [h.warming ? "warming" : "warm"];
  if (typeof h.running === "number") parts.push(`${h.running} running`);
  if (typeof h.queued === "number") parts.push(`${h.queued} queued`);
  if (typeof h.lastError === "string" && h.lastError) parts.push(`last error: ${h.lastError}`);
  return parts.join(", ");
}

function Assistant({ caps }: { caps: Capabilities }) {
  const a = caps.assistant ?? {};
  const stations = Array.isArray(a.stations) ? (a.stations as Record<string, unknown>[]) : null;
  return (
    <div className="panel">
      <h2>Assistant</h2>
      <p className="meta">What the assistant's own capabilities document says; each of these is set and enforced there.</p>
      {stations ? (
        <table className="thin">
          <thead><tr>{Object.keys(stations[0] ?? {}).map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>{stations.map((s, i) => <tr key={i}>{Object.keys(stations[0] ?? {}).map((k) => <td key={k}>{typeof s[k] === "object" ? <code>{JSON.stringify(s[k])}</code> : String(s[k] ?? "")}</td>)}</tr>)}</tbody>
        </table>
      ) : null}
      <details><summary>the document</summary><pre>{JSON.stringify(a, null, 2)}</pre></details>
    </div>
  );
}

function Apps({ caps }: { caps: Capabilities }) {
  return (
    <div className="panel">
      <h2>Apps</h2>
      {caps.apps.length === 0 ? <p className="meta">No app is registered with this desk.</p> : (
        <table className="thin">
          <thead><tr><th>app</th><th>title</th><th>entitlement</th><th>answered</th></tr></thead>
          <tbody>{caps.apps.map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.title ?? ""}</td><td>{a.entitlement ?? "reader"}</td><td>{a.capabilities ? "yes" : "no: its section is absent"}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

interface UserRow { username: string; display: string; entitlements: string[]; admin: boolean }

/** The admin's users page of local mode: grant and revoke entitlements. */
function Users() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [all, setAll] = useState<string[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const load = () =>
    fetch("/desk/users")
      .then((r) => r.json())
      .then((d: { users: UserRow[]; entitlements: string[] }) => { setUsers(d.users); setAll(d.entitlements); })
      .catch((e: Error) => setWhy(e.message));
  useEffect(() => { load(); }, []);
  const toggle = (u: UserRow, e: string) => {
    const next = u.entitlements.includes(e) ? u.entitlements.filter((x) => x !== e) : [...u.entitlements, e];
    fetch(`/desk/users/${encodeURIComponent(u.username)}/entitlements`, {
      method: "PUT", headers: { "content-type": "application/json", "X-Nils-Desk": "1" }, body: JSON.stringify({ entitlements: next }),
    }).then(async (r) => (r.ok ? load() : setWhy((await r.json()).error)));
  };
  if (!users) return <p>Reading the users</p>;
  return (
    <div>
      <h2>Users</h2>
      <table className="users">
        <thead><tr><th>user</th>{all.map((e) => <th key={e}>{e}</th>)}</tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username}>
              <td>{u.display} <code>{u.username}</code></td>
              {all.map((e) => (
                <td key={e}><input type="checkbox" checked={u.entitlements.includes(e)} onChange={() => toggle(u, e)} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {why && <p className="warn">{why}</p>}
      <p>A new user is added at the command line: <code>nils-desk user add NAME</code>.</p>
    </div>
  );
}
