// SPDX-License-Identifier: AGPL-3.0-only
// Sheared stacks are placed where their planes are: the manifest's `step`
// (the engine's mean step from one plane to the next) read into the
// geometry, the shear it carries in the plane under the engine's rule (a
// tenth of a pixel over the whole stack), the grid the volume is held in
// (square to the stack's axes, wider by the planes' drift) and each plane
// written into it at its shift. Checked on the geometry, and numerically on
// a synthetic head resampled through the grid along the patient's planes:
// held this way it stands upright and in proportion; held the old way, the
// planes unshifted, it leans by the shear.
import { describe, expect, it } from "vitest";
import type { Manifest } from "./doors";
import { cross, dot, geometry, planePosition, shiftInto, volumeGrid, type Vec3 } from "./geometry";
import { volumeLevel } from "./ring";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const tan20 = Math.tan(rad(20));

/** An axial stack of `nz` planes 5 mm apart along the normal, each shifted `inCol` mm along its columns: a gantry tilt. */
function gantry(inCol: number, nz = 30, n = 64, d = 2): Manifest {
  return {
    codec: "htj2k",
    tile: 256,
    levels: 3,
    shape: [nz, n, n],
    spacing: [5, d, d],
    dtype: "uint16",
    window: { center: 500, width: 1000 },
    orientation: [1, 0, 0, 0, 1, 0],
    origin: [-(n - 1) * (d / 2), -(n - 1) * (d / 2), 0],
    orientation_known: true,
    frame: { parallel: true, evenly_spaced: true },
    step: [0, inCol, 5],
  };
}

describe("the step a manifest names", () => {
  it("is read as the step, and a shear is its part in the plane", () => {
    const g = geometry(gantry(5 * tan20));
    expect(g.step).toEqual([0, 5 * tan20, 5]);
    expect(g.shear![0]).toBe(0);
    expect(g.shear![1]).toBeCloseTo(1.82, 2);
    // plane z sits at the origin and z steps, not z steps along the normal
    expect(planePosition(g, [5, 2, 2], 0, 10)[1]).toBeCloseTo(-63 + 18.2, 1);
  });
  it("is along the normal by the spacing when the manifest is from before, or the step runs against the normal", () => {
    const old = { ...gantry(0), step: undefined };
    expect(geometry(old).step).toEqual([0, 0, 5]);
    expect(geometry(old).shear).toBeNull();
    expect(geometry({ ...gantry(0), step: [0, 1, -5] }).step).toEqual([0, 0, 5]);
    expect(geometry({ ...gantry(0), step: [0, 1] }).shear).toBeNull();
  });
  it("is no shear when the whole stack drifts less than a tenth of a pixel, as the engine reads it", () => {
    // 29 gaps of 0.006 mm is 0.087 of a 2 mm pixel; 0.007 is 0.10
    expect(geometry(gantry(0.006)).shear).toBeNull();
    expect(geometry(gantry(0.007)).shear).not.toBeNull();
  });
});

describe("the grid a sheared volume is held in", () => {
  for (const inCol of [5 * tan20, -5 * tan20]) {
    it(`puts every voxel where its plane says (${inCol > 0 ? "forward" : "backward"} shear), at every level`, () => {
      const m = gantry(inCol);
      const g = geometry(m);
      for (const level of [0, 2]) {
        const f = 2 ** level;
        const shape: [number, number, number] = [30, 64 / f, 64 / f];
        const grid = volumeGrid(g, shape, m.spacing, level);
        // wider along the columns by the drift in the level's pixels, not along the rows
        expect(grid.size).toEqual([64 / f, 64 / f + Math.ceil((Math.abs(inCol) * 29) / (2 * f))]);
        for (const [i, j, z] of [
          [0, 0, 0],
          [5, 9, 29],
          [15, 3, 17],
        ]) {
          // the voxel where the planes are: the level's origin, i and j pixels in, and z steps
          const o = planePosition(g, m.spacing, level, z);
          const truth = [0, 1, 2].map((a) => o[a] + g.row[a] * 2 * f * i + g.col[a] * 2 * f * j);
          // the same voxel in the grid, at its plane's shift
          const [ox, oy] = grid.shift(z);
          const at = [0, 1, 2].map((a) => grid.origin[a] + grid.direction[0][a] * grid.spacing[0] * (i + ox) + grid.direction[1][a] * grid.spacing[1] * (j + oy) + grid.direction[2][a] * grid.spacing[2] * z);
          at.forEach((v, a) => expect(v).toBeCloseTo(truth[a], 6));
          // and it is inside the grid
          expect(i + ox).toBeGreaterThanOrEqual(0);
          expect(j + oy).toBeLessThanOrEqual(grid.size[1] - 1 + 1e-9);
        }
      }
    });
  }
  it("is the planes as they are when there is no shear", () => {
    const m = gantry(0);
    const grid = volumeGrid(geometry(m), [30, 64, 64], m.spacing, 0);
    expect(grid.size).toEqual([64, 64]);
    expect(grid.shift(29)).toEqual([0, 0]);
    expect(grid.origin).toEqual(m.origin);
  });
  it("counts the wider grid in the volume's budget", () => {
    const plain = volumeLevel(gantry(0))!;
    const sheared = volumeLevel(gantry(5 * tan20))!;
    expect(plain.dims).toEqual([64, 64, 30]);
    expect(sheared.dims).toEqual([64, 64 + 27, 30]);
    expect(sheared.bytes).toBe(64 * 91 * 30 * 2);
  });
});

