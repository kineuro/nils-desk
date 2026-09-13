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

describe("the settings pages", () => {
  it("are an operator's and an admin's, and nobody else's", () => {
    expect(settingsPages(caps(["reader", "reviewer", "assist"]))).toEqual([]);
    expect(settingsPages(caps(["operator"])).map((p) => p.id)).toEqual(["parts", "engine", "desk"]);
  });
  it("name the assistant only where one answered", () => {
    expect(settingsPages(caps(["admin"], { assistant: { stations: [] } })).map((p) => p.id)).toEqual(["parts", "engine", "desk", "assistant"]);
    expect(settingsPages(caps(["admin"])).filter((p) => p.sub).map((p) => p.id)).toEqual(["engine", "desk"]);
  });
  it("offer the database to an admin, where the engine serves its doors", () => {
    const served = (entitlements: Entitlement[]) => {
      const c = caps(entitlements);
      return { ...c, engine: { ...c.engine!, doors: ["GET /api/backups", "GET /api/settings"] } };
    };
    expect(settingsPages(served(["admin"])).map((p) => p.id)).toEqual(["parts", "engine", "desk", "database"]);
    expect(settingsPages(served(["operator"])).map((p) => p.id)).not.toContain("database");
    expect(settingsPages(caps(["admin"])).map((p) => p.id)).not.toContain("database");
  });
  it("offer the places where the engine serves them, before the database", () => {
    const c = caps(["admin"]);
    const served = { ...c, engine: { ...c.engine!, doors: ["GET /api/places", "GET /api/backups"] } };
    expect(settingsPages(served).map((p) => p.id)).toEqual(["parts", "engine", "desk", "places", "database"]);
    const operator = caps(["operator"]);
    expect(settingsPages({ ...operator, engine: { ...operator.engine!, doors: ["GET /api/places"] } }).map((p) => p.id)).toContain("places");
  });
  it("open the page an address names, and the parts for anything else", () => {
    const pages = settingsPages(caps(["admin"]));
    expect(settingsPage(pages, "desk")?.id).toBe("desk");
    expect(settingsPage(pages, "nowhere")?.id).toBe("parts");
    expect(settingsPage(pages, null)?.id).toBe("parts");
    expect(settingsPage([], "parts")).toBeNull();
  });
});
