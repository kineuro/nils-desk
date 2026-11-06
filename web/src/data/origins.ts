// SPDX-License-Identifier: AGPL-3.0-only
// Where a scan's labels came from (UX round 2, 2026-11-06). A person saw a
// spine label on an axial brain scan that their own campaign answer had
// decided was neck: the sort had not run since, and nothing on the page said
// where a label came from. The engine's origins door answers, for one scan or
// one visit's scans in one call, each axis's held value and where it came
// from: the rules (the pack and the rule), a model (name@version, the run,
// its probability) or a decision (who, when, the campaign item), beside the
// decision in force where the sort has not applied it yet. The viewer reads
// it once per visit and frames a label by its origin; a label whose decision
// was not sorted yet says so, and offers the re-sort to who may run a sort.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { whenWords } from "./sources";
import { valueWord } from "./tree";

export const ORIGINS_DOOR = "GET /api/origins";
export const RESORT_DOOR = "POST /api/origins/resort";

export type Origin = "rules" | "model" | "decision" | "none";
/** current; unsorted (a decision in force the sort has not applied); withdrawn (a decision held since withdrawn); withheld (a campaign not closed). */
export type OriginState = "current" | "unsorted" | "withdrawn" | "withheld";

export interface RuleRow {
  rule_set: string;
  rule: string;
  source?: string;
  value?: string;
  tier?: string;
  basis?: string;
  confidence?: number;
  pass?: string | null;
  /** The words the rule read; at detail quasi only. */
  matched?: string | null;
}

export interface ModelRef {
  id?: number;
  name?: string;
  version?: string;
  label?: string | null;
  p?: number | null;
  run?: number | null;
}

/** The decision in force on an axis. */
export interface Decided {
  id?: number;
  kind?: string;
  scope?: string;
  at?: string | null;
  value?: string;
  values?: string[];
  by?: string;
  committed_by?: string | null;
  model?: ModelRef | null;
  campaign?: { id: number; name?: string; status?: string; item?: number; position?: number } | null;
  review_item?: { id: number; kind: string } | null;
  /** A campaign not closed decided it, and its answers are blind to this person until it closes. */
  withheld?: boolean;
}

export interface AxisOrigin {
  axis: string;
  /** What the sort holds; empty for nothing. */
  values: string[];
  confidence: number;
  tier: string;
  origin: Origin;
  /** The engine's own line, as `nils origins` prints it. */
  line: string;
  state: OriginState;
  words: string | null;
  rules: RuleRow[];
  /** Who wrote the held value, where a decision or a model did. */
  from?: { kind?: string; by?: string; version?: string | null; model?: ModelRef | null; campaign?: number | null; scope?: string } | null;
  decided: Decided | null;
}

export interface Sorted {
  pack: string;
  version: string;
  overlay: string | null;
  job: number | null;
  at: string | null;
}

export interface StackOrigins {
  stack: number;
  sorted: Sorted | null;
  unsorted: boolean;
  axes: AxisOrigin[];
}

export interface Origins {
  count: number;
  unsorted: number;
  stacks: StackOrigins[];
  withheld?: { stacks: number; why: string } | null;
}

export interface Resorted {
  resort: { state: string; stacks: number; sorted: number; jobs: number[]; words: string };
  origins: Origins;
}

/** One scan, a session the cache holds, or the studies of a visit it does not hold. */
export type Target = { stack: number } | { session: number } | { studies: number[] };

/** The visit a grid's key names (s34, or t5.6 for its studies). */
export function targetOfVisit(key: string): Target | null {
  if (/^s\d+$/.test(key)) return { session: Number(key.slice(1)) };
  if (/^t\d+(\.\d+)*$/.test(key)) return { studies: key.slice(1).split(".").map(Number) };
  return null;
}

/** The visit a scan belongs to, read whole so moving between its scans asks nothing more; the scan alone where neither is known. */
export function targetOfScan(s: { id: number; session: number | null; study?: number | null }): Target {
  if (s.session !== null) return { session: s.session };
  if (typeof s.study === "number") return { studies: [s.study] };
  return { stack: s.id };
}

