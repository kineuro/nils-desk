// SPDX-License-Identifier: AGPL-3.0-only
// A headless station run as a page draws it (record 26): the phases of
// keyword-tune (survey, prediction, rehearsal, check, proposal) and of
// identity-check (read, probe, proposal, yours), each done, now, waiting or
// failed, with what the verdict says of it. The desk reads the verdict the
// assistant settled; it holds no opinion of its own about what was found.

import type { Json } from "../ask/client";
import type { StationRun, Verdict } from "./stations";

export type Station = "keyword-tune" | "identity-check";

export interface Phase {
  key: string;
  title: string;
  state: "done" | "now" | "wait" | "failed";
  words: string;
  /** When the phase happened, as the verdict stamps it. */
  when: string | null;
}

const n = (v: number) => v.toLocaleString("en-US");

const TUNE: { key: string; title: string; waits: string }[] = [
  { key: "survey", title: "Survey", waits: "the signals of the scope and the open items on it, and the words the decided stacks share" },
  { key: "prediction", title: "Prediction", waits: "one change to one list, with what should flip and what must not move, written before any rehearsal" },
  { key: "rehearsal", title: "Rehearsal", waits: "tried on real stacks; writes nothing" },
  { key: "check", title: "Check", waits: "the rehearsal read against the prediction" },
  { key: "proposal", title: "Proposal", waits: "an overlay on the queue beside its review item; the station never adopts" },
];

const IDENTITY: { key: string; title: string; waits: string }[] = [
  { key: "read", title: "Read", waits: "the ingest locations this deployment registers, by name" },
  { key: "probe", title: "Probe", waits: "the rule in use and one candidate, side by side over a sample: shapes and counts, never a value" },
  { key: "proposal", title: "Proposal", waits: "the rule the shapes bear out" },
  { key: "yours", title: "Yours", waits: "a changed rule means reading the source again under it; the station proposes, it never re-reads" },
];