describe("a plane written at a shift", () => {
  const src = Uint16Array.from({ length: 12 }, (_, i) => 100 * (i + 1)); // 4 by 3
  it("lands whole at a whole shift, with nothing around it", () => {
    const dst = new Uint16Array(6 * 5).fill(7);
    shiftInto(src, 4, 3, dst, 0, 6, 5, 2, 1);
    expect(Array.from(dst.subarray(6, 12))).toEqual([0, 0, 100, 200, 300, 400]);
    expect(Array.from(dst.subarray(18, 24))).toEqual([0, 0, 900, 1000, 1100, 1200]);
    expect(Array.from(dst.subarray(24, 30))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(dst.subarray(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("is linear between neighbours at a fractional shift", () => {
    const dst = new Uint16Array(5 * 3);
    shiftInto(src, 4, 3, dst, 0, 5, 3, 0.5, 0);
    expect(Array.from(dst.subarray(0, 5))).toEqual([50, 150, 250, 350, 200]);
  });
});

/**
 * A head-like ellipsoid on the patient's axes (radii 50, 65 and 80 mm),
 * sampled at the true voxels of a stack, held in a grid, and read back along
 * the patient's sagittal through its centre: the row of the grid a patient
 * point falls in, trilinear, as a cornerstone slice is.
 */
function sagittalOf(inCol: number, shifted: boolean): number[][] {
  const m = gantry(inCol, 48, 96, 2);
  const [nz, ny, nx] = m.shape;
  const g = geometry(shifted ? m : { ...m, step: undefined });
  const truth = geometry(m);
  const grid = volumeGrid(g, m.shape, m.spacing, 0);
  const [NX, NY] = grid.size;
  const data = new Uint16Array(NX * NY * nz);
  const plane = new Uint16Array(nx * ny);
  // the head's centre: the middle of the stack as its planes really lie
  const c = planePosition(truth, m.spacing, 0, (nz - 1) / 2).map((v, a) => v + (truth.row[a] + truth.col[a]) * (nx - 1));
  for (let z = 0; z < nz; z++) {
    const o = planePosition(truth, m.spacing, 0, z);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const p = [0, 1, 2].map((a) => o[a] + 2 * i * truth.row[a] + 2 * j * truth.col[a] - c[a]);
        plane[j * nx + i] = (p[0] / 50) ** 2 + (p[1] / 65) ** 2 + (p[2] / 80) ** 2 < 1 ? 1000 : 0;
      }
    const [ox, oy] = grid.shift(z);
    shiftInto(plane, nx, ny, data, z * NX * NY, NX, NY, ox, oy);
  }
  const at = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= nz ? 0 : data[k * NX * NY + j * NX + i]);
  const sample = (p: Vec3) => {
    const d = [0, 1, 2].map((a) => p[a] - grid.origin[a]) as Vec3;
    const [x, y, z] = grid.direction.map((ax, a) => dot(d, ax) / grid.spacing[a]);
    const [i0, j0, k0] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [fx, fy, fz] = [x - i0, y - j0, z - k0];
    let v = 0;
    for (const [di, wx] of [[0, 1 - fx], [1, fx]]) for (const [dj, wy] of [[0, 1 - fy], [1, fy]]) for (const [dk, wz] of [[0, 1 - fz], [1, fz]]) v += wx * wy * wz * at(i0 + di, j0 + dj, k0 + dk);
    return v;
  };
  // the patient's sagittal through the head's centre: front-back across, feet-head up, a millimetre a pixel
  const out: number[][] = [];
  for (let v = 100; v >= -100; v--) {
    const r: number[] = [];
    for (let u = -100; u <= 100; u++) r.push(sample([c[0], c[1] + u, c[2] + v]));
    out.push(r);
  }
  return out;
}

/** The ellipse's width over its height and how far its axes are turned from the picture's. */
function shapeOf(img: number[][]): { ratio: number; turn: number } {
  const pts: [number, number][] = [];
  img.forEach((r, y) => r.forEach((v, x) => v > 500 && pts.push([x, y])));
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let [xx, yy, xy] = [0, 0, 0];
  for (const [x, y] of pts) (xx += (x - mx) ** 2), (yy += (y - my) ** 2), (xy += (x - mx) * (y - my));
  const theta = deg(0.5 * Math.atan2(2 * xy, xx - yy));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { ratio: (Math.max(...xs) - Math.min(...xs) + 1) / (Math.max(...ys) - Math.min(...ys) + 1), turn: Math.min(Math.abs(theta), Math.abs(90 - Math.abs(theta))) };
}

describe("a gantry-tilted head resampled through the grid", () => {
  it("stands upright and in proportion on the patient's sagittal, and leaned by the shear when held unshifted", () => {
    const right = shapeOf(sagittalOf(5 * tan20, true));
    expect(right.turn).toBeLessThan(1);
    expect(Math.abs(right.ratio / (65 / 80) - 1)).toBeLessThan(0.03);
    const old = shapeOf(sagittalOf(5 * tan20, false));
    expect(old.turn).toBeGreaterThan(10);
    // the same slab with the step along the normal is the stack before: cross-check the normal
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });
});
