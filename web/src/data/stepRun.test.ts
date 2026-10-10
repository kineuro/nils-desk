// SPDX-License-Identifier: AGPL-3.0-only
// A step's Run on the rail of a dataset or a cohort (record 56, 2026-10-10):
// offered on body part and post-contrast where the engine has the door and
// the person works on Pipelines, never while the step waits its turn or
// runs; held with the engine's reason behind a "?" where a run would be
// refused, or where a run reads images the person may not see; every one
// held while a press is answered; and a refusal at the door said plainly.

import { describe, expect, it } from "vitest";
import { caps7a } from "../../test/safeWayIn";
import { DoorError } from "../ask/client";
import { GRANTS, type Grant } from "../grants";
import { plainError } from "./plain";
import { runControl, runOffers, startedWords, STEP_RUN_DOORS } from "./stepRun";
import type { SummaryStep } from "./summary";

const DOORS = [STEP_RUN_DOORS.datasets, STEP_RUN_DOORS.cohorts];

const step = (over: Partial<SummaryStep> = {}): SummaryStep => ({
  step: "body_part",
  state: "waiting",
  job: null,
  started_at: null,
  finished_at: null,
  progress: null,
  served: true,
  answered: 0,
  look: 0,
  of: 40,
  jobs: [],
  refusal: null,
  ...over,
});

const NONE = { error: "no post-contrast model is installed", reason: "no_model" };

describe("a step's Run", () => {
  it("is offered on body part and post-contrast: Run, or Run again once it ran or failed", () => {
    const caps = caps7a(DOORS);
    expect(runControl(caps, "datasets", step())).toEqual({ label: "Run", disabled: false, why: null });
    expect(runControl(caps, "cohorts", step({ state: "done", answered: 36 }))?.label).toBe("Run again");
    expect(runControl(caps, "datasets", step({ state: "failed" }))?.label).toBe("Run again");
    expect(runControl(caps, "datasets", step({ step: "sorted" }))).toBeNull();
  });

  it("is held with the engine's reason where a run would be refused", () => {
    const caps = caps7a(DOORS);
    expect(runControl(caps, "datasets", step({ step: "post_contrast", state: "off", served: false, refusal: NONE }))).toEqual({
      label: "Run",
      disabled: true,
      why: "no post-contrast model is installed",
    });
  });

  it("is not offered while the step waits its turn or runs, nor without the door or work on Pipelines", () => {
    const caps = caps7a(DOORS);
    expect(runControl(caps, "datasets", step({ state: "queued", job: 12 }))).toBeNull();
    expect(runControl(caps, "datasets", step({ state: "running", job: 12 }))).toBeNull();
    expect(runControl(caps7a([STEP_RUN_DOORS.cohorts]), "datasets", step())).toBeNull();
    const looks: Grant[] = GRANTS.filter((g) => g !== "pipelines:work");
    expect(runControl(caps7a(DOORS, looks), "datasets", step())).toBeNull();
  });

  it("is held where a model would read images the person may not see", () => {
    const caps = caps7a(DOORS);
    const plain = { ...caps, person: { ...caps.person, detail: "plain" as const } };
    expect(runControl(plain, "datasets", step())).toMatchObject({ disabled: true, why: "A model reads the scans' images, which needs quasi detail." });
  });

  it("holds every Run of a rail while a press is answered, and runs its own step", () => {
    const caps = caps7a(DOORS);
    const ran: string[] = [];
    const steps = [step({ step: "sorted", state: "done" }), step(), step({ step: "post_contrast", state: "off", refusal: NONE })];
    const offers = runOffers(caps, "datasets", steps, false, (s) => ran.push(s));
    expect(Object.keys(offers)).toEqual(["body_part", "post_contrast"]);
    expect(offers.body_part?.disabled).toBe(false);
    expect(offers.post_contrast?.disabled).toBe(true);
    offers.body_part?.onRun();
    expect(ran).toEqual(["body_part"]);
    expect(runOffers(caps, "datasets", steps, true, () => undefined).body_part?.disabled).toBe(true);
    expect(startedWords("study-big", "body_part")).toBe("study-big: body part queued.");
    expect(startedWords("ms-followup", "post_contrast")).toBe("ms-followup: post-contrast queued.");
  });
});

describe("a step's run refused at its door", () => {
  it("is said plainly, the engine's words behind the ?", () => {
    const refused = (reason: string, step: string, error: string) => new DoorError(409, { error, reason, step, disclosure: "safe" });
    expect(plainError(refused("no_model", "post_contrast", "no post-contrast model is installed"))).toEqual({
      words: "No post-contrast model is installed.",
      detail: "no post-contrast model is installed",
    });
    expect(plainError(refused("no_pipeline", "body_part", "no body-part pipeline is installed")).words).toBe("No body-part model is installed.");
    expect(plainError(refused("running", "body_part", "body part runs already over these scans, as job 12")).words).toBe("Body part runs already.");
    expect(plainError(refused("no_runtime", "body_part", "pipelines are off: no container runtime here")).words).toBe("Models cannot run on this machine.");
    expect(plainError(refused("no_scans", "body_part", "there are no scans to run it over yet")).words).toBe("There are no scans to run it over yet.");
    // a reason the desk does not know is said as any refusal is
    expect(plainError(refused("new_reason", "body_part", "something new")).words).toBe("That did not work.");
  });
});
