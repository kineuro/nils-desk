// SPDX-License-Identifier: AGPL-3.0-only
// The engine's picker in words and rules, apart from the page: a folder named
// as @root/relative with the way back up, the pages of a folder merged, the
// folders to look inside next, what a look found, the folders chosen from
// anywhere with the chosen folder each is inside, and the digest each becomes.

import { slug } from "../home/look";
import type { FolderEntry, FolderPage, IngestRoot, LookedFolder, PlaceRef } from "./browse";

/** The folders a look is asked about at once, as the engine takes them. */
export const LOOK_AT_ONCE = 64;

const n = (v: number) => v.toLocaleString("en-GB");

/** A folder named as @root/relative, in its parts; null for anything else. */
export function parseAt(at: string): { root: string; rel: string[] } | null {
  if (!at.startsWith("@")) return null;
  const [root, ...rest] = at.slice(1).split("/");
  if (!root) return null;
  const rel = rest.filter((s) => s !== "" && s !== ".");
  if (rel.includes("..")) return null;
  return { root, rel };
}

export function atOf(root: string, rel: string[]): string {
  return rel.length === 0 ? `@${root}` : `@${root}/${rel.join("/")}`;
}

/** A folder inside another, by its name. */
export function childAt(at: string, name: string): string {
  return `${at.replace(/\/+$/, "")}/${name}`;
}

/** The folder above, or null at a location itself. */
export function parentAt(at: string): string | null {
  const p = parseAt(at);
  if (!p || p.rel.length === 0) return null;
  return atOf(p.root, p.rel.slice(0, -1));
}

/** The folders from the location down to this one, each to go back to. */
export function crumbsOf(at: string): { name: string; at: string }[] {
  const p = parseAt(at);
  if (!p) return [];
  return [{ name: p.root, at: atOf(p.root, []) }, ...p.rel.map((name, i) => ({ name, at: atOf(p.root, p.rel.slice(0, i + 1)) }))];
}

/** A folder's path on the engine's machine, from the path of the folder it is in. */
export function pathInside(path: string, name: string): string {
  return path.endsWith("/") ? `${path}${name}` : `${path}/${name}`;
}

/** Whether one folder is inside another, at any depth. */
export function isInside(inner: string, outer: string): boolean {
  return inner.startsWith(`${outer}/`);
}

/** A page added after the pages before it, a folder already listed not listed twice. */
export function mergePage(rows: FolderEntry[], page: FolderEntry[]): FolderEntry[] {
  const have = new Set(rows.map((r) => r.name));
  return [...rows, ...page.filter((r) => !have.has(r.name))];
}

/** The folders on screen to look inside: those not looked inside yet, or that the last look did not reach, and that the engine may open; 64 at most. */
export function lookNames(at: string, rows: FolderEntry[], visible: Iterable<string>, looks: Record<string, LookedFolder>, max = LOOK_AT_ONCE): string[] {
  const shown = new Set(visible);
  return rows
    .filter((r) => shown.has(r.name) && r.readable !== false && looks[childAt(at, r.name)]?.looked !== true)
    .slice(0, max)
    .map((r) => r.name);
}

/** How many files, and whether there may be more. */
export function filesWords(files: { count: number; more: boolean }): string {
  return `${n(files.count)}${files.more ? " or more" : ""} ${files.count === 1 && !files.more ? "file" : "files"}`;
}

export type LookTone = "dicom" | "other" | "quiet";

/** What a look found in a folder, in a few words: its modalities and scanners and its files. */
export function lookWords(look: LookedFolder | undefined): { tone: LookTone; words: string } {
  if (!look) return { tone: "quiet", words: "" };
  if (!look.looked) return { tone: "quiet", words: "not looked inside yet" };
  if (look.directory === false) return { tone: "quiet", words: "no longer a folder here" };
  const files = look.files ?? { count: 0, more: false };
  if ((look.dicom ?? 0) > 0) {
    const modalities = Object.entries(look.modalities ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m)
      .filter((m) => m !== "unknown");
    const scanners = look.scanners ?? 0;
    const what = [modalities.join(", ") || "DICOM", scanners > 0 ? `${scanners} ${scanners === 1 ? "scanner" : "scanners"}` : null].filter(Boolean).join(", ");
    return { tone: "dicom", words: `${what} · ${filesWords(files)}` };
  }
  if (files.count === 0) return { tone: "quiet", words: files.more ? "no files reached yet" : "no files" };
  return { tone: "other", words: `no DICOM found · ${filesWords(files)}` };
}

/** What a location is, beside its name. */
export function rootWords(r: IngestRoot): string {
  if (!r.place) return "no place holds it";
  return r.place.role === "source" ? `the source ${r.place.name}` : `in the ${r.place.role} place ${r.place.name}`;
}

