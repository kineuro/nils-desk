// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's doors and words (record 26, D1): a dataset is a source
// place with a name and two trees, the originals the pseudonymiser reads and
// the pseudonymised tree the registry reads; what arrives through it, who a
// file is about, what happens to a file whose identifier the map does not
// know, and the cohort its subjects join. The sources door lists them, the
// places door takes the dataset fields, the look door says whether a folder
// holds a v0 cohort layout, the jobs door queues the chain that brings new
// files in, and the linkage doors file the map. An engine before record 26
// answers none of the new fields, and every word here reads without them.

import { door, type ChainedJob } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import { ops } from "../ops/client";
import { cohorts as cohortDoors } from "./cohorts";
import type { IdType, ImportColumn, ImportReport } from "./pseudonyms";
import { digestMarks, fileWords, whenWords, type Digest, type Mark, type Source } from "./sources";

// The doors more than one page reads are typed once and read from here: the sources door (with `sources`), the jobs
// doors (the operations client), the linkage types and imports (with the Pseudonymisation page), the cohorts (with
// the Cohorts page). The shapes below are the ones the other pages import.
export { sources } from "./sources";
export { linkage } from "./pseudonyms";
export type { ChainedJob, IdType as LinkageType, ImportReport };
export type MapColumn = ImportColumn;

export type Arrives = "identified" | "deidentified" | "coded";
export type Unmapped = "hold" | "code";
export type OriginalsKept = "kept" | "vaulted" | "purged";

/** Where a file's identifier is read from: a DICOM keyword, or a folder of the path counted from one. */
export interface IdentitySource {
  field?: string;
  path?: { segment: number };
  pattern?: string;
}

/** The identity rule of a dataset, as the digest and the pseudonymiser read it; `code: verbatim` takes the identifier as the code. */
export interface IdentityRule {
  id_type: string;
  code?: "verbatim";
  from: IdentitySource[];
  fallback?: string | null;
}

/** The counts are null on a place the engine has not probed since it was declared, or since the update that gave it trees. */
export interface Trees {
  originals: { path: string; files: number | null; bytes: number | null } | null;
  anon: { path: string; files: number | null; last_written: string | null };
}

/** A tree's file count in words, or that the engine has not counted it yet. */
export function countWords(files: number | null | undefined): string {
  return typeof files === "number" ? files.toLocaleString("en-US") : "not counted yet";
}

export interface Tags {
  keep_demographics: boolean;
  remove: string[];
  keep: string[];
}

export interface Held {
  files: number;
  identifiers: number;
}

/** What the pseudonymiser did in one batch, as the sources door lists it. */
export interface Pseudonymised {
  files: number;
  changed: number;
  held: number;
  job: number | null;
}

/** A digest as the sources door lists it at record 26: with what the pseudonymiser did first, and the chain of jobs by stage. */
export interface Batch extends Digest {
  pseudonymised?: Pseudonymised | null;
  chain?: (number | null)[] | null;
}

/** A source place as the sources door lists it at record 26; every new field is absent from an older engine. */
export interface Dataset extends Omit<Source, "digests"> {
  digests: Omit<Source["digests"], "recent"> & { recent: Batch[] };
  arrives?: Arrives;
  trees?: Trees | null;
  identity?: IdentityRule | null;
  unmapped?: Unmapped;
  cohort?: string | null;
  tags?: Tags | null;
  held?: Held | null;
  originals_kept?: OriginalsKept;
}

/** Files a second, as the engine last measured them on this machine, when the sources door says. */
export interface Rates {
  pseudonymize?: number;
  digest?: number;
}

export interface SourcesAnswer {
  count: number;
  window_days: number;
  sources: Dataset[];
  rates?: Rates | null;
}

