// SPDX-License-Identifier: AGPL-3.0-only
// The gallery (record 50 R3): a page of up to a hundred items of a campaign
// that asks one axis, each small with the value suggested for it, who
// suggested it and how sure they were. A person corrects the wrong ones and
// accepts the page in one move; each item is still its own answer, by the
// person, with the suggestion kept beside it by the engine. The state here
// is pure: what each item is set to now, what changed, the order, the focus
// and what the keys do, so the grid and its tests read one shape.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import type { Question } from "./client";

/** The doors of a record 50 engine, as its OpenAPI 7 names them. */
export const R50 = {
  gallery: "GET /api/campaigns/{id}/gallery",
  accept: "POST /api/campaigns/{id}/gallery/accept",
  suggestions: "GET /api/campaigns/{id}/suggestions",
  suggest: "POST /api/campaigns/{id}/suggestions",
  thumb: "GET /api/instances/{stack}/thumb",
};

/** The items a page shows at once, and how many more are asked for so their pictures load before they are shown. */
export const PAGE = 100;
export const AHEAD = 100;

export type GalleryOrder = "uncertain" | "suggested" | "position";
export const ORDERS: { order: GalleryOrder; words: string }[] = [
  { order: "uncertain", words: "least certain first" },
  { order: "suggested", words: "grouped by suggestion" },
  { order: "position", words: "as listed" },
];

export interface GalleryItem {
  item: number;
  stack: number;
  position: number;
  /** The value suggested for the axis, or none. */
  suggested: string | null;
  /** Who suggested it: an outside author (v0-model, v0-person, a model id) or `rules`. */
  by: string | null;
  /** How sure the suggester was of that value, 0 to 1, where it said. */
  confidence: number | null;
  /** How sure it was of every class, where it said. */
  confidences: Record<string, number> | null;
  /** The other authors' suggestions. */
  others: { by: string; value: string | null; confidence: number | null }[];
  /** The suggesters said different values. */
  disagree: boolean;
  thumb: string;
}

