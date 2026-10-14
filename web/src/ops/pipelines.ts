// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page's pure parts: a job as a card, in a person's words
// (what it is doing, to what, for whom, how far it is, what stopped it and
// the next move), the grant that cancels it by its verb, a queued chain's
// place in the line, and the filter by state. The words of every verb are
// the one table's, in ops/verbs, shared with the Data page's Now. Since
// 2026-10-12 a pipeline run's job reads as its units summed, never a bare
// done ("Pipeline run of n4@1: nothing made", the rest on a line under it),
// a stopped one whose run a later job took up again says so and offers no
// Run again, and Run again of a pipeline run opens its pre-flight first.

import type { ChainedJob, Json, JobRow } from "../ask/client";
import type { Grant } from "../grants";
import type { IconName } from "../ui/Icon";
import { whenWords } from "../data/sources";
import { doingWords, endedWords, namedWords, nextMove as nextOf, VERBS, wordsOf } from "./verbs";
import { failureOf, type Failure } from "./failure";
import { overOfCommand, requeued } from "./catalog";
import { madeOf, madeWords, type MadeWords } from "./made";
import type { Again } from "./RunAgain";

/** A job row as an engine that chains jobs reports it: the one shape, defined beside the job row. */
export type { ChainedJob } from "../ask/client";
export { targetOf, verbOf } from "./verbs";

/** A job that stopped offers the same command again; one that ran to its end or still runs offers nothing. */
export function nextMove(job: JobRow): { label: string; command: string[] } | null {
  if (job.state !== "failed" && job.state !== "cancelled") return null;
  return nextOf(job);
}

export type CardTone = "running" | "queued" | "done" | "failed" | "cancelled";

export interface Progress {
  /** 0 to 1 when the whole is known, else null. */
  fraction: number | null;
  words: string;
}

export interface JobCard {
  id: number;
  tone: CardTone;
  icon: IconName;
  title: string;
  /** "job 120 · astrid · since 21:02". */
  meta: string;
  progress: Progress | null;
  /** What stopped it, for a failed job. */
  error: string | null;
  /** Its failure, the kind and what to do, where the engine names them (2026-10-12). */
  failure: Failure | null;
  /** The command to queue again, with its label, for a job that stopped. */
  next: { label: string; command: string[] } | null;
  /** For a queued job in a chain: the job it waits for. */
  waits: number | null;
  /** The commands queued after this one. */
  then: string[];
  cancel: Grant;
  /** Since 2026-10-12, a pipeline run's job that ended done: its units summed ("nothing made", "3 of 4 made"), the rest on a line, and whether it needs a look. */
  made: MadeWords | null;
  /** Since 2026-10-12: the later job that took this job's run up again; the card says so, and offers no Run again and no failure to mend. */
  taken: { job: number; state: string } | null;
  /** Since 2026-10-12, a pipeline run's job that stopped: Run again, which opens its pre-flight first. */
  again: Again | null;
}

const n = (v: number) => v.toLocaleString("en-US");

/** The grant that cancels a job: a digest is Data work, a sort Pipelines work, a release Release work, a backup Database work. */
export function cancelGrant(job: JobRow): Grant {
  return wordsOf(job).grant;
}

/** What the job is doing, as its card's title: "Digesting spring-scans", "Digest of spring-scans stopped", "Then digest". */
export function titleOf(job: ChainedJob): string {
  if (job.state === "failed") return endedWords(job, "stopped");
  if (job.state === "cancelled") return endedWords(job, "cancelled");
  if (job.state === "done") return endedWords(job, "done");
  const doing = doingWords(job);
  if (job.state === "queued" && job.chain?.before) return `Then ${doing.charAt(0).toLowerCase()}${doing.slice(1)}`;
  return doing;
}

/** One `then` command in words: "then sort with mri". */
export function thenWords(command: string[]): string {
  const verb = command[0] ?? "";
  const two = (verb === "ask" || verb === "linkage" || verb === "clinical") && command[1] ? `${verb} ${command[1]}` : verb;
  const d = VERBS[two];
  const pack = command.indexOf("--pack");
  const withPack = pack >= 0 && command[pack + 1] ? ` with ${command[pack + 1]}` : "";
  return `then ${d ? d.noun : two}${withPack}`;
}

/** How far a job is, from what its verb records as progress. */
export function progressOf(job: JobRow, now = Date.now()): Progress | null {
  const p = (job.progress ?? null) as Record<string, unknown> | null;
  if (!p || (job.state !== "running" && job.state !== "cancelling")) return null;
  const num = (k: string): number | null => (typeof p[k] === "number" ? (p[k] as number) : null);
  const done = num("done") ?? num("written") ?? num("seen") ?? num("stacks") ?? num("files") ?? null;
  const total = num("of") ?? num("total") ?? null;
  if (done === null) return null;
  const elapsed = num("elapsed_s") ?? Math.max(1, (now - Date.parse(job.started_at)) / 1000);
  const rate = elapsed > 0 ? done / elapsed : 0;
  const unit = num("stacks") !== null && num("seen") === null ? "stacks" : "files";
  const words = [total !== null ? `${n(done)} of ${n(total)} ${unit}` : `${n(done)} ${unit} so far`];
  if (rate >= 1) words.push(`${n(Math.round(rate))} a second`);
  if (total !== null && rate > 0 && total > done) {
    const left = (total - done) / rate;
    words.push(left < 90 ? "under 2 min left" : `about ${Math.round(left / 60)} min left`);
  }
  const refused = num("quarantined") ?? num("refused");
  if (refused) words.push(`${n(refused)} refused`);
  const held = num("held");
  if (held) words.push(`${n(held)} held until mapped`);
  return { fraction: total !== null && total > 0 ? Math.min(1, done / total) : null, words: words.join(" · ") };
}

