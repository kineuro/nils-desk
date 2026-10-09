// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The light viewer (record 55 H2): the grid's picture at once and timed from
// the click, the scan's frames drawn on a canvas from the middle, the wheel
// and the arrows through the planes with no read, the next scans' previews
// read ahead, left and right (j and k) to the next and previous scan, and the
// three planes one key away.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pictures, type Bitmap } from "./pictures";
import { framesBody, previewBody } from "./pictures.fixture";
import type { Scan } from "./scans";

vi.mock("../campaigns/StackView", () => ({
  StackView: ({ stack, view }: { stack: number; view: string }) => <div data-testid="three" data-stack={stack} data-view={view} />,
}));

const { ScanViewer, markOpen } = await import("./ScanViewer");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scan = (id: number, over: Partial<Scan> = {}): Scan => ({ id, subjectId: 1, subject: "sub-a", session: 1, label: null, day: "2026-01-02", name: `Scan ${id}`, description: null, bids: null, datatype: "anat", folder: "anat", axes: {}, series: null, orientation: "AX", images: 9, picture: `data:image/webp;base64,${id}`, partial: false, questions: [], ...over });
const SCANS = [scan(1), scan(2, { questions: ["body_part:low_confidence"] }), scan(3), scan(4)];

type Drawn = Bitmap & { stack: number; plane: number };

