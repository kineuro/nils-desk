// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { HandleRow } from "../ask/client";
import { confirmed, confirmName, DATASETS_OWN, list, overrideNote, releaseBody, stackIds } from "./release";

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
    const r = releaseBody({ kind: "handle", handle: stackHandle }, { name: "sept", out: "/srv/out/sept", uids: "preserve" }, [2, 3]);
    expect(r).toEqual({ ok: true, body: { name: "sept", out: "/srv/out/sept", uids: "preserve", stacks: [2, 3] }, summary: "2 stacks off handle 75" });
    expect(releaseBody({ kind: "handle", handle: { ...stackHandle, grain: "session" } }, { name: "s", out: "/o" }, [1])).toMatchObject({ ok: false });
    expect(releaseBody({ kind: "handle", handle: { ...stackHandle, truncated: true } }, { name: "s", out: "/o" }, [1])).toMatchObject({ ok: false, why: "a truncated answer is not released" });
  });
  it("a hand selection needs a cohort, a dataset, subjects or an axis", () => {
    expect(releaseBody({ kind: "hand" }, { name: "s", out: "/o" }, [])).toMatchObject({ ok: false });
    const r = releaseBody({ kind: "hand", cohorts: ["ms-a"], axes: ["base=T1w"] }, { name: "s", out: "/o" }, []);
    expect(r).toEqual({ ok: true, body: { name: "s", out: "/o", cohorts: ["ms-a"], axes: ["base=T1w"] }, summary: "every current member of ms-a; stacks holding base=T1w" });
    const d = releaseBody({ kind: "hand", datasets: ["north-3t"] }, { name: "s", out: "/o", layout: "bids" }, []);
    expect(d).toEqual({ ok: true, body: { name: "s", out: "/o", layout: "bids", datasets: ["north-3t"] }, summary: "every subject brought in by north-3t" });
    expect(list("a, b\n c,,")).toEqual(["a", "b", "c"]);
  });
  it("names the UIDs only where a person overrode each dataset's own, and never the dates", () => {
    // record 26 section 13: a body carrying uids is a run under the caller's
    // flags, under which no dataset's declared policy applies. The dialog's
    // own state must never become one: neither its default nor an empty
    // value is sent. Every release keeps the real date, so no body names it.
    const dialog = { name: "s", out: "/o", layout: "bids", uids: DATASETS_OWN };
    expect(releaseBody({ kind: "hand", cohorts: ["ms-a"] }, dialog, [])).toEqual({
      ok: true,
      body: { name: "s", out: "/o", layout: "bids", cohorts: ["ms-a"] },
      summary: "every current member of ms-a",
    });
    expect(releaseBody({ kind: "hand", cohorts: ["ms-a"] }, { name: "s", out: "/o", uids: "  " }, [])).toEqual({
      ok: true,
      body: { name: "s", out: "/o", cohorts: ["ms-a"] },
      summary: "every current member of ms-a",
    });
    const over = releaseBody({ kind: "hand", cohorts: ["ms-a"] }, { ...dialog, uids: "preserve" }, []);
    expect(over).toMatchObject({ ok: true, body: { uids: "preserve" } });
    expect(over.ok && "dates" in over.body).toBe(false);
  });
  it("says what an override costs, and says nothing while each dataset's own stands", () => {
    expect(overrideNote(DATASETS_OWN)).toBeNull();
    expect(overrideNote(undefined)).toBeNull();
    expect(overrideNote("  ")).toBeNull();
    expect(overrideNote("remap")).toBe("An override sets the UID policy for every file of this release, so no dataset's own applies to its own files.");
  });
  it("a card's answer with no rows read here is sent as its handle, which the door reads itself", () => {
    const r = releaseBody({ kind: "handle", handle: stackHandle }, { name: "sept", out: "/srv/out/sept" }, []);
    expect(r).toEqual({ ok: true, body: { name: "sept", out: "/srv/out/sept", handle: 75 }, summary: "250 stacks of handle 75" });
  });
});
