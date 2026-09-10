// SPDX-License-Identifier: AGPL-3.0-only
// The laptop test of Wave 5 slice B2: on a desk in off mode with every part
// present, the shell walks every section, every object kind has a stable
// address, the rail's context admits identifiers and refuses rows, and the
// shortcut registry holds no single-letter binding.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { hrefOf, legacy, OBJECT_KINDS, parse, sectionOfHash } from "./routes";
import { controls, sections } from "./sections";
import { admit, rowFree } from "./ui/context";
import { SHORTCUTS, wellFormed } from "./ui/shortcuts";
import { elapsedWords } from "./ui/Wait";
import { classify, SENTENCES } from "./ui/Failure";
import { DoorError } from "./ask/client";

function laptop(): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.0" },
      contracts: { openapi: "3", review_item: "4", pack: "4", suite: "1", mcp: "1" },
      doors: [
        "GET /api/capabilities", "POST /api/ask/run", "GET /api/ask/handles", "GET /api/jobs", "POST /api/jobs", "GET /api/packs",
        "GET /api/review", "GET /api/releases", "POST /api/handovers", "GET /api/custody", "GET /api/audit", "GET /api/summary",
        "GET /api/timeline/{kind}/{id}", "GET /api/classify/signals",
      ],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: ["reader", "reviewer", "operator", "admin"],
      registry: { epoch: 1, synthetic: "nils-synth" },
      packs: [{ name: "mri", version: "0.1.1" }],
    },
    kvasir: { health: { warming: false } },
    assistant: { version: "0", stations: [{ id: "ask-help" }, { id: "concierge" }, { id: "keyword-tune" }] },
    apps: [],
    person: { subject: "operator", display_name: "the operator", entitlements: ["reader", "reviewer", "operator", "admin", "assist"], roles: ["reader", "reviewer", "operator", "admin"] },
    desk: { version: "1.0.0-alpha.0", mode: "off", contracts: { openapi: "3", suite: "1" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

describe("the laptop walks every section", () => {
  it("renders the eight sections of section 6.2 in order", () => {
    expect(sections(laptop()).map((s) => s.id)).toEqual(["home", "ask", "data", "review", "release", "pipelines", "assistant", "settings"]);
  });
  it("gives each section its controls", () => {
    const c = laptop();
    expect(controls(c, "ask")).toEqual(["questions", "results"]);
    expect(controls(c, "review")).toEqual(["review", "keyword"]);
    expect(controls(c, "release")).toEqual(["releases", "handovers", "custody"]);
    expect(controls(c, "pipelines")).toEqual(["jobs"]);
    expect(controls(c, "settings")).toEqual(["parts", "database", "audit", "identity", "sessions", "shortcuts"]);
  });
  it("has no Operations section any more, and its addresses move", () => {
    expect(sections(laptop()).some((s) => s.id === "operations")).toBe(false);
    expect(legacy("#operations")).toBe("#pipelines");
    expect(legacy("#operations/releases/77")).toBe("#release/releases/77");
    expect(legacy("#operations/audit")).toBe("#settings/audit");
    expect(legacy("#results/71")).toBe("#ask/results/71");
    expect(legacy("#ask/3")).toBeNull();
  });
});

describe("addresses are stable", () => {
  it("every object kind has a page address that parses back", () => {
    for (const kind of OBJECT_KINDS) {
      const r = parse(hrefOf(kind, 42));
      expect(r).toEqual({ kind: "object", object: kind, id: "42", tab: null });
      expect(sectionOfHash(hrefOf(kind, 42))).toBe("object");
    }
  });
  it("a word after a kind is a section's tab, not an object", () => {
    expect(parse("#release/releases/77")).toEqual({ kind: "section", section: "release", tab: "releases", arg: "77" });
    expect(parse("#review")).toEqual({ kind: "section", section: "review", tab: null, arg: null });
    expect(parse("#review/12")).toEqual({ kind: "object", object: "review", id: "12", tab: null });
    expect(parse("#ask/12")).toEqual({ kind: "section", section: "ask", tab: "12", arg: null });
    expect(parse("#app:viewer/x")).toEqual({ kind: "section", section: "app:viewer", tab: "x", arg: null });
    expect(parse("")).toEqual({ kind: "section", section: "home", tab: null, arg: null });
  });
});

describe("the rail's context is typed", () => {
  it("admits identifiers, names, counts and codes", () => {
    const c = admit({ page: { kind: "ask", id: "12" }, document_id: 12, content_hash: "9f3c2b1a9f3c", chain: [12, 9], epoch: 4, sets: [{ name: "people", grain: "subject" }], funnel: [{ set: "people", rows: 48 }], pack: { name: "mri", version: "0.1.1" }, error_codes: ["scheme_mismatch"], job_ids: [7] });
    expect(c.document_id).toBe(12);
    expect(c.sets).toEqual([{ name: "people", grain: "subject" }]);
    expect(c.funnel).toEqual([{ set: "people", rows: 48 }]);
    expect(rowFree(c)).toBe(true);
  });
  it("drops what is not on the allowlist, and anything shaped like a row", () => {
    const c = admit({ page: { kind: "handle", id: "71" }, rows: [{ subject: "S-0001", edss: 3.5 }], columns: ["subject", "edss"], sets: [{ name: "x", grain: "subject", values: [1, 2, 3] }], content_hash: "not a hash" }) as unknown as Record<string, unknown>;
    expect(c.rows).toBeUndefined();
    expect(c.columns).toBeUndefined();
    expect(c.sets).toEqual([{ name: "x", grain: "subject" }]);
    expect(c.content_hash).toBeUndefined();
    expect(Object.keys(c).sort()).toEqual(["page", "sets"]);
  });
  it("truncates long text and long lists", () => {
    const c = admit({ page: { kind: "x", id: null }, chain: Array.from({ length: 500 }, (_, i) => i), declaration: { note: "a".repeat(1000) } });
    expect(c.chain!.length).toBe(64);
    expect(c.declaration).toEqual({});
  });
});

describe("the shortcut registry", () => {
  it("has no single-letter binding", () => {
    for (const s of SHORTCUTS) expect(wellFormed(s), s.keys).toBe(true);
    expect(wellFormed({ keys: "r", does: "run" })).toBe(false);
    expect(wellFormed({ keys: "g", does: "go" })).toBe(false);
  });
  it("names every section", () => {
    for (const id of ["home", "ask", "data", "review", "release", "pipelines", "settings"]) expect(SHORTCUTS.some((s) => s.go === `#${id}`), id).toBe(true);
  });
});

describe("the wait and the failure", () => {
  it("counts from the first second, says the median, then longer than usual", () => {
    expect(elapsedWords(0, 20, 40)).toBe("");
    expect(elapsedWords(3, 20, 40)).toBe("3 s, usually about 20 s");
    expect(elapsedWords(41, 20, 40)).toBe("41 s, longer than usual");
    expect(elapsedWords(5, null, null)).toBe("5 s");
  });
  it("names the five outcomes the engine chooses, and shows raw text only when tagged safe", () => {
    expect(classify(new DoorError(504, { error: "x" })).outcome).toBe("too_long");
    expect(classify(new DoorError(503, { error: "x" })).outcome).toBe("unavailable");
    expect(classify(new DoorError(403, { error: "x" })).outcome).toBe("not_permitted");
    expect(classify(new DoorError(409, { error: "x" })).outcome).toBe("invalid");
    expect(classify(new DoorError(500, { error: "x" })).outcome).toBe("internal");
    expect(classify(new DoorError(400, { error: "a subject code in it", disclosure: "gated" })).raw).toBeNull();
    expect(classify(new DoorError(400, { error: "the set x is not declared", disclosure: "safe" })).raw).toBe("the set x is not declared");
    expect(classify(new TypeError("Failed to fetch")).outcome).toBe("unavailable");
    for (const s of Object.values(SENTENCES)) expect(s.endsWith(".")).toBe(true);
  });
});