describe("the light viewer", () => {
  let root: Root;
  let el: HTMLDivElement;
  let asked: string[];
  let drawn: Drawn[];
  let store: Pictures;
  let at: number[];

  beforeEach(() => {
    asked = [];
    drawn = [];
    at = [];
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    const fetcher = async (url: string) => {
      asked.push(url);
      const pv = /^\/api\/instances\/(\d+)\/preview$/.exec(url);
      if (pv) return new Response(JSON.stringify(previewBody(9, { axial: `data:preview-${pv[1]}` }, { spacing: [2, 1, 1] })));
      const pl = /^\/api\/instances\/(\d+)\/preview\/planes\?from=(\d+)&to=(\d+)$/.exec(url);
      if (pl) {
        const frames = [];
        for (let z = Number(pl[2]); z < Number(pl[3]); z++) frames.push({ plane: z, bytes: new Uint8Array([Number(pl[1]), z]) });
        return new Response(framesBody(frames));
      }
      return new Response("{}", { status: 404 });
    };
    const decode = async (blob: Blob): Promise<Bitmap> => {
      const [stack, plane] = new Uint8Array(await blob.arrayBuffer());
      return { width: 64, height: 64, stack, plane } as Drawn;
    };
    store = new Pictures(fetcher, decode);
    // the canvas's context records what is drawn on it
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          fillRect: () => undefined,
          clearRect: () => undefined,
          drawImage: (b: Drawn) => drawn.push(b),
          set fillStyle(_: string) {},
          set imageSmoothingEnabled(_: boolean) {},
        }) as unknown as CanvasRenderingContext2D,
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.restoreAllMocks();
  });

  const settle = async (rounds = 30) => {
    await act(async () => {
      for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
    });
  };
  const show = (i: number, scans = SCANS, bare = false) =>
    act(() =>
      root.render(
        <ScanViewer
          bare={bare}
          scans={scans}
          at={i}
          store={store}
          onAt={(n) => {
            at.push(n);
            show(n, scans);
          }}
          onClose={() => at.push(-1)}
        />,
      ),
    );
  const key = (k: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
  const last = () => drawn.at(-1);

  it("shows the grid's picture at once, and times it from the click", () => {
    markOpen(1);
    show(0);
    const still = el.querySelector<HTMLImageElement>(".scan-still");
    expect(still?.getAttribute("src")).toBe("data:image/webp;base64,1");
    act(() => still!.dispatchEvent(new Event("load")));
    const ms = el.querySelector(".scan-view")?.getAttribute("data-first-ms");
    expect(ms).not.toBeNull();
    expect(Number(ms)).toBeGreaterThanOrEqual(0);
    expect(performance.getEntriesByName("nils-scan-first-picture:1", "measure")).toHaveLength(1);
  });

  it("draws the scan alone when bare: no head, the plane counter in the picture's corner, the keys as before", async () => {
    show(0, SCANS, true);
    await settle();
    expect(el.querySelector(".scan-view-head")).toBeNull();
    expect(el.querySelector(".scan-view")?.classList.contains("bare")).toBe(true);
    expect(el.querySelector(".scan-canvas .scan-count")?.textContent).toBe("5 / 9");
    key("ArrowUp");
    expect(last()).toMatchObject({ stack: 1, plane: 5 });
    expect(el.querySelector(".scan-canvas .scan-count")?.textContent).toBe("6 / 9");
  });

  it("draws the middle plane from the frames, then scrolls by key and wheel with no further read", async () => {
    show(0);
    await settle();
    expect(last()).toMatchObject({ stack: 1, plane: 4 });
    expect(el.textContent).toContain("5 / 9");
    // the still gives way to the canvas
    expect(el.querySelector(".scan-still")).toBeNull();
    const reads = asked.length;
    key("ArrowUp");
    expect(last()).toMatchObject({ stack: 1, plane: 5 });
    key("ArrowDown");
    key("ArrowDown");
    expect(last()).toMatchObject({ stack: 1, plane: 3 });
    const box = el.querySelector(".scan-canvas")!;
    act(() => box.dispatchEvent(new WheelEvent("wheel", { deltaY: 90, cancelable: true, bubbles: true })));
    expect(last()).toMatchObject({ stack: 1, plane: 6 });
    // the top stops at the last plane
    for (let i = 0; i < 20; i++) key("ArrowUp");
    expect(last()).toMatchObject({ stack: 1, plane: 8 });
    expect(asked.length).toBe(reads);
  });

  it("reads the next two scans' previews ahead, and moves with the arrows and j and k", async () => {
    show(1);
    await settle();
    expect(asked).toEqual(expect.arrayContaining(["/api/instances/3/preview", "/api/instances/4/preview", "/api/instances/1/preview"]));
    // a scan the sort is not sure of carries the border and says why on hover
    expect(el.querySelector(".scan-view")?.classList.contains("look")).toBe(true);
    expect(el.querySelector(".scan-view-name")?.getAttribute("title")).toBe("body part, low confidence");
    key("ArrowRight");
    await settle();
    expect(at).toEqual([2]);
    expect(el.querySelector(".scan-view")?.getAttribute("data-stack")).toBe("3");
    expect(last()).toMatchObject({ stack: 3, plane: 4 });
    key("k");
    key("j");
    expect(at).toEqual([2, 1, 2]);
    key("Escape");
    expect(at.at(-1)).toBe(-1);
  });

  it("draws the next scan's sharp middle frame in the frame after the key, read ahead and timed", async () => {
    show(1);
    await settle();
    // the read ahead starts once this scan's sharp frame is drawn, and decodes in idle time
    await settle();
    // the next two scans' middles were read ahead and decoded
    expect(asked).toEqual(expect.arrayContaining(["/api/instances/3/preview/planes?from=0&to=9", "/api/instances/4/preview/planes?from=0&to=9"]));
    expect(store.bitmap(3, 4)).toBeDefined();
    const reads = asked.length;
    performance.clearMeasures();
    key("ArrowRight");
    // no settling: drawn in the same commit as the key, with no read
    expect(el.querySelector(".scan-view")?.getAttribute("data-stack")).toBe("3");
    expect(last()).toMatchObject({ stack: 3, plane: 4 });
    expect(el.querySelector("canvas")?.classList.contains("on")).toBe(true);
    expect(asked.length).toBe(reads);
    expect(performance.getEntriesByName("nils-scan-next-sharp:3", "measure")).toHaveLength(1);
    expect(performance.getEntriesByName("nils-scan-first-sharp:3", "measure")).toHaveLength(1);
    expect(performance.getEntriesByName("nils-scan-first-picture:3", "measure")).toHaveLength(1);
  });

  it("reads the middle frame the grid's count names beside the preview, and turns to the preview's middle", async () => {
    show(0, [scan(6, { images: 9 })]);
    // both asked before either answers
    expect(asked.slice(0, 2).sort()).toEqual(["/api/instances/6/preview", "/api/instances/6/preview/planes?from=4&to=5"]);
    await settle();
    expect(last()).toMatchObject({ stack: 6, plane: 4 });
    // a count that is not the planes' (a scan of 20 images in 9 planes): the preview's middle wins until the person moves
    asked = [];
    show(0, [scan(9, { images: 20 })]);
    expect(asked).toContain("/api/instances/9/preview/planes?from=10&to=11");
    await settle();
    expect(last()).toMatchObject({ stack: 9, plane: 4 });
    expect(el.textContent).toContain("5 / 9");
  });

  it("times the still and the first sharp frame of a scan opened from the grid", async () => {
    performance.clearMeasures();
    markOpen(1);
    show(0);
    act(() => el.querySelector(".scan-still")!.dispatchEvent(new Event("load")));
    await settle();
    expect(performance.getEntriesByName("nils-scan-first-still:1", "measure")).toHaveLength(1);
    expect(performance.getEntriesByName("nils-scan-first-sharp:1", "measure")).toHaveLength(1);
    expect(performance.getEntriesByName("nils-scan-next-sharp:1", "measure")).toHaveLength(0);
  });

  it("draws a small stack whose preview and planes failed for a moment (the slow run's 13-slice stack)", async () => {
    // 2026-10-09, slow storage: a 13-slice stack showed its still and never
    // asked for its frames. The preview's failure was kept as failed behind
    // the still, and nothing asked again. Now each read is asked again.
    let previews = 0;
    let planes = 0;
    const fetcher = async (url: string) => {
      asked.push(url);
      if (/\/preview$/.test(url)) return ++previews === 1 ? new Response("busy", { status: 503 }) : new Response(JSON.stringify(previewBody(13, { axial: "data:p" })));
      const pl = /from=(\d+)&to=(\d+)/.exec(url)!;
      if (++planes === 1) throw new TypeError("NetworkError when attempting to fetch resource.");
      const frames = [];
      for (let z = Number(pl[1]); z < Number(pl[2]); z++) frames.push({ plane: z, bytes: new Uint8Array([7, z]) });
      return new Response(framesBody(frames));
    };
    const decode = async (blob: Blob): Promise<Bitmap> => {
      const [stack, plane] = new Uint8Array(await blob.arrayBuffer());
      return { width: 64, height: 64, stack, plane } as Drawn;
    };
    store = new Pictures(fetcher, decode, undefined, undefined, { backoff: [1, 1, 1], pause: (ms) => new Promise((r) => setTimeout(r, ms)) });
    show(0, [scan(7)]);
    await settle(60);
    expect(asked.filter((u) => u.includes("/planes")).length).toBe(2);
    expect(last()).toMatchObject({ stack: 7, plane: 6 });
    expect(el.textContent).toContain("7 / 13");
  });

  it("says when the frames could not be read, and reads them again on Try again", async () => {
    let down = true;
    const fetcher = async (url: string) => {
      asked.push(url);
      if (/\/preview$/.test(url)) return new Response(JSON.stringify(previewBody(5, { axial: "data:p" })));
      if (down) return new Response("down", { status: 502 });
      const pl = /from=(\d+)&to=(\d+)/.exec(url)!;
      const frames = [];
      for (let z = Number(pl[1]); z < Number(pl[2]); z++) frames.push({ plane: z, bytes: new Uint8Array([8, z]) });
      return new Response(framesBody(frames));
    };
    const decode = async (blob: Blob): Promise<Bitmap> => {
      const [stack, plane] = new Uint8Array(await blob.arrayBuffer());
      return { width: 64, height: 64, stack, plane } as Drawn;
    };
    store = new Pictures(fetcher, decode, undefined, undefined, { backoff: [1], pause: (ms) => new Promise((r) => setTimeout(r, ms)) });
    show(0, [scan(8)]);
    await settle(60);
    const again = [...el.querySelectorAll("button")].find((b) => b.textContent === "Try again");
    expect(again).toBeDefined();
    // the still stays on the screen meanwhile
    expect(el.querySelector(".scan-still")).not.toBeNull();
    down = false;
    act(() => again!.click());
    await settle(60);
    expect(last()).toMatchObject({ stack: 8, plane: 2 });
    expect([...el.querySelectorAll("button")].some((b) => b.textContent === "Try again")).toBe(false);
  });

  it("keeps the three planes one key away, loaded only then", async () => {
    show(0);
    await settle();
    expect(el.querySelector("[data-testid=three]")).toBeNull();
    key("3");
    expect(el.querySelector("[data-testid=three]")?.getAttribute("data-view")).toBe("planes");
    expect(el.querySelector("canvas")).toBeNull();
    key("3");
    expect(el.querySelector("[data-testid=three]")).toBeNull();
    expect(el.querySelector("canvas")).not.toBeNull();
  });

  it("falls back to the preview's middle plane where the grid had no picture", async () => {
    show(0, [scan(5, { picture: null })]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // the preview may already be drawn over; either it shows, or the frames do
    const still = el.querySelector(".scan-still")?.getAttribute("src");
    if (still) expect(still).toBe("data:preview-5");
    else expect(last()).toMatchObject({ stack: 5 });
  });

  it("shows a partial preview's still and near frames, then asks again until the preview is whole", async () => {
    let partial = true;
    const asks: string[] = [];
    const fetcher = async (url: string) => {
      asks.push(url);
      if (url === "/api/instances/9/preview")
        return new Response(JSON.stringify(previewBody(100, partial ? { axial: "data:first" } : { axial: "data:whole", coronal: "data:c", sagittal: "data:s" }, { partial, digest: "d9", retry_after_ms: 20 })));
      const pl = /^\/api\/instances\/9\/preview\/planes\?from=(\d+)&to=(\d+)/.exec(url);
      if (pl) {
        const frames = [];
        for (let z = Number(pl[1]); z < Number(pl[2]); z++) frames.push({ plane: z, bytes: new Uint8Array([9, z]) });
        return new Response(framesBody(frames));
      }
      return new Response("{}", { status: 404 });
    };
    const decode = async (blob: Blob): Promise<Bitmap> => {
      const [stack, plane] = new Uint8Array(await blob.arrayBuffer());
      return { width: 64, height: 64, stack, plane } as Drawn;
    };
    store = new Pictures(fetcher, decode);
    show(0, [scan(9, { picture: null, images: null })]);
    await settle();
    expect(last()).toMatchObject({ stack: 9, plane: 50 });
    const planes = asks.filter((u) => u.includes("/planes?"));
    expect(planes.length).toBeGreaterThan(0);
    for (const u of planes) {
      const [, a, b] = /from=(\d+)&to=(\d+)/.exec(u)!.map(Number);
      expect(b - a).toBeLessThanOrEqual(32);
      expect(u).not.toContain("&v=");
    }
    expect(store.previewNow(9)?.partial).toBe(true);
    partial = false;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    await settle();
    expect(store.previewNow(9)?.partial).toBe(false);
    expect(store.previewNow(9)?.middle.coronal).toBe("data:c");
    expect(asks.filter((u) => u === "/api/instances/9/preview").length).toBeGreaterThanOrEqual(2);
  });
});
