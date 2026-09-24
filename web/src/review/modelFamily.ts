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

/** Where the change matrix has no value the stacks hold now. */
export const NOW_UNKNOWN = "as sorted now";

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
    for (const [k, c] of Object.entries(v as Json)) if (typeof c === "number" && c > 0) out[k === "" || k === "null" ? "no value" : k] = c;
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
  /** Null where the evidence does not say what the stacks hold now: the commit is then by model and to. */
  from: string | null;
}

/** The body of `POST /api/decisions/commit` for a filter. Never a confidence alone: an engine that does not know the model filter commits by what it knows, so the body names only what narrows (an engine without it refuses with no filter named). */
export function commitBody(f: CommitFilter, anyway = false): Json {
  return { model: f.model, axis: f.axis, to: f.to, ...(f.from !== null ? { from: f.from } : {}), ...(anyway ? { anyway: true } : {}) };
}

/** What a commit by the filter would put in force, counted from the groups the page read: the staged part only. */
export function commitPlan(groups: ModelGroup[], f: CommitFilter): { groups: number; stacks: number; open: number } {
  let staged = 0;
  let stacks = 0;
  let open = 0;
  for (const g of groups) {
    if (g.model !== f.model || g.axis !== f.axis || g.to !== f.to) continue;
    // where the evidence does not say what the stacks hold now, the whole group may be in the part: an upper bound
    const count = f.from === null || g.from === null ? g.members : (g.from[f.from] ?? 0);
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

export const decisions = {
  commitWhere: (body: Json) => door<{ committed: number; items: number; left: number }>("POST", "/api/decisions/commit", body),
};
