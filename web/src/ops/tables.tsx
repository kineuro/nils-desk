// SPDX-License-Identifier: AGPL-3.0-only
// The operational tables (Wave 4c section 7.5), re-homed by Wave 5 section 6.2: thin tables over doors that exist, each
// gated by the entitlement the door wants. Jobs live from the events door
// under the cap, with polling as the fallback; review; releases and
// handovers, where the desk shows exactly what will be released and who
// authored each edit and requires the selection's name typed; custody;
// audit; sessions.

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { ask, chain, type Column, columnName, desk, type DocumentHandle, type HandleRow, type JobRow, results } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { type AuditRow, type CustodyStore, ops, type ReleaseRow } from "./client";
import { confirmName, confirmed, list, releaseBody, type ReleaseForm, type ReleaseSource, stackIds } from "./release";
import { parse } from "../routes";
import { objects, type Place } from "../objects/client";
import { type AuditFilter, auditQuery } from "../settings/console";
import { door as served } from "../sections";

/** The release the address names: #release/releases/77. */
function tabOfHash(): { tab: string | null; arg: string | null } {
  const r = parse();
  return r.kind === "section" ? { tab: r.tab, arg: r.arg } : { tab: null, arg: null };
}

/** Jobs: live from the events door when a stream is free, else polled. */
export function Jobs({ caps }: { caps: Capabilities }) {
  const [open, setOpen] = useState<JobRow[] | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [all, setAll] = useState<JobRow[]>([]);
  const [how, setHow] = useState<"stream" | "poll">("poll");
  const [why, setWhy] = useState<string | null>(null);
  const streams = (caps.engine as { event_streams?: number } | null)?.event_streams ?? 0;
  const poll = useCallback(() => {
    ops.jobs(false).then((j) => setOpen(j.jobs)).catch((e: Error) => setWhy(e.message));
    ops.jobs(true, 50).then((j) => setAll(j.jobs)).catch(() => undefined);
  }, []);
  useEffect(() => {
    poll();
    if (streams <= 0 || typeof EventSource === "undefined") {
      const t = setInterval(poll, 5000);
      return () => clearInterval(t);
    }
    const es = new EventSource("/api/events");
    let fallback: ReturnType<typeof setInterval> | null = null;
    es.addEventListener("jobs", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { epoch: number; jobs: JobRow[] };
      setHow("stream");
      setEpoch(d.epoch);
      setOpen(d.jobs);
    });
    es.onerror = () => {
      // the cap, or a proxy that does not stream: polling, every five seconds
      es.close();
      setHow("poll");
      if (!fallback) fallback = setInterval(poll, 5000);
    };
    const slow = setInterval(() => ops.jobs(true, 50).then((j) => setAll(j.jobs)).catch(() => undefined), 30_000);
    return () => {
      es.close();
      if (fallback) clearInterval(fallback);
      clearInterval(slow);
    };
  }, [poll, streams]);
  const cancel = (id: number) => ops.cancel(id).then(poll).catch((e: Error) => setWhy(e.message));
  const finished = all.filter((j) => ["done", "failed", "cancelled"].includes(j.state));
  return (
    <div>
      <p className="meta">
        {how === "stream" ? `live from the events door${epoch !== null ? `, epoch ${epoch}` : ""}` : "polled every five seconds"}; {streams} event streams allowed
      </p>
      {why && <p className="warn">{why}</p>}
      <h2>Open</h2>
      {open === null ? <p>Reading</p> : open.length === 0 ? <p>Nothing is running or queued.</p> : (
        <JobTable jobs={open} onCancel={cancel} />
      )}
      <h2>Finished</h2>
      {finished.length === 0 ? <p>None yet.</p> : <JobTable jobs={finished} />}
    </div>
  );
}

