// SPDX-License-Identifier: AGPL-3.0-only
// The slab ring (Wave 5 section 8.2, from the viewer study): a ring of
// slabs around the current plane, fetched ahead in the scroll direction,
// evicted behind, so the whole stack is never resident; the level whose
// plane fits the viewport; the numbers the footer reads off; and for the
// three planes (record 45 S2) the level the volume is held at and the order
// its slabs are fetched in. Pure, so the gate can hold them.

import { levelShape, levelSpacing, type Manifest } from "./doors";
import { geometry, volumeGrid } from "./geometry";

export const SLAB = 32;

/** The planes' budget (record 45 S2, ruled 2026-09-24): 256 MB of texture, level 1 for a 220 x 1024 x 1024 stack and level 2 for the 2500-plane one, as study A3's examples have it. */
export const VOLUME_BUDGET = 256 * 1024 * 1024;

/** The slab a plane sits in. */
export function slabOf(z: number, slab = SLAB): number {
  return Math.floor(z / slab);
}

/** The slabs a ring wants around a plane: the current, `ahead` in the direction of travel, `behind` the other way, all inside the stack. */
export function ringSlabs(z: number, nz: number, direction: 1 | -1, ahead = 2, behind = 1, slab = SLAB): number[] {
  const last = slabOf(nz - 1, slab);
  const at = slabOf(z, slab);
  const out: number[] = [at];
  for (let i = 1; i <= ahead; i++) out.push(at + i * direction);
  for (let i = 1; i <= behind; i++) out.push(at - i * direction);
  return out.filter((s, i, a) => s >= 0 && s <= last && a.indexOf(s) === i);
}

/** The plan of one step: what to fetch (missing slabs the ring wants, nearest first) and what to evict (resident slabs the ring does not want, farthest first, down to the budget). */
export function plan(z: number, nz: number, direction: 1 | -1, resident: Set<number>, budget = 6, slab = SLAB): { fetch: number[]; evict: number[] } {
  const wanted = ringSlabs(z, nz, direction, 2, 1, slab);
  const at = slabOf(z, slab);
  const fetch = wanted.filter((s) => !resident.has(s)).sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
  const keep = new Set(wanted);
  const others = [...resident].filter((s) => !keep.has(s)).sort((a, b) => Math.abs(b - at) - Math.abs(a - at));
  const over = resident.size + fetch.length - budget;
  const evict = over > 0 ? others.slice(0, over) : [];
  return { fetch, evict };
}

/** The direction of travel from the last two planes shown. */
export function direction(previous: number | null, z: number): 1 | -1 {
  return previous !== null && z < previous ? -1 : 1;
}

/** The level whose plane fits the viewport's pixels: the coarsest level that still has at least as many pixels across as the viewport, promoted on zoom. */
export function levelFor(viewportPx: number, planePx: number, levels: number, zoom = 1): number {
  const need = viewportPx * zoom;
  for (let level = levels - 1; level >= 0; level--) {
    if (planePx / 2 ** level >= need) return level;
  }
  return 0;
}

/** Frames per second over the last second of a series of frame stamps. */
export function fps(stamps: number[], now: number): number {
  const recent = stamps.filter((t) => now - t <= 1000);
  return recent.length;
}

/** The plane's tile grid at a level. */
export function tileGrid(ny: number, nx: number, tile: number): { ty: number; tx: number } {
  return { ty: Math.ceil(ny / tile), tx: Math.ceil(nx / tile) };
}

/** Where decoded tiles land in a plane: tile i of a ty by tx grid, row major. */
export function placeTile(plane: Uint16Array, nx: number, ny: number, tile: number, i: number, pixels: Uint16Array, tw: number, th: number): void {
  const { tx } = tileGrid(ny, nx, tile);
  const ty0 = Math.floor(i / tx) * tile;
  const tx0 = (i % tx) * tile;
  const w = Math.min(tw, nx - tx0);
  const h = Math.min(th, ny - ty0);
  for (let y = 0; y < h; y++) plane.set(pixels.subarray(y * tw, y * tw + w), (ty0 + y) * nx + tx0);
}

export interface VolumePlan {
  level: number;
  /** Every stride-th plane of the level, when the stack is deeper than the card's 3D texture. */
  stride: number;
  /** [nx, ny, nz] of the volume as it is held. */
  dims: [number, number, number];
  bytes: number;
}

/** The level rule: the finest level whose planes fit the card and whose volume fits the budget; null when none does. */
export function volumeLevel(m: Manifest, budget = VOLUME_BUDGET, max3d = 2048): VolumePlan | null {
  const g = geometry(m);
  for (let level = 0; level < m.levels; level++) {
    const shape = levelShape(m, level);
    const nz = shape[0];
    // a sheared stack's grid is wider by its planes' drift (geometry.ts, volumeGrid)
    const [nx, ny] = volumeGrid(g, shape, levelSpacing(m, 0), level).size;
    if (ny > max3d || nx > max3d) continue;
    const stride = Math.max(1, Math.ceil(nz / max3d));
    const depth = Math.ceil(nz / stride);
    const bytes = depth * ny * nx * 2;
    if (bytes <= budget) return { level, stride, dims: [nx, ny, depth], bytes };
  }
  return null;
}

/** The slabs in the order they are fetched: the one holding the current plane, then outwards one on each side in turn. */
export function fillOrder(slabs: number, at: number): number[] {
  const out: number[] = [];
  const c = Math.min(Math.max(0, at), slabs - 1);
  for (let d = 0; out.length < slabs; d++) {
    if (d === 0) out.push(c);
    else {
      if (c + d < slabs) out.push(c + d);
      if (c - d >= 0) out.push(c - d);
    }
  }
  return out;
}