/** The five stages of a batch, as `GET /api/batches/{id}` reports them at record 26. */
export interface BatchStages {
  pseudonymised: { files: number; changed: number; held: number; refused: number; job: number | null } | null;
  walked: { files: number; new: number; changed: number; unchanged: number; refused: number; job: number | null } | null;
  digested: { stacks: number; sessions: number; subjects: number; moved: number; job: number | null } | null;
  classified: { stacks: number; of: number; unsure: number; pack: string | null; jobs: number[] } | null;
  reviewed: { done: number; of: number; since: string | null } | null;
}

/** What a look found of a v0 cohort folder: the originals and the raw tree v0 wrote. */
export interface Layout {
  v0: { original_files: number; raw_files: number; renamed: boolean } | null;
}

/** The dataset fields the places door takes beside a place's own. */
export interface DatasetFields {
  arrives: Arrives;
  identity?: IdentityRule | null;
  unmapped?: Unmapped;
  cohort?: string | null;
  tags?: Tags | null;
  move_into_anon?: boolean;
}

export type ColumnRole = "identifier" | "canonical" | "code" | "ignore";

export const places = {
  add: (body: { name: string; role: "source"; path: string; guarantees: Record<string, unknown> } & Partial<DatasetFields>) => door<Place & { layout?: Layout | null }>("POST", "/api/places", body),
  set: (id: number, body: Partial<DatasetFields> & { handling?: Source["handling"] }) => door<Place & { layout?: Layout | null }>("PUT", `/api/places/${id}`, body),
};

export const look = {
  /** What layout a folder holds, before it is declared: by its location where one holds it, else by its path. */
  layout: (folder: string) => door<{ layout?: Layout | null }>("POST", "/api/ingest/look", folder.startsWith("@") ? { at: folder, names: [] } : { path: folder, names: [] }),
};

/** The jobs doors as the Data page calls them, each the operations client's own. */
export const jobs = {
  /** A job, with the commands queued after it once it ends done (record 26). */
  enqueue: (command: string[], name?: string, then?: string[][]) => ops.enqueue(command, name, then),
  open: () => ops.jobs(false, 200),
  recent: (limit = 50) => ops.jobs(true, limit),
  job: (id: number) => ops.job(id),
  cancel: (id: number) => ops.cancel(id),
  /** Candidate identity rules probed over a sample of a location, as a job; the result is shapes only. */
  probe: (location: string, rules: IdentityRule[], sample?: number) => door<{ job: number; state: string }>("POST", "/api/ingest/probe", { location, rules, ...(sample ? { sample } : {}) }),
};

export const cohorts = {
  /** The cohorts by name, the retired left out, for the one a dataset feeds; the Cohorts page reads the whole row. */
  list: () => cohortDoors.list().then((all) => ({ cohorts: all.filter((c) => !c.retired_at) })),
};

/** The engine's event stream: the open jobs every second, through the desk's proxy. */
export const EVENTS = "/api/events";

const n = (v: number) => v.toLocaleString("en-US");

/** Whether the engine speaks record 26: its sources carry the trees, or its contract is OpenAPI 5 or later. */
export function record26(caps: Capabilities, d?: Dataset | null): boolean {
  const openapi = Number.parseInt(caps.engine?.contracts?.["openapi"] ?? "0", 10);
  return openapi >= 5 || (d !== undefined && d !== null && d.trees !== undefined);
}

/** What arrives through a dataset, from its own field, or from the handling an older engine declared. */
export function arrivesOf(d: Pick<Dataset, "arrives" | "handling">): Arrives {
  return d.arrives ?? (d.handling.arrives === "deidentified" ? "deidentified" : "identified");
}

/** The privacy line of a card: what arrives, in a few words, with its icon and tone. */
export function arrivesWords(arrives: Arrives): { words: string; tone: "gated" | "ok"; icon: "lock" | "shield" } {
  switch (arrives) {
    case "identified":
      return { words: "arrives identified", tone: "gated", icon: "lock" };
    case "deidentified":
      return { words: "arrives de-identified", tone: "ok", icon: "shield" };
    case "coded":
      return { words: "our codes in PatientID", tone: "ok", icon: "shield" };
  }
}

