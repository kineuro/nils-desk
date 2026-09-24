// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's bench (record 45 S2, the viewer study's harness as the gate):
// a page that holds the viewer, or a grid of tiles, alone, drives it the way
// the study's pages drove each candidate, and prints the study's JSON lines
// ({candidate, measure, value}) to the console for scripts/viewer-bench.mjs.
// Built only by vite.bench.config.ts, never into the desk.
//
//   bench.html?mode=mpr&stack=ID[&level=L][&plane=PX][&scroll=0][&budget=BYTES][&marker=x,y,z&centre=x,y,z]
//   bench.html?mode=grid&stacks=A-B[,C...][&size=PX][&steps=N]

import { useState } from "react";
import { createRoot } from "react-dom/client";
import * as cs from "@cornerstonejs/core";
import "../shell.css";
import { Tile, TileSync } from "./Tile";
import { step } from "./tiles";
import { max3dTexture } from "./volume";
import { PLANES, Viewer, viewerIds, type Plane, type ViewerEvent } from "./Viewer";
import { dot, type Vec3 } from "./geometry";

const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "mpr";
const candidate = `nils-${mode}`;

function out(measure: string, value: unknown, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ viewer: "nils", candidate, measure, value, ...extra }));
}
type Memory = { usedJSHeapSize: number };
const heap = (): number | null => {
  const m = (performance as unknown as { memory?: Memory }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
};
const gc = async (): Promise<void> => {
  const g = (window as unknown as { gc?: () => void }).gc;
  if (g) g();
  await new Promise((r) => setTimeout(r, 200));
};
const raf = () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10;
  return { median: at(0.5), p95: at(0.95), max: at(1), n: s.length };
}
function renderer(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const d = gl?.getExtension("WEBGL_debug_renderer_info");
    return d && gl ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : gl ? "webgl2" : "none";
  } catch {
    return "none";
  }
}
const vec = (s: string | null): Vec3 | null => {
  const v = s?.split(",").map(Number);
  return v && v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
};

/** Heap samples while something runs: the peak is what the gate reads. */
function sampler(ms = 100) {
  let peak = heap() ?? 0;
  const t = setInterval(() => (peak = Math.max(peak, heap() ?? 0)), ms);
  return { stop: () => (clearInterval(t), Math.max(peak, heap() ?? 0)) };
}

/** Diagnosis: the buffers the cache's images reach, counted once each. */
function footprint(): Record<string, number> {
  const seen = new Set<ArrayBufferLike>();
  let bytes = 0;
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || depth > 4) return;
    if (ArrayBuffer.isView(o)) {
      if (!seen.has(o.buffer)) (seen.add(o.buffer), (bytes += o.buffer.byteLength));
      return;
    }
    for (const v of Object.values(o as Record<string, unknown>)) walk(v, depth + 1);
  };
  const cache = (cs.cache as unknown as { _imageCache: Map<string, { image?: { voxelManager?: { getScalarData?: () => unknown } } }> })._imageCache;
  for (const c of cache.values()) {
    walk(c.image, 0);
    walk(c.image?.voxelManager?.getScalarData?.(), 0);
  }
  return { images: cache.size, mb: Math.round(bytes / 1e6), buffers: seen.size };
}

/** Events from the viewer as promises the script can wait on. */
function watcher() {
  const seen: ViewerEvent[] = [];
  const waiters: { test: (e: ViewerEvent) => boolean; resolve: (e: ViewerEvent) => void }[] = [];
  const on = (e: ViewerEvent) => {
    seen.push(e);
    for (const w of [...waiters]) if (w.test(e)) (waiters.splice(waiters.indexOf(w), 1), w.resolve(e));
  };
  const wait = (test: (e: ViewerEvent) => boolean, ms: number) =>
    new Promise<ViewerEvent>((resolve, reject) => {
      const had = seen.find(test);
      if (had) return resolve(had);
      waiters.push({ test, resolve });
      setTimeout(() => reject(new Error("the viewer did not get there in time")), ms);
    });
  return { on, wait };
}

