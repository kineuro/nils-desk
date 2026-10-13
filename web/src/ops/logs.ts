// SPDX-License-Identifier: AGPL-3.0-only
// The logs of jobs and of a run's units (record 55 H2, round 5; spec 13.1):
// the engine keeps what each job printed and what each unit of a pipeline
// run wrote, and answers a piece of it at a time, the end first, so a
// running job's log is followed by asking again from where the last piece
// ended. The Logs page lists the jobs and opens one's log, and a run's
// units each with their own.

import type { Capabilities } from "../capabilities";
import { door } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";

export const JOB_LOG = "GET /api/jobs/{id}/log";
export const UNIT_LOG = "GET /api/pipeline-runs/{id}/units/{unit}/log";
export const RUN_LOG = "GET /api/pipeline-runs/{id}/log";

/** A piece of a log, as either door answers it. */
export interface LogPiece {
  /** The job's, or the run's and its unit's. */
  job?: number;
  state?: string;
  run?: number;
  unit?: string;
  /** The run's units ran together and wrote one log, which every unit's door answers. */
  shared?: boolean;
  /** The log's whole size in bytes, and the piece's place in it. */
  size: number;
  from: number;
  to: number;
  text: string;
  /** Bytes before `from` that this piece leaves out. */
  earlier: boolean;
  /** The job or run has ended: the log grows no more. */
  over: boolean;
}

async function read<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { "X-Nils-Desk": "1" } });
  const text = await r.text();
  let body: { error?: unknown } = {};
  try {
    body = text ? (JSON.parse(text) as { error?: unknown }) : {};
  } catch {
    body = {};
  }
  if (!r.ok) throw new LogRefused(r.status, typeof body.error === "string" ? body.error : `the engine answered ${r.status}`);
  return body as T;
}

/** A log the engine would not answer, with its status: 404 says why there is none, 403 that this person may not read it. */
export class LogRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const at = (from?: number) => (from === undefined ? "" : `?from=${from}`);

export const logs = {
  job: (id: number, from?: number) => read<LogPiece>(`/api/jobs/${id}/log${at(from)}`),
  unit: (run: number, unit: string, from?: number) => read<LogPiece>(`/api/pipeline-runs/${run}/units/${encodeURIComponent(unit)}/log${at(from)}`),
  run: (run: number, from?: number) => read<LogPiece>(`/api/pipeline-runs/${run}/log${at(from)}`),
};

/** Whether the Logs page is offered: the person sees Pipelines and the engine keeps jobs' logs. */
export function logsOffered(caps: Capabilities): boolean {
  return may(caps, "pipelines:see") && door(caps, "GET /api/jobs") && door(caps, JOB_LOG);
}

/** The address of a job's log on the Logs page. */
export function jobLogHref(job: number): string {
  return href("pipelines", "logs", String(job));
}

/** A piece read after another of the same log: the text joined on, where it follows on from the last one. */
export function joined(was: LogPiece | null, next: LogPiece): LogPiece {
  if (!was || next.from !== was.to) return next;
  return { ...next, from: was.from, earlier: was.earlier, text: was.text + next.text };
}

/** How much an Earlier asks for: the bytes before the piece shown. */
export const EARLIER_BYTES = 64 * 1024;

/** Where an Earlier starts reading. */
export function earlierFrom(piece: Pick<LogPiece, "from">): number {
  return Math.max(0, piece.from - EARLIER_BYTES);
}

/** An earlier piece put before the one shown, where it ends where the shown one starts; the shown one's end and state stay. */
export function prepended(earlier: LogPiece, shown: LogPiece): LogPiece {
  if (earlier.to !== shown.from) return shown;
  return { ...shown, from: earlier.from, earlier: earlier.earlier, text: earlier.text + shown.text };
}

/** Why a log is not shown, in a few plain words. */
export function refusedWords(e: unknown): string {
  if (e instanceof LogRefused) {
    // a unit holding a sealed stack says so in the engine's words; any other refusal is a grant the person lacks
    if (e.status === 403) return /sealed/iu.test(e.message) ? sentence(e.message) : "You may not read this log: it needs the work of the page the job belongs to.";
    return sentence(e.message);
  }
  return e instanceof Error ? sentence(e.message) : String(e);
}

const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return "";
  return `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/u.test(t) ? "" : "."}`;
};

/** The run a job ran, where it was a pipeline run. */
export function runOf(j: { result?: unknown; args?: unknown }): number | null {
  const fromResult = (j.result as { run?: unknown } | null | undefined)?.run;
  if (typeof fromResult === "number") return fromResult;
  const fromArgs = (j.args as { run?: unknown } | undefined)?.run;
  return typeof fromArgs === "number" ? fromArgs : null;
}