/** A running job of a dataset: a digest reading, or a pseudonymise still writing. */
function reading(d: Dataset): boolean {
  return d.digests.recent.some((b) => b.state === "running");
}

/** What a dataset's card says first: reading, what is held, what waits, not read, not sorted, or up to date. */
export function datasetState(d: Dataset): { words: string; tone: "brand" | "caution" | "ok" | "neutral" } {
  if (reading(d)) return { words: "reading now", tone: "brand" };
  const held = d.held?.files ?? 0;
  if (held > 0) return { words: `${n(held)} held`, tone: "caution" };
  if (d.totals.to_sort > 0) return { words: `${n(d.totals.to_sort)} to sort`, tone: "caution" };
  if (d.digests.count === 0) return { words: "not read yet", tone: "neutral" };
  // digested, and nothing was ever classified: no pack reads it
  if (d.totals.stacks > 0 && d.digests.recent.length > 0 && d.digests.recent.every((b) => (b.classified ?? 0) === 0)) return { words: "not sorted", tone: "neutral" };
  return { words: "up to date", tone: "ok" };
}

export interface TreeLine {
  icon: "lock" | "shield";
  path: string;
  words: string;
}

/** The two trees of a dataset on one line: the originals, locked, and the pseudonymised tree, the source. Nothing for an engine that names no trees. */
export function treeLines(d: Dataset): TreeLine[] {
  if (!d.trees) return [];
  const out: TreeLine[] = [];
  const last = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;
  if (d.trees.originals) out.push({ icon: "lock", path: last(d.trees.originals.path), words: `${countWords(d.trees.originals.files)} · locked` });
  const anon = d.trees.anon;
  const how = arrivesOf(d) === "identified" ? "the source" : arrivesOf(d) === "deidentified" ? "moved in, files as sent" : "codes taken verbatim";
  out.push({ icon: "shield", path: last(anon.path), words: `${countWords(anon.files)} · ${how}` });
  return out;
}

/** The cohort a dataset feeds, as its tag. */
export function cohortWords(d: Dataset): string | null {
  if (d.cohort === undefined) return null;
  return d.cohort ? `feeds cohort ${d.cohort}` : "no cohort";
}

/** What a batch did, as the line under a dataset's numbers: when, what was pseudonymised, the new subjects, what is held. */
export function batchLine(b: Batch, now = new Date()): string {
  const when = whenWords(b.started_at, now) || "once";
  if (b.state === "running") return `${when}: reading, ${n(b.files.seen)} files so far`;
  const parts: string[] = [];
  const p = b.pseudonymised;
  if (p) {
    if (p.files > 0) parts.push(`${n(p.files)} files pseudonymised`);
    else if (p.changed > 0) parts.push(`${n(p.changed)} files changed, pseudonymised again`);
    else parts.push("nothing new to pseudonymise");
  } else {
    parts.push(fileWords(b));
  }
  parts.push(`${n(b.subjects_added)} new ${b.subjects_added === 1 ? "subject" : "subjects"}`);
  if (p && p.held > 0) parts.push(`${n(p.held)} ${p.held === 1 ? "file" : "files"} held until mapped`);
  return `${when}: ${parts.join(" · ")}`;
}

/** The last line of a dataset's card: its newest batch, or that nothing has read it. */
export function lastLine(d: Dataset, now = new Date()): string {
  const newest = d.digests.recent[0];
  if (!newest) return d.digests.count === 0 ? "not read yet" : `${d.digests.count} ${d.digests.count === 1 ? "batch" : "batches"} · last ${whenWords(d.digests.last?.started_at ?? null, now)}`;
  return batchLine(newest, now);
}

export const STAGES = ["pseudonymised", "walked", "digested", "classified", "reviewed"] as const;
export type StageName = (typeof STAGES)[number];

