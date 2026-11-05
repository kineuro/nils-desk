// SPDX-License-Identifier: AGPL-3.0-only
// A step's Run on the rail of a dataset or a cohort (record 56, 2026-10-10):
// offered on body part and post-contrast where the engine has the door and
// the person works on Pipelines, never while the step waits its turn or
// runs; held with the engine's reason behind a "?" where a run would be
// refused, or where a run reads images the person may not see; every one
// held while a press is answered; and a refusal at the door said plainly.
// Main scans' Run (2026-10-11): the pick run door, with Pipelines work,
// never while a pick waits or runs or picking is off, held without scans;
// their link to the Main scans page where the person may read it.

import { describe, expect, it } from "vitest";
import { caps7a } from "../../test/safeWayIn";
import { DoorError } from "../ask/client";
import { GRANTS, type Grant } from "../grants";
import { plainError } from "./plain";
import { actsWords, choosingOffers, MAIN_SCANS_HELP, mainScansMore, pickControl, pickOffer, runActs, runControl, runOffers, startedWords, STEP_RUN_DOORS } from "./stepRun";
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
    // 2026-11-05: the sort runs from the card too, and asks no quasi detail
    expect(runControl(caps, "datasets", step({ step: "sorted", state: "done" }))?.label).toBe("Run again");
    expect(runControl(caps, "cohorts", step({ step: "sorted" }))).toEqual({ label: "Run", disabled: false, why: null });
    expect(startedWords("combat", "sorted")).toBe("combat: sort queued.");
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
    // 2026-11-05: the sort's Run again stands beside the operations'
    expect(Object.keys(offers)).toEqual(["sorted", "body_part", "post_contrast"]);
    expect(offers.sorted?.label).toBe("Run again");
    expect(offers.body_part?.disabled).toBe(false);
    expect(offers.post_contrast?.disabled).toBe(true);
    offers.body_part?.onRun();
    expect(ran).toEqual(["body_part"]);
    expect(runOffers(caps, "datasets", steps, true, () => undefined).body_part?.disabled).toBe(true);
    expect(startedWords("study-big", "body_part")).toBe("study-big: body part queued.");
    expect(startedWords("ms-followup", "post_contrast")).toBe("ms-followup: post-contrast queued.");
  });
});

