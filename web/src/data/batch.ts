// SPDX-License-Identifier: AGPL-3.0-only
// A batch, the thread of the Data page: what its doors answer, and the words
// its page draws from them. `GET /api/batches/{id}` carries the five stages
// on an engine that reports them; `GET /api/timeline/batch/{id}` its events.
// Everything here is read through the desk's proxy; an engine without a door
// leaves the part of the page that reads it out.

import { door, type JobRow } from "../ask/client";
import type { Event } from "../objects/client";
import { ops, type Batch } from "../ops/client";
import type { Chain } from "./datasets";
import type { Source } from "./sources";
import { identityWords, type Dataset } from "./pseudonyms";

/** The five stages an engine reports on the batch row. */
export interface BatchStages {
  /** Null for a dataset whose files arrive without identifiers: no first step. */
  pseudonymised: { files: number; changed: number; held: number; refused: number; job: number | null } | null;
  walked: { files: number; new: number; changed: number; unchanged: number; refused: number; job: number | null };
  digested: { stacks: number; sessions: number; subjects: number; moved: number; job: number | null };
  classified: { stacks: number; of: number; unsure: number; pack: string | null; jobs: number[] };
  reviewed: { done: number; of: number; since: string | null };
}

export interface BatchDoc extends Batch {
  stages?: BatchStages | null;
  /** The dataset the batch read, when the engine names it on the row. */
  dataset?: string | null;
  place?: string | null;
  /** The jobs of the batch's thread by stage, where the engine names them on the row. */
  chain?: Chain | null;
  pyramid?: { offered: boolean; place: string; command: string[] } | null;
}

export const batches = {
  get: (id: number) => door<BatchDoc>("GET", `/api/batches/${id}`),
  timeline: (id: number) => door<{ kind: string; id: number | string; events: Event[] }>("GET", `/api/timeline/batch/${id}`),
  /** A digest of the dataset again; with `retry`, the files it refused are read again too. */
  readAgain: (dataset: Source, retry = false, chain = false) => {
    const command = chain && !retry ? ["bring-in", `@${dataset.name}`] : ["digest", `@${dataset.name}`, ...(retry ? ["--retry-quarantine"] : [])];
    return ops.enqueue(command, `${dataset.name}-${new Date().toISOString().slice(0, 10)}`);
  },
  /** Fingerprint, then classify with the pack: the two jobs that sort what a batch added. */
  sort: async (pack: string | null, chained: boolean) => {
    const classify = ["classify", ...(pack ? ["--pack", pack] : [])];
    if (chained) return ops.enqueue(["fingerprint"], undefined, [classify]);
    const first = await ops.enqueue(["fingerprint"]);
    await ops.enqueue(classify);
    return first;
  },
};

/** The dataset a batch belongs to: named on the row, listed among the source's digests, or the source the batch is named after. */
export function datasetOf(batch: BatchDoc, sources: Source[]): Dataset | null {
  const named = batch.dataset ?? batch.place ?? null;
  if (named) {
    const s = sources.find((x) => x.name === named);
    if (s) return s;
  }
  const listed = sources.find((s) => s.digests.recent.some((d) => d.id === batch.id));
  if (listed) return listed;
  const byName = sources.filter((s) => batch.name === s.name || batch.name.startsWith(`${s.name}-`)).sort((a, b) => b.name.length - a.name.length);
  return byName[0] ?? null;
}

/** How long a job took, in a person's units, or how long it has run. */
export function tookWords(job: Pick<JobRow, "started_at" | "finished_at">, now = Date.now()): string {
  const from = Date.parse(job.started_at);
  if (!Number.isFinite(from)) return "";
  const to = job.finished_at ? Date.parse(job.finished_at) : now;
  const s = Math.max(0, Math.round((to - from) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m - h * 60;
  return rest > 0 ? `${h} h ${rest} min` : `${h} h`;
}

/** "job 117", "jobs 119, 120". */
export function jobWords(ids: number[]): string {
  if (ids.length === 0) return "";
  const sorted = [...ids].sort((a, b) => a - b);
  return sorted.length === 1 ? `job ${sorted[0]}` : `jobs ${sorted.join(", ")}`;
}

/** The verb a job ran, as its command line reads: "digest @spring-scans", "classify --pack mri 0.1.1". */
export function verbWords(job: JobRow): string {
  const argv = (job.args?.argv as string[] | undefined) ?? [];
  if (argv.length === 0) return job.kind;
  return argv.join(" ");
}

export interface BaseRow {
  base: string;
  count: number;
  unsure: boolean;
}

/** What a batch added by base, when the engine counts it: on the classified stage, on the row, or in the report. */
export function addedByBase(batch: BatchDoc): BaseRow[] | null {
  const report = (batch.report ?? {}) as Record<string, unknown>;
  const classified = batch.stages?.classified as (BatchStages["classified"] & { by_base?: unknown }) | undefined;
  const found = [classified?.by_base, (batch as BatchDoc & { by_base?: unknown }).by_base, report.by_base, report.stacks_by_base].find((v) => v !== undefined && v !== null);
  if (!found) return null;
  const rows: BaseRow[] = [];
  if (Array.isArray(found)) {
    for (const r of found as { base?: unknown; key?: unknown; count?: unknown; stacks?: unknown }[]) {
      const base = typeof r.base === "string" ? r.base : typeof r.key === "string" ? r.key : null;
      const count = typeof r.count === "number" ? r.count : typeof r.stacks === "number" ? r.stacks : null;
      if (base !== null && count !== null) rows.push({ base, count, unsure: base === "unsure" });
    }
  } else if (typeof found === "object") {
    for (const [base, count] of Object.entries(found as Record<string, unknown>)) if (typeof count === "number") rows.push({ base, count, unsure: base === "unsure" });
  }
  const unsure = batch.stages?.classified?.unsure ?? 0;
  if (unsure > 0 && !rows.some((r) => r.unsure)) rows.push({ base: "unsure", count: unsure, unsure: true });
  return rows.sort((a, b) => (a.unsure === b.unsure ? b.count - a.count : a.unsure ? 1 : -1));
}

/** The lede of a batch's page: whose batch it is, when it came, what pseudonymised and read it, and the identity rule. */
export function ledeWords(batch: BatchDoc, dataset: Dataset | null, when: string): string {
  const s = batch.stages ?? null;
  const parts: string[] = [];
  if (s?.pseudonymised?.job !== null && s?.pseudonymised?.job !== undefined) parts.push(`pseudonymised by job ${s.pseudonymised.job}`);
  const read = s?.walked?.job ?? s?.digested?.job ?? null;
  if (read !== null) parts.push(`read by job ${read}`);
  const head = dataset ? `A batch of ${dataset.name}, brought in ${when}` : `A batch brought in ${when}`;
  const did = parts.length > 0 ? `: ${parts.join(", ")}.` : ".";
  const who = dataset ? ` Who each file is about: ${identityWords(dataset)}.` : "";
  return `${head}${did}${who}`;
}

/** How a timeline event is drawn: by what its kind says. */
export function eventMark(e: Event): "done" | "now" | "wait" | "failed" {
  const k = e.kind.toLowerCase();
  if (/fail|cancel|refus/.test(k)) return "failed";
  if (/wait|open|held|hold/.test(k)) return "wait";
  if (/start|running/.test(k) && !/finish|done/.test(k)) return "now";
  return "done";
}
