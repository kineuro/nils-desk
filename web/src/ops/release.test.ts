// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { HandleRow } from "../ask/client";
import { confirmed, confirmName, list, releaseBody, stackIds } from "./release";

const stackHandle: HandleRow = {
  id: 75, name: null, grain: "stack", row_count: 250, content_hash: "x", principal: "anna@ward-3", actor: {}, created_at: "", epoch: 1, pack_version: "0.1.1",
  disclosure: "local", truncated: false, limit: null, kept: true, last_read_at: null, withdrawn_at: null, ask_hash: "h", columns: ["_key", "_subject", "id"],
};

describe("the release form", () => {
  it("requires the person to type the selection's name", () => {
    expect(confirmName({ kind: "handle", handle: stackHandle }, "sept")).toBe("handle 75");
    expect(confirmName({ kind: "handle", handle: { ...stackHandle, name: "converters" } }, "sept")).toBe("converters");
    expect(confirmed({ kind: "handle", handle: stackHandle }, "sept", " handle 75 ")).toBe(true);
    expect(confirmed({ kind: "handle", handle: stackHandle }, "sept", "handle 76")).toBe(false);
    expect(confirmed({ kind: "hand", cohorts: ["a"] }, "sept", "sept")).toBe(true);
    expect(confirmed({ kind: "hand", cohorts: ["a"] }, "", "")).toBe(false);
  });
  it("reads the stack ids off a handle's rows and sends only what the door accepts", () => {
    const cols = [{ name: "_key", type: "integer" }, { name: "_subject", type: "integer" }, { name: "id", type: "integer" }];
    expect(stackIds(cols, [[2, 1, 2], [3, 1, 3]])).toEqual([2, 3]);
    const r = releaseBody({ kind: "handle", handle: stackHandle }, { name: "sept", out: "/srv/out/sept", dates: "shift" }, [2, 3]);
    expect(r).toEqual({ ok: true, body: { name: "sept", out: "/srv/out/sept", dates: "shift", stacks: [2, 3] }, summary: "2 stacks off handle 75" });
    expect(releaseBody({ kind: "handle", handle: { ...stackHandle, grain: "session" } }, { name: "s", out: "/o" }, [1])).toMatchObject({ ok: false });
    expect(releaseBody({ kind: "handle", handle: { ...stackHandle, truncated: true } }, { name: "s", out: "/o" }, [1])).toMatchObject({ ok: false, why: "a truncated answer is not released" });
  });
  it("a hand selection needs a cohort, subjects or an axis", () => {
    expect(releaseBody({ kind: "hand" }, { name: "s", out: "/o" }, [])).toMatchObject({ ok: false });
    const r = releaseBody({ kind: "hand", cohorts: ["ms-a"], axes: ["base=T1w"] }, { name: "s", out: "/o" }, []);
    expect(r).toEqual({ ok: true, body: { name: "s", out: "/o", cohorts: ["ms-a"], axes: ["base=T1w"] }, summary: "every current member of ms-a; stacks holding base=T1w" });
    expect(list("a, b\n c,,")).toEqual(["a", "b", "c"]);
  });
});
