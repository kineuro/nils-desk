// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The comparison readers' shared parts (2026-10-02): the view kept per
// campaign and rater, for every panel or one; the keys by what they do;
// the panels on one slice through the lead; the items the claim names next;
// the slabs kept across stacks under one budget; and how a view is drawn.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "../viewer/doors";
import { forgetSlabs, calloff, pin, slab, slabCounters, slabsKept } from "../viewer/slabs";
import { drawnAs, needsVolume } from "../viewer/view";
import { aheadOf, slabRange } from "./ahead";
import { compareKey, DEFAULT_PREFS, hubFollow, hubLinks, keyGroups, loadPrefs, nextView, prefsKey, prefsOf, READER_VIEWS, savePrefs, viewOf, withAll, withPanel } from "./compare";

function manifest(nz: number, dz: number, z0: number, o: Partial<Manifest> = {}): Manifest {
  return { codec: "htj2k", tile: 256, levels: 4, shape: [nz, 512, 512], spacing: [dz, 0.5, 0.5], dtype: "uint16", window: { center: 400, width: 800 }, orientation: [1, 0, 0, 0, 1, 0], orientation_known: true, origin: [0, 0, z0], plane: "axial", ...o } as Manifest;
}

afterEach(() => {
  forgetSlabs();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    // none
  }
});

describe("the view, kept per campaign and rater", () => {
  it("is every panel's, or a panel's own, and survives the next visit", () => {
    const key = prefsKey("anchored", 14, "rater@site");
    expect(key).toBe("nils.reader.anchored.14.rater@site");
    let p = loadPrefs(key);
    expect(p).toEqual(DEFAULT_PREFS);
    p = withAll(p, "planes");
    expect(viewOf(p, "candidate")).toBe("planes");
    p = withPanel(p, "candidate", "axial");
    expect(viewOf(p, "candidate")).toBe("axial");
    expect(viewOf(p, "reference_pre")).toBe("planes");
    // the same as every panel's is no choice of its own
    expect(withPanel(p, "candidate", "planes").panels).toEqual({});
    savePrefs(key, { ...p, auto: true });
    expect(loadPrefs(key)).toEqual({ all: "planes", panels: { candidate: "axial" }, auto: true });
    // another campaign, another rater: nothing of this one
    expect(loadPrefs(prefsKey("anchored", 15, "rater@site"))).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(prefsKey("anchored", 14, "other@site"))).toEqual(DEFAULT_PREFS);
    // every panel to one view drops the panels' own
    expect(withAll(p, "stack").panels).toEqual({});
  });

  it("reads what is stored defensively", () => {
    expect(prefsOf("not json")).toEqual(DEFAULT_PREFS);
    expect(prefsOf(JSON.stringify({ all: "upside down", panels: { left: "coronal", right: 7 }, auto: "yes" }))).toEqual({ all: "stack", panels: { left: "coronal" }, auto: false });
    expect(prefsOf(null, { ...DEFAULT_PREFS, all: "planes" }).all).toBe("planes");
  });

  it("cycles through the five views", () => {
    expect(READER_VIEWS.map((v) => v.mode)).toEqual(["stack", "planes", "axial", "coronal", "sagittal"]);
    expect(nextView("stack")).toBe("planes");
    expect(nextView("sagittal")).toBe("stack");
  });
});

