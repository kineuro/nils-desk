// SPDX-License-Identifier: AGPL-3.0-only
// A result's mask in the real viewer (record 55 H3, job type 3, slice D1):
// two panels of an item (two scans of one visit in one scanner frame, a
// 1 mm and a 2 mm stack), each the desk's own Viewer with cornerstone, over
// a fake engine that answers the instance doors and the result's parts and
// layer doors as E1 serves them (202 while the layer builds, then the label
// pyramid on each scan's own pyramid). Tiles are raw values here, decoded by
// the stand-in worker in public/codecs; the shapes and the cache are the
// desk's. mask.pw.ts drives the page through `window.maskPage`.
//
//   mask.html?view=stack|planes&items=6

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as cs from "@cornerstonejs/core";
import * as tools from "@cornerstonejs/tools";
import "../../src/shell.css";
import { Warmer, type Ahead } from "../../src/campaigns/ahead";
import { Viewer, viewerIds, type ViewerEvent } from "../../src/viewer/Viewer";
import { labelImageId, labelVolumeId } from "../../src/viewer/mask";
import { DEFAULT_LOOK, useMaskKeys, type MaskLook, type Tone } from "../../src/viewer/maskLook";
import { forgetLayers, type LayerRef } from "../../src/viewer/layer";
import { slabCounters } from "../../src/viewer/slabs";
import type { Vec3 } from "../../src/viewer/geometry";
import type { PartPlace } from "../../src/viewer/focus";
import type { ViewMode } from "../../src/viewer/view";

const q = new URLSearchParams(location.search);
const VIEW = (q.get("view") ?? "stack") as ViewMode;
// no mask: the same items' pictures alone, the time to compare the masks' against
const MASKED = q.get("mask") !== "off";
const ITEMS = Number(q.get("items") ?? 6);
const DERIVATIVE = 900;
const SET = "lesions";
const REF: LayerRef = { derivative: DERIVATIVE, set: SET };
const TILE = 256;
const LEVELS = 2;

// ---------------------------------------------------------------- the fake engine's scans and result

interface Scan {
  id: number;
  shape: [number, number, number];
  /** [dz, dy, dx] mm. */
  spacing: [number, number, number];
  origin: Vec3;
}

/** Item n shows two scans of one frame: an even stack at 1 mm (64 planes), an odd one at 2 mm (32 planes). */
const scanOf = (id: number): Scan => (id % 2 === 0 ? { id, shape: [64, 128, 128], spacing: [1, 1, 1], origin: [-64, -64, -32] } : { id, shape: [32, 128, 128], spacing: [2, 1, 1], origin: [-64, -64, -32] });
const stacksOf = (item: number): [number, number] => [100 + 2 * item, 101 + 2 * item];

/** The result's three lesions, in the patient (LPS mm): boxes of voxel centres, a one-voxel lesion among them. */
const PARTS: { label: number; box: [Vec3, Vec3]; anchor: Vec3 }[] = [
  { label: 1, box: [[-10, 5, 0], [-3, 12, 5]], anchor: [-7, 8, 2] },
  { label: 2, box: [[20, -20, 10], [20, -20, 10]], anchor: [20, -20, 10] },
  { label: 3, box: [[20, 25, -20], [45, 45, -10]], anchor: [32, 35, -16] },
];

const world = (s: Scan, z: number, y: number, x: number): Vec3 => [s.origin[0] + x * s.spacing[2], s.origin[1] + y * s.spacing[1], s.origin[2] + z * s.spacing[0]];
const labelAt = (p: Vec3): number => PARTS.find((t) => [0, 1, 2].every((a) => p[a] >= t.box[0][a] - 0.5 && p[a] <= t.box[1][a] + 0.5))?.label ?? 0;

const levelShape = (s: Scan, level: number): [number, number, number] => [s.shape[0], Math.ceil(s.shape[1] / 2 ** level), Math.ceil(s.shape[2] / 2 ** level)];

/** What the engine's layer holds: level 0 the lesions placed by world position, a coarse voxel any label of its four. */
function truth(stack: number, level: number, z: number): Uint16Array {
  const s = scanOf(stack);
  const [, ny, nx] = levelShape(s, level);
  const out = new Uint16Array(nx * ny);
  const f = 2 ** level;
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      let v = 0;
      for (let j = 0; j < f && !v; j++) for (let i = 0; i < f && !v; i++) v = labelAt(world(s, z, y * f + j, x * f + i));
      out[y * nx + x] = v;
    }
  return out;
}

