// SPDX-License-Identifier: AGPL-3.0-only
// Review's model family (record 45 S7): a pipeline run's proposals as
// `<axis>:model` groups, one per axis, model, value and confidence band, the
// ones at or above the model's threshold staged as the model's decision for
// a person to commit. The change matrix counts stacks from the value they
// hold now to the value the model proposes; commit by filter puts in force
// the staged part one model, axis, from and to name, and nothing else.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import type { ReviewItem } from "../ops/client";
import { membersOf } from "./client";
import { kindOf } from "./triage";

/** Where the evidence does not say what the stacks hold now. */
export const NOW_UNKNOWN = "as sorted now";

/** Where the stacks hold no value on the axis now. */
export const NO_VALUE = "no value";

export interface ModelGroup {
  item: ReviewItem;
  axis: string;
  /** The value the model proposes. */
  to: string;
  /** The values the stacks hold now, counted, where the evidence says; null where it does not. */
  from: Record<string, number> | null;
  /** `below`, or `p>=<edge>`. */
  band: string;
  confidence: number | null;
  mean: number | null;
  threshold: number | null;
  /** The model as the evidence names it: name@version, or its id or digest. */
  model: string;
  run: number | null;
  members: number;
  staged: boolean;
  /** The staged decision, for a commit or a withdrawal of this group alone. */
  decision: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : null);

/** Whether a kind is a model's proposal. */
export function isModelKind(kind: string): boolean {
  const k = kindOf(kind);
  return k.classifier && k.what === "model";
}

/** The model named by the evidence, whatever shape it came in. */
function modelName(v: unknown): string {
  if (v && typeof v === "object") {
    const m = v as Json;
    const nv = text(m.name) && text(m.version) ? `${m.name as string}@${m.version as string}` : null;
    return nv ?? text(m.digest) ?? text(m.id) ?? "a model";
  }
  return text(v) ?? "a model";
}