/** What the open folder is: in a source or not, or why it cannot be read. */
export function folderNote(p: FolderPage): { tone: "neutral" | "caution" | "blocked"; words: string } {
  if (p.exists === false) return { tone: "blocked", words: "Nothing is there any more." };
  if (p.directory === false) return { tone: "blocked", words: "That is a file, not a folder." };
  if (p.readable === false) return { tone: "blocked", words: "The engine cannot read this folder." };
  if (p.place?.role === "source") return { tone: "neutral", words: `In the source ${p.place.name}.` };
  const other = p.place ? ` It is in the ${p.place.role} place ${p.place.name}.` : "";
  return { tone: "caution", words: `No source place holds this folder, and a digest reads only under one.${other} Add it, or a folder it is inside, as a source.` };
}

/** How much of the open folder is listed, and its own files. */
export function listWords(p: FolderPage, shown: number, filter: string): string | null {
  const parts: string[] = [];
  if (p.total !== null) {
    if (p.total === 0) parts.push(filter ? `No folder here has "${filter}" in its name.` : "No folder inside.");
    else if (shown < p.total) parts.push(`${n(shown)} of ${n(p.total)} folders${filter ? ` with "${filter}" in the name` : ""}.`);
  } else if (p.partial && !p.timed_out) {
    parts.push("This folder holds more than can be listed; filter by name to find a folder.");
  }
  if (p.files.count > 0) parts.push(`${filesWords(p.files)} here too.`);
  return parts.length > 0 ? parts.join(" ") : null;
}

export interface Chosen {
  at: string;
  /** The folder's path on the engine's machine, for adding it as a source. */
  path: string;
  place: PlaceRef | null;
}

/** Whether a source place holds a chosen folder, so it can be digested. */
export function held(c: Chosen): boolean {
  return c.place?.role === "source";
}

/** A folder ticked or unticked: added at the end, or taken out. */
export function toggleChosen(list: Chosen[], item: Chosen): Chosen[] {
  return list.some((c) => c.at === item.at) ? list.filter((c) => c.at !== item.at) : [...list, item];
}

/** The nearest chosen folder another chosen folder is inside, or null. */
export function insideOf(list: Chosen[], at: string): string | null {
  return list.filter((c) => isInside(at, c.at)).sort((a, b) => b.at.length - a.at.length)[0]?.at ?? null;
}

/** The chosen folders once a folder is added as a source: it, and every folder inside it that no source held, are held by it now. */
export function heldBy(list: Chosen[], at: string, place: PlaceRef): Chosen[] {
  return list.map((c) => (!held(c) && (c.at === at || isInside(c.at, at)) ? { ...c, place } : c));
}

/** What the chosen list says beside a folder: the source that holds it, and the chosen folder it is inside. */
export function chosenNote(c: Chosen, outer: string | null): string {
  const parts = [c.place?.role === "source" ? `in the source ${c.place.name}` : "no source place holds it"];
  if (outer) parts.push(`inside ${outer}, which is chosen too`);
  return parts.join("; ");
}

/** A digest's name: the folder's path from its location made plain, the nearest folders kept first, and never a name taken. */
export function digestName(at: string, taken: string[]): string {
  const p = parseAt(at);
  const parts = p ? [p.root, ...p.rel].map(slug).filter(Boolean) : [];
  let base = parts.pop() ?? "digest";
  while (parts.length > 0 && `${parts[parts.length - 1]}-${base}`.length <= 40) base = `${parts.pop()}-${base}`;
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
}

/** The digest of each chosen folder, one job each, reading the folder by its location. */
export function digestPlan(list: Chosen[]): { at: string; name: string; command: string[] }[] {
  const taken: string[] = [];
  return list.map((c) => {
    const name = digestName(c.at, taken);
    taken.push(name);
    return { at: c.at, name, command: ["digest", "--name", name, c.at] };
  });
}

/** What was queued, each digest with its job. */
export function queuedWords(queued: { name: string; job: number }[]): string {
  if (queued.length === 0) return "Nothing was queued.";
  const each = queued.map((q) => `${q.name} (job ${q.job})`);
  const list = each.length === 1 ? each[0] : `${each.slice(0, -1).join(", ")} and ${each[each.length - 1]}`;
  return queued.length === 1 ? `One digest is queued: ${list}.` : `${queued.length} digests are queued: ${list}.`;
}

/** The words of the button that queues the digests. */
export function digestWords(count: number): string {
  if (count === 0) return "Digest the chosen folders";
  return count === 1 ? "Digest 1 folder" : `Digest ${count} folders`;
}