function text(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function stamp(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  return text(v);
}

/** The time of day a stamp names, for a phase's line. */
export function clockWords(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : t.toTimeString().slice(0, 8);
}

/** The prediction in words: what is added where, what should flip, what must not move. */
export function predictionWords(p: Json | null): string {
  if (!p) return "no prediction was written";
  const add = list(p.add);
  const remove = list(p.remove);
  const list_ = text(p.list) ?? text(p.bucket) ?? "";
  const flip = list(p.flip);
  const hold = list(p.must_not_regress);
  const parts: string[] = [];
  if (add.length > 0) parts.push(`Add ${add.join(" and ")} to ${list_}.`);
  if (remove.length > 0) parts.push(`Take ${remove.join(" and ")} out of ${list_}.`);
  if (flip.length > 0) parts.push(`Expect ${flip.length === 1 ? "the group" : `the ${n(flip.length)} groups`} ${flip.join(", ")} to close.`);
  if (hold.length > 0) parts.push(`${hold.map((h) => h.split("=")[0]).filter((v, i, a) => a.indexOf(v) === i).join(" and ")} must not move.`);
  return parts.join(" ") || "a change with nothing named";
}

/** The rehearsal in words, from whatever shape the station kept it in: the try door's result, or its diff. */
export function rehearsalWords(r: Json | null): string {
  if (!r) return "nothing was rehearsed";
  const moves = Array.isArray(r.moves) ? (r.moves as Json[]) : [];
  const moved = moves.reduce((s, m) => s + (typeof m.stacks === "number" ? m.stacks : 0), 0);
  const items = (r.review_items ?? {}) as Json;
  const cases = (r.cases ?? {}) as Json;
  const parts: string[] = [];
  if (moves.length > 0) {
    const by = new Map<string, number>();
    for (const m of moves) by.set(String(m.axis), (by.get(String(m.axis)) ?? 0) + (typeof m.stacks === "number" ? m.stacks : 0));
    parts.push(`${[...by.entries()].map(([axis, count]) => `${axis} moved on ${n(count)}`).join(", ")}.`);
  } else if (typeof r.moved === "number") parts.push(`${n(r.moved)} stacks moved.`);
  if (typeof items.close === "number" || typeof items.open === "number") parts.push(`Closes ${n(Number(items.close ?? 0))} ${Number(items.close ?? 0) === 1 ? "item" : "items"}, opens ${n(Number(items.open ?? 0))}.`);
  if (typeof cases.passed === "number") parts.push(`${cases.failed ? `${n(Number(cases.failed))} of the cases fail.` : `The ${n(cases.passed)} ${cases.passed === 1 ? "case passes" : "cases pass"}.`}`);
  const diff = text(r.diff) ?? text(r.verdict);
  if (diff) parts.push(`Read as ${diff}.`);
  if (parts.length === 0) parts.push(`${moved > 0 ? `${n(moved)} stacks moved.` : "Nothing moved."}`);
  return parts.join(" ");
}

/** The checks in a line: keep, and each check's name; or the ones that failed and why. */
export function checkWords(v: Verdict | null): string {
  if (!v) return "";
  const failed = v.checks.filter((c) => !c.passed);
  if (failed.length > 0) return failed.map((c) => `${c.name.replace(/_/g, " ")}: ${c.why ?? "failed"}`).join(" · ");
  return ["keep", ...v.checks.map((c) => c.name.replace(/_/g, " "))].join(" · ");
}

/** The phases of one run, from its state and, once settled, its verdict. */
export function phasesOf(station: Station, run: StationRun | null, verdict: Verdict | null): Phase[] {
  const plan = station === "keyword-tune" ? TUNE : IDENTITY;
  const state = run?.state ?? "queued";
  const result = (verdict?.result ?? {}) as Json;
  const proposal = verdict?.proposals[0] ?? null;
  if (state === "queued" || state === "running") {
    return plan.map((p, i) => ({ key: p.key, title: p.title, state: i === 0 && state === "running" ? "now" : "wait", words: p.waits, when: null }));
  }
  if (state === "failed" || state === "aborted") {
    const why = run?.error ?? (state === "aborted" ? "the run was stopped" : "the run failed");
    return plan.map((p, i) => ({ key: p.key, title: p.title, state: i === 0 ? "failed" : "wait", words: i === 0 ? why : p.waits, when: null }));
  }
  if (station === "keyword-tune") {
    const prediction = (result.prediction ?? null) as Json | null;
    const rehearsal = ((result.rehearsal ?? result.tried ?? result.try ?? result.diff_read ?? null) as Json | null) ?? (typeof result.diff === "string" ? { diff: result.diff } : null);
    const survey = text(result.survey) ?? (text(result.axis) ? `the signals on ${result.axis as string}${text(result.scope) ? ` for ${result.scope as string}` : ""}` : "the signals were read");
    const failed = verdict ? verdict.checks.some((c) => !c.passed) : false;
    return [
      { key: "survey", title: "Survey", state: "done", words: survey, when: null },
      { key: "prediction", title: "Prediction", state: prediction ? "done" : "failed", words: prediction ? predictionWords(prediction) : "no prediction was written", when: prediction ? stamp(prediction.at) : null },
      { key: "rehearsal", title: "Rehearsal", state: rehearsal ? "done" : "failed", words: rehearsal ? `${rehearsalWords(rehearsal)} Wrote nothing.` : "nothing was rehearsed", when: rehearsal ? stamp(rehearsal.at) : null },
      { key: "check", title: "Check", state: failed ? "failed" : "done", words: checkWords(verdict), when: null },
      {
        key: "proposal",
        title: "Proposal",
        state: proposal ? "now" : "wait",
        words: proposal ? `${proposal.sentence} On the queue beside its review item; the station never adopts.` : `No proposal: ${verdict?.terminal ?? "the run settled without one"}.`,
        when: null,
      },
    ];
  }
  const proposed = (result.proposed ?? proposal?.ref.rule ?? null) as Json | null;
  const jobs = Array.isArray(result.probe_jobs) ? (result.probe_jobs as unknown[]).filter((j) => typeof j === "number" || typeof j === "string") : [];
  return [
    { key: "read", title: "Read", state: "done", words: text(result.location) ? `the location ${result.location as string}` : "the deployment's locations", when: null },
    { key: "probe", title: "Probe", state: jobs.length > 0 ? "done" : "failed", words: jobs.length > 0 ? `ran as ${jobs.length === 1 ? "job" : "jobs"} ${jobs.map(String).join(", ")}; shapes and counts only` : "no probe ran", when: null },
    { key: "proposal", title: "Proposal", state: proposed ? "done" : "failed", words: proposed ? `${ruleWords(proposed)}. ${proposal?.sentence ?? text(result.sentence) ?? ""}`.trim() : `No rule proposed: ${verdict?.terminal ?? "the run settled without one"}.`, when: null },
    { key: "yours", title: "Yours", state: "wait", words: IDENTITY[3].waits, when: null },
  ];
}

/** An identity rule in words: what it reads first, then next; whether the code is taken verbatim. */
export function ruleWords(rule: Json | null): string {
  if (!rule) return "no rule";
  const from = Array.isArray(rule.from) ? (rule.from as Json[]) : [];
  const sources = from.map((s) => {
    const path = s.path as Json | undefined;
    if (path && typeof path.segment === "number") return `folder ${path.segment} of the path`;
    if (text(s.field)) return s.field as string;
    return "a source";
  });
  const head = sources.length === 0 ? "the default rule" : sources.length === 1 ? sources[0] : `${sources[0]}, then ${sources.slice(1).join(", then ")}`;
  const verbatim = rule.code === "verbatim" ? ", the code verbatim" : "";
  return `${head}${verbatim}`;
}

/** What the probe saw under one rule: the shapes with their counts, the people it makes, the files with no value. */
export interface Saw {
  title: string;
  shapes: { shape: string; count: number }[];
  people: number | null;
  empty: number | null;
  /** The question a path source raises, answered. */
  pathAnswer: string | null;
}

/** The two panels of an identity-check, from what the verdict saw per rule: the rule in use first, the candidate second. */
export function sawOf(verdict: Verdict | null): Saw[] {
  const result = (verdict?.result ?? {}) as Json;
  const saw = Array.isArray(result.saw) ? (result.saw as Json[]) : [];
  return saw.slice(0, 2).map((s, i) => {
    const rule = (s.rule ?? null) as Json | null;
    const label = text(s.label) ?? text(s.source) ?? ruleWords(rule);
    const raw = s.shapes ?? s.histogram ?? {};
    const shapes: { shape: string; count: number }[] = Array.isArray(raw)
      ? (raw as Json[]).map((r) => ({ shape: String(r.shape ?? ""), count: Number(r.count ?? r.files ?? 0) }))
      : Object.entries(raw as Json).map(([shape, count]) => ({ shape, count: Number(count ?? 0) }));
    shapes.sort((a, b) => b.count - a.count);
    const pid = result.path_is_direct_identifier;
    return {
      title: i === 0 ? `Now: ${label}` : `Candidate: ${label}`,
      shapes,
      people: typeof s.subjects === "number" ? s.subjects : typeof s.people === "number" ? s.people : null,
      empty: typeof s.empty === "number" ? s.empty : null,
      pathAnswer: i === 1 && typeof pid === "boolean" ? (pid ? "yes: a person's number, directly identifying" : "no: a study code, not a person's number") : null,
    };
  });
}

/** The tag at the run's head: what state it is in, in one word. */
export function runTag(run: StationRun | null, verdict: Verdict | null): { words: string; tone: "ok" | "brand" | "blocked" | "" } {
  const state = run?.state ?? "queued";
  if (state === "queued") return { words: "queued", tone: "" };
  if (state === "running") return { words: "running", tone: "brand" };
  if (state === "failed") return { words: "failed", tone: "blocked" };
  if (state === "aborted") return { words: "stopped", tone: "" };
  if (verdict && verdict.proposals.length > 0) return { words: "proposed", tone: "ok" };
  return { words: verdict?.terminal ?? "settled", tone: "" };
}
