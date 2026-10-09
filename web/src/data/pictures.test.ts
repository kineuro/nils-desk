// SPDX-License-Identifier: AGPL-3.0-only
// A scan's pictures (record 55 H2): the preview read in either shape, the
// planes body's index and frames, the order frames are read and decoded in,
// the LRU of decoded bitmaps, and the store that reads each thing once.

import { describe, expect, it } from "vitest";
import { BitmapLru, frameRanges, outwards, parseFrames, Pictures, planeOf, previewOf, type Bitmap } from "./pictures";
import { framesBody } from "./pictures.fixture";

describe("a preview, read", () => {
  it("takes the header at the top and the three pictures beside it", () => {
    const p = previewOf({ shape: [160, 256, 256], spacing: [1.2, 1, 1], orientation: "SAG", window: { center: 300, width: 600 }, planes: 160, digest: "abc", axial: "data:a", coronal: "data:c", sagittal: "data:s" });
    expect(p).toEqual({ shape: [160, 256, 256], spacing: [1.2, 1, 1], orientation: "SAG", window: { center: 300, width: 600 }, planes: 160, digest: "abc", middle: { axial: "data:a", coronal: "data:c", sagittal: "data:s" } });
  });

  it("takes them nested too, and counts the planes from the shape where it says none", () => {
    const p = previewOf({ header: { shape: [40, 512, 512], spacing: null }, middle: { axial: "data:a" } });
    expect(p.planes).toBe(40);
    expect(p.middle).toEqual({ axial: "data:a" });
    expect(p.window).toBeNull();
  });

  it("knows the plane a scan was taken in from its orientation word", () => {
    expect(planeOf("SAG")).toBe("sagittal");
    expect(planeOf("cor")).toBe("coronal");
    expect(planeOf("AX")).toBe("axial");
    expect(planeOf(null)).toBe("axial");
  });
});

describe("a planes body", () => {
  it("is split into its frames by the index, each with its type", () => {
    const body = framesBody([
      { plane: 4, bytes: new Uint8Array([1, 2, 3]) },
      { plane: 5, bytes: new Uint8Array([9, 9]), mime: "image/jpeg" },
    ]);
    const { frames, data } = parseFrames(body);
    expect(frames).toEqual([
      { plane: 4, offset: 0, length: 3, mime: "image/webp" },
      { plane: 5, offset: 3, length: 2, mime: "image/jpeg" },
    ]);
    expect([...new Uint8Array(data.slice(3, 5))]).toEqual([9, 9]);
  });

  it("reads an index that is the list alone, and leaves out a frame past the end", () => {
    const body = framesBody([{ plane: 0, bytes: new Uint8Array([7]) }], "array");
    expect(parseFrames(body).frames).toEqual([{ plane: 0, offset: 0, length: 1, mime: "image/webp" }]);
    const idx = new TextEncoder().encode(JSON.stringify([{ plane: 0, offset: 0, length: 99 }]));
    const bad = new Uint8Array(4 + idx.length + 2);
    new DataView(bad.buffer).setUint32(0, idx.length, true);
    bad.set(idx, 4);
    expect(parseFrames(bad.buffer).frames).toEqual([]);
    expect(() => parseFrames(new ArrayBuffer(2))).toThrow();
  });
});

describe("the order of reading", () => {
  it("reads the planes around the middle first, then the rest above and below", () => {
    expect(frameRanges(160, 80)).toEqual([
      [72, 88],
      [88, 160],
      [0, 72],
    ]);
    expect(frameRanges(10, 5)).toEqual([[0, 10]]);
    expect(frameRanges(0, 0)).toEqual([]);
  });

  it("decodes from the plane shown outwards", () => {
    expect(outwards(6, 2)).toEqual([2, 3, 1, 4, 0, 5]);
    expect(outwards(3, 0)).toEqual([0, 1, 2]);
  });
});

const bitmap = (w = 10, h = 10): Bitmap & { closed: boolean } => {
  const b = { width: w, height: h, closed: false, close: () => (b.closed = true) };
  return b;
};

describe("the decoded pictures kept", () => {
  it("lets the least lately used go first when the bytes pass the budget, and closes it", () => {
    const lru = new BitmapLru(1000);
    const a = bitmap();
    const b = bitmap();
    const c = bitmap();
    lru.set("a", a);
    lru.set("b", b);
    lru.get("a");
    lru.set("c", c);
    expect(lru.keys()).toEqual(["a", "c"]);
    expect(b.closed).toBe(true);
    expect(lru.bytes).toBe(800);
  });
});

describe("the page's store of pictures", () => {
  const preview = { shape: [40, 64, 64], spacing: [1, 1, 1], orientation: "AX", planes: 40, axial: "data:a" };
  const engine = () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      if (url === "/api/instances/7/preview") return new Response(JSON.stringify(preview));
      const m = /^\/api\/instances\/7\/preview\/planes\?from=(\d+)&to=(\d+)$/.exec(url);
      if (m) {
        const frames = [];
        for (let z = Number(m[1]); z < Number(m[2]); z++) frames.push({ plane: z, bytes: new Uint8Array([z]) });
        return new Response(framesBody(frames));
      }
      return new Response("{}", { status: 404 });
    };
    const decoded: number[] = [];
    const decode = async (blob: Blob) => {
      decoded.push(new Uint8Array(await blob.arrayBuffer())[0]);
      return bitmap(64, 64);
    };
    return { asked, fetcher, decoded, decode };
  };

  it("reads a preview once however often it is asked", async () => {
    const e = engine();
    const pics = new Pictures(e.fetcher, e.decode);
    const [a, b] = await Promise.all([pics.preview(7), pics.preview(7)]);
    expect(a.planes).toBe(40);
    expect(b).toBe(a);
    expect(e.asked).toEqual(["/api/instances/7/preview"]);
  });

  it("reads every frame of a scan in three requests, the middle first, decodes each once, and tells who listens", async () => {
    const e = engine();
    const pics = new Pictures(e.fetcher, e.decode);
    const told: number[] = [];
    pics.on((s) => told.push(s));
    await Promise.all([pics.load(7, 40, 20), pics.load(7, 40, 20)]);
    expect(e.asked).toEqual(["/api/instances/7/preview/planes?from=12&to=28", "/api/instances/7/preview/planes?from=28&to=40", "/api/instances/7/preview/planes?from=0&to=12"]);
    expect(e.decoded).toHaveLength(40);
    expect(new Set(e.decoded).size).toBe(40);
    // the plane shown is decoded first
    expect(e.decoded[0]).toBe(20);
    expect(pics.bitmap(7, 0)).toBeDefined();
    expect(told.length).toBe(40);
    // a second load reads nothing again
    await pics.load(7, 40, 3);
    expect(e.asked).toHaveLength(3);
  });

  it("decodes a plane again from its frame once the LRU let it go", async () => {
    const e = engine();
    const pics = new Pictures(e.fetcher, e.decode, 64 * 64 * 4 * 4);
    await pics.load(7, 40, 20);
    expect(pics.bitmaps.size).toBe(4);
    const gone = [...Array(40).keys()].find((z) => !pics.bitmap(7, z))!;
    expect(pics.hasFrame(7, gone)).toBe(true);
    expect(await pics.again(7, gone)).not.toBeNull();
    expect(pics.bitmap(7, gone)).toBeDefined();
  });
});
