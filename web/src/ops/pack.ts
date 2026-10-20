// SPDX-License-Identifier: AGPL-3.0-only
// The pipeline pack as the desk reads it (record 57 P2 to P4, Wave 7b spec
// 5.5 to 5.7): at a run's start the pack's goal and switches, which knobs a
// person may set and which a rule sets or the pack fixes; at the pre-flight
// the units it judged (how many run, which need skipped how many, which were
// routed); on a run's page each unit's status in the pack's words, each
// knob's value and who chose it, its caveats, its flags and its
// comparability key; and a run's numbers per key, never pooled across keys.
// The desk judges nothing itself: every word is the engine's or the pack's.

import { DoorError, type Json } from "../ask/client";
import type { MeasureColumn } from "./runs";
import type { PackDoc, RunNumbers } from "./client";

const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** What a person asked of a run with a pack (Wave 7b spec 5.5): the goal, the pack's switches, and let_run; only what differs from the pack's defaults is sent. */
export interface PersonAsk {
  goal: string | null;
  switches: Record<string, string>;
  let_run: boolean;
}

/** The pre-flight body's part of a person's ask: nothing where they chose nothing. */
export function personBody(p: PersonAsk | null): Json {
  if (!p) return {};
  const out: Json = {};
  if (p.goal) out.goal = p.goal;
  if (Object.keys(p.switches).length > 0) out.switches = p.switches;
  if (p.let_run) out.let_run = true;
  return out;
}

/** The same as a run's command line: --goal, --switch name=value, --let-run. */
export function personFlags(p: PersonAsk | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.goal) out.push("--goal", p.goal);
  for (const [k, v] of Object.entries(p.switches)) out.push("--switch", `${k}=${v}`);
  if (p.let_run) out.push("--let-run");
  return out;
}

/** A knob as the pack says it: what it does, its default, how it breaks comparability, and who sets it (person, rule or fixed). */
export interface PackKnob {
  what: string | null;
  default: unknown;
  comparability: string | null;
  set_by: "person" | "rule" | "fixed";
}

/** The pack of a pipeline version, as a run's start and page read it. */
export interface PackView {
  goals: string[];
  switches: Record<string, string[]>;
  defaults: Record<string, string>;
  knobs: Record<string, PackKnob>;
  rules: { id: string; why: string | null; set: string[]; route: string | null; source: string | null }[];
  digest: string | null;
}

