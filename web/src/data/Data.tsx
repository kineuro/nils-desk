// SPDX-License-Identifier: AGPL-3.0-only
// Data (Wave 4c section 7.5): packs, batches with their reports as shapes,
// quarantine, the ingest forms over the pre-registered locations of
// section 6.5 (each a job), backup as a job with its archives listed,
// verify as a job, and restore as a page that prints the exact command and
// the pre-restore procedure (D50). Key management stays on the command line.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { JobRow, Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { stationsServed } from "../assistant/stations";
import { Anonymisation } from "./Anonymisation";
import { ops } from "../ops/client";
import { type Batch, data } from "../ops/client";
import { command, type IngestForm, restoreProcedure, type Verb } from "./ingest";

const TABS: [string, string][] = [["packs", "Packs"], ["batches", "Batches"], ["quarantine", "Quarantine"], ["ingest", "Ingest"], ["anonymisation", "Anonymisation"], ["backup", "Backup"], ["restore", "Restore"]];

function tabOfHash(): string | null {
  const m = /^#data(?:\/([a-z]+))?/.exec(location.hash);
  return m?.[1] ?? null;
}

export function Data({ caps }: { caps: Capabilities }) {
  const [tab, setTab] = useState<string>(() => tabOfHash() ?? "packs");
  useEffect(() => {
    const onHash = () => {
      const t = tabOfHash();
      if (t) setTab(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const operator = caps.person.entitlements.some((e) => e === "operator" || e === "admin");
  // the anonymisation page of section 9.14 needs the probe door, an operator, and the assistant's identity-check
  const probe = caps.engine?.doors.includes("POST /api/ingest/probe") && stationsServed(caps).includes("identity-check");
  const tabs = TABS.filter(([id]) => (operator || !["ingest", "anonymisation", "backup", "restore"].includes(id)) && (id !== "anonymisation" || probe));
  const active = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];
  return (
    <section className="ops">
      <header className="ask-head">
        <div>
          <h1>Data</h1>
          <p className="meta">What the registry holds and how it got there; every verb here is a job over a registered location.</p>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map(([id, title]) => (
          <button key={id} type="button" className={id === active ? "on" : ""} onClick={() => { setTab(id); location.hash = `#data/${id}`; }}>{title}</button>
        ))}
      </nav>
      {active === "packs" && <Packs caps={caps} />}
      {active === "batches" && <Batches />}
      {active === "quarantine" && <Quarantine />}
      {active === "ingest" && <Ingest caps={caps} />}
      {active === "anonymisation" && <Anonymisation caps={caps} />}
      {active === "backup" && <Backup caps={caps} />}
      {active === "restore" && <Restore />}
    </section>
  );
}

function Packs({ caps }: { caps: Capabilities }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pack, setPack] = useState<Json | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return setPack(null);
    data.pack(open).then(setPack).catch((e: Error) => setWhy(e.message));
  }, [open]);
  const packs = caps.engine?.packs ?? [];
  return (
    <div>
      {why && <p className="warn">{why}</p>}
      <table className="thin">
        <thead><tr><th>pack</th><th>version</th></tr></thead>
        <tbody>{packs.map((p) => <tr key={p.name} className={p.name === open ? "on" : ""}><td><button type="button" className="cell" onClick={() => setOpen(p.name)}>{p.name}</button></td><td>{p.version}</td></tr>)}</tbody>
      </table>
      {pack && (
        <div className="panel">
          <h2>{String(pack.pack)} {String(pack.version)}, contract {String(pack.contract)}, {String(pack.modality)}, {String(pack.cases)} cases</h2>
          {Array.isArray(pack.axes) && (
            <table className="thin">
              <thead><tr><th>axis</th><th>multi</th><th className="num">values</th><th className="num">review below</th><th>asks when missing</th></tr></thead>
              <tbody>{(pack.axes as Json[]).map((a) => <tr key={String(a.axis)}><td>{String(a.axis)}</td><td>{String(a.multi)}</td><td className="num">{String(a.values)}</td><td className="num">{String(a.review_below)}</td><td>{String(a.asks_when_missing)}</td></tr>)}</tbody>
            </table>
          )}
          {Array.isArray(pack.rule_sets) && <p>rule sets: {(pack.rule_sets as Json[]).map((r) => `${String(r.rule_set)} (${String(r.rules)} rules)`).join(", ")}</p>}
          {Array.isArray(pack.passes) && <p>passes: {(pack.passes as Json[]).map((p) => `${String(p.pass)} as ${String(p.kind)}`).join(", ")}</p>}
          {pack.buckets !== undefined && pack.buckets !== null && typeof pack.buckets === "object" ? (
            <details><summary>buckets</summary><pre>{JSON.stringify(pack.buckets, null, 2)}</pre></details>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Batches() {
  const [rows, setRows] = useState<Batch[] | null>(null);
  const [open, setOpen] = useState<Batch | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    data.batches().then((b) => setRows(b.batches)).catch((e: Error) => setWhy(e.message));
  }, []);
  return (
    <div>
      {why && <p className="warn">{why}</p>}
      {rows === null ? <p>Reading</p> : rows.length === 0 ? <p>No batch yet.</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr><th>batch</th><th>name</th><th>state</th><th>started</th><th>finished</th><th className="num">seen</th><th className="num">parsed</th><th className="num">quarantined</th><th className="num">ingested</th><th className="num">epoch after</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className={b.id === open?.id ? "on" : ""}>
                  <td><button type="button" className="cell" onClick={() => data.batch(b.id).then(setOpen).catch((e: Error) => setWhy(e.message))}>{b.id}</button></td>
                  <td>{b.name}</td><td>{b.state}</td><td className="when">{b.started_at}</td><td className="when">{b.finished_at ?? ""}</td>
                  <td className="num">{b.seen ?? ""}</td><td className="num">{b.parsed ?? ""}</td><td className="num">{b.quarantined ?? ""}</td><td className="num">{b.ingested ?? ""}</td><td className="num">{b.epoch_after ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <div className="panel">
          <h2>batch {open.id}: {open.name}, {open.state}</h2>
          {open.report ? <pre>{JSON.stringify(open.report, null, 2)}</pre> : <p className="meta">No report on this batch; a synthetic or an interrupted one.</p>}
          <p className="meta">Samples in a report are shapes only; no file name or value crosses this door.</p>
        </div>
      )}
    </div>
  );
}

function Quarantine() {
  const [batch, setBatch] = useState("");
  const [cls, setCls] = useState("");
  const [rows, setRows] = useState<Json[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const load = useCallback(() => {
    data.quarantine(batch ? Number(batch) : undefined, cls || undefined).then((q) => setRows(q.files)).catch((e: Error) => setWhy(e.message));
  }, [batch, cls]);
  useEffect(() => {
    load();
  }, [load]);
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div>
      <div className="row">
        <label>batch <input value={batch} onChange={(e) => setBatch(e.target.value)} inputMode="numeric" size={6} /></label>
        <label>class <input value={cls} onChange={(e) => setCls(e.target.value)} size={16} /></label>
      </div>
      {why && <p className="warn">{why}</p>}
      {rows === null ? <p>Reading</p> : rows.length === 0 ? <p>Nothing is quarantined{batch || cls ? " under that filter" : ""}.</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c}>{typeof r[c] === "object" && r[c] !== null ? <code>{JSON.stringify(r[c])}</code> : String(r[c] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The ingest forms: each a job over a pre-registered location. */
function Ingest({ caps }: { caps: Capabilities }) {
  const roots = ((caps.engine as { ingest_roots?: string[] } | null)?.ingest_roots ?? []) as string[];
  const [f, setF] = useState<IngestForm>({ verb: "digest", location: { root: roots[0] ?? "", path: "" }, name: "", modality: "", force: false, files: "", id_type: "", id_column: "", code_column: "", pack: "" });
  const [why, setWhy] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const cmd = command(f);
  const set = (patch: Partial<IngestForm>) => setF({ ...f, ...patch });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmd.ok) return;
    ops.enqueue(cmd.command, f.name?.trim() || undefined).then((j) => setQueued(j.job)).catch((e: Error) => setWhy(e.message));
  };
  const needsLocation = f.verb === "digest" || f.verb === "linkage import";
  return (
    <form className="stack" onSubmit={submit}>
      {roots.length === 0 && <p className="warn">No ingest location is registered: start nils serve with <code>--ingest-root name=path</code>. Classify and fingerprint still run over what is already in.</p>}
      {why && <p className="warn">{why}</p>}
      <div className="row">
        <label>verb{" "}
          <select value={f.verb} onChange={(e) => set({ verb: e.target.value as Verb })}>
            {(["digest", "classify", "fingerprint", "linkage import"] as Verb[]).map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label>name <input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="the run's label" size={24} /></label>
      </div>
      {needsLocation && (
        <div className="row">
          <label>location{" "}
            <select value={f.location.root} onChange={(e) => set({ location: { ...f.location, root: e.target.value } })}>
              <option value="">pick one</option>
              {roots.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label>path under it <input value={f.location.path} onChange={(e) => set({ location: { ...f.location, path: e.target.value } })} placeholder={f.verb === "digest" ? "a directory, relative" : "the CSV, relative"} size={32} /></label>
        </div>
      )}
      {f.verb === "digest" && (
        <div className="row">
          <label>files <input value={f.files ?? ""} onChange={(e) => set({ files: e.target.value })} placeholder="all, dcm, no-ext, a glob" size={18} /></label>
          <label>pack <input value={f.pack ?? ""} onChange={(e) => set({ pack: e.target.value })} placeholder="mri" size={8} /></label>
        </div>
      )}
      {(f.verb === "classify" || f.verb === "fingerprint") && (
        <div className="row">
          <label>modality <input value={f.modality ?? ""} onChange={(e) => set({ modality: e.target.value })} placeholder="MR, CT, PT; all when empty" size={8} /></label>
          {f.verb === "classify" && <label>pack <input value={f.pack ?? ""} onChange={(e) => set({ pack: e.target.value })} placeholder="mri" size={8} /></label>}
          {f.verb === "fingerprint" && <label><input type="checkbox" checked={Boolean(f.force)} onChange={(e) => set({ force: e.target.checked })} /> derive again for stacks that already have one</label>}
        </div>
      )}
      {f.verb === "linkage import" && (
        <div className="row">
          <label>id type <input value={f.id_type ?? ""} onChange={(e) => set({ id_type: e.target.value })} placeholder="patient-id" size={12} /></label>
          <label>id column <input value={f.id_column ?? ""} onChange={(e) => set({ id_column: e.target.value })} placeholder="identifier" size={12} /></label>
          <label>code column <input value={f.code_column ?? ""} onChange={(e) => set({ code_column: e.target.value })} placeholder="code" size={12} /></label>
        </div>
      )}
      <p>{cmd.ok ? <>Will queue <code>nils {cmd.command.join(" ")}</code></> : <span className="meta">Not yet: {cmd.why}.</span>}</p>
      <div className="row"><button type="submit" disabled={!cmd.ok}>Queue the job</button></div>
      {queued !== null && <p>Queued as job {queued}. Watch it under Operations, Jobs.</p>}
    </form>
  );
}

/** Backup is a job with its archives listed; verify is a job. */
function Backup({ caps }: { caps: Capabilities }) {
  const configured = Boolean((caps.engine as { backup_dir?: boolean } | null)?.backup_dir);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const load = useCallback(() => {
    ops.jobs(true, 100).then((j) => setJobs(j.jobs.filter((x) => x.kind === "backup" || x.kind === "verify"))).catch((e: Error) => setWhy(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const archives = jobs.filter((j) => j.kind === "backup" && j.state === "done" && j.result);
  return (
    <div>
      {!configured && <p className="warn">No backup directory: start nils serve with <code>--backup-dir</code>. Backup and verify are refused until then.</p>}
      {why && <p className="warn">{why}</p>}
      <div className="row">
        <button type="button" disabled={!configured} onClick={() => ops.enqueue(["backup"]).then(load).catch((e: Error) => setWhy(e.message))}>Back up now, as a job</button>
        <label>archive <input value={name} onChange={(e) => setName(e.target.value)} placeholder="a name in the backup directory" size={28} /></label>
        <button type="button" disabled={!configured || !name.trim()} onClick={() => ops.enqueue(["verify", name.trim()]).then(load).catch((e: Error) => setWhy(e.message))}>Verify, as a job</button>
        <button type="button" onClick={load}>Refresh</button>
      </div>
      <h2>Archives</h2>
      {archives.length === 0 ? <p className="meta">No finished backup job has listed an archive yet.</p> : (
        <ul>{archives.map((j) => <li key={j.id}>job {j.id} at {j.finished_at}: <code>{JSON.stringify(j.result)}</code></li>)}</ul>
      )}
      <h2>Backup and verify jobs</h2>
      {jobs.length === 0 ? <p className="meta">None yet.</p> : (
        <div className="scroll">
          <table className="thin">
            <thead><tr><th>job</th><th>kind</th><th>state</th><th>started</th><th>finished</th><th>result</th></tr></thead>
            <tbody>{jobs.map((j) => <tr key={j.id}><td>{j.id}</td><td>{j.kind}</td><td>{j.state}</td><td className="when">{j.started_at}</td><td className="when">{j.finished_at ?? ""}</td><td>{j.error ? <span className="warn">{j.error}</span> : <code>{j.result ? JSON.stringify(j.result).slice(0, 160) : ""}</code>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Restore prints the exact command and the procedure; it runs nothing (D50). */
function Restore() {
  const [archive, setArchive] = useState("");
  const [home, setHome] = useState("");
  useEffect(() => {
    ops.custody().then((c) => setHome(c.home)).catch(() => undefined);
  }, []);
  const lines = restoreProcedure(archive, home);
  return (
    <div className="stack">
      <p>A restore replaces the registry and the linkage store with an archive, with the engine stopped. It is not a job and never runs from here: this page prints the exact command line and the procedure around it.</p>
      <div className="row">
        <label>archive <input value={archive} onChange={(e) => setArchive(e.target.value)} placeholder="the archive directory on the engine's host" size={40} /></label>
        <label>registry home <input value={home} onChange={(e) => setHome(e.target.value)} size={32} /></label>
      </div>
      <pre className="procedure">{lines.join("\n")}</pre>
      <p className="meta">Key management stays on the command line: the key store is copied by backup on its own and is not touched by restore.</p>
    </div>
  );
}
