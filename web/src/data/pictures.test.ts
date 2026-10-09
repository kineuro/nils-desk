// SPDX-License-Identifier: AGPL-3.0-only
// A scan's pictures (record 55 H2): the preview read in either shape, the
// planes body's index and frames, the order frames are read and decoded in,
// the LRU of decoded bitmaps, and the store that reads each thing once.

import { describe, expect, it } from "vitest";
import { BitmapLru, frameRanges, nextRange, outwards, parseFrames, Pictures, previewOf, type Bitmap } from "./pictures";
import { framesBody, previewBody } from "./pictures.fixture";

describe("a preview, read", () => {
  it("takes the engine's header, its middle planes' data URLs and its frame count", () => {
    const p = previewOf({
      stack: 7,
      digest: "abc",
      shape: [160, 256, 256],
      spacing: [1.2, 1, 1],
      orientation: [1, 0, 0, 0, 1, 0],
      plane: "sagittal",
      window: { percentiles: [1, 99], center: 300, width: 600 },
      held: false,
      middle: { axial: { width: 256, height: 256, bytes: 9, data: "data:a" }, coronal: { width: 256, height: 192, bytes: 9, data: "data:c" }, sagittal: { width: 256, height: 192, bytes: 9, data: "data:s" } },
      frames: { count: 160, width: 256, height: 256, bytes: 1000, url: "/api/instances/7/preview/planes?from=0&to=160&v=abc" },
    });
    expect(p).toEqual({ shape: [160, 256, 256], spacing: [1.2, 1, 1], plane: "sagittal", window: { center: 300, width: 600 }, planes: 160, digest: "abc", held: false, middle: { axial: "data:a", coronal: "data:c", sagittal: "data:s" } });
  });

  it("holds one middle plane for a single-plane scan, and counts the planes from the shape where frames say none", () => {
    const p = previewOf({ shape: [1, 512, 512], held: true, middle: { axial: { data: "data:a" } } });
    expect(p.planes).toBe(1);
    expect(p.middle).toEqual({ axial: "data:a" });
    expect(p.window).toBeNull();
    expect(p.plane).toBeNull();
    expect(p.held).toBe(true);
  });
});

describe("a planes body", () => {
  it("is split into its frames by the offsets, planes counted from its first", () => {
    const body = framesBody([
      { plane: 4, bytes: new Uint8Array([1, 2, 3]) },
      { plane: 5, bytes: new Uint8Array([9, 9]) },
    ]);
    const lead = 16 + 4 * 3;
    const { frames, data, width, height } = parseFrames(body);
    expect([width, height]).toEqual([64, 64]);
    expect(frames).toEqual([
      { plane: 4, offset: lead, length: 3, mime: "image/jpeg" },
      { plane: 5, offset: lead + 3, length: 2, mime: "image/jpeg" },
    ]);
    expect([...new Uint8Array(data.slice(lead + 3, lead + 5))]).toEqual([9, 9]);
  });

  it("leaves out a frame past the end, and refuses a body too short for its offsets", () => {
    const body = new Uint8Array(framesBody([{ plane: 0, bytes: new Uint8Array([7]) }]));
    new DataView(body.buffer).setUint32(20, 99, true);
    expect(parseFrames(body.buffer).frames).toEqual([]);
    expect(() => parseFrames(new ArrayBuffer(2))).toThrow();
    const short = new Uint8Array(16);
    new DataView(short.buffer).setUint32(4, 5, true);
    expect(() => parseFrames(short.buffer)).toThrow();
  });
});

