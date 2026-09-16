// SPDX-License-Identifier: AGPL-3.0-only
// Now, on the Data page (record 26, D1): the open jobs as the engine's event
// stream sends them every second, or read every few seconds where the stream
// refuses or the engine has no stream; each as a card of what it does, who
// started it and since when, how far it is from its progress record, what is
// queued after it as one dashed card, and a failed job with its error and one
// next move. Cancel keeps its button and says why when a person lacks the
// grant the verb needs.

import { needsWork } from "../access";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { IconName } from "../ui/Icon";
import { cancelNeeds, commandOf, doingWords, endedWords, nextMove as nextOf, wordsOf } from "../ops/verbs";
import { chainWords, type ChainedJob } from "./datasets";
import { whenWords } from "./sources";

// the words of a verb are the one table's, shared with the Pipelines page
export { cancelNeeds, doingWords, targetOf } from "../ops/verbs";

const n = (v: number) => v.toLocaleString("en-US");

/** The jobs a person started, not the queue's own worker. */
export function ofPeople(jobs: JobRow[]): JobRow[] {
  return jobs.filter((j) => j.kind !== "worker");
}

const OPEN = new Set(["queued", "running", "cancelling"]);

export function isOpen(j: JobRow): boolean {
  return OPEN.has(j.state);
}

/** Why this person may not cancel a job, in words, or null when they may. */
export function cancelRefusal(caps: Capabilities, j: JobRow): string | null {
  const [grant, page] = cancelNeeds(j);
  return needsWork(caps, `Cancelling a ${wordsOf(j).noun}`, [[grant, page]]);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Seconds since an ISO stamp. */
function age(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 1000) : 0;
}

/** How far a job is, from its progress record: the counts, the rate, what is left, what is held or refused. */
export function progressOf(j: JobRow, now: number): { fraction: number | null; words: string } | null {
  const p = j.progress;
  if (!p || typeof p !== "object") return null;
  const done = num(p["written"]) ?? num(p["done"]) ?? num(p["seen"]) ?? num(p["files"]);
  const of = num(p["of"]) ?? num(p["total"]) ?? num(p["expected"]);
  const elapsed = num(p["elapsed_s"]) ?? age(j.started_at, now);
  const rate = done !== null && done > 0 && elapsed > 0 ? done / elapsed : null;
  const held = num(p["held"]);
  const refused = num(p["refused"]) ?? num(p["quarantined"]);
  const parts: string[] = [];
  if (done !== null) parts.push(of !== null && of > 0 ? `${n(done)} of ${n(of)} files` : `${n(done)} files`);
  if (rate !== null && j.state !== "queued") parts.push(`${n(Math.round(rate))} a second`);
  if (of !== null && of > 0 && done !== null && rate !== null && rate > 0 && of > done) {
    const left = (of - done) / rate;
    parts.push(left < 60 ? "under a minute left" : left < 3600 ? `about ${Math.round(left / 60)} min left` : `about ${(left / 3600).toFixed(1)} hours left`);
  }
  if (held !== null && held > 0) parts.push(`${n(held)} held until mapped`);
  if (refused !== null && refused > 0) parts.push(`${n(refused)} refused`);
  if (parts.length === 0) return null;
  return { fraction: of !== null && of > 0 && done !== null ? Math.min(1, done / of) : null, words: parts.join(" · ") };
}

export interface JobCard {
  key: string;
  id: number;
  kind: "running" | "queued" | "chain" | "failed";
  icon: IconName;
  tone: "brand" | "caution" | "neutral";
  what: string;
  line: string;
  progress: { fraction: number | null; words: string } | null;
  /** Cancel or Drop, with why it is refused to this person when it is. */
  cancel: { label: string; refusal: string | null } | null;
  failed: { error: string; next: { label: string; command: string[]; name: string | null } | null } | null;
}

/** Since when, briefly: the time today, else the day. */
function sinceWords(iso: string, now: Date): string {
  const w = whenWords(iso, now);
  return w.startsWith("today ") ? `since ${w.slice("today ".length)}` : w ? `since ${w}` : "";
}

/** The next move after a failed job: the same command again under the same name, for a verb that is simply run again. */
function nextMove(j: JobRow): { label: string; command: string[]; name: string | null } | null {
  const next = nextOf(j);
  return next ? { ...next, name: j.name } : null;
}

/**
 * The cards of Now: every open job of a person, newest first, a chain queued
 * after a job as one dashed card, and the failed jobs given with their error.
 */
