// SPDX-License-Identifier: AGPL-3.0-only
// A stack's reference tissue (the post-contrast study, anchored reading).
// Each viewer opens at a window from its own stack's percentiles, which
// normalises enhancement away: a pre and a post of one session look alike.
// To compare them the pages scale every stack by one reference intensity of
// its own and show them under one window. With no segmentation at hand the
// reference is the median of the head's central part: the voxels above an
// Otsu threshold (the head, not the air) inside the middle half of the
// head's extent along each axis. That is mostly brain parenchyma, so the
// fat of the scalp, the vessels and the dura, where contrast shows, move it
// little.
//
// The sample is the pyramid's coarsest level (a few kilobytes a plane),
// fetched through the slab door and decoded by the viewer's worker pool, so
// it works on every pyramid already built and costs one round trip per 32
// planes, asked all at once and kept with the page's slabs (slabs.ts). A
// reader warming the items ahead reads theirs for later. The same sample gives the head's extent in the patient, which
// the region jumps (campaigns/regions.ts) are estimated from.

import { levelShape, levelSpacing, type Manifest } from "./doors";
import { slab as readSlab } from "./slabs";
import { geometry, planePosition, type Vec3 } from "./geometry";

/** A stack sampled at one level, in the modality's values, [z][y][x] in one array. */
export interface Sample {
  values: Float32Array;
  /** [nz, ny, nx] of the sample. */
  shape: [number, number, number];
  level: number;
}

/** The head's extent in the patient (DICOM's LPS, mm), the ends taken at the 1st and 99th percentiles of the head's voxels. */
export interface Extent {
  lo: Vec3;
  hi: Vec3;
}

export interface Reference {
  /** The head's central median, in the modality's values; null where no head was found. */
  value: number | null;
  /** The Otsu threshold between air and the head. */
  threshold: number;
  /** The share of the sample above it. */
  foreground: number;
  /** Where the head lies, in the patient; null where the manifest names no place or no head was found. */
  extent: Extent | null;
}

/** The Otsu threshold of a sample: the cut that best splits it in two, over 256 bins up to its 99.5th percentile. */
export function otsu(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const lo = sorted[0];
  const hi = sorted[Math.min(n - 1, Math.floor((n - 1) * 0.995))];
  if (!(hi > lo)) return lo;
  const bins = 256;
  const hist = new Float64Array(bins);
  const width = (hi - lo) / bins;
  for (let i = 0; i < n; i++) {
    const v = sorted[i];
    const b = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)));
    hist[b] += 1;
  }
  let sum = 0;
  for (let b = 0; b < bins; b++) sum += b * hist[b];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let cut = 0;
  for (let b = 0; b < bins; b++) {
    wB += hist[b];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += b * hist[b];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      cut = b;
    }
  }
  return lo + (cut + 1) * width;
}

function median(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The index range along one axis where the head is: the planes whose count of head voxels is at least 2 % of the fullest plane's. */
function span(counts: number[]): [number, number] | null {
  const most = Math.max(0, ...counts);
  if (most === 0) return null;
  const floor = most * 0.02;
  const first = counts.findIndex((c) => c >= floor);
  let last = counts.length - 1;
  while (last > first && counts[last] < floor) last--;
  return [first, last];
}

/**
 * The reference of a sample: the Otsu cut, the head's box by the counts of
 * head voxels per plane along each axis, and the median of the head's
 * voxels in the middle half of that box. Pure, so the gate holds it.
 */
export function referenceOf(s: Sample): { value: number | null; threshold: number; foreground: number; box: { z: [number, number]; y: [number, number]; x: [number, number] } | null } {
  const [nz, ny, nx] = s.shape;
  const t = otsu(s.values);
  const cz = new Array<number>(nz).fill(0);
  const cy = new Array<number>(ny).fill(0);
  const cx = new Array<number>(nx).fill(0);
  let inHead = 0;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        if (s.values[(z * ny + y) * nx + x] > t) {
          cz[z]++;
          cy[y]++;
          cx[x]++;
          inHead++;
        }
      }
  const foreground = s.values.length ? inHead / s.values.length : 0;
  const [bz, by, bx] = [span(cz), span(cy), span(cx)];
  if (!bz || !by || !bx) return { value: null, threshold: t, foreground, box: null };
  const middle = ([a, b]: [number, number]): [number, number] => {
    const q = (b - a) / 4;
    return [Math.floor(a + q), Math.ceil(b - q)];
  };
  const [mz, my, mx] = [middle(bz), middle(by), middle(bx)];
  const inner: number[] = [];
  for (let z = mz[0]; z <= mz[1]; z++)
    for (let y = my[0]; y <= my[1]; y++)
      for (let x = mx[0]; x <= mx[1]; x++) {
        const v = s.values[(z * ny + y) * nx + x];
        if (v > t) inner.push(v);
      }
  return { value: median(inner), threshold: t, foreground, box: { z: bz, y: by, x: bx } };
}

