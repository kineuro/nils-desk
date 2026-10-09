// SPDX-License-Identifier: AGPL-3.0-only
// A dataset as a tree (Wave 7a, the dataset view, 2026-10-09): subject,
// session, datatype, scan, as a BIDS folder reads, so a person knows where
// a scan sits by looking. Inside a session the datatypes come in BIDS's
// order with a scanner's own folder (anat/SyMRI) beside its datatype; inside
// a datatype the scans come as they were acquired (the series number), each
// family together (the plain scans first, then SyMRI, a mix sequence,
// STAGE, SWI, the derived images, the spine and neck), and in a family the
// acquisitions before what the scanner made of them. Pure functions: the
// view draws what these say.

import type { Scan } from "./scans";

/** The families a session's scans are grouped by, in their order; the plain scans have no word. */
export type Family = "plain" | "symri" | "mix" | "stage" | "swi" | "derived" | "body";

export const FAMILY_WORD: Record<Family, string> = {
  plain: "",
  symri: "SyMRI",
  mix: "Mix sequence",
  stage: "STAGE",
  swi: "SWI",
  derived: "Derived",
  body: "Spine and neck",
};
const FAMILY_ORDER: Family[] = ["plain", "symri", "mix", "stage", "swi", "derived", "body"];
/** The colour slot each family's chosen scan is framed in (the theme's value colours); the plain ones take the brand's. */
export const FAMILY_SLOT: Record<Family, number | null> = { plain: null, symri: 1, mix: 3, stage: 4, swi: 2, derived: 5, body: 6 };

/** A scan's family, from what NILS says made it and where in the body it is. */
export function familyOf(s: Pick<Scan, "axes">): Family {
  const a = s.axes;
  switch (a.provenance) {
    case "SyMRI":
      return "symri";
    case "EPIMix":
    case "NeuroMix":
      return "mix";
    case "STAGE":
      return "stage";
    case "SWIRecon":
      return "swi";
    case "ProjectionDerived":
    case "SubtractionDerived":
      return "derived";
  }
  if (a.disposition === "reformat") return "derived";
  if (a.body_part === "spine" || a.body_part === "neck") return "body";
  return "plain";
}

/** Acquisitions before what the scanner made of them, reformats after, the rest last. */
const MADE: Record<string, number> = { acquisition: 0, scanner_derived: 1, reformat: 2 };

/** The datatype folder a scan is shown under: its scanner's own folder where it has one (anat/SyMRI), else its datatype. */
export function folderOf(s: Pick<Scan, "datatype" | "folder">): string {
  return s.folder.startsWith(`${s.datatype}/`) ? s.folder : s.datatype;
}

const TYPE_ORDER = ["anat", "dwi", "func", "fmap", "perf", "other"];
function typeRank(folder: string): [number, string] {
  const head = folder.split("/")[0];
  const i = TYPE_ORDER.indexOf(head);
  return [i < 0 ? TYPE_ORDER.length : i, folder];
}

/** The order of scans inside one datatype folder. */
export function compareScans(a: Scan, b: Scan): number {
  const fa = FAMILY_ORDER.indexOf(familyOf(a));
  const fb = FAMILY_ORDER.indexOf(familyOf(b));
  if (fa !== fb) return fa - fb;
  const ma = MADE[a.axes.disposition ?? "acquisition"] ?? 3;
  const mb = MADE[b.axes.disposition ?? "acquisition"] ?? 3;
  if (ma !== mb) return ma - mb;
  const sa = a.series ?? Number.MAX_SAFE_INTEGER;
  const sb = b.series ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  return a.id - b.id;
}

export interface TypeNode {
  key: string;
  folder: string;
  scans: Scan[];
  look: number;
}
export interface SessionNode {
  key: string;
  label: string;
  types: TypeNode[];
  count: number;
  look: number;
}
export interface SubjectNode {
  key: string;
  label: string;
  sessions: SessionNode[];
  count: number;
  look: number;
}

