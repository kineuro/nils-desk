// SPDX-License-Identifier: AGPL-3.0-only
// A result's mask drawn over a scan as a cornerstone3D labelmap (record 55
// H3, job type 3, build spec section 4, slice D1). The layer (layer.ts) is
// a label pyramid of the scan's own shape, so nothing is resampled here:
//
// - on the stack view, each plane's labels are a labelmap image beside the
//   plane's picture, at the level the picture is read at, made from the
//   layer's slab when the plane is (loader.ts) and let go with it;
// - on the three planes, the labels are a labelmap volume on the grid the
//   picture's volume is on (volume.ts), at the level and stride the planes
//   end on, filled from the layer's slabs from the current plane outwards,
//   and filled ahead for the next item as its picture is (`prefillLabels`).
//
// Both read the slabs through the page's slab cache (slabs.ts), which the
// reader warms with the pictures (campaigns/ahead.ts). Showing, hiding and
// restyling a mask reads nothing again: a labelmap's look is cornerstone's
// style and visibility, set on what is already in memory.

import * as cs from "@cornerstonejs/core";
import * as tools from "@cornerstonejs/tools";
import type { DecodePool } from "./decode";
import { levelShape, levelSpacing, type Manifest } from "./doors";
import { geometry, planePosition, volumeGrid } from "./geometry";
import { layerKey, type LayerManifest, type LayerRef } from "./layer";
import { colourTable, labelmapStyle, themePalette, type MaskLook, type Tone } from "./maskLook";
import { fillOrder, SLAB, type VolumePlan } from "./ring";
import { layerSlab } from "./slabs";

const LABELMAP = tools.Enums.SegmentationRepresentations.Labelmap;

let schemed = false;
/** Labels are made in memory and cached; cornerstone asking for one by id gets it from the cache, or hears it is not made yet. */
function scheme(): void {
  if (schemed) return;
  schemed = true;
  cs.imageLoader.registerImageLoader("nilsmask", (id: string) => {
    const image = cs.cache.getImage(id);
    return { promise: image ? Promise.resolve(image) : Promise.reject(new Error(`${id} is not made yet`)) } as cs.Types.IImageLoadObject;
  });
}

/** A layer's plane at a level, as the stack view's labelmap image is named. */
export function labelImageId(stack: number, ref: LayerRef, level: number, z: number): string {
  return `nilsmask:${ref.derivative}/${encodeURIComponent(ref.set)}/${stack}/${level}/${z}`;
}

/** A layer's volume at a plan's level and stride, as the three planes' labelmap is named. */
export function labelVolumeId(stack: number, ref: LayerRef, plan: Pick<VolumePlan, "level" | "stride">): string {
  return `nilsmask:${ref.derivative}/${encodeURIComponent(ref.set)}/${stack}/${plan.level}/${plan.stride}/volume`;
}

/** The segmentation a viewer's stack view or its three planes draw a layer by. */
export function segmentationIdOf(stack: number, ref: LayerRef, where: "stack" | "planes", level: number, stride = 1): string {
  return `nils-mask:${layerKey(stack, ref)}:${where}:${level}:${stride}`;
}

// ---------------------------------------------------------------- the labels into a volume

/**
 * A plane of labels written into a wider one at a whole shift: a sheared
 * stack's planes each sit shifted in the volume's grid (geometry.ts,
 * `volumeGrid`), and a label is never blended with its neighbour as a
 * picture's grey is, so the shift is rounded to the nearest voxel.
 */
export function placeLabels(src: ArrayLike<number>, nx: number, ny: number, dst: Uint16Array, at: number, NX: number, NY: number, ox: number, oy: number): void {
  const sx = Math.round(ox);
  const sy = Math.round(oy);
  dst.fill(0, at, at + NX * NY);
  for (let j = 0; j < ny; j++) {
    const J = j + sy;
    if (J < 0 || J >= NY) continue;
    for (let i = 0; i < nx; i++) {
      const I = i + sx;
      if (I < 0 || I >= NX) continue;
      dst[at + J * NX + I] = src[j * nx + i];
    }
  }
}

/** Where the labels come from: a slab of the layer at the plan's level, and the decoder of one plane's tiles. */
export interface LabelSource {
  read: (z0: number, z1: number) => Promise<{ planes: Uint8Array[][] }>;
  decode: (tiles: Uint8Array[], nx: number, ny: number) => Promise<Uint16Array>;
}

