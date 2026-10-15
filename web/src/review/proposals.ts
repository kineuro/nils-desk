// SPDX-License-Identifier: AGPL-3.0-only
// A proposed rule change (record 56, sections 5.3 to 5.6 and 6.5), as the
// engine keeps it: typed operations rehearsed over the registry with their
// effect report kept beside them, and the approval card a person decides on
// (what it moves, its largest moves, fixes, breaks and net on the answers
// people settled, every answer it breaks with its scan). A person adopts or
// rejects it; adopting a pack edit writes the pack's next version and
// re-sorts the registry, adopting a scoped change re-sorts its scope, and
// the re-sort writes on the proposal what it did. Read evenly, so a field an
// engine does not send reads as nothing.

import type { Json } from "../ask/client";
import { effectOf, valueWords, type AnswerCase, type Effect, type Ships } from "./effect";

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const opt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type Status = "proposed" | "adopted" | "rejected" | "retired";

/** What a person decides on: the proposal's effect, said short. */
export interface Card {
  moved: number;
  transitions: { axis: string; from: string; to: string; stacks: number }[];
  fixes: number;
  breaks: number;
  net: number;
  /** Every answer it breaks, with its scan (record 56, 5.6). */
  right_to_wrong: AnswerCase[];
  cases: { held: boolean; failures: string | null };
  review: { before: number; after: number };
  /** The same in the engine's plain sentences, a break said first. */
  says: string[];
}

/** What an adopted proposal's re-sort did, once it ended. */
export interface Measured {
  stacks: number;
  moved: number;
  axes: Record<string, number>;
  before: Record<string, Record<string, number>>;
  after: Record<string, Record<string, number>>;
}

export interface Proposal {
  id: number;
  pack: string;
  title: string;
  /** A pack edit, shipped as a rules release, or a scoped change for a site, a dataset, a scanner or a batch. */
  kind: "pack" | "scoped";
  /** The pack version it was rehearsed against. */
  on: string;
  scopes: string[];
  status: Status;
  reason: string;
  evidence: unknown;
  datasets: string[];
  author: string;
  /** A person, an agent, a model. */
  author_kind: string;
  created_at: string | null;
  rehearsed_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  /** Why it was decided so, where a person said. */
  why: string | null;
  /** Rehearsed against another pack version, or before a scoped change adopted since: it is rehearsed again before it is adopted. */
  stale: boolean;
  card: Card | null;
  ships: Ships | null;
  /** The rules version a pack edit wrote, once adopted. */
  version: { pack: string; version: string; from: string; tag: string | null; state: string } | null;
  /** The re-sort's job, once adopted. */
  job: { id: number; state: string } | null;
  /** What the re-sort is doing, and once it ended, what it did. */
  applied: { state: string; expected: { moved: number } | null; measured: Measured | null } | null;
  /** The overlay a scoped change was made of (the overlays door marks it `overlay.adopt`), with its name and version. */
  overlay: { id: number; name: string; version: string } | null;
  /** Why an adopted scoped change no sort applies any more: a later version of its overlay replaced it, or the overlay was refused. */
  retired_why: string | null;
  /** Only on one proposal's own read. */
  operations: Json[];
  report: Effect | null;
}

function cases(v: unknown): AnswerCase[] {
  return arr(v)
    .filter(isObj)
    .map((c) => ({ stack: num(c.stack), axis: str(c.axis), answer: str(c.answer), before: str(c.before), after: str(c.after) }));
}

function tallies(v: unknown): Record<string, Record<string, number>> {
  if (!isObj(v)) return {};
  return Object.fromEntries(Object.entries(v).map(([axis, t]) => [axis, isObj(t) ? Object.fromEntries(Object.entries(t).map(([k, n]) => [k, num(n)])) : {}]));
}