describe("main scans' Run", () => {
  const PICK = "POST /api/picks/run";
  const main = (over: Partial<SummaryStep> = {}): SummaryStep => step({ step: "main_scans", state: "done", picked: 9, borders: 0, ...over });

  it("is offered with the pick run door and work on Pipelines: Run, or Run again once it picked", () => {
    const caps = caps7a([PICK]);
    expect(pickControl(caps, main(), 40)).toEqual({ label: "Run again", disabled: false, why: null });
    expect(pickControl(caps, main({ state: "waiting", picked: 0 }), 40)?.label).toBe("Run");
    expect(pickControl(caps, main({ state: "failed" }), 40)?.label).toBe("Run again");
    expect(pickControl(caps, step(), 40)).toBeNull();
    expect(pickControl(caps, null, 40)).toBeNull();
  });

  it("is not offered while a pick waits or runs, where picking is off, nor without the door or work on Pipelines", () => {
    const caps = caps7a([PICK]);
    expect(pickControl(caps, main({ state: "queued", job: 30 }), 40)).toBeNull();
    expect(pickControl(caps, main({ state: "running", job: 30 }), 40)).toBeNull();
    expect(pickControl(caps, main({ state: "off" }), 40)).toBeNull();
    expect(pickControl(caps7a(DOORS), main(), 40)).toBeNull();
    const looks: Grant[] = GRANTS.filter((g) => g !== "pipelines:work");
    expect(pickControl(caps7a([PICK], looks), main(), 40)).toBeNull();
  });

  it("is held without scans to pick from, and while a press is answered or the chain runs", () => {
    const caps = caps7a([PICK]);
    expect(pickControl(caps, main({ state: "waiting", picked: 0 }), 0)).toEqual({ label: "Run", disabled: true, why: "There are no scans to pick from yet." });
    let ran = 0;
    const offer = pickOffer(caps, main(), 40, false, () => ran++);
    expect(offer?.disabled).toBe(false);
    offer?.onRun();
    expect(ran).toBe(1);
    expect(pickOffer(caps, main(), 40, true, () => undefined)?.disabled).toBe(true);
    expect(startedWords("study-big", "main_scans")).toBe("study-big: main scans queued.");
  });

  it("links to the dataset's Main scans page where the person may read it, with one line of help", () => {
    expect(mainScansMore(caps7a([]), "study-big")).toEqual({ link: { label: "Rules", href: "#review/picks?dataset=study-big" }, help: MAIN_SCANS_HELP });
    const blind: Grant[] = GRANTS.filter((g) => !g.startsWith("review:"));
    expect(mainScansMore(caps7a([], blind), "study-big").link).toBeNull();
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

// 2026-11-05: a dataset's body part said "135 with no body part", and its Run
// went over all 456,132 scans in 23 parts; nothing said what it would cover.
describe("what a step's Run would go over, said before it starts", () => {
  const runs = (all: number, without: number, parts = 1) => ({ all: { scans: all, parts }, without: { scans: without, parts: without > 0 ? 1 : 0 } });

  it("offers a model step's scans without its answer first, then every scan with the parts it takes", () => {
    const acts = runActs(step({ state: "done", answered: 455997, of: 456132, runs: runs(456132, 135, 23) }));
    expect(acts).toEqual([
      { over: "without", label: "Run on the 135 without a body part", scans: 135, parts: 1, primary: true },
      { over: "all", label: "Run again on all 456,132", scans: 456132, parts: 23, primary: false },
    ]);
    expect(actsWords(acts)).toBe("Run on the 135 without a body part, or run again on all 456,132 in 23 parts");
    expect(runActs(step({ step: "post_contrast", state: "done", runs: runs(900, 40) }))[0].label).toBe("Run on the 40 T1 brain, contrast unknown");
  });

  it("offers every scan alone where none has its answer yet, or every one has", () => {
    expect(runActs(step({ runs: runs(3, 3) }))).toEqual([{ over: "all", label: "Run on all 3", scans: 3, parts: 1, primary: true }]);
    expect(runActs(step({ state: "done", runs: runs(3, 0) }))).toEqual([{ over: "all", label: "Run again on all 3", scans: 3, parts: 1, primary: true }]);
  });

  it("says the sort's every scan and main scans' every subject; an engine from before, the step's count", () => {
    expect(runActs(step({ step: "sorted", state: "done", of: 456132 }))).toEqual([{ over: "all", label: "Run again on all 456,132", scans: 456132, parts: 1, primary: true }]);
    expect(runActs(step({ step: "main_scans", state: "done" }), 89)[0].label).toBe("Run again for all 89 subjects");
    expect(runActs(step({ step: "main_scans", state: "waiting" }), 1)[0].label).toBe("Run for its 1 subject");
    expect(runActs(step({ of: 40 }))).toEqual([{ over: "all", label: "Run on all 40", scans: 40, parts: 1, primary: true }]);
  });

  it("marks the Run whose acts are open, and says what was queued", () => {
    const caps = caps7a(DOORS);
    const offers = choosingOffers(runOffers(caps, "datasets", [step(), step({ step: "sorted" })], false, () => undefined), "body_part");
    expect(offers.body_part?.open).toBe(true);
    expect(offers.sorted?.open).toBe(false);
    expect(startedWords("study-big", "body_part", { scans: 135, parts: 1 })).toBe("study-big: body part queued on 135 scans.");
    expect(startedWords("study-big", "body_part", { scans: 456132, parts: 23 })).toBe("study-big: body part queued on 456,132 scans, in 23 parts.");
    expect(startedWords("study-big", "body_part")).toBe("study-big: body part queued.");
  });
});