export interface StripMark {
  name: StageName;
  mark: Mark;
  words: string;
}

/**
 * The five marks of a batch: from its stages when the batch door gives them,
 * else the pseudonymised mark from what the sources door says and the four
 * marks a digest always had, the first absent where the engine says nothing.
 */
export function stripMarks(b: Batch, stages?: BatchStages | null): StripMark[] {
  if (stages) return marksOfStages(stages);
  const four = digestMarks(b).map((m) => ({ name: m.name as StageName, mark: m.mark, words: m.words }));
  return [pseudonymisedMark(b.pseudonymised ?? null, b.state), ...four];
}

function pseudonymisedMark(p: Pseudonymised | null, state: string): StripMark {
  const name = "pseudonymised" as const;
  if (!p) return { name, mark: "none", words: "not said" };
  if (p.held > 0) return { name, mark: "wait", words: `${n(p.held)} held` };
  if (state === "running" && p.files === 0) return { name, mark: "now", words: "writing" };
  if (p.files === 0 && p.changed === 0) return { name, mark: "done", words: "nothing new" };
  return { name, mark: "done", words: `${n(p.files + p.changed)} files` };
}

function marksOfStages(s: BatchStages): StripMark[] {
  const ps = s.pseudonymised;
  const w = s.walked;
  const dg = s.digested;
  const c = s.classified;
  const r = s.reviewed;
  return [
    ps === null ? { name: "pseudonymised", mark: "none", words: "not needed" } : ps.held > 0 ? { name: "pseudonymised", mark: "wait", words: `${n(ps.held)} held` } : ps.refused > 0 ? { name: "pseudonymised", mark: "failed", words: `${n(ps.refused)} refused` } : { name: "pseudonymised", mark: ps.job !== null || ps.files + ps.changed > 0 ? "done" : "none", words: `${n(ps.files + ps.changed)} files` },
    w === null ? { name: "walked", mark: "none", words: "not yet" } : { name: "walked", mark: w.job !== null || w.files > 0 ? "done" : "none", words: `${n(w.files)} files` },
    dg === null ? { name: "digested", mark: "none", words: "not yet" } : { name: "digested", mark: "done", words: `${n(dg.stacks)} stacks` },
    c === null ? { name: "classified", mark: "none", words: "not yet" } : { name: "classified", mark: c.stacks >= c.of && c.of > 0 ? "done" : c.of === 0 ? "none" : "wait", words: c.of === 0 ? "nothing new" : `${n(c.stacks)} of ${n(c.of)}` },
    r === null ? { name: "reviewed", mark: "none", words: "not yet" } : { name: "reviewed", mark: r.of === 0 ? "none" : r.done >= r.of ? "done" : "wait", words: r.of === 0 ? "nothing waits" : r.done >= r.of ? `${n(r.of)} of ${n(r.of)}` : `${n(r.of - r.done)} to sort` },
  ];
}

/** What a batch's row offers at its end: the held files to map, what to sort, a read again, or that it is sorted. */
export function batchTail(b: Batch): { kind: "held" | "sort" | "again" | "sorted" | "reading"; words: string; count: number } {
  if (b.state === "running") return { kind: "reading", words: "reading", count: 0 };
  const held = b.pseudonymised?.held ?? 0;
  if (held > 0) return { kind: "held", words: `${n(held)} held: map them`, count: held };
  if (b.state === "failed" || b.state === "cancelled") return { kind: "again", words: "Read again", count: 0 };
  const toSort = b.to_sort ?? 0;
  if (toSort > 0) return { kind: "sort", words: `Sort ${n(toSort)}`, count: toSort };
  return { kind: "sorted", words: "sorted", count: 0 };
}

/** How many files of the originals no pseudonymised copy stands for yet: new files and the held ones, when the trees are known. */
export function newInOriginals(d: Dataset): number | null {
  if (!d.trees?.originals || typeof d.trees.originals.files !== "number" || typeof d.trees.anon.files !== "number") return null;
  return Math.max(0, d.trees.originals.files - d.trees.anon.files);
}