const needsLook = (s: Scan) => s.questions.length > 0;

/** The session's folder name: its label where a session is built, else its day, else none. */
export function sessionLabel(s: Pick<Scan, "label" | "day">): string {
  const v = s.label ?? s.day?.replaceAll("-", "") ?? null;
  return `ses-${v && v !== "" ? v : "none"}`;
}

/** The scans as a tree, subjects as the door sorted them, sessions by day, folders in BIDS's order, scans in the session's order. */
export function buildTree(scans: Scan[]): SubjectNode[] {
  const subjects: SubjectNode[] = [];
  const bySubject = new Map<number, { node: SubjectNode; sessions: Map<string, { node: SessionNode; day: string; types: Map<string, TypeNode> }> }>();
  for (const s of scans) {
    let sub = bySubject.get(s.subjectId);
    if (!sub) {
      const node: SubjectNode = { key: `u${s.subjectId}`, label: `sub-${s.subject}`, sessions: [], count: 0, look: 0 };
      sub = { node, sessions: new Map() };
      bySubject.set(s.subjectId, sub);
      subjects.push(node);
    }
    const sk = s.session !== null ? `s${s.session}` : `d${s.day ?? ""}`;
    let ses = sub.sessions.get(sk);
    if (!ses) {
      ses = { node: { key: `${sub.node.key}/${sk}`, label: sessionLabel(s), types: [], count: 0, look: 0 }, day: s.day ?? "", types: new Map() };
      sub.sessions.set(sk, ses);
    }
    const folder = folderOf(s);
    let t = ses.types.get(folder);
    if (!t) {
      t = { key: `${ses.node.key}/${folder}`, folder, scans: [], look: 0 };
      ses.types.set(folder, t);
    }
    t.scans.push(s);
    const look = needsLook(s) ? 1 : 0;
    t.look += look;
    ses.node.count += 1;
    ses.node.look += look;
    sub.node.count += 1;
    sub.node.look += look;
  }
  for (const { node, sessions } of bySubject.values()) {
    const list = [...sessions.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    node.sessions = list.map((x) => {
      x.node.types = [...x.types.values()].sort((a, b) => {
        const [ra, fa] = typeRank(a.folder);
        const [rb, fb] = typeRank(b.folder);
        return ra !== rb ? ra - rb : fa.localeCompare(fb);
      });
      for (const t of x.node.types) t.scans.sort(compareScans);
      return x.node;
    });
  }
  return subjects;
}

/** Every scan in the tree's order: what next and previous walk, whatever is folded. */
export function treeOrder(tree: SubjectNode[]): Scan[] {
  return tree.flatMap((u) => u.sessions.flatMap((s) => s.types.flatMap((t) => t.scans)));
}

/** Whether a scan answers a filter: every word of it found in its names, its place or what NILS says it is. */
export function matches(s: Scan, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = [s.name, s.bids ?? "", s.description ?? "", s.datatype, s.folder, `sub-${s.subject}`, sessionLabel(s), s.orientation ?? "", ...Object.values(s.axes)]
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The words of a filter. */
export function filterWords(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

/** One row of the tree as drawn: a branch (subject, session, folder), a family's quiet divider, or a scan. */
export type Row =
  | { kind: "subject" | "session" | "type"; key: string; depth: number; label: string; count: number; look: number; open: boolean; parent: string | null }
  | { kind: "family"; key: string; depth: number; label: string; parent: string }
  | { kind: "scan"; key: string; depth: number; scan: Scan; family: Family; parent: string };

/** The rows on screen: a branch's children only while it is open (every branch open while a filter is on). */
export function rowsOf(tree: SubjectNode[], open: ReadonlySet<string>, all = false): Row[] {
  const rows: Row[] = [];
  const isOpen = (k: string) => all || open.has(k);
  for (const u of tree) {
    const uo = isOpen(u.key);
    rows.push({ kind: "subject", key: u.key, depth: 0, label: u.label, count: u.count, look: u.look, open: uo, parent: null });
    if (!uo) continue;
    for (const s of u.sessions) {
      const so = isOpen(s.key);
      rows.push({ kind: "session", key: s.key, depth: 1, label: s.label, count: s.count, look: s.look, open: so, parent: u.key });
      if (!so) continue;
      for (const t of s.types) {
        const to = isOpen(t.key);
        rows.push({ kind: "type", key: t.key, depth: 2, label: t.folder, count: t.scans.length, look: t.look, open: to, parent: s.key });
        if (!to) continue;
        let was: Family | null = null;
        for (const sc of t.scans) {
          const f = familyOf(sc);
          if (f !== was && f !== "plain") rows.push({ kind: "family", key: `${t.key}#${f}`, depth: 3, label: FAMILY_WORD[f], parent: t.key });
          was = f;
          rows.push({ kind: "scan", key: `x${sc.id}`, depth: 3, scan: sc, family: f, parent: t.key });
        }
      }
    }
  }
  return rows;
}

/** The keys of the branches above a scan, which open to show it. */
export function pathOf(tree: SubjectNode[], stack: number): string[] {
  for (const u of tree)
    for (const s of u.sessions)
      for (const t of s.types) if (t.scans.some((x) => x.id === stack)) return [u.key, s.key, t.key];
  return [];
}

/** The tree with only the scans a filter keeps, branches with none left out. */
export function filterTree(tree: SubjectNode[], keep: (s: Scan) => boolean): SubjectNode[] {
  const out: SubjectNode[] = [];
  for (const u of tree) {
    const sessions: SessionNode[] = [];
    for (const s of u.sessions) {
      const types = s.types.map((t) => ({ ...t, scans: t.scans.filter(keep) })).filter((t) => t.scans.length > 0);
      if (types.length === 0) continue;
      const count = types.reduce((n, t) => n + t.scans.length, 0);
      const look = types.reduce((n, t) => n + t.scans.filter(needsLook).length, 0);
      sessions.push({ ...s, types: types.map((t) => ({ ...t, look: t.scans.filter(needsLook).length })), count, look });
    }
    if (sessions.length === 0) continue;
    out.push({ ...u, sessions, count: sessions.reduce((n, s) => n + s.count, 0), look: sessions.reduce((n, s) => n + s.look, 0) });
  }
  return out;
}

/** The words a scan's facts strip says, value by value, each with what it is for its hover; no engine words. */
const FACT_ORDER: [string, string][] = [
  ["base", "Weighting"],
  ["technique", "Sequence"],
  ["modifier", "Modifiers"],
  ["construct", "Image"],
  ["body_part", "Body part"],
  ["post_contrast", "Contrast agent"],
  ["provenance", "Made by"],
  ["disposition", "Kind"],
];
const VALUE_WORD: Record<string, Record<string, string>> = {
  post_contrast: { "1": "contrast", "0": "no contrast", given: "contrast", not_given: "no contrast" },
  disposition: { acquisition: "", scanner_derived: "made by the scanner", reformat: "reformat", working_scan: "working scan", scout: "scout", excluded: "excluded" },
  provenance: { RawRecon: "" },
  construct: { ND: "" },
};

export interface Fact {
  what: string;
  value: string;
}

/** What NILS says a scan is, as short values in a fixed order; the plane and the image count after. */
export function factsOf(s: Pick<Scan, "axes" | "orientation" | "images">): Fact[] {
  const out: Fact[] = [];
  for (const [axis, what] of FACT_ORDER) {
    const v = s.axes[axis];
    if (v === undefined || v === "") continue;
    const word = VALUE_WORD[axis]?.[v] ?? v.replaceAll(",", " ");
    if (word !== "") out.push({ what, value: word });
  }
  if (s.orientation) out.push({ what: "Plane", value: s.orientation.toLowerCase() });
  if (s.images !== null) out.push({ what: "Images", value: `${s.images.toLocaleString("en-US")} ${s.images === 1 ? "image" : "images"}` });
  return out;
}
