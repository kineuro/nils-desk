// SPDX-License-Identifier: AGPL-3.0-only
// Now (record 26, D1): the job cards from the jobs door's rows, with the
// chain queued after a job as one card, the progress with its rate and what
// is left, the held count of a pseudonymise, the cancel with its reason, and
// a failed job with its next move; and the live feed, from the event stream
// where it answers, else read every few seconds.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chain from "../../test/fixtures/jobs_chain.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, SETS } from "../grants";
import type { ChainedJob } from "./datasets";
import { cancelRefusal, doingWords, jobCards, liveJobs, nowWords, progressOf, type EventSourceLike } from "./now";

const rows = (chain as { jobs: ChainedJob[] }).jobs;
const open = rows.filter((j) => j.state !== "failed");
const failed = rows.filter((j) => j.state === "failed");
const now = Date.parse("2026-09-15T21:03:15Z");

function caps(grants: readonly string[] = GRANTS): Capabilities {
  return {
    engine: null,
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: [...grants] as Capabilities["person"]["grants"], detail: "sensitive", groups: [] },
    desk: { version: "1", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

describe("the job cards", () => {
  it("draw a running job with what, who, since and its progress, and the chain after it as one dashed card", () => {
    const cards = jobCards(open, [], caps(), now);
    expect(cards.map((c) => [c.kind, c.what])).toEqual([
      ["running", "Pseudonymising incoming"],
      ["chain", "Then digest, then sort"],
      ["running", "Digesting archive"],
      ["chain", "Then sort"],
    ]);
    const [pseud, then, digest] = cards;
    // since a time today, as the browser's own clock draws it
    expect(pseud.line).toMatch(/^job 120 · astrid · since \d\d:\d\d · then digest, then sort$/u);
    expect(pseud.progress?.words).toBe("1,766 of 2,208 files · 24 a second · under a minute left · 4 held until mapped");
    expect(Math.round((pseud.progress?.fraction ?? 0) * 100)).toBe(80);
    expect(pseud.cancel).toEqual({ label: "Cancel", refusal: null });
    // the queued digest waits for job 120, so it is the chain's card, dropped by its own id
    expect(then).toMatchObject({ kind: "chain", id: 122, line: "waits for job 120", cancel: { label: "Drop", refusal: null } });
    expect(digest.progress).toEqual({ fraction: null, words: "11,420 files · 7 a second · 3 refused" });
  });

  it("keep the cancel button and say why when a person lacks the verb's grant", () => {
    const reviewer = caps(SETS.reviewer.grants);
    const [pseud, , digest] = jobCards(open, [], reviewer, now);
    expect(pseud.cancel?.refusal).toBe("Cancelling a pseudonymisation needs work on the Data page.");
    expect(digest.cancel?.refusal).toBe("Cancelling a digest needs work on the Data page.");
    const sort: ChainedJob = { ...open[1], id: 130, kind: "classify", args: { argv: ["classify", "--pack", "mri"], principal: "astrid" }, then: null, chain: null };
    expect(cancelRefusal(caps(["data:work"]), sort)).toBe("Cancelling a sort needs work on the Pipelines page.");
    expect(cancelRefusal(caps(["pipelines:work"]), sort)).toBeNull();
    const release: ChainedJob = { ...sort, kind: "release", args: { argv: ["release", "--name", "spring"], principal: "astrid" } };
    expect(cancelRefusal(reviewer, release)).toBe("Cancelling a release needs work on the Release page.");
  });

  it("draw a failed job with its error and one next move", () => {
    const cards = jobCards([], failed, caps(), now);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "failed", what: "Digest of exchange-ct stopped", cancel: null });
    expect(cards[0].line).toBe("job 117 · 15 Aug · 0 files");
    expect(cards[0].failed).toEqual({ error: "no pack reads CT", next: { label: "Read again", command: ["digest", "@exchange-ct"], name: "exchange-ct" } });
  });

  it("read a queued job that waits for nothing as its own card, and leave the queue's worker out", () => {
    const alone: ChainedJob = { ...open[0], chain: { before: null, after: null }, then: null };
    const worker: ChainedJob = { ...alone, id: 1, kind: "worker", args: { argv: ["worker"] } };
    const cards = jobCards([alone, worker], [], caps(), now);
    expect(cards.map((c) => [c.kind, c.what])).toEqual([["queued", "Digesting incoming"]]);
    expect(cards[0].line).toMatch(/^queued · job 122 · astrid · since \d\d:\d\d$/u);
    expect(doingWords({ ...alone, args: { argv: ["backup", "--dir", "/x"] } })).toBe("Backing up");
    expect(progressOf({ ...alone, progress: null }, now)).toBeNull();
    expect(progressOf({ ...alone, progress: { phase: "walking" } }, now)).toBeNull();
  });

  it("say how Now is fed", () => {
    expect(nowWords({ kind: "stream" }, 2)).toBe("live from the engine · 2 jobs");
    expect(nowWords({ kind: "polling", why: "the stream refused" }, 1)).toBe("read every few seconds · 1 job");
    expect(nowWords({ kind: "still" }, 0)).toBe("nothing runs");
  });
});

/** An event stream a test drives. */
function fakeStream() {
  const listeners = new Map<string, ((e: { data?: string }) => void)[]>();
  const source: EventSourceLike & { emit: (type: string, data?: string) => void; closed: boolean } = {
    closed: false,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    close: () => {
      source.closed = true;
    },
    emit: (type, data) => {
      for (const fn of listeners.get(type) ?? []) fn({ data });
    },
  };
  return source;
}

describe("the live feed", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reads the jobs from the stream's events and says it is live", async () => {
    const source = fakeStream();
    const onJobs = vi.fn();
    const onLive = vi.fn();
    const poll = vi.fn(async () => ({ jobs: [] }));
    const stop = liveJobs({ served: true, open: () => source, poll, onJobs, onLive });
    source.emit("hello", "{}");
    source.emit("jobs", JSON.stringify({ epoch: 412, jobs: open }));
    expect(onLive).toHaveBeenCalledWith({ kind: "stream" });
    expect(onJobs).toHaveBeenCalledWith(open);
    expect(poll).not.toHaveBeenCalled();
    stop();
    expect(source.closed).toBe(true);
  });

  it("falls back to reading every few seconds when the stream refuses, as it does with 503 at the engine's cap", async () => {
    const source = fakeStream();
    const onJobs = vi.fn();
    const onLive = vi.fn();
    const poll = vi.fn(async () => ({ jobs: open }));
    const stop = liveJobs({ served: true, open: () => source, poll, onJobs, onLive, everyMs: 3000 });
    source.emit("error");
    expect(source.closed).toBe(true);
    expect(onLive).toHaveBeenCalledWith({ kind: "polling", why: "the stream refused" });
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3100);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(onJobs).toHaveBeenCalledWith(open);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("reads every few seconds from the start where the engine serves no stream", async () => {
    const onLive = vi.fn();
    const poll = vi.fn(async () => ({ jobs: [] }));
    const open = vi.fn();
    const stop = liveJobs({ served: false, open, poll, onJobs: vi.fn(), onLive });
    expect(open).not.toHaveBeenCalled();
    expect(onLive).toHaveBeenCalledWith({ kind: "polling", why: "the engine serves no event stream" });
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
  });
});
