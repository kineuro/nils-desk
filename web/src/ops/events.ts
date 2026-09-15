// SPDX-License-Identifier: AGPL-3.0-only
// The jobs now, live: `GET /api/events` is a server-sent stream that says
// the open jobs and the epoch every second while a page listens. Where the
// engine does not serve it, or the stream drops, the page reads `GET
// /api/jobs` every few seconds instead and says so. Display plumbing only:
// nothing here starts or stops a job.

import { useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { ops } from "./client";

export interface OpenJobs {
  /** The jobs not over, newest first; null until the first read. */
  jobs: JobRow[] | null;
  epoch: number | null;
  /** Whether the stream is open; false while the page polls instead. */
  live: boolean;
  /** When the jobs were last read, in ms. */
  at: number | null;
}

const POLL_MS = 5_000;

/** What one `jobs` event carries. */
export function parseJobsEvent(data: string): { epoch: number | null; jobs: JobRow[] } | null {
  try {
    const v = JSON.parse(data) as { epoch?: unknown; jobs?: unknown };
    if (!Array.isArray(v.jobs)) return null;
    return { epoch: typeof v.epoch === "number" ? v.epoch : null, jobs: v.jobs as JobRow[] };
  } catch {
    return null;
  }
}

/**
 * The open jobs, from the event stream where the engine serves it, else by
 * polling. `wanted` false closes the stream and stops polling, for a page
 * that only needs the jobs while something runs.
 */
export function useOpenJobs(caps: Capabilities, wanted = true): OpenJobs {
  const [state, setState] = useState<OpenJobs>({ jobs: null, epoch: null, live: false, at: null });
  const streams = served(caps, "GET /api/events") && typeof EventSource !== "undefined";
  const polls = served(caps, "GET /api/jobs");
  useEffect(() => {
    if (!wanted || (!streams && !polls)) return;
    let alive = true;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () => {
      ops
        .jobs(false, 50)
        .then((r) => alive && setState((was) => ({ ...was, jobs: r.jobs, live: false, at: Date.now() })))
        .catch(() => undefined);
    };
    const startPolling = () => {
      if (timer !== null || !polls) return;
      poll();
      timer = setInterval(poll, POLL_MS);
    };
    if (streams) {
      source = new EventSource("/api/events");
      source.addEventListener("jobs", (e) => {
        const got = parseJobsEvent((e as MessageEvent<string>).data);
        if (got && alive) setState({ jobs: got.jobs, epoch: got.epoch, live: true, at: Date.now() });
      });
      source.onerror = () => {
        // the stream is capped and can drop: the page reads the door instead, and says it is not live
        source?.close();
        source = null;
        if (alive) {
          setState((was) => ({ ...was, live: false }));
          startPolling();
        }
      };
    } else startPolling();
    return () => {
      alive = false;
      source?.close();
      if (timer !== null) clearInterval(timer);
    };
  }, [wanted, streams, polls]);
  return state;
}
