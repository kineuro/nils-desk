// SPDX-License-Identifier: AGPL-3.0-only
// One review item's page (Wave 5 section 8.2): the stack, the header fields
// the rule read, the candidates the pack considered with the evidence for
// each, and the decision as a row with a name and a rule version. The
// viewer joins beside it once the study has chosen one (B6); until then the
// fields and the evidence alone.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { Json } from "../ask/client";
import { ops, type ReviewItem } from "../ops/client";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { kindWords, needsReading } from "./triage";
import type { Capabilities } from "../capabilities";
import { door as served } from "../sections";
import { lazy, Suspense } from "react";
const Viewer = lazy(() => import("../viewer/Viewer").then((m) => ({ default: m.Viewer })));

interface Candidate {
  value?: unknown;
  score?: unknown;
  votes?: unknown;
  evidence?: unknown;
  [k: string]: unknown;
}

/** The evidence's parts, in the shape its kind describes: the fields the rule read and the candidates it weighed. */
export function evidenceParts(e: Json | null | undefined): { fields: [string, unknown][]; candidates: Candidate[]; rest: [string, unknown][] } {
  if (!e) return { fields: [], candidates: [], rest: [] };
  const fields: [string, unknown][] = [];
  const rest: [string, unknown][] = [];
  let candidates: Candidate[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (k === "candidates" && Array.isArray(v)) candidates = v as Candidate[];
    else if ((k === "fields" || k === "header" || k === "read") && v && typeof v === "object" && !Array.isArray(v)) fields.push(...Object.entries(v as Json));
    else if (typeof v !== "object" || v === null) fields.push([k, v]);
    else rest.push([k, v]);
  }
  return { fields, candidates, rest };
}

