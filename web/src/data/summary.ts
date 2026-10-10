// SPDX-License-Identifier: AGPL-3.0-only
// Datasets and cohorts on one page (Wave 7a, the design of 2026-10-09):
// what a dataset holds and where it is, from the engine's summary door, and
// the words, rails, bars and relations the page draws from it and from the
// cohorts. Every word here is a newcomer's: subjects, visits and scans, never
// an engine term; what the page cannot say plainly it does not say.

import { door } from "../ask/client";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import type { Cohort, Join, CohortRelease } from "./cohorts";
import type { Dataset } from "./datasets";
import { declared } from "./layout";
import type { NextStep } from "./steps";

export const SUMMARY_DOOR = "GET /api/datasets/{name}/summary";

export type StepName = "found" | "pseudonymised" | "read" | "sorted" | "body_part" | "post_contrast" | "main_scans" | "pictures" | "views";

/** The operations of their own, each a step of a dataset and of a cohort with its own review (record 56, section 2): sorting asks nothing about either. */
export type Operation = "body_part" | "post_contrast";
export const OPERATIONS: Operation[] = ["body_part", "post_contrast"];
export type StepState = "done" | "running" | "queued" | "waiting" | "off" | "failed";

/** Why a run of body part or post-contrast would be refused now, as its door would answer: a reason to tell refusals apart by, and the engine's words. */
export interface StepRefusal {
  reason: string;
  error: string;
}

/** One step of where a dataset is, as the summary door answers it: its state, the job that did it last and the counts the step has. */
export interface SummaryStep {
  step: StepName;
  state: StepState;
  job: number | null;
  started_at: string | null;
  finished_at: string | null;
  progress: Record<string, unknown> | null;
  files?: number | null;
  bytes?: number | null;
  tree?: "anon" | "originals";
  waiting?: number;
  held?: number;
  refused?: number;
  reads?: number;
  /** The read (the duplicate policy, 2026-10-10): the files read as their scan's own, the copies of a scan another dataset read first or this one holds already, the files held because their scan is filed under another subject, visit or series, those a person let go out of the read, and those gone from the folder. */
  new?: number;
  known?: number;
  twice?: number;
  same_instance?: number;
  left_out?: number;
  gone?: number;
  scans?: number;
  of?: number;
  look?: number;
  unsorted?: number;
  picked?: number;
  borders?: number;
  made?: number;
  in_sort?: boolean;
  /** Body part and post-contrast: the run over the scans, whether a model is served for it, the scans its model answered, and the jobs of its runs over them. */
  run?: number | null;
  served?: boolean;
  answered?: number;
  jobs?: number[];
  /** Body part and post-contrast: why a run of it would be refused now, none where its door would start one. */
  refusal?: StepRefusal | null;
}

/** What a dataset holds and where it is (`GET /api/datasets/{name}/summary`). */
export interface DatasetSummary {
  dataset: string;
  dataset_id: number;
  detail: string;
  state: string;
  added_at: string;
  subjects: number;
  /** The visits, out of the session cache; null where nobody has built it. */
  sessions: number | null;
  studies: number;
  scans: number;
  sure: number;
  need_a_look: number;
  unsorted: number;
  look_kinds: Record<string, number>;
  kinds: { kind: string; scans: number }[];
  body_regions: { region: string; scans: number }[];
  files: {
    found: number | null;
    bytes: number | null;
    read: number;
    refused: number;
    refused_batch: number | null;
    held: number;
    new?: number;
    known?: number;
    twice?: number;
    same_instance?: number;
    left_out?: number;
    gone?: number;
  };
  /** The open questions about the dataset's files filed already under another subject, visit or series, which its Review lists. */
  identity_questions?: number;
  pictures_place: string | null;
  steps: SummaryStep[];
}

export const summaries = {
  read: (name: string) => door<DatasetSummary>("GET", `/api/datasets/${encodeURIComponent(name)}/summary`),
};

/** Whether the summary is read here: Data reading, and the door served. */
export function maySummarise(caps: Capabilities): boolean {
  return may(caps, "data:see") && served(caps, SUMMARY_DOOR);
}

const n = (v: number) => v.toLocaleString("en-US");

/** The one tone of each state word of a dataset. */
export const TONE: Record<string, string> = { Unknown: "tag caution", Anonymised: "tag caution", Identified: "tag gated", Ready: "tag ok" };

// ---------------------------------------------------------------- the rail of a card

/** A segment of a card's six-step bar. */
export type Segment = "done" | "run" | "wait";