export function jobCards(open: ChainedJob[], failed: ChainedJob[], caps: Capabilities, now: number): JobCard[] {
  const at = new Date(now);
  const people = ofPeople(open) as ChainedJob[];
  const byId = new Map(people.map((j) => [j.id, j]));
  // a queued job that waits for another is drawn under that one, not on its own
  const chained = new Map<number, ChainedJob[]>();
  for (const j of people) {
    const before = j.chain?.before ?? null;
    if (j.state === "queued" && before !== null && byId.has(before)) chained.set(before, [...(chained.get(before) ?? []), j]);
  }
  const out: JobCard[] = [];
  const who = (j: JobRow) => (typeof j.args?.principal === "string" ? j.args.principal : null);
  for (const j of [...people].sort((a, b) => a.id - b.id)) {
    if (j.state === "queued" && j.chain?.before !== null && j.chain?.before !== undefined && byId.has(j.chain.before)) continue;
    const icon: IconName = wordsOf(j).icon;
    // what follows: the job's own list, else the queued rows that wait for it and what waits for them
    const queuedAfter = chained.get(j.id) ?? [];
    const then = j.then && j.then.length > 0 ? j.then : [...queuedAfter.map((q) => (commandOf(q).length > 0 ? commandOf(q) : [q.kind])), ...queuedAfter.flatMap((q) => q.then ?? [])];
    const line = [`job ${j.id}`, who(j), sinceWords(j.started_at, at), chainWords(then)].filter(Boolean).join(" · ");
    if (j.state === "queued") {
      out.push({ key: `job ${j.id}`, id: j.id, kind: "queued", icon: "clock", tone: "neutral", what: doingWords(j), line: `queued · ${line}`, progress: null, cancel: { label: "Drop", refusal: cancelRefusal(caps, j) }, failed: null });
      continue;
    }
    out.push({
      key: `job ${j.id}`,
      id: j.id,
      kind: "running",
      icon,
      tone: "brand",
      what: j.state === "cancelling" ? `${doingWords(j)}, stopping` : doingWords(j),
      line,
      progress: progressOf(j, now),
      cancel: { label: "Cancel", refusal: cancelRefusal(caps, j) },
      failed: null,
    });
    if (then.length > 0) {
      const words = chainWords(then);
      const what = words.charAt(0).toUpperCase() + words.slice(1);
      const queued = chained.get(j.id) ?? [];
      const drop = queued[0] ?? null;
      out.push({
        key: `chain ${j.id}`,
        id: drop?.id ?? j.id,
        kind: "chain",
        icon: "clock",
        tone: "neutral",
        what,
        line: `waits for job ${j.id}`,
        progress: null,
        cancel: drop ? { label: "Drop", refusal: cancelRefusal(caps, drop) } : null,
        failed: null,
      });
    }
  }
  for (const j of ofPeople(failed).filter((j) => j.state === "failed").sort((a, b) => b.id - a.id)) {
    const p = progressOf(j, now);
    const line = [`job ${j.id}`, whenWords(j.finished_at ?? j.started_at, at), p?.words ?? null].filter(Boolean).join(" · ");
    out.push({
      key: `failed ${j.id}`,
      id: j.id,
      kind: "failed",
      icon: "alert",
      tone: "caution",
      what: endedWords(j, "stopped"),
      line,
      progress: null,
      cancel: null,
      failed: { error: j.error ?? "The engine recorded no reason.", next: nextMove(j) },
    });
  }
  return out;
}

/** What Now says beside its title: how it is fed, and how many jobs. */
export function nowWords(live: Live, count: number): string {
  const jobs = count === 0 ? "nothing runs" : `${n(count)} ${count === 1 ? "job" : "jobs"}`;
  switch (live.kind) {
    case "stream":
      return `live from the engine · ${jobs}`;
    case "polling":
      return `read every few seconds · ${jobs}`;
    case "still":
      return jobs;
  }
}

export type Live = { kind: "stream" } | { kind: "polling"; why: string } | { kind: "still" };

/** What one `jobs` event of the stream carries: the epoch and the open jobs; null for a line the desk cannot read. */
export function parseJobsEvent(data: string): { epoch: number | null; jobs: ChainedJob[] } | null {
  try {
    const v = JSON.parse(data) as { epoch?: unknown; jobs?: unknown };
    if (!Array.isArray(v.jobs)) return null;
    return { epoch: typeof v.epoch === "number" ? v.epoch : null, jobs: v.jobs as ChainedJob[] };
  } catch {
    return null;
  }
}

/** What the page needs of an event stream, so a test can stand one in. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (e: { data?: string }) => void): void;
  close(): void;
}

export interface LiveOptions {
  /** Whether the engine serves the stream at all. */
  served: boolean;
  onJobs: (jobs: ChainedJob[]) => void;
  onLive: (live: Live) => void;
  /** Opens the stream; null where the browser has none. */
  open?: (url: string) => EventSourceLike | null;
  /** The read the fallback makes every few seconds. */
  poll: () => Promise<{ jobs: ChainedJob[] }>;
  everyMs?: number;
  url?: string;
}

/**
 * The open jobs, live: from the engine's event stream where it serves one
 * and admits this reader, else read every few seconds from the jobs door.
 * The stream refuses with 503 once the engine's cap of open streams is
 * reached, which the browser reports as an error, so any error falls back to
 * reading. Answers a function that stops both.
 */
export function liveJobs(o: LiveOptions): () => void {
  const every = o.everyMs ?? 3000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let source: EventSourceLike | null = null;

  const readAgain = () => {
    if (stopped) return;
    o.poll()
      .then((r) => {
        if (!stopped) o.onJobs(r.jobs);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!stopped) timer = setTimeout(readAgain, every);
      });
  };
  const fallBack = (why: string) => {
    if (source) {
      source.close();
      source = null;
    }
    o.onLive({ kind: "polling", why });
    readAgain();
  };

  const opener = o.open ?? ((url: string) => (typeof EventSource === "undefined" ? null : new EventSource(url)));
  if (o.served) {
    try {
      source = opener(o.url ?? "/api/events");
    } catch {
      source = null;
    }
  }
  if (!source) {
    fallBack(o.served ? "this browser opens no event stream" : "the engine serves no event stream");
  } else {
    let heard = false;
    source.addEventListener("jobs", (e) => {
      if (stopped) return;
      // a line the desk cannot read is left alone; the next second brings another
      const got = parseJobsEvent(e.data ?? "");
      if (!got) return;
      if (!heard) {
        heard = true;
        o.onLive({ kind: "stream" });
      }
      o.onJobs(got.jobs);
    });
    source.addEventListener("error", () => {
      if (stopped || source === null) return;
      fallBack(heard ? "the stream closed" : "the stream refused");
    });
  }
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (source) source.close();
    source = null;
  };
}