/** The labels a viewport shows, read off the page as a person would. */
function labelsOn(container: Element | null): Record<string, string> {
  const out: Record<string, string> = {};
  container?.querySelectorAll("[data-edge]").forEach((n) => (out[(n as HTMLElement).dataset.edge!] = n.textContent ?? ""));
  return out;
}

/** Where the labels say a patient direction points on screen: right minus left, bottom minus top, strongest letter first. */
function labelVector(pos: string, neg: string): Vec3 {
  const axis: Record<string, [number, number]> = { L: [0, 1], R: [0, -1], P: [1, 1], A: [1, -1], S: [2, 1], I: [2, -1] };
  const v: Vec3 = [0, 0, 0];
  const add = (s: string, sign: number) => [...s].forEach((c, i) => {
    const a = axis[c];
    if (a) v[a[0]] += sign * a[1] * (i === 0 ? 1 : 0.5);
  });
  add(pos, 1);
  add(neg, -1);
  return v;
}

/** The bright marker's centre on a viewport's canvas, from its pixels, relative to the canvas centre (x right, y down), or null. */
function markerOnCanvas(element: HTMLElement): [number, number] | null {
  const canvas = element.querySelector("canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const { width: w, height: h } = canvas;
  const px = ctx.getImageData(0, 0, w, h).data;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4] > 160) {
        n++;
        sx += x;
        sy += y;
      }
    }
  return n > 4 ? [sx / n - w / 2, sy / n - h / 2] : null;
}

function judge(name: string, element: HTMLElement, labels: Record<string, string>, marker: Vec3, centre: Vec3) {
  const seen = markerOnCanvas(element);
  const d: Vec3 = [marker[0] - centre[0], marker[1] - centre[1], marker[2] - centre[2]];
  const right = labelVector(labels.right ?? "", labels.left ?? "");
  const down = labelVector(labels.bottom ?? "", labels.top ?? "");
  const predicted = [dot(d, right), dot(d, down)];
  const agree = (o: number, p: number) => Math.abs(p) < 5 || Math.sign(o) === Math.sign(p);
  const pass = !!seen && agree(seen[0], predicted[0]) && agree(seen[1], predicted[1]);
  out("orientation", pass, { view: name, labels, marker_px: seen?.map((v) => Math.round(v)) ?? null, predicted_mm: predicted.map((v) => Math.round(v)) });
  return pass;
}

