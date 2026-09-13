// SPDX-License-Identifier: AGPL-3.0-only
// The folders of the machine the supervisor runs on, for choosing a path by
// clicking rather than typing it (Wave 5 section 10.4): where one may start,
// the folders inside a folder, the disk each is on, and a disk /etc/fstab
// names that is not mounted. The supervisor answers an admin, through the
// desk's proxy, and never follows a folder that does not answer.

import { door } from "../ask/client";
import { sizeWords } from "./database";

export interface Mount {
  point: string;
  fs: string;
  source: string;
  network: boolean;
  free_bytes: number | null;
  total_bytes: number | null;
}

/** A mount point /etc/fstab names, with nothing mounted there. */
export interface Unmounted {
  fs: string;
  source: string;
  network: boolean;
}

export interface FolderEntry {
  name: string;
  readable: boolean;
  hidden: boolean;
  link: boolean;
  /** Set when the folder is itself a mount point. */
  mount: Mount | null;
  unmounted: Unmounted | null;
}

export interface Listing {
  path: string;
  parent: string | null;
  /** Null where the folder did not answer in time and nothing was read. */
  exists: boolean | null;
  directory: boolean | null;
  readable: boolean | null;
  /** The disk the folder is on. */
  mount: Mount | null;
  folders: FolderEntry[];
  files: number;
  partial: boolean;
  timed_out: boolean;
}

export interface Root {
  path: string;
  kind: "root" | "home" | "mount" | "fstab";
  mount: Mount | null;
  unmounted: Unmounted | null;
}

const BASE = "/supervise/api/supervise";

export const folders = {
  list: (path: string) => door<Listing>("POST", `${BASE}/folders`, { path }),
  roots: () => door<{ path: null; roots: Root[]; timed_out: boolean }>("POST", `${BASE}/folders`, {}),
};

/** A path made plain: one slash between names and none at the end, "." and ".." resolved; null for one that is not whole from /. */
export function plainPath(input: string): string | null {
  const t = input.trim();
  if (!t.startsWith("/")) return null;
  const out: string[] = [];
  for (const part of t.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

/** The folders from / down to a path, each to click back to. */
export function crumbs(path: string): { name: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  return [{ name: "/", path: "/" }, ...parts.map((name, i) => ({ name, path: `/${parts.slice(0, i + 1).join("/")}` }))];
}

/** A folder inside another, as a path. */
export function inside(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

/** The disk a folder is on, in one line: its filesystem, where it comes from, and its room. */
export function mountWords(m: Mount): string {
  const room = m.free_bytes === null ? null : m.total_bytes === null ? `${sizeWords(m.free_bytes)} free` : `${sizeWords(m.free_bytes)} free of ${sizeWords(m.total_bytes)}`;
  return [m.network ? `${m.fs}, a network disk` : m.fs, m.source && m.source !== m.fs ? `from ${m.source}` : null, room].filter(Boolean).join(" · ");
}

/** What a place to start from is. */
export function rootWords(r: Root): string {
  switch (r.kind) {
    case "root":
      return "the whole machine";
    case "home":
      return "the supervisor's home folder";
    case "mount": {
      // short in a list of places to start from: the filesystem and its room, the source said once the disk is open
      const m = r.mount;
      if (!m) return "a disk mounted here";
      return [m.network ? `${m.fs}, network` : m.fs, m.free_bytes !== null ? `${sizeWords(m.free_bytes)} free` : null].filter(Boolean).join(", ");
    }
    case "fstab":
      return r.unmounted ? `not mounted: /etc/fstab names ${r.unmounted.fs}${r.unmounted.source ? ` from ${r.unmounted.source}` : ""}` : "not mounted";
  }
}

/** The note beside a folder in the list: a disk that should be mounted there and is not, no access, or the disk mounted there. */
export function entryNote(e: FolderEntry): { tone: "neutral" | "caution" | "blocked"; words: string } | null {
  if (e.unmounted) return { tone: "caution", words: `not mounted, ${e.unmounted.fs}` };
  if (!e.readable) return { tone: "blocked", words: "no access" };
  if (e.mount) return { tone: "neutral", words: e.mount.network ? `${e.mount.fs}, network` : e.mount.fs };
  return null;
}

/** What the listing says of the folder itself, when it is not simply there to use. */
export function listingNote(l: Listing, unmounted: Unmounted | null): { tone: "caution" | "blocked"; words: string } | null {
  if (l.timed_out) return { tone: "caution", words: "The folder did not answer within 5 seconds. It may be on a network disk that is not answering." };
  if (unmounted) {
    const from = unmounted.source ? ` from ${unmounted.source}` : "";
    return { tone: "caution", words: `Nothing is mounted here. /etc/fstab names ${unmounted.fs}${from} for this folder; until it is mounted, what is written here goes to the disk underneath.` };
  }
  if (l.exists === false) return { tone: "blocked", words: "Nothing is there on this machine." };
  if (l.directory === false) return { tone: "blocked", words: "That is a file, not a folder." };
  if (l.readable === false) return { tone: "blocked", words: "The folder is there, and the supervisor cannot read it." };
  return null;
}

/** How much a folder holds beside its folders. */
export function filesWords(l: Listing): string | null {
  if (l.files === 0) return l.folders.length === 0 && l.readable !== false && !l.timed_out ? "an empty folder" : null;
  return `${l.files.toLocaleString("en-GB")}${l.partial ? " or more" : ""} ${l.files === 1 ? "file" : "files"} here too`;
}
