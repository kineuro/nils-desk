// SPDX-License-Identifier: AGPL-3.0-only
// The pack's quality (record 56, sections 2 and 6.4): what the pack cannot
// rank (equal-rank disagreements, a defect of the pack and never a person's
// question), which of its rules lose to which and how often (the overrides
// kept as evidence of why), and, once System 1 is served, where it disagrees
// with the rules. Each row offers the typed change that would mend it,
// filled in, so a person goes from the defect to its effect in one press.

import type { Json } from "../ask/client";
import { emptyForm, type OpForm, type ScopeChoice } from "./ruleOps";

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One rule's side of a pair: the set, the rule, the value it writes. */
export interface Side {
  rule_set: string;
  rule: string;
  value: string;
  tier: string;
  confidence: number | null;
}

/** Two answers on one axis that nothing in the pack ranks (GET /api/packs/{name}/disagreements). */
export interface Tie {
  pair: string;
  axis: string;
  /** one_rule, collected or priority_tie. */
  why: string[];
  sides: Side[];
  stacks: number;
  examples: number[];
  versions: string[];
}

/** One rule winning over another by the pack's ranking, as the overrides kept as evidence say. */
export interface Override {
  pair: string;
  axis: string;
  winner: Side;
  loser: Side;
  /** What ranked the winner above: rule_set_order, rule_order, priority or answer; more than one where stacks differ. */
  rank: string[];
  stacks: number;
  examples: number[];
  datasets: Record<string, number>;
}

/** Where System 1 disagrees with the rules, once a model of it serves. */
export interface System1 {
  served: boolean;
  model: string | null;
  why: string | null;
  rows: { axis: string; rules: string; system1: string; stacks: number; examples: number[] }[];
}

/** The pack's quality report: its ties, its overrides by rule pair, and System 1's disagreements. */
export interface Quality {
  stacks: number;
  ties: { stacks: number; ties: Tie[] };
  overrides: { stacks: number; overrides: Override[] };
  system1: System1;
}

function side(v: unknown): Side {
  const o = isObj(v) ? v : {};
  return { rule_set: str(o.rule_set), rule: str(o.rule), value: str(o.value), tier: str(o.tier), confidence: typeof o.confidence === "number" ? o.confidence : null };
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "number" ? [x] : isObj(x) && typeof x.stack === "number" ? [x.stack] : [])) : []);

/** The disagreements door's answer, made even. */
export function tiesOf(raw: unknown): { stacks: number; ties: Tie[] } {
  const r = isObj(raw) ? raw : {};
  const pairs = Array.isArray(r.pairs) ? r.pairs.filter(isObj) : [];
  return {
    stacks: num(r.stacks),
    ties: pairs.map((p) => ({
      pair: str(p.pair),
      axis: str(p.axis),
      why: Array.isArray(p.why) ? p.why.map(String) : [],
      sides: Array.isArray(p.sides) ? p.sides.map(side) : [],
      stacks: num(p.stacks),
      examples: ids(p.examples),
      versions: Array.isArray(p.versions) ? p.versions.map(String) : [],
    })),
  };
}

/** The overrides by rule pair, made even, from the rows an engine answers them in. */
export function overridesOf(raw: unknown): Override[] {
  const rows = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.pairs) ? raw.pairs : isObj(raw) && Array.isArray(raw.overrides) ? raw.overrides : [];
  return rows.filter(isObj).map((p) => {
    const by = side(p.winner ?? p.by);
    const over = side(p.over ?? p.loser);
    return {
      pair: str(p.pair) || `${str(p.axis)}: ${by.rule_set}/${by.rule}=${by.value} over ${over.rule_set}/${over.rule}=${over.value}`,
      axis: str(p.axis),
      winner: { ...by, value: by.value || str(p.value) },
      loser: { ...over, value: over.value || str(p.other) },
      rank: Array.isArray(p.rank) ? p.rank.map(String) : str(p.rank) ? [str(p.rank)] : [],
      stacks: num(p.stacks),
      examples: ids(p.examples),
      datasets: isObj(p.datasets) ? Object.fromEntries(Object.entries(p.datasets).map(([k, v]) => [k, num(v)])) : {},
    };
  });
}