/**
 * Fill a labelmap volume's voxels from a layer: every `stride`-th plane of
 * the plan's level, the slab of plane `at` first and outwards from it, as
 * the picture's volume fills, so the labels land voxel for voxel on the
 * picture's grid. `landed` is told the volume's planes each slab wrote.
 */
export async function fillLabels(
  dst: Uint16Array,
  scan: Manifest,
  plan: Pick<VolumePlan, "level" | "stride" | "dims">,
  src: LabelSource,
  o: { at?: number; lanes?: number; closed?: () => boolean; landed?: (planes: number[]) => void } = {},
): Promise<number> {
  const { level, stride } = plan;
  const [nx, ny] = plan.dims;
  const shape = levelShape(scan, level);
  const [nz, py, px] = shape;
  const g = geometry(scan);
  const grid = volumeGrid(g, shape, levelSpacing(scan, 0), level);
  const order = fillOrder(Math.ceil(nz / SLAB), Math.floor(((o.at ?? Math.floor(nz / 2 / stride)) * stride) / SLAB));
  let written = 0;
  const one = async (s: number) => {
    const z0 = s * SLAB;
    const z1 = Math.min(nz, z0 + SLAB);
    const slab = await src.read(z0, z1);
    const ks: number[] = [];
    await Promise.all(
      Array.from({ length: z1 - z0 }, (_, i) => z0 + i)
        .filter((z) => z % stride === 0)
        .map(async (z) => {
          const plane = await src.decode(slab.planes[z - z0], px, py);
          if (o.closed?.()) return;
          const k = z / stride;
          if (g.shear) {
            const [ox, oy] = grid.shift(z);
            placeLabels(plane, px, py, dst, k * nx * ny, nx, ny, ox, oy);
          } else dst.set(plane.subarray(0, nx * ny), k * nx * ny);
          ks.push(k);
          written += 1;
        }),
    );
    if (ks.length && !o.closed?.()) o.landed?.(ks.sort((a, b) => a - b));
  };
  let next = 0;
  const lane = async () => {
    while (!o.closed?.() && next < order.length) await one(order[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(o.lanes ?? 2, order.length) }, lane));
  return written;
}

/** A labelmap volume being filled: its id in cornerstone's cache, how far it is, and the way to stop it. */
export interface LabelFilling {
  volumeId: string;
  plan: VolumePlan;
  filled: number;
  done: boolean;
  ready: Promise<void>;
  /** Told the planes of the volume that landed, for the viewports to draw them. */
  tell: Set<(planes: number[]) => void>;
  close: () => void;
}

const fillings = new Map<string, LabelFilling>();

/**
 * The labelmap volume of a layer at a plan, made once and filled from the
 * layer's slabs: one already made (filled ahead for the next item, or by a
 * viewer before) is handed over as it is.
 */
export function labelVolume(stack: number, ref: LayerRef, scan: Manifest, layer: Pick<LayerManifest, "codec" | "tile">, plan: VolumePlan, pool: DecodePool, o: { at?: number; later?: boolean } = {}): LabelFilling {
  scheme();
  const volumeId = labelVolumeId(stack, ref, plan);
  const have = fillings.get(volumeId);
  if (have && cs.cache.getVolume(volumeId)) return have;
  // a volume left without its filling (one that failed) is made again, so the voxels written are the volume's own
  if (cs.cache.getVolume(volumeId)) dropLabels(volumeId);
  const [nx, ny, depth] = plan.dims;
  const g = geometry(scan);
  const shape = levelShape(scan, plan.level);
  const grid = volumeGrid(g, shape, levelSpacing(scan, 0), plan.level);
  const [dx, dy, dz] = grid.spacing;
  const bytes = nx * ny * depth * 2;
  if (cs.cache.getBytesAvailable() < bytes + 16 * 1024 * 1024) cs.cache.setMaxCacheSize(cs.cache.getCacheSize() + bytes + 64 * 1024 * 1024);
  const data = new Uint16Array(nx * ny * depth);
  cs.volumeLoader.createLocalVolume(volumeId, {
    scalarData: data,
    dimensions: [nx, ny, depth],
    spacing: [dx, dy, dz * plan.stride],
    origin: grid.origin,
    direction: [...grid.direction[0], ...grid.direction[1], ...grid.direction[2]] as cs.Types.Mat3,
    metadata: { FrameOfReferenceUID: `nils-${stack}`, Modality: "SEG", BitsAllocated: 16, BitsStored: 16, HighBit: 15, PixelRepresentation: 0, SamplesPerPixel: 1, PhotometricInterpretation: "MONOCHROME2" } as unknown as cs.Types.Metadata,
  });
  // the volume's slices are views of `data` (createLocalVolume), so the labels are written there
  let closed = false;
  const tell = new Set<(planes: number[]) => void>();
  const f: LabelFilling = { volumeId, plan, filled: 0, done: false, ready: Promise.resolve(), tell, close: () => (closed = true) };
  f.ready = fillLabels(data, scan, plan, { read: (z0, z1) => layerSlab(stack, ref, plan.level, z0, z1, { warm: o.later }), decode: (tiles, px, py) => pool.decode(layer.codec, tiles, px, py, layer.tile, o.later).then((r) => r.plane) }, {
    at: o.at,
    closed: () => closed,
    landed: (ks) => {
      f.filled += ks.length;
      tell.forEach((t) => t(ks));
    },
  }).then(() => {
    if (!closed) f.done = true;
  });
  f.ready.catch(() => {
    if (fillings.get(volumeId) === f) fillings.delete(volumeId);
  });
  fillings.set(volumeId, f);
  return f;
}

