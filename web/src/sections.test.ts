// SPDX-License-Identifier: AGPL-3.0-only
// The shell of option A: the sections offered, before and after an install is
// set up, the Assistant's page and model, the avatar's letters, and the
// addresses.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { GRANTS, SETS } from "./grants";
import { PLACEHOLDERS } from "./home/placeholders";
import { href, parse } from "./routes";
import { assistantModel, assistantOffered, foot, initials, sections } from "./sections";
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
    person: { subject: "operator", display_name: "the operator", grants: [...GRANTS], detail: "sensitive", groups: [] },
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
    for (const s of [...sections(caps()), ...foot(caps())]) expect(ICON_NAMES).toContain(s.icon);
    for (const p of PLACEHOLDERS) expect(ICON_NAMES).toContain(p.icon);
  });
});

describe("the sections of an install that is set up", () => {
  const doors = ["GET /api/capabilities", "POST /api/ask/run", "GET /api/sources", "GET /api/review", "POST /api/releases", "GET /api/jobs"];
  const served = caps({ engine: { ...caps().engine!, doors } });
  it("join Home where the engine serves their doors and the person may open them", () => {
    expect(sections(served).map((s) => s.id)).toEqual(["home", "query", "data", "review", "release", "pipelines"]);
    // Data unfolds its two pages in the side (record 26)
    expect(sections(served).find((s) => s.id === "data")?.pages?.map((p) => p.id)).toEqual(["datasets", "cohorts"]);
    const reader = { ...served, person: { ...served.person, grants: SETS.reader.grants, detail: "plain" as const, groups: ["Readers"] } };
    expect(sections(reader).map((s) => s.id)).toEqual(["home", "query", "data"]);
    const reviewing = { ...served, person: { ...served.person, grants: ["review:see" as const], detail: "plain" as const } };
    expect(sections(reviewing).map((s) => s.id)).toEqual(["home", "review"]);
  });
  it("wait while an install is not set up for a person who may see it, with Home named for its first page, and while that is not known", () => {
    expect(sections(served, false)).toEqual([{ id: "home", title: "Get started", icon: "home" }]);
    expect(sections(served, null)).toEqual([{ id: "home", title: "Home", icon: "home" }]);
  });
});

describe("a model backend still warming", () => {
  it("keeps the sections, the foot and the Assistant, since only the assistant waits for it", () => {
    const warming = caps({ kvasir: { health: { warming: true } }, assistant: { stations: [{ id: "concierge" }] } });
    expect(sections(warming).map((s) => s.id)).toEqual(["home", "assistant"]);
    expect(foot(warming).map((s) => s.id)).toEqual(["settings"]);
    expect(assistantOffered(warming)).toBe(true);
  });
});

describe("the foot", () => {
  it("keeps Settings for a person who may open one of its pages, of a ready deployment", () => {
    expect(foot(caps()).map((s) => s.id)).toEqual(["settings"]);
    expect(foot(caps({ person: { subject: "r", display_name: "r", grants: [...SETS.reader.grants, "assistant:use"], detail: "plain", groups: ["Readers"] } }))).toEqual([]);
    expect(foot(caps({ person: { subject: "i", display_name: "i", grants: ["identity:see"], detail: "plain", groups: [] } }))[0].pages?.map((p) => p.id)).toEqual(["identity"]);
    expect(foot(caps({ engine: null }))).toEqual([]);
  });
  it("carries Settings' pages, each part's own set in under the parts", () => {
    const pages = foot(caps())[0].pages ?? [];
    expect(pages.map((p) => [p.id, p.depth])).toEqual([
      ["overview", 1],
      ["parts", 1],
      ["engine", 2],
      ["desk", 2],
      ["identity", 1],
      ["setup", 1],
    ]);
  });
});

describe("the Assistant", () => {
  const withAssistant = caps({ assistant: { stations: [{ id: "concierge" }, { id: "ask-help" }] } });
  it("has its page when the assistant answered and the person holds assistant:use, with its conversations under it", () => {
    expect(assistantOffered(caps())).toBe(false);
    expect(assistantOffered(withAssistant)).toBe(true);
    const noAssist = { ...withAssistant, person: { ...withAssistant.person, grants: SETS.reader.grants, detail: "plain" as const } };
    expect(assistantOffered(noAssist)).toBe(false);
    const onlyAssist = { ...withAssistant, person: { ...withAssistant.person, grants: ["assistant:use" as const], detail: "plain" as const } };
    expect(sections(onlyAssist).map((s) => s.id)).toEqual(["home", "assistant"]);
    expect(foot(onlyAssist)).toEqual([]);
    const side = sections(withAssistant, true, [{ id: "c-1", title: "T1w after contrast", depth: 1 }]);
    expect(side.map((s) => s.id)).toEqual(["home", "assistant"]);
    expect(side[1].pages?.map((p) => p.id)).toEqual(["new", "c-1", "all", "shared", "memory"]);
    // it helps set an install up, so it is there before the rest of the desk
    expect(sections(withAssistant, false).map((s) => s.id)).toEqual(["home", "assistant"]);
  });
  it("names the gateway's first model and where its prompts go", () => {
    expect(assistantModel(caps())).toBeNull();
    expect(assistantModel(caps({ kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] } }))).toBe("qwen38-27b · this machine");
    expect(assistantModel(caps({ kvasir: { models: [{ id: "MiniMax-M2", locality: "remote" }] } }))).toBe("MiniMax-M2 · provider");
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
    expect(parse("#settings/places")).toEqual({ section: "settings", page: "places", arg: null, sub: null });
    expect(parse("#settings/places/backup%20disk")).toEqual({ section: "settings", page: "places", arg: "backup disk", sub: null });
    expect(parse("")).toEqual({ section: "home", page: null, arg: null, sub: null });
    expect(parse("#/nowhere")).toEqual({ section: "home", page: null, arg: null, sub: null });
    expect(parse("#settings/places/%E0%A4%A")).toEqual({ section: "settings", page: "places", arg: null, sub: null });
  });
  it("name a page of what a page opened, in one word past it", () => {
    expect(parse("#data/datasets/incoming/pseudonymisation")).toEqual({ section: "data", page: "datasets", arg: "incoming", sub: "pseudonymisation" });
    expect(parse("#data/batch/12")).toEqual({ section: "data", page: "batch", arg: "12", sub: null });
    expect(parse("#data/datasets/a/b/c")).toEqual({ section: "home", page: null, arg: null, sub: null });
    expect(href("data", "datasets", "incoming", "pseudonymisation")).toBe("#data/datasets/incoming/pseudonymisation");
    expect(href("data", "datasets", null, "pseudonymisation")).toBe("#data/datasets");
  });
  it("round-trip", () => {
    for (const h of ["#home", "#settings/parts", "#settings/places/backup%20disk", "#data/datasets/incoming/pseudonymisation"]) {
      const r = parse(h);
      expect(href(r.section, r.page, r.arg, r.sub)).toBe(h);
    }
  });
});