async function mpr(stack: number, events: ReturnType<typeof watcher>) {
  const ids = viewerIds(stack);
  out("renderer", renderer(), { max3d: max3dTexture(), ua: navigator.userAgent.replace(/^.*Chrome\//, "Chrome ").split(" ")[1] });
  const first = await events.wait((e) => e.kind === "first-image", 60_000);
  out("time_to_first_image_ms", (first as { ms: number }).ms, { level: (first as { level: number }).level });
  out("memory_rest_mb", heap());
  const re = cs.getRenderingEngine(ids.engine)!;
  const stackVp = re.getViewport(ids.stack) as cs.StackViewport;

  if (q.get("scroll") !== "0") {
    const n = stackVp.getImageIds().length;
    const lat: number[] = [];
    const mem = sampler();
    const stride = Math.max(1, Math.floor(n / 600));
    for (let z = 0; z < n; z += stride) {
      const a = performance.now();
      await stackVp.setImageIdIndex(z);
      stackVp.render();
      await raf();
      lat.push(performance.now() - a);
    }
    const s = stats(lat);
    out("scroll_ms_median", s.median, { p95: s.p95, max: s.max, slices: s.n });
    out("memory_peak_mb", mem.stop(), { during: "scroll" });
    await gc();
    out("memory_after_scroll_mb", heap(), { cache_mb: Math.round(cs.cache.getCacheSize() / 1e6), ...footprint() });
  }

  // the three planes: the volume fills from the current plane outwards
  const t0 = performance.now();
  const mem = sampler(50);
  (document.querySelector('[role="tab"]:nth-of-type(2)') as HTMLButtonElement).click();
  const opened = await events.wait((e) => e.kind === "fallback" || (e.kind === "volume" && e.filled > 0), 60_000);
  if (opened.kind === "fallback") {
    // the server's planes: three pictures from the render door, lettered, nothing held in the browser
    await sleep(1500);
    const drawn = [...document.querySelectorAll(".viewer-plane-server canvas")].filter((c) => (c as HTMLCanvasElement).width > 0).length;
    out("fallback", opened.why, { planes_drawn: drawn, letters: document.querySelectorAll(".viewer-plane-server [data-edge]").length });
    out("mpr_ms_median", null, { note: `fallback: ${opened.why}` });
    out("memory_peak_mb", mem.stop(), { during: "planes" });
    return;
  }
  out("volume_first_planes_ms", Math.round(performance.now() - t0));
  const done = (await events.wait((e) => e.kind === "volume" && e.done, 600_000)) as Extract<ViewerEvent, { kind: "volume" }>;
  out("volume_fill_ms", Math.round(performance.now() - t0), { level: done.level, stride: done.stride, planes: done.depth, mb: Math.round(done.bytes / 1e6) });
  out("memory_peak_mb", mem.stop(), { during: "fill" });
  await gc();
  out("memory_after_fill_mb", heap(), { cache_mb: Math.round(cs.cache.getCacheSize() / 1e6) });
  const mem2 = sampler(50);
  await raf();
  await raf();

  const mprLat: Record<string, ReturnType<typeof stats>> = {};
  for (const p of ["coronal", "sagittal", "axial"] as Plane[]) {
    const vp = re.getViewport(ids.planes[p]) as cs.VolumeViewport;
    const n = vp.getNumberOfSlices();
    const lat: number[] = [];
    for (let i = 0; i < 100; i++) {
      const a = performance.now();
      await cs.utilities.jumpToSlice(vp.element, { imageIndex: Math.floor((i / 99) * (n - 1)) });
      vp.render();
      await raf();
      lat.push(performance.now() - a);
    }
    mprLat[p] = stats(lat);
    out(`mpr_${p}_ms_median`, mprLat[p].median, { p95: mprLat[p].p95, max: mprLat[p].max, slices: n, px: vp.canvas.width });
  }
  // the study's number is the coronal pass
  out("mpr_ms_median", mprLat.coronal.median, { p95: mprLat.coronal.p95 });

  // five seconds of window and level on the coronal plane, the study's interaction rate
  {
    const vp = re.getViewport(ids.planes.coronal) as cs.VolumeViewport;
    const base = vp.getProperties()?.voiRange ?? { lower: 0, upper: 1000 };
    const width = base.upper - base.lower;
    const centre = (base.upper + base.lower) / 2;
    const end = performance.now() + 5000;
    let frames = 0;
    for (let i = 0; performance.now() < end; i++) {
      const w = width * (1 + 0.5 * Math.sin(i / 10));
      const c = centre * (1 + 0.2 * Math.cos(i / 7));
      vp.setProperties({ voiRange: { lower: c - w / 2, upper: c + w / 2 } });
      vp.render();
      await raf();
      frames++;
    }
    out("interaction_fps", Math.round(frames / 5));
    vp.setProperties({ voiRange: base });
  }
  out("memory_peak_mb", mem2.stop(), { during: "mpr" });
  await gc();
  out("memory_after_mb", heap(), { cache_mb: Math.round(cs.cache.getCacheSize() / 1e6) });

  // orientation: the letters on each view against where the marker shows
  const marker = vec(q.get("marker"));
  const centre = vec(q.get("centre"));
  // a manifest without orientation says so and draws no letters
  out("orientation_unknown", document.querySelectorAll(".viewer-unknown").length, { letters: document.querySelectorAll("[data-edge]").length });
  let all = true;
  for (const p of PLANES) {
    const vp = re.getViewport(ids.planes[p]) as cs.VolumeViewport;
    const element = vp.element;
    const labels = labelsOn(element.parentElement);
    if (!marker || !centre) {
      out("orientation_labels", labels, { view: p });
      continue;
    }
    // move the plane through the marker along its normal only, so the centre stays the centre
    const cam = vp.getCamera();
    const n = cam.viewPlaneNormal as Vec3;
    const f = cam.focalPoint as Vec3;
    const pos = cam.position as Vec3;
    const k = dot([marker[0] - f[0], marker[1] - f[1], marker[2] - f[2]], n);
    vp.setCamera({ focalPoint: [f[0] + k * n[0], f[1] + k * n[1], f[2] + k * n[2]], position: [pos[0] + k * n[0], pos[1] + k * n[1], pos[2] + k * n[2]] });
    vp.setProperties({ voiRange: { lower: 2600, upper: 3400 } });
    vp.render();
    await raf();
    await raf();
    all = judge(p, element, labels, marker, centre) && all;
  }
  if (marker && centre) {
    (document.querySelector('[role="tab"]:nth-of-type(1)') as HTMLButtonElement).click();
    await raf();
    re.resize(true, true);
    const index = cs.utilities.getClosestStackImageIndexForPoint(marker, stackVp);
    if (index !== null && index !== undefined) await stackVp.setImageIdIndex(index);
    stackVp.setProperties({ voiRange: { lower: 2600, upper: 3400 } });
    stackVp.render();
    await sleep(500);
    await raf();
    all = judge("stack", stackVp.element, labelsOn(stackVp.element.parentElement), marker, centre) && all;
    out("orientation_all", all);
  }
}

function Grid({ stacks, size }: { stacks: number[]; size: number }) {
  const [sync] = useState(() => new TileSync(0.5));
  return (
    <div className="tiles">
      {stacks.map((s) => (
        <Tile key={s} stack={s} sync={sync} size={size} onShown={(id) => shown(id)} />
      ))}
      <Driver sync={sync} count={stacks.length} />
    </div>
  );
}

let shownCount = 0;
let onShownHook: (() => void) | null = null;
function shown(_id: number) {
  shownCount++;
  onShownHook?.();
}
function until(n: number, ms: number) {
  return new Promise<void>((resolve, reject) => {
    if (shownCount >= n) return resolve();
    onShownHook = () => shownCount >= n && resolve();
    setTimeout(() => reject(new Error(`${shownCount} of ${n} tiles shown`)), ms);
  });
}

let driven = false;
function Driver({ sync, count }: { sync: TileSync; count: number }) {
  if (!driven) {
    driven = true;
    void (async () => {
      const t0 = performance.now();
      const mem = sampler();
      try {
        await until(count, 120_000);
        out("grid_all_shown_ms", Math.round(performance.now() - t0), { tiles: count });
        const lat: number[] = [];
        const steps = Number(q.get("steps") ?? 20);
        for (let i = 0; i < steps; i++) {
          const target = shownCount + count;
          const a = performance.now();
          sync.set(step(sync.get(), 24, i < steps / 2 ? 1 : -1));
          await until(target, 60_000);
          lat.push(performance.now() - a);
        }
        const s = stats(lat);
        out("grid_step_ms_median", s.median, { p95: s.p95, max: s.max, steps: s.n, tiles: count });
      } catch (e) {
        out("failed", String((e as Error).message));
      }
      out("memory_peak_mb", mem.stop(), { during: "grid" });
      out("done", true);
    })();
  }
  return null;
}

function stacksOf(s: string | null): number[] {
  const out: number[] = [];
  for (const part of (s ?? "").split(",")) {
    const [a, b] = part.split("-").map(Number);
    if (Number.isInteger(a) && Number.isInteger(b)) for (let i = a; i <= b; i++) out.push(i);
    else if (Number.isInteger(a)) out.push(a);
  }
  return out;
}

const root = createRoot(document.getElementById("root")!);
if (mode === "grid") {
  root.render(<Grid stacks={stacksOf(q.get("stacks"))} size={Number(q.get("size") ?? 96)} />);
} else {
  const stack = Number(q.get("stack"));
  const level = q.get("level") !== null ? Number(q.get("level")) : null;
  const plane = Number(q.get("plane") ?? 512);
  document.documentElement.style.setProperty("--bench-plane", `${plane}px`);
  const events = watcher();
  root.render(
    <div className="bench" style={{ width: plane * 3 + 32 }}>
      <Viewer stack={stack} level={level} budget={q.get("budget") ? Number(q.get("budget")) : undefined} onEvent={events.on} />
    </div>,
  );
  mpr(stack, events)
    .catch((e: unknown) => out("failed", String((e as Error).message ?? e)))
    .finally(() => out("done", true));
}
