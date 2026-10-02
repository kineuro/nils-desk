// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Anchored reading (the post-contrast study): the sheet read as the engine
// serves it, the keys, the three panels kept on one slice through the
// candidate, the reference tissue and the shared window's arithmetic, the
// region jumps from the head's extent, the difference and when it is not
// shown, and the page: three pictures named candidate, reference pre and
// reference post and nothing else of any stack, one window by default that
// a drag moves for all, one key and Enter to answer.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANCHORED_CAMPAIGN, ANCHORED_SHEET, ANCHORED_SUMMARY, anchoredDoorsOf, anchoredEngine, CAND, POST, PRE } from "../../test/layout/anchored.fixture";
import { CAMPAIGN_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Manifest } from "../viewer/doors";
import type { Reference, Sample } from "../viewer/reference";
import { extentOf, otsu, referenceOf } from "../viewer/reference";
import type { ViewerProps } from "../viewer/Viewer";
import { anchoredCounts, anchoredKey, anchoredSheetOf, anchoredSummaryOf, follow, isAnchored, linksOf } from "./anchored";
import { AnchoredReader } from "./AnchoredReader";
import { diffPixels, diffPlan } from "./Difference";
import { planeAt, regionPoint, REGIONS } from "./regions";
import { openingNorm, toNorm, toStored } from "./window";
import { Workspace } from "./Workspace";