/** Fill the next item's labels ahead, for later, as its picture's volume is (volume.ts, `prefill`). */
export function prefillLabels(stack: number, ref: LayerRef, scan: Manifest, layer: Pick<LayerManifest, "codec" | "tile">, plan: VolumePlan, pool: DecodePool): LabelFilling {
  return labelVolume(stack, ref, scan, layer, plan, pool, { later: true });
}

/** Let go of a layer's labelmap volume. */
export function dropLabels(volumeId: string): void {
  const f = fillings.get(volumeId);
  f?.close();
  fillings.delete(volumeId);
  const v = cs.cache.getVolume(volumeId);
  if (!v) return;
  const ids = [...v.imageIds];
  try {
    cs.cache.removeVolumeLoadObject(volumeId);
  } catch {
    // already gone
  }
  for (const id of ids) {
    try {
      if (cs.cache.getImage(id)) cs.cache.removeImageLoadObject(id, { force: true });
    } catch {
      // already gone
    }
  }
}

/** Let go of the labelmap volumes filled ahead that are not of these stacks (those on the screen and the next item's). */
export function dropLabelPrefills(keep: ReadonlySet<number>): void {
  for (const id of [...fillings.keys()]) {
    const stack = Number(/^nilsmask:\d+\/[^/]*\/(\d+)\//u.exec(id)?.[1]);
    if (keep.has(stack)) continue;
    dropLabels(id);
  }
}

// ---------------------------------------------------------------- a stack plane's labels

/**
 * One plane of a layer as the labelmap image the stack view draws beside
 * the plane's picture: decoded from the layer's slab and cached under its
 * id, on the plane's place in the patient, referencing the picture.
 */
export function cacheLabelPlane(id: string, plane: Uint16Array, scan: Manifest, stack: number, level: number, z: number, pictureId: string): void {
  scheme();
  if (cs.cache.getImage(id)) return;
  const [, ny, nx] = levelShape(scan, level);
  const [, dy, dx] = levelSpacing(scan, level);
  const g = geometry(scan);
  cs.imageLoader.createAndCacheLocalImage(id, {
    scalarData: plane.length === nx * ny ? plane : plane.slice(0, nx * ny),
    dimensions: [nx, ny],
    spacing: [dx, dy],
    origin: planePosition(g, scan.spacing, level, z),
    direction: [...g.row, ...g.col, ...g.normal] as unknown as cs.Types.Mat3,
    frameOfReferenceUID: `nils-${stack}`,
    referencedImageId: pictureId,
  });
}

// ---------------------------------------------------------------- the segmentations

/** What a viewer keeps of a mask it draws: its segmentation, the viewports it is on, and its colour table as drawn. */
export interface Drawn {
  segmentationId: string;
  viewports: string[];
  lut: number;
  table: [number, number, number, number][];
  /** A volume's labels (the three planes), not a stack's images. */
  volume?: boolean;
  /** The look and the part in focus it is drawn with now. */
  look: MaskLook;
  focus: number | null;
  /** Its actors are on every viewport (and a volume's were told every plane once). */
  settled?: boolean;
}

// colour tables let go by a viewer, taken again by the next, so a reader's
// hours of items do not pile tables up
const freeLuts: number[] = [];

/**
 * Add a layer's segmentation (a stack's images, or a volume) and draw it on
 * the viewports in its own colour table and its look, set before it is
 * drawn: cornerstone renders the viewports it is asked for one ask a frame,
 * so each ask saved draws the next panel's mask a frame sooner.
 */
export function drawLabels(segmentationId: string, data: { imageIds: string[]; referencedImageIds: string[] } | { volumeId: string }, viewports: string[], table: [number, number, number, number][], look: MaskLook, focus: number | null): Drawn {
  const lut = tools.segmentation.config.color.addColorLUT(table as unknown as cs.Types.ColorLUT, freeLuts.pop());
  if (!tools.segmentation.state.getSegmentation(segmentationId)) {
    tools.segmentation.addSegmentations([{ segmentationId, representation: { type: LABELMAP, data: data as never } }], true);
  }
  if (focus !== null && focus > 0) tools.segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, focus);
  tools.segmentation.segmentationStyle.setStyle({ type: LABELMAP, segmentationId }, styleOf(look, focus) as never);
  for (const v of viewports) tools.segmentation.addLabelmapRepresentationToViewport(v, [{ segmentationId, config: { colorLUTOrIndex: lut } }]);
  const d: Drawn = { segmentationId, viewports, lut, table: table.map((c) => [...c] as [number, number, number, number]), volume: "volumeId" in data, look, focus };
  settle(d);
  return d;
}