/** The scan's grey: a soft gradient with a brighter disc, so the mask has a picture under it. */
function grey(stack: number, level: number, z: number): Uint16Array {
  const s = scanOf(stack);
  const [, ny, nx] = levelShape(s, level);
  const out = new Uint16Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) out[y * nx + x] = 200 + ((x + y + z) % 64) * 4 + (Math.hypot(x - nx / 2, y - ny / 2) < nx / 3 ? 300 : 0);
  return out;
}

function tileOf(plane: Uint16Array, nx: number, ny: number): Uint8Array {
  const b = new ArrayBuffer(8 + nx * ny * 2);
  const v = new DataView(b);
  v.setUint32(0, nx, true);
  v.setUint32(4, ny, true);
  for (let i = 0; i < nx * ny; i++) v.setUint16(8 + i * 2, plane[i], true);
  return new Uint8Array(b);
}

/** [u32 count][u32 offset...][parts...], each offset from the container's start. */
function pack(parts: Uint8Array[]): Uint8Array {
  const head = 4 + 4 * parts.length;
  const total = head + parts.reduce((a, p) => a + p.byteLength, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, parts.length, true);
  let at = head;
  parts.forEach((p, i) => {
    v.setUint32(4 + i * 4, at, true);
    out.set(p, at);
    at += p.byteLength;
  });
  return out;
}

function slabBytes(stack: number, level: number, z0: number, z1: number, of: (stack: number, level: number, z: number) => Uint16Array): Uint8Array {
  const [, ny, nx] = levelShape(scanOf(stack), level);
  return pack(Array.from({ length: z1 - z0 }, (_, i) => pack([tileOf(of(stack, level, z0 + i), nx, ny)])));
}

function manifestOf(stack: number) {
  const s = scanOf(stack);
  return {
    codec: "htj2k",
    tile: TILE,
    levels: LEVELS,
    shape: s.shape,
    spacing: s.spacing,
    dtype: "uint16",
    window: { center: 500, width: 900 },
    orientation: [1, 0, 0, 0, 1, 0],
    orientation_known: true,
    origin: s.origin,
    frame: true,
    plane: "axial",
    oblique: false,
    step: [0, 0, s.spacing[0]],
    level_shapes: Array.from({ length: LEVELS }, (_, level) => ({ level, shape: levelShape(s, level), tiles: [1, 1] })),
    stack,
  };
}

function layerManifestOf(stack: number) {
  const m = manifestOf(stack);
  return { stack, derivative: DERIVATIVE, sha256: "f".repeat(64), set: SET, kind: "components", values: "part", link: stack % 2 === 0 ? "same" : "world", codec: "htj2k", tile: TILE, levels: LEVELS, shape: m.shape, level_shapes: m.level_shapes, dtype: "uint16", voxels: 1, built_at: "", scan_built_at: "", grid_stack: stack };
}

// what the page asked the engine, for the check: every door by its path
const fetches: string[] = [];
// a layer answers 202 on its first ask, as one being built does
const asked = new Set<number>();
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (!path.startsWith("/api/")) return realFetch(input, init);
  fetches.push(path);
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const bin = (b: Uint8Array) => new Response(b, { status: 200, headers: { "content-type": "application/x-nils-tiles", "X-Nils-Codec": "htj2k" } });
  let m: RegExpExecArray | null;
  if ((m = /^\/api\/instances\/(\d+)\/manifest$/u.exec(path))) return json(manifestOf(Number(m[1])));
  if ((m = /^\/api\/instances\/(\d+)\/slab\/(\d+)\/(\d+)-(\d+)$/u.exec(path))) return bin(slabBytes(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), grey));
  if ((m = /^\/api\/derivatives\/900\/layers\/(\d+)\/lesions\/manifest$/u.exec(path))) {
    const stack = Number(m[1]);
    if (!asked.has(stack)) {
      asked.add(stack);
      return json({ building: true, job: 7000 + stack, state: "running", progress: { done: 0, total: 1 }, retry_after: 1, retry_after_ms: 120, message: "the layer is being made" }, 202, { "Retry-After": "1" });
    }
    return json(layerManifestOf(stack));
  }
  if ((m = /^\/api\/derivatives\/900\/layers\/(\d+)\/lesions\/slab\/(\d+)\/(\d+)-(\d+)$/u.exec(path))) return bin(slabBytes(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), truth));
  return json({ error: `no door ${path}` }, 404);
}) as typeof fetch;

// ---------------------------------------------------------------- the page

