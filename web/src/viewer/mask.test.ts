// SPDX-License-Identifier: AGPL-3.0-only
// A result's labels into cornerstone (record 55 H3, job type 3, D1), with
// the engine and cornerstone stood in for: a test pattern of labels at
// known voxels of the layer lands at exactly those voxels of the labelmap
// volume, at the plan's level and stride and on a sheared stack's grid;
// the look is put on the segmentation as style and visibility, and hiding
// it or restyling it reads nothing. The real viewer is checked in chromium
// by test/layout/mask.pw.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ list: [] as [string, ...unknown[]][] }));
vi.mock("@cornerstonejs/tools", () => {
  const log =
    (name: string, ret?: unknown) =>
    (...args: unknown[]) => {
      calls.list.push([name, ...args]);
      return ret;
    };
  return {
    Enums: { SegmentationRepresentations: { Labelmap: "Labelmap" } },
    segmentation: {
      state: { getSegmentation: () => undefined },
      addSegmentations: log("addSegmentations"),
      segmentationStyle: { setStyle: log("segmentationStyle.setStyle") },
      addLabelmapRepresentationToViewport: log("addLabelmapRepresentationToViewport"),
      removeSegmentationRepresentations: log("removeSegmentationRepresentations"),
      removeSegmentation: log("removeSegmentation"),
      segmentIndex: { setActiveSegmentIndex: log("setActiveSegmentIndex") },
      triggerSegmentationEvents: { triggerSegmentationDataModified: log("triggerSegmentationDataModified"), triggerSegmentationRepresentationModified: log("triggerSegmentationRepresentationModified") },
      config: {
        color: { addColorLUT: log("addColorLUT", 7), getSegmentIndexColor: () => [0, 0, 0, 0] },
        style: { setStyle: log("setStyle") },
      },
    },
    utilities: { segmentation: { triggerSegmentationRender: log("triggerSegmentationRender") } },
  };
});
vi.mock("@cornerstonejs/core", () => ({ cache: {}, imageLoader: {}, volumeLoader: {}, getEnabledElementByViewportId: () => undefined }));

import type { Manifest } from "./doors";
import { drawLabels, fillLabels, labelImageId, labelVolumeId, lookLabels, placeLabels, segmentationIdOf, type LabelSource } from "./mask";
import { DEFAULT_LOOK, colourTable, type MaskPalette } from "./maskLook";

const base: Omit<Manifest, "levels" | "shape" | "spacing"> = { codec: "htj2k", tile: 256, dtype: "uint16", window: { center: 500, width: 900 }, orientation_known: true, orientation: [1, 0, 0, 0, 1, 0], origin: [0, 0, 0] };

/** The layer's plane z at a level as the engine serves it: the test pattern, one label at known voxels. */
const PATTERN: { z: number; y: number; x: number; label: number }[] = [
  { z: 0, y: 0, x: 0, label: 1 },
  { z: 3, y: 5, x: 7, label: 2 },
  { z: 33, y: 31, x: 2, label: 9 },
  { z: 34, y: 17, x: 29, label: 300 },
  { z: 39, y: 31, x: 31, label: 4 },
];

function source(m: Manifest, level: number, reads: string[] = []): LabelSource {
  const [, ny, nx] = [m.shape[0], Math.ceil(m.shape[1] / 2 ** level), Math.ceil(m.shape[2] / 2 ** level)];
  return {
    read: async (z0, z1) => {
      reads.push(`${z0}-${z1}`);
      // a "tile" here is the plane's number; decode makes the plane from it
      return { planes: Array.from({ length: z1 - z0 }, (_, i) => [new Uint8Array([z0 + i])]) };
    },
    decode: async (tiles, px, py) => {
      expect([px, py]).toEqual([nx, ny]);
      const z = tiles[0][0];
      const plane = new Uint16Array(px * py);
      for (const p of PATTERN) if (p.z === z && p.y < py && p.x < px) plane[p.y * px + p.x] = p.label;
      return plane;
    },
  };
}

