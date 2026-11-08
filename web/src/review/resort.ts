// SPDX-License-Identifier: AGPL-3.0-only
// The re-sort after a commit, followed (UX round 5, 2026-11-08). A commit
// of 50,006 post-contrast answers held the confirm dialog open for three
// minutes while the engine sorted the scans inside the request, its button
// live the whole time. Since engine 1.0.0-beta.11 the commit door answers at
// once and queues the re-sort as a job; the page says what was committed and
// follows that job through the jobs door every few seconds until it is over,
// then reads the standings again. An older engine's words are shown as they
// come. Also the campaign of the rest's estimate: how long reading N scans
// takes at the axis's pace.

import { useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import { ops } from "../ops/client";
import type { CommitAnswer, Standing } from "./modelFamily";
import { axisTitle } from "./work";

const n = (v: number) => v.toLocaleString("en-US");

/** The re-sort as a commit answers it: queued as a job, or run inline by an older engine. */
export interface Resort {
  state: string;
  job: number | null;
  stacks: number;
  words: string | null;
}

export function resortOf(r: CommitAnswer): Resort {
  const x = r.resort ?? null;
  return {
    state: typeof x?.state === "string" ? x.state : "done",
    job: typeof x?.job === "number" && Number.isFinite(x.job) ? x.job : null,
    stacks: typeof x?.stacks === "number" ? x.stacks : 0,
    words: typeof x?.words === "string" && x.words !== "" ? x.words : null,
  };
}

/** The axis in a person's words, lower case: "post-contrast". */
const axisLower = (axis: string) => axisTitle(axis).toLowerCase();

/** What was committed: "Committed 50,006 post-contrast answers". */
const committedHead = (s: Standing) => `Committed ${n(s.commit.stacks)} ${axisLower(s.axis)} answers`;

/** The line the page says once the commit answered: what was committed, and the re-sort that follows, or an older engine's words. */
export function committedLine(s: Standing, r: CommitAnswer): string {
  const resort = resortOf(r);
  const head = committedHead(s);
  if (resort.job !== null) return `${head} · sorting them again (job ${resort.job})`;
  if (resort.words) return `${head}. ${resort.words.charAt(0).toUpperCase()}${resort.words.slice(1)}.`;
  return `${head}.`;
}

/** The line while the page follows the re-sort: what was committed, then how far the job is, and the job while it runs. */
export function followLine(s: Standing, resort: Resort, job: Pick<JobRow, "state" | "progress" | "error" | "result"> | null): string {
  const head = committedHead(s);
  if (!job) return `${head} · sorting them again (job ${resort.job})`;
  return `${head} · ${sortedLine(job, resort.stacks)}${jobOver(job.state) ? "" : ` (job ${resort.job})`}`;
}

/** Whether a job's state is one it will not leave. */
export const jobOver = (state: string): boolean => state === "done" || state === "failed" || state === "cancelled";

/** The line while the re-sort runs and once it ended: "12,000 of 50,006 sorted again", "50,006 of 50,006 sorted again", or why not. */
export function sortedLine(job: Pick<JobRow, "state" | "progress" | "error" | "result">, stacks: number): string {
  const p = (job.progress ?? {}) as { done?: unknown; of?: unknown };
  const of = typeof p.of === "number" ? p.of : stacks;
  const done = typeof p.done === "number" ? p.done : 0;
  switch (job.state) {
    case "done":
      return `${n(of)} of ${n(of)} sorted again`;
    case "failed": {
      const why = job.error ?? ((job.result ?? {}) as { words?: unknown }).words;
      return `Not sorted again${typeof why === "string" && why ? `: ${why}` : ""}; the decisions stand, and the next sort reaches them`;
    }
    case "cancelled":
      return `Sorting stopped at ${n(done)} of ${n(of)}; the next sort reaches the rest`;
    case "queued":
      return `${n(done)} of ${n(of)} sorted again · waiting for a worker`;
    default:
      return `${n(done)} of ${n(of)} sorted again`;
  }
}

/** How often the page asks after the job. */
export const FOLLOW_EVERY_MS = 3000;

/**
 * Follow one job through the jobs door until it is over: its latest row, read every few seconds. `onOver` is told
 * once, with the final row. A null id follows nothing.
 */
export function useFollowedJob(id: number | null, onOver?: (job: JobRow) => void, every = FOLLOW_EVERY_MS): JobRow | null {
  const [job, setJob] = useState<JobRow | null>(null);
  useEffect(() => {
    setJob(null);
    if (id === null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      ops.job(id).then(
        (j) => {
          if (!alive) return;
          setJob(j);
          if (jobOver(j.state)) onOver?.(j);
          else timer = setTimeout(read, every);
        },
        () => {
          if (alive) timer = setTimeout(read, every);
        },
      );
    };
    read();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one follow per job
  }, [id]);
  return job;
}

// ------------------------------------------------------------ the campaign of the rest's estimate

/** A span of seconds in a person's words: "40 s", "12 min", "1 h 25 min", "3 days". */
export function durationWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes - hours * 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${Math.round(hours / 24)} days`;
}

/** A pace in a person's words: "10 s a scan", "2.5 s a scan". */
export function paceWords(pace: number): string {
  const p = pace >= 10 ? String(Math.round(pace)) : String(Math.round(pace * 10) / 10);
  return `${p} s a scan`;
}

/** "about 1 h 25 min at 10 s a scan"; null where the engine knows no pace. */
export function estimateWords(scans: number, pace: number | null): string | null {
  if (pace === null || !Number.isFinite(pace) || pace <= 0 || scans <= 0) return null;
  return `about ${durationWords(scans * pace)} at ${paceWords(pace)}`;
}