describe("the order of reading", () => {
  it("reads the planes around the middle first, then outwards a range at a time, the nearest first", () => {
    expect(frameRanges(160, 80)).toEqual([
      [72, 88],
      [88, 136],
      [24, 72],
      [136, 160],
      [0, 24],
    ]);
    expect(frameRanges(10, 5)).toEqual([[0, 10]]);
    expect(frameRanges(13, 6)).toEqual([[0, 13]]);
    expect(frameRanges(0, 0)).toEqual([]);
  });

  it("takes the next range around the missing plane nearest the one shown, inside a window", () => {
    const have = new Set([10, 11, 12, 13]);
    const missing = (z: number) => !have.has(z);
    // the plane shown is read: the nearest missing one above it, grown away from what is read
    expect(nextRange(100, 12, missing, 8)).toEqual([14, 22]);
    // the person scrolled far: the range is read around the new plane
    expect(nextRange(100, 70, missing, 8)).toEqual([66, 74]);
    // a window: only the planes inside it
    expect(nextRange(100, 12, missing, 8, [8, 16])).toEqual([14, 16]);
    expect(nextRange(100, 12, (z) => z < 10 || z > 13, 8, [10, 14])).toBeNull();
    expect(nextRange(0, 0, missing, 8)).toBeNull();
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
  const preview = previewBody(40, { axial: "data:a" });
  const engine = () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      if (url === "/api/instances/7/preview") return new Response(JSON.stringify(preview));
      const m = /^\/api\/instances\/7\/preview\/planes\?from=(\d+)&to=(\d+)(?:&v=\w+)?$/.exec(url);
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

  it("names the preview's digest on the planes it reads, so the browser keeps them", async () => {
    const e = engine();
    const pics = new Pictures(e.fetcher, e.decode);
    await pics.load(7, 40, 20, "d1g");
    expect(e.asked[0]).toBe("/api/instances/7/preview/planes?from=12&to=28&v=d1g");
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

describe("reading a scan's frames from the plane shown", () => {
  // an engine whose answers wait until the test lets them go, and that sees an abort
  const held = (planes = 448) => {
    const asked: { url: string; signal?: AbortSignal | null; go: () => void }[] = [];
    const fetcher = (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const m = /planes\?from=(\d+)&to=(\d+)/.exec(url);
        const go = () => {
          if (url.endsWith("/preview")) return resolve(new Response(JSON.stringify(previewBody(planes, { axial: "data:a" }))));
          const frames = [];
          for (let z = Number(m![1]); z < Number(m![2]); z++) frames.push({ plane: z, bytes: new Uint8Array([z % 256]) });
          resolve(new Response(framesBody(frames)));
        };
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        asked.push({ url, signal: init?.signal, go });
      });
    return { asked, fetcher };
  };
  const decode = async () => bitmap(64, 64);
  const tick = async (n = 10) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const range = (url: string) => /from=(\d+)&to=(\d+)/.exec(url)!.slice(1).map(Number);

  it("asks the planes around the one shown alone first, then follows the person's scroll", async () => {
    const e = held();
    const pics = new Pictures(e.fetcher, decode);
    void pics.load(9, 448, 224);
    // one small read around the plane shown, and nothing else until it lands
    expect(e.asked.map((a) => range(a.url))).toEqual([[216, 232]]);
    e.asked[0].go();
    await tick();
    expect(pics.bitmap(9, 224)).toBeDefined();
    // then two at a time, nearest first
    expect(e.asked.slice(1).map((a) => range(a.url))).toEqual([
      [232, 280],
      [168, 216],
    ]);
    // the person scrolls far down: the next read is around the new plane
    pics.focus(9, 40);
    e.asked[1].go();
    await tick();
    expect(range(e.asked[3].url)).toEqual([16, 64]);
  });

  it("reads a scan ahead only around its middle, decoded in idle time, so opening it draws at once", async () => {
    const e = held(40);
    let idles = 0;
    const pics = new Pictures(e.fetcher, decode, undefined, undefined, { idle: async () => void idles++ });
    const ahead = pics.ahead(5, 40, 20);
    expect(e.asked.map((a) => range(a.url))).toEqual([[12, 28]]);
    e.asked[0].go();
    await ahead;
    expect(e.asked).toHaveLength(1);
    expect(pics.bitmap(5, 20)).toBeDefined();
    expect(pics.bitmap(5, 11)).toBeUndefined();
    expect(idles).toBe(16);
    // opened, it reads the rest from the middle outwards, never again what it has
    void pics.load(5, 40, 20);
    expect(e.asked.slice(1).map((a) => range(a.url))).toEqual([
      [28, 40],
      [0, 12],
    ]);
  });

  it("cancels the reads of a scan the person left, and lets its waiters go", async () => {
    const e = held();
    const pics = new Pictures(e.fetcher, decode);
    let settled = false;
    void pics.load(9, 448, 224).then(() => (settled = true));
    pics.keep([10, 11]);
    await tick();
    expect(e.asked[0].signal?.aborted).toBe(true);
    expect(settled).toBe(true);
    expect(pics.reading(9)).toBe(0);
    // opened again, it is read again
    void pics.load(9, 448, 224);
    expect(e.asked).toHaveLength(2);
    expect(range(e.asked[1].url)).toEqual([216, 232]);
  });
});

describe("a read that fails for a moment", () => {
  const quick = { backoff: [1, 1, 1], pause: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
  const decode = async () => bitmap(64, 64);
  const body = (from: number, to: number) => {
    const frames = [];
    for (let z = from; z < to; z++) frames.push({ plane: z, bytes: new Uint8Array([z]) });
    return framesBody(frames);
  };

  it("asks the preview again after a 503 and a dropped connection", async () => {
    const answers: (() => Response)[] = [
      () => new Response("busy", { status: 503, headers: { "Retry-After": "1" } }),
      () => {
        throw new TypeError("NetworkError when attempting to fetch resource.");
      },
      () => new Response(JSON.stringify(previewBody(13, { axial: "data:a" }))),
    ];
    let asked = 0;
    const pics = new Pictures(async () => (asked++, answers.shift()!()), decode, undefined, undefined, quick);
    const p = await pics.preview(4);
    expect(p.planes).toBe(13);
    expect(asked).toBe(3);
    expect(pics.previewNow(4)?.planes).toBe(13);
  });

  it("asks the planes again after a 500, and again when an answer never comes", async () => {
    let n = 0;
    const fetcher = (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        n++;
        if (n === 1) return resolve(new Response("oops", { status: 500 }));
        // the second never answers: the store gives up on it and asks again
        if (n === 2) return init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        const m = /from=(\d+)&to=(\d+)/.exec(url)!;
        resolve(new Response(body(Number(m[1]), Number(m[2]))));
      });
    const pics = new Pictures(fetcher, decode, undefined, undefined, { ...quick, stallMs: 20 });
    await pics.load(4, 13, 6);
    expect(n).toBe(3);
    expect(pics.bitmap(4, 6)).toBeDefined();
    expect(pics.hasFrame(4, 12)).toBe(true);
  });

  it("gives up after the last pause, and reads again when asked again", async () => {
    let fail = true;
    let n = 0;
    const fetcher = async (url: string) => {
      n++;
      if (fail) return new Response("down", { status: 502 });
      const m = /from=(\d+)&to=(\d+)/.exec(url)!;
      return new Response(body(Number(m[1]), Number(m[2])));
    };
    const pics = new Pictures(fetcher, decode, undefined, undefined, quick);
    await expect(pics.load(4, 13, 6)).rejects.toThrow(/502/);
    expect(n).toBe(4);
    fail = false;
    await pics.load(4, 13, 6);
    expect(pics.bitmap(4, 6)).toBeDefined();
  });

  it("does not ask again what is refused", async () => {
    let n = 0;
    const pics = new Pictures(async () => (n++, new Response("{}", { status: 403 })), decode, undefined, undefined, quick);
    await expect(pics.preview(4)).rejects.toThrow(/403/);
    expect(n).toBe(1);
  });
});
