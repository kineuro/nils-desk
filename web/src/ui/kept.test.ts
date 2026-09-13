// SPDX-License-Identifier: AGPL-3.0-only
// A read kept between pages: read once, joined while under way, kept through
// a failure, replaced by what another page read, and said in words.

import { describe, expect, it } from "vitest";
import { agoWords, keeper } from "./kept";

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
