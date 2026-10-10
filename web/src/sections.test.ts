// SPDX-License-Identifier: AGPL-3.0-only
// The shell of option A: the sections offered, before and after an install is
// set up, the Assistant's page and model, the avatar's letters, and the
// addresses.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { GRANTS, SETS } from "./grants";
import { tilesOffered } from "./home/tiles";
import { PLACEHOLDERS } from "./home/placeholders";
import { href, parse } from "./routes";
import { assistantModel, assistantOffered, foot, initials, pageAt, pageHref, sections, sideLayout, type Section } from "./sections";
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
    // Data unfolds its one page, the datasets and the cohorts together (the 2026-10-09 design)
    expect(sections(served).find((s) => s.id === "data")?.pages?.map((p) => [p.id, p.title])).toEqual([["datasets", "Datasets and cohorts"]]);
    const reader = { ...served, person: { ...served.person, grants: SETS.reader.grants, detail: "plain" as const, groups: ["Readers"] } };
    expect(sections(reader).map((s) => s.id)).toEqual(["home", "query", "data"]);
    const reviewing = { ...served, person: { ...served.person, grants: ["review:see" as const], detail: "plain" as const } };
    expect(sections(reviewing).map((s) => s.id)).toEqual(["home", "review"]);
  });
  it("add Models where the engine lists models and Campaigns where it lists campaigns (record 45)", () => {
    const later = { ...served, engine: { ...served.engine!, doors: [...doors, "GET /api/models", "GET /api/campaigns"] }, person: { ...served.person, grants: ["models:work" as const, "models:see" as const, "campaigns:work" as const, "campaigns:see" as const] } };
    expect(sections(later).map((s) => s.id)).toEqual(["home", "campaigns", "models"]);
    expect(tilesOffered(later)).toEqual([]);
    // an engine without the models door shows no Models, whatever the person holds
    const older = { ...later, engine: { ...later.engine, doors: [...doors, "GET /api/campaigns"] } };
    expect(sections(older).map((s) => s.id)).toEqual(["home", "campaigns"]);
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
    // the lists first, then the recent conversations under a small word, drawn as threads rather than pages
    expect(side[1].pages?.map((p) => [p.id, p.kind ?? "page"])).toEqual([
      ["new", "new"],
      ["all", "page"],
      ["shared", "page"],
      ["memory", "page"],
      ["recent", "label"],
      ["c-1", "thread"],
    ]);
    expect(sections(withAssistant)[1].pages?.map((p) => p.id)).toEqual(["new", "all", "shared", "memory"]);
    // it helps set an install up, so it is there before the rest of the desk
    expect(sections(withAssistant, false).map((s) => s.id)).toEqual(["home", "assistant"]);
  });
  it("names the gateway's first model and where its prompts go", () => {
    expect(assistantModel(caps())).toBeNull();
    expect(assistantModel(caps({ kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] } }))).toBe("qwen38-27b · this machine");
    expect(assistantModel(caps({ kvasir: { models: [{ id: "MiniMax-M2", locality: "remote" }] } }))).toBe("MiniMax-M2 · provider");
  });
});

// the side as the 2026-10-09 design lists it: every section but Home has pages,
// each opening the view that serves it, and one section is open at a time
const EVERY = [
  "GET /api/capabilities",
  "POST /api/ask/run",
  "GET /api/ask/selections",
  "GET /api/sources",
  "GET /api/review",
  "GET /api/campaigns",
  "GET /api/label-sets",
  "GET /api/models",
  "POST /api/releases",
  "GET /api/jobs",
  "GET /api/pipelines",
];
const everything = caps({ engine: { ...caps().engine!, doors: EVERY }, assistant: { stations: [{ id: "concierge" }] } });
const listed = (side: Section[], id: string) => {
  const s = side.find((x) => x.id === id)!;
  return (s.pages ?? []).map((p) => [p.title, pageHref(s, p)]);
};