const drawn = new Map<number, ViewerProps>();
const manifests = new Map<number, Manifest>();
const references = new Map<number, Reference>();
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
// the reference tissue is read from the pyramid in the browser; here each stack's is given
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
    engine: { engine: { name: "nils", version: "1.0.0-alpha.61" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.13.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

/** An axial stack: `nz` planes `dz` mm apart from z0, 1 mm pixels, 256 square, its window from `lo` to `hi`. */
function manifest(nz: number, dz: number, z0: number | null, o: { orientation?: number[]; spacing?: [number, number, number]; origin?: number[]; window?: [number, number]; levels?: number } = {}): Manifest {
  const [lo, hi] = o.window ?? [0, 800];
  return {
    codec: "htj2k",
    tile: 256,
    levels: o.levels ?? 1,
    shape: [nz, 256, 256],
    spacing: o.spacing ?? [dz, 1, 1],
    dtype: "uint16",
    window: { center: (lo + hi) / 2, width: hi - lo },
    orientation: z0 === null ? null : (o.orientation ?? [1, 0, 0, 0, 1, 0]),
    orientation_known: z0 !== null,
    origin: z0 === null ? null : (o.origin ?? [0, 0, z0]),
  } as Manifest;
}

/** A synthetic head: a box of `head` in air of `air`, its middle `middle`, on a [nz, ny, nx] grid. */
function head(shape: [number, number, number], o: { air?: number; head?: number; middle?: number } = {}): Sample {
  const [nz, ny, nx] = shape;
  const values = new Float32Array(nz * ny * nx).fill(o.air ?? 5);
  for (let z = 2; z < nz - 2; z++)
    for (let y = 4; y < ny - 4; y++)
      for (let x = 4; x < nx - 4; x++) {
        const inner = z >= nz / 4 && z < (3 * nz) / 4 && y >= ny / 4 && y < (3 * ny) / 4 && x >= nx / 4 && x < (3 * nx) / 4;
        values[(z * ny + y) * nx + x] = inner ? (o.middle ?? 400) : (o.head ?? 300);
      }
  return { values, shape, level: 0 };
}

describe("the sheet, the keys and the answers", () => {
  it("reads the three panels in their drawn order, and nothing without all three roles", () => {
    const s = anchoredSheetOf(ANCHORED_SHEET as unknown as Json)!;
    expect(s.panels.map((p) => [p.role, p.stack, p.otherSession])).toEqual([
      ["reference_post", POST, false],
      ["candidate", CAND, false],
      ["reference_pre", PRE, true],
    ]);
    expect(s.answers).toEqual(["like_pre", "like_post", "cant_tell"]);
    expect(anchoredSheetOf({ item: 3, panels: [{ role: "candidate", stack: 1 }] })).toBeNull();
    expect(anchoredSheetOf({ item: 3, panels: [{ role: "candidate", stack: 1 }, { role: "candidate", stack: 2 }, { role: "reference_pre", stack: 3 }] })).toBeNull();
    expect(isAnchored(ANCHORED_CAMPAIGN)).toBe(true);
    expect(isAnchored({ question: { kind: "pair" } } as never)).toBe(false);
  });

  it("maps 1 to 3 to the answers and the page's own keys, and leaves the pictures' keys alone", () => {
    const o = { inField: false };
    expect(anchoredKey("1", o)).toEqual({ kind: "answer", answer: "like_pre" });
    expect(anchoredKey("2", o)).toEqual({ kind: "answer", answer: "like_post" });
    expect(anchoredKey("3", o)).toEqual({ kind: "answer", answer: "cant_tell" });
    expect(anchoredKey("4", o)).toBeNull();
    expect(anchoredKey("w", o)).toEqual({ kind: "window" });
    expect(anchoredKey("d", o)).toEqual({ kind: "difference" });
    expect(anchoredKey("7", o)).toEqual({ kind: "region", region: 0 });
    expect(anchoredKey("0", o)).toEqual({ kind: "region", region: 3 });
    expect(anchoredKey("2", { inField: true })).toBeNull();
    for (const k of [" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Escape"]) expect(anchoredKey(k, o)).toBeNull();
  });

  it("reads the summary", () => {
    const s = anchoredSummaryOf(ANCHORED_SUMMARY as unknown as Json);
    expect(s.otherSession).toBe(31);
    expect(anchoredCounts(s)).toBe("like the pre 5 · like the post 6 · can't tell 1");
  });
});

describe("three on one slice, through the candidate", () => {
  it("moves the anchors with the candidate and the candidate with an anchor, and leaves one that does not match", () => {
    const links = linksOf({ candidate: manifest(40, 3, 0), reference_pre: manifest(60, 1.5, 15), reference_post: manifest(40, 3, 0, { orientation: [0, 1, 0, 0, 0, -1] }) });
    const none = { candidate: null, reference_pre: null, reference_post: null };
    expect(follow(links, "candidate", 10, none)).toEqual({ candidate: 10, reference_pre: 10, reference_post: null });
    expect(follow(links, "reference_pre", 50, none)).toEqual({ candidate: 30, reference_pre: 50, reference_post: null });
    expect(follow(links, "reference_post", 7, none)).toEqual({ candidate: null, reference_pre: null, reference_post: 7 });
  });
});

describe("the reference tissue and one window", () => {
  it("cuts air from head, and takes the median of the head's middle", () => {
    const s = head([16, 32, 32]);
    const t = otsu(s.values);
    expect(t).toBeGreaterThan(5);
    expect(t).toBeLessThan(300);
    const r = referenceOf(s);
    expect(r.value).toBe(400);
    expect(r.box?.x).toEqual([4, 27]);
    // no head: no reference
    expect(referenceOf({ values: new Float32Array(64).fill(7), shape: [4, 4, 4], level: 0 }).value).toBeNull();
  });

  it("keeps a post's reference near its pre's: enhancing vessels, plexus and sinuses barely move the head's central median", () => {
    // a head whose middle is graded tissue (a smooth spread of brain values), as the coarsest level's averaging makes it
    const shape: [number, number, number] = [24, 48, 48];
    const [nz, ny, nx] = shape;
    const pre = head(shape);
    let k = 0;
    for (let z = 2; z < nz - 2; z++)
      for (let y = 4; y < ny - 4; y++)
        for (let x = 4; x < nx - 4; x++) pre.values[(z * ny + y) * nx + x] = 250 + ((k++ * 37) % 200);
    // the post: the same head with about 4 % of its voxels (thin lines through the middle, a rim at the back) three times as bright
    const post: Sample = { ...pre, values: Float32Array.from(pre.values) };
    let lit = 0;
    let inHead = 0;
    for (let z = 2; z < nz - 2; z++)
      for (let y = 4; y < ny - 4; y++)
        for (let x = 4; x < nx - 4; x++) {
          inHead++;
          if (x % 24 === 0 || y === ny - 5) {
            post.values[(z * ny + y) * nx + x] *= 3;
            lit++;
          }
        }
    expect(lit / inHead).toBeGreaterThan(0.03);
    const a = referenceOf(pre).value!;
    const b = referenceOf(post).value!;
    expect(Math.abs(b - a) / a).toBeLessThan(0.03);
    // so under one window the post's lit voxels read about three times its reference, the pre's the same place about one
    expect(post.values[(12 * ny + 20) * nx + 24] / b).toBeGreaterThan(2 * (pre.values[(12 * ny + 20) * nx + 24] / a));
  });

  it("places the head in the patient", () => {
    const s = head([16, 32, 32]);
    const m = manifest(16, 2, 100, { spacing: [2, 1, 1], origin: [-16, -16, 100] });
    const e = extentOf(s, m, referenceOf(s).threshold)!;
    expect(e.lo[0]).toBeCloseTo(-12, 0);
    expect(e.hi[0]).toBeCloseTo(11, 0);
    expect(e.lo[2]).toBeCloseTo(104, 0);
    expect(e.hi[2]).toBeCloseTo(126, 0);
    expect(extentOf(s, manifest(16, 2, null), 100)).toBeNull();
  });

  it("scales each stack by its reference, so a brighter post stays brighter under one window", () => {
    const pre = manifest(10, 3, 0, { window: [0, 600] });
    const post = manifest(10, 3, 0, { window: [0, 1200] });
    // the same brain (reference 300) in both; the post's vessels made its own window twice as wide
    const n = openingNorm([
      { m: pre, ref: 300 },
      { m: post, ref: 300 },
    ])!;
    expect(n.lower).toBe(0);
    expect(n.upper).toBeCloseTo(3, 5);
    // one window, in each stack's stored values: the same numbers where the references agree
    expect(toStored(n, 300, pre)).toEqual({ lower: 0, upper: 900 });
    expect(toStored(n, 300, post)).toEqual({ lower: 0, upper: 900 });
    // a stack twice as bright overall (another gain) gets a window twice as wide: its brain reads the same grey
    expect(toStored(n, 600, pre)).toEqual({ lower: 0, upper: 1800 });
    // a drag read back through a stack's reference, and a rescale honoured
    expect(toNorm({ lower: 60, upper: 600 }, 300, pre)).toEqual({ lower: 0.2, upper: 2 });
    const scaled = { ...pre, slope: 2, intercept: -100 } as Manifest;
    const back = toStored({ lower: 0.5, upper: 2 }, 300, scaled);
    expect(toNorm(back, 300, scaled).upper).toBeCloseTo(2, 6);
    expect(openingNorm([])).toBeNull();
  });
});

describe("the region jumps", () => {
  const extent = { lo: [-75, -95, -40] as [number, number, number], hi: [75, 95, 120] as [number, number, number] };
  it("puts each place by fractions of the head, down from the vertex", () => {
    const at = (id: string) => regionPoint(REGIONS.find((r) => r.id === id)!, extent);
    expect(at("sella")[0]).toBe(0);
    expect(at("sella")[2]).toBeCloseTo(120 - 0.5 * 190, 6);
    expect(at("superior_sagittal")[2]).toBeGreaterThan(at("ventricles")[2]);
    expect(at("ventricles")[2]).toBeGreaterThan(at("transverse")[2]);
    // the transverse sinuses lie at the back
    expect(at("transverse")[1]).toBeGreaterThan(0);
  });

  it("finds the nearest plane of an axial stack by height, of a sagittal one by side", () => {
    const sella = regionPoint(REGIONS.find((r) => r.id === "sella")!, extent);
    // axial, 3 mm planes from -60 up
    expect(planeAt(manifest(60, 3, -60), sella)).toEqual({ z: Math.round((sella[2] + 60) / 3), inside: true });
    // sagittal: rows along y, columns down z, planes from x = 80 towards the right
    const sag = manifest(160, 1, 0, { orientation: [0, 1, 0, 0, 0, -1], origin: [80, -120, 150], spacing: [1, 1, 1] });
    expect(planeAt(sag, sella)?.z).toBe(80);
    // a stack that does not reach it is said to be outside
    expect(planeAt(manifest(10, 3, 100), sella)?.inside).toBe(false);
    expect(planeAt(manifest(10, 3, null), sella)).toBeNull();
  });
});

describe("the difference", () => {
  it("is shown where the planes match, shifted by whole pixels, and not where they do not", () => {
    const c = manifest(40, 3, 0, { origin: [0, 0, 0] });
    const plan = diffPlan(c, manifest(40, 3, 0, { origin: [2, -3, 0] }));
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.map(10)).toBe(10);
      // the anchor starts 2 mm to the right and 3 mm up: the candidate's pixel (y, x) is its (y + 3, x - 2)
      expect(plan.shift(10)).toEqual([3, -2]);
    }
    expect(diffPlan(c, manifest(40, 3, 0, { orientation: [0, 1, 0, 0, 0, -1] })).ok).toBe(false);
    expect(diffPlan(c, manifest(40, 3, 0, { spacing: [3, 0.9, 0.9] }))).toEqual({ ok: false, why: "the pixels are of another size" });
    expect(diffPlan(c, manifest(40, 3, 0, { orientation: [-1, 0, 0, 0, -1, 0] })).ok).toBe(false);
    expect(diffPlan(manifest(40, 3, null), manifest(40, 3, null)).ok).toBe(true);
  });

  it("draws the candidate brighter than the anchor for its reference as lighter than mid grey", () => {
    // 2 by 2: the candidate's reference 100, the anchor's 200 (another gain); the top left enhances
    const cand = [150, 100, 100, 100];
    const anchor = [200, 200, 200, 200];
    const px = diffPixels(cand, anchor, 2, 2, 2, 2, [0, 0], 100, 200, 0.5);
    expect(px[0]).toBe(255);
    expect(px[4]).toBe(128);
    // a pixel the anchor does not cover
    const moved = diffPixels(cand, anchor, 2, 2, 2, 2, [0, 1], 100, 200, 0.5);
    expect(moved[4]).toBeLessThan(40);
  });
});