describe("the keys, by what they do", () => {
  const k = (key: string, o: { shift?: boolean; ctrl?: boolean; inField?: boolean; answers?: number; difference?: boolean } = {}) => compareKey(key, { inField: false, answers: 3, difference: true, ...o });
  it("answers, sends and moves", () => {
    expect(k("1")).toEqual({ kind: "answer", index: 0 });
    expect(k("3")).toEqual({ kind: "answer", index: 2 });
    expect(k("4")).toBeNull();
    expect(k("5", { answers: 5 })).toEqual({ kind: "answer", index: 4 });
    expect(k("Enter")).toEqual({ kind: "send" });
    expect(k("Enter", { ctrl: true })).toEqual({ kind: "send" });
    expect(k("s")).toEqual({ kind: "skip" });
    expect(k("b")).toEqual({ kind: "back" });
    expect(k("m")).toEqual({ kind: "mine" });
    expect(k("u")).toEqual({ kind: "auto" });
    expect(k("?")).toEqual({ kind: "keys" });
  });
  it("chooses the view for every panel, or with Shift for the one under the pointer", () => {
    expect(k("z")).toEqual({ kind: "view", mode: "stack", one: false });
    expect(k("t")).toEqual({ kind: "view", mode: "planes", one: false });
    expect(k("a")).toEqual({ kind: "view", mode: "axial", one: false });
    expect(k("c")).toEqual({ kind: "view", mode: "coronal", one: false });
    expect(k("x")).toEqual({ kind: "view", mode: "sagittal", one: false });
    expect(k("v")).toEqual({ kind: "view", mode: "next", one: false });
    expect(k("A", { shift: true })).toEqual({ kind: "view", mode: "axial", one: true });
    expect(k("S", { shift: true })).toBeNull();
  });
  it("compares, and leaves the pictures' keys and a field's alone", () => {
    expect(k("l")).toEqual({ kind: "sync" });
    expect(k("w")).toEqual({ kind: "window" });
    expect(k("d")).toEqual({ kind: "difference" });
    expect(k("d", { difference: false })).toBeNull();
    expect(k("7")).toEqual({ kind: "region", region: 0 });
    expect(k("0")).toEqual({ kind: "region", region: 3 });
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", " ", "Escape"]) expect(k(key)).toBeNull();
    expect(k("1", { inField: true })).toBeNull();
  });
  it("are listed in groups, every key the page takes", () => {
    const g = keyGroups({ answers: [{ key: "1", words: "like the pre" }], noun: "item", difference: true });
    expect(g.map((x) => x.title)).toEqual(["Answer", "View", "Compare", "Pictures"]);
    const all = g.flatMap((x) => x.keys.map(([key]) => key));
    for (const key of ["1", "Enter", "u", "s", "b", "m", "z", "t", "a", "c", "x", "v", "l", "w", "d", "7 8 9 0"]) expect(all).toContain(key);
  });
});

describe("one slice through the lead", () => {
  it("moves every tied panel with the lead, and the lead with any, leaving an untied one", () => {
    const lead = manifest(40, 3, 0);
    const finer = manifest(60, 1.5, 15);
    const turned = manifest(40, 3, 0, { orientation: [0, 1, 0, 0, 0, -1] });
    const links = hubLinks({ candidate: lead, reference_pre: finer, reference_post: turned }, "candidate", ["candidate", "reference_pre", "reference_post"]);
    expect(links?.fromLead.reference_pre).toBeTruthy();
    expect(links?.fromLead.reference_post).toBeNull();
    const now = { candidate: 20, reference_pre: 30, reference_post: 7 };
    expect(hubFollow(links, "candidate", 30, now)).toEqual({ candidate: 30, reference_pre: 50, reference_post: 7 });
    expect(hubFollow(links, "reference_pre", 10, now)).toEqual({ candidate: 10, reference_pre: 10, reference_post: 7 });
    expect(hubFollow(links, "reference_post", 3, now)).toEqual({ candidate: 20, reference_pre: 30, reference_post: 3 });
  });
});

describe("the items ahead", () => {
  it("are the claim's ahead, else its one next", () => {
    expect(aheadOf({ ahead: [{ item: 4, position: 3, stacks: [11, 12, 13] }, { item: 5, stacks: [] }, { item: 6, stacks: [21, "x", 22] }] })).toEqual([
      { item: 4, stacks: [11, 12, 13] },
      { item: 6, stacks: [21, 22] },
    ]);
    expect(aheadOf({ next: { item: 9, stack: 31 } })).toEqual([{ item: 9, stacks: [31] }]);
    expect(aheadOf({ next: { item: 9, stack: null } })).toEqual([]);
    expect(aheadOf({})).toEqual([]);
    expect(aheadOf({ ahead: Array.from({ length: 9 }, (_, i) => ({ item: i, stacks: [i + 100] })) }).length).toBe(5);
  });
  it("names a plane's slab as the viewer asks for it", () => {
    const m = manifest(160, 1, 0);
    expect(slabRange(m, 0, 80)).toEqual([64, 96]);
    expect(slabRange(m, 0, 159)).toEqual([128, 160]);
    expect(slabRange(manifest(24, 5, 0), 1, 12)).toEqual([0, 24]);
  });
});

