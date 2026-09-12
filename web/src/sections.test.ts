// SPDX-License-Identifier: AGPL-3.0-only
// The shell of option A: the sections offered, the rail's presence, station
// and model, the avatar's letters, and the addresses.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { href, parse } from "./routes";
import { initials, railModel, railPresent, railStation, sections } from "./sections";
import { ICON_NAMES } from "./ui/Icon";

function caps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.14" },
      contracts: { openapi: "3", suite: "1" },
      doors: ["GET /api/capabilities", "GET /api/summary"],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: ["reader", "reviewer", "operator", "admin"],
      registry: { epoch: 0, schema_version: 37 },
      packs: [],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "operator", display_name: "the operator", entitlements: ["reader", "reviewer", "operator", "admin", "assist"], roles: ["reader", "reviewer", "operator", "admin"] },
    desk: { version: "1.0.0-alpha.14", mode: "off", contracts: { openapi: "3", suite: "1" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    ...over,
  };
}

describe("the sections", () => {
  it("offer Home to a reader of a ready deployment, and nothing before it is ready", () => {
    expect(sections(caps()).map((s) => s.id)).toEqual(["home"]);
    expect(sections(caps({ engine: null }))).toEqual([]);
  });
  it("name only icons the set has", () => {
    for (const s of sections(caps())) expect(ICON_NAMES).toContain(s.icon);
  });
});

describe("the rail", () => {
  const withAssistant = caps({ assistant: { stations: [{ id: "concierge" }, { id: "operator" }] } });
  it("is present when the assistant answered and the person holds assist", () => {
    expect(railPresent(caps(), "home")).toBe(false);
    expect(railPresent(withAssistant, "home")).toBe(true);
    const noAssist = { ...withAssistant, person: { ...withAssistant.person, entitlements: ["reader" as const] } };
    expect(railPresent(noAssist, "home")).toBe(false);
    expect(railPresent(withAssistant, "assistant")).toBe(false);
  });
  it("plans with the operator on Home and talks to the concierge elsewhere", () => {
    expect(railStation(withAssistant, "home")).toBe("operator");
    expect(railStation(withAssistant, "settings")).toBe("concierge");
    expect(railStation(caps({ assistant: { stations: [{ id: "ask-help" }] } }), "home")).toBe("ask-help");
  });
  it("names the gateway's first model and where its prompts go", () => {
    expect(railModel(caps())).toBeNull();
    expect(railModel(caps({ kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] } }))).toBe("qwen38-27b · this machine");
    expect(railModel(caps({ kvasir: { models: [{ id: "MiniMax-M2", locality: "remote" }] } }))).toBe("MiniMax-M2 · provider");
  });
});

describe("the avatar", () => {
  it("takes two letters", () => {
    expect(initials("the operator")).toBe("OP");
    expect(initials("admin")).toBe("AD");
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  ")).toBe("?");
  });
});

describe("the addresses", () => {
  it("name a section, its page and what it opens, and send anything else Home", () => {
    expect(parse("#settings/places")).toEqual({ section: "settings", page: "places", arg: null });
    expect(parse("#settings/places/backup%20disk")).toEqual({ section: "settings", page: "places", arg: "backup disk" });
    expect(parse("")).toEqual({ section: "home", page: null, arg: null });
    expect(parse("#/nowhere")).toEqual({ section: "home", page: null, arg: null });
    expect(parse("#settings/places/%E0%A4%A")).toEqual({ section: "settings", page: "places", arg: null });
  });
  it("round-trip", () => {
    for (const h of ["#home", "#settings/parts", "#settings/places/backup%20disk"]) {
      const r = parse(h);
      expect(href(r.section, r.page, r.arg)).toBe(h);
    }
  });
});