describe("the side's pages", () => {
  it("are listed per section, each opening the view that serves it", () => {
    const side = sections(everything);
    expect(side.map((s) => s.id)).toEqual(["home", "assistant", "query", "data", "review", "campaigns", "models", "release", "pipelines"]);
    // Home has none
    expect(side[0].pages).toBeUndefined();
    expect(listed(side, "assistant")).toEqual([
      ["New conversation", "#assistant/new"],
      ["All conversations", "#assistant/all"],
      ["Shared", "#assistant/shared"],
      ["Memory", "#assistant/memory"],
    ]);
    expect(listed(side, "query")).toEqual([
      ["Cards", "#query"],
      ["Selections", "#query/selections"],
    ]);
    expect(listed(side, "data")).toEqual([["Datasets and cohorts", "#data/datasets"]]);
    expect(listed(side, "review")).toEqual([
      ["Questions", "#review"],
      ["Main scans", "#review/picks"],
      ["Subjects", "#review/identifiers"],
      ["Rules", "#review/rules"],
    ]);
    expect(listed(side, "campaigns")).toEqual([
      ["Campaigns", "#campaigns"],
      ["Label sets", "#campaigns/label-sets"],
    ]);
    expect(listed(side, "models")).toEqual([["By task", "#models"]]);
    expect(listed(side, "release")).toEqual([
      ["Releases", "#release"],
      ["New release", "#release/new"],
    ]);
    expect(listed(side, "pipelines")).toEqual([
      ["Running now", "#pipelines"],
      ["Catalog", "#pipelines/catalog"],
    ]);
    // Settings keeps its pages as they were
    expect(listed(foot(everything), "settings").map(([title]) => title)).toEqual(["Overview", "Parts", "Engine", "Desk", "Assistant", "Identity", "Setup"]);
  });
  it("show a page only where the engine serves what it reads and the grants allow it", () => {
    const older = { ...everything, engine: { ...everything.engine!, doors: EVERY.filter((d) => !["GET /api/ask/selections", "GET /api/label-sets", "GET /api/pipelines"].includes(d)) } };
    const side = sections(older);
    expect(listed(side, "query").map(([title]) => title)).toEqual(["Cards"]);
    expect(listed(side, "campaigns").map(([title]) => title)).toEqual(["Campaigns"]);
    expect(listed(side, "pipelines").map(([title]) => title)).toEqual(["Running now"]);
    // New release is offered only where a release may be made, as the page offers its button
    const seeing = { ...everything, person: { ...everything.person, grants: ["release:see" as const, "review:see" as const], detail: "plain" as const } };
    expect(sections(seeing).map((s) => s.id)).toEqual(["home", "review", "release"]);
    expect(listed(sections(seeing), "release").map(([title]) => title)).toEqual(["Releases"]);
    expect(listed(sections(seeing), "review").map(([title]) => title)).toEqual(["Questions", "Main scans", "Subjects", "Rules"]);
  });
});

