// SPDX-License-Identifier: AGPL-3.0-only
// Home's four tiles (Wave 5 section 6.1, D55): what the registry holds, what
// needs you, what is running, and what changed since you were last here.
// Each is offered only where the engine serves the door it reads and the
// person holds the grant that door wants, and each is words over that
// one door's answer. None of them ever shows a row of a person.

import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door } from "../deployment";
import { may, type Grant } from "../grants";
import type { Summary } from "../objects/client";

export type TileId = "holds" | "needs" | "running" | "since";

export interface Tile {
  id: TileId;
  eyebrow: string;
  value: string;
  meta: string;
}

const OFFERED: [TileId, string, Grant][] = [
  ["holds", "GET /api/summary", "query:see"],
  ["needs", "GET /api/review", "review:see"],
  ["running", "GET /api/jobs", "pipelines:see"],
  ["since", "GET /api/summary", "query:see"],
];

/** The tiles this person sees, in order. */
export function tilesOffered(caps: Capabilities): TileId[] {
  return OFFERED.filter(([, d, g]) => door(caps, d) && may(caps, g)).map(([id]) => id);
}

const count = (x: number) => x.toLocaleString("en-GB");
const of = (x: number, one: string, many: string) => `${count(x)} ${x === 1 ? one : many}`;

/** The day a visit was, as a person reads it. */
export function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function holdsTile(s: Summary, schema?: number): Tile {
  const subjects = s.subjects.total;
  const meta =
    subjects === 0
      ? ["subjects", `epoch ${count(s.epoch)}`, schema !== undefined ? `schema ${schema}` : null]
      : [subjects === 1 ? "subject" : "subjects", of(s.sessions.total, "session", "sessions"), of(s.stacks.total, "stack", "stacks"), `epoch ${count(s.epoch)}`];
  return { id: "holds", eyebrow: "The registry holds", value: count(subjects), meta: meta.filter(Boolean).join(" · ") };
}

export function needsTile(open: number): Tile {
  return { id: "needs", eyebrow: "Needs you", value: count(open), meta: open === 0 ? "nothing to review" : `${open === 1 ? "review item" : "review items"} open` };
}

export function runningTile(jobs: JobRow[]): Tile {
  // the queue's own worker is how jobs run, not a job anyone started
  const work = jobs.filter((j) => j.kind !== "worker");
  const running = work.filter((j) => j.state === "running" || j.state === "cancelling").length;
  const queued = work.filter((j) => j.state === "queued").length;
  const words = [running > 0 ? `${count(running)} running` : null, queued > 0 ? `${count(queued)} queued` : null].filter(Boolean);
  return { id: "running", eyebrow: "Running", value: count(running + queued), meta: words.length > 0 ? words.join(", ") : "no jobs" };
}

/** What changed since the last visit: nothing to say on the first, and only the kinds that moved after it. */
export function sinceTile(last: string | null, s: Summary | null): Tile {
  const eyebrow = "Since your last visit";
  if (last === null) return { id: "since", eyebrow, value: "First visit", meta: "changes land here" };
  const c = s?.since;
  if (!c) return { id: "since", eyebrow, value: "Nothing new", meta: `since ${day(last)}` };
  const moved = [
    c.subjects > 0 ? of(c.subjects, "subject", "subjects") : null,
    c.sessions > 0 ? of(c.sessions, "session", "sessions") : null,
    c.handles > 0 ? of(c.handles, "result", "results") : null,
    c.releases > 0 ? of(c.releases, "release", "releases") : null,
  ].filter(Boolean);
  if (c.stacks === 0 && moved.length === 0) return { id: "since", eyebrow, value: "Nothing new", meta: `since ${day(last)}` };
  return { id: "since", eyebrow, value: count(c.stacks), meta: [`${c.stacks === 1 ? "stack" : "stacks"} since ${day(last)}`, ...moved].join(", ") };
}

const VISIT = "nils-desk.home.last-visit";

/** When this browser last opened Home; null on the first visit or in a window that keeps nothing. */
export function lastVisit(): string | null {
  try {
    return localStorage.getItem(VISIT);
  } catch {
    return null;
  }
}

export function markVisit(at: string): void {
  try {
    localStorage.setItem(VISIT, at);
  } catch {
    // a private window keeps nothing
  }
}
