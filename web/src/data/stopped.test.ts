// SPDX-License-Identifier: AGPL-3.0-only
// Where a dataset's chain stopped (2026-10-10): the first step the engine
// says failed, and words for it where the job left none.

import { describe, expect, it } from "vitest";
import { failedStep, stoppedWords } from "./stopped";
import type { SummaryStep } from "./summary";

const step = (name: string, state: string, job: number | null = null): SummaryStep => ({ step: name, state, job }) as unknown as SummaryStep;

describe("a stopped chain", () => {
  it("is the first step of the chain the engine says failed, with its job", () => {
    expect(failedStep(null)).toBeNull();
    expect(failedStep({ steps: [step("found", "done"), step("pseudonymised", "done", 3), step("read", "waiting")] })).toBeNull();
    expect(failedStep({ steps: [step("pseudonymised", "failed", 154), step("read", "failed", 155)] })).toEqual({ step: "pseudonymised", job: 154 });
    expect(failedStep({ steps: [step("pseudonymised", "done", 150), step("read", "done", 151), step("sorted", "failed", 152)] })).toEqual({ step: "sorted", job: 152 });
    // a step outside the chain, or a failure with no job, is no stopped chain
    expect(failedStep({ steps: [step("body_part", "failed", 9), step("read", "failed")] })).toBeNull();
  });

  it("says the job's words, or a plain line where it left none", () => {
    expect(stoppedWords(" no id type named study-id ")).toBe("no id type named study-id");
    expect(stoppedWords(null)).toBe("the run ended without saying why");
    expect(stoppedWords("")).toBe("the run ended without saying why");
  });
});
