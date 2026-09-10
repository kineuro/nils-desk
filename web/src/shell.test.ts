// SPDX-License-Identifier: AGPL-3.0-only
// The shell of a fresh install: the named states in their order, the typed
// context the assistant is handed, and the words of the wait and the failure.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { door, holds, state } from "./deployment";
import { admit, rowFree } from "./ui/context";
import { elapsedWords } from "./ui/Wait";
import { classify, SENTENCES } from "./ui/Failure";
import { DoorError } from "./ask/client";

function fresh(): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.0" },
      contracts: { openapi: "3", review_item: "4", pack: "4", suite: "1", mcp: "1" },
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
    person: { subject: "operator", display_name: "the operator", entitlements: ["reader", "reviewer", "operator", "admin"], roles: ["reader", "reviewer", "operator", "admin"] },
    desk: { version: "1.0.0-alpha.0", mode: "off", contracts: { openapi: "3", suite: "1" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

describe("the states of a fresh install", () => {
  it("is ready when the engine answered and the person holds something", () => {
    expect(state(fresh()).kind).toBe("ready");
    expect(holds(fresh(), "operator")).toBe(true);
    expect(door(fresh(), "GET /api/summary")).toBe(true);
    expect(door(fresh(), "GET /api/places")).toBe(false);
  });
  it("names the login before the engine: an unauthenticated probe says nothing about the engine", () => {
    const d = fresh();
    d.desk.mode = "oidc";
    d.desk.signed_in = false;
    d.desk.login = { kind: "redirect", url: "/desk/login" };
    d.desk.engine_reachable = false;
    d.engine = null;
    expect(state(d).kind).toBe("login");
  });
  it("names the unbound person rather than a 403", () => {
    const d = fresh();
    d.person.entitlements = [];
    expect(state(d)).toEqual({ kind: "unbound" });
  });
  it("names a major contract mismatch before anything else", () => {
    const d = fresh();
    d.desk.contract_mismatch = { found: { openapi: "4" }, speaks: { openapi: "3" }, major: true };
    expect(state(d).kind).toBe("contract_mismatch");
  });
  it("waits for the model backend's first token when a gateway is installed", () => {
    const d = fresh();
    d.kvasir = { health: { warming: true } };
    expect(state(d).kind).toBe("warming");
  });
});

describe("the context the assistant is handed", () => {
  it("admits identifiers, names, counts and codes", () => {
    const c = admit({ page: { kind: "ask", id: "12" }, document_id: 12, content_hash: "9f3c2b1a9f3c", chain: [12, 9], epoch: 4, sets: [{ name: "people", grain: "subject" }], funnel: [{ set: "people", rows: 48 }] });
    expect(c.document_id).toBe(12);
    expect(c.sets).toEqual([{ name: "people", grain: "subject" }]);
    expect(rowFree(c)).toBe(true);
  });
  it("drops what is not on the allowlist, and anything shaped like a row", () => {
    const c = admit({ page: { kind: "handle", id: "71" }, rows: [{ subject: "S-0001", edss: 3.5 }], columns: ["subject", "edss"], content_hash: "not a hash" }) as unknown as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(["page"]);
  });
});

describe("the wait and the failure", () => {
  it("counts from the first second, says the median, then longer than usual", () => {
    expect(elapsedWords(0, 20, 40)).toBe("");
    expect(elapsedWords(3, 20, 40)).toBe("3 s, usually about 20 s");
    expect(elapsedWords(41, 20, 40)).toBe("41 s, longer than usual");
  });
  it("names the five outcomes the engine chooses, and shows raw text only when tagged safe", () => {
    expect(classify(new DoorError(504, { error: "x" })).outcome).toBe("too_long");
    expect(classify(new DoorError(503, { error: "x" })).outcome).toBe("unavailable");
    expect(classify(new DoorError(403, { error: "x" })).outcome).toBe("not_permitted");
    expect(classify(new DoorError(409, { error: "x" })).outcome).toBe("invalid");
    expect(classify(new DoorError(500, { error: "x" })).outcome).toBe("internal");
    expect(classify(new DoorError(400, { error: "a subject code in it", disclosure: "gated" })).raw).toBeNull();
    expect(classify(new DoorError(400, { error: "the set x is not declared", disclosure: "safe" })).raw).toBe("the set x is not declared");
    for (const s of Object.values(SENTENCES)) expect(s.endsWith(".")).toBe(true);
  });
});