beforeEach(() => {
  calls.list = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("the labels into the three planes' volume", () => {
  const m: Manifest = { ...base, levels: 2, shape: [40, 64, 64], spacing: [1, 1, 1] };

  it("land at exactly the voxels the layer holds them at, every plane, from every slab", async () => {
    const dims: [number, number, number] = [32, 32, 40];
    const dst = new Uint16Array(dims[0] * dims[1] * dims[2]);
    const reads: string[] = [];
    const landed: number[] = [];
    const n = await fillLabels(dst, m, { level: 1, stride: 1, dims }, source(m, 1, reads), { at: 20, landed: (ks) => landed.push(...ks) });
    expect(n).toBe(40);
    // the slab of plane 20 first, then outwards
    expect(reads[0]).toBe("0-32");
    expect(reads.sort()).toEqual(["0-32", "32-40"]);
    expect([...new Set(landed)].sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, k) => k));
    const at = (z: number, y: number, x: number) => dst[z * 32 * 32 + y * 32 + x];
    for (const p of PATTERN) expect(at(p.z, p.y, p.x), `voxel ${p.z},${p.y},${p.x}`).toBe(p.label);
    // and nothing else
    expect(dst.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)).toBe(PATTERN.length);
  });

  it("keep every stride-th plane where the volume is held at a stride", async () => {
    const dims: [number, number, number] = [32, 32, 20];
    const dst = new Uint16Array(32 * 32 * 20);
    await fillLabels(dst, m, { level: 1, stride: 2, dims }, source(m, 1));
    const at = (k: number, y: number, x: number) => dst[k * 32 * 32 + y * 32 + x];
    // planes 0 and 34 are kept (as 0 and 17), 3, 33 and 39 are not
    expect(at(0, 0, 0)).toBe(1);
    expect(at(17, 17, 29)).toBe(300);
    expect(dst.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)).toBe(2);
  });

  it("place a sheared stack's planes at their nearest whole shift, never blended", async () => {
    // planes that step 0.4 mm along the row each: the grid is wider by the drift, each plane shifted into it
    const sheared: Manifest = { ...m, levels: 1, shape: [40, 32, 32], step: [0.4, 0, 1] };
    const dims: [number, number, number] = [32 + Math.ceil(0.4 * 39 - 1e-9), 32, 40];
    const dst = new Uint16Array(dims[0] * dims[1] * dims[2]);
    await fillLabels(dst, sheared, { level: 0, stride: 1, dims }, source(sheared, 0));
    for (const p of PATTERN) {
      const shift = Math.round(0.4 * p.z);
      expect(dst[p.z * dims[0] * 32 + p.y * dims[0] + p.x + shift], `plane ${p.z}`).toBe(p.label);
    }
    expect(dst.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)).toBe(PATTERN.length);
  });

  it("place a plane into a wider one at a whole shift, clearing what lies outside it", () => {
    const dst = new Uint16Array(4 * 3).fill(9);
    placeLabels(new Uint16Array([1, 2, 3, 4]), 2, 2, dst, 0, 4, 3, 1.4, 0.6);
    expect([...dst]).toEqual([0, 0, 0, 0, 0, 1, 2, 0, 0, 3, 4, 0]);
  });
});

describe("the segmentation", () => {
  const palette: MaskPalette = { part: [224, 57, 62], focus: [255, 122, 127], flagged: [242, 160, 61], values: [] };
  const table = colourTable({ kind: "components", max: 255, palette });

  it("names a result's labels apart from the pictures and per set, scan and level", () => {
    const ref = { derivative: 9001, set: "lesions" };
    expect(labelImageId(123, ref, 1, 7)).toBe("nilsmask:9001/lesions/123/1/7");
    expect(labelVolumeId(123, ref, { level: 1, stride: 2 })).toBe("nilsmask:9001/lesions/123/1/2/volume");
    expect(segmentationIdOf(123, ref, "stack", 1)).not.toBe(segmentationIdOf(123, ref, "planes", 1));
  });

  it("is drawn on each viewport in its own colour table", () => {
    const d = drawLabels("seg-1", { volumeId: "v" }, ["a", "b"], table, DEFAULT_LOOK, null);
    expect(d.lut).toBe(7);
    expect(calls.list.filter((c) => c[0] === "addLabelmapRepresentationToViewport").map((c) => c[1])).toEqual(["a", "b"]);
    // the look set before it is drawn, with no render asked for it
    const names = calls.list.map((c) => c[0]);
    expect(names.indexOf("segmentationStyle.setStyle")).toBeLessThan(names.indexOf("addLabelmapRepresentationToViewport"));
    expect(calls.list.find((c) => c[0] === "segmentationStyle.setStyle")![2]).toMatchObject({ fillAlpha: 0.5, renderFill: true, renderOutline: true });
    expect(calls.list.find((c) => c[0] === "addSegmentations")![2]).toBe(true);
  });

  it("hides, shows and restyles without a read: style and visibility only", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (u: string) => (asked.push(u), Promise.reject(new Error("no read"))));
    const d = drawLabels("seg-2", { volumeId: "v" }, ["a", "b"], table, DEFAULT_LOOK, null);
    calls.list = [];
    lookLabels(d, { ...DEFAULT_LOOK, shown: false }, table, null);
    // hidden: a clear fill and no outline, on the labels already there
    expect(calls.list.find((c) => c[0] === "setStyle")![2]).toMatchObject({ renderFill: true, fillAlpha: 0, renderOutline: false });
    calls.list = [];
    lookLabels(d, { shown: true, fill: false, outline: true, opacity: 0.3 }, table, null);
    const style = calls.list.find((c) => c[0] === "setStyle")!;
    expect(style[1]).toEqual({ type: "Labelmap", segmentationId: "seg-2" });
    expect(style[2]).toMatchObject({ renderFill: false, renderOutline: true, fillAlpha: 0.3, outlineOpacity: 1, activeSegmentOutlineWidthDelta: 0 });
    // nothing but the style when no colour changed
    expect(calls.list.map((c) => c[0])).toEqual(["setStyle"]);
    // a part in focus: the active segment, outlined thicker, its colour changed in place
    calls.list = [];
    const focused = colourTable({ kind: "components", max: 255, palette, tones: new Map([[3, "focus"]]) });
    lookLabels(d, DEFAULT_LOOK, focused, 3);
    expect(calls.list.find((c) => c[0] === "setActiveSegmentIndex")).toEqual(["setActiveSegmentIndex", "seg-2", 3]);
    expect((calls.list.find((c) => c[0] === "setStyle")![2] as { activeSegmentOutlineWidthDelta: number }).activeSegmentOutlineWidthDelta).toBe(2);
    expect(d.table[3]).toEqual([255, 122, 127, 255]);
    expect(calls.list.some((c) => c[0] === "triggerSegmentationRepresentationModified")).toBe(true);
    expect(asked).toEqual([]);
  });
});