export interface GalleryPage {
  campaign: number;
  axis: string;
  values: string[];
  order: GalleryOrder;
  open: number;
  sealed: number;
  held_back: number;
  hold_back: number;
  /** The items held back to be read alone that are still open to the caller (record 50, after the first gold campaign); none from an engine before it. */
  held_back_open: number | null;
  /** Every item read one by one here: held back and still open, and those of a sealed sample. */
  alone: number | null;
  left: number;
  items: GalleryItem[];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** The engine's page, read into one shape whatever it left out. */
export function pageOf(raw: Json): GalleryPage {
  const items = Array.isArray(raw.items) ? (raw.items as Json[]) : [];
  const order = ORDERS.some((o) => o.order === raw.order) ? (raw.order as GalleryOrder) : "uncertain";
  return {
    campaign: num(raw.campaign) ?? 0,
    axis: str(raw.axis) ?? "",
    values: Array.isArray(raw.values) ? (raw.values as unknown[]).filter((v): v is string => typeof v === "string") : [],
    order,
    open: num(raw.open) ?? 0,
    sealed: num(raw.sealed) ?? 0,
    held_back: num(raw.held_back) ?? 0,
    hold_back: num(raw.hold_back) ?? 0,
    held_back_open: num(raw.held_back_open),
    alone: num(raw.alone),
    left: num(raw.left) ?? items.length,
    items: items.flatMap((i): GalleryItem[] => {
      const item = num(i.item);
      const stack = num(i.stack);
      if (item === null || stack === null) return [];
      const conf = i.confidences && typeof i.confidences === "object" && !Array.isArray(i.confidences) ? (i.confidences as Record<string, unknown>) : null;
      const confidences = conf ? Object.fromEntries(Object.entries(conf).flatMap(([k, v]) => (num(v) === null ? [] : [[k, v as number]]))) : null;
      return [
        {
          item,
          stack,
          position: num(i.position) ?? 0,
          suggested: str(i.suggested),
          by: str(i.by),
          confidence: num(i.confidence),
          confidences: confidences && Object.keys(confidences).length > 0 ? confidences : null,
          others: Array.isArray(i.others) ? (i.others as Json[]).map((o) => ({ by: str(o.by) ?? "?", value: str(o.value), confidence: num(o.confidence) })) : [],
          disagree: i.disagree === true,
          thumb: str(i.thumb) ?? `/api/instances/${stack}/thumb`,
        },
      ];
    }),
  };
}

/** The one axis a question asks, where it asks one: a gallery is of such a question alone. */
export function singleAxis(q: Question | null | undefined): string | null {
  if (!q) return null;
  if (q.kind === "axis") return q.axis ?? null;
  if (q.kind === "axes" && Array.isArray(q.axes) && q.axes.length === 1) return q.axes[0];
  return null;
}

/** Whether the gallery is offered: the engine serves it, the question asks one axis, and the person rates. */
export function galleryOffered(caps: Capabilities, q: Question | null | undefined): boolean {
  return served(caps, R50.gallery) && served(caps, R50.accept) && singleAxis(q) !== null;
}

export interface GalleryState {
  page: GalleryPage;
  /** What each item is set to now, by item: the suggestion until the person changes it. */
  chosen: Record<number, string | null>;
  order: GalleryOrder;
  /** The item the keys act on. */
  focus: number | null;
}

/** A page's first state: each item set to its suggestion, the focus on the first. */
export function initial(page: GalleryPage, shown = PAGE): GalleryState {
  const items = page.items.slice(0, shown);
  const chosen: Record<number, string | null> = {};
  for (const i of items) chosen[i.item] = i.suggested;
  return { page: { ...page, items }, chosen, order: page.order, focus: ordered(items, page.order)[0]?.item ?? null };
}

/** How sure an item is, for the order: no suggestion is the least sure, and a suggestion without a confidence the surest. */
const sureOf = (i: GalleryItem): number => (i.suggested === null ? -1 : (i.confidence ?? 2));

/** The items in an order, as the engine orders them. */
export function ordered(items: GalleryItem[], order: GalleryOrder): GalleryItem[] {
  const list = [...items];
  if (order === "position") return list.sort((a, b) => a.position - b.position);
  if (order === "suggested")
    return list.sort((a, b) => {
      if ((a.suggested === null) !== (b.suggested === null)) return a.suggested === null ? 1 : -1;
      const v = (a.suggested ?? "").localeCompare(b.suggested ?? "");
      return v !== 0 ? v : sureOf(a) - sureOf(b) || a.position - b.position;
    });
  return list.sort((a, b) => Number(b.disagree) - Number(a.disagree) || sureOf(a) - sureOf(b) || a.position - b.position);
}

/** The items as shown now. */
export const shown = (s: GalleryState): GalleryItem[] => ordered(s.page.items, s.order);

/** Groups of the items as shown, by the value suggested, for the grouped order; one group otherwise. */
export function groups(s: GalleryState): { value: string | null; items: GalleryItem[] }[] {
  const list = shown(s);
  if (s.order !== "suggested") return [{ value: null, items: list }];
  const out: { value: string | null; items: GalleryItem[] }[] = [];
  for (const i of list) {
    const last = out[out.length - 1];
    if (last && last.value === i.suggested) last.items.push(i);
    else out.push({ value: i.suggested, items: [i] });
  }
  return out;
}

/** Set an item to a value, or back to none. */
export function choose(s: GalleryState, item: number, value: string | null): GalleryState {
  if (!(item in s.chosen)) return s;
  return { ...s, chosen: { ...s.chosen, [item]: value }, focus: item };
}

/** Set every item suggested one value to another: a whole group the suggester read wrong. */
export function chooseAll(s: GalleryState, from: string | null, to: string): GalleryState {
  const chosen = { ...s.chosen };
  for (const i of s.page.items) if (i.suggested === from) chosen[i.item] = to;
  return { ...s, chosen };
}

/** Back to the suggestion. */
export function reset(s: GalleryState, item: number): GalleryState {
  const i = s.page.items.find((x) => x.item === item);
  return i ? choose(s, item, i.suggested) : s;
}

export const reorder = (s: GalleryState, order: GalleryOrder): GalleryState => ({ ...s, order });

/** Whether an item is set to something other than its suggestion. */
export const changed = (s: GalleryState, i: GalleryItem): boolean => (s.chosen[i.item] ?? null) !== i.suggested;

/** What a page holds now: how many are set, how many the person changed, how many still want a value. */
export function tally(s: GalleryState): { total: number; set: number; changed: number; unset: number } {
  let set = 0;
  let ch = 0;
  for (const i of s.page.items) {
    if (s.chosen[i.item]) set++;
    if (changed(s, i)) ch++;
  }
  return { total: s.page.items.length, set, changed: ch, unset: s.page.items.length - set };
}

/** The accept door's body: every item with a value, as set now. An item with none is left for later. */
export function acceptBody(s: GalleryState): { answers: { item: number; value: string }[] } {
  return {
    answers: shown(s).flatMap((i) => {
      const v = s.chosen[i.item];
      return v ? [{ item: i.item, value: v }] : [];
    }),
  };
}

/** The key that sets a value: 1 to 9 for the first nine, 0 for the tenth; none past it. */
export function keyOfValue(values: string[], value: string): string | null {
  const n = values.indexOf(value);
  if (n < 0 || n > 9) return null;
  return n === 9 ? "0" : String(n + 1);
}

/** The value a key sets, of a question's values. */
export function valueOfKey(values: string[], key: string): string | null {
  if (!/^[0-9]$/u.test(key)) return null;
  const n = key === "0" ? 9 : Number(key) - 1;
  return values[n] ?? null;
}

export type GalleryAct =
  | { kind: "set"; value: string }
  | { kind: "move"; by: number }
  | { kind: "reset" }
  | { kind: "accept" }
  | { kind: "order" }
  | { kind: "mine" }
  | { kind: "none" };

/** What a key does on the grid: a number sets the focused item's value, the arrows move, Backspace puts the suggestion back, Ctrl+Enter accepts the page, `o` changes the order, `u` opens one's own answers to correct one. */
export function keyAct(key: string, values: string[], opts: { ctrl?: boolean; columns?: number } = {}): GalleryAct {
  if (key === "Enter" && opts.ctrl) return { kind: "accept" };
  const v = valueOfKey(values, key);
  if (v !== null) return { kind: "set", value: v };
  const cols = Math.max(1, opts.columns ?? 1);
  switch (key) {
    case "ArrowRight":
      return { kind: "move", by: 1 };
    case "ArrowLeft":
      return { kind: "move", by: -1 };
    case "ArrowDown":
      return { kind: "move", by: cols };
    case "ArrowUp":
      return { kind: "move", by: -cols };
    case "Backspace":
      return { kind: "reset" };
    case "o":
      return { kind: "order" };
    case "u":
    case "U":
      return { kind: "mine" };
    default:
      return { kind: "none" };
  }
}

/** The focus moved by some items through the order shown, held to the page. */
export function moved(s: GalleryState, by: number): GalleryState {
  const list = shown(s);
  if (list.length === 0) return s;
  const at = Math.max(0, list.findIndex((i) => i.item === s.focus));
  const next = Math.min(list.length - 1, Math.max(0, at + by));
  return { ...s, focus: list[next].item };
}

/** A confidence as a person reads it: a whole percent, nothing for none. */
export const percent = (p: number | null): string => (p === null ? "" : `${Math.round(p * 100)} %`);

/** The classes of an item most probable first, as `value p` pairs, at most `k`. */
export function topClasses(c: Record<string, number> | null, k = 3): { value: string; p: number }[] {
  if (!c) return [];
  return Object.entries(c)
    .map(([value, p]) => ({ value, p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, k);
}

/** How sure an item is, as a tone: low below 0.6, middling below 0.85. */
export function tone(i: GalleryItem): "low" | "mid" | "high" | "none" {
  if (i.suggested === null) return "none";
  if (i.disagree) return "low";
  if (i.confidence === null) return "high";
  return i.confidence < 0.6 ? "low" : i.confidence < 0.85 ? "mid" : "high";
}

/** What the page's counts say beside the grid. */
export function pageWords(p: GalleryPage, shownCount: number): string {
  const rest = Math.max(0, p.left - shownCount);
  const parts = [`${shownCount} of ${p.left} to check`];
  if (rest > 0) parts.push(`${rest} after these`);
  if (p.held_back_open === null && p.held_back > 0) parts.push(`${p.held_back} held back to read alone`);
  if (p.held_back_open === null && p.sealed > 0) parts.push(`${p.sealed} sealed, read blind one by one`);
  return parts.join(" · ");
}

/**
 * Why some items never come to the gallery, in a line (record 50, after the
 * first gold campaign: "some of them i couldn't do in batch, why?"): the
 * share the campaign holds back is read one by one so the engine can check
 * how often an answer given in a batch is right, and a sealed sample's
 * stacks are read blind. Null where nothing is held back.
 */
export function aloneWords(p: GalleryPage): string | null {
  const held = p.held_back_open ?? p.held_back;
  const sealed = p.sealed;
  if (held + sealed === 0) return null;
  const parts: string[] = [];
  if (held > 0) parts.push(`${held} ${held === 1 ? "item is" : "items are"} held back to be read one by one: the campaign holds back ${Math.round(p.hold_back * 100)} % of what is accepted in batches, chosen at random, so the engine can check how often a batch answer is right`);
  if (sealed > 0) parts.push(`${sealed} ${sealed === 1 ? "is" : "are"} of a sealed sample, read blind with nothing suggested`);
  return `${parts.join("; ")}.`;
}

export interface Accepted {
  accepted: { item: number; answer: number; state: string; changed: boolean | null }[];
  refused: { item: number; why: string }[];
  held_back: number;
}

export const gallery = {
  page: (c: number | string, order: GalleryOrder, limit = PAGE + AHEAD) =>
    door<Json>("GET", `/api/campaigns/${encodeURIComponent(String(c))}/gallery?order=${order}&limit=${limit}`).then(pageOf),
  accept: (c: number | string, body: { answers: { item: number; value: string }[] }) => door<Accepted>("POST", `/api/campaigns/${encodeURIComponent(String(c))}/gallery/accept`, body),
  suggestions: (c: number | string) => door<Json>("GET", `/api/campaigns/${encodeURIComponent(String(c))}/suggestions`),
  suggest: (c: number | string, body: { tsv: string; author?: string; source?: string; dry_run?: boolean }) => door<Json>("POST", `/api/campaigns/${encodeURIComponent(String(c))}/suggestions`, body),
};

/** What an accept did, in a line. */
export function acceptedWords(a: Accepted): string {
  const n = a.accepted.length;
  const ch = a.accepted.filter((x) => x.changed === true).length;
  const parts = [`${n} ${n === 1 ? "answer" : "answers"} kept`];
  if (ch > 0) parts.push(`${ch} corrected`);
  if (a.refused.length > 0) parts.push(`${a.refused.length} left: ${a.refused[0].why}`);
  return parts.join(" · ");
}

/** Warm the browser's cache with the pictures of items not shown yet, so the next page draws at once. */
export function prefetch(items: GalleryItem[], make: () => { src: string } = () => new Image()): number {
  let n = 0;
  for (const i of items) {
    const img = make();
    img.src = i.thumb;
    n++;
  }
  return n;
}
