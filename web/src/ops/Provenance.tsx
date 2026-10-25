// SPDX-License-Identifier: AGPL-3.0-only
// The provenance panel (Wave 7b section 8.6; record 57 P8, record 58 P5): on
// a run's unit, on a scan in the dataset viewer and on its session, one
// button, Provenance, opens a panel that reads GET /api/provenance/{kind}/{id}
// and lists the steps that ran on the subject, session or stack: each with its
// run, its keys, its results (files and measures) and the result's curation
// state in the words every door says (current, stale with why, unknown).
// Withheld steps are counted plainly; below detail quasi the engine names no
// unit and the panel says "a unit".

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Wait } from "../ui/Wait";
import { whenWords } from "../data/sources";
import { workflows, type Provenance, type ProvenanceStep } from "./client";
import { keyShort } from "./pack";
import { curationTone, curationWords, workflowActs, workflowRunHref } from "./workflows";

const n = (v: number) => v.toLocaleString("en-US");

export type ProvenanceKind = "subject" | "session" | "stack";

/** What the panel is of, in words: "stack 1041", "session 12@20260112", "subject 12". */
export function ofWords(kind: ProvenanceKind, id: string): string {
  return `${kind} ${id}`;
}

/** The button that opens the panel, where the engine serves the door and the person may read it; nothing otherwise. */
export function ProvenanceButton({ caps, kind, id, label = "Provenance", className = "button quiet small" }: { caps: Capabilities; kind: ProvenanceKind; id: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!workflowActs(caps).provenance) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-label={`${label} of ${ofWords(kind, id)}`}>
        {label}
      </button>
      {open && <ProvenancePanel kind={kind} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The panel: it reads the door once it opens. */
export function ProvenancePanel({ kind, id, onClose }: { kind: ProvenanceKind; id: string; onClose: () => void }) {
  const [load, setLoad] = useState<{ kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; p: Provenance }>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    let alive = true;
    workflows.provenance(kind, id).then(
      (p) => alive && setLoad({ kind: "ready", p }),
      (e: unknown) => alive && setLoad({ kind: "failed", why: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [kind, id]);
  return (
    <Dialog title="Provenance" eyebrow={ofWords(kind, id)} icon="layers" onClose={onClose} className="provenance-dialog" foot={<div className="row actions"><button type="button" className="button secondary" onClick={onClose}>Close</button></div>}>
      {load.kind === "loading" && <Wait phase="reading the provenance" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The provenance could not be read: {load.why}</p>}
      {load.kind === "ready" && <ProvenanceView p={load.p} />}
    </Dialog>
  );
}

/** A step's result files in a few words: "2 files: lesions mask, flair image", from the kinds. */
export function filesWords(s: ProvenanceStep): string | null {
  const files = s.results?.derivatives ?? [];
  if (files.length === 0) return null;
  const kinds = new Map<string, number>();
  for (const f of files) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
  return `${n(files.length)} ${files.length === 1 ? "file" : "files"}: ${[...kinds.entries()].map(([k, c]) => (c === 1 ? k : `${n(c)} ${k}`)).join(", ")}`;
}

/** A step's measures counted. */
export function measuresCount(s: ProvenanceStep): number {
  const m = s.results?.measures;
  if (Array.isArray(m)) return m.length;
  if (m && typeof m === "object") return Object.keys(m as object).length;
  return 0;
}

/** The steps, newest run first, each one block; the counts and the withheld steps above them. */
export function ProvenanceView({ p }: { p: Provenance }) {
  const steps = [...p.steps].sort((a, b) => b.run - a.run || (a.step ?? "").localeCompare(b.step ?? ""));
  const counts = p.counts ?? {};
  const stale = counts.stale ?? steps.filter((s) => s.curation?.state === "stale").length;
  const unknown = counts.unknown ?? steps.filter((s) => s.curation?.state === "unknown").length;
  const withheld = p.withheld?.steps ?? 0;
  const stacks = p.stacks ?? [];
  return (
    <div className="stack provenance">
      <p className="meta provenance-line">
        {n(counts.steps ?? steps.length)} {(counts.steps ?? steps.length) === 1 ? "step" : "steps"}
        {stacks.length > 0 ? ` over ${n(stacks.length)} ${stacks.length === 1 ? "stack" : "stacks"}` : ""}
        {stale > 0 ? <> · <span className="tag caution">{n(stale)} stale</span></> : ""}
        {unknown > 0 ? ` · ${n(unknown)} unknown` : ""}
      </p>
      {withheld > 0 && (
        <p className="meta provenance-withheld">
          {n(withheld)} {withheld === 1 ? "step" : "steps"} withheld{p.withheld?.why ? `: ${p.withheld.why}` : ""}
        </p>
      )}
      {stale > 0 && p.stale_words && <p className="unit-note caution">{p.stale_words}</p>}
      {steps.length === 0 && withheld === 0 && <p className="meta">Nothing ran on it yet.</p>}
      {steps.map((s) => (
        <ProvenanceStepView key={`${s.run}:${s.step ?? ""}:${s.unit ?? ""}`} s={s} />
      ))}
    </div>
  );
}

/** One step: the run and the pipeline, the unit, the keys, what it made and its curation state. */
export function ProvenanceStepView({ s }: { s: ProvenanceStep }) {
  const cur = curationWords(s.curation);
  const tone = curationTone(s.curation?.state);
  const files = filesWords(s);
  const measures = measuresCount(s);
  const from = s.results?.from_run ?? s.reused_from ?? null;
  return (
    <div className={`provenance-step ${tone}`}>
      <div className="provenance-head">
        <a href={href("pipelines", "runs", String(s.run))}>run {n(s.run)}</a>
        <b>{s.pipeline}</b>
        {s.workflow_run != null && (
          <a className="meta" href={workflowRunHref(s.workflow_run)}>
            workflow run {n(s.workflow_run)}
            {s.step ? ` · step ${s.step}` : ""}
          </a>
        )}
        <span className="meta">{s.unit ?? "a unit"}</span>
        {s.status && <span className={`tag ${s.status === "succeeded" || s.status === "done" ? "ok" : s.status === "failed" ? "caution" : ""}`.trim()}>{s.status}</span>}
        {s.finished_at && <span className="meta num">{whenWords(s.finished_at)}</span>}
      </div>
      <div className="unit-pack">
        {s.keys?.comparability && (
          <span className="unit-key" title={`comparability key ${s.keys.comparability}${s.keys.result ? `; result key ${s.keys.result}` : ""}`}>
            key {s.keys.short ?? keyShort(s.keys.comparability)}
          </span>
        )}
        {from !== null && (
          <a className="unit-note ok" href={href("pipelines", "runs", String(from))}>
            reused from run {n(from)}
          </a>
        )}
        {files && <span className="meta">{files}</span>}
        {measures > 0 && (
          <span className="meta">
            {n(measures)} {measures === 1 ? "measure" : "measures"}
          </span>
        )}
        {!files && measures === 0 && <span className="meta">nothing kept</span>}
        {s.words && s.pack_status && s.pack_status !== "ready" && <span className="unit-flag">{s.words}</span>}
        {cur && (
          <span className={`unit-note ${tone}`} title={s.curation?.changes?.map((c) => `${c.pack ?? "pack"}: ${c.was ?? "?"} → ${c.now ?? "?"}`).join("; ") || undefined}>
            {cur}
          </span>
        )}
      </div>
    </div>
  );
}
