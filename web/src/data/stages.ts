// SPDX-License-Identifier: AGPL-3.0-only
// The batch page's stage strip: pseudonymised, walked, digested, classified,
// reviewed, with a count under each, a line of what the stage found and the
// job that did it. An engine that reports the batch's stages on the batch
// row gives all five; an older one gives four, read from the batch's own
// counts, its report, the jobs and the open review items.

import type { JobRow } from "../ask/client";
import type { Batch, ReviewItem } from "../ops/client";
import type { BatchDoc, BatchStages } from "./batch";
import { chainJobs } from "./datasets";

export type StageName = "pseudonymised" | "walked" | "digested" | "classified" | "reviewed";

/** How a stage is drawn: its top edge, as the digest marks are. */
export type StageMark = "done" | "now" | "wait" | "failed" | "none";

export interface Stage {
  name: StageName;
  /** The count the stage produced, when known. */
  count: number | null;
  /** What the count is of: files, stacks, or "of 12" for a stage that counts against a whole. */
  unit: string;
  /** What the stage found, as a line. */
  words: string;
  /** The jobs that did this stage, newest first. */
  jobs: number[];
  mark: StageMark;
  /** The reviewed stage says when it started waiting. */
  since?: string | null;
}

const n = (v: number) => v.toLocaleString("en-US");

const VERB: Record<StageName, string[]> = {
  pseudonymised: ["pseudonymize", "bring-in"],
  walked: ["digest", "ingest", "walk", "synth"],
  digested: ["digest", "ingest", "synth"],
  classified: ["classify", "fingerprint"],
  reviewed: [],
};

/**
 * The jobs that touched a batch: named on its stages or on its chain, named
 * for it, or carrying its id in their arguments. `thread` is the chain the
 * sources door gives for the same batch, where the page read it there.
 */
export function jobsOfBatch(batch: Batch & Partial<Pick<BatchDoc, "stages" | "chain">>, jobs: JobRow[], thread: number[] = []): JobRow[] {
  const id = String(batch.id);
  const onStages = new Set<number>([...stageJobIds(batch.stages ?? null), ...chainJobs(batch.chain), ...thread]);
  return jobs.filter((j) => {
    if (onStages.has(j.id)) return true;
    const argv = (j.args?.argv as string[] | undefined) ?? [];
    const named = j.name !== null && (j.name === batch.name || j.name.includes(`batch ${id}`) || j.name.includes(`batch:${id}`));
    const inArgs = argv.some((a, i) => (a === "--batch" && argv[i + 1] === id) || a === `batch:${id}` || a === `--batch=${id}`);
    return named || inArgs || (batch.finished_at !== null && j.started_at >= batch.started_at && j.kind === "synth" && batch.name === "synthetic");
  });
}

/** Every job id the batch's stages name. */
export function stageJobIds(s: BatchStages | null): number[] {
  if (!s) return [];
  const ids = [s.pseudonymised?.job ?? null, s.walked?.job ?? null, s.digested?.job ?? null, ...(s.classified?.jobs ?? [])];
  return ids.filter((x): x is number => typeof x === "number");
}

/** How a stage's jobs are going, from the job rows when the page has them. */
function markOfJobs(ids: number[], jobs: JobRow[], fallback: StageMark): StageMark {
  const mine = ids.map((id) => jobs.find((j) => j.id === id)).filter((j): j is JobRow => j !== undefined);
  if (mine.length === 0) return fallback;
  if (mine.some((j) => j.state === "running" || j.state === "cancelling")) return "now";
  if (mine.some((j) => j.state === "queued")) return "wait";
  if (mine.every((j) => j.state === "failed" || j.state === "cancelled")) return "failed";
  return "done";
}

function fromStages(s: BatchStages, jobs: JobRow[], batchState: string): Stage[] {
  const running = batchState === "running";
  const out: Stage[] = [];
  const p = s.pseudonymised;
  if (p) {
    const parts = [`${n(p.changed)} changed`, `${n(p.held)} held`];
    if (p.refused > 0) parts.push(`${n(p.refused)} refused`);
    out.push({ name: "pseudonymised", count: p.files, unit: "files", words: parts.join(" · "), jobs: p.job !== null ? [p.job] : [], mark: markOfJobs(p.job !== null ? [p.job] : [], jobs, "done") });
  } else {
    out.push({ name: "pseudonymised", count: null, unit: "", words: "not a step here: the files arrive without identifiers", jobs: [], mark: "none" });
  }
  const w = s.walked;
  const walkedWords = [`${n(w.new)} new`, `${n(w.changed)} changed`, `${n(w.unchanged)} unchanged`];
  if (w.refused > 0) walkedWords.push(`${n(w.refused)} refused`);
  const walkedJobs = w.job !== null ? [w.job] : [];
  out.push({ name: "walked", count: w.files, unit: "files", words: walkedWords.join(" · "), jobs: walkedJobs, mark: markOfJobs(walkedJobs, jobs, running ? "now" : batchState === "failed" ? "failed" : "done") });
  const d = s.digested;
  const digestedWords = [`${n(d.sessions)} sessions`, `${n(d.subjects)} subjects`];
  if (d.moved > 0) digestedWords.push(`${n(d.moved)} ${d.moved === 1 ? "session" : "sessions"} moved`);
  const digestedJobs = d.job !== null ? [d.job] : [];
  out.push({ name: "digested", count: d.stacks, unit: "stacks", words: digestedWords.join(" · "), jobs: digestedJobs, mark: markOfJobs(digestedJobs, jobs, running ? "now" : batchState === "failed" ? "failed" : "done") });
  const c = s.classified;
  const classifiedWords = [c.pack ? `by ${c.pack}` : "no pack yet"];
  if (c.unsure > 0) classifiedWords.push(`${n(c.unsure)} unsure`);
  const left = c.of - c.stacks;
  out.push({
    name: "classified",
    count: c.stacks,
    unit: `of ${n(c.of)}`,
    words: c.of === 0 ? "nothing to sort" : classifiedWords.join(" · "),
    jobs: [...c.jobs].sort((a, b) => b - a),
    mark: c.of === 0 ? "none" : markOfJobs(c.jobs, jobs, left > 0 ? "wait" : "done"),
  });
  const r = s.reviewed;
  out.push({
    name: "reviewed",
    count: r.done,
    unit: `of ${n(r.of)}`,
    words: r.of === 0 ? "nothing waits for a person" : r.done < r.of ? "waiting for a person" : "every question decided",
    jobs: [],
    mark: r.of === 0 ? "none" : r.done < r.of ? "wait" : "done",
    since: r.done < r.of ? r.since : null,
  });
  return out;
}

