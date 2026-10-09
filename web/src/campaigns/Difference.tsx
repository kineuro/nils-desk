// SPDX-License-Identifier: AGPL-3.0-only
// The difference view (the post-contrast study, anchored reading): the
// candidate minus an anchor, each scaled by its own reference tissue
// (viewer/reference.ts), on the plane of the anchor nearest the candidate's
// (pair mode's slice matching, campaigns/pair.ts). Mid grey is no
// difference; brighter is where the candidate is brighter than the anchor
// for its reference. A candidate that is post shows its vessels, choroid
// plexus and dura bright against the pre and nearly nothing against the
// post. No registration is done: the planes must lie parallel, with rows
// and columns the same way and the same pixel size, and one is shifted
// onto the other by whole pixels. Where the geometry does not match, the
// view says so and shows none.

import { useEffect, useRef, useState } from "react";
import { doors, levelShape, levelSpacing, type Manifest } from "../viewer/doors";
import { dot, geometry, planePosition } from "../viewer/geometry";
import { sliceMap } from "./pair";

/** How the anchor's pixels lie under the candidate's, or why they do not. */
export type DiffPlan =
  | {
      ok: true;
      /** The level both are read at. */
      level: number;
      /** The candidate's plane to the anchor's. */
      map: (z: number) => number;
      /** The anchor's pixel under the candidate's (y, x) is (y + dy, x + dx) at the level, for the planes z and map(z). */
      shift: (z: number) => [number, number];
    }
  | { ok: false; why: string };

const COS_TWO_DEGREES = Math.cos((2 * Math.PI) / 180);
/** The widest plane the difference is drawn at: coarse enough to be quick, fine enough to see a vessel. */
const WIDEST = 384;

function levelFor(m: Manifest): number {
  let l = 0;
  while (l < m.levels - 1 && m.shape[2] / 2 ** l > WIDEST) l++;
  return l;
}

export function diffPlan(cand: Manifest, anchor: Manifest): DiffPlan {
  const map = sliceMap(cand, anchor);
  if (!map) return { ok: false, why: "the planes do not match: another orientation, or no overlap" };
  const same = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b));
  if (!same(cand.spacing[1], anchor.spacing[1]) || !same(cand.spacing[2], anchor.spacing[2])) return { ok: false, why: "the pixels are of another size" };
  const level = Math.min(levelFor(cand), anchor.levels - 1);
  if (map.kind === "index") {
    return { ok: true, level, map: map.map, shift: () => [0, 0] };
  }
  const gc = geometry(cand);
  const ga = geometry(anchor);
  if (dot(gc.row, ga.row) < COS_TWO_DEGREES || dot(gc.col, ga.col) < COS_TWO_DEGREES) return { ok: false, why: "the rows or columns run another way" };
  const [, dy, dx] = levelSpacing(cand, level);
  return {
    ok: true,
    level,
    map: map.map,
    shift: (z) => {
      const pc = planePosition(gc, cand.spacing, level, z);
      const pa = planePosition(ga, anchor.spacing, level, map.map(z));
      const d: [number, number, number] = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      return [Math.round(dot(d, ga.col) / dy), Math.round(dot(d, ga.row) / dx)];
    },
  };
}

/**
 * The difference as grey pixels: (candidate / its reference) − (anchor /
 * its reference), mid grey at none, white at +range, black at −range; a
 * pixel the anchor does not cover is drawn dark blue-grey. RGBA, the
 * candidate's plane size.
 */
export function diffPixels(c: ArrayLike<number>, a: ArrayLike<number>, nx: number, ny: number, ax: number, ay: number, shift: [number, number], refC: number, refA: number, range: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nx * ny * 4);
  const [sy, sx] = shift;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const o = (y * nx + x) * 4;
      const yy = y + sy;
      const xx = x + sx;
      if (yy < 0 || yy >= ay || xx < 0 || xx >= ax) {
        out[o] = 24;
        out[o + 1] = 28;
        out[o + 2] = 40;
        out[o + 3] = 255;
        continue;
      }
      const d = c[y * nx + x] / refC - a[yy * ax + xx] / refA;
      const g = Math.round(128 + (127 * d) / range);
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = g;
      out[o + 3] = 255;
    }
  }
  return out;
}

async function planeOf(stack: number, m: Manifest, level: number, z: number): Promise<{ values: Float32Array; nx: number; ny: number }> {
  const [, ny, nx] = levelShape(m, level);
  const r = await doors.plane(stack, level, z);
  const { decoder } = await import("../viewer/loader");
  const { plane } = await decoder().decode(m.codec, r.tiles, nx, ny, m.tile);
  const slope = m.slope !== undefined && m.slope !== 0 ? m.slope : 1;
  const intercept = m.intercept ?? 0;
  const values = new Float32Array(plane.length);
  for (let i = 0; i < plane.length; i++) values[i] = plane[i] * slope + intercept;
  return { values, nx, ny };
}

export interface DiffSide {
  stack: number;
  manifest: Manifest;
  /** The stack's reference tissue, in the modality's values. */
  ref: number;
}

/** The candidate minus one anchor on the candidate's plane `z`, drawn over the anchor's panel. */
export function Difference({ cand, anchor, z, range = 0.5, label }: { cand: DiffSide; anchor: DiffSide; z: number; range?: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const plan = diffPlan(cand.manifest, anchor.manifest);
  const planKey = plan.ok ? `${plan.level}` : plan.why;
  useEffect(() => {
    if (!plan.ok) return;
    let alive = true;
    setFailed(null);
    const za = plan.map(z);
    Promise.all([planeOf(cand.stack, cand.manifest, plan.level, z), planeOf(anchor.stack, anchor.manifest, plan.level, za)])
      .then(([c, a]) => {
        if (!alive || !canvas.current) return;
        const px = diffPixels(c.values, a.values, c.nx, c.ny, a.nx, a.ny, plan.shift(z), cand.ref, anchor.ref, range);
        const cv = canvas.current;
        cv.width = c.nx;
        cv.height = c.ny;
        const [, dy, dx] = levelSpacing(cand.manifest, plan.level);
        setSize({ w: c.nx * dx, h: c.ny * dy });
        cv.getContext("2d")?.putImageData(new ImageData(px as unknown as Uint8ClampedArray<ArrayBuffer>, c.nx, c.ny), 0, 0);
      })
      .catch((e: unknown) => alive && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cand.stack, anchor.stack, cand.ref, anchor.ref, z, range, planKey]);
  return (
    <div className="difference" data-difference={plan.ok ? "shown" : "none"}>
      <span className="difference-label">{label}</span>
      {plan.ok ? (
        <canvas ref={canvas} className="difference-canvas" style={size ? { aspectRatio: `${size.w} / ${size.h}` } : undefined} aria-label={label} />
      ) : (
        <p className="difference-none">No difference shown: {plan.why}.</p>
      )}
      {failed && <p className="warn difference-none">The planes could not be read: {failed}</p>}
    </div>
  );
}