export function cardOf(v: unknown): Card | null {
  if (!isObj(v)) return null;
  const c = isObj(v.cases) ? v.cases : {};
  const r = isObj(v.review) ? v.review : {};
  return {
    moved: num(isObj(v.moved) ? v.moved.stacks : v.moved),
    transitions: arr(v.transitions)
      .filter(isObj)
      .map((t) => ({ axis: str(t.axis), from: str(t.from), to: str(t.to), stacks: num(t.stacks) })),
    fixes: num(v.fixes),
    breaks: num(v.breaks),
    net: num(v.net),
    right_to_wrong: cases(v.right_to_wrong),
    cases: { held: c.held !== false, failures: typeof c.failures === "string" ? c.failures : null },
    review: { before: num(r.before), after: num(r.after) },
    says: arr(v.says).map(String),
  };
}

function shipsOf(v: unknown): Ships | null {
  if (!isObj(v)) return null;
  if (v.as === "rules release") return { as: "rules release", pack: str(v.pack), version: str(v.version), from: str(v.from) };
  return { as: "overlay", pack: str(v.pack), on: str(v.on), scopes: arr(v.scopes).map(String), with_pack_edits: v.with_pack_edits === true };
}

function measuredOf(v: unknown): Measured | null {
  if (!isObj(v)) return null;
  const moved = isObj(v.moved) ? v.moved : {};
  return {
    stacks: num(v.stacks),
    moved: num(moved.stacks ?? v.moved),
    axes: isObj(moved.axes) ? Object.fromEntries(Object.entries(moved.axes).map(([k, n]) => [k, num(n)])) : {},
    before: tallies(v.before),
    after: tallies(v.after),
  };
}

/** A proposal as a door answered it, made even. */
export function proposalOf(raw: unknown): Proposal {
  const p = isObj(raw) ? raw : {};
  const version = isObj(p.version) ? p.version : null;
  const job = isObj(p.job) ? p.job : typeof p.job === "number" ? { id: p.job, state: "" } : null;
  const applied = isObj(p.applied) ? p.applied : null;
  const expected = applied && isObj(applied.expected) ? applied.expected : null;
  const status: Status = p.status === "adopted" || p.status === "rejected" || p.status === "retired" ? p.status : "proposed";
  const ev = isObj(p.evidence) ? p.evidence : null;
  const retired = applied && isObj(applied.retired) ? applied.retired : null;
  return {
    id: num(p.id),
    pack: str(p.pack),
    title: str(p.title),
    kind: p.kind === "scoped" ? "scoped" : "pack",
    on: str(p.on),
    scopes: arr(p.scopes).map(String),
    status,
    reason: str(p.reason),
    evidence: p.evidence ?? null,
    datasets: arr(p.datasets).map(String),
    author: str(p.author),
    author_kind: str(p.author_kind),
    created_at: opt(p.created_at),
    rehearsed_at: opt(p.rehearsed_at),
    decided_at: opt(p.decided_at),
    decided_by: opt(p.decided_by),
    why: opt(p.why),
    stale: p.stale === true,
    card: cardOf(p.card),
    ships: shipsOf(p.ships),
    version: version ? { pack: str(version.pack), version: str(version.version), from: str(version.from), tag: opt(version.tag), state: str(version.state) } : null,
    job: job ? { id: num(job.id), state: str(job.state) } : null,
    applied: applied ? { state: str(applied.state), expected: expected ? { moved: num(isObj(expected.moved) ? expected.moved.stacks : expected.moved) } : null, measured: measuredOf(applied.measured) } : null,
    overlay: ev && ev.made_by === "overlay.adopt" ? { id: num(ev.overlay), name: str(ev.name), version: str(ev.version) } : null,
    retired_why: retired ? opt(retired.why) : null,
    operations: arr(p.operations).filter(isObj),
    report: isObj(p.report) ? effectOf(p.report) : null,
  };
}

/** The pack's proposals as the list door answers them. */
export function proposalsOf(raw: unknown): { counts: Record<Status, number>; proposals: Proposal[] } {
  const r = isObj(raw) ? raw : {};
  const c = isObj(r.counts) ? r.counts : {};
  return { counts: { proposed: num(c.proposed), adopted: num(c.adopted), rejected: num(c.rejected), retired: num(c.retired) }, proposals: arr(r.proposals).map(proposalOf) };
}

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