/** The six steps a card shows, in order: the pseudonymisation is the detail's alone. */
export const CARD_STEPS: StepName[] = ["found", "read", "sorted", "main_scans", "pictures", "views"];

function segmentOf(state: StepState | undefined): Segment {
  if (state === "done") return "done";
  if (state === "running" || state === "queued") return "run";
  return "wait";
}

/**
 * A card's six segments: from the summary where it was read, else what the
 * sources door already says (found, read and sorted), the rest waiting.
 */
export function railOf(d: Dataset, s: DatasetSummary | null): Segment[] {
  if (s) return CARD_STEPS.map((name) => segmentOf(s.steps.find((x) => x.step === name)?.state));
  const unknown = stateOf(d) === "unknown" || d.arrives === "undeclared";
  const files = d.trees?.anon?.files ?? d.trees?.originals?.files ?? 0;
  const reading = d.digests.recent.some((b) => b.state === "running");
  const found: Segment = !unknown && (files ?? 0) > 0 ? "done" : d.digests.count > 0 ? "done" : "wait";
  const read: Segment = reading ? "run" : d.digests.count > 0 ? "done" : "wait";
  const t = d.totals;
  const sorted: Segment = t.stacks > 0 && (t.unsorted ?? 0) === 0 && d.digests.recent.some((b) => (b.classified ?? 0) > 0) ? "done" : "wait";
  return [found, read, sorted, "wait", "wait", "wait"];
}

/**
 * The steps of an engine that has no summary door, from what the sources door
 * says: found, read and sorted with their counts, the rest waiting.
 */
export function stepsOfSources(d: Dataset): SummaryStep[] {
  const rail = railOf(d, null);
  const state = (seg: Segment): StepState => (seg === "done" ? "done" : seg === "run" ? "running" : "waiting");
  const last = d.digests.recent[0] ?? null;
  const at = { job: null, started_at: last?.started_at ?? null, finished_at: last?.finished_at ?? null, progress: null };
  const none = { job: null, started_at: null, finished_at: null, progress: null };
  return [
    { step: "found", state: state(rail[0]), ...none, files: d.trees?.originals?.files ?? d.trees?.anon?.files ?? null },
    { step: "read", state: state(rail[1]), ...at, files: last?.files.seen ?? 0, refused: d.totals.refused_files, reads: d.digests.count },
    { step: "sorted", state: state(rail[2]), ...none, scans: d.totals.stacks - (d.totals.unsorted ?? 0), of: d.totals.stacks, look: d.totals.to_sort, unsorted: d.totals.unsorted ?? 0 },
    { step: "main_scans", state: "waiting", ...none, picked: 0, borders: 0 },
    { step: "pictures", state: "waiting", ...none, made: 0, of: d.totals.stacks },
    { step: "views", state: "waiting", ...none, made: 0, of: d.totals.stacks },
  ];
}

/** A dataset's step by name, where the summary has it. */
export function stepOf(s: DatasetSummary | null, name: StepName): SummaryStep | null {
  return s?.steps.find((x) => x.step === name) ?? null;
}

/** The steps a detail shows, in order: the pseudonymisation only where the dataset has originals. */
export function railSteps(s: DatasetSummary): SummaryStep[] {
  const order: StepName[] = ["found", "pseudonymised", "read", "sorted", "body_part", "post_contrast", "main_scans", "pictures", "views"];
  return order.map((name) => stepOf(s, name)).filter((x): x is SummaryStep => x !== null);
}

/**
 * A cohort's rail: its members' scans sorted, body part and post-contrast as
 * its document says them, then the main scans of its members as the picks
 * summary counts them; nothing from an engine whose cohort has no steps.
 */
export function cohortRail(steps: SummaryStep[] | null | undefined, lines: { picked: number; borders: number }[] | null): SummaryStep[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const order: StepName[] = ["sorted", "body_part", "post_contrast"];
  const out = order.map((name) => steps.find((x) => x.step === name) ?? null).filter((x): x is SummaryStep => x !== null);
  if (lines) {
    const picked = lines.reduce((a, l) => a + l.picked, 0);
    const borders = lines.reduce((a, l) => a + l.borders, 0);
    out.push({ step: "main_scans", state: picked > 0 || borders > 0 ? "done" : "waiting", job: null, started_at: null, finished_at: null, progress: null, picked, borders });
  }
  return out;
}

