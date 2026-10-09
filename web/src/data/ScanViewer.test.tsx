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

const scan = (id: number, over: Partial<Scan> = {}): Scan => ({ id, subjectId: 1, subject: "sub-a", session: 1, label: null, day: "2026-01-02", name: `Scan ${id}`, orientation: "AX", images: 9, picture: `data:image/webp;base64,${id}`, questions: [], ...over });
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
  const show = (i: number, scans = SCANS) =>
    act(() =>
      root.render(
        <ScanViewer
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
});
