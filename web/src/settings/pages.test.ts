// SPDX-License-Identifier: AGPL-3.0-only
// Settings' pages: which are offered to whom, each by its grant, and the page
// an address opens.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import { settingsPage, settingsPages } from "./pages";

function caps(grants: Grant[], over: Partial<Capabilities> = {}): Capabilities {
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
    person: { subject: "p", display_name: "p", grants, detail: "plain", groups: [] },
    desk: { version: "1.0.0-alpha.14", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    ...over,
  };
}

const served = (grants: Grant[], doors: string[]): Capabilities => {
  const c = caps(grants);
  return { ...c, engine: { ...c.engine!, doors } };
};

const ids = (c: Capabilities) => settingsPages(c).map((p) => p.id);

describe("the settings pages", () => {
  it("are offered to a person holding the grant a page needs, and to nobody else", () => {
    expect(settingsPages(caps([...SETS.reviewer.grants, "assistant:use"]))).toEqual([]);
    expect(ids(caps(["install:see"]))).toEqual(["overview", "parts", "engine", "desk", "setup"]);
    expect(ids(caps(SETS.operator.grants))).toEqual(["overview", "parts", "engine", "desk", "setup"]);
  });

  it("name the gateway and the assistant under the parts, where they answered", () => {
    const both = caps(SETS.operator.grants, { kvasir: { models: [] }, assistant: { stations: [] } });
    expect(ids(both)).toEqual(["overview", "parts", "engine", "desk", "gateway", "assistant", "setup"]);
    expect(settingsPages(both).filter((p) => p.sub).map((p) => p.id)).toEqual(["engine", "desk", "gateway", "assistant"]);
    // without the install's pages there are no parts to set them in under
    const answered = { kvasir: { models: [] }, assistant: { stations: [] } };
    expect(settingsPages(caps(["kvasir:see"], answered))).toEqual([{ id: "gateway", title: "Kvasir", sub: false }]);
    expect(settingsPages(caps(["assistant-settings:work"], answered))).toEqual([{ id: "assistant", title: "Assistant", sub: false }]);
    expect(ids(caps(["kvasir:work"]))).toEqual([]);
  });

  it("offer the places, the database, identity and the audit log by their grants where the engine serves them, and setup last", () => {
    const doors = ["GET /api/places", "GET /api/backups", "GET /api/audit"];
    expect(ids(served(SETS.operator.grants, doors))).toEqual(["overview", "parts", "engine", "desk", "places", "setup"]);
    expect(ids(served(SETS.admin.grants, doors))).toEqual(["overview", "parts", "engine", "desk", "places", "database", "identity", "audit", "setup"]);
    expect(ids(caps(SETS.admin.grants))).toEqual(["overview", "parts", "engine", "desk", "identity", "setup"]);
    expect(ids(served(["places:work", "database:see", "audit:see"], doors))).toEqual(["places", "database", "audit"]);
    expect(ids(served(["identity:work"], doors))).toEqual(["identity"]);
  });

  it("open the page an address names, and the first page offered for anything else", () => {
    const pages = settingsPages(caps(SETS.admin.grants));
    expect(settingsPage(pages, "desk")?.id).toBe("desk");
    expect(settingsPage(pages, "nowhere")?.id).toBe("overview");
    expect(settingsPage(pages, null)?.id).toBe("overview");
    expect(settingsPage([], "parts")).toBeNull();
    expect(settingsPage(settingsPages(caps(["identity:see"])), "parts")?.id).toBe("identity");
  });
});