/** The head's extent in the patient from a sample: each head voxel's place, the ends at the 1st and 99th percentiles per axis. */
export function extentOf(s: Sample, m: Manifest, threshold: number): Extent | null {
  const g = geometry(m);
  if (!g.known || !Array.isArray(m.origin)) return null;
  const [nz, ny, nx] = s.shape;
  const [, dy, dx] = levelSpacing(m, s.level);
  const axes: number[][] = [[], [], []];
  // at most about 20 000 voxels are placed: enough for percentiles, cheap on a big sample
  let heads = 0;
  for (let i = 0; i < s.values.length; i++) if (s.values[i] > threshold) heads++;
  if (heads === 0) return null;
  const every = Math.max(1, Math.floor(heads / 20000));
  let k = 0;
  for (let z = 0; z < nz; z++) {
    const p = planePosition(g, m.spacing, s.level, z);
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        if (s.values[(z * ny + y) * nx + x] <= threshold) continue;
        if (k++ % every) continue;
        for (let a = 0; a < 3; a++) axes[a].push(p[a] + g.row[a] * dx * x + g.col[a] * dy * y);
      }
  }
  const at = (v: number[], q: number) => {
    const s2 = [...v].sort((a, b) => a - b);
    return s2[Math.min(s2.length - 1, Math.max(0, Math.round((s2.length - 1) * q)))];
  };
  return { lo: axes.map((v) => at(v, 0.01)) as Vec3, hi: axes.map((v) => at(v, 0.99)) as Vec3 };
}

/** The level a sample is read at: the coarsest the pyramid has. */
export function sampleLevel(m: Manifest): number {
  return Math.max(0, (m.levels ?? 1) - 1);
}

/** Read a stack's coarsest level whole through the slab door, decoded into the modality's values; `later` for an item ahead. */
export async function sampleStack(stack: number, m: Manifest, later = false): Promise<Sample> {
  const level = sampleLevel(m);
  const [nz, ny, nx] = levelShape(m, level);
  const slab = Math.max(1, Math.min(m.slab ?? 32, 32));
  const values = new Float32Array(nz * ny * nx);
  const slope = m.slope !== undefined && m.slope !== 0 ? m.slope : 1;
  const intercept = m.intercept ?? 0;
  // the decoder (and cornerstone with it) is loaded on the first sample, out of the desk's first bundle
  const { decoder } = await import("./loader");
  const pool = decoder();
  const starts: number[] = [];
  for (let z0 = 0; z0 < nz; z0 += slab) starts.push(z0);
  const each = async (z0: number) => {
    const z1 = Math.min(nz, z0 + slab);
    const r = await readSlab(stack, level, z0, z1, { warm: later });
    const planes = await Promise.all(r.planes.map((tiles) => pool.decode(m.codec, tiles, nx, ny, m.tile, later)));
    planes.forEach((p, i) => {
      const at = (z0 + i) * ny * nx;
      for (let j = 0; j < ny * nx; j++) values[at + j] = p.plane[j] * slope + intercept;
    });
  };
  // for later, one slab at a time, so the reads of the pictures on the screen never queue behind them
  if (later) for (const z0 of starts) await each(z0);
  else await Promise.all(starts.map(each));
  return { values, shape: [nz, ny, nx], level };
}

const cache = new Map<number, Promise<Reference>>();

/** A stack's reference, read once per page; `later` for an item ahead, whose planes wait behind the pictures on the screen. */
export function reference(stack: number, m: Manifest, later = false): Promise<Reference> {
  const have = cache.get(stack);
  if (have) return have;
  const p = sampleStack(stack, m, later).then((s) => {
    const r = referenceOf(s);
    return { value: r.value, threshold: r.threshold, foreground: r.foreground, extent: r.value === null ? null : extentOf(s, m, r.threshold) };
  });
  cache.set(stack, p);
  p.catch(() => cache.delete(stack));
  return p;
}
