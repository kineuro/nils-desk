// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import { auditQuery, guaranteeWords, parts, placeRule, updateWords } from "./console";
import { byHand } from "./supervise";

function caps(): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.1.0" }, contracts: { openapi: "3", pack: "4" }, doors: [], policy: [], auth: "off", principal: "p", roles: ["reader"], registry: { epoch: 1 }, packs: [] },
    kvasir: { version: "0.4.0", health: { warming: true }, contracts: {} },
    assistant: { version: "0.9.0", contracts: { mcp: "1" } },
    apps: [{ id: "viewer", title: "Viewer", capabilities: { version: "2.0", contracts: { pack: "4" } } }],
    person: { subject: "p", display_name: "P", entitlements: ["reader"], roles: ["reader"] },
    desk: { version: "1.0.0", mode: "off", contracts: { openapi: "3" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

function place(over: Partial<Place>): Place {
  return { id: 1, name: "x", role: "working", path: "/w", guarantees: {}, probed: null, probed_at: null, retired_at: null, ...over };
}

describe("the parts table", () => {
  it("is generated from what every part publishes, with the channel's newer version beside it", () => {
    const t = parts(caps(), [{ part: "engine", version: "1.1.0", newer: { version: "1.2.0", contracts: { pack: "5" } } }]);
    expect(t.map((p) => [p.id, p.version, p.health, p.newer])).toEqual([
      ["engine", "1.1.0", "ok", "1.2.0"],
      ["desk", "1.0.0", "ok", null],
      ["assistant", "0.9.0", "ok", null],
      ["kvasir", "0.4.0", "warming", null],
      ["app:viewer", "2.0", "ok", null],
    ]);
  });
  it("names what an update changes and who else speaks the old contract", () => {
    const t = parts(caps());
    const lines = updateWords(t[0], { version: "1.2.0", contracts: { pack: "5", openapi: "3" } }, t);
    expect(lines[0]).toBe("Engine 1.1.0 to 1.2.0.");
    expect(lines[1]).toBe("changes the pack contract from 4 to 5; Viewer speaks 4.");
    expect(byHand("engine", "1.2.0", "https://releases.example")[3]).toMatch(/nils supervise verify --trust/);
  });
});

describe("the rules of places", () => {
  const backup = place({ id: 2, name: "vault", role: "backup", path: "/vault" });
  it("refuses the registry role without a backup elsewhere", () => {
    expect(placeRule({ name: "reg", role: "registry", path: "/reg", backup: null }, [backup])).toMatch(/without a backup/);
    expect(placeRule({ name: "reg", role: "registry", path: "/reg", backup: "vault" }, [backup])).toBeNull();
    expect(placeRule({ name: "reg", role: "registry", path: "/reg", backup: "elsewhere" }, [backup])).toMatch(/no place named/);
    expect(placeRule({ name: "reg", role: "registry", path: "/reg", backup: "w" }, [backup, place({ id: 3, name: "w", role: "working" })])).toMatch(/not a backup/);
    expect(placeRule({ name: "reg", role: "registry", path: "/vault", backup: "vault" }, [backup])).toMatch(/not elsewhere/);
  });
  it("refuses a duplicate name and an empty path", () => {
    expect(placeRule({ name: "vault", role: "export", path: "/x", backup: null }, [backup])).toMatch(/exists/);
    expect(placeRule({ name: "out", role: "export", path: " ", backup: null }, [backup])).toMatch(/has a path/);
  });
  it("says what was declared beside what the probe saw", () => {
    expect(guaranteeWords(place({ guarantees: { snapshots: true, backup: "vault" }, probed: { snapshots_seen: false, free_bytes: 2.5e12 } }))).toBe("snapshots declared, not seen, backed up to vault, 2.50 TB free");
    expect(guaranteeWords(place({}))).toBe("nothing declared");
  });
});

describe("the audit filters", () => {
  it("turn a month into a since date and leave object matching to the desk", () => {
    expect(auditQuery({ principal: " anna ", action: "", object: "handle 71", month: "2026-09" })).toEqual({ principal: "anna", since: "2026-09-01T00:00:00Z", limit: 500 });
    expect(auditQuery({ principal: "", action: "release", object: "", month: "not a month" })).toEqual({ action: "release", limit: 500 });
  });
});
