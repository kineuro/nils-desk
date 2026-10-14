// SPDX-License-Identifier: AGPL-3.0-only
// A result's layer at the doors (record 55 H3, job type 3, D1, against E1's
// contract): the manifest asked again while the engine builds it (202),
// kept once per page, its state said apart from the picture's; its slabs
// read once through the page's slab cache under a key of their own, beside
// the scan's pictures and pinned with them.

import { afterEach, describe, expect, it, vi } from "vitest";
import { pictureState } from "./building";
import { fitsScan, forgetLayers, layerDoors, layerKey, layerManifest, layerState, type LayerRef } from "./layer";
import { forgetSlabs, hasLayerSlab, hasSlab, layerSlab, layerSlabKey, slab, slabCounters, slabKey } from "./slabs";

const REF: LayerRef = { derivative: 9001, set: "lesions" };
const LAYER = { stack: 123, derivative: 9001, set: "lesions", kind: "components", values: "part", link: "same", codec: "htj2k", tile: 256, levels: 3, shape: [40, 256, 256], dtype: "uint16", voxels: 812 };

afterEach(() => {
  forgetLayers();
  forgetSlabs();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A slab container of n planes of one empty tile each, as the door packs it. */
function slabBody(n: number): ArrayBuffer {
  const tile = new Uint8Array([1, 2, 3, 4]);
  const plane = new Uint8Array(4 + 4 + tile.length);
  const pv = new DataView(plane.buffer);
  pv.setUint32(0, 1, true);
  pv.setUint32(4, 8, true);
  plane.set(tile, 8);
  const head = 4 + 4 * n;
  const out = new Uint8Array(head + n * plane.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, n, true);
  for (let i = 0; i < n; i++) {
    v.setUint32(4 + 4 * i, head + i * plane.length, true);
    out.set(plane, head + i * plane.length);
  }
  return out.buffer;
}

describe("the layer's doors", () => {
  it("are the result's layer on the scan, by result, scan and set, as E1 serves them", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      asked.push(url);
      return Promise.resolve(url.endsWith("/manifest") ? json(LAYER) : new Response(slabBody(2), { status: 200, headers: { "X-Nils-Codec": "htj2k" } }));
    });
    expect((await layerDoors.manifestOnce(123, REF)).voxels).toBe(812);
    const s = await layerDoors.slab(123, REF, 1, 0, 2);
    expect(s.planes).toHaveLength(2);
    expect(s.codec).toBe("htj2k");
    await layerDoors.plane(123, { derivative: 9001, set: "white matter" }, 0, 7);
    expect(asked).toEqual(["/api/derivatives/9001/layers/123/lesions/manifest", "/api/derivatives/9001/layers/123/lesions/slab/1/0-2", "/api/derivatives/9001/layers/123/white%20matter/tiles/0/7"]);
  });

  it("wait while the layer is built (202), say so as the layer's state and not the picture's, and keep the manifest once", async () => {
    const answers = [json({ building: true, job: 77, state: "running", progress: { done: 1, total: 4 }, retry_after: 1, retry_after_ms: 50 }, 202), json(LAYER)];
    let asks = 0;
    vi.stubGlobal("fetch", () => Promise.resolve(answers[Math.min(asks++, answers.length - 1)]));
    const key = layerKey(123, REF);
    let seen: unknown = null;
    const m = await layerManifest(123, REF, async () => {
      seen = layerState(key);
    });
    expect(seen).toMatchObject({ kind: "building", building: { job: 77, fraction: 0.25 } });
    expect(m.shape).toEqual([40, 256, 256]);
    expect(layerState(key)).toBeNull();
    // the scan's picture was never said to be building
    expect(pictureState(123)).toBeNull();
    await layerManifest(123, REF);
    expect(asks).toBe(2);
  });

  it("keep a refusal as the layer's state and ask again the next time", async () => {
    let asks = 0;
    vi.stubGlobal("fetch", () => (asks++, Promise.resolve(json({ error: "result 9001 cannot be drawn: no scan is known whose grid it is on" }, 409))));
    await expect(layerManifest(123, REF)).rejects.toThrow();
    expect(layerState(layerKey(123, REF))).toEqual({ kind: "refused", why: "cannot be drawn on this scan" });
    await expect(layerManifest(123, REF)).rejects.toThrow();
    expect(asks).toBe(2);
  });

  it("fit a scan only with the scan's planes and levels", () => {
    const scan = { shape: [40, 256, 256] as [number, number, number], levels: 3 };
    expect(fitsScan(LAYER as never, scan)).toBe(true);
    expect(fitsScan({ ...LAYER, shape: [41, 256, 256] } as never, scan)).toBe(false);
    expect(fitsScan({ ...LAYER, levels: 2 } as never, scan)).toBe(false);
  });
});

describe("the layer's slabs", () => {
  it("are read once, kept apart from the scan's pictures, and joined while read", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", (url: string) => {
      reads += 1;
      return Promise.resolve(new Response(slabBody(url.includes("/slab/0/0-32") ? 32 : 8), { status: 200, headers: { "X-Nils-Codec": "htj2k" } }));
    });
    const [a, b] = await Promise.all([layerSlab(123, REF, 0, 0, 32), layerSlab(123, REF, 0, 0, 32)]);
    expect(a).toBe(b);
    expect(reads).toBe(1);
    expect(slabCounters.joined).toBe(1);
    expect(hasLayerSlab(123, REF, 0, 0, 32)).toBe(true);
    // the picture's slab of the same planes is another read
    expect(hasSlab(123, 0, 0, 32)).toBe(false);
    expect(layerSlabKey(123, REF, 0, 0, 32)).not.toBe(slabKey(123, 0, 0, 32));
    await slab(123, 0, 0, 32);
    expect(reads).toBe(2);
    // from memory the second time
    await layerSlab(123, REF, 0, 0, 32);
    expect(reads).toBe(2);
    expect(slabCounters.hits).toBe(1);
  });
});
