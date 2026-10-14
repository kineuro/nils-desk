// SPDX-License-Identifier: AGPL-3.0-only
// No command line inside a flow (record 55 H2, round 4): a pipeline added, the
// lane changed and a session scheme kept in the desk, each sent as the
// engine's doors of 2026-10-14 take it, and offered only by the grants.
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { addedWords, laneChange, laneWords, setupActs, type Lane } from "./pipelineSetup";
import { schemeActs, schemeOf, schemeWords } from "./schemes";

const caps = (grants: string[], doors: string[]): Capabilities =>
  ({ engine: { doors }, person: { grants, detail: "plain" }, desk: {} }) as unknown as Capabilities;

const LANE: Lane = { cores: 48, memory_gb: 512, gpu_card: 0, places: { output: null, scratch: null } };

describe("the pipelines' setup", () => {
  it("says what Add did: added, or held already, and what it replaces", () => {
    expect(addedWords({ id: 3, name: "n4", version: 2, label: "n4@2", image: "x", added: true, replaces: ["n4@1"], replaces_why: null })).toBe("Added n4@2. It replaces n4@1, which a new run no longer takes.");
    expect(addedWords({ id: 3, name: "n4", version: 2, label: "n4@2", image: "x", added: false, replaces: [], replaces_why: null })).toBe("The catalog already holds n4@2.");
  });
  it("sends only what changed in the lane, and refuses what is not a value", () => {
    const form = { cores: "48", memory: "512", card: "0", output: "", scratch: "" };
    expect(laneChange(LANE, form)).toEqual({});
    expect(laneChange(LANE, { ...form, cores: "16", card: "none", output: "fast" })).toEqual({ cores: 16, gpu_card: "none", output_place: "fast" });
    expect(laneChange(LANE, { ...form, cores: "0" })).toBe("Cores is a whole number above 0");
    expect(laneChange(LANE, { ...form, card: "first" })).toBe("The card is its index, or none");
    expect(laneWords(LANE)).toBe("48 cores, 512 GB, card 0; outputs to the first working place, scratch to the first working place");
  });
  it("offers adding, changing and setting only with work on the install, and seeing with the pipelines", () => {
    const doors = ["POST /api/pipelines", "GET /api/pipelines/lane", "PUT /api/pipelines/lane", "GET /api/pipelines/secrets", "PUT /api/pipelines/secrets/{id}"];
    expect(setupActs(caps(["pipelines:see", "pipelines:work"], doors))).toEqual({ add: false, seeLane: true, lane: false, seeSecrets: true, secrets: false });
    expect(setupActs(caps(["pipelines:see", "install:work"], doors))).toEqual({ add: true, seeLane: true, lane: true, seeSecrets: true, secrets: true });
    expect(setupActs(caps(["pipelines:see", "install:work"], []))).toEqual({ add: false, seeLane: false, lane: false, seeSecrets: false, secrets: false });
  });
});

describe("session schemes", () => {
  it("make a scheme from the form as the engine keeps it, and say what is wrong in words", () => {
    expect(schemeOf({ name: "baseline", naming: "months", cadence: "24, 0, 6 12", tolerance: "", window: "0" })).toEqual({
      name: "baseline",
      scheme: { window_days: 0, anchor: "first_session", naming: { months: { cadence: [0, 6, 12, 24], tolerance: 1.5 } } },
    });
    expect(schemeOf({ name: "by-day", naming: "date", cadence: "", tolerance: "", window: "3" })).toEqual({ name: "by-day", scheme: { window_days: 3, anchor: "first_session", naming: "date" } });
    expect(schemeOf({ name: "a b", naming: "date", cadence: "", tolerance: "", window: "0" })).toBe("A name is letters, digits, dot, dash and underscore");
    expect(schemeOf({ name: "m", naming: "months", cadence: "six", tolerance: "", window: "0" })).toBe("The visit months are whole numbers, such as 0, 6, 12, 24");
  });
  it("say a scheme in a few words", () => {
    expect(schemeWords({ naming: { months: { cadence: [0, 6], tolerance: 1.5 } }, window_days: 0 })).toBe("months from the first session, on 0, 6; studies within the same day are one session");
    expect(schemeWords({ naming: "ordinal", window_days: 1 })).toBe("numbered in order; studies within 1 day are one session");
  });
  it("are listed with Release: See and kept with Release: Work", () => {
    const doors = ["GET /api/session-schemes", "POST /api/session-schemes"];
    expect(schemeActs(caps(["release:see"], doors))).toEqual({ see: true, add: false });
    expect(schemeActs(caps(["release:see", "release:work"], doors))).toEqual({ see: true, add: true });
  });
});