/** The pack the chain classifies with: the one named, else the first the engine loads. */
export function packFor(caps: Capabilities, name?: string | null): string | null {
  const packs = caps.engine?.packs ?? [];
  if (name && packs.some((p) => p.name === name)) return name;
  return packs[0]?.name ?? null;
}

export interface BringIn {
  command: string[];
  name: string;
}

/**
 * Bring in what is new, as the engine's own thread: `bring-in @dataset
 * --name N --pack P`, which the engine unfolds into the steps the dataset
 * needs (the pseudonymiser first for one that arrives identified, then the
 * digest of the pseudonymised tree, then the fingerprint and the
 * classification), every step under the one name, so the batches of the
 * thread join. `only` queues the first step alone, named the same way: the
 * pseudonymiser for an identified dataset, the digest for any other.
 */
export function bringInBody(d: Pick<Dataset, "name" | "arrives" | "handling">, name: string, pack: string | null, only = false): BringIn {
  const at = `@${d.name}`;
  if (only) return { command: [arrivesOf(d) === "identified" ? "pseudonymize" : "digest", at, "--name", name], name };
  return { command: ["bring-in", at, "--name", name, ...(pack ? ["--pack", pack] : [])], name };
}

/** The steps of a bring-in as a person reads them, for the dialog's timeline. */
export function bringInSteps(d: Pick<Dataset, "name" | "arrives" | "handling" | "cohort">, pack: string | null, packVersion?: string | null): { title: string; words: string }[] {
  const out: { title: string; words: string }[] = [];
  const cohort = d.cohort ? `; new subjects join the cohort ${d.cohort}` : "";
  if (arrivesOf(d) === "identified") out.push({ title: "Pseudonymise", words: "The new files of the originals into dcm-anon: codes in, names and private tags out, dates and UIDs kept. A file whose identifier the map does not know is held." });
  out.push({ title: "Digest", words: `Read what is new in ${arrivesOf(d) === "identified" ? "dcm-anon" : "the dataset"} into the registry${cohort}.` });
  out.push({ title: "Sort", words: pack ? `Fingerprint, then classify with ${pack}${packVersion ? ` ${packVersion}` : ""}. What the rules cannot place goes to Review.` : "Fingerprint. No pack is loaded, so nothing is classified until one is." });
  return out;
}

/** The queued rest of a chain in a few words: "then digest, then sort". */
export function chainWords(then: string[][] | null | undefined): string {
  if (!then || then.length === 0) return "";
  const names: string[] = [];
  for (const cmd of then) {
    const verb = cmd[0] === "pseudonymize" ? "pseudonymise" : cmd[0] === "fingerprint" || cmd[0] === "classify" ? "sort" : cmd[0];
    if (verb && names[names.length - 1] !== verb) names.push(verb);
  }
  return names.map((v) => `then ${v}`).join(", ");
}

/** About how long the first step takes at the machine's last measured rate, or nothing where none was measured. */
export function estimateWords(files: number | null, rate: number | null | undefined, thenWhat = "the digest"): string | null {
  if (files === null || !rate || rate <= 0) return null;
  const seconds = Math.max(1, Math.round(files / rate));
  const span = seconds < 60 ? `${seconds} ${seconds === 1 ? "second" : "seconds"}` : seconds < 3600 ? `${Math.round(seconds / 60)} ${Math.round(seconds / 60) === 1 ? "minute" : "minutes"}` : `${(seconds / 3600).toFixed(1)} hours`;
  return `About ${n(files)} files at ${n(Math.round(rate))} a second on this machine: ${span}, then ${thenWhat}.`;
}

/** The name a bring-in takes: the dataset and the day. */
export function bringInName(dataset: string, now = new Date()): string {
  return `${dataset}-${now.toISOString().slice(0, 10)}`;
}