interface Seen {
  panel: number;
  stack: number;
  e: ViewerEvent;
  at: number;
}
const events: Seen[] = [];
const warmer = new Warmer();
let itemNow = 0;

/** Whether a stack's mask is on its stack view: its labelmap actor there, coloured. */
function maskDrawn(stack: number): boolean {
  const vp = cs.getRenderingEngine("nils-viewer")?.getViewport(viewerIds(stack).stack);
  if (!vp) return false;
  return vp.getActors().some((a) => {
    if (typeof a.representationUID !== "string" || !a.representationUID.includes("-Labelmap")) return false;
    const p = (a.actor as unknown as { getProperty: () => { getRGBTransferFunction?: (i: number) => unknown } }).getProperty();
    return !!p.getRGBTransferFunction?.(0);
  });
}

/** Where a stack's mask is in cornerstone: no viewport, no representation, no actor, an actor without colours, coloured. */
function stageOf(stack: number): string {
  const id = viewerIds(stack).stack;
  const vp = cs.getRenderingEngine("nils-viewer")?.getViewport(id);
  if (!vp) return "v";
  if (!(tools.segmentation.state.getSegmentationRepresentations(id) ?? []).length) return "r";
  const a = vp.getActors().find((x) => typeof x.representationUID === "string" && x.representationUID.includes("-Labelmap"));
  if (!a) return "a";
  return (a.actor as unknown as { getProperty: () => { getRGBTransferFunction?: (i: number) => unknown } }).getProperty().getRGBTransferFunction?.(0) ? "C" : "b";
}

/** A view's camera as the check compares it: its focal point, its zoom, and the stack's plane. */
function camOf(stack: number, where: "stack" | "axial" | "coronal" | "sagittal"): { focal: number[]; scale: number; index: number | null } | null {
  const ids = viewerIds(stack);
  const vp = cs.getRenderingEngine("nils-viewer")?.getViewport(where === "stack" ? ids.stack : ids.planes[where]) as (cs.StackViewport & cs.VolumeViewport) | undefined;
  if (!vp) return null;
  const c = vp.getCamera();
  return { focal: (c.focalPoint ?? [0, 0, 0]).map((v) => Math.round(v * 100) / 100), scale: Math.round((c.parallelScale ?? 0) * 100) / 100, index: typeof vp.getCurrentImageIdIndex === "function" ? vp.getCurrentImageIdIndex() : null };
}

type Api = {
  item: (n: number) => void;
  look: (l: Partial<MaskLook>) => void;
  focus: (label: number | null) => void;
  point: (p: Vec3 | null) => void;
  warm: () => Promise<void>;
};
const api: Partial<Api> = {};

