// SPDX-License-Identifier: AGPL-3.0-only
// What a finished run made, and the ways to it (2026-10-13; Nima, after a
// SAMSEG run on the desk: "there is no way for me to see the samseg
// result! why?"). A pipeline run's job opens its run; each catalog row says
// its newest run on one line, which opens it; and on a run's page each unit
// with a mask lists its files and offers View: the scan the mask is on, the
// mask drawn over it, read only. The mask is drawn from its layer on that
// scan, the engine's label pyramid of the scan's shape, as the check reader
// draws it (`GET /api/derivatives/{id}/layers/{stack}/{set}/...`), built on
// demand where it is not built yet; the scan is the one the mask's grid is
// on (`grid_stack_id`). A file is a unit's where its path holds the unit's
// folder, as the engine writes a run's files.

import { door, type Json, type JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { sees } from "../grants";
import type { Pipeline, Run } from "./catalog";
import { runTag } from "./made";
import { runActs, type Derivative } from "./runs";

const n = (v: number) => v.toLocaleString("en-US");
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

/** The layer door a mask is drawn through, as the capabilities list it. */
export const LAYER_DOOR = "GET /api/derivatives/{id}/layers/{stack}/{set}/manifest";

/** Whether a person may see a run's results drawn: the run's files, the layer door, and detail quasi, at which the engine answers a layer. */
export function viewActs(caps: Capabilities): boolean {
  return runActs(caps).files && served(caps, LAYER_DOOR) && sees(caps, "quasi");
}

/** The run a pipeline run's job is of, where it says one: its result, its arguments, or its progress. */
export function runOfJob(job: JobRow): number | null {
  if (job.kind !== "pipeline" && int(obj(job.result).run) === null) return null;
  return int(obj(job.result).run) ?? int(obj(job.args).run) ?? int(obj(job.progress).run);
}

/** A pipeline's name as a run names it: the label before its version. */
const nameOf = (label: string): string => (label.includes("@") ? label.slice(0, label.lastIndexOf("@")) : label);

/** The newest run of a pipeline's name, any version: the runs as the catalog lists them, by its id or its label. */
export function lastRunOf(name: string, runs: Run[], pipelines: Pick<Pipeline, "id" | "name">[]): Run | null {
  let last: Run | null = null;
  for (const r of runs) {
    const of = pipelines.find((p) => p.id === r.pipeline_id)?.name ?? nameOf(r.pipeline);
    if (of === name && (last === null || r.id > last.id)) last = r;
  }
  return last;
}

/** A run on one line, as the catalog row says it: "last run 4 · 4 of 4 made · 12 Oct", and its tone for the border. */
export function lastRunWords(r: Run, now = new Date()): { words: string; tone: "ok" | "caution" | "brand" | "neutral" } {
  const tag = runTag(r);
  const tone = tag.className.includes("ok") ? "ok" : tag.className.includes("caution") ? "caution" : tag.className.includes("brand") ? "brand" : "neutral";
  const when = whenWords(r.started_at, now);
  return { words: [`last run ${r.id}`, tag.words, when].filter(Boolean).join(" · "), tone };
}

/** A file's name: the last part of its path. */
export function fileName(d: Pick<Derivative, "id" | "path">): string {
  const p = (d.path ?? "").split("/").filter(Boolean);
  return p.length > 0 ? p[p.length - 1] : `file ${d.id}`;
}

/** A unit's file by its short name: the unit's own words taken off the front, as a run names its files. */
export function shortName(name: string, unit: string | null): string {
  return unit && name.startsWith(`${unit}_`) && name.length > unit.length + 1 ? name.slice(unit.length + 1) : name;
}

/** The unit a file is of: the one whose folder its path holds, else whose name it begins with; null for a run's own file. */
export function unitOfFile(d: Pick<Derivative, "path">, units: string[]): string | null {
  const segs = (d.path ?? "").split("/");
  const name = segs[segs.length - 1] ?? "";
  // the longest first, so sub-1_ses-2 is not read as sub-1
  const byLength = [...units].sort((a, b) => b.length - a.length);
  return byLength.find((u) => segs.includes(u)) ?? byLength.find((u) => name.startsWith(`${u}_`)) ?? null;
}

/** The files of each unit, in the units' order, and the run's own files apart. */
export function filesByUnit(files: Derivative[], units: string[]): { units: Map<string, Derivative[]>; own: Derivative[] } {
  const by = new Map<string, Derivative[]>();
  const own: Derivative[] = [];
  for (const f of files) {
    const u = unitOfFile(f, units);
    if (u === null) own.push(f);
    else by.set(u, [...(by.get(u) ?? []), f]);
  }
  const ordered = new Map<string, Derivative[]>();
  for (const u of units) if (by.has(u)) ordered.set(u, by.get(u)!);
  return { units: ordered, own };
}

/** Whether a file is a mask drawn on a scan: a mask whose grid is a known scan's. */
export function drawable(d: Derivative): boolean {
  return d.kind === "mask" && typeof d.grid_stack_id === "number" && d.grid_link !== "none";
}

/** One thing View draws: a mask's part set on the scan its grid is on. */
export interface ResultLayer {
  derivative: number;
  stack: number;
  set: string;
  words: string;
  kind: "components" | "labels" | "whole";
  /** How many parts the set holds, where the engine says. */
  count: number | null;
  /** A label map's values in order, which give each its colour; none for lesions or a whole mask. */
  labels: number[] | null;
  /** The largest value the layer holds, so every one has its colour. */
  max: number;
  /** The file's short name, where a unit has more than one mask. */
  file: string;
}

/** What View offers of a unit's files: each mask's part sets (or the mask whole), lesions first as the engine lists them. */
export function layersOf(files: Derivative[], unit: string | null = null): ResultLayer[] {
  const out: ResultLayer[] = [];
  for (const d of files) {
    if (!drawable(d)) continue;
    const file = shortName(fileName(d), unit);
    const sets = Array.isArray(d.part_sets) ? d.part_sets : [];
    if (sets.length === 0) {
      out.push({ derivative: d.id, stack: d.grid_stack_id!, set: "whole", words: "Whole mask", kind: "whole", count: null, labels: null, max: 1, file });
      continue;
    }
    for (const s of sets) {
      if (typeof s.key !== "string") continue;
      const kind = s.kind === "labels" ? "labels" : s.kind === "whole" ? "whole" : "components";
      const count = typeof s.count === "number" ? s.count : null;
      const named = Object.keys(obj(s.names))
        .map(Number)
        .filter((v) => Number.isInteger(v) && v > 0)
        .sort((a, b) => a - b);
      const labels = kind === "labels" && named.length > 0 ? named : null;
      // a label map's largest value, else as many as it has parts; a label map with no names is read from its parts door (labelsOf)
      const max = kind === "labels" ? (labels ? labels[labels.length - 1] : 0) : kind === "whole" ? 1 : Math.max(1, count ?? 1);
      out.push({ derivative: d.id, stack: d.grid_stack_id!, set: s.key, words: typeof s.words === "string" && s.words ? s.words : s.key, kind, count, labels, max, file });
    }
  }
  return out;
}

/** A chip's words for a layer: its set and how many parts, with the file where a unit has several masks. */
export function layerWords(l: ResultLayer, many: boolean): string {
  const head = l.count !== null && l.kind !== "whole" ? `${l.words} ${n(l.count)}` : l.words;
  return many ? `${head} · ${l.file}` : head;
}

/** A file's size in a person's words: "99 KB", "1.2 MB". */
export function sizeWords(bytes: number): string {
  if (bytes < 1000) return `${n(bytes)} B`;
  if (bytes < 1_000_000) return `${n(Math.round(bytes / 1000))} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/** The units of a run with a mask to view, in the run's order: what Previous and Next step through. */
export function viewableUnits(files: Derivative[], units: string[]): string[] {
  const by = filesByUnit(files, units).units;
  return [...by.entries()].filter(([, fs]) => fs.some(drawable)).map(([u]) => u);
}

/** A label map's values as its parts door lists them, sorted: for a set whose names the file does not carry. */
export function labelsOf(derivative: number, set: string): Promise<number[]> {
  return door<Json>("GET", `/api/derivatives/${derivative}/parts?set=${encodeURIComponent(set)}&per_page=500`).then((r) =>
    (Array.isArray(r.parts) ? r.parts : [])
      .map((p) => obj(p).label)
      .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0)
      .sort((a, b) => a - b),
  );
}