/** Whether a job is a pipeline run's. */
export function isRunJob(job: JobRow): boolean {
  return job.kind === "pipeline" || typeof (job.result as Json | null)?.run === "number";
}

/** The later job that took a stopped job's run up again, where the engine says one did. */
export function takenOf(job: JobRow): { job: number; state: string } | null {
  const t = job.taken_up;
  return t && typeof t.job === "number" && t.job !== job.id ? { job: t.job, state: typeof t.state === "string" ? t.state : "" } : null;
}

/** A pipeline run's job, its units summed, once it ended done; null for any other job. */
export function madeOfJob(job: JobRow): MadeWords | null {
  if (job.state !== "done" || !isRunJob(job)) return null;
  const m = madeOf({ made: job.made, summary: ((job.result as Json | null)?.summary ?? null) as Json | null });
  return m && m.units > 0 ? madeWords(m) : null;
}

/** Run again of a stopped pipeline run's job: its run taken up where it stopped, or, where the run cannot be (it failed after its containers ended), its command again as a new run; either opens the pre-flight first. Null where neither can be read, and the card falls back to queueing its command. */
export function againOfJob(job: JobRow): Again | null {
  if (!isRunJob(job) || (job.state !== "failed" && job.state !== "cancelled")) return null;
  const r = (job.result ?? {}) as Json;
  const args = (job.args ?? {}) as Json;
  const run = typeof r.run === "number" ? r.run : typeof args.run === "number" ? args.run : null;
  const label = typeof args.pipeline === "string" ? args.pipeline : (job.name ?? "");
  const status = typeof r.status === "string" ? r.status : null;
  const resumable = status === null || status === "cancelled" || status === "interrupted" || status === "running" || (status === "failed" && !r.results_digest);
  if (run !== null && label !== "" && resumable) return { kind: "resume", run, pipeline: label, label };
  const command = nextOf(job)?.command;
  const parsed = command ? overOfCommand(command) : null;
  return command && parsed ? { kind: "new", pipeline: parsed.pipeline, over: parsed.over, params: parsed.params, command: requeued(command) } : null;
}

/** The card of one job. */
export function cardOf(job: ChainedJob, now = Date.now()): JobCard {
  const d = wordsOf(job);
  const tone: CardTone = job.state === "running" || job.state === "cancelling" ? "running" : job.state === "queued" ? "queued" : job.state === "failed" ? "failed" : job.state === "cancelled" ? "cancelled" : "done";
  const who = typeof job.args?.principal === "string" ? job.args.principal : null;
  const when = tone === "running" ? `since ${whenWords(job.started_at).replace(/^today /, "")}` : whenWords(job.finished_at ?? job.started_at);
  // a stopped run that a later job took up again: nobody is asked to mend what it stopped for
  const taken = isRunJob(job) ? takenOf(job) : null;
  const made = madeOfJob(job);
  const meta = [`job ${job.id}`, who, tone === "queued" ? null : when, job.state === "cancelling" ? "stopping at the next heartbeat" : null, taken ? `ran again as job ${taken.job}${taken.state ? `, ${taken.state}` : ""}` : null].filter(Boolean).join(" · ");
  const next = taken ? null : nextMove(job);
  return {
    id: job.id,
    tone,
    // a stopped job a later job went on past is nothing to mend: no alarm
    icon: tone === "failed" && !taken ? "alert" : tone === "queued" ? "clock" : d.icon,
    title: made ? `${namedWords(job)}: ${made.head}` : titleOf(job),
    meta,
    progress: progressOf(job, now),
    error: taken ? null : job.error,
    failure: job.state === "failed" && !taken ? failureOf(job) : null,
    next,
    waits: job.state === "queued" ? (job.chain?.before ?? null) : null,
    then: (job.then ?? []).map(thenWords),
    cancel: d.grant,
    made,
    taken,
    again: next ? againOfJob(job) : null,
  };
}

/** Whether a job sits in Now as needing a look: one that stopped in the last week, unless a later job took its run up again, and a run's job that ended having made nothing. */
export function needsALook(job: JobRow, now = Date.now()): boolean {
  const recent = Date.parse(job.finished_at ?? job.started_at) > now - 7 * 86_400_000;
  if (!recent) return false;
  if (job.state === "failed" || job.state === "cancelled") return takenOf(job) === null;
  return madeOfJob(job)?.head === "nothing made";
}

export type StateFilter = "all" | "running" | "queued" | "done" | "failed";

export const FILTERS: { id: StateFilter; label: string }[] = [
  { id: "all", label: "all" },
  { id: "running", label: "running" },
  { id: "queued", label: "queued" },
  { id: "done", label: "done" },
  { id: "failed", label: "failed" },
];

/** The jobs in one state; failed holds the cancelled too. */
export function filterJobs<T extends JobRow>(jobs: T[], filter: StateFilter): T[] {
  if (filter === "all") return jobs;
  if (filter === "running") return jobs.filter((j) => j.state === "running" || j.state === "cancelling");
  if (filter === "failed") return jobs.filter((j) => j.state === "failed" || j.state === "cancelled");
  return jobs.filter((j) => j.state === filter);
}

/** How many jobs are in each state, for the filter's counts. */
export function countByFilter(jobs: JobRow[]): Record<StateFilter, number> {
  return { all: jobs.length, running: filterJobs(jobs, "running").length, queued: filterJobs(jobs, "queued").length, done: filterJobs(jobs, "done").length, failed: filterJobs(jobs, "failed").length };
}