export function JobTable({ jobs, onCancel }: { jobs: JobRow[]; onCancel?: (id: number) => void }) {
  return (
    <div className="scroll">
      <table className="thin">
        <thead><tr><th>job</th><th>kind</th><th>name</th><th>state</th><th>started</th><th>beat</th><th>progress</th><th>result</th>{onCancel && <th></th>}</tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>{j.id}</td><td>{j.kind}</td><td>{j.name ?? (j.args?.argv ?? []).join(" ")}</td><td>{j.state}</td>
              <td className="when">{j.started_at}</td><td className="when">{j.heartbeat_at ?? j.finished_at ?? ""}</td>
              <td><code>{j.progress ? JSON.stringify(j.progress) : ""}</code></td>
              <td>{j.error ? <span className="warn">{j.error}</span> : j.result ? <code>{JSON.stringify(j.result).slice(0, 120)}</code> : ""}</td>
              {onCancel && <td>{["queued", "running"].includes(j.state) && <button type="button" onClick={() => onCancel(j.id)}>Cancel</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Releases: the history, and the form that shows exactly what will be released. */
export function Releases({ caps }: { caps: Capabilities }) {
  const [rows, setRows] = useState<ReleaseRow[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [kind, setKind] = useState<"handle" | "hand">(() => (tabOfHash().arg ? "handle" : "handle"));
  const [handleId, setHandleId] = useState<string>(() => tabOfHash().arg ?? "");
  const [handle, setHandle] = useState<HandleRow | null>(null);
  const [stacks, setStacks] = useState<number[]>([]);
  const [firstPage, setFirstPage] = useState<{ columns: Column[]; rows: unknown[][] } | null>(null);
  const [document, setDocument] = useState<{ id: number; sentences: [string, string][]; versions: DocumentHandle[] } | null>(null);
  const [hand, setHand] = useState({ cohorts: "", subjects: "", axes: "" });
  const [form, setForm] = useState<ReleaseForm>({ name: "", out: "", layout: "", dates: "keep", on_unknown: "", pack: "", scheme_name: "" });
  const [typed, setTyped] = useState("");
  const [queued, setQueued] = useState<{ job: number; command?: string[] } | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [declaration, setDeclaration] = useState<{ key_namespace?: string; disclosure?: string; grain?: string } | null>(null);
  useEffect(() => {
    ops.releases().then((r) => setRows(r.releases)).catch((e: Error) => setWhy(e.message));
    // Wave 5 section 8.3 and 10.2: a release writes only to an export place; the picker offers them when the engine names places
    if (served(caps, "GET /api/places")) objects.places().then((p) => setPlaces(p.places.filter((x) => x.role === "export" && x.retired_at === null))).catch(() => setPlaces(null));
  }, [caps]);
  // the handle, all its stack ids, its first page, and the document it came from
  useEffect(() => {
    const id = Number(handleId);
    if (kind !== "handle" || !Number.isInteger(id) || id <= 0) return;
    let alive = true;
    (async () => {
      try {
        const h = (await results.handles(true)).handles.find((x) => x.id === id) ?? null;
        if (!alive) return;
        setHandle(h);
        if (!h) throw new Error(`no handle ${id} within your scope`);
        const ids: number[] = [];
        let page = 0;
        let pages = 1;
        while (page < pages && page < 200) {
          const r = await ask.rows(id, page);
          if (page === 0) setFirstPage({ columns: r.columns, rows: r.rows.slice(0, 10) });
          ids.push(...stackIds(r.columns, r.rows));
          pages = r.pages;
          page += 1;
        }
        if (alive) setStacks(ids);
        const rec = (await desk.results()).results.find((r) => r.handle === id);
        if (rec && alive) {
          const [d, versions] = await Promise.all([ask.describe(rec.document), chain(rec.document)]);
          if (alive) {
            setDocument({ id: rec.document, sentences: d.sets, versions });
            setDeclaration({ key_namespace: d.declaration.key_namespace, disclosure: d.declaration.disclosure, grain: d.declaration.grain });
          }
        }
      } catch (e) {
        if (alive) setWhy((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, handleId]);
  const src: ReleaseSource = kind === "handle" ? { kind, handle: handle ?? undefined } : { kind, cohorts: list(hand.cohorts), subjects: list(hand.subjects), axes: list(hand.axes) };
  const body = releaseBody(src, form, stacks);
  const ok = body.ok && confirmed(src, form.name, typed);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.ok || !ok) return;
    ops.release(body.body).then((a) => { setQueued({ job: a.job, command: a.command }); ops.releases().then((r) => setRows(r.releases)); }).catch((e: Error) => setWhy(e.message));
  };
  const packs = caps.engine?.packs ?? [];
  return (
    <div>
      {why && <p className="warn">{why}</p>}
      <h2>History</h2>
      {rows === null ? <p>Reading</p> : rows.length === 0 ? <p>No release yet.</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr><th>id</th><th>name</th><th>version</th><th>root</th><th>started</th><th className="num">files</th><th className="num">subjects</th><th className="num">added</th><th className="num">removed</th><th>layout</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.version}</td><td><code>{r.root}</code></td><td className="when">{r.started_at ?? ""}</td><td className="num">{r.files ?? ""}</td><td className="num">{r.subjects ?? ""}</td><td className="num">{r.added ?? ""}</td><td className="num">{r.removed ?? ""}</td><td>{r.layout ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Release</h2>
      <form className="stack" onSubmit={submit}>
        <div className="row">
          <label><input type="radio" checked={kind === "handle"} onChange={() => setKind("handle")} /> off a handle</label>
          <label><input type="radio" checked={kind === "hand"} onChange={() => setKind("hand")} /> by cohort, subjects or axis</label>
        </div>
        {kind === "handle" ? (
          <div>
            <label>handle <input value={handleId} onChange={(e) => { setHandleId(e.target.value); setHandle(null); setStacks([]); setFirstPage(null); setDocument(null); }} inputMode="numeric" size={8} /></label>
            {handle && (
              <div className="panel">
                <p><strong>What will be released:</strong> {handle.row_count} {handle.grain} rows of handle {handle.id}{handle.name ? ` (${handle.name})` : ""}, run by {handle.principal} at {handle.created_at}, epoch {handle.epoch}, {handle.disclosure}.</p>
                {handle.grain !== "stack" && <p className="warn">A release reads stacks; this handle is at the {handle.grain} grain.</p>}
                {firstPage && (
                  <div className="scroll">
                    <table className="preview">
                      <thead><tr>{firstPage.columns.map((c) => <th key={columnName(c)}>{columnName(c)}</th>)}</tr></thead>
                      <tbody>{firstPage.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? "" : String(v)}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                {document ? (
                  <div>
                    <p><strong>The question</strong> (document {document.id}):</p>
                    <ul>{document.sentences.map(([s, text]) => <li key={s}>{text}</li>)}</ul>
                    <p><strong>Who authored each edit:</strong></p>
                    <ol className="versions">
                      {document.versions.map((v) => <li key={v.document}><span>{v.document}</span><span>{v.principal ?? "unknown"}</span><span className="when">{v.created_at ?? ""}</span><span className="changed">{v.parent === null ? "the root" : `from ${v.parent}`}</span></li>)}
                    </ol>
                  </div>
                ) : (
                  <p className="meta">The desk has no record of the document this handle came from; the handle's own provenance stands.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="stack">
            <label>cohorts <input value={hand.cohorts} onChange={(e) => setHand({ ...hand, cohorts: e.target.value })} placeholder="names, comma separated" size={40} /></label>
            <label>subjects <input value={hand.subjects} onChange={(e) => setHand({ ...hand, subjects: e.target.value })} placeholder="codes, comma separated" size={40} /></label>
            <label>axes <input value={hand.axes} onChange={(e) => setHand({ ...hand, axes: e.target.value })} placeholder="axis=value, comma separated" size={40} /></label>
          </div>
        )}
        <div className="row">
          <label>name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size={20} /></label>
          {places && places.length > 0 ? (
            <label>
              export place{" "}
              <select value={form.out} onChange={(e) => setForm({ ...form, out: e.target.value })}>
                <option value="">choose</option>
                {places.map((p) => (
                  <option key={p.id} value={p.path}>{p.name} ({p.role})</option>
                ))}
              </select>
            </label>
          ) : (
            <label>out <input value={form.out} onChange={(e) => setForm({ ...form, out: e.target.value })} placeholder={places === null ? "a directory on the engine's host" : "no export place is bound; an operator binds one under Settings"} size={32} /></label>
          )}
        </div>
        <div className="row">
          <label>layout <select value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })}><option value="">default</option><option>descriptive</option><option>bids</option></select></label>
          <label>dates <select value={form.dates} onChange={(e) => setForm({ ...form, dates: e.target.value })}><option>keep</option><option>shift</option><option>year</option></select></label>
          <label>on unknown <select value={form.on_unknown} onChange={(e) => setForm({ ...form, on_unknown: e.target.value })}><option value="">hold</option><option>write</option></select></label>
          <label>pack <select value={form.pack} onChange={(e) => setForm({ ...form, pack: e.target.value })}><option value="">default</option>{packs.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
          <label>scheme <input value={form.scheme_name} onChange={(e) => setForm({ ...form, scheme_name: e.target.value })} placeholder="stored scheme name" size={14} /></label>
        </div>
        <p>{body.ok ? <>Will release <strong>{body.summary}</strong>.</> : <span className="meta">Not yet: {body.why}.</span>}</p>
        <label>
          <dl className="release-facts">
            <dt>pseudonym namespace</dt>
            <dd>{declaration?.key_namespace ?? "the registry's pseudonymous key"}</dd>
            <dt>layout</dt>
            <dd>{form.layout || "the pack's default"}</dd>
            <dt>dates</dt>
            <dd>{form.dates || "keep"}{form.dates === "keep" || !form.dates ? "" : ", held back"}</dd>
            <dt>fields held back</dt>
            <dd>{declaration?.disclosure ? `as the declaration says: ${declaration.disclosure}` : "as the pack's release policy says"}</dd>
            <dt>audit rows</dt>
            <dd>one for the release by {caps.person.subject}, one per handover that carries it</dd>
            <dt>export place</dt>
            <dd>{form.out || "not chosen"}</dd>
          </dl>
          type <code>{confirmName(src, form.name) || "the name"}</code> to confirm{" "}
          <input value={typed} onChange={(e) => setTyped(e.target.value)} size={20} />
        </label>
        <div className="row"><button type="submit" disabled={!ok}>Release as a job</button></div>
        {queued && <p>Queued as job {queued.job}{queued.command && <>: <code>nils {queued.command.join(" ")}</code></>}. Watch it on the Jobs tab.</p>}
      </form>
    </div>
  );
}

export function Handovers() {
  const [release, setRelease] = useState("");
  const [out, setOut] = useState("");
  const [key, setKey] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ job: number; command?: string[] } | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    ops.handover(release.trim(), out.trim(), key.trim() || undefined).then(setQueued).catch((e: Error) => setWhy(e.message));
  };
  return (
    <form className="stack" onSubmit={submit}>
      <p className="meta">Hand a release over: the engine's handover verb as a job. The key stays on the engine's host; name it, never paste it.</p>
      {why && <p className="warn">{why}</p>}
      <label>release <input value={release} onChange={(e) => setRelease(e.target.value)} placeholder="a release name from the history" size={24} /></label>
      <label>out <input value={out} onChange={(e) => setOut(e.target.value)} placeholder="a directory on the engine's host" size={32} /></label>
      <label>key <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="a key name on the engine's host, optional" size={32} /></label>
      <div className="row"><button type="submit" disabled={!release.trim() || !out.trim()}>Hand over as a job</button></div>
      {queued && <p>Queued as job {queued.job}{queued.command && <>: <code>nils {queued.command.join(" ")}</code></>}.</p>}
    </form>
  );
}

export function Custody() {
  const [engine, setEngine] = useState<{ home: string; backend: string; registry_id: string; stores: CustodyStore[] } | null>(null);
  const [mine, setMine] = useState<CustodyStore[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    ops.custody().then(setEngine).catch((e: Error) => setWhy(e.message));
    ops.deskCustody().then((d) => setMine(d.stores)).catch(() => setMine([]));
  }, []);
  const table = (stores: CustodyStore[]) => (
    <div className="scroll">
      <table className="thin">
        <thead><tr><th>store</th><th>holds</th><th>what</th><th>where</th><th>kept</th><th>read</th><th>change</th><th>delete</th></tr></thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.store}>
              <td>{s.store}</td><td>{s.holds.join(", ")}</td><td>{s.what}</td>
              <td><code>{s.where}</code>{s.files.length > 0 && <span className="meta"> ({s.files.length} files, {s.files.reduce((n, f) => n + f.bytes, 0)} bytes)</span>}</td>
              <td>{s.kept}</td><td><code>{s.commands.read.join("; ")}</code></td><td><code>{s.commands.change.join("; ")}</code></td><td>{s.commands.delete}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div>
      {why && <p className="warn">{why}</p>}
      <h2>The registry</h2>
      {engine ? <><p className="meta">{engine.backend} at <code>{engine.home}</code>, registry {engine.registry_id}</p>{table(engine.stores)}</> : <p>Reading</p>}
      <h2>The desk and the parts</h2>
      {mine.length > 0 ? table(mine) : <p className="meta">The desk's own custody is not readable to you.</p>}
    </div>
  );
}

export function Audit() {
  // Wave 5 section 10.5: filtered by person, by door, by object and by month; the raw projections as their own view; reading it writes a row
  const [f, setF] = useState<AuditFilter & { raw: boolean }>({ principal: "", action: "", object: "", month: "", raw: false });
  const [all, setAll] = useState<AuditRow[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const load = useCallback(() => {
    ops.audit(auditQuery(f)).then((r) => setAll(r.rows)).catch((e: Error) => setWhy(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the door's query is the dependency
  }, [f.principal, f.action, f.month]);
  useEffect(() => {
    load();
  }, [load]);
  const rows = useMemo(() => {
    if (!all) return null;
    const object = f.object.trim().toLowerCase();
    return all.filter((r) => {
      const action = String(r.action ?? "");
      if (f.raw && !/project|rows|export|values/.test(action)) return false;
      if (f.month && typeof r.at === "string" && !r.at.startsWith(f.month)) return false;
      if (object && !JSON.stringify(r).toLowerCase().includes(object)) return false;
      return true;
    });
  }, [all, f.object, f.month, f.raw]);
  const columns = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows ?? []) for (const k of Object.keys(r)) seen.add(k);
    const first = ["id", "at", "principal", "action"].filter((k) => seen.has(k));
    return [...first, ...[...seen].filter((k) => !first.includes(k))];
  }, [rows]);
  return (
    <div>
      <p className="meta">Every row, by person, by door, by object and by month. This view is a disclosure surface of its own: reading it writes a row.</p>
      <div className="row">
        <label>person <input value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} size={14} /></label>
        <label>door <input value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="linkage. for a prefix" size={16} /></label>
        <label>object <input value={f.object} onChange={(e) => setF({ ...f, object: e.target.value })} placeholder="handle 71, document 9" size={16} /></label>
        <label>month <input value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} placeholder="2026-09" size={8} /></label>
        <label><input type="checkbox" checked={f.raw} onChange={(e) => setF({ ...f, raw: e.target.checked })} /> raw projections only</label>
      </div>
      {why && <p className="warn">{why}</p>}
      {rows === null ? <p>Reading</p> : rows.length === 0 ? <p>No row matches.</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={String(r.id ?? i)}>{columns.map((c) => <td key={c}>{typeof r[c] === "object" && r[c] !== null ? <code>{JSON.stringify(r[c])}</code> : String(r[c] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Sessions() {
  const [scheme, setScheme] = useState("");
  const [force, setForce] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); ops.rebuild(scheme.trim() || undefined, force).then((j) => setQueued(j.job)).catch((e: Error) => setWhy(e.message)); }}>
      <p className="meta">Rebuild the session cache under a scheme, as a job under the writer: identity for every subject whose timeline changed, or every subject with force.</p>
      {why && <p className="warn">{why}</p>}
      <label>scheme <input value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="a stored scheme's name; the default when empty" size={24} /></label>
      <label><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> every subject, not only those whose timeline changed</label>
      <div className="row"><button type="submit">Rebuild as a job</button></div>
      {queued !== null && <p>Queued as job {queued}.</p>}
    </form>
  );
}