describe("how a view is drawn", () => {
  const axial = manifest(160, 1, 0);
  const sagittal = manifest(176, 1, 0, { plane: "sagittal", orientation: [0, 1, 0, 0, 0, -1] });
  it("draws a plane that is the stack's own from the stack, and any other from the volume", () => {
    expect(drawnAs("axial", axial)).toEqual({ view: "stack", big: null });
    expect(drawnAs("coronal", axial)).toEqual({ view: "planes", big: "coronal" });
    expect(drawnAs("sagittal", sagittal)).toEqual({ view: "stack", big: null });
    expect(drawnAs("axial", sagittal)).toEqual({ view: "planes", big: "axial" });
    expect(drawnAs("planes", axial)).toEqual({ view: "planes", big: null });
    expect(drawnAs("stack", sagittal)).toEqual({ view: "stack", big: null });
    expect(needsVolume("axial", axial)).toBe(false);
    expect(needsVolume("planes", axial)).toBe(true);
  });
  it("draws a stack of one plane as its own, whatever is chosen", () => {
    const one = manifest(1, 1, 0);
    for (const v of ["planes", "coronal", "axial"] as const) expect(drawnAs(v, one)).toEqual({ view: "stack", big: null });
  });
});

describe("the slabs kept across stacks", () => {
  function slabEngine(log: string[]) {
    return (url: string) => {
      log.push(url);
      // one plane of one tile, as the door packs it
      const buf = new ArrayBuffer(4 + 4 + 4 + 4 + 1000);
      const v = new DataView(buf);
      v.setUint32(0, 1, true);
      v.setUint32(4, 8, true);
      v.setUint32(8, 1, true);
      v.setUint32(12, 12, true);
      return Promise.resolve(new Response(buf, { status: 200, headers: { "X-Nils-Codec": "htj2k" } }));
    };
  }
  it("reads a slab once, joins one in flight, and keeps it", async () => {
    const log: string[] = [];
    vi.stubGlobal("fetch", slabEngine(log));
    const [a, b] = await Promise.all([slab(7, 0, 0, 32), slab(7, 0, 0, 32, { warm: true })]);
    expect(a).toBe(b);
    await slab(7, 0, 0, 32);
    expect(log).toEqual(["/api/instances/7/slab/0/0-32"]);
    expect(slabCounters.hits).toBe(1);
    expect(slabsKept().slabs).toBe(1);
  });
  it("lets the least recently used go under its budget, the pinned last", async () => {
    vi.stubGlobal("fetch", slabEngine([]));
    forgetSlabs(2500);
    pin([1]);
    await slab(1, 0, 0, 32);
    await slab(2, 0, 0, 32);
    await slab(3, 0, 0, 32);
    const kept = slabsKept();
    expect(kept.bytes).toBeLessThanOrEqual(2500);
    // the pinned stack's slab stayed, the oldest unpinned went
    const log: string[] = [];
    vi.stubGlobal("fetch", slabEngine(log));
    await slab(1, 0, 0, 32);
    await slab(2, 0, 0, 32);
    expect(log).toEqual(["/api/instances/2/slab/0/0-32"]);
  });
  it("calls off a warm read no longer wanted, never one a picture waits on", async () => {
    const pending: ((r: Response) => void)[] = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return new Promise<Response>((resolve, reject) => {
        pending.push(resolve);
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const warm = slab(5, 0, 0, 32, { warm: true });
    const seen = slab(6, 0, 0, 32, { warm: true });
    // a picture on the screen asks for stack 6's too: that one is now wanted
    const wanted = slab(6, 0, 0, 32);
    expect(calloff(new Set())).toBe(1);
    await expect(warm).rejects.toThrow();
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    void seen.catch(() => undefined);
    void wanted.catch(() => undefined);
  });
});
