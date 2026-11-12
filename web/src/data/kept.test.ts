// SPDX-License-Identifier: AGPL-3.0-only
// Who the Data page's reads are kept for, and a summary kept beside the list
// it belongs to (2026-11-12).

import { afterEach, describe, expect, it } from "vitest";
import { caps7a } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { GRANTS } from "../grants";
import type { Dataset } from "./datasets";
import { forgetData, keepSummary, LIST, sourcesKept, summariesKept, takeData, whoOf } from "./kept";
import type { DatasetSummary, PendingSummary } from "./summary";

afterEach(() => forgetData());

const DOORS = ["GET /api/sources", "GET /api/cohorts"];

describe("who the Data page's reads are kept for", () => {
  it("is the same person across the shell's reads, whatever else the document says", () => {
    const who = whoOf(caps7a(DOORS));
    const moved = caps7a([...DOORS, "GET /api/places"], [...GRANTS].reverse());
    moved.engine!.registry.epoch = 9;
    moved.engine!["uptime_seconds"] = 4_000;
    expect(whoOf(moved)).toBe(who);
  });

  it("is another once the person, their sign-in or what they may read is another", () => {
    const who = whoOf(caps7a(DOORS));
    const changes: ((c: Capabilities) => void)[] = [
      (c) => void (c.person.subject = "birgit"),
      (c) => void (c.person.grants = c.person.grants.filter((g) => g !== "data:work")),
      (c) => void (c.person.detail = "plain"),
      (c) => void (c.person.groups = ["readers"]),
      (c) => void (c.desk.signed_in = false),
      (c) => void (c.desk.mode = "local"),
      (c) => void (c.engine!.principal = "birgit"),
    ];
    for (const change of changes) {
      const other = caps7a(DOORS);
      change(other);
      expect(whoOf(other)).not.toBe(who);
    }
  });
});

describe("a dataset's summary kept", () => {
  const sum = (dataset: string) => ({ dataset, steps: [] }) as unknown as DatasetSummary;
  const pending = (seen: number) => ({ counted: false, count: { seen } }) as unknown as PendingSummary;

  it("keeps how far a first count has got beside the summary there was, and the summary alone once it lands", () => {
    takeData("astrid");
    keepSummary("astrid", "ward-f", summariesKept.sent(), pending(10));
    expect(summariesKept.get("astrid")["ward-f"]).toEqual({ sum: null, first: { seen: 10 } });
    const s = sum("ward-f");
    keepSummary("astrid", "ward-f", summariesKept.sent(), s);
    expect(summariesKept.get("astrid")["ward-f"]).toEqual({ sum: s, first: null });
    keepSummary("astrid", "ward-f", summariesKept.sent(), pending(20));
    expect(summariesKept.get("astrid")["ward-f"]).toEqual({ sum: s, first: { seen: 20 } });
  });

  it("lets go of the summary of a dataset the kept list no longer names, and of one read for another person", () => {
    takeData("astrid");
    sourcesKept.land("astrid", LIST, sourcesKept.sent(), [{ name: "ward-f" } as Dataset]);
    keepSummary("astrid", "ward-gone", summariesKept.sent(), sum("ward-gone"));
    keepSummary("birgit", "ward-f", summariesKept.sent(), sum("ward-f"));
    expect(summariesKept.get("astrid")).toEqual({});
    keepSummary("astrid", "ward-f", summariesKept.sent(), sum("ward-f"));
    expect(Object.keys(summariesKept.get("astrid"))).toEqual(["ward-f"]);
  });
});