/** The card's effect in a line: what it moves, its largest moves, and what it does to the answers we know (record 56, section 7: "47 scans from T2w to FLAIR, fixes 47, breaks 0"). */
export function cardLine(c: Card): string {
  const parts: string[] = [c.moved === 0 ? "Moves nothing" : `Moves ${plural(c.moved, "scan", "scans")}`];
  for (const t of [...c.transitions].sort((a, b) => b.stacks - a.stacks).slice(0, 2)) parts.push(`${t.axis} ${valueWords(t.from)} → ${valueWords(t.to)}, ${n(t.stacks)}`);
  parts.push(`fixes ${n(c.fixes)}, breaks ${n(c.breaks)}`);
  return parts.join(" · ");
}

/** Where a proposal lands, in a line: the pack's next version for everyone, or its scopes. */
export function landsWords(p: Proposal): string {
  if (p.kind === "pack") {
    const v = p.ships?.as === "rules release" ? p.ships.version : null;
    return v ? `For everyone: ${p.pack} ${v}` : "For everyone: the pack's next version";
  }
  const scopes = p.scopes.map((s) => s.replace(/^(site|dataset|scanner|batch):/u, "$1 ")).join(", ");
  return `Only ${scopes || "its scope"}`;
}

/** A proposal's state as the card's tag says it. */
export function stateTag(p: Proposal): { words: string; tone: "caution" | "ok" | "" } {
  if (p.status === "adopted") return { words: "adopted", tone: "ok" };
  if (p.status === "rejected") return { words: "not adopted", tone: "" };
  if (p.status === "retired") return { words: "retired", tone: "" };
  if (p.stale) return { words: "rehearse again", tone: "caution" };
  return { words: "waits for you", tone: "caution" };
}

/** Whether a proposal is adoptable now: waiting, and rehearsed on the pack and the changes in force as they are. */
export function adoptable(p: Proposal): boolean {
  // never decided without its card: one kept without a card is rehearsed again first
  return p.status === "proposed" && !p.stale && p.card !== null;
}

/** Whether the re-sort of an adopted proposal still runs. */
export function resorting(p: Proposal): boolean {
  const s = p.applied?.state ?? p.job?.state ?? "";
  return p.status === "adopted" && (s === "queued" || s === "running");
}

/** What the re-sort did, in a line, once it ended; or where it stands. */
export function appliedWords(p: Proposal): string | null {
  if (p.status === "retired") return p.retired_why ? `Retired: ${p.retired_why}` : "Retired: no sort applies it any more";
  if (p.status !== "adopted") return null;
  const written = p.version ? `Written as ${p.version.pack} ${p.version.version}${p.version.state === "to_release" ? ", to release" : ""}` : null;
  const a = p.applied;
  const state = a?.state || p.job?.state || "";
  const job = p.job && p.job.id ? ` (job ${p.job.id})` : "";
  let resort: string;
  if (a?.measured) {
    const m = a.measured;
    const axes = Object.entries(m.axes)
      .filter(([, v]) => v > 0)
      .sort((x, y) => y[1] - x[1])
      .map(([axis, v]) => `${axis} ${n(v)}`)
      .join(", ");
    resort = `Re-sorted ${plural(m.stacks, "scan", "scans")}: ${n(m.moved)} moved${axes ? ` (${axes})` : ""}`;
  } else if (state === "failed" || state === "cancelled") resort = `Its re-sort ${state === "failed" ? "stopped" : "was cancelled"}${job}`;
  else if (state === "done") resort = `Re-sorted${job}`;
  else resort = `Re-sorting${job}`;
  return [written, resort].filter(Boolean).join(" · ");
}

/** The stored answers of one axis before and after the re-sort, the values that changed, most first. */
export function axisCounts(m: Measured, axis: string): { value: string; before: number; after: number }[] {
  const b = m.before[axis] ?? {};
  const a = m.after[axis] ?? {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .map((value) => ({ value, before: b[value] ?? 0, after: a[value] ?? 0 }))
    .filter((r) => r.before !== r.after)
    .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before) || x.value.localeCompare(y.value));
}
