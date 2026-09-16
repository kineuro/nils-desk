// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's reads (the engine's sources door): every source place, how
// what comes in through it is handled, its digests over time and its totals,
// and the words and marks the page draws from them.

import { door } from "../ask/client";
import type { SourcesAnswer } from "./datasets";

export interface Handling {
  arrives: "identified" | "deidentified";
  on_release: { dates: "keep" | "shift" | "year"; uids: "remap" | "preserve"; deface: boolean };
}

export interface Digest {
  id: number;
  name: string;
  state: string;
  started_at: string | null;
  finished_at: string | null;
  job_id: number | null;
  files: { seen: number; new: number; changed: number; unchanged: number; refused: number };
  subjects_added: number;
  stacks_added: number;
  classified?: number;
  to_sort?: number;
}

export interface Source {
  id: number;
  name: string;
  path: string;
  guarantees: Record<string, unknown>;
  probed: Record<string, unknown> | null;
  handling: Handling;
  handling_declared: boolean;
  roots: number;
  digests: { count: number; first: Pick<Digest, "id" | "name" | "state" | "started_at" | "finished_at"> | null; last: Pick<Digest, "id" | "name" | "state" | "started_at" | "finished_at"> | null; recent: Digest[] };
  totals: { subjects: number; studies: number; sessions: number; stacks: number; refused_files: number; to_sort: number };
}

/** The one sources door: every source as a dataset at record 26, with the fields an older engine leaves out, and the rates where the engine measured them. */
export const sources = {
  list: (recent = 12) => door<SourcesAnswer>("GET", `/api/sources?recent=${recent}`),
};

export type Mark = "done" | "now" | "wait" | "failed" | "none";

/** The four stages of a digest, as marks: walked, digested, classified, reviewed. */
export function digestMarks(d: Digest): { name: string; mark: Mark; words: string }[] {
  const running = d.state === "running";
  const failed = d.state === "failed" || d.state === "cancelled";
  const classified = d.classified ?? 0;
  const toSort = d.to_sort ?? 0;
  const n = (v: number) => v.toLocaleString("en-US");
  return [
    { name: "walked", mark: failed ? "failed" : running ? "now" : "done", words: `${n(d.files.seen)} files` },
    { name: "digested", mark: failed ? "failed" : running ? "now" : "done", words: `${n(d.stacks_added)} stacks` },
    {
      name: "classified",
      mark: running || d.stacks_added === 0 ? "none" : classified >= d.stacks_added ? "done" : "wait",
      words: d.stacks_added === 0 ? "nothing new" : `${n(classified)} of ${n(d.stacks_added)}`,
    },
    {
      name: "reviewed",
      mark: running || d.stacks_added === 0 ? "none" : toSort > 0 ? "wait" : classified > 0 ? "done" : "none",
      words: toSort > 0 ? `${n(toSort)} to sort` : "nothing waits",
    },
  ];
}

/** What a source's card says first: reading, what waits, or that it is up to date. */
export function sourceState(s: Source): { words: string; tone: "brand" | "caution" | "ok" | "neutral" } {
  if (s.digests.recent.some((d) => d.state === "running")) return { words: "reading now", tone: "brand" };
  if (s.totals.to_sort > 0) return { words: `${s.totals.to_sort.toLocaleString("en-US")} to sort`, tone: "caution" };
  if (s.digests.count === 0) return { words: "not read yet", tone: "neutral" };
  return { words: "up to date", tone: "ok" };
}

/** How a source is handled, in a few words for its card. */
export function handlingWords(h: Handling): { arrives: string; release: string } {
  const parts: string[] = [];
  if (h.on_release.dates === "shift") parts.push("dates shifted");
  if (h.on_release.dates === "year") parts.push("dates cut to the year");
  if (h.on_release.uids === "remap") parts.push("UIDs remapped");
  if (h.on_release.deface) parts.push("faces removed");
  return {
    arrives: h.arrives === "identified" ? "arrives identified" : "arrives de-identified",
    release: parts.length > 0 ? `on release: ${parts.join(", ")}` : "released as it is",
  };
}

/** A digest's files, as a line. */
export function fileWords(d: Digest): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const out = [`${n(d.files.new)} new`];
  if (d.files.changed > 0) out.push(`${n(d.files.changed)} changed`);
  if (d.files.unchanged > 0) out.push(`${n(d.files.unchanged)} unchanged`);
  if (d.files.refused > 0) out.push(`${n(d.files.refused)} refused`);
  return out.join(" · ");
}

/** When, short: the time today, else the day and month. */
export function whenWords(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  if (t.toDateString() === now.toDateString()) return `today ${t.toTimeString().slice(0, 5)}`;
  return t.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(t.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
