// SPDX-License-Identifier: AGPL-3.0-only
// The batch page's stage strip (Wave 5 section 8.1): walked, digested,
// classified, reviewed, with counts under each and the jobs that did each
// stage, from the batch row, its report, the jobs and the open review items.

import type { JobRow } from "../ask/client";
import type { Batch, ReviewItem } from "../ops/client";

export type StageName = "walked" | "digested" | "classified" | "reviewed";

export interface Stage {
  name: StageName;
  /** The count the stage produced, when known. */
  count: number | null;
  words: string;
  /** The jobs that did this stage, newest first. */
  jobs: JobRow[];
  state: "done" | "running" | "failed" | "pending" | "unknown";
}

const VERB: Record<StageName, string[]> = { walked: ["digest", "ingest", "walk", "synth"], digested: ["digest", "ingest", "synth"], classified: ["classify", "fingerprint"], reviewed: [] };

/** The jobs that touched a batch: named for it, or carrying its id in their arguments. */
export function jobsOfBatch(batch: Batch, jobs: JobRow[]): JobRow[] {
  const id = String(batch.id);
  return jobs.filter((j) => {
    const argv = (j.args?.argv as string[] | undefined) ?? [];
    const named = j.name !== null && (j.name === batch.name || j.name.includes(`batch ${id}`) || j.name.includes(`batch:${id}`));
    const inArgs = argv.some((a, i) => (a === "--batch" && argv[i + 1] === id) || a === `batch:${id}` || a === `--batch=${id}`);
    return named || inArgs || (batch.finished_at !== null && j.started_at >= batch.started_at && j.kind === "synth" && batch.name === "synthetic");
  });
}

function stateOf(jobs: JobRow[], fallback: Stage["state"]): Stage["state"] {
  if (jobs.some((j) => j.state === "running" || j.state === "queued" || j.state === "cancelling")) return "running";
  if (jobs.length > 0 && jobs.every((j) => j.state === "failed" || j.state === "cancelled")) return "failed";
  if (jobs.some((j) => j.state === "done")) return "done";
  return fallback;
}

/** The four stages of one batch. */
export function stages(batch: Batch, jobs: JobRow[], review: ReviewItem[]): Stage[] {
  const mine = jobsOfBatch(batch, jobs).sort((a, b) => b.id - a.id);
  const by = (name: StageName) => mine.filter((j) => VERB[name].includes(j.kind));
  const report = (batch.report ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => (typeof report[k] === "number" ? (report[k] as number) : null);
  const classified = num("classified") ?? num("stacks") ?? null;
  const open = review.filter((i) => i.status === "open").length;
  const decided = review.filter((i) => i.status !== "open").length;
  const walkedState: Stage["state"] = batch.state === "done" ? "done" : batch.state === "running" ? "running" : batch.state === "failed" ? "failed" : "unknown";
  return [
    { name: "walked", count: batch.seen, words: batch.seen !== null ? `${batch.seen} files seen` : "files seen unknown", jobs: by("walked"), state: walkedState },
    { name: "digested", count: batch.ingested ?? batch.parsed, words: batch.ingested !== null ? `${batch.ingested} ingested${batch.quarantined ? `, ${batch.quarantined} quarantined` : ""}` : batch.parsed !== null ? `${batch.parsed} parsed` : "not digested", jobs: by("digested"), state: batch.ingested !== null || batch.parsed !== null ? walkedState : stateOf(by("digested"), "pending") },
    { name: "classified", count: classified, words: classified !== null ? `${classified} stacks classified` : "not classified", jobs: by("classified"), state: stateOf(by("classified"), classified !== null ? "done" : "pending") },
    { name: "reviewed", count: review.length, words: review.length === 0 ? "nothing to review" : `${open} open, ${decided} decided`, jobs: [], state: review.length === 0 ? "unknown" : open === 0 ? "done" : "pending" },
  ];
}

/** The quarantine list by reason: the class column counted. */
export function byReason(files: Record<string, unknown>[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const r = String(f.class ?? f.reason ?? "unknown");
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}