/** The values the stacks hold now: a map of counts, a single value for every member, or nothing. */
function fromOf(v: unknown, members: number): Record<string, number> | null {
  if (typeof v === "string" && v !== "") return { [v]: members };
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, number> = {};
    for (const [k, c] of Object.entries(v as Json)) if (typeof c === "number" && c > 0) out[k === "" || k === "null" ? NO_VALUE : k] = c;
    return Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

/** An `<axis>:model` item as a group, or null for any other kind. */
export function modelGroupOf(item: ReviewItem): ModelGroup | null {
  if (!isModelKind(item.kind)) return null;
  const ev = (item.evidence ?? {}) as Json;
  const d = (item.decision ?? null) as Json | null;
  const members = num(ev.members) ?? membersOf(item);
  return {
    item,
    axis: text(ev.axis) ?? kindOf(item.kind).area,
    to: text(ev.value) ?? "",
    from: fromOf(ev.from, members),
    band: text(ev.tier) ?? "",
    confidence: num(ev.confidence),
    mean: num(ev.mean_confidence),
    threshold: num(ev.threshold),
    model: modelName(ev.model),
    run: num(ev.run_id),
    members,
    staged: item.status === "staged",
    decision: d ? num(d.decision) ?? num(d.id) : null,
  };
}

/** The groups among the items, still waiting: open ones, and staged ones nobody committed. */
export function modelGroups(items: ReviewItem[]): ModelGroup[] {
  return items
    .filter((i) => i.status === "open" || i.status === "staged")
    .map(modelGroupOf)
    .filter((g): g is ModelGroup => g !== null);
}

export interface Cell {
  stacks: number;
  staged: number;
  groups: ModelGroup[];
}

export interface Matrix {
  axis: string;
  froms: string[];
  tos: string[];
  cells: Record<string, Record<string, Cell>>;
  total: number;
}

/** One axis's change matrix: stacks by the value they hold now and the value proposed. A group whose members hold several values now is split by its counts. */
export function changeMatrix(groups: ModelGroup[], axis: string): Matrix {
  const cells: Record<string, Record<string, Cell>> = {};
  let total = 0;
  for (const g of groups.filter((x) => x.axis === axis)) {
    const from = g.from ?? { [NOW_UNKNOWN]: g.members };
    for (const [f, count] of Object.entries(from)) {
      const row = (cells[f] ??= {});
      const cell = (row[g.to] ??= { stacks: 0, staged: 0, groups: [] });
      cell.stacks += count;
      if (g.staged) cell.staged += count;
      if (!cell.groups.includes(g)) cell.groups.push(g);
      total += count;
    }
  }
  const sum = (m: Record<string, Cell>) => Object.values(m).reduce((s, c) => s + c.stacks, 0);
  const froms = Object.keys(cells).sort((a, b) => sum(cells[b]) - sum(cells[a]) || a.localeCompare(b));
  const toTotals = new Map<string, number>();
  for (const row of Object.values(cells)) for (const [t, c] of Object.entries(row)) toTotals.set(t, (toTotals.get(t) ?? 0) + c.stacks);
  const tos = [...toTotals.keys()].sort((a, b) => (toTotals.get(b) ?? 0) - (toTotals.get(a) ?? 0) || a.localeCompare(b));
  return { axis, froms, tos, cells, total };
}

/** The axes the groups propose on, most stacks first. */
export function axesOf(groups: ModelGroup[]): string[] {
  const by = new Map<string, number>();
  for (const g of groups) by.set(g.axis, (by.get(g.axis) ?? 0) + g.members);
  return [...by.keys()].sort((a, b) => (by.get(b) ?? 0) - (by.get(a) ?? 0) || a.localeCompare(b));
}

/** What commit by filter names: one model, one axis, the value proposed and, where known, the value held now. */
export interface CommitFilter {
  model: string;
  axis: string;
  to: string;
  /** The value held now; null for no value; absent where the evidence does not say, and the commit is then by model and to. */
  from?: string | null;
}

/**
 * The body of `POST /api/decisions/commit` for a filter. Never a confidence alone: an engine that does not know the model filter commits by what it knows, so the body names only what narrows (an engine without it refuses with no filter named).
 * The door reads an empty text as no value and null as not asked (record 45 E3), so no value is sent as "" and a from not known is left out.
 */
export function commitBody(f: CommitFilter, anyway = false): Json {
  return { model: f.model, axis: f.axis, to: f.to, ...(f.from !== undefined ? { from: f.from ?? "" } : {}), ...(anyway ? { anyway: true } : {}) };
}

/** What a commit by the filter would put in force, counted from the groups the page read: the staged part only. */
export function commitPlan(groups: ModelGroup[], f: CommitFilter): { groups: number; stacks: number; open: number } {
  let staged = 0;
  let stacks = 0;
  let open = 0;
  for (const g of groups) {
    if (g.model !== f.model || g.axis !== f.axis || g.to !== f.to) continue;
    // where the evidence does not say what the stacks hold now, the whole group may be in the part: an upper bound
    const count = f.from === undefined || g.from === null ? g.members : (g.from[f.from ?? NO_VALUE] ?? 0);
    if (count === 0) continue;
    if (g.staged) {
      staged += 1;
      stacks += count;
    } else open += count;
  }
  return { groups: staged, stacks, open };
}

/** The models a cell's staged groups name, each once. */
export function modelsIn(cell: Cell): string[] {
  return [...new Set(cell.groups.filter((g) => g.staged).map((g) => g.model))];
}

/** What a person may do in the family, by grant and door. */
export function modelActs(caps: Capabilities): { commit: boolean; byFilter: boolean; withdraw: boolean } {
  const work = may(caps, "review:work");
  return {
    commit: work && served(caps, "POST /api/decisions/{id}/commit"),
    byFilter: work && served(caps, "POST /api/decisions/commit"),
    withdraw: work && served(caps, "POST /api/decisions/{id}/withdraw"),
  };
}

/** What a commit by filter answered: the decisions put in force, by id, the items they closed, those left staged, and (record 45 E3) the group decisions the filter split. */
export interface CommittedPart {
  committed: number[];
  items: number;
  left: number;
  split?: number[];
}

export const decisions = {
  commitWhere: (body: Json) => door<CommittedPart>("POST", "/api/decisions/commit", body),
};

/** A commit by filter's answer in words. */
export function committedWords(r: CommittedPart): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const c = Array.isArray(r.committed) ? r.committed.length : Number(r.committed) || 0;
  const split = r.split?.length ?? 0;
  return `Committed ${n(c)} ${c === 1 ? "decision" : "decisions"} on ${n(r.items)} ${r.items === 1 ? "item" : "items"}; ${n(r.left)} left staged${split > 0 ? `; ${n(split)} ${split === 1 ? "group was" : "groups were"} split, the rest of each left staged` : ""}.`;
}

/** A matrix row as a commit filter's from: not named where the evidence does not say, null for no value. */
export function fromOfRow(row: string): string | null | undefined {
  if (row === NOW_UNKNOWN) return undefined;
  return row === NO_VALUE ? null : row;
}

// ------------------------------------------------ per model and axis
// UX round 1 (2026-11-05): a model's proposals on one axis as two acts,
// commit the ones at or above its threshold and make the rest a campaign
// for oneself, read from the engine's counts rather than a page of groups.

/** A count of review groups and the scans they hold. */
export interface Part {
  groups: number;
  stacks: number;
}