/** A target's key, as the cache and the grid's visit keys spell it. */
export function targetKey(t: Target): string {
  if ("stack" in t) return `k${t.stack}`;
  if ("session" in t) return `s${t.session}`;
  return `t${t.studies.join(".")}`;
}

function queryOf(t: Target): string {
  if ("stack" in t) return `stack=${t.stack}`;
  if ("session" in t) return `session=${t.session}`;
  return `studies=${t.studies.join(",")}`;
}

/** Whether this person may read the origins here: the door served, and data or review reading. */
export function mayReadOrigins(caps: Capabilities): boolean {
  return served(caps, ORIGINS_DOOR) && (may(caps, "data:see") || may(caps, "review:see"));
}

/** Whether this person may sort a scan again: the door served, and pipelines work (a sort's grant). */
export function mayResort(caps: Capabilities): boolean {
  return served(caps, RESORT_DOOR) && may(caps, "pipelines:work");
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The door's answer, read leniently: an axis with no name is dropped, missing lists are empty. */
export function originsOf(a: unknown): Origins {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const stacks = (Array.isArray(o.stacks) ? o.stacks : []).flatMap((s): StackOrigins[] => {
    const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    if (typeof r.stack !== "number") return [];
    const axes = (Array.isArray(r.axes) ? r.axes : []).flatMap((x): AxisOrigin[] => {
      const ax = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      if (typeof ax.axis !== "string") return [];
      return [
        {
          axis: ax.axis,
          values: strs(ax.values),
          confidence: typeof ax.confidence === "number" ? ax.confidence : 0,
          tier: typeof ax.tier === "string" ? ax.tier : "",
          origin: (["rules", "model", "decision", "none"] as const).find((k) => k === ax.origin) ?? "rules",
          line: typeof ax.line === "string" ? ax.line : "",
          state: (["current", "unsorted", "withdrawn", "withheld"] as const).find((k) => k === ax.state) ?? "current",
          words: typeof ax.words === "string" ? ax.words : null,
          rules: Array.isArray(ax.rules) ? (ax.rules as RuleRow[]) : [],
          from: ax.from && typeof ax.from === "object" ? (ax.from as AxisOrigin["from"]) : null,
          decided: ax.decided && typeof ax.decided === "object" ? (ax.decided as Decided) : null,
        },
      ];
    });
    return [{ stack: r.stack, sorted: r.sorted && typeof r.sorted === "object" ? (r.sorted as Sorted) : null, unsorted: r.unsorted === true, axes }];
  });
  return {
    count: typeof o.count === "number" ? o.count : stacks.length,
    unsorted: typeof o.unsorted === "number" ? o.unsorted : stacks.filter((s) => s.unsorted).length,
    stacks,
    withheld: o.withheld && typeof o.withheld === "object" ? (o.withheld as Origins["withheld"]) : null,
  };
}

export const originDoors = {
  read: (t: Target): Promise<Origins> => door<unknown>("GET", `/api/origins?${queryOf(t)}`).then(originsOf),
  resort: (t: Target): Promise<Resorted> =>
    door<{ resort: Resorted["resort"]; origins: unknown }>("POST", "/api/origins/resort", t).then((r) => ({ resort: r.resort, origins: originsOf(r.origins) })),
};

// ------------------------------------------------------------ one read per visit, kept

const held = new Map<string, Origins>();
const asked = new Map<string, Promise<Origins>>();

/** A visit's origins: kept once read, asked once while in flight. */
export function originsFor(t: Target): Promise<Origins> {
  const key = targetKey(t);
  const have = held.get(key);
  if (have) return Promise.resolve(have);
  const flying = asked.get(key);
  if (flying) return flying;
  const p = originDoors.read(t).then(
    (o) => {
      held.set(key, o);
      asked.delete(key);
      return o;
    },
    (e: unknown) => {
      asked.delete(key);
      throw e;
    },
  );
  asked.set(key, p);
  return p;
}

/** What is kept of a target, or null. */
export function heldOrigins(t: Target): Origins | null {
  return held.get(targetKey(t)) ?? null;
}

/** Keep a target's origins as a re-sort answered them; and the visit's, where the re-sort was of one scan of it. */
export function keepOrigins(t: Target, o: Origins): void {
  held.set(targetKey(t), o);
}

/** Forget every kept read: a sort changed what they say. */
export function forgetOrigins(): void {
  held.clear();
  asked.clear();
}

/** Per stack, per axis. */
export function byStack(o: Origins | null): Map<number, Map<string, AxisOrigin>> {
  const out = new Map<number, Map<string, AxisOrigin>>();
  for (const s of o?.stacks ?? []) out.set(s.stack, new Map(s.axes.map((a) => [a.axis, a])));
  return out;
}

/** A stack's sort, for its rules' line. */
export function sortedOf(o: Origins | null, stack: number): Sorted | null {
  return o?.stacks.find((s) => s.stack === stack)?.sorted ?? null;
}

// ------------------------------------------------------------ in words

/** The frame a label takes: none for the rules, the brand's for a decision, a value colour for a model, caution where the sort has not applied a decision. */
export type Tone = "rules" | "decision" | "model" | "stale" | "withheld";

export function originTone(a: AxisOrigin): Tone {
  if (a.state === "unsorted" || a.state === "withdrawn") return "stale";
  if (a.state === "withheld") return "withheld";
  if (a.origin === "decision") return "decision";
  if (a.origin === "model") return "model";
  return "rules";
}

/** A value as the facts say it: their words, else the value with commas as spaces. */
function said(axis: string, values: string[]): string {
  if (values.length === 0) return "nothing";
  return values.map((v) => valueWord(axis, v) || v).join(" ");
}

/** On the label, after its value, where a decision was not sorted yet: "decided neck"; null otherwise. */
export function staleTail(a: AxisOrigin): string | null {
  if (a.state === "unsorted") return `decided ${said(a.axis, a.decided?.values ?? strs(a.decided?.value?.split(",")))}`;
  if (a.state === "withdrawn") return "withdrawn";
  return null;
}

/** The stale line in full: "Decided neck; sorted before the decision". */
export function staleLine(a: AxisOrigin): string | null {
  if (a.state === "unsorted") return `Decided ${said(a.axis, a.decided?.values ?? [])}; sorted before the decision`;
  if (a.state === "withdrawn") return "Its decision was withdrawn; sorted before that";
  return null;
}

const pct = (p: number) => (p >= 0.995 ? "p 1.00" : `p ${p.toFixed(2)}`);

/** Where the held value came from, in one line: "Rules mri@1.4.0 · body_part/spine_words", "Model bodypart@2.1 · run 17 · p 0.97", "Decided by anna@lab". */
export function fromLine(a: AxisOrigin, sorted: Sorted | null): string {
  if (a.origin === "model") {
    const m = a.decided?.kind === "model" && a.state === "current" ? a.decided.model : a.from?.model;
    const label = m?.label || (m?.name ? `${m.name}@${m.version ?? ""}` : (a.from?.version ?? "a model"));
    return ["Model " + label, typeof m?.run === "number" ? `run ${m.run}` : "", typeof m?.p === "number" ? pct(m.p) : ""].filter(Boolean).join(" · ");
  }
  if (a.origin === "decision") {
    const kind = a.from?.kind === "agent" ? "an agent" : null;
    const at = a.state === "current" && a.decided?.at ? ` · ${whenWords(a.decided.at)}` : "";
    return `Decided by ${a.from?.by ?? kind ?? "a person"}${at}`;
  }
  if (a.origin === "none") return "Nothing answered it";
  const r = a.rules[0];
  const rule = r ? [r.rule_set, r.rule].filter(Boolean).join("/") : "";
  return ["Rules" + (sorted ? ` ${sorted.pack}@${sorted.version}` : ""), rule].filter(Boolean).join(" · ");
}

/**
 * What the from line leaves out of the decision in force, in one line: who and when, under a decision not sorted yet ("By
 * anna@lab · 5 Nov"); who put a model's answer in force; or, where the rules' value agrees with a decision, the decision.
 */
export function decidedLine(a: AxisOrigin): string | null {
  const d = a.decided;
  if (!d) return null;
  if (d.withheld) return "A campaign not closed yet decided it; its answers show once it closes";
  const who = d.kind === "model" ? (d.model?.label ?? "a model") : (d.by ?? "a person");
  const committed = d.committed_by && d.committed_by !== d.by ? `, committed by ${d.committed_by}` : "";
  const when = d.at ? ` · ${whenWords(d.at)}` : "";
  if (a.state === "unsorted") return `By ${who}${committed}${when}`;
  if (a.origin === "model") return d.committed_by && d.committed_by !== d.by ? `Committed by ${d.committed_by}${when}` : null;
  if (a.origin === "decision") return null;
  return `Decided ${said(a.axis, d.values ?? [])} by ${who}${committed}${when}`;
}

/** A link to what made the decision: its campaign's page, named with its item. */
export function decisionLink(a: AxisOrigin): { href: string; label: string } | null {
  const c = a.decided?.campaign;
  if (!c || a.decided?.withheld) return null;
  const item = typeof c.item === "number" ? `, item ${c.item}` : "";
  return { href: href("review", "campaigns", String(c.id)), label: `Campaign ${c.name || c.id}${item}` };
}

/** A link to the model's run, where the decision names one. */
export function runLink(a: AxisOrigin): { href: string; label: string } | null {
  const run = a.decided?.model?.run;
  return typeof run === "number" ? { href: href("pipelines", "runs", String(run)), label: `Run ${run}` } : null;
}

/** When the sort that wrote the label ran: "sorted 1 Nov". */
export function sortedWords(sorted: Sorted | null): string | null {
  return sorted?.at ? `sorted ${whenWords(sorted.at)}` : null;
}

const AXIS_WORD: Record<string, string> = {
  base: "weighting",
  technique: "sequence",
  modifier: "modifiers",
  construct: "image",
  body_part: "body part",
  post_contrast: "contrast agent",
  provenance: "made by",
  disposition: "kind",
};

/** A scan's labels and where each came from, for a card's hover: one line an axis the facts show. */
export function originTitle(axes: Map<string, AxisOrigin> | undefined, sorted: Sorted | null): string {
  if (!axes) return "";
  const lines: string[] = [];
  for (const [axis, word] of Object.entries(AXIS_WORD)) {
    const a = axes.get(axis);
    if (!a || (a.values.length === 0 && a.state === "current")) continue;
    const stale = staleLine(a);
    lines.push(`${word} ${said(axis, a.values)}: ${fromLine(a, sorted)}${stale ? ` · ${stale}` : ""}`);
  }
  return lines.join("\n");
}

/** The axes of a scan the sort has not applied a decision to. */
export function staleAxes(axes: Map<string, AxisOrigin> | undefined): AxisOrigin[] {
  return [...(axes?.values() ?? [])].filter((a) => a.state === "unsorted" || a.state === "withdrawn");
}

/** An axis in the facts' word, capitalised: "Body part". */
export function axisWord(axis: string): string {
  const w = AXIS_WORD[axis] ?? axis.replaceAll("_", " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** A stack's axes as the scans door gives them (values joined by commas), from what the origins say it holds now; null where they do not name it. */
export function heldAxes(o: Origins | null, stack: number): Record<string, string> | null {
  const s = o?.stacks.find((x) => x.stack === stack);
  if (!s) return null;
  const out: Record<string, string> = {};
  for (const a of s.axes) if (a.values.length > 0) out[a.axis] = a.values.join(",");
  return out;
}
