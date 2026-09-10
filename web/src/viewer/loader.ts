// SPDX-License-Identifier: AGPL-3.0-only
// The `nils:` image loader for cornerstone3D (Wave 5 section 8.2): an image
// id per plane, `nils:{stack}/{level}/{z}`; the planes come from a ring of
// slabs fetched ahead of the scroll and evicted behind, decoded in the
// worker pool, so the whole stack is never resident. The loader also counts
// the bytes moved and the decode time for the viewer's footer.

import * as cs from "@cornerstonejs/core";
import { DecodePool } from "./decode";
import { doors, levelShape, levelSpacing, type Manifest } from "./doors";
import { direction, plan, SLAB, slabOf, tileGrid } from "./ring";

export interface Counters {
  bytes: number;
  planesDecoded: number;
  decodeMs: number;
  fetches: number;
}

interface Stack {
  manifest: Manifest;
  /** Resident slabs per level: slab index to the planes' tiles. */
  slabs: Map<string, { tiles: Uint8Array[][]; bytes: number }>;
  inflight: Map<string, Promise<void>>;
  previous: number | null;
}

const stacks = new Map<number, Stack>();
let pool: DecodePool | null = null;
/** Planes decoded ahead of the scroll, by image id; a few in the direction of travel, handed over when asked. */
const ahead = new Map<string, Promise<cs.Types.IImage>>();
const AHEAD = 6;
export const counters: Counters = { bytes: 0, planesDecoded: 0, decodeMs: 0, fetches: 0 };

export function imageId(stack: number, level: number, z: number): string {
  return `nils:${stack}/${level}/${z}`;
}

export function parseImageId(id: string): { stack: number; level: number; z: number } {
  const m = /^nils:(\d+)\/(\d+)\/(\d+)$/.exec(id);
  if (!m) throw new Error(`not a nils image id: ${id}`);
  return { stack: Number(m[1]), level: Number(m[2]), z: Number(m[3]) };
}

/** Open a stack: its manifest once, its metadata provider, the pool. */
export async function open(stack: number): Promise<Manifest> {
  const have = stacks.get(stack);
  if (have) return have.manifest;
  const manifest = await doors.manifest(stack);
  stacks.set(stack, { manifest, slabs: new Map(), inflight: new Map(), previous: null });
  if (!pool) pool = new DecodePool();
  return manifest;
}

export function close(stack: number): void {
  const s = stacks.get(stack);
  if (!s) return;
  for (const level of Array.from({ length: s.manifest.levels }, (_, i) => i)) {
    const [nz] = levelShape(s.manifest, level);
    for (let z = 0; z < nz; z++) forget(imageId(stack, level, z));
  }
  stacks.delete(stack);
}

/** Drop a decoded plane from cornerstone's cache when it holds one; an id never loaded is nothing to drop. */
function forget(id: string): void {
  try {
    if (cs.cache.getImageLoadObject(id)) cs.cache.removeImageLoadObject(id, { force: true });
  } catch {
    // already gone
  }
}

function key(level: number, slab: number): string {
  return `${level}:${slab}`;
}

/** Fetch one slab's planes as tiles (one round trip), evict what the ring no longer wants. */
async function fetchSlab(stack: number, s: Stack, level: number, slab: number): Promise<void> {
  const k = key(level, slab);
  if (s.slabs.has(k)) return;
  const pending = s.inflight.get(k);
  if (pending) return pending;
  const [nz, ny, nx] = levelShape(s.manifest, level);
  const { ty, tx } = tileGrid(ny, nx, s.manifest.tile);
  const per = ty * tx;
  const z0 = slab * SLAB;
  const z1 = Math.min(nz, z0 + SLAB);
  const p = doors
    .slab(stack, level, z0, z1)
    .then((r) => {
      counters.bytes += r.bytes;
      counters.fetches += 1;
      const planes: Uint8Array[][] = [];
      for (let i = 0; i < z1 - z0; i++) planes.push(r.tiles.slice(i * per, (i + 1) * per));
      s.slabs.set(k, { tiles: planes, bytes: r.bytes });
    })
    .finally(() => s.inflight.delete(k));
  s.inflight.set(k, p);
  return p;
}

/** The ring around a plane: what to fetch now (awaited only for the plane's own slab), what to drop, at one level. */
function ring(stack: number, s: Stack, level: number, z: number): Promise<void> {
  const [nz] = levelShape(s.manifest, level);
  const dir = direction(s.previous, z);
  s.previous = z;
  const resident = new Set([...s.slabs.keys()].filter((k) => k.startsWith(`${level}:`)).map((k) => Number(k.split(":")[1])));
  const p = plan(z, nz, dir, resident);
  for (const e of p.evict) {
    s.slabs.delete(key(level, e));
    for (let zz = e * SLAB; zz < Math.min(nz, (e + 1) * SLAB); zz++) forget(imageId(stack, level, zz));
  }
  const own = fetchSlab(stack, s, level, slabOf(z));
  for (const f of p.fetch) if (f !== slabOf(z)) void fetchSlab(stack, s, level, f);
  return own;
}