function Page() {
  const [item, setItem] = useState(0);
  const [look, setLook] = useState<MaskLook>(DEFAULT_LOOK);
  const [focus, setFocus] = useState<(PartPlace & { key: string; label: number }) | null>(null);
  const [point, setPoint] = useState<Vec3 | null>(null);
  useMaskKeys(setLook);
  const stacks = stacksOf(item);
  itemNow = item;
  api.item = setItem;
  api.look = (l) => setLook((x) => ({ ...x, ...l }));
  api.focus = (label) => {
    const p = PARTS.find((t) => t.label === label);
    setFocus(p ? { anchor: p.anchor, box: p.box, key: `${label}:${performance.now()}`, label: p.label } : null);
    if (p) setPoint(p.anchor);
  };
  api.point = setPoint;
  api.warm = () => {
    const ahead: Ahead[] = Array.from({ length: Math.max(0, Math.min(5, ITEMS - item - 1)) }, (_, i) => {
      const s = stacksOf(item + 1 + i);
      return MASKED ? { item: item + 1 + i, stacks: s, layers: { [s[0]]: REF, [s[1]]: REF } } : { item: item + 1 + i, stacks: s };
    });
    return warmer.warm(ahead, { modes: [VIEW], px: 384 }, { current: stacks, behind: item > 0 ? stacksOf(item - 1) : [] });
  };
  const tones = new Map<number, Tone>(focus ? [[focus.label, "focus"]] : []);
  useEffect(() => {
    (window as unknown as { maskPage: unknown }).maskPage = {
      ...api,
      fetches,
      events,
      slabCounters,
      stacksOf,
      parts: PARTS,
      truth: (stack: number, level: number, z: number) => Array.from(truth(stack, level, z)),
      labelPlane: (stack: number, level: number, z: number) => {
        const img = cs.cache.getImage(labelImageId(stack, REF, level, z));
        return img ? Array.from(img.voxelManager.getScalarData() as Uint16Array) : null;
      },
      /** A plane of the stack view's labelmap against the layer: how many voxels differ, or null when it is not made. */
      planeDiffers: (stack: number, level: number, z: number) => {
        const img = cs.cache.getImage(labelImageId(stack, REF, level, z));
        if (!img) return null;
        const got = img.voxelManager.getScalarData() as Uint16Array;
        const want = truth(stack, level, z);
        let n = got.length === want.length ? 0 : Infinity;
        for (let i = 0; i < want.length && n !== Infinity; i++) if (got[i] !== want[i]) n += 1;
        return n;
      },
      /** The three planes' labelmap volume against the layer, every plane: its size and how many voxels differ. */
      volumeDiffers: (stack: number, level: number, stride: number) => {
        const v = cs.cache.getVolume(labelVolumeId(stack, REF, { level, stride }));
        if (!v) return null;
        const d = (v.voxelManager as unknown as { getCompleteScalarDataArray: () => Uint16Array }).getCompleteScalarDataArray();
        const [nx, ny, nz] = v.dimensions;
        let n = 0;
        let labelled = 0;
        for (let k = 0; k < nz; k++) {
          const want = truth(stack, level, k * stride);
          for (let i = 0; i < nx * ny; i++) {
            if (d[k * nx * ny + i] !== want[i]) n += 1;
            if (want[i]) labelled += 1;
          }
        }
        return { dims: v.dimensions, differ: n, labelled };
      },
      labelVolume: (stack: number, level: number, stride: number) => {
        const v = cs.cache.getVolume(labelVolumeId(stack, REF, { level, stride }));
        if (!v) return null;
        const d = (v.voxelManager as unknown as { getCompleteScalarDataArray: () => Uint16Array }).getCompleteScalarDataArray();
        return { dims: v.dimensions, data: Array.from(d) };
      },
      view: (stack: number) => {
        const re = cs.getRenderingEngine("nils-viewer");
        const ids = viewerIds(stack);
        const one = (id: string) => {
          const vp = re?.getViewport(id) as (cs.StackViewport & cs.VolumeViewport) | undefined;
          if (!vp) return null;
          const cam = vp.getCamera();
          const canvas = vp.canvas;
          return {
            focalPoint: cam.focalPoint,
            parallelScale: cam.parallelScale,
            viewPlaneNormal: cam.viewPlaneNormal,
            index: typeof vp.getCurrentImageIdIndex === "function" ? vp.getCurrentImageIdIndex() : null,
            aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight),
          };
        };
        return { stack: one(ids.stack), axial: one(ids.planes.axial), coronal: one(ids.planes.coronal), sagittal: one(ids.planes.sagittal) };
      },
      /** The colour drawn at a point of the patient on a viewport's canvas: the point through the viewport's own mapping, the pixel read from its 2D canvas. */
      colourAt: (stack: number, where: "stack" | "axial" | "coronal" | "sagittal", p: Vec3) => {
        const re = cs.getRenderingEngine("nils-viewer");
        const ids = viewerIds(stack);
        const vp = re?.getViewport(where === "stack" ? ids.stack : ids.planes[where]);
        if (!vp) return null;
        const [x, y] = vp.worldToCanvas(p);
        const canvas = vp.canvas;
        const k = canvas.width / Math.max(1, canvas.clientWidth);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        const d = ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      forgetLayers,
      /** The look cornerstone put on a viewport's labelmap actor: the fill's opacity and colour at label 1, the outline. */
      style: (stack: number, where: "stack" | "axial" | "coronal" | "sagittal") => {
        const re = cs.getRenderingEngine("nils-viewer");
        const ids = viewerIds(stack);
        const vp = re?.getViewport(where === "stack" ? ids.stack : ids.planes[where]);
        if (!vp) return null;
        const a = vp.getActors().find((x) => typeof x.representationUID === "string" && x.representationUID.includes(`-${tools.Enums.SegmentationRepresentations.Labelmap}`));
        if (!a) return null;
        const p = (a.actor as unknown as { getProperty: () => Record<string, (...x: unknown[]) => unknown> }).getProperty();
        const c = p.getRGBTransferFunction(0) as { getColor: (x: number, out: number[]) => void } | undefined;
        const o = p.getScalarOpacity(0) as { getValue: (x: number) => number } | undefined;
        const rgb = [0, 0, 0];
        c?.getColor(1, rgb);
        // an outline is drawn where the property uses one and gives a label a thickness
        const thick = (p.getLabelOutlineThickness?.() as number[] | undefined) ?? [];
        return { fill: o?.getValue(1) ?? null, colour: rgb.map((x) => Math.round(x * 255)), outline: !!p.getUseLabelOutline?.() && thick.some((t) => t > 0), outlineOpacity: p.getLabelOutlineOpacity?.() ?? null, thickness: thick[0] ?? null };
      },
      /** The next item: the time until both its pictures and both its masks are on the screen, from the switch. */
      next: () =>
        new Promise((resolve, reject) => {
          const [a, b] = stacksOf(itemNow + 1);
          const start = events.length;
          const t0 = performance.now();
          api.item!(itemNow + 1);
          const got: Record<string, number> = {};
          const trace: string[] = [];
          const frames: number[] = [];
          const check = () => {
            frames.push(performance.now());
            const now = performance.now();
            for (const e of events.slice(start)) if (e.e.kind === "first-image" && got[`p${e.stack}`] === undefined) got[`p${e.stack}`] = e.at - t0;
            for (const e of events.slice(start)) if (e.e.kind === "mask" && got[`e${e.stack}`] === undefined) got[`e${e.stack}`] = e.at - t0;
            // a mask is on the screen at the first render of its view once its labels have their colours
            for (const st of [a, b])
              if (got[`c${st}`] === undefined && (!MASKED || maskDrawn(st))) {
                got[`c${st}`] = now - t0;
                const el = cs.getRenderingEngine("nils-viewer")?.getViewport(viewerIds(st).stack)?.element;
                el?.addEventListener(cs.Enums.Events.IMAGE_RENDERED, () => (got[`m${st}`] ??= performance.now() - t0), { once: true });
                if (!MASKED || !el) got[`m${st}`] = now - t0;
              }
            trace.push(`${Math.round(now - t0)}:${[a, b].map((st) => stageOf(st)).join("/")}`);
            if ([`p${a}`, `p${b}`, `m${a}`, `m${b}`].every((k) => got[k] !== undefined)) return resolve({ pictures: Math.max(got[`p${a}`], got[`p${b}`]), masks: Math.max(got[`m${a}`], got[`m${b}`]), got, trace, frame: frames.length > 2 ? frames.slice(1).map((t, i) => t - frames[i]).sort((x, y) => x - y)[Math.floor((frames.length - 1) / 2)] : 16.7 });
            if (now - t0 > 5000) return reject(new Error(`the next item was not drawn: ${JSON.stringify(got)}`));
            requestAnimationFrame(check);
          };
          check();
        }),
      /** Focus a part: the time and the frames until every view of both panels shows its plane, zoomed. */
      focusTimed: (label: number, where: ("stack" | "axial" | "coronal" | "sagittal")[]) =>
        new Promise((resolve, reject) => {
          const part = PARTS.find((t) => t.label === label)!;
          const t0 = performance.now();
          let frames = 0;
          const before: Record<string, ReturnType<typeof camOf>> = {};
          for (const st of stacksOf(itemNow)) for (const w of where) before[`${st}:${w}`] = camOf(st, w);
          api.focus!(label);
          const check = () => {
            // every view zoomed anew and on the anchor's plane along its own normal
            const along = { stack: 2, axial: 2, coronal: 1, sagittal: 0 } as const;
            const moved = Object.keys(before).every((k) => {
              const [st, w] = k.split(":") as [string, keyof typeof along];
              const c = camOf(Number(st), w);
              return !!c && c.scale !== before[k]?.scale && Math.abs(c.focal[along[w]] - part.anchor[along[w]]) < 1.1;
            });
            if (moved) return resolve({ ms: performance.now() - t0, frames });
            if (performance.now() - t0 > 3000) return reject(new Error("the views did not move"));
            frames += 1;
            requestAnimationFrame(check);
          };
          check();
        }),
    };
  });
  return (
    <div className="mask-check" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: 800, height: 420 }}>
      {stacks.map((stack, panel) => (
        <div key={panel} style={{ minWidth: 0, height: 400 }}>
          <Viewer
            key={stack}
            stack={stack}
            view={VIEW}
            bare
            mask={MASKED ? { layer: REF, look, tones, max: PARTS.length } : null}
            point={point}
            onPoint={setPoint}
            focus={focus}
            onEvent={(e) => events.push({ panel, stack, e, at: performance.now() })}
          />
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