/** The words of a v0 cohort folder found under a path about to be declared. */
export function v0Words(layout: Layout | null | undefined): { lead: string; detail: string; skipped: number } | null {
  const v0 = layout?.v0;
  if (!v0) return null;
  const skipped = Math.max(0, v0.original_files - v0.raw_files);
  return {
    lead: "This is a NILS v0 cohort folder",
    detail: `derivatives/dcm-original holds ${n(v0.original_files)} files as they came from the scanners, and derivatives/dcm-raw holds ${n(v0.raw_files)} files v0 pseudonymised, with v0's codes in PatientID.`,
    skipped,
  };
}

/** The choices of the cohort a dataset feeds: one named after it, one that exists, or none. */
export function cohortChoices(name: string, existing: string[]): { value: string; words: string }[] {
  const own = name.trim();
  const out: { value: string; words: string }[] = [];
  if (own) out.push({ value: `new:${own}`, words: `a cohort named after the dataset: ${own}` });
  for (const c of existing.filter((c) => c !== own).sort()) out.push({ value: `is:${c}`, words: `the cohort ${c}` });
  out.push({ value: "none", words: "no cohort: its subjects join cohorts by hand or from a query" });
  return out;
}

/** The cohort a choice names, or null for none. */
export function cohortOf(choice: string): string | null {
  if (choice === "none" || choice === "") return null;
  return choice.replace(/^(new|is):/, "") || null;
}

/** A CSV as the browser reads it: the header and the rows, quotes honoured, empty lines left out. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
  const [header = [], ...rest] = rows;
  return { header, rows: rest };
}

/** The role each column of a map most likely plays, from its header: v0's file (PatientID, subject_code) imports as it is. */
export function guessColumns(header: string[], defaultType: string | null): MapColumn[] {
  return header.map((h) => {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/(subject)?code$|^code|subjectid$/.test(key)) return { header: h, role: "code" };
    if (/canonical|personnummer|pnr|personalnumber/.test(key)) return { header: h, role: "canonical", ...(defaultType ? { id_type: defaultType } : {}) };
    if (key === "" || /^(note|notes|comment|comments)$/.test(key)) return { header: h, role: "ignore" };
    return { header: h, role: "identifier", ...(defaultType ? { id_type: defaultType } : {}) };
  });
}

/** Why a map cannot be posted as its columns stand, or null. */
export function columnsRefusal(columns: MapColumn[]): string | null {
  const ids = columns.filter((c) => c.role === "identifier" || c.role === "canonical");
  if (ids.length === 0) return "name at least one column as an identifier or as the canonical identifier";
  const untyped = ids.filter((c) => !c.id_type?.trim());
  if (untyped.length > 0) return `${untyped.map((c) => c.header).join(", ")}: an identifier column names its type`;
  if (!columns.some((c) => c.role === "code" || c.role === "canonical")) return "name the column that stands for the person: the code, or the canonical identifier";
  return null;
}

/** What an import will do, as lines. */
export function reportLines(r: ImportReport): { tone: "ok" | "caution" | "neutral"; words: string }[] {
  const out: { tone: "ok" | "caution" | "neutral"; words: string }[] = [];
  out.push({ tone: "neutral", words: `${n(r.subjects.named)} subjects named: ${n(r.subjects.known)} known, ${n(r.subjects.new)} new` });
  // the engine names the new types, or counts them
  const typesNew = r.identifiers.types_new;
  const types = Array.isArray(typesNew) ? (typesNew.length > 0 ? `; new types: ${typesNew.join(", ")}` : "") : typesNew > 0 ? `; ${n(typesNew)} new ${typesNew === 1 ? "type" : "types"}` : "";
  out.push({ tone: "neutral", words: `${n(r.identifiers.filed)} identifiers filed: ${n(r.identifiers.known)} known, ${n(r.identifiers.new)} new${types}` });
  const released = typeof r.held_released === "number" ? r.held_released : r.held_released.released;
  if (released > 0) out.push({ tone: "ok", words: `${n(released)} held ${released === 1 ? "file is" : "files are"} released` });
  if (r.merges.length > 0) out.push({ tone: "caution", words: `${n(r.merges.length)} ${r.merges.length === 1 ? "subject merges" : "subjects merge"} into another: ${r.merges.map((m) => `${m.alias} into ${m.canonical}`).join(", ")}` });
  if (r.conflicts.length > 0) out.push({ tone: "caution", words: `${n(r.conflicts.length)} ${r.conflicts.length === 1 ? "conflict" : "conflicts"}, on which nothing is written: ${r.conflicts.map((c) => `row ${c.row}, ${c.why}`).join("; ")}` });
  return out;
}

