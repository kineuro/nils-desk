// SPDX-License-Identifier: AGPL-3.0-only
// A read kept between pages: read once, joined while under way, kept through
// a failure, replaced by what another page read, and said in words. And a
// page's reads of a door: one at a time per thing read, the next a while
// after the last answer, and an answer to a read let go of let go too. And
// what a page's reads brought, kept between its visits for one person.

import { afterEach, describe, expect, it, vi } from "vitest";
import { agoWords, keeper, reads, shelf } from "./kept";

function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("a kept read", () => {
  it("reads once when nothing was read, and joins the read under way", async () => {
    let calls = 0;
    const gate = later<number>();
    const k = keeper(() => {
      calls++;
      return gate.promise;
    });
    k.ensure();
    k.ensure();
    const joined = k.refresh();
    expect(calls).toBe(1);
    expect(k.get().reading).toBe(true);
    gate.resolve(7);
    expect(await joined).toBe(7);
    expect(k.get()).toMatchObject({ value: 7, reading: false, error: null });
    k.ensure();
    expect(calls).toBe(1);
  });

  it("keeps the value read before a read that fails, with the failure", async () => {
    let fail = false;
    const k = keeper(() => (fail ? Promise.reject(new Error("the engine did not answer")) : Promise.resolve("places")));
    await k.refresh();
    fail = true;
    await expect(k.refresh()).rejects.toThrow("did not answer");
    expect(k.get().value).toBe("places");
    expect((k.get().error as Error).message).toBe("the engine did not answer");
  });

  it("takes what another page read as the newest, and tells who listens", () => {
    const k = keeper(() => Promise.resolve(1));
    let told = 0;
    const stop = k.subscribe(() => told++);
    k.put(5);
    expect(k.get().value).toBe(5);
    expect(told).toBe(1);
    stop();
    k.put(6);
    expect(told).toBe(1);
  });

  it("runs another kind of read after the one under way, not in its place", async () => {
    const order: string[] = [];
    const gate = later<string>();
    const k = keeper(() => {
      order.push("usual");
      return gate.promise;
    });
    const usual = k.refresh();
    const measured = k.refresh(() => {
      order.push("measure");
      return Promise.resolve("measured");
    });
    gate.resolve("read");
    expect(await usual).toBe("read");
    expect(await measured).toBe("measured");
    expect(order).toEqual(["usual", "measure"]);
    expect(k.get().value).toBe("measured");
  });
});