/** A look as cornerstone's style, the part in focus outlined thicker. */
function styleOf(look: MaskLook, focus: number | null): Record<string, number | boolean> {
  return { ...labelmapStyle(look), activeSegmentOutlineWidthDelta: focus !== null && focus > 0 ? 2 : 0 };
}

/** Take a layer's segmentation off its viewports and forget it; its colour table is kept for the next. */
export function undrawLabels(d: Drawn): void {
  for (const v of d.viewports) {
    try {
      tools.segmentation.removeSegmentationRepresentations(v, { segmentationId: d.segmentationId }, true);
    } catch {
      // the viewport is already gone
    }
  }
  try {
    tools.segmentation.removeSegmentation(d.segmentationId);
  } catch {
    // already gone
  }
  freeLuts.push(d.lut);
}

/**
 * The look on a drawn mask: shown or hidden, fill, outline and opacity
 * (its style), the colours of the parts whose tone changed, and the part
 * in focus, the active segment, outlined thicker. Nothing is read again.
 */
export function lookLabels(d: Drawn, look: MaskLook, table: [number, number, number, number][], focus: number | null): void {
  const changed: number[] = [];
  for (let i = 1; i < table.length; i++) {
    const a = table[i];
    const b = d.table[i];
    if (!b || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) changed.push(i);
  }
  const v0 = d.viewports[0];
  for (const i of changed) {
    // the colour held in the segmentation's own table, changed in place (cornerstone's setSegmentIndexColor)
    const held = v0 ? tools.segmentation.config.color.getSegmentIndexColor(v0, d.segmentationId, i) : null;
    if (held) for (let c = 0; c < 4; c++) held[c] = table[i][c];
    d.table[i] = [...table[i]] as [number, number, number, number];
  }
  if (focus !== null && focus > 0) tools.segmentation.segmentIndex.setActiveSegmentIndex(d.segmentationId, focus);
  d.look = look;
  d.focus = focus;
  tools.segmentation.config.style.setStyle({ type: LABELMAP, segmentationId: d.segmentationId }, styleOf(look, focus) as never);
  if (!changed.length) return;
  for (const v of d.viewports) {
    try {
      tools.segmentation.triggerSegmentationEvents.triggerSegmentationRepresentationModified(v, d.segmentationId, LABELMAP);
    } catch {
      // the viewport is being built or taken down
    }
  }
}

/** Tell the viewports that labels landed: the volume's planes that changed, or the stack's current one. */
export function labelsLanded(d: Drawn, planes?: number[]): void {
  tools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(d.segmentationId, planes);
}

/**
 * Cornerstone adds a labelmap's actor a few frames after the render that
 * would colour it, and colours it on the next render it is asked for (one
 * ask a frame, so the other panels wait behind it); meanwhile the actor
 * would draw its labels opaque black. So for a while after a mask is drawn
 * its actors are looked for every few milliseconds, and one that has no colours yet is
 * given the mask's colours and look at once (as cornerstone gives them,
 * which its next render puts on again) and drawn. Once every actor of a
 * volume is there, every plane is told again, since a texture made after
 * its labels landed holds none.
 */