function fromReport(batch: Batch, jobs: JobRow[], review: ReviewItem[]): Stage[] {
  const mine = jobsOfBatch(batch, jobs).sort((a, b) => b.id - a.id);
  const by = (name: StageName) => mine.filter((j) => VERB[name].includes(j.kind));
  const ids = (list: JobRow[]) => list.map((j) => j.id);
  const report = (batch.report ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => (typeof report[k] === "number" ? (report[k] as number) : null);
  const classified = num("classified") ?? num("stacks") ?? null;
  const open = review.filter((i) => i.status === "open").length;
  const decided = review.filter((i) => i.status !== "open").length;
  const walked: StageMark = batch.state === "done" ? "done" : batch.state === "running" ? "now" : batch.state === "failed" ? "failed" : "none";
  const refused = batch.quarantined ?? num("quarantined") ?? 0;
  const digestedJobs = by("digested");
  const classifiedJobs = by("classified");
  return [
    { name: "walked", count: batch.seen, unit: "files", words: batch.seen !== null ? `${n(batch.seen)} files seen${refused > 0 ? ` · ${n(refused)} refused` : ""}` : "files seen unknown", jobs: ids(by("walked")), mark: walked },
    {
      name: "digested",
      count: batch.ingested ?? batch.parsed,
      unit: batch.ingested !== null ? "ingested" : "parsed",
      words: batch.ingested !== null ? `${n(batch.ingested)} ingested${refused > 0 ? `, ${n(refused)} quarantined` : ""}` : batch.parsed !== null ? `${n(batch.parsed)} parsed` : "not digested",
      jobs: ids(digestedJobs),
      mark: batch.ingested !== null || batch.parsed !== null ? walked : markOfJobs(ids(digestedJobs), jobs, "none"),
    },
    { name: "classified", count: classified, unit: "stacks", words: classified !== null ? `${n(classified)} stacks classified` : "not classified", jobs: ids(classifiedJobs), mark: markOfJobs(ids(classifiedJobs), jobs, classified !== null ? "done" : "none") },
    { name: "reviewed", count: decided, unit: `of ${n(review.length)}`, words: review.length === 0 ? "nothing to review" : `${n(open)} open, ${n(decided)} decided`, jobs: [], mark: review.length === 0 ? "none" : open === 0 ? "done" : "wait" },
  ];
}

/** The stages of one batch: five from an engine that reports them, four from an older one. */
export function stages(batch: BatchDoc | Batch, jobs: JobRow[], review: ReviewItem[]): Stage[] {
  const s = (batch as BatchDoc).stages ?? null;
  return s ? fromStages(s, jobs, batch.state) : fromReport(batch, jobs, review);
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

/** What to do about a refusal of this class, in a phrase (record 27, R5b). */
export function remedyWords(reason: string): string {
  const words: Record<string, string> = {
    not_dicom: "nothing to do: it was never a scan",
    no_pixel_data: "nothing to do: it carries no image",
    truncated: "copy it from the source again, then read the refused files",
    unreadable: "copy it from the source again, then read the refused files",
    parse_error: "read it again; if it holds, keep one file and say so",
    unsupported_transfer_syntax: "read it again after the next engine update",
    walk_error: "check the disk, then read the refused files again",
  };
  return words[reason] ?? "read the refused files again";
}

/** A stage's state in one word, for the strip. */
export function stateWords(mark: StageMark): string {
  if (mark === "done") return "done";
  if (mark === "now") return "running";
  if (mark === "wait") return "waiting";
  if (mark === "failed") return "failed";
  return "not a step";
}

/** A refusal's class, as a person reads it. */
export function reasonWords(reason: string): string {
  const words: Record<string, string> = {
    not_dicom: "not DICOM",
    no_pixel_data: "no pixel data",
    truncated: "unreadable: the header ends early",
    unreadable: "unreadable",
    parse_error: "the header could not be parsed",
    unsupported_transfer_syntax: "a transfer syntax the reader does not know",
    walk_error: "the file could not be read from disk",
  };
  return words[reason] ?? reason.replace(/_/g, " ");
}