/** One model's proposals on one axis that still wait, as `GET /api/review/proposals` counts them. */
export interface Standing {
  model: { id: number; name: string; version: string };
  /** name@version. */
  label: string;
  axis: string;
  /** The lowest threshold its runs staged at. */
  threshold: number | null;
  /** At or above the threshold, staged. */
  staged: Part;
  /** Of those, on scans an open campaign asks: a commit leaves them staged. */
  held: Part;
  /** What a commit by the model and the axis puts in force. */
  commit: Part;
  /** Staged decisions staged before the registry moved on. */
  drifted: number;
  /** Below the threshold, asked by no campaign: what a campaign of the rest asks. */
  below: Part;
  /** Below the threshold and asked by an open campaign already. */
  asked: Part;
  campaigns: { id: number; name: string }[];
  /** A free campaign name for a campaign of the rest. */
  name: string;
}

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): number => num(v) ?? 0;
const partOf = (v: unknown): Part => (isObj(v) ? { groups: count(v.groups), stacks: count(v.stacks) } : { groups: 0, stacks: 0 });

/** One row of the door, read evenly: a field an engine does not send reads as nothing. */
export function standingOf(v: unknown): Standing | null {
  if (!isObj(v) || !isObj(v.model) || typeof v.axis !== "string") return null;
  const id = num(v.model.id);
  if (id === null) return null;
  const name = text(v.model.name) ?? String(id);
  const version = text(v.model.version) ?? "";
  const staged = partOf(v.staged);
  const held = partOf(v.held);
  return {
    model: { id, name, version },
    label: text(v.label) ?? (version ? `${name}@${version}` : name),
    axis: v.axis,
    threshold: num(v.threshold),
    staged,
    held,
    commit: isObj(v.commit) ? partOf(v.commit) : { groups: staged.groups - held.groups, stacks: staged.stacks - held.stacks },
    drifted: count(v.drifted),
    below: partOf(v.below),
    asked: partOf(v.asked),
    campaigns: Array.isArray(v.campaigns) ? v.campaigns.filter(isObj).map((c) => ({ id: count(c.id), name: text(c.name) ?? "" })) : [],
    name: text(v.name) ?? `${name}-${v.axis}-unsure`,
  };
}

export const STANDING_DOORS = {
  list: "GET /api/review/proposals",
  commit: "POST /api/decisions/commit",
  campaign: "POST /api/review/proposals/campaign",
} as const;

/** What a person may do with a model's proposals per model and axis, by grant and door; `reads` false keeps the page of groups alone. */
export function standingActs(caps: Capabilities): { reads: boolean; commit: boolean; campaign: boolean } {
  const work = may(caps, "review:work");
  return {
    reads: may(caps, "review:see") && served(caps, STANDING_DOORS.list),
    commit: work && served(caps, STANDING_DOORS.commit),
    campaign: work && may(caps, "campaigns:work") && served(caps, STANDING_DOORS.campaign),
  };
}

/** The commit's body: the model and the axis, nothing narrower, so every staged answer at or above its threshold goes; anyway where some were staged before the registry moved on, which the confirm says. */
export function commitStandingBody(s: Standing): Json {
  return { model: String(s.model.id), axis: s.axis, ...(s.drifted > 0 ? { anyway: true } : {}) };
}

/** What a commit answered, with the re-sort's words. */
export interface CommitAnswer extends CommittedPart {
  resort?: { state?: string; words?: string } | null;
}

/** What a campaign of the rest answered. */
export interface RestAnswer {
  campaign: { id: number; name: string };
  adopted: number;
  suggestions: { suggestions: number };
}

export const standingDoors = {
  list: () => door<Json>("GET", "/api/review/proposals").then((r) => (Array.isArray(r.proposals) ? r.proposals.map(standingOf).filter((s): s is Standing => s !== null) : [])),
  commit: (s: Standing) => door<CommitAnswer>("POST", "/api/decisions/commit", commitStandingBody(s)),
  campaign: (s: Standing, name: string) => door<RestAnswer>("POST", "/api/review/proposals/campaign", { model: String(s.model.id), axis: s.axis, ...(name.trim() ? { name: name.trim() } : {}) }),
};

const nf = (v: number) => v.toLocaleString("en-US");

/** The threshold as a person reads it. */
export function thresholdWords(t: number | null): string {
  return t === null ? "no threshold" : `threshold ${t.toFixed(2)}`;
}

/** The commit's button. */
export function commitWords(s: Standing): string {
  return `Commit the ${nf(s.commit.stacks)} at or above the threshold`;
}

/** The campaign's button. */
export function campaignWords(s: Standing): string {
  return `Make a campaign of the other ${nf(s.below.stacks)} for me`;
}

/** What a commit did, said after it. */
export function committedStandingWords(s: Standing, r: CommitAnswer): string {
  const resort = r.resort?.words ? ` ${r.resort.words.charAt(0).toUpperCase()}${r.resort.words.slice(1)}.` : "";
  return `Committed ${nf(s.commit.stacks)} ${s.axis} answers of ${s.label}.${resort}`;
}
