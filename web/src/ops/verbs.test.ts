// SPDX-License-Identifier: AGPL-3.0-only
// The one table of verbs behind the Now cards and the Pipelines cards: every
// verb the door queues has words, a job's command line is read as queued or
// with the worker's own binary and registry stripped, and a job's target is
// what its line names, never a name that only repeats the verb.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { cancelNeeds, commandOf, doingWords, endedWords, nextMove, targetOf, verbOf, VERBS } from "./verbs";

const job = (argv: string[], name: string | null = null, over: Partial<JobRow> = {}): JobRow => ({
  id: 1,
  kind: argv[0] ?? "x",
  name,
  state: "failed",
  started_at: "2026-09-16T05:00:00Z",
  heartbeat_at: null,
  finished_at: "2026-09-16T05:00:01Z",
  progress: null,
  error: "exit status: 2",
  args: { argv, principal: "astrid" },
  result: null,
  ...over,
});

describe("a job's command line", () => {
  it("is what the engine recorded as queued, else the argv with the worker's binary and registry stripped", () => {
    expect(commandOf(job(["digest", "@north", "--name", "n"]))).toEqual(["digest", "@north", "--name", "n"]);
    expect(commandOf(job(["/home/lab/nils", "--registry", "/home/lab/registry", "linkage", "import", "/x/map.csv", "--place", "north"]))).toEqual(["linkage", "import", "/x/map.csv", "--place", "north"]);
    expect(commandOf(job(["nils", "--registry=/r", "classify", "--pack", "mri"]))).toEqual(["classify", "--pack", "mri"]);
    expect(commandOf({ args: { argv: ["/usr/bin/nils", "--registry", "/r", "digest", "@a"], queued: ["digest", "@a"], principal: "x" } })).toEqual(["digest", "@a"]);
    expect(commandOf({ args: {} })).toEqual([]);
  });
});

describe("the verb in words", () => {
  const QUEUED = ["pseudonymize", "bring-in", "digest", "fingerprint", "classify", "pick", "session", "pyramid", "release", "handover", "linkage import", "linkage merge", "backup", "verify", "ask run"];
  it("has words for every verb the door queues, so no card reads Running", () => {
    for (const verb of QUEUED) {
      const words = VERBS[verb];
      expect(words, verb).toBeDefined();
      expect(doingWords(job(verb.split(" ")))).not.toMatch(/^Running \S+ on\b/u);
      expect(endedWords(job(verb.split(" ")), "stopped")).toMatch(/ stopped$/u);
    }
    expect(doingWords(job(["something-new", "@a"]))).toBe("Running something-new on a");
  });
  it("names a map's job by the map and its dataset, and a merge's by the merge, never by a name that repeats the verb", () => {
    const map = job(["/home/lab/nils", "--registry", "/r", "linkage", "import", "/x/map.csv", "--column", "a=identifier:personnummer", "--place", "north", "--consume"], "north");
    expect(verbOf(map)).toBe("linkage import");
    expect(targetOf(map)).toBe("north");
    expect(doingWords(map)).toBe("Filing the map for north");
    expect(endedWords(map, "stopped")).toBe("Map import for north stopped");
    const merge = job(["/home/lab/nils", "--registry", "/r", "linkage", "merge", "S-0007", "S-0412", "--why", "one person"], "merge");
    expect(verbOf(merge)).toBe("linkage merge");
    expect(targetOf(merge)).toBeNull();
    expect(endedWords(merge, "stopped")).toBe("Merge stopped");
    expect(endedWords(merge, "done")).toBe("Merge done");
    expect(doingWords(merge)).toBe("Merging subjects");
    // a name that is the verb's own word says nothing either
    expect(targetOf(job(["digest", "--name", "x"], "digest"))).toBe("x");
    expect(targetOf(job(["fingerprint"], "fingerprint"))).toBeNull();
    expect(targetOf(job(["fingerprint"], "north-2026-09-16"))).toBe("north-2026-09-16");
  });
  it("reads the rest from the line: the place without its tree, the name, the pack; the worker is the worker", () => {
    expect(endedWords(job(["/home/lab/nils", "--registry", "/r", "pseudonymize", "@north/dcm-original", "--name", "north-2026-09-16"]), "stopped")).toBe("Pseudonymisation of north stopped");
    expect(endedWords(job(["classify", "--pack", "mri"]), "done")).toBe("Sort with mri done");
    expect(endedWords(job(["release", "--name", "north-2026.09.16.2"]), "stopped")).toBe("Release of north-2026.09.16.2 stopped");
    expect(endedWords(job(["ask", "run", "--handle", "3"], "visits"), "done")).toBe("Question of visits done");
    expect(doingWords(job(["backup", "--dir", "/b"], "nightly"))).toBe("Backing up");
    expect(doingWords(job(["ingest", "probe", "@north"]))).toBe("Probing the shapes of north");
    const worker = job(["/home/lab/nils", "serve", "--worker"], "queue", { kind: "worker", state: "running" });
    expect(verbOf(worker)).toBe("worker");
    expect(doingWords(worker)).toBe("Keeping the queue");
  });
  it("says the grant a cancel needs with its page, and the next move for a verb that is simply run again", () => {
    expect(cancelNeeds(job(["digest", "@a"]))).toEqual(["data:work", "the Data page"]);
    expect(cancelNeeds(job(["classify"]))).toEqual(["pipelines:work", "the Pipelines page"]);
    expect(cancelNeeds(job(["release"]))).toEqual(["release:work", "the Release page"]);
    expect(cancelNeeds(job(["backup"]))).toEqual(["database:work", "the Database page"]);
    expect(cancelNeeds(job(["ask", "run"]))).toEqual(["query:work", "the Query page"]);
    expect(cancelNeeds(job(["linkage", "merge"]))).toEqual(["data:work", "the Data page"]);
    expect(nextMove(job(["/home/lab/nils", "--registry", "/r", "digest", "@a", "--restart"]))).toEqual({ label: "Read again", command: ["digest", "@a"] });
    expect(nextMove(job(["linkage", "import", "/x/map.csv"]))).toEqual({ label: "File again", command: ["linkage", "import", "/x/map.csv"] });
    expect(nextMove(job(["ingest", "probe", "@a"]))).toBeNull();
    expect(nextMove(job([]))).toBeNull();
  });
});
