// SPDX-License-Identifier: AGPL-3.0-only
// What the comparison readers share (the post-contrast study: pair mode
// and anchored reading), apart from the page so the gate holds it: the
// rater's view and its keys, kept per campaign and rater; the keys of the
// page, grouped by what they do; and the panels kept on one slice through
// the lead panel where their geometry matches.
//
// The view (Nima, 2026-10-02: "with three planes selected, the next item
// goes back to the stack"; "see everything in axial only, and keep it"):
// the stack, the three planes, or one plane alone, chosen for every panel
// at once or for one panel, kept across items and visits in this browser
// under the campaign and the rater.

import type { Manifest } from "../viewer/doors";
import { isViewMode, type ViewMode } from "../viewer/view";
import { sliceMap, type SliceMap } from "./pair";

/** The views in the order the toolbar shows them, each with its key. */
export const READER_VIEWS: readonly { mode: ViewMode; label: string; key: string; title: string }[] = [
  { mode: "stack", label: "Stack", key: "z", title: "the stack in its own planes, every plane at its own resolution" },
  { mode: "planes", label: "3 planes", key: "t", title: "the three planes of the volume" },
  { mode: "axial", label: "Axial", key: "a", title: "the axial plane alone: the stack itself where it was acquired axially" },
  { mode: "coronal", label: "Coronal", key: "c", title: "the coronal plane alone" },
  { mode: "sagittal", label: "Sagittal", key: "x", title: "the sagittal plane alone" },
];

export const viewLabel = (m: ViewMode): string => READER_VIEWS.find((v) => v.mode === m)?.label ?? m;

/** The rater's choices on a reader, kept per campaign and rater. */
export interface ReaderPrefs {
  /** The view of every panel, unless one has its own. */
  all: ViewMode;
  /** A panel's own view, by its key (a side, a role). */
  panels: Partial<Record<string, ViewMode>>;
  /** An answer's key sends it and moves on, with no Enter. */
  auto: boolean;
}

export const DEFAULT_PREFS: ReaderPrefs = { all: "stack", panels: {}, auto: false };

export function prefsKey(kind: string, campaign: number | string, principal: string): string {
  return `nils.reader.${kind}.${campaign}.${principal}`;
}

/** The prefs as stored, read defensively; what is not a choice is left at its default. */
export function prefsOf(raw: string | null, fallback: ReaderPrefs = DEFAULT_PREFS): ReaderPrefs {
  if (!raw) return fallback;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const panels: Partial<Record<string, ViewMode>> = {};
    if (o.panels && typeof o.panels === "object" && !Array.isArray(o.panels)) for (const [k, v] of Object.entries(o.panels)) if (isViewMode(v)) panels[k] = v;
    return { all: isViewMode(o.all) ? o.all : fallback.all, panels, auto: o.auto === true };
  } catch {
    return fallback;
  }
}

