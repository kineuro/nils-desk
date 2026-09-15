// SPDX-License-Identifier: AGPL-3.0-only
// The Pipelines page's pure parts: a job as a card, in a person's words
// (what it is doing, to what, for whom, how far it is, what stopped it and
// the next move), the grant that cancels it by its verb, a queued chain's
// place in the line, and the filter by state.

import type { JobRow } from "../ask/client";
import type { Grant } from "../grants";
import type { IconName } from "../ui/Icon";
import { whenWords } from "../data/sources";

/** A job row as an engine that chains jobs reports it. */
export type ChainedJob = JobRow & { then?: string[][] | null; chain?: { before: number | null; after: number | null } | null };

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
  /** The command to queue again, with its label, for a job that stopped. */
  next: { label: string; command: string[] } | null;
  /** For a queued job in a chain: the job it waits for. */
  waits: number | null;
  /** The commands queued after this one. */
  then: string[];
  cancel: Grant;
}

const n = (v: number) => v.toLocaleString("en-US");

/** The verb and the second word of a two-word verb: "ask run", "linkage import". */
export function verbOf(job: JobRow): string {
  const argv = (job.args?.argv as string[] | undefined) ?? [];
  const first = argv[0] ?? job.kind;
  if ((first === "ask" || first === "linkage") && argv[1]) return `${first} ${argv[1]}`;
  return first;
}

/** What the verb acts on: the @place of its arguments, without the @ and the tree. */
export function targetOf(job: JobRow): string | null {
  const argv = (job.args?.argv as string[] | undefined) ?? [];
  const at = argv.find((a) => a.startsWith("@"));
  if (at) return at.slice(1).replace(/\/(dcm-anon|dcm-original)$/, "");
  const named = argv.indexOf("--name");
  if (named >= 0 && argv[named + 1]) return argv[named + 1];
  const pack = argv.indexOf("--pack");
  if (pack >= 0 && argv[pack + 1]) return argv[pack + 1];
  return job.name;
}

const DOING: Record<string, { now: string; noun: string; icon: IconName; grant: Grant; again: string }> = {
  pseudonymize: { now: "Pseudonymising", noun: "pseudonymisation", icon: "shield", grant: "data:work", again: "Pseudonymise again" },
  "bring-in": { now: "Bringing in", noun: "bring-in", icon: "play", grant: "data:work", again: "Bring in again" },
  digest: { now: "Digesting", noun: "digest", icon: "play", grant: "data:work", again: "Read again" },
  ingest: { now: "Digesting", noun: "digest", icon: "play", grant: "data:work", again: "Read again" },
  fingerprint: { now: "Fingerprinting", noun: "fingerprint", icon: "branch", grant: "pipelines:work", again: "Sort again" },
  classify: { now: "Classifying", noun: "classification", icon: "branch", grant: "pipelines:work", again: "Sort again" },
  session: { now: "Building sessions for", noun: "session build", icon: "branch", grant: "pipelines:work", again: "Build again" },
  pick: { now: "Picking for", noun: "pick", icon: "branch", grant: "pipelines:work", again: "Pick again" },
  pyramid: { now: "Building the pyramid for", noun: "pyramid build", icon: "layers", grant: "pipelines:work", again: "Build again" },
  release: { now: "Releasing", noun: "release", icon: "release", grant: "release:work", again: "Release again" },
  handover: { now: "Handing over", noun: "handover", icon: "release", grant: "release:work", again: "Hand over again" },
  backup: { now: "Backing up", noun: "backup", icon: "disk", grant: "database:work", again: "Back up again" },
  verify: { now: "Checking", noun: "check", icon: "disk", grant: "database:work", again: "Check again" },
  "ask run": { now: "Running a query", noun: "query run", icon: "search", grant: "query:work", again: "Run again" },
  "linkage import": { now: "Filing the map for", noun: "map", icon: "key", grant: "data:work", again: "File again" },
  "linkage merge": { now: "Merging subjects for", noun: "merge", icon: "key", grant: "data:work", again: "Merge again" },
  synth: { now: "Making up data for", noun: "synthesis", icon: "play", grant: "data:work", again: "Make again" },
};

const doing = (job: JobRow) => DOING[verbOf(job)] ?? { now: `Running ${verbOf(job)} on`, noun: verbOf(job), icon: "play" as IconName, grant: "pipelines:work" as Grant, again: "Run again" };

/** The grant that cancels a job: a digest is Data work, a sort Pipelines work, a release Release work, a backup Database work. */
export function cancelGrant(job: JobRow): Grant {
  return doing(job).grant;
}

/** What the job is doing, as its card's title: "Digesting spring-scans", "Digest of spring-scans stopped", "Then digest". */
export function titleOf(job: ChainedJob): string {
  const d = doing(job);
  const target = targetOf(job);
  const of = target ? ` ${target}` : "";
  if (job.state === "failed") return `${cap(d.noun)}${target ? ` of ${target}` : ""} stopped`;
  if (job.state === "cancelled") return `${cap(d.noun)}${target ? ` of ${target}` : ""} cancelled`;
  if (job.state === "queued" && job.chain?.before) return `Then ${d.now.toLowerCase()}${of}`;
  if (job.state === "done") return `${cap(d.noun)}${target ? ` of ${target}` : ""} done`;
  return `${d.now}${of}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One `then` command in words: "then classify with mri". */
export function thenWords(command: string[]): string {
  const verb = command[0] ?? "";
  const d = DOING[verb];
  const pack = command.indexOf("--pack");
  const withPack = pack >= 0 && command[pack + 1] ? ` with ${command[pack + 1]}` : "";
  return `then ${d ? d.noun : verb}${withPack}`;
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

/** A failed job's next move: the same command queued again. */
export function nextMove(job: JobRow): { label: string; command: string[] } | null {
  if (job.state !== "failed" && job.state !== "cancelled") return null;
  const argv = (job.args?.argv as string[] | undefined) ?? [];
  if (argv.length === 0) return null;
  return { label: doing(job).again, command: argv.filter((a) => a !== "--restart") };
}

/** The card of one job. */
export function cardOf(job: ChainedJob, now = Date.now()): JobCard {
  const d = doing(job);
  const tone: CardTone = job.state === "running" || job.state === "cancelling" ? "running" : job.state === "queued" ? "queued" : job.state === "failed" ? "failed" : job.state === "cancelled" ? "cancelled" : "done";
  const who = typeof job.args?.principal === "string" ? job.args.principal : null;
  const when = tone === "running" ? `since ${whenWords(job.started_at).replace(/^today /, "")}` : whenWords(job.finished_at ?? job.started_at);
  const meta = [`job ${job.id}`, who, tone === "queued" ? null : when, job.state === "cancelling" ? "stopping at the next heartbeat" : null].filter(Boolean).join(" · ");
  return {
    id: job.id,
    tone,
    icon: tone === "failed" ? "alert" : tone === "queued" ? "clock" : d.icon,
    title: titleOf(job),
    meta,
    progress: progressOf(job, now),
    error: job.error,
    next: nextMove(job),
    waits: job.state === "queued" ? (job.chain?.before ?? null) : null,
    then: (job.then ?? []).map(thenWords),
    cancel: d.grant,
  };
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