/** The operation whose run a job is, from the summary's steps: the run it names, or one of the jobs of its runs. */
export function operationOf(s: Pick<DatasetSummary, "steps"> | null, job: number | null | undefined): Operation | null {
  if (!s || job === null || job === undefined) return null;
  for (const op of OPERATIONS) {
    const st = s.steps.find((x) => x.step === op);
    if (st && (st.job === job || (st.jobs ?? []).includes(job))) return op;
  }
  return null;
}

// ---------------------------------------------------------------- times

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** When, as the page writes it: the time today, else the month and the day ("oct 09"), and the year where it is not this one; the same in every browser. */
export function clock(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  if (t.toDateString() === now.toDateString()) return t.toTimeString().slice(0, 5);
  const day = `${MONTHS[t.getMonth()]} ${String(t.getDate()).padStart(2, "0")}`;
  return t.getFullYear() === now.getFullYear() ? day : `${day} ${t.getFullYear()}`;
}

/** How long something took, briefly: "4 s", "3 min", "1.5 h"; nothing where it cannot be told. */
export function took(started: string | null | undefined, finished: string | null | undefined): string {
  if (!started || !finished) return "";
  const s = (Date.parse(finished) - Date.parse(started)) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** How far a running job is from its progress record: done of how many, and about how long it has left. */
export function runningOf(
  progress: Record<string, unknown> | null | undefined,
  started: string | null | undefined,
  now: number,
): { done: number | null; of: number | null; fraction: number | null; left: string | null } {
  const p = progress ?? {};
  // a model's run counts its units over, of all of them
  const done = num(p["done"]) ?? num(p["written"]) ?? num(p["ingested"]) ?? num(p["seen"]) ?? num(p["files"]) ?? num(p["over"]);
  const of = num(p["total"]) ?? num(p["of"]) ?? num(p["expected"]) ?? num(p["units"]);
  const elapsed = num(p["elapsed_s"]) ?? (started ? Math.max(0, (now - Date.parse(started)) / 1000) : null);
  let left: string | null = null;
  if (done !== null && of !== null && done > 0 && of > done && elapsed !== null && elapsed > 0) {
    const secs = (of - done) / (done / elapsed);
    left = secs < 60 ? "under a minute left" : secs < 3600 ? `about ${Math.round(secs / 60)} min left` : `about ${(secs / 3600).toFixed(1)} hours left`;
  }
  return { done, of, fraction: done !== null && of !== null && of > 0 ? Math.min(1, done / of) : null, left };
}

// ---------------------------------------------------------------- a step in words

export interface StepWords {
  title: string;
  what: string;
  when: string;
  /** The step runs now: its "when" is said in the brand's colour. */
  now: boolean;
  /** Why a step is not available, for the step's title. */
  hint?: string;
}

const TITLE: Record<StepName, string> = {
  found: "Found",
  pseudonymised: "Pseudonymised",
  read: "Read",
  sorted: "Sorted",
  body_part: "Body part",
  post_contrast: "Post-contrast",
  main_scans: "Main scans",
  pictures: "Pictures",
  views: "3D views",
};

/** A step of the detail's rail in three short lines: its name, what it did, and when. */
export function stepWords(s: SummaryStep, now = new Date()): StepWords {
  const title = TITLE[s.step];
  const running = s.state === "running";
  const queued = s.state === "queued";
  const at = clock(s.finished_at ?? s.started_at, now);
  const span = took(s.started_at, s.finished_at);
  let when = [at, span].filter(Boolean).join(" · ");
  if (running) {
    const r = runningOf(s.progress, s.started_at, now.getTime());
    when = ["now", r.left].filter(Boolean).join(" · ");
  } else if (queued) when = "next";
  const v = (k: keyof SummaryStep) => (typeof s[k] === "number" ? (s[k] as number) : 0);
  let what = "";
  let hint: string | undefined;
  switch (s.step) {
    case "found":
      what = typeof s.files === "number" ? `${n(s.files)} ${s.files === 1 ? "file" : "files"}` : "not counted yet";
      // an identified dataset's originals carry who each file is about
      if (s.tree === "originals" && typeof s.files === "number") what += ", with names";
      break;
    case "pseudonymised":
      what = v("waiting") > 0 ? `${n(v("waiting"))} to do` : `${n(v("files"))} files`;
      if (v("held") > 0) what += ` · ${n(v("held"))} held`;
      break;
    case "read":
      what = s.state === "waiting" && v("reads") === 0 ? "not yet" : `${n(v("files"))} read`;
      if (v("same_instance") > 0) what += ` · ${n(v("same_instance"))} held`;
      if (v("refused") > 0) what += ` · ${n(v("refused"))} not images`;
      hint = readWords(s) ?? undefined;
      break;
    case "sorted":
      what = v("of") === 0 ? (s.state === "waiting" ? "not yet" : "nothing to sort") : `${n(v("scans"))} scans`;
      if (v("look") > 0) what += ` · ${n(v("look"))} to look at`;
      if (v("unsorted") > 0) what += ` · ${n(v("unsorted"))} not sorted`;
      break;
    case "body_part":
    case "post_contrast":
      if (s.state === "off") {
        what = "not available";
        hint =
          s.step === "body_part"
            ? "No body-part model is served here yet."
            : "Neither the post-contrast label nor a post-contrast model is served here yet.";
      } else if (running) {
        const r = runningOf(s.progress, s.started_at, now.getTime());
        what = r.done !== null && r.of !== null ? `${n(r.done)} of ${n(r.of)}` : "running";
      } else if (queued) what = "waits its turn";
      else if (s.state === "failed") what = "failed";
      else if (s.state === "waiting") what = "not run yet";
      else what = v("answered") === 0 ? "none answered" : v("answered") >= v("of") ? `${n(v("answered"))} answered` : `${n(v("answered"))} of ${n(v("of"))} answered`;
      if (v("look") > 0) what += ` · ${n(v("look"))} to look at`;
      break;
    case "main_scans":
      what = s.state === "off" ? "off" : v("picked") === 0 && v("borders") === 0 ? "none yet" : `${n(v("picked"))} picked`;
      if (s.state !== "off" && v("borders") > 0) what += ` · ${n(v("borders"))} borders`;
      break;
    case "pictures":
    case "views":
      if (s.state === "off") what = "no place for them";
      else if (running) {
        const r = runningOf(s.progress, s.started_at, now.getTime());
        what = r.done !== null && r.of !== null ? `${n(r.done)} of ${n(r.of)}` : `${n(v("made"))} of ${n(v("of"))}`;
      } else what = v("made") === 0 ? "none yet" : v("made") >= v("of") ? `${n(v("made"))} made` : `${n(v("made"))} of ${n(v("of"))}`;
      if (s.step === "pictures" && s.in_sort && !running && s.state === "done") when = [at, "in the sort"].filter(Boolean).join(" · ");
      break;
  }
  // a step that waits has no time worth saying
  if (s.state === "waiting" || s.state === "off") when = "";
  return { title, what, when, now: running, ...(hint ? { hint } : {}) };
}

// ---------------------------------------------------------------- a card in words

/**
 * What a dataset's reading found, in plain words, for the read step's hint
 * (the duplicate policy, 2026-10-10): new, already in another dataset,
 * twice in this dataset, held because the scan is filed under another
 * subject, visit or series, let go out of the read by a person, gone from
 * the folder, and not images. Null where the engine gives none of these.
 */
export function readWords(s: Pick<SummaryStep, "new" | "known" | "twice" | "same_instance" | "left_out" | "gone" | "refused">): string | null {
  const parts: string[] = [];
  const add = (v: number | undefined, words: string) => {
    if (typeof v === "number" && v > 0) parts.push(`${n(v)} ${words}`);
  };
  if (typeof s.known !== "number" && typeof s.twice !== "number" && typeof s.same_instance !== "number") return null;
  add(s.new, "new");
  add(s.known, "already in another dataset");
  add(s.twice, "twice in this dataset");
  add(s.same_instance, "held: the scan is filed under another subject, visit or series");
  add(s.left_out, "left out of the read by a person");
  add(s.gone, "gone from the folder");
  add(s.refused, "not images");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** How many files a dataset's card counts: the ones found in the tree NILS reads, or the originals of an identified dataset; null where none were counted. */
export function filesOf(d: Pick<Dataset, "trees">, s: DatasetSummary | null): number | null {
  if (s && typeof s.files.found === "number") return s.files.found;
  const originals = d.trees?.originals?.files;
  if (typeof originals === "number") return originals;
  const anon = d.trees?.anon?.files;
  return typeof anon === "number" ? anon : null;
}

/** A card's one line under its numbers: how sure the sort is, or what the dataset still needs. */
export function cardLine(d: Dataset, next: NextStep, s: DatasetSummary | null): string {
  if (next.word === "Unknown") return "Loose files: choose where they go";
  if (next.step === "set-ids") return "Needs its IDs before it is read";
  if (next.word === "Identified" && next.step === "pseudonymise") {
    const held = d.held?.identifiers ?? 0;
    return held > 0 ? `${n(held)} ${held === 1 ? "ID needs" : "IDs need"} a code` : "Waits to be pseudonymised";
  }
  const running = s?.steps.find((x) => x.state === "running");
  if (running) return `${TITLE[running.step]}: running now`;
  if (d.digests.count === 0) return "Not read yet";
  const sure = s ? s.sure : (d.totals.sure ?? d.totals.stacks - d.totals.to_sort);
  const look = s ? s.need_a_look : d.totals.to_sort;
  const unsorted = s ? s.unsorted : (d.totals.unsorted ?? 0);
  const scans = s ? s.scans : d.totals.stacks;
  if (scans === 0) return "No scans found";
  if (sure === 0 && look === 0) return "Not sorted yet";
  const parts = [`${n(sure)} sure`];
  if (look > 0) parts.push(`${n(look)} need a look`);
  if (unsorted > 0) parts.push(`${n(unsorted)} not sorted`);
  return parts.join(" · ");
}

/** What PatientID holds and how subjects are found, briefly, for the detail's line. */
export function idsWords(d: Pick<Dataset, "patient_id" | "subjects">): string | null {
  const pid = d.patient_id;
  if (!pid) return null;
  const holds = pid === "subject-code" ? "PatientID holds the subject code" : pid.startsWith("id-type:") ? `PatientID holds the ${pid.slice("id-type:".length)}` : `PatientID holds ${pid}`;
  if (pid === "subject-code" || !d.subjects) return holds;
  return `${holds}, codes ${d.subjects === "map" ? "from a map" : "made from it"}`;
}

/** What an identified dataset's originals carry in PatientID, as the rule they are read under says it; nothing where no rule says. */
export function originalIdWords(d: Pick<Dataset, "identity" | "trees">): string | null {
  const t = d.trees?.originals ? d.identity?.id_type : undefined;
  if (!t) return null;
  return `PatientID holds a ${t}`;
}

/** What a dataset's structure says, wherever the door put it: at the top, or in its `dataset`. */
export function stateOf(d: Pick<Dataset, "state"> & { dataset?: unknown }): string | undefined {
  const st = declared(d as Parameters<typeof declared>[0]).state;
  return typeof st === "string" ? st : undefined;
}

/** The root a dataset was found under, wherever the door put it. */
export function rootOf(d: Pick<Dataset, "root"> & { dataset?: unknown }): string | null {
  const r = declared(d as Parameters<typeof declared>[0]).root;
  return typeof r === "string" && r !== "" ? r : null;
}

/** A dataset's structure in a word. */
export function stateWord(state: string | undefined): string {
  if (state === "anonymised") return "anonymised";
  if (state === "identified") return "identified";
  if (state === "both") return "identified and anonymised";
  return "loose files";
}

/** Where a dataset's folder is, as a person knows it: its root and its folder. */
export function whereWords(d: Pick<Dataset, "root" | "path" | "name"> & { dataset?: unknown }): string {
  const parts = d.path.replace(/\/+$/u, "").split("/");
  const folder = parts[parts.length - 1] || d.name;
  const root = rootOf(d);
  if (root) return `${root}/${folder}`;
  return parts.slice(-2).join("/");
}

// ---------------------------------------------------------------- cohorts on the page

/** A part of a cohort's members: what brought them, with the count, as the engine answers it. */
export interface Part {
  from: "dataset" | "query" | "hand" | "import";
  dataset: string | null;
  subjects: number;
}

/** A dataset holding scans of a cohort's members. */
export interface Holding {
  name: string;
  subjects: number;
  scans: number;
  feeds: boolean;
}

/** The colour slot of a part: each dataset its own, by its place among the datasets, and one each for a query, a hand and an import. */
export function slotOf(part: { from: Part["from"]; dataset: string | null }, datasets: readonly string[]): number {
  if (part.from === "query") return 7;
  if (part.from === "hand") return 10;
  if (part.from === "import") return 9;
  const at = part.dataset ? datasets.indexOf(part.dataset) : -1;
  const SLOTS = [1, 3, 6, 2, 5, 8, 4];
  return SLOTS[(at < 0 ? datasets.length : at) % SLOTS.length];
}

/** A part's label on a cohort's card. */
export function partLabel(p: Part): string {
  if (p.from === "dataset") return p.dataset ?? "a dataset";
  if (p.from === "query") return "a query";
  if (p.from === "hand") return "by hand";
  return "an import";
}

/** How a cohort came to be, in a few words for its tag. */
export function originWords(c: Pick<Cohort, "from" | "feeds">): string {
  switch (c.from.kind) {
    case "source": {
      const feeds = c.feeds.length > 0 ? c.feeds : [];
      if (feeds.length > 1) return `fed by ${feeds.length} datasets`;
      const detail = c.from.detail && typeof c.from.detail === "object" ? (c.from.detail as { dataset?: string | null; place?: string }) : {};
      const name = feeds[0] ?? detail.dataset ?? detail.place ?? null;
      return name ? `fed by ${name}` : "fed by a dataset";
    }
    case "promotion":
      return "from a query";
    case "manual":
      return "by hand";
    case "import":
      return "from an import";
  }
}

/** The tag on a cohort's detail: fed by every dataset it names. */
export function fedWords(c: Pick<Cohort, "from" | "feeds">): string {
  if (c.from.kind === "source" && c.feeds.length > 1) return `fed by ${c.feeds.slice(0, -1).join(", ")} and ${c.feeds[c.feeds.length - 1]}`;
  return originWords(c);
}

/** How a dataset and a cohort relate, as the other's card says it once one is chosen. */
export interface Relation {
  related: boolean;
  words: string;
}

/** A dataset's card, while a cohort is chosen. */
export function datasetRelation(dataset: string, c: Pick<Cohort, "feeds"> & { datasets?: Holding[] }): Relation {
  const held = (c.datasets ?? []).find((h) => h.name === dataset);
  const subjects = held?.subjects ?? 0;
  const of = `${n(subjects)} of its subjects`;
  if (c.feeds.includes(dataset)) return { related: true, words: subjects > 0 ? `feeds it · ${of}` : "feeds it · none yet" };
  if (subjects > 0) return { related: true, words: `holds ${of}` };
  return { related: false, words: "holds none of its subjects" };
}

/** A cohort's card, while a dataset is chosen. */
export function cohortRelation(dataset: string, c: Pick<Cohort, "feeds"> & { datasets?: Holding[] }): Relation {
  const held = (c.datasets ?? []).find((h) => h.name === dataset);
  const subjects = held?.subjects ?? 0;
  if (subjects > 0) return { related: true, words: `${n(subjects)} of its subjects come from ${dataset}` };
  if (c.feeds.includes(dataset)) return { related: true, words: `fed by ${dataset} · none yet` };
  return { related: false, words: `none of its subjects are in ${dataset}` };
}

/** The datasets a dataset's card says it feeds, from the cohorts that name it. */
export function feedsWords(dataset: string, cohort: string | null | undefined, cohorts: readonly Pick<Cohort, "name" | "feeds">[]): string {
  const names = new Set<string>();
  if (cohort) names.add(cohort);
  for (const c of cohorts) if (c.feeds.includes(dataset)) names.add(c.name);
  return names.size === 0 ? "" : `feeds ${[...names].join(", ")}`;
}

/** A cohort's card's last line: what waits on Review and its releases. */
export function cohortLine(c: Pick<Cohort, "waiting" | "releases" | "subjects">): string {
  const parts: string[] = [];
  if (c.waiting > 0) parts.push(`${n(c.waiting)} wait on Review`);
  parts.push(c.releases === 0 ? "no release yet" : `${n(c.releases)} ${c.releases === 1 ? "release" : "releases"}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------- how a cohort grew

export interface GrowthEvent {
  when: string;
  title: string;
  what: string;
  kind: "join" | "leave" | "release";
  /** Where it sits on the line, from 0 to 100. */
  left: number;
}

/** A join's words: how many joined or left, and what brought them. */
export function joinTitle(j: Join): { title: string; what: string; kind: "join" | "leave" } {
  if (j.what === "remove") return { title: `${n(j.subjects)} left`, what: j.by ? `by ${j.by}` : "", kind: "leave" };
  const what = j.what === "digest" ? (j.dataset ? `from ${j.dataset}` : "from a read") : j.what === "promotion" ? "from a query" : j.what === "manual" ? "by hand" : "from an import";
  return { title: `${n(j.subjects)} joined`, what, kind: "join" };
}

/**
 * The events of a cohort's line, oldest first, placed by their time and
 * spread so that no two sit closer than `gap` (in hundredths of the line):
 * the joins and the releases, the newest `most` of them.
 */
export function growth(joins: readonly Join[], releases: readonly CohortRelease[], most = 6, gap = 15): GrowthEvent[] {
  const events: Omit<GrowthEvent, "left">[] = [];
  for (const j of joins) {
    const w = joinTitle(j);
    events.push({ when: j.when, title: w.title, what: w.what, kind: w.kind });
  }
  const dated = releases.filter((r) => typeof r.finished_at === "string" || typeof r.started_at === "string");
  const ordered = [...dated].sort((a, b) => Date.parse(String(a.finished_at ?? a.started_at)) - Date.parse(String(b.finished_at ?? b.started_at)));
  ordered.forEach((r, i) => {
    const parts = [r.layout ? r.layout.toUpperCase() : null, typeof r.subjects === "number" ? `${n(r.subjects)} subjects` : null].filter(Boolean);
    events.push({ when: String(r.finished_at ?? r.started_at), title: `Release ${i + 1}`, what: parts.join(" · "), kind: "release" });
  });
  const shown = events
    .filter((e) => Number.isFinite(Date.parse(e.when)))
    .sort((a, b) => Date.parse(a.when) - Date.parse(b.when))
    .slice(-most);
  if (shown.length === 0) return [];
  const first = Date.parse(shown[0].when);
  const last = Date.parse(shown[shown.length - 1].when);
  const room = 100 - gap;
  const placed = shown.map((e) => ({ ...e, left: last > first ? ((Date.parse(e.when) - first) / (last - first)) * room : 0 }));
  // no two closer than the gap: pushed right, then pulled back from the end
  for (let i = 1; i < placed.length; i++) placed[i].left = Math.max(placed[i].left, placed[i - 1].left + gap);
  const over = placed[placed.length - 1].left - room;
  if (over > 0) {
    placed[placed.length - 1].left = room;
    for (let i = placed.length - 2; i >= 0; i--) placed[i].left = Math.min(placed[i].left, placed[i + 1].left - gap);
    const under = -placed[0].left;
    if (under > 0) {
      // too many for the line: evenly, end to end
      const step = placed.length > 1 ? room / (placed.length - 1) : 0;
      placed.forEach((p, i) => (p.left = i * step));
    }
  }
  return placed.map((p) => ({ ...p, left: Math.round(p.left * 10) / 10 }));
}

// ---------------------------------------------------------------- a log line

/** A job of a dataset as a line of its log: when, what it did, and how it went. */
export interface LogLine {
  id: number | null;
  at: string;
  what: string;
  how: string;
  failed: boolean;
  /** The read's batch, for the line's link. */
  batch: number | null;
}

const ns = (v: unknown, one: string, many: string) => {
  const k = num(v) ?? 0;
  return `${n(k)} ${k === 1 ? one : many}`;
};

/** What a model's run is called, by its operation where the summary names it. */
function runTitle(op: Operation | null | undefined): string {
  return op === "body_part" ? "Body part" : op === "post_contrast" ? "Post-contrast" : "Model run";
}

/** A finished job of the dataset in a person's words: "Read · 1,420 files, 12 new subjects"; a model's run by its operation, where `op` names it. */
export function logLine(j: JobRow, now = new Date(), op?: Operation | null): LogLine {
  const p = (j.progress ?? {}) as Record<string, unknown>;
  const r = (j.result ?? {}) as Record<string, unknown>;
  const failed = j.state === "failed";
  const stopped = j.state === "cancelled";
  const at = clock(j.finished_at ?? j.started_at, now);
  const batch = num(p["batch_id"]);
  const verb = (j.kind || "").toLowerCase();
  const end = (done: string, word: string) => (failed ? `${word} failed` : stopped ? `${word} stopped` : done);
  switch (verb) {
    case "digest":
    case "ingest": {
      const fresh = (num(p["ingested"]) ?? 0) + (num(p["changed"]) ?? 0);
      const parts = fresh > 0 ? [ns(fresh, "file", "files")] : ["nothing new"];
      if ((num(p["subjects_created"]) ?? 0) > 0) parts.push(`${ns(p["subjects_created"], "new subject", "new subjects")}`);
      return { id: j.id, at, what: end("Read", "Read"), how: failed || stopped ? "" : parts.join(", "), failed, batch };
    }
    case "pseudonymize": {
      const files = (r["files"] ?? {}) as Record<string, unknown>;
      return { id: j.id, at, what: end("Pseudonymised", "Pseudonymisation"), how: failed || stopped ? "" : ns(files["written"], "file", "files"), failed, batch: null };
    }
    case "fingerprint":
      return { id: j.id, at, what: end("Prepared to sort", "Preparing"), how: "", failed, batch: null };
    case "classify": {
      const pv = (r["previews"] ?? {}) as Record<string, unknown>;
      const stacks = num(pv["stacks"]);
      return { id: j.id, at, what: end("Sorted", "Sort"), how: failed || stopped || stacks === null ? "" : `${ns(stacks, "scan", "scans")}, pictures made`, failed, batch: null };
    }
    case "pick":
      return { id: j.id, at, what: end("Main scans picked", "Picking"), how: failed || stopped ? "" : `for ${ns(r["subjects"], "subject", "subjects")}`, failed, batch: null };
    case "pyramid": {
      const built = num(r["built"]) ?? num(p["built"]) ?? 0;
      const skipped = num(r["skipped"]) ?? num(p["skipped"]) ?? 0;
      const fail = num(r["failed"]) ?? num(p["failed"]) ?? 0;
      const how = [built > 0 ? `${n(built)} made` : null, skipped > 0 && built === 0 ? "all made before" : null, fail > 0 ? `${n(fail)} could not be` : null].filter(Boolean).join(", ");
      return { id: j.id, at, what: end("3D views", "3D views"), how: failed || stopped ? "" : how, failed, batch: null };
    }
    case "preview":
      return { id: j.id, at, what: end("Pictures made", "Pictures"), how: "", failed, batch: null };
    case "originals":
      return { id: j.id, at, what: end("Originals", "Originals"), how: "", failed, batch: null };
    case "pipeline":
      return { id: j.id, at, what: end(runTitle(op), runTitle(op)), how: "", failed, batch: null };
    default:
      return { id: j.id, at, what: end(verb, verb), how: "", failed, batch: null };
  }
}

/** What a running job of a dataset is doing, in its log's box; a model's run by its operation, where `op` names it. */
export function doingTitle(j: Pick<JobRow, "kind" | "state">, op?: Operation | null): string {
  const verb = (j.kind || "").toLowerCase();
  const doing: Record<string, string> = {
    digest: "Reading",
    ingest: "Reading",
    pseudonymize: "Pseudonymising",
    fingerprint: "Preparing to sort",
    classify: "Sorting and making pictures",
    pick: "Picking main scans",
    pyramid: "Preparing 3D views",
    preview: "Preparing pictures",
    originals: "Acting on the originals",
    pipeline: op === "body_part" ? "Finding the body part" : op === "post_contrast" ? "Finding post-contrast scans" : "Running a model",
  };
  const w = doing[verb] ?? `Running ${verb}`;
  if (j.state === "queued") return `${w}: next`;
  if (j.state === "cancelling") return `${w}: stopping`;
  return w;
}

/** The unit a running job counts in. */
export function unitOf(kind: string): string {
  return kind === "pyramid" || kind === "preview" || kind === "classify" || kind === "pipeline" ? "scans" : "files";
}

/** The words under a running job's bar: "57 of 1,001 scans · about 11 min left · in the background". */
export function runningWords(j: Pick<JobRow, "kind" | "progress" | "started_at" | "state">, now: number): { fraction: number | null; words: string } {
  const r = runningOf(j.progress as Record<string, unknown> | null, j.started_at, now);
  const parts: string[] = [];
  if (r.done !== null) parts.push(r.of !== null ? `${n(r.done)} of ${n(r.of)} ${unitOf(j.kind)}` : `${n(r.done)} ${unitOf(j.kind)}`);
  if (r.left) parts.push(r.left);
  if (j.kind === "pyramid" || j.kind === "preview") parts.push("in the background");
  if (j.state === "queued") parts.push("waits its turn");
  return { fraction: r.fraction, words: parts.join(" · ") };
}

// ---------------------------------------------------------------- the main scans of a cohort's members

/** A role as a person reads it: "T1w", "FLAIR", "T2w". */
export function roleWord(role: string): string {
  const known: Record<string, string> = { t1w: "T1w", t2w: "T2w", flair: "FLAIR", dwi: "DWI", swi: "SWI", pdw: "PDw" };
  return known[role.toLowerCase()] ?? role;
}

/** The order roles are shown in: the usual ones first. */
export function roleOrder(a: string, b: string): number {
  const order = ["t1w", "flair", "t2w", "dwi", "swi"];
  const ia = order.indexOf(a.toLowerCase());
  const ib = order.indexOf(b.toLowerCase());
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
}