/** The quality door's answer, made even (GET /api/packs/{name}/quality). */
export function qualityOf(raw: unknown): Quality {
  const r = isObj(raw) ? raw : {};
  const o = isObj(r.overrides) ? r.overrides : {};
  const s = isObj(r.system1) ? r.system1 : {};
  return {
    stacks: num(r.stacks),
    ties: tiesOf(r.disagreements),
    overrides: { stacks: num(o.stacks), overrides: overridesOf(o.pairs) },
    system1: {
      served: s.served === true,
      model: typeof s.model === "string" ? s.model : null,
      why: typeof s.why === "string" && s.why !== "" ? s.why : null,
      rows: (Array.isArray(s.disagreements) ? s.disagreements.filter(isObj) : []).map((d) => ({ axis: str(d.axis), rules: str(d.rules), system1: str(d.system1), stacks: num(d.stacks), examples: ids(d.examples) })),
    },
  };
}

/** Why a tie is one, in words. */
export function tieWhy(t: Pick<Tie, "why">): string {
  const words: Record<string, string> = {
    one_rule: "one rule writes both",
    collected: "a set collects both",
    priority_tie: "the same priority",
  };
  return t.why.map((w) => words[w] ?? w.replace(/_/gu, " ")).join(", ");
}

/** What ranked one rule above the other, in words. */
export function rankWords(rank: string | string[]): string {
  const words: Record<string, string> = {
    rule_set_order: "its rule set runs first",
    rule_order: "it comes first in its set",
    priority: "its value's priority is lower",
    answer: "a person's answer",
  };
  return (Array.isArray(rank) ? rank : [rank]).map((r) => words[r] ?? r.replace(/_/gu, " ")).join(", ");
}

/** A rule as the contract names it: set/rule. */
const ruleOf = (s: Side) => (s.rule_set ? `${s.rule_set}/${s.rule}` : s.rule);

/** A change filled in, from a page that knows what it mends: its form, its scope, its why and where it came from. */
export interface Draft {
  form: OpForm;
  scope: ScopeChoice;
  reason: string;
  evidence: unknown;
}

const pack: ScopeChoice = { kind: "pack", value: "" };

/**
 * The change that would rank a tie, filled in: a priority where two values
 * share one, else a rule placed before the rule that writes both, which the
 * person narrows; the pack is one for everyone, so its scope is the pack.
 */
export function draftOfTie(t: Tie): Draft {
  const [a, b] = t.sides;
  const evidence = { equal_rank: t.pair };
  if (t.why.includes("priority_tie") && a) {
    const form = emptyForm("set_priority");
    form.values.axis = t.axis;
    form.values.value = a.value;
    return { form, scope: pack, reason: `${a.value} over ${b?.value ?? "the other"} on ${t.axis}: the pack ranks neither`, evidence };
  }
  if (t.why.includes("collected") && a && b) {
    const form = emptyForm("move_rule");
    form.values.rule = ruleOf(a);
    form.place = { at: "before", ref: b.rule };
    return { form, scope: pack, reason: `${a.value} over ${b.value} on ${t.axis}: the pack ranks neither`, evidence };
  }
  const form = emptyForm("add_rule");
  form.values.axis = t.axis;
  form.values.value = a?.value ?? "";
  if (a?.rule_set) form.values.set = a.rule_set;
  if (a) form.place = { at: "before", ref: a.rule };
  return { form, scope: pack, reason: `${a?.value ?? ""} over ${b?.value ?? ""} on ${t.axis}: one rule writes both`.trim(), evidence };
}

/**
 * The change that would turn an override round, filled in: the losing set
 * moved before the winning one, the losing rule before the winning rule, or
 * the losing value's priority; a person's answer is no rule, and offers none.
 */
export function draftOfOverride(o: Override): Draft | null {
  const evidence = { overrides: o.pair };
  const reason = `${o.loser.value} over ${o.winner.value} on ${o.axis}`;
  const rank = o.rank[0] ?? "";
  if (rank === "rule_set_order") {
    const form = emptyForm("move_set");
    form.values.set = o.loser.rule_set;
    form.place = { at: "before", ref: o.winner.rule_set };
    return { form, scope: pack, reason, evidence };
  }
  if (rank === "rule_order") {
    const form = emptyForm("move_rule");
    form.values.rule = ruleOf(o.loser);
    form.place = { at: "before", ref: o.winner.rule };
    return { form, scope: pack, reason, evidence };
  }
  if (rank === "priority") {
    const form = emptyForm("set_priority");
    form.values.axis = o.axis;
    form.values.value = o.loser.value;
    return { form, scope: pack, reason, evidence };
  }
  return null;
}
