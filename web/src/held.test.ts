// SPDX-License-Identifier: AGPL-3.0-only
// The shell across its reads of the capabilities: a read that misses keeps
// the page that was shown, only reads that keep missing say the engine is
// slow, and a page that was never shown says what the desk said.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { state } from "./deployment";
import { GRANTS } from "./grants";
import { type Load, missed, next, OUTAGE_AFTER, outage, same } from "./held";

function caps(reachable = true, uptime = 60): Capabilities {
  return {
    engine: reachable
      ? {
          uptime_seconds: uptime,
          engine: { name: "nils", version: "1.0.0" },
          contracts: { openapi: "7", suite: "3" },
          doors: ["GET /api/capabilities"],
          policy: [],
          auth: "oidc",
          principal: "admin",
          roles: [],
          registry: { epoch: 5, schema_version: 40 },
          packs: [],
        }
      : null,
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "admin", display_name: "admin", grants: [...GRANTS], detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: { openapi: "7", suite: "3" }, engine_reachable: reachable, contract_mismatch: null, login: null, signed_in: true },
  } as Capabilities;
}

const shown = (l: Load) => (l.kind === "ready" ? state(l.caps).kind : l.kind);

describe("the shell's reads of the capabilities", () => {
  it("keeps the page shown when one read finds the engine slow, and says nothing yet", () => {
    let l: Load = next({ kind: "loading" }, { caps: caps() }, 0);
    expect(shown(l)).toBe("ready");
    l = next(l, { caps: caps(false) }, 15_000);
    expect(shown(l)).toBe("ready");
    expect(outage(l)).toBeNull();
    // the next read answers: nothing was ever said
    l = next(l, { caps: caps() }, 18_000);
    expect(l).toMatchObject({ kind: "ready", missed: 0, since: null });
  });

  it("keeps the page shown when the desk itself does not answer one read", () => {
    const l = next(next({ kind: "loading" }, { caps: caps() }, 0), { error: "Failed to fetch" }, 15_000);
    expect(shown(l)).toBe("ready");
    expect(outage(l)).toBeNull();
  });

  it("says the engine is slow only after reads keep missing, since the first miss, and keeps the page", () => {
    let l: Load = next({ kind: "loading" }, { caps: caps() }, 0);
    for (let i = 1; i < OUTAGE_AFTER; i++) {
      l = next(l, { caps: caps(false) }, 15_000 + (i - 1) * 3_000);
      expect(outage(l)).toBeNull();
    }
    l = next(l, { error: "the desk answered 502" }, 30_000);
    expect(outage(l)).toBe(15_000);
    expect(shown(l)).toBe("ready");
    l = next(l, { caps: caps() }, 33_000);
    expect(outage(l)).toBeNull();
  });

  it("shows an engine that never answered as it is, since there is no page to keep", () => {
    const l = next({ kind: "loading" }, { caps: caps(false) }, 0);
    expect(shown(l)).toBe("no_engine");
    expect(shown(next({ kind: "loading" }, { error: "Failed to fetch" }, 0))).toBe("failed");
  });

  it("counts a read that missed by what came back", () => {
    expect(missed({ caps: caps() })).toBe(false);
    expect(missed({ caps: caps(false) })).toBe(true);
    expect(missed({ error: "x" })).toBe(true);
    // a person signed out is told to sign in, which is no miss
    const out = caps(false);
    out.desk.signed_in = false;
    out.desk.login = { kind: "password", url: "/desk/login" };
    expect(missed({ caps: out })).toBe(false);
  });

  // 2026-11-12: every read handed the pages a new object, and a page whose
  // arrival depended on it read its lists again with every read
  const held = (l: Load) => (l.kind === "ready" ? l.caps : null);

  it("hands the pages the object they hold while the document says the same", () => {
    const first = next({ kind: "loading" }, { caps: caps() }, 0);
    // the engine's uptime counts on with every read and is no change
    const second = next(first, { caps: caps(true, 75) }, 15_000);
    expect(held(second)).toBe(held(first));
    expect(second).toMatchObject({ kind: "ready", missed: 0, uptime: 75 });
    // a read that missed, and the one that answers after it, hand on the same object too
    const back = next(next(second, { error: "Failed to fetch" }, 30_000), { caps: caps(true, 93) }, 33_000);
    expect(held(back)).toBe(held(first));
    expect(back).toMatchObject({ missed: 0, since: null, uptime: 93 });
  });

  it("hands on a document that says something else", () => {
    const first = next({ kind: "loading" }, { caps: caps() }, 0);
    const changes: ((c: Capabilities) => void)[] = [
      (c) => void (c.engine!.registry.epoch = 6),
      (c) => void (c.person!.grants = c.person!.grants.slice(1)),
      (c) => void c.engine!.doors.push("GET /api/sources"),
      (c) => void (c.person!.subject = "someone-else"),
      (c) => void (c.desk.signed_in = false),
      (c) => void (c.kvasir = { gateway: { name: "kvasir", version: "1" } } as unknown as Capabilities["kvasir"]),
    ];
    for (const change of changes) {
      const other = caps(true, 75);
      change(other);
      const l = next(first, { caps: other }, 15_000);
      expect(held(l)).toBe(other);
      // and the one after it, saying the same again, keeps the changed one
      const again = caps(true, 90);
      change(again);
      expect(held(next(l, { caps: again }, 30_000))).toBe(other);
    }
  });

  it("compares two documents by what they say", () => {
    expect(same({ a: [1, { b: null }], c: "x" }, { c: "x", a: [1, { b: null }] })).toBe(true);
    expect(same({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(same({ a: null }, { a: {} })).toBe(false);
    expect(same([], {})).toBe(false);
  });
});
