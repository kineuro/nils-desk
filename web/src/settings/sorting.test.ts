// SPDX-License-Identifier: AGPL-3.0-only
// Sorting the scans again under the rules now in force (gate T31, walkthrough
// step 9.5), the pure parts: who may, the engine's command and the job's name,
// which scans were sorted under other rules, and what the dialog says before
// the sort runs.

import { describe, expect, it } from "vitest";
import { caps7a } from "../../test/safeWayIn";
import type { Summary } from "../objects/client";
import { scansOf, sortAgainCommand, sortAgainRefusal, sortAgainWords } from "./sorting";

const summary = (by: Record<string, number> | undefined, total = 37059): Pick<Summary, "stacks"> => ({ stacks: { total, by_cohort: {}, ...(by ? { by_pack_version: by } : {}) } });

describe("who may sort the scans again", () => {
  it("is a person with work on Pipelines, where the engine queues jobs", () => {
    expect(sortAgainRefusal(caps7a(["POST /api/jobs"]))).toBeNull();
    expect(sortAgainRefusal(caps7a(["POST /api/jobs"], ["install:work", "data:work", "pipelines:see"]))).toBe("Sorting the scans again needs work on the Pipelines page.");
    expect(sortAgainRefusal(caps7a([]))).toBe("This engine queues no jobs.");
  });
});

describe("the sort the engine is asked for", () => {
  it("is classify over every scan under one pack, the job named for the pack and its version", () => {
    expect(sortAgainCommand("mri", "1.2.3")).toEqual({ command: ["classify", "--pack", "mri", "--name", "pack-mri-1.2.3"], name: "pack-mri-1.2.3" });
    expect(sortAgainCommand("mri", null)).toEqual({ command: ["classify", "--pack", "mri", "--name", "pack-mri"], name: "pack-mri" });
  });

  it("names no scope, so the engine judges every scan the pack covers, as Read new files does", () => {
    expect(sortAgainCommand("mri", "1.2.3").command).not.toContain("--scope");
  });
});

describe("which scans were sorted under other rules", () => {
  it("counts those sorted under a version no pack in force has", () => {
    expect(scansOf(summary({ "1.2.2": 36100, "1.2.3": 959 }), ["1.2.3"])).toEqual({ total: 37059, older: 36100 });
    expect(scansOf(summary({ "1.2.3": 37059 }), ["1.2.3"])).toEqual({ total: 37059, older: 0 });
    // a second pack in force is not older rules for the scans it sorted
    expect(scansOf(summary({ "1.2.3": 30000, "0.4.0": 7059 }), ["1.2.3", "0.4.0"])).toEqual({ total: 37059, older: 0 });
  });

  it("says nothing of older rules where the summary does not count by version", () => {
    expect(scansOf(summary(undefined), ["1.2.3"])).toEqual({ total: 37059, older: null });
  });
});

describe("what a sort again says before it runs", () => {
  it("is every scan, and how many were sorted under other rules", () => {
    expect(sortAgainWords("MRI rules", "1.2.3", { total: 37059, older: 36100 })).toEqual(["Sorts all 37,059 scans again under MRI rules 1.2.3.", "36,100 were sorted under other rules."]);
    expect(sortAgainWords("MRI rules", "1.2.3", { total: 3, older: 1 })).toEqual(["Sorts all 3 scans again under MRI rules 1.2.3.", "1 was sorted under other rules."]);
  });

  it("says when every scan was sorted under these rules already", () => {
    expect(sortAgainWords("MRI rules", "1.2.3", { total: 37059, older: 0 })).toEqual(["Sorts all 37,059 scans again under MRI rules 1.2.3.", "All were sorted under 1.2.3 already."]);
  });

  it("says it in fewer words where the registry's counts are not known, and where it holds no scan", () => {
    expect(sortAgainWords("MRI rules", "1.2.3", null)).toEqual(["Sorts every scan again under MRI rules 1.2.3."]);
    expect(sortAgainWords("MRI rules", null, null)).toEqual(["Sorts every scan again under MRI rules."]);
    expect(sortAgainWords("MRI rules", "1.2.3", { total: 0, older: 0 })).toEqual(["Sorts all 0 scans again under MRI rules 1.2.3."]);
    expect(sortAgainWords("MRI rules", "1.2.3", { total: 1, older: null })).toEqual(["Sorts all 1 scan again under MRI rules 1.2.3."]);
  });
});