function settle(d: Drawn): void {
  if (typeof window === "undefined") return;
  // asked every few milliseconds rather than every frame: the actor is dressed the moment it is there, and drawn on the next frame
  const until = performance.now() + 2000;
  const look = () => {
    let waiting = false;
    let none = false;
    for (const v of d.viewports) {
      const vp = cs.getEnabledElementByViewportId(v)?.viewport;
      if (!vp) continue;
      const mine = actorsOf(vp, d.segmentationId);
      if (mine.length === 0) {
        none = true;
        waiting = true;
        continue;
      }
      let dressed = false;
      for (const a of mine) if (!colours(a)) dressed = dress(a, d) || dressed;
      if (dressed) vp.render();
    }
    if (!none && !d.settled) {
      d.settled = true;
      if (d.volume) tools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(d.segmentationId);
    }
    if (waiting && performance.now() < until) setTimeout(look, 4);
  };
  setTimeout(look, 0);
}

type Actor = { actor: unknown; representationUID?: string };
interface Property {
  getRGBTransferFunction?: (i: number) => unknown;
  setRGBTransferFunction?: (i: number, f: unknown) => void;
  getScalarOpacity?: (i: number) => { removeAllPoints: () => void; addPoint: (x: number, y: number) => void; setClamping?: (c: boolean) => void } | undefined;
  setScalarOpacity?: (i: number, f: unknown) => void;
  setInterpolationTypeToNearest?: () => void;
  setUseLookupTableScalarRange?: (b: boolean) => void;
  setUseLabelOutline?: (b: boolean) => void;
  setLabelOutlineOpacity?: (o: number) => void;
  setLabelOutlineThickness?: (t: number[]) => void;
  modified?: () => void;
}
const propertyOf = (a: Actor) => (a.actor as { getProperty?: () => Property }).getProperty?.();

/** A viewport's actors of a mask. */
function actorsOf(vp: { getActors: () => Actor[] }, segmentationId: string): Actor[] {
  const prefix = `${segmentationId}-${LABELMAP}`;
  return vp.getActors().filter((a) => typeof a.representationUID === "string" && a.representationUID.startsWith(prefix));
}

const colours = (a: Actor) => !!propertyOf(a)?.getRGBTransferFunction?.(0);

/** An actor given the mask's colours and look, as cornerstone's labelmap style gives them; false where it cannot be. */
function dress(a: Actor, d: Drawn): boolean {
  const p = propertyOf(a);
  const ofun = p?.getScalarOpacity?.(0);
  if (!p || !ofun || !p.setRGBTransferFunction) return false;
  const style = styleOf(d.look, d.focus);
  const cfun = cs.utilities.createLinearRGBTransferFunction({ lower: 0, upper: 1 }) as unknown as { removeAllPoints: () => void; addRGBPoint: (x: number, r: number, g: number, b: number) => void };
  cfun.removeAllPoints();
  ofun.removeAllPoints();
  cfun.addRGBPoint(0, 0, 0, 0);
  ofun.addPoint(0, 0);
  const fill = style.renderFill as boolean;
  const alpha = style.fillAlpha as number;
  for (let v = 1; v < d.table.length; v++) {
    const [r, g, b, o] = d.table[v];
    cfun.addRGBPoint(v, r / 255, g / 255, b / 255);
    ofun.addPoint(v, fill ? (o / 255) * alpha : 0.01);
  }
  ofun.setClamping?.(false);
  p.setRGBTransferFunction(0, cfun);
  p.setInterpolationTypeToNearest?.();
  p.setUseLookupTableScalarRange?.(true);
  const outline = style.renderOutline as boolean;
  p.setUseLabelOutline?.(outline);
  p.setLabelOutlineOpacity?.(1);
  p.setLabelOutlineThickness?.(Array.from({ length: d.table.length - 1 }, (_, i) => (outline ? (i + 1 === d.focus ? 3 : 1) : 0)));
  p.modified?.();
  return true;
}

/** The labels a table covers at the least: cornerstone fills a shorter table with colours of its own. */
export const TABLE_MIN = 256;

/** The colour table of a layer: the parts' tones on the theme's colours, for every label up to `max`. */
export function tableOf(layer: Pick<LayerManifest, "kind">, max: number, labels: readonly number[] | undefined, tones: ReadonlyMap<number, Tone> | undefined): [number, number, number, number][] {
  return colourTable({ kind: layer.kind, max: Math.max(TABLE_MIN - 1, max, ...(labels ?? [])), labels, tones, palette: themePalette() });
}