/** A value as a person reads it. */
export function valueWords(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Why the pack door holds no pack this engine can read; null where it holds one or none. */
export function packError(d: PackDoc | null): string | null {
  const p = d?.pack;
  return p && typeof p === "object" && typeof (p as { error?: unknown }).error === "string" ? (p as { error: string }).error : null;
}

/** The pack as the desk reads it, or null where the version has none (or one this engine cannot read). */
export function packView(d: PackDoc | null): PackView | null {
  if (!d || d.pack === "none" || d.pack === null || typeof d.pack !== "object" || packError(d)) return null;
  const doc = d.pack as Json;
  const g = d.goals ?? null;
  const goals = Array.isArray(g?.goal) && g.goal.length > 0 ? g.goal.map(String) : [];
  const switches: Record<string, string[]> = {};
  for (const [k, vs] of Object.entries(g?.switches ?? {})) if (Array.isArray(vs)) switches[k] = vs.map(valueWords);
  const defaults: Record<string, string> = {};
  for (const [k, v] of Object.entries(g?.defaults ?? {})) defaults[k] = valueWords(v);
  if (goals.length > 0 && !defaults.goal) defaults.goal = goals.includes("standard") ? "standard" : goals[0];
  const knobs: Record<string, PackKnob> = {};
  for (const [id, k] of Object.entries(obj(doc.knobs))) {
    const o = obj(k);
    const by = o.set_by === "rule" || o.set_by === "fixed" ? o.set_by : "person";
    knobs[id] = { what: text(o.what), default: o.default, comparability: text(o.comparability), set_by: by };
  }
  const rules = (d.rules ?? []).map((r) => ({ id: r.id, why: text(r.why), set: Object.keys(obj(r.set)), route: text(r.route), source: text(r.source) }));
  return { goals, switches, defaults, knobs, rules, digest: d.pack_digest ?? null };
}

/** The rules that may set a knob, by id. */
export function settersOf(view: PackView, knob: string): string[] {
  return view.rules.filter((r) => r.set.includes(knob)).map((r) => r.id);
}

/** Whether a person may set a knob: one the pack leaves to the person, or one it does not name. */
export function personMaySet(view: PackView | null, knob: string): boolean {
  return !view || !view.knobs[knob] || view.knobs[knob].set_by === "person";
}

/** Who sets a knob a person may not, in a few words: "set by a rule (pallidum-needs-t2-or-flair)", "fixed at 0.3". */
export function setByWords(view: PackView, knob: string): string {
  const k = view.knobs[knob];
  if (!k) return "";
  if (k.set_by === "fixed") return `fixed at ${valueWords(k.default)}`;
  const ids = settersOf(view, knob);
  return ids.length > 0 ? `set by ${ids.length === 1 ? "the rule" : "the rules"} ${ids.join(", ")}` : "set by the pack's rules";
}

/** A person's ask, of what differs from the pack's defaults. */
export function personOf(view: PackView | null, chosen: { goal: string | null; switches: Record<string, string>; let_run: boolean }): PersonAsk | null {
  if (!view) return null;
  const goal = chosen.goal && chosen.goal !== view.defaults.goal ? chosen.goal : null;
  const switches: Record<string, string> = {};
  for (const [k, v] of Object.entries(chosen.switches)) if (view.switches[k]?.includes(v) && v !== view.defaults[k]) switches[k] = v;
  return { goal, switches, let_run: chosen.let_run };
}

export type ByKind = "default" | "rule" | "person" | "fixed" | "other";

/** Who chose a knob's value, in words: the person by name, the rule with its words, the default, or fixed. */
export function byWords(c: { by: string; rule?: string | null; proposed?: string | null }, name: (principal: string) => string, view: PackView | null): { kind: ByKind; words: string; title: string | null } {
  const by = c.by ?? "";
  if (by === "default") return { kind: "default", words: "default", title: null };
  if (by === "fixed") return { kind: "fixed", words: "fixed", title: "the pack fixes it" };
  if (by.startsWith("rule:")) {
    const id = c.rule ?? by.slice(5);
    const r = view?.rules.find((x) => x.id === id) ?? null;
    return { kind: "rule", words: `rule ${id}`, title: r?.why ? `${r.why}${r.source ? ` (${r.source})` : ""}` : null };
  }
  if (by.startsWith("person:")) {
    const who = name(by);
    return { kind: "person", words: c.proposed === "assistant" ? `${who}, as the assistant proposed` : who, title: null };
  }
  return { kind: "other", words: by, title: null };
}

/** A unit's status in the pack's words, beside its state (Wave 7b spec 5.7): skipped with the need's words, routed with the reason, flagged or dropped with the check's words. */
export function packWords(u: {
  pack_status?: string | null;
  words?: string | null;
  need?: string | null;
  variant?: { variant?: string | null; pipeline?: string | null; why?: string | null } | null;
  flags?: { metric: string; value: number | null; check?: string | null; action: string; words?: string | null }[] | null;
}): { status: "skipped" | "routed" | "flagged" | "dropped" | null; words: string | null } {
  if (u.pack_status === "skipped") return { status: "skipped", words: u.words ?? u.need ?? null };
  const flags = u.flags ?? [];
  const drop = flags.filter((f) => f.action === "drop");
  if (drop.length > 0) return { status: "dropped", words: drop.map(flagWords).join("; ") };
  const flag = flags.filter((f) => f.action === "flag");
  if (flag.length > 0) return { status: "flagged", words: flag.map(flagWords).join("; ") };
  if (u.pack_status === "routed") {
    const v = u.variant ?? {};
    const to = v.pipeline ?? v.variant ?? "a variant";
    return { status: "routed", words: `to ${to}${v.why ? `: ${v.why}` : ""}` };
  }
  return { status: null, words: null };
}

/** A flag in the check's words: "flair_t1_brain_dice 0.8 (check >= 0.85): FLAIR and T1 may not be aligned". */
export function flagWords(f: { metric: string; value: number | null; check?: string | null; words?: string | null }): string {
  const v = typeof f.value === "number" ? (Number.isInteger(f.value) ? String(f.value) : f.value.toLocaleString("en-US", { maximumSignificantDigits: 4 })) : "?";
  const head = `${f.metric} ${v}${f.check ? ` (${f.check})` : ""}`;
  return f.words ? `${head}: ${f.words}` : head;
}

/** A comparability key as a person compares it: its first 12 hex digits. */
export function keyShort(key: string | null | undefined): string {
  if (!key) return "";
  return key.replace(/^sha256:/u, "").slice(0, 12);
}

/** The key's members as hover text, where the engine gives them; else the whole key. */
export function keyTitle(key: string | null | undefined, members: unknown): string | undefined {
  if (!key) return undefined;
  const m = obj(members);
  const parts = Object.entries(m).map(([k, v]) => `${k}: ${valueWords(v)}`);
  return parts.length > 0 ? parts.join("\n") : key;
}

/** The pre-flight's judgement as lines: how many run, skipped by which need, routed, let run though the registry cannot tell. */
export function judgedLines(j: { ready: number; skipped: number; routed: number; cannot_tell: number; with_caveats: number; skipped_by_why?: { why: string; units: number }[] | null; units?: { status: string; variant?: { pipeline?: string | null; variant?: string | null; why?: string | null } | null }[] | null }): { key: string; tone: "ready" | "skipped" | "routed"; count: number; words: string }[] {
  const out: { key: string; tone: "ready" | "skipped" | "routed"; count: number; words: string }[] = [];
  out.push({ key: "ready", tone: "ready", count: j.ready, words: j.with_caveats > 0 ? `run, ${j.with_caveats} with a caveat` : "run" });
  const byWhy = j.skipped_by_why ?? [];
  if (byWhy.length > 0) for (const w of byWhy) out.push({ key: `skip:${w.why}`, tone: "skipped", count: w.units, words: `skipped: ${w.why}` });
  else if (j.skipped > 0) out.push({ key: "skipped", tone: "skipped", count: j.skipped, words: "skipped" });
  if (j.routed > 0) {
    const to = new Map<string, number>();
    for (const u of j.units ?? []) if (u.status === "routed") {
      const k = `${u.variant?.pipeline ?? u.variant?.variant ?? "a variant"}${u.variant?.why ? `: ${u.variant.why}` : ""}`;
      to.set(k, (to.get(k) ?? 0) + 1);
    }
    if (to.size > 0) for (const [k, c] of to) out.push({ key: `route:${k}`, tone: "routed", count: c, words: `routed to ${k}` });
    else out.push({ key: "routed", tone: "routed", count: j.routed, words: "routed to a variant" });
  }
  return out.filter((l) => l.count > 0 || l.key === "ready");
}

/**
 * The columns a run's table asks for: only those the run made. A declared
 * column every table file lacked (`summary.numbers.tables.missing_columns`,
 * as "output: column") is left out unless the run's numbers door says a unit
 * of it measured it, and where that door answered for every unit, a numeric
 * column it does not name is left out too: an ask for a field no run ever
 * wrote is refused, which drew "The table could not be read" for a segcsvd
 * run without a FLAIR.
 */
export function madeColumns(cols: MeasureColumn[], summary: Json | null | undefined, numbers: RunNumbers | null): MeasureColumn[] {
  const tables = obj(obj(obj(summary).numbers).tables);
  const missing = new Set((Array.isArray(tables.missing_columns) ? tables.missing_columns : []).map((m) => String(m).split(":").pop()!.trim()));
  const measured = numbers ? new Set(numbers.keys.flatMap((k) => Object.keys(k.measures))) : null;
  const whole = numbers !== null && (numbers.unkeyed ?? 0) === 0 && numbers.keys.length > 0;
  return cols.filter((c) => {
    if (measured?.has(c.name)) return true;
    if (missing.has(c.name)) return false;
    if (whole && c.numeric) return false;
    return true;
  });
}

/** The pooling words of a refusal (409) that would have summed results of several comparability keys; null for any other failure. */
export function poolingOf(e: unknown): string | null {
  if (!(e instanceof DoorError) || e.status !== 409) return null;
  const words = typeof e.body.error === "string" ? e.body.error : "";
  return /comparability key/iu.test(words) ? words : null;
}