/** One decoded plane as the image cornerstone expects; the next few in the direction of travel start decoding now. */
async function loadPlane(id: string): Promise<cs.Types.IImage> {
  const { stack, level, z } = parseImageId(id);
  const s = stacks.get(stack);
  if (!s) throw new Error(`stack ${stack} is not open`);
  const dir = direction(s.previous, z);
  const early = ahead.get(id);
  if (early) {
    ahead.delete(id);
    s.previous = z;
    decodeAhead(stack, s, level, z, dir);
    return early;
  }
  const image = await decodePlane(id, stack, s, level, z);
  decodeAhead(stack, s, level, z, dir);
  return image;
}

function decodeAhead(stack: number, s: Stack, level: number, z: number, dir: 1 | -1): void {
  const [nz] = levelShape(s.manifest, level);
  for (let k = 1; k <= AHEAD; k++) {
    const zz = z + k * dir;
    if (zz < 0 || zz >= nz) break;
    const id = imageId(stack, level, zz);
    if (ahead.has(id) || cs.cache.getImageLoadObject(id)) continue;
    const p = decodePlane(id, stack, s, level, zz, true);
    ahead.set(id, p);
    p.catch(() => ahead.delete(id));
  }
  // what was decoded ahead and passed by is let go
  for (const key of [...ahead.keys()]) {
    const { level: l, z: az } = parseImageId(key);
    if (l !== level || Math.abs(az - z) > AHEAD * 2) ahead.delete(key);
  }
}

async function decodePlane(id: string, stack: number, s: Stack, level: number, z: number, quiet = false): Promise<cs.Types.IImage> {
  const m = s.manifest;
  const [, ny, nx] = levelShape(m, level);
  const [, dy, dx] = levelSpacing(m, level);
  if (quiet) {
    // ahead of the scroll: the plane's slab is fetched without moving the ring's own sense of direction
    await fetchSlab(stack, s, level, slabOf(z));
  } else await ring(stack, s, level, z);
  const slab = s.slabs.get(key(level, slabOf(z)));
  if (!slab) throw new Error(`slab of plane ${z} was evicted before it was read`);
  const tiles = slab.tiles[z - slabOf(z) * SLAB];
  const { plane, ms } = await pool!.decode(m.codec, tiles, nx, ny, m.tile);
  counters.planesDecoded += 1;
  counters.decodeMs += ms;
  let min = 65535;
  let max = 0;
  for (let i = 0; i < plane.length; i += 97) {
    const v = plane[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const image = {
    imageId: id,
    minPixelValue: min,
    maxPixelValue: max,
    slope: 1,
    intercept: 0,
    windowCenter: m.window.center,
    windowWidth: m.window.width,
    getPixelData: () => plane,
    rows: ny,
    columns: nx,
    height: ny,
    width: nx,
    color: false,
    rgba: false,
    numberOfComponents: 1,
    columnPixelSpacing: dx,
    rowPixelSpacing: dy,
    sizeInBytes: plane.byteLength,
    invert: false,
    dataType: "Uint16Array",
    voxelManager: cs.utilities.VoxelManager.createImageVoxelManager({ width: nx, height: ny, scalarData: plane, numberOfComponents: 1 }),
  } as unknown as cs.Types.IImage;
  return image;
}

let registered = false;

/** Register the loader and the metadata provider once. */
export function register(): void {
  if (registered) return;
  registered = true;
  cs.imageLoader.registerImageLoader("nils", (id: string) => ({ promise: loadPlane(id) }) as cs.Types.IImageLoadObject);
  cs.metaData.addProvider((type: string, id: string) => {
    if (!id.startsWith("nils:")) return undefined;
    const { stack, level, z } = parseImageId(id);
    const s = stacks.get(stack);
    if (!s) return undefined;
    const m = s.manifest;
    const [, ny, nx] = levelShape(m, level);
    const [dz, dy, dx] = levelSpacing(m, level);
    switch (type) {
      case "imagePixelModule":
        return { bitsAllocated: 16, bitsStored: 16, highBit: 15, samplesPerPixel: 1, photometricInterpretation: "MONOCHROME2", pixelRepresentation: m.dtype === "int16" ? 1 : 0 };
      case "imagePlaneModule":
        return { imageOrientationPatient: [1, 0, 0, 0, 1, 0], imagePositionPatient: [0, 0, z * dz], rowCosines: [1, 0, 0], columnCosines: [0, 1, 0], rowPixelSpacing: dy, columnPixelSpacing: dx, pixelSpacing: [dy, dx], sliceThickness: dz, sliceLocation: z * dz, frameOfReferenceUID: `nils-${stack}`, rows: ny, columns: nx };
      case "generalSeriesModule":
        return { modality: "OT" };
      case "voiLutModule":
        return { windowCenter: [m.window.center], windowWidth: [m.window.width] };
      case "modalityLutModule":
        return { rescaleSlope: 1, rescaleIntercept: 0 };
      default:
        return undefined;
    }
  }, 10000);
  // the cache holds a few slabs' worth of decoded planes, never the stack; the ring holds the encoded ones
  cs.cache.setMaxCacheSize(256 * 1024 * 1024);
}