export function ItemPage({ id, caps, onChanged }: { id: number; caps?: Capabilities; onChanged?: () => void }) {
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const [form, setForm] = useState({ value: "", nothing: false, member: "", scope: "stack", stage: false, why: "" });
  const [answer, setAnswer] = useState<Json | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const load = useCallback(() => {
    setSince(Date.now());
    ops
      .reviewItem(id)
      .then((i) => {
        setItem(i);
        setFailed(null);
      })
      .catch((e: unknown) => setFailed(classify(e)));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (failed) return <Failure failed={failed} action={{ label: "Try again", onClick: load }} />;
  if (!item) return <Wait phase="reading the item" since={since} size="panel" />;
  const parts = evidenceParts(item.evidence as Json | null);
  const decision = item.decision as Json | null;
  const decisionId = decision && typeof decision.id === "number" ? (decision.id as number) : null;
  const staged = Boolean(decision && decision.staged);
  const reading = needsReading(item);
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Json = { scope: form.scope, stage: form.stage };
    if (form.nothing) body.nothing = true;
    else if (form.value.trim()) body.value = form.value.trim();
    if (form.member.trim()) body.member = Number(form.member);
    if (form.why.trim()) body.why = form.why.trim();
    ops
      .reviewApply(id, body)
      .then((a) => {
        setAnswer(a);
        load();
        onChanged?.();
      })
      .catch((e: Error) => setWhy(e.message));
  };
  const accept = () =>
    ops
      .reviewAccept(id, form.why.trim() || undefined)
      .then((a) => {
        setAnswer(a);
        load();
        onChanged?.();
      })
      .catch((e: Error) => setWhy(e.message));
  const ref = (item.ref ?? {}) as Json;
  // the viewer beside the evidence (Wave 5 section 8.2, B6): on the item's stack, at the level the rule read when the evidence names one
  const stackId = typeof ref.stack_id === "number" ? ref.stack_id : null;
  const evidenceLevel = item.evidence && typeof (item.evidence as Json).level === "number" ? ((item.evidence as Json).level as number) : null;
  const viewerServed = caps ? served(caps, "GET /api/instances/{id}/manifest") : false;
  return (
    <div className={`item ${stackId !== null && viewerServed ? "with-viewer" : ""}`}>
      {stackId !== null && viewerServed && (
        <div className="item-viewer">
          <Suspense fallback={<Wait phase="loading the viewer" since={Date.now()} size="panel" />}><Viewer stack={stackId} level={evidenceLevel} /></Suspense>
        </div>
      )}
      <div className="item-facts">
      <dl className="facts">
        <dt>what</dt>
        <dd>{kindWords(item.kind)}</dd>
        <dt>scope</dt>
        <dd>
          {item.scope}
          {typeof ref.stack_id === "number" && <> <a href={`#stack/${ref.stack_id}`}>stack {ref.stack_id}</a></>}
          {typeof ref.subject_id === "number" && <> <a href={`#subject/${ref.subject_id}`}>subject {ref.subject_id}</a></>}
          {typeof ref.batch_id === "number" && <> <a href={`#batch/${ref.batch_id}`}>batch {ref.batch_id}</a></>}
        </dd>
        <dt>status</dt>
        <dd>{item.status}{item.accepted_by && <>, acknowledged by {item.accepted_by}</>}</dd>
        <dt>raised</dt>
        <dd>{item.created_at}</dd>
        {reading && (
          <>
            <dt>needs</dt>
            <dd>{reading}</dd>
          </>
        )}
      </dl>

      {parts.fields.length > 0 && (
        <div className="panel">
          <h3>What the rule read</h3>
          <dl className="facts">
            {parts.fields.map(([k, v]) => (
              <Fact key={k} k={k} v={v} />
            ))}
          </dl>
        </div>
      )}

      {parts.candidates.length > 0 && (
        <div className="panel">
          <h3>What the pack considered</h3>
          <table className="thin candidates">
            <thead>
              <tr>
                <th>candidate</th>
                <th className="num">score</th>
                <th>evidence</th>
              </tr>
            </thead>
            <tbody>
              {parts.candidates.map((c, i) => (
                <tr key={i}>
                  <td>{c.value === undefined ? JSON.stringify(c) : String(c.value)}</td>
                  <td className="num">{c.score !== undefined ? String(c.score) : c.votes !== undefined ? String(c.votes) : ""}</td>
                  <td>{c.evidence === undefined ? "" : typeof c.evidence === "string" ? c.evidence : <code>{JSON.stringify(c.evidence)}</code>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {parts.rest.length > 0 && (
        <details>
          <summary>The rest of the evidence</summary>
          <pre>{JSON.stringify(Object.fromEntries(parts.rest), null, 2)}</pre>
        </details>
      )}

      {Array.isArray(item.members) && item.members.length > 0 && (
        <details>
          <summary>{item.members.length} members</summary>
          <pre>{JSON.stringify(item.members, null, 2)}</pre>
        </details>
      )}

      <div className="panel">
        <h3>Decision</h3>
        {decision ? (
          <table className="thin decision">
            <thead>
              <tr>
                <th>axis</th>
                <th>value</th>
                <th>by</th>
                <th>as</th>
                <th>rule version</th>
                <th>why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{String(decision.axis ?? "")}</td>
                <td>{decision.value === null ? "no value" : String(decision.value ?? "")}</td>
                <td>{String(decision.actor ?? "")}</td>
                <td>{String(decision.author_kind ?? "")}</td>
                <td>{String(decision.model_version ?? decision.rule_version ?? "")}</td>
                <td>{String(decision.why ?? "")}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="meta">Not decided.</p>
        )}
        {item.status === "open" && (
          <form className="stack" onSubmit={apply}>
            <div className="row">
              <label>
                value <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} disabled={form.nothing} />
              </label>
              <label>
                <input type="checkbox" checked={form.nothing} onChange={(e) => setForm({ ...form, nothing: e.target.checked })} /> the axis has no value here
              </label>
            </div>
            <div className="row">
              <label>
                member <input value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })} placeholder="stack id, optional" size={14} />
              </label>
              <label>
                scope{" "}
                <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  {["stack", "series", "subject", "origin"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" checked={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.checked })} /> stage, commit later
              </label>
            </div>
            <label>
              why <input value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} size={40} />
            </label>
            <div className="row">
              <button type="submit" disabled={!form.nothing && !form.value.trim()}>Decide</button>
              <button type="button" onClick={accept}>Accept without a decision</button>
            </div>
          </form>
        )}
        {decisionId !== null && (
          <div className="row">
            {staged && (
              <button type="button" onClick={() => ops.decisionCommit(decisionId).then((a) => { setAnswer(a); load(); }).catch((e: Error) => setWhy(e.message))}>
                Commit decision {decisionId}
              </button>
            )}
            <button type="button" onClick={() => ops.decisionWithdraw(decisionId).then((a) => { setAnswer(a); load(); }).catch((e: Error) => setWhy(e.message))}>
              Withdraw decision {decisionId}
            </button>
          </div>
        )}
        {why && <p className="warn">{why}</p>}
        {answer && (
          <p className="meta">
            answered <code>{JSON.stringify(answer)}</code>
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <dt>{k.replace(/_/g, " ")}</dt>
      <dd>{v === null || v === undefined ? "" : typeof v === "object" ? <code>{JSON.stringify(v)}</code> : String(v)}</dd>
    </>
  );
}
