// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { operationsControls } from "../sections";
import { stationsServed } from "../assistant/stations";

const caps = (stationsList: { id: string }[] | null, doors: string[], entitlements: string[]): Capabilities =>
  ({
    assistant: stationsList === null ? null : { stations: stationsList },
    kvasir: null,
    engine: { doors, registry: { epoch: 1 }, packs: [] },
    apps: [],
    person: { subject: "a", display_name: "A", entitlements, roles: entitlements },
    desk: { contract_mismatch: null, engine_reachable: true, signed_in: true, login: null },
  }) as unknown as Capabilities;

describe("the keyword tab (section 9.13)", () => {
  const doors = ["GET /api/jobs", "GET /api/review", "GET /api/classify/signals"];
  it("sits beside the review queue only when the assistant serves keyword-tune and the person is a reviewer", () => {
    expect(operationsControls(caps([{ id: "keyword-tune" }], doors, ["reviewer"]))).toEqual(["jobs", "review", "keyword"]);
    expect(operationsControls(caps([{ id: "ask-help" }], doors, ["reviewer"]))).toEqual(["jobs", "review"]);
    expect(operationsControls(caps(null, doors, ["reviewer"]))).toEqual(["jobs", "review"]);
    expect(operationsControls(caps([{ id: "keyword-tune" }], doors, ["reader"]))).toEqual([]);
    expect(operationsControls(caps([{ id: "keyword-tune" }], ["GET /api/jobs", "GET /api/review"], ["reviewer"]))).toEqual(["jobs", "review"]);
  });
  it("reads the stations the assistant serves", () => {
    expect(stationsServed(caps([{ id: "concierge" }, { id: "identity-check" }], [], []))).toEqual(["concierge", "identity-check"]);
    expect(stationsServed(caps(null, [], []))).toEqual([]);
  });
});