describe("the page an address marks", () => {
  const side = [...sections(everything, true, [{ id: "c-1", title: "T1w after contrast", depth: 1 }]), ...foot(everything)];
  const mark = (hash: string) => {
    const r = parse(hash);
    return pageAt(side.find((s) => s.id === r.section)!, r.page)?.title ?? null;
  };
  it("is the page it names, or the one it opens when it names none of them", () => {
    expect(mark("#review")).toBe("Questions");
    expect(mark("#review/picks")).toBe("Main scans");
    expect(mark("#review/identifiers")).toBe("Subjects");
    expect(mark("#review/rules")).toBe("Rules");
    // what models proposed and what System 1 asks wait in the queue's questions too
    expect(mark("#review/proposals")).toBe("Questions");
    expect(mark("#query")).toBe("Cards");
    expect(mark("#query/12")).toBe("Cards");
    expect(mark("#query/selections")).toBe("Selections");
    expect(mark("#data")).toBe("Datasets and cohorts");
    expect(mark("#data/cohorts/spring")).toBe("Datasets and cohorts");
    expect(mark("#data/datasets/incoming/pseudonymisation")).toBe("Datasets and cohorts");
    expect(mark("#campaigns/7/rate")).toBe("Campaigns");
    expect(mark("#campaigns/label-sets/4")).toBe("Label sets");
    expect(mark("#models/model/3")).toBe("By task");
    expect(mark("#release/new/spring")).toBe("New release");
    expect(mark("#pipelines")).toBe("Running now");
    // a run's and a plan's own pages are opened from the catalog
    expect(mark("#pipelines/runs/3")).toBe("Catalog");
    expect(mark("#pipelines/plan/p-1")).toBe("Catalog");
    expect(mark("#settings")).toBe("Overview");
    expect(mark("#settings/identity")).toBe("Identity");
  });
  it("is a recent conversation on its line, never the new one for a conversation the side does not list, and never the small word over them", () => {
    expect(mark("#assistant")).toBe("New conversation");
    expect(mark("#assistant/new")).toBe("New conversation");
    expect(mark("#assistant/all")).toBe("All conversations");
    expect(mark("#assistant/c-1")).toBe("T1w after contrast");
    expect(mark("#assistant/c-9")).toBeNull();
    expect(mark("#assistant/recent")).toBeNull();
  });
});

describe("the foot of the side", () => {
  const side = sections(everything);
  const kept = foot(everything);
  const split = (open: string | null) => {
    const l = sideLayout(side, kept, open);
    return [l.up.map((s) => s.id), l.down.map((s) => s.id)];
  };
  const work = ["home", "assistant", "query", "data", "review", "campaigns", "models", "release", "pipelines"];
  it("holds Settings alone while no section is open, Home, which has no pages, included", () => {
    expect(split(null)).toEqual([work, ["settings"]]);
    expect(split("home")).toEqual([work, ["settings"]]);
    expect(split("nowhere")).toEqual([work, ["settings"]]);
  });
  it("takes every section after the open one, which keeps its place with its pages under it", () => {
    expect(split("review")).toEqual([
      ["home", "assistant", "query", "data", "review"],
      ["campaigns", "models", "release", "pipelines", "settings"],
    ]);
    expect(split("assistant")).toEqual([
      ["home", "assistant"],
      ["query", "data", "review", "campaigns", "models", "release", "pipelines", "settings"],
    ]);
    expect(split("pipelines")).toEqual([work, ["settings"]]);
  });
  it("is empty while Settings is open, risen under the last section", () => {
    expect(split("settings")).toEqual([[...work, "settings"], []]);
  });
  it("holds nothing where there is no Settings until a section opens", () => {
    expect(sideLayout(side, [], null).down).toEqual([]);
    expect(sideLayout(side, [], "data").down.map((s) => s.id)).toEqual(["review", "campaigns", "models", "release", "pipelines"]);
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
    expect(parse("#data/datasets/spring-scans/pseudonymisation")).toEqual({ section: "data", page: "datasets", arg: "spring-scans", sub: "pseudonymisation" });
    expect(parse("#data/batch/12")).toEqual({ section: "data", page: "batch", arg: "12", sub: null });
    expect(parse("#data/datasets/a/b/c")).toEqual({ section: "home", page: null, arg: null, sub: null });
    expect(href("data", "datasets", "incoming", "pseudonymisation")).toBe("#data/datasets/incoming/pseudonymisation");
    expect(href("data", "datasets", null, "pseudonymisation")).toBe("#data/datasets");
  });
  it("round-trip", () => {
    for (const h of ["#home", "#settings/parts", "#settings/places/backup%20disk", "#data/datasets/incoming/pseudonymisation", "#data/datasets/spring-scans/pseudonymisation"]) {
      const r = parse(h);
      expect(href(r.section, r.page, r.arg, r.sub)).toBe(h);
    }
  });
});