export function loadPrefs(key: string, fallback: ReaderPrefs = DEFAULT_PREFS): ReaderPrefs {
  try {
    return prefsOf(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function savePrefs(key: string, p: ReaderPrefs): void {
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // a private window keeps nothing; the page works the same
  }
}

/** A panel's view: its own, else every panel's. */
export const viewOf = (p: ReaderPrefs, panel: string): ViewMode => p.panels[panel] ?? p.all;

/** Every panel to one view: the panels' own choices are dropped. */
export const withAll = (p: ReaderPrefs, mode: ViewMode): ReaderPrefs => ({ ...p, all: mode, panels: {} });

/** One panel to a view of its own; the same as every panel's is no choice of its own. */
export function withPanel(p: ReaderPrefs, panel: string, mode: ViewMode): ReaderPrefs {
  const panels = { ...p.panels };
  if (mode === p.all) delete panels[panel];
  else panels[panel] = mode;
  return { ...p, panels };
}

/** The view after this one, for `v`. */
export function nextView(m: ViewMode): ViewMode {
  const i = READER_VIEWS.findIndex((v) => v.mode === m);
  return READER_VIEWS[(i + 1) % READER_VIEWS.length].mode;
}

/** What a key does on a comparison page. */
export type CompareAct =
  | { kind: "answer"; index: number }
  | { kind: "send" }
  | { kind: "skip" }
  | { kind: "keys" }
  | { kind: "sync" }
  | { kind: "window" }
  | { kind: "difference" }
  | { kind: "region"; region: number }
  | { kind: "back" }
  | { kind: "mine" }
  | { kind: "auto" }
  | { kind: "view"; mode: ViewMode | "next"; one: boolean };

/**
 * A key's act. Answers: 1 to n choose (and send, where the rater asked
 * that a key sends), Enter sends, `s` gives the item back, `b` opens the
 * last answer again, `m` lists them, `u` turns sending on the key on and
 * off. The view: `z` the stack, `t` the three planes, `a`, `c`, `x` the
 * axial, coronal and sagittal plane alone, `v` the next view; with Shift,
 * for the panel under the pointer alone. Comparing: `l` one slice, `w` one
 * window, `d` the difference, 7 to 0 the jumps. `?` the keys. The arrows,
 * Page Up and Down and Space are the pictures'.
 */
export function compareKey(key: string, o: { inField: boolean; ctrl?: boolean; shift?: boolean; answers: number; difference?: boolean }): CompareAct | null {
  if (o.inField) return null;
  if (o.ctrl) return key === "Enter" ? { kind: "send" } : null;
  if (key === "Enter") return { kind: "send" };
  if (key === "?") return { kind: "keys" };
  const k = key.length === 1 ? key.toLowerCase() : key;
  const view = READER_VIEWS.find((v) => v.key === k);
  if (view) return { kind: "view", mode: view.mode, one: !!o.shift };
  if (k === "v") return { kind: "view", mode: "next", one: !!o.shift };
  if (o.shift && key.length === 1 && key !== key.toLowerCase()) return null;
  if (key === "s") return { kind: "skip" };
  if (key === "l") return { kind: "sync" };
  if (key === "w") return { kind: "window" };
  if (key === "d" && o.difference) return { kind: "difference" };
  if (key === "b") return { kind: "back" };
  if (key === "m") return { kind: "mine" };
  if (key === "u") return { kind: "auto" };
  if (/^[1-9]$/u.test(key) && Number(key) <= o.answers) return { kind: "answer", index: Number(key) - 1 };
  const region = ["7", "8", "9", "0"].indexOf(key);
  if (region >= 0 && o.answers < 7) return { kind: "region", region };
  return null;
}

/** The keys in groups, for the overlay: what each does, in the page's words. */
export function keyGroups(o: { answers: readonly { key: string; words: string }[]; noun: string; difference: boolean }): { title: string; keys: [string, string][] }[] {
  return [
    {
      title: "Answer",
      keys: [
        ...o.answers.map((a) => [a.key, a.words] as [string, string]),
        ["Enter", `send the answer, then the next ${o.noun}; on an answer opened again, correct it`],
        ["u", "send on the answer's key, with no Enter (on or off)"],
        ["s", `give the ${o.noun} back, then the next; on an answer opened again, leave it as it was`],
        ["b", "open your last answer again to correct it; again, the one before"],
        ["m", `your answers, by ${o.noun}, to open one and correct it`],
      ],
    },
    {
      title: "View",
      keys: [
        ...READER_VIEWS.map((v) => [v.key, v.title] as [string, string]),
        ["v", "the next view"],
        ["Shift + key", "that view for the panel under the pointer alone"],
        ["Space", "in three planes: enlarge the plane under the pointer, and back"],
      ],
    },
    {
      title: "Compare",
      keys: [
        ["l", "keep the pictures on one slice where their geometry matches, or let each move alone"],
        ["w", "one window for all, scaled to each stack's reference tissue, or each its own"],
        ...(o.difference ? [["d", "the candidate minus each reference, on the references' panels"] as [string, string]] : []),
        ["7 8 9 0", "jump to the ventricles, the superior sagittal sinus, the transverse sinuses, the sella (approximate)"],
      ],
    },
    {
      title: "Pictures",
      keys: [
        ["↑ ↓", "page the picture under the pointer a plane; Page Up and Down ten"],
        ["wheel", "page; on one slice, the others follow"],
        ["left drag", "window and level; with one window, all follow"],
        ["right drag, middle drag", "zoom, pan"],
      ],
    },
  ];
}

/** Each panel's slice maps to and from the lead panel, where their geometry matches; null for one whose does not. */
export interface HubLinks {
  lead: string;
  toLead: Partial<Record<string, SliceMap | null>>;
  fromLead: Partial<Record<string, SliceMap | null>>;
}

export function hubLinks(manifests: Partial<Record<string, Manifest>>, lead: string, keys: readonly string[]): HubLinks | null {
  const c = manifests[lead];
  if (!c) return null;
  const out: HubLinks = { lead, toLead: {}, fromLead: {} };
  for (const k of keys) {
    if (k === lead) continue;
    const m = manifests[k];
    if (!m) continue;
    const to = sliceMap(m, c);
    const from = sliceMap(c, m);
    out.toLead[k] = to && from ? to : null;
    out.fromLead[k] = to && from ? from : null;
  }
  return out;
}

/** Where every panel goes when one moves to plane z: the lead's place, then each panel tied to it; an untied panel stays. */
export function hubFollow(links: HubLinks | null, moved: string, z: number, now: Readonly<Record<string, number | null>>): Record<string, number | null> {
  const next: Record<string, number | null> = { ...now, [moved]: z };
  if (!links) return next;
  const zl = moved === links.lead ? z : (links.toLead[moved]?.map(z) ?? null);
  if (zl === null) return next;
  next[links.lead] = zl;
  for (const k of Object.keys(links.fromLead)) {
    if (k === moved) continue;
    const f = links.fromLead[k];
    if (f) next[k] = f.map(zl);
  }
  return next;
}

/** How many panels are tied to the lead now. */
export const tiedCount = (links: HubLinks | null): number => (links ? Object.values(links.fromLead).filter(Boolean).length : 0);