describe("a page's reads of a door (2026-10-17)", () => {
  afterEach(() => vi.useRealTimers());

  /** A door whose answers the test gives, one by one, and the reads it was asked. */
  function door() {
    const asked: { key: string; answer: (v: string) => void; fail: (e: unknown) => void }[] = [];
    const got: [string, string][] = [];
    const failed: string[] = [];
    const r = reads<string>({
      read: (key) => new Promise<string>((answer, fail) => asked.push({ key, answer, fail })),
      got: (key, v) => got.push([key, v]),
      failed: (key) => failed.push(key),
      every: 5_000,
    });
    return { r, asked, got, failed };
  }

  it("never has two reads of a key out: a read asked meanwhile waits for that answer, once however often asked", async () => {
    const { r, asked, got } = door();
    r.read("a");
    r.read("a");
    r.ensure("a");
    expect(asked.map((x) => x.key)).toEqual(["a"]);
    // something changed while it was out: one more read, once it answers
    r.fresh("a");
    r.fresh("a");
    expect(asked).toHaveLength(1);
    // another key is a thing of its own
    r.read("b");
    expect(asked.map((x) => x.key)).toEqual(["a", "b"]);
    asked[0].answer("a1");
    await Promise.resolve();
    await Promise.resolve();
    expect(got).toEqual([["a", "a1"]]);
    expect(asked.map((x) => x.key)).toEqual(["a", "b", "a"]);
    // read once already: ensure reads no more
    r.ensure("b");
    expect(asked).toHaveLength(3);
  });

  it("reads a followed key again a while after its answer, never on a clock, and stops when it is no longer followed", async () => {
    vi.useFakeTimers();
    const { r, asked } = door();
    r.read("a");
    r.follow(["a"]);
    // out: no tick asks again, however long it takes
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toHaveLength(1);
    asked[0].answer("a1");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveLength(2);
    asked[1].answer("a2");
    r.follow([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toHaveLength(2);
    // a key followed from now is read a while from now
    r.follow(["b"]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(asked.map((x) => x.key)).toEqual(["a", "a", "b"]);
  });

  it("lets go of the answer to a read let go of: a late, older answer never lands over a newer one", async () => {
    const { r, asked, got, failed } = door();
    r.read("a");
    // the thing left and came back while its read was out: it is read anew
    r.drop("a");
    r.read("a");
    expect(asked).toHaveLength(2);
    asked[1].answer("newer");
    await Promise.resolve();
    asked[0].answer("older");
    asked[0].fail(new Error("too late"));
    await Promise.resolve();
    await Promise.resolve();
    expect(got).toEqual([["a", "newer"]]);
    expect(failed).toEqual([]);
  });

  it("lets go of every read as the page goes, and reads again once it is taken up", async () => {
    vi.useFakeTimers();
    const { r, asked, got } = door();
    r.read("a");
    r.follow(["a"]);
    r.stop();
    asked[0].answer("a1");
    r.read("b");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(got).toEqual([]);
    expect(asked).toHaveLength(1);
    r.start();
    r.ensure("a");
    expect(asked).toHaveLength(2);
  });
});

describe("what a page's reads brought, kept between visits (2026-11-12)", () => {
  it("keeps an answer by its key and hands out the same object until something changes", () => {
    const s = shelf<number>();
    s.take("astrid");
    expect(s.get("astrid")).toEqual({});
    let told = 0;
    const off = s.subscribe(() => told++);
    expect(s.land("astrid", "a", s.sent(), 1)).toBe(true);
    const kept = s.get("astrid");
    expect(kept).toEqual({ a: 1 });
    expect(s.get("astrid")).toBe(kept);
    expect(told).toBe(1);
    // a key let go of that was never kept changes nothing
    s.drop("astrid", "b");
    expect(s.get("astrid")).toBe(kept);
    expect(told).toBe(1);
    off();
    s.land("astrid", "b", s.sent(), 2);
    expect(told).toBe(1);
    expect(s.get("astrid")).toEqual({ a: 1, b: 2 });
  });

  it("never lands a slow older answer over a newer one, whichever came first", () => {
    const s = shelf<string>();
    s.take("astrid");
    const older = s.sent();
    const newer = s.sent();
    expect(s.land("astrid", "list", newer, "newer")).toBe(true);
    expect(s.land("astrid", "list", older, "older")).toBe(false);
    expect(s.get("astrid")).toEqual({ list: "newer" });
    // in the order they were sent, each lands
    expect(s.land("astrid", "list", s.sent(), "newest")).toBe(true);
    expect(s.get("astrid")).toEqual({ list: "newest" });
    // and a key is placed by its own reads alone
    expect(s.land("astrid", "other", older, "its first")).toBe(true);
  });

  it("hands one person nothing of what was kept for another, and keeps nothing under another's name", () => {
    const s = shelf<string>();
    s.take("astrid");
    const sent = s.sent();
    s.land("astrid", "list", s.sent(), "hers");
    expect(s.get("birgit")).toEqual({});
    // an answer read for another than the one the shelf is taken up for is let go
    expect(s.land("birgit", "list", s.sent(), "not kept")).toBe(false);
    s.drop("birgit", "list");
    s.only("birgit", new Set());
    expect(s.get("astrid")).toEqual({ list: "hers" });
    // taken up for another, what was kept is gone, also for the one it was kept for
    let told = 0;
    s.subscribe(() => told++);
    s.take("birgit");
    expect(told).toBe(1);
    expect(s.get("birgit")).toEqual({});
    expect(s.get("astrid")).toEqual({});
    // and a read sent for the first before that answers to nobody
    expect(s.land("astrid", "list", sent, "late")).toBe(false);
    expect(s.land("birgit", "list", s.sent(), "hers now")).toBe(true);
    s.take("astrid");
    expect(s.get("astrid")).toEqual({});
  });

  it("lets go of the keys a page no longer holds, and of everything", () => {
    const s = shelf<number>();
    s.take("astrid");
    for (const k of ["a", "b", "c"]) s.land("astrid", k, s.sent(), 1);
    const all = s.get("astrid");
    s.only("astrid", new Set(["a", "b", "c", "d"]));
    expect(s.get("astrid")).toBe(all);
    s.only("astrid", new Set(["a", "c"]));
    expect(s.get("astrid")).toEqual({ a: 1, c: 1 });
    s.drop("astrid", "a");
    expect(s.get("astrid")).toEqual({ c: 1 });
    s.forget();
    expect(s.get("astrid")).toEqual({});
    // forgotten, it is nobody's until taken up again
    expect(s.land("astrid", "a", s.sent(), 1)).toBe(false);
  });
});

describe("how long ago", () => {
  const now = 1_000_000_000;
  it("says it in words", () => {
    expect(agoWords(now - 10_000, now)).toBe("just now");
    expect(agoWords(now - 70_000, now)).toBe("a minute ago");
    expect(agoWords(now - 4 * 60_000, now)).toBe("4 minutes ago");
    expect(agoWords(now - 60 * 60_000, now)).toBe("an hour ago");
    expect(agoWords(now - 5 * 3600_000, now)).toBe("5 hours ago");
    expect(agoWords(now - 49 * 3600_000, now)).toBe("2 days ago");
    expect(agoWords(now + 5_000, now)).toBe("just now");
  });
});
