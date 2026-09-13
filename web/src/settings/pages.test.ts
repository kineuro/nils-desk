// SPDX-License-Identifier: AGPL-3.0-only
// Settings' pages: which are offered to whom, and the page an address opens.

import { describe, expect, it } from "vitest";
import type { Capabilities, Entitlement } from "../capabilities";
import { settingsPage, settingsPages } from "./pages";

function caps(entitlements: Entitlement[], over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.14" },
      contracts: {},
      doors: [],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 0 },
      packs: [],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "p", display_name: "p", entitlements, roles: [] },
    desk: { version: "1.0.0-alpha.14", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    ...over,
  };
}

const served = (entitlements: Entitlement[], doors: string[]): Capabilities => {
  const c = caps(entitlements);
  return { ...c, engine: { ...c.engine!, doors } };
};

describe("the settings pages", () => {
  it("are an operator's and an admin's, and nobody else's", () => {
    expect(settingsPages(caps(["reader", "reviewer", "assist"]))).toEqual([]);
    expect(settingsPages(caps(["operator"])).map((p) => p.id)).toEqual(["overview", "parts", "engine", "desk"]);
  });

  it("name the gateway and the assistant under the parts, where they answered", () => {
    const both = caps(["operator"], { kvasir: { models: [] }, assistant: { stations: [] } });
    expect(settingsPages(both).map((p) => p.id)).toEqual(["overview", "parts", "engine", "desk", "gateway", "assistant"]);
    expect(settingsPages(both).filter((p) => p.sub).map((p) => p.id)).toEqual(["engine", "desk", "gateway", "assistant"]);
  });

  it("offer the places where the engine serves them, and the database, identity and the audit log to an admin", () => {
    const doors = ["GET /api/places", "GET /api/backups", "GET /api/audit"];
    expect(settingsPages(served(["operator"], doors)).map((p) => p.id)).toEqual(["overview", "parts", "engine", "desk", "places"]);
    expect(settingsPages(served(["admin"], doors)).map((p) => p.id)).toEqual(["overview", "parts", "engine", "desk", "places", "database", "identity", "audit"]);
    expect(settingsPages(caps(["admin"])).map((p) => p.id)).toEqual(["overview", "parts", "engine", "desk", "identity"]);
  });

  it("open the page an address names, and the overview for anything else", () => {
    const pages = settingsPages(caps(["admin"]));
    expect(settingsPage(pages, "desk")?.id).toBe("desk");
    expect(settingsPage(pages, "nowhere")?.id).toBe("overview");
    expect(settingsPage(pages, null)?.id).toBe("overview");
    expect(settingsPage([], "parts")).toBeNull();
  });
});