describe("the anchored view drawn", () => {
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
  const extent = { lo: [-75, -95, -40] as [number, number, number], hi: [75, 95, 120] as [number, number, number] };

  it("shows the three as candidate, reference pre and reference post and nothing else; one key and Enter answer", async () => {
    vi.stubGlobal("fetch", anchoredEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".pair-answers"));
    await until(() => drawn.has(CAND) && drawn.has(PRE) && drawn.has(POST));
    expect([...host.querySelectorAll(".anchored-panel")].map((s) => s.getAttribute("data-role"))).toEqual(["reference_post", "candidate", "reference_pre"]);
    const text = host.textContent ?? "";
    for (const n of [String(CAND), String(PRE), String(POST), "anchored:12"]) expect(text).not.toContain(n);
    expect(text).toContain("another session");
    expect(log.some((a) => /\/items\/\d+\/(why|header|ab|pair)$/u.test(a.path))).toBe(false);
    await press("Enter");
    expect(host.querySelector(".warn")?.textContent).toContain("Choose first");
    await press("2");
    expect(host.querySelector('[data-role="candidate"] .pair-says')?.textContent).toBe("like the post");
    await press("Enter");
    await until(() => log.some((a) => a.path.endsWith("/answer")));
    expect(log.find((a) => a.path.endsWith("/answer"))?.body).toEqual({ value: "like_post" });
  });

  it("shows the three under one window scaled to each one's reference, moves it for all on a drag, and gives each its own on w", async () => {
    manifests.set(CAND, manifest(40, 3, 0, { window: [0, 900] }));
    manifests.set(PRE, manifest(40, 3, 0, { window: [0, 600] }));
    manifests.set(POST, manifest(40, 3, 0, { window: [0, 1200] }));
    references.set(CAND, { value: 300, threshold: 50, foreground: 0.4, extent });
    references.set(PRE, { value: 300, threshold: 50, foreground: 0.4, extent });
    references.set(POST, { value: 600, threshold: 50, foreground: 0.4, extent });
    vi.stubGlobal("fetch", anchoredEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => drawn.get(CAND)?.voi);
    // the opening window: the median of 3, 2 and 2 references wide, from 0
    expect(drawn.get(CAND)?.voi).toEqual({ lower: 0, upper: 600 });
    expect(drawn.get(PRE)?.voi).toEqual({ lower: 0, upper: 600 });
    expect(drawn.get(POST)?.voi).toEqual({ lower: 0, upper: 1200 });
    // a drag on the pre moves the window for all, through each one's reference
    await act(async () => drawn.get(PRE)!.onVoi!({ lower: 30, upper: 450 }));
    expect(drawn.get(CAND)?.voi).toEqual({ lower: 30, upper: 450 });
    expect(drawn.get(POST)?.voi).toEqual({ lower: 60, upper: 900 });
    await press("w");
    expect(drawn.get(CAND)?.voi).toBeNull();
    expect(host.querySelector(".compare-toggle .tool-label")?.textContent).toBe("each its own window");
    // a drag with each its own moves nothing else
    await act(async () => drawn.get(PRE)!.onVoi!({ lower: 1, upper: 2 }));
    expect(drawn.get(POST)?.voi).toBeNull();
  });

  it("jumps each panel to its own estimate of a place, and says it is approximate", async () => {
    manifests.set(CAND, manifest(60, 3, -60));
    manifests.set(PRE, manifest(60, 3, -60));
    manifests.set(POST, manifest(30, 6, -60));
    for (const s of [CAND, PRE, POST]) references.set(s, { value: 300, threshold: 50, foreground: 0.4, extent });
    vi.stubGlobal("fetch", anchoredEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => !host.querySelector<HTMLButtonElement>(".compare-region")?.disabled);
    await press("0");
    const z = Math.round((120 - 0.5 * 190 + 60) / 3);
    await until(() => drawn.get(CAND)?.slice === z);
    expect(drawn.get(PRE)?.slice).toBe(z);
    expect(drawn.get(POST)?.slice).toBe(Math.round((120 - 0.5 * 190 + 60) / 6));
    expect(host.querySelector(".compare-jumped")?.textContent).toBe("sella, approximately");
  });

  it("shows the difference on the references' panels on d, and says none where the geometry differs", async () => {
    manifests.set(CAND, manifest(40, 3, 0));
    manifests.set(PRE, manifest(40, 3, 0));
    manifests.set(POST, manifest(40, 3, 0, { orientation: [0, 1, 0, 0, 0, -1] }));
    for (const s of [CAND, PRE, POST]) references.set(s, { value: 300, threshold: 50, foreground: 0.4, extent });
    vi.stubGlobal("fetch", anchoredEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => drawn.get(CAND)?.voi);
    expect(host.querySelector(".difference")).toBeNull();
    await press("d");
    await until(() => host.querySelectorAll(".difference").length === 2);
    expect(host.querySelector('[data-role="reference_pre"] .difference')?.getAttribute("data-difference")).toBe("shown");
    expect(host.querySelector('[data-role="reference_pre"] .difference-label')?.textContent).toBe("candidate − reference pre");
    expect(host.querySelector('[data-role="reference_post"] .difference')?.getAttribute("data-difference")).toBe("none");
    expect(host.querySelector('[data-role="reference_post"] .difference-none')?.textContent).toContain("No difference shown");
    expect(host.querySelector('[data-role="candidate"] .difference')).toBeNull();
  });

  it("the rating workspace sends an anchored campaign to its own page", async () => {
    vi.stubGlobal("fetch", anchoredEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} role="rater" />));
    await until(() => location.hash.endsWith("/anchored"));
    expect(log.some((a) => a.path.endsWith("/claim"))).toBe(false);
  });
});
