// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Pair mode (the post-contrast study): the sheet read as the engine serves
// it, the five keys, what each answer says of each side, the two pictures
// kept on one slice where their geometry matches and left alone where it
// does not, and the page: two pictures named left and right and nothing
// else of either stack, one key and Enter to answer.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEFT, PAIR_CAMPAIGN, PAIR_SHEET, PAIR_SUMMARY, pairDoorsOf, pairEngine, RIGHT } from "../../test/layout/pair.fixture";
import { CAMPAIGN_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Manifest } from "../viewer/doors";
import type { Reference } from "../viewer/reference";
import type { ViewerProps } from "../viewer/Viewer";
import { answerCounts, isPair, pairKey, pairSync, sheetOf, sidesOf, sliceMap, summaryOf } from "./pair";
import { PairReader } from "./PairReader";
import { Workspace } from "./Workspace";

// the viewer stands in: it says its manifest once drawn, and keeps its props for the test to read
const drawn = new Map<number, ViewerProps>();
const manifests = new Map<number, Manifest>();
vi.mock("../viewer/Viewer", async () => {
  const { useEffect } = await import("react");
  return {
    Viewer: (p: ViewerProps) => {
      drawn.set(p.stack, p);
      useEffect(() => {
        const m = manifests.get(p.stack);
        if (m) p.onManifest?.(m);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [p.stack]);
      return null;
    },
  };
});

// the reference tissue is read from the pyramid in the browser; here each stack's is given, or none
const references = new Map<number, Reference>();
vi.mock("../viewer/reference", async (orig) => {
  const real = await orig<typeof import("../viewer/reference")>();
  return {
    ...real,
    reference: (stack: number) => {
      const r = references.get(stack);
      return r ? Promise.resolve(r) : Promise.reject(new Error("no sample"));
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[]): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.60" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.12.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

/** A manifest of an axial stack: `nz` planes `dz` mm apart from `z0`, or unplaced. */
function manifest(nz: number, dz: number, z0: number | null, o: { orientation?: number[]; shape?: [number, number, number] } = {}): Manifest {
  return {
    codec: "htj2k",
    tile: 256,
    levels: 1,
    shape: o.shape ?? [nz, 256, 256],
    spacing: [dz, 1, 1],
    dtype: "uint16",
    window: { center: 400, width: 800 },
    orientation: z0 === null ? null : (o.orientation ?? [1, 0, 0, 0, 1, 0]),
    orientation_known: z0 !== null,
    origin: z0 === null ? null : [0, 0, z0],
  } as Manifest;
}

describe("the sheet, the keys and the answers", () => {
  it("reads the two stacks and the five answers, and nothing without both", () => {
    const s = sheetOf(PAIR_SHEET as unknown as Json);
    expect(s).toEqual({ item: PAIR_SHEET.item, left: LEFT, right: RIGHT, answers: ["left_post", "right_post", "both_pre", "both_post", "cant_tell"] });
    expect(sheetOf({ item: 3, left: { stack: 1 } })).toBeNull();
    expect(isPair(PAIR_CAMPAIGN)).toBe(true);
    expect(isPair({ question: { kind: "axis", axis: "base" } })).toBe(false);
  });

  it("maps 1 to 5 to the answers, Enter sends, and leaves the pictures' keys alone", () => {
    const o = { inField: false };
    expect(pairKey("1", o)).toEqual({ kind: "answer", answer: "left_post" });
    expect(pairKey("2", o)).toEqual({ kind: "answer", answer: "right_post" });
    expect(pairKey("3", o)).toEqual({ kind: "answer", answer: "both_pre" });
    expect(pairKey("4", o)).toEqual({ kind: "answer", answer: "both_post" });
    expect(pairKey("5", o)).toEqual({ kind: "answer", answer: "cant_tell" });
    expect(pairKey("6", o)).toBeNull();
    expect(pairKey("w", o)).toEqual({ kind: "window" });
    expect(pairKey("9", o)).toEqual({ kind: "region", region: 2 });
    expect(pairKey("Enter", o)).toEqual({ kind: "send" });
    expect(pairKey("l", o)).toEqual({ kind: "sync" });
    expect(pairKey("1", { inField: true })).toBeNull();
    for (const k of [" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Escape"]) expect(pairKey(k, o)).toBeNull();
  });

  it("says what each answer comes to on each side, as the engine resolves it", () => {
    expect(sidesOf("left_post")).toEqual({ left: "post", right: "pre" });
    expect(sidesOf("right_post")).toEqual({ left: "pre", right: "post" });
    expect(sidesOf("both_pre")).toEqual({ left: "pre", right: "pre" });
    expect(sidesOf("both_post")).toEqual({ left: "post", right: "post" });
    expect(sidesOf("cant_tell")).toEqual({ left: "?", right: "?" });
  });

  it("reads the summary", () => {
    const s = summaryOf(PAIR_SUMMARY as unknown as Json);
    expect(s.answered).toBe(12);
    expect(s.median).toBe(4.2);
    expect(answerCounts(s)).toBe("left is post 4 · right is post 5 · both pre 1 · both post 1 · can't tell 1");
    expect(answerCounts({ answers: {} })).toBe("nothing read yet");
  });
});

describe("one slice where the geometry matches", () => {
  it("keeps plane z on plane z for two stacks of one geometry", () => {
    const s = sliceMap(manifest(40, 3, 0), manifest(40, 3, 0));
    expect(s?.kind).toBe("position");
    expect([0, 17, 39].map(s!.map)).toEqual([0, 17, 39]);
  });

  it("matches planes by where they lie when the depths differ", () => {
    // 3 mm planes from 0 against 1.5 mm planes from 15: plane 10 of the first (30 mm) is plane 10 of the second
    const a = manifest(40, 3, 0);
    const b = manifest(60, 1.5, 15);
    const s = pairSync(a, b)!;
    expect(s.toRight.map(10)).toBe(10);
    expect(s.toLeft.map(10)).toBe(10);
    expect(s.toRight.map(0)).toBe(0);
    expect(s.toRight.map(39)).toBe(59);
    // the planes run the other way in one of them
    const flipped = { ...manifest(40, 3, 117), step: [0, 0, -3] } as Manifest;
    const f = sliceMap(manifest(40, 3, 0), { ...flipped, orientation: [1, 0, 0, 0, -1, 0] } as Manifest);
    expect(f?.map(0)).toBe(39);
    expect(f?.map(39)).toBe(0);
  });

  it("lets each move alone where the geometry differs", () => {
    // a sagittal beside an axial
    expect(sliceMap(manifest(40, 3, 0), manifest(40, 3, 0, { orientation: [0, 1, 0, 0, 0, -1] }))).toBeNull();
    // two stacks that do not overlap
    expect(sliceMap(manifest(10, 3, 0), manifest(10, 3, 200))).toBeNull();
    // neither says where it lies: the same shape and spacing is plane for plane, another is not
    expect(sliceMap(manifest(40, 3, null), manifest(40, 3, null))?.kind).toBe("index");
    expect(sliceMap(manifest(40, 3, null), manifest(41, 3, null))).toBeNull();
    // one says, the other does not
    expect(sliceMap(manifest(40, 3, 0), manifest(40, 3, null))).toBeNull();
  });
});

describe("the pair view drawn", () => {
  let host: HTMLDivElement;
  let root: Root;
  let log: Asked[];
  beforeEach(() => {
    log = [];
    drawn.clear();
    manifests.clear();
    references.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    host.remove();
    vi.unstubAllGlobals();
    location.hash = "";
  });

  async function until<T>(what: () => T | null | undefined | false, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = what();
      if (v) return v;
      if (Date.now() > end) throw new Error("waited in vain");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
  }
  async function press(key: string) {
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }

  it("shows the two pictures as left and right and nothing else of either; one key and Enter answer", async () => {
    vi.stubGlobal("fetch", pairEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<PairReader caps={capsWith(pairDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".pair-answers"));
    await until(() => drawn.has(LEFT) && drawn.has(RIGHT));
    const text = host.textContent ?? "";
    expect([...host.querySelectorAll(".pair-side")].map((s) => s.getAttribute("data-side"))).toEqual(["left", "right"]);
    // no stack's number, no key, no door that would read a stack's file
    for (const n of [String(LEFT), String(RIGHT), "pair:12"]) expect(text).not.toContain(n);
    expect(text).toContain("pair 13");
    expect(log.some((a) => /\/items\/\d+\/(why|header|ab)$/u.test(a.path))).toBe(false);
    // the arrows page the left until the pointer is over the right
    expect(drawn.get(LEFT)?.keys).toBe(true);
    expect(drawn.get(RIGHT)?.keys).toBe(false);
    // Enter before a choice is refused
    await press("Enter");
    expect(host.querySelector(".warn")?.textContent).toContain("Choose first");
    await press("2");
    expect(host.querySelector(".pair-answer.on")?.textContent).toContain("right is post");
    expect(host.querySelector('[data-side="right"] .pair-says')?.textContent).toBe("post");
    expect(host.querySelector('[data-side="left"] .pair-says')?.textContent).toBe("pre");
    await press("Enter");
    await until(() => log.some((a) => a.path.endsWith("/answer")));
    expect(log.find((a) => a.path.endsWith("/answer"))?.body).toEqual({ value: "right_post" });
    await until(() => host.querySelector(".said")?.textContent?.includes("right is post"));
  });

  it("keeps the two on one slice where the geometry matches, and lets them go on l", async () => {
    manifests.set(LEFT, manifest(40, 3, 0));
    manifests.set(RIGHT, manifest(60, 1.5, 15));
    vi.stubGlobal("fetch", pairEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<PairReader caps={capsWith(pairDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".pair-sync.on"));
    expect(host.querySelector(".pair-sync")?.textContent).toBe("one slice");
    // the right starts where the left's middle lies
    await until(() => drawn.get(RIGHT)?.slice === 30);
    await act(async () => drawn.get(LEFT)!.onSlice!(30));
    expect(drawn.get(RIGHT)?.slice).toBe(50);
    await act(async () => drawn.get(RIGHT)!.onSlice!(10));
    expect(drawn.get(LEFT)?.slice).toBe(10);
    await press("l");
    expect(host.querySelector(".pair-sync")?.textContent).toBe("each alone");
    await act(async () => drawn.get(LEFT)!.onSlice!(3));
    expect(drawn.get(RIGHT)?.slice).toBe(10);
  });

  it("says when the geometry differs, and each moves alone", async () => {
    manifests.set(LEFT, manifest(40, 3, 0));
    manifests.set(RIGHT, manifest(40, 3, 0, { orientation: [0, 1, 0, 0, 0, -1] }));
    vi.stubGlobal("fetch", pairEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<PairReader caps={capsWith(pairDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".pair-sync")?.textContent === "each alone: the geometry differs");
    await act(async () => drawn.get(LEFT)!.onSlice!(30));
    expect(drawn.get(RIGHT)?.slice).toBeNull();
  });

  it("shows both under one window scaled to each one's reference, and each its own on w", async () => {
    manifests.set(LEFT, { ...manifest(40, 3, 0), window: { center: 300, width: 600 } } as Manifest);
    manifests.set(RIGHT, { ...manifest(40, 3, 0), window: { center: 600, width: 1200 } } as Manifest);
    references.set(LEFT, { value: 200, threshold: 20, foreground: 0.4, extent: null });
    references.set(RIGHT, { value: 400, threshold: 20, foreground: 0.4, extent: null });
    vi.stubGlobal("fetch", pairEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<PairReader caps={capsWith(pairDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => drawn.get(LEFT)?.voi);
    // 0 to 3 references on both: a stack twice as bright overall gets a window twice as wide
    expect(drawn.get(LEFT)?.voi).toEqual({ lower: 0, upper: 600 });
    expect(drawn.get(RIGHT)?.voi).toEqual({ lower: 0, upper: 1200 });
    await act(async () => drawn.get(RIGHT)!.onVoi!({ lower: 40, upper: 800 }));
    expect(drawn.get(LEFT)?.voi).toEqual({ lower: 20, upper: 400 });
    // no head found: no jumps
    expect(host.querySelector<HTMLButtonElement>(".compare-region")?.disabled).toBe(true);
    await press("w");
    expect(drawn.get(LEFT)?.voi).toBeNull();
    expect(drawn.get(RIGHT)?.voi).toBeNull();
  });

  it("the rating workspace sends a pair campaign to its own page", async () => {
    vi.stubGlobal("fetch", pairEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(pairDoorsOf())} id={String(CAMPAIGN_ID)} role="rater" />));
    await until(() => location.hash.endsWith("/pairs"));
    expect(log.some((a) => a.path.endsWith("/claim"))).toBe(false);
  });
});