/** A folder named as @place/relative where a source place holds it, for a probe; null outside every source. */
export function locationOf(folder: string, places: Place[]): string | null {
  const f = folder.replace(/\/+$/, "");
  const holding = places
    .filter((p) => p.role === "source" && p.retired_at === null && (f === p.path.replace(/\/+$/, "") || f.startsWith(`${p.path.replace(/\/+$/, "")}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!holding) return null;
  const rel = f.slice(holding.path.replace(/\/+$/, "").length).replace(/^\/+/, "");
  return rel ? `@${holding.name}/${rel}` : `@${holding.name}`;
}

/** What a probe found, in a few words: how many files, the shapes, whether a folder of the path names a person. */
export function probeWords(result: unknown): string {
  const first = candidateOf(result);
  if (!first) return "The probe answered nothing it could say in shapes.";
  const files = typeof first.files === "number" ? first.files : 0;
  const srcs = (first.sources as { source?: string; answered?: number; shapes?: Record<string, number> }[] | undefined) ?? [];
  const parts: string[] = [`${n(files)} files sampled`];
  for (const s of srcs) {
    const shapes = Object.entries(s.shapes ?? {}).sort((a, b) => b[1] - a[1]);
    if (shapes.length === 0) parts.push(`${s.source ?? "the source"}: nothing answered`);
    else if (shapes.length === 1) parts.push(`${s.source ?? "the source"}: one shape, ${shapes[0][0]}, on ${n(shapes[0][1])} files`);
    else parts.push(`${s.source ?? "the source"}: ${shapes.length} shapes, most often ${shapes[0][0]} on ${n(shapes[0][1])} files`);
  }
  const constant = first.identity_constant as { constant?: boolean } | undefined;
  if (constant?.constant) parts.push("every file names the same person, so the folder is one subject");
  if (typeof first.subjects === "number") parts.push(`${n(first.subjects)} subjects`);
  return `${parts.join(" · ")}.`;
}

function candidateOf(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r["sources"])) return r;
  for (const key of ["candidates", "rules", "results"]) {
    const list = r[key];
    if (Array.isArray(list) && list.length > 0 && list[0] && typeof list[0] === "object") return list[0] as Record<string, unknown>;
  }
  return null;
}

/** The identity rule of a form: a keyword or a folder of the path, and the type. */
export function identityOf(from: { kind: "field"; field: string } | { kind: "path"; segment: number }, idType: string): IdentityRule | null {
  const type = idType.trim();
  if (!type) return null;
  if (from.kind === "field") return from.field.trim() ? { id_type: type, from: [{ field: from.field.trim() }] } : null;
  return from.segment >= 1 ? { id_type: type, from: [{ path: { segment: Math.floor(from.segment) } }] } : null;
}

/** An identity rule in words: "PatientID as personnummer", "folder 3 of the path as study-id". */
export function identityWords(rule: IdentityRule | null | undefined): string | null {
  if (!rule || rule.from.length === 0) return null;
  const src = rule.from[0];
  const where = src.field ? src.field : src.path ? `folder ${src.path.segment} of the path` : "the file";
  return `${where} as ${rule.id_type}`;
}
