// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { operationsControls, sections, state } from "./sections";

function doc(over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.0" },
      contracts: { openapi: "3", review_item: "4", pack: "4", suite: "1", mcp: "1" },
      doors: ["GET /api/capabilities", "POST /api/ask/run", "GET /api/ask/handles", "GET /api/jobs", "POST /api/jobs",
        "GET /api/packs", "GET /api/review", "GET /api/releases", "POST /api/handovers", "GET /api/custody", "GET /api/audit"],
      policy: [],
      auth: "off",
      principal: "anna@ward-3",
      roles: ["reader", "reviewer", "operator", "admin"],
      registry: { epoch: 3 },
      packs: [{ name: "mri", version: "0.1.1" }],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "anna", display_name: "Anna", entitlements: ["reader", "reviewer", "operator", "admin", "assist"], roles: ["reader", "reviewer", "operator", "admin"] },
    desk: { version: "1.0.0-alpha.0", mode: "off", contracts: { openapi: "3", suite: "1" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    ...over,
  };
}

describe("the shell as a predicate over the document", () => {
  it("renders no assistant section when no assistant answered", () => {
    const s = sections(doc());
    expect(s.map((x) => x.id)).toEqual(["ask", "results", "operations", "data", "settings"]);
  });
  it("renders the assistant only when it answered and the person holds assist", () => {
    expect(sections(doc({ assistant: { version: "0" } })).some((s) => s.id === "assistant")).toBe(true);
    const noAssist = doc({ assistant: { version: "0" } });
    noAssist.person.entitlements = ["reader", "reviewer", "operator", "admin"];
    expect(sections(noAssist).some((s) => s.id === "assistant")).toBe(false);
  });
  it("removes a section whose door the engine does not serve", () => {
    const d = doc();
    d.engine!.doors = d.engine!.doors.filter((x) => x !== "GET /api/packs");
    expect(sections(d).some((s) => s.id === "data")).toBe(false);
  });
  it("removes what the entitlement does not open, and the ladder implies the ones below", () => {
    const d = doc();
    d.person.entitlements = ["reviewer"];
    expect(sections(d).map((x) => x.id)).toEqual(["ask", "results", "operations", "data", "settings"]);
    expect(operationsControls(d)).toEqual(["jobs", "review"]);
    d.person.entitlements = ["operator"];
    expect(operationsControls(d)).toEqual(["jobs", "review", "releases", "handovers", "sessions"]);
  });
  it("names the unbound person rather than a 403", () => {
    const d = doc();
    d.person.entitlements = [];
    expect(state(d)).toEqual({ kind: "unbound" });
    expect(sections(d)).toEqual([]);
  });
  it("names the login before anything else in local and oidc modes", () => {
    const d = doc();
    d.desk.mode = "local";
    d.desk.login = { kind: "password", url: "/desk/login" };
    d.desk.signed_in = false;
    d.person.entitlements = [];
    expect(state(d)).toEqual({ kind: "login", how: "password", url: "/desk/login" });
    d.desk.signed_in = true;
    expect(state(d)).toEqual({ kind: "unbound" });
  });
  it("names warming while Kvasir has no first token", () => {
    expect(state(doc({ kvasir: { health: { warming: true } } }))).toEqual({ kind: "warming" });
    expect(state(doc({ kvasir: { health: { warming: false } } }))).toEqual({ kind: "ready" });
  });
  it("names a contract mismatch with the version it found and the versions it speaks", () => {
    const d = doc();
    d.desk.contract_mismatch = { found: { openapi: "9" }, speaks: { openapi: "3", suite: "1" }, major: true };
    expect(state(d).kind).toBe("contract_mismatch");
  });
  it("adds one section per registered app that answered, under its entitlement", () => {
    const d = doc({ apps: [
      { id: "pipelines", title: "Analysis pipelines", entitlement: "operator", capabilities: { version: "1" } },
      { id: "silent", title: "Silent", entitlement: "reader", capabilities: null },
    ] });
    expect(sections(d).map((x) => x.id)).toContain("app:pipelines");
    expect(sections(d).map((x) => x.id)).not.toContain("app:silent");
  });
});
