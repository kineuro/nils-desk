// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { stationOf } from "./Pane";

const caps = (stations: { id: string }[] | null): Capabilities =>
  ({ assistant: stations === null ? null : { stations }, kvasir: null, engine: null, apps: [], person: { subject: "a", display_name: "A", entitlements: [], roles: [] }, desk: {} }) as unknown as Capabilities;

describe("the station the pane speaks to", () => {
  it("is the concierge when the assistant serves one, else ask-help", () => {
    expect(stationOf(caps([{ id: "ask-help" }, { id: "concierge" }]))).toBe("concierge");
    expect(stationOf(caps([{ id: "ask-help" }]))).toBe("ask-help");
    expect(stationOf(caps(null))).toBe("ask-help");
  });
});
