// SPDX-License-Identifier: AGPL-3.0-only
// Oblique stacks are not tilted (record 48, after the learners report): an
// axial stack planned 15 or 30 degrees off the scanner's axes (to the AC-PC
// line), a sagittal one angled to the midline, and a double oblique, cut in
// the acquisition's own planes, show the head upright with the stack's grid
// square to the screen; cut along the scanner's axes they show the tilt they
// were planned at. Checked on the cameras, and numerically on a synthetic
// volume resampled through each camera the way a slice is: a band that runs
// along the stack's planes must come out level.
import { describe, expect, it } from "vitest";
import type { Manifest } from "./doors";
import { axisMap, cross, dot, geometry, PATIENT_CAMERAS, planeCameras, tiltOf, type Geometry, type PlaneCamera, type Vec3 } from "./geometry";

const base: Manifest = { codec: "htj2k", tile: 256, levels: 4, shape: [64, 128, 128], spacing: [1, 1, 1], dtype: "uint16", window: { center: 500, width: 1000 } };
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function rotX(v: Vec3, a: number): Vec3 {
  return [v[0], Math.cos(a) * v[1] - Math.sin(a) * v[2], Math.sin(a) * v[1] + Math.cos(a) * v[2]];
}
function rotZ(v: Vec3, a: number): Vec3 {
  return [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
}

/** A stack's geometry from its row and column directions, as the engine's manifest names them. */
function stackOf(row: Vec3, col: Vec3): Geometry {
  return geometry({ ...base, orientation: [...row, ...col], origin: [0, 0, 0], orientation_known: true });
}

/** An axial stack tilted about the patient's left-right axis (chin down, the AC-PC plan). */
const axialTilted = (d: number) => stackOf(rotX([1, 0, 0], rad(d)), rotX([0, 1, 0], rad(d)));
/** A sagittal stack angled about the head-feet axis (to the midline of a turned head). */
const sagittalTurned = (d: number) => stackOf(rotZ([0, 1, 0], rad(d)), rotZ([0, 0, -1], rad(d)));
/** A coronal stack tilted about the left-right axis (along the brainstem). */
const coronalTilted = (d: number) => stackOf(rotX([1, 0, 0], rad(d)), rotX([0, 0, -1], rad(d)));
/** The bench's double oblique: 25 degrees about x, then 20 about z. */
const doubleOblique = () => stackOf(rotZ(rotX([1, 0, 0], rad(25)), rad(20)), rotZ(rotX([0, 1, 0], rad(25)), rad(20)));

const PLANES = ["axial", "coronal", "sagittal"] as const;
const S: Vec3 = [0, 0, 1];
const A: Vec3 = [0, -1, 0];
const L: Vec3 = [1, 0, 0];
/** The screen's right as cornerstone draws it: up crossed with the normal that points at the viewer. */
const rightOf = (c: PlaneCamera): Vec3 => cross(c.viewUp, c.viewPlaneNormal);
/** How far a direction is from the nearest of the stack's axes, in degrees. */
function offGrid(g: Geometry, v: Vec3): number {
  return Math.min(...[g.row, g.col, g.normal].map((a) => deg(Math.acos(Math.min(1, Math.abs(dot(a, v)))))));
}

const CASES: [string, Geometry, number][] = [
  ["an axial stack 15 degrees off", axialTilted(15), 15],
  ["an axial stack 30 degrees off", axialTilted(30), 30],
  ["a sagittal stack turned 15 degrees", sagittalTurned(15), 15],
  ["a coronal stack tilted 30 degrees", coronalTilted(30), 30],
];

describe("the acquisition's planes of an oblique stack", () => {
  for (const [name, g] of [...CASES.map(([n, x]) => [n, x] as const), ["a double oblique (25 and 20 degrees)", doubleOblique()] as const]) {
    it(`${name}: each plane is one of the stack's own, square to the screen, the head up`, () => {
      const cams = planeCameras(g, "acquisition");
      const used = new Set<number>();
      for (const p of PLANES) {
        const c = cams[p];
        // the plane is the stack's own: its normal and its up are axes of the volume
        expect(offGrid(g, c.viewPlaneNormal)).toBeLessThan(1e-6);
        expect(offGrid(g, c.viewUp)).toBeLessThan(1e-6);
        expect(tiltOf(g, c)).toBeLessThan(1e-6);
        used.add([g.row, g.col, g.normal].findIndex((a) => Math.abs(dot(a, c.viewPlaneNormal)) > 0.999));
        // turned the radiological way: the head (or the front, on an axial) up, the patient's left on the right (the front on a sagittal's left)
        const std = PATIENT_CAMERAS[p];
        expect(dot(c.viewPlaneNormal, std.viewPlaneNormal)).toBeGreaterThan(0.5);
        expect(dot(c.viewUp, std.viewUp)).toBeGreaterThan(0.5);
        expect(dot(rightOf(c), rightOf(std))).toBeGreaterThan(0.5);
      }
      // three different planes, one per axis of the volume
      expect(used.size).toBe(3);
      expect(dot(cams.coronal.viewUp, S)).toBeGreaterThan(0.8);
      expect(dot(cams.sagittal.viewUp, S)).toBeGreaterThan(0.8);
      expect(dot(cams.axial.viewUp, A)).toBeGreaterThan(0.8);
      expect(dot(rightOf(cams.axial), L)).toBeGreaterThan(0.8);
    });
  }

  for (const [name, g, d] of CASES) {
    it(`${name}: cut along the scanner's axes it is off the stack's grid by the angle it was planned at`, () => {
      const cams = planeCameras(g, "patient");
      expect(cams).toEqual(PATIENT_CAMERAS);
      // some plane is either turned on the screen or cut across the stack's planes, by the planned angle
      const worst = Math.max(...PLANES.map((p) => Math.max(tiltOf(g, cams[p]), offGrid(g, cams[p].viewPlaneNormal))));
      expect(worst).toBeCloseTo(d, 6);
    });
  }

  it("a stack square to the scanner has the same cameras either way", () => {
    for (const g of [axialTilted(0), sagittalTurned(0), coronalTilted(0)]) {
      const a = planeCameras(g, "acquisition");
      for (const p of PLANES) {
        for (const i of [0, 1, 2]) {
          expect(a[p].viewPlaneNormal[i]).toBeCloseTo(PATIENT_CAMERAS[p].viewPlaneNormal[i], 9);
          expect(a[p].viewUp[i]).toBeCloseTo(PATIENT_CAMERAS[p].viewUp[i], 9);
        }
      }
    }
  });

  it("a stack whose orientation is unknown is drawn on the scanner's axes", () => {
    expect(planeCameras(geometry(base), "acquisition")).toEqual(PATIENT_CAMERAS);
  });

  it("gives every patient axis a volume axis even at 45 degrees", () => {
    for (const d of [44, 45, 46]) {
      const m = axisMap(axialTilted(d));
      expect([...m].sort()).toEqual([0, 1, 2]);
    }
  });
});

// ---------------------------------------------------------------- resampled

/**
 * A synthetic oblique volume: bright bands two planes thick every eight
 * planes along the stack's normal, as the planes of an acquisition are.
 * Sampled trilinearly at a point in the patient, as a slice through a
 * cornerstone volume is.
 */
function bands(g: Geometry, n = 64) {
  const at = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n ? 0 : ((k % 8) + 8) % 8 < 2 ? 1000 : 0);
  const centre = (n - 1) / 2;
  return (p: Vec3): number => {
    // the volume is centred on the patient origin
    const x = dot(p, g.row) + centre;
    const y = dot(p, g.col) + centre;
    const z = dot(p, g.normal) + centre;
    const [i0, j0, k0] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [fx, fy, fz] = [x - i0, y - j0, z - k0];
    let v = 0;
    for (const [di, wx] of [
      [0, 1 - fx],
      [1, fx],
    ])
      for (const [dj, wy] of [
        [0, 1 - fy],
        [1, fy],
      ])
        for (const [dk, wz] of [
          [0, 1 - fz],
          [1, fz],
        ])
          v += wx * wy * wz * at(i0 + di, j0 + dj, k0 + dk);
    return v;
  };
}

/** The picture a camera shows through the volume's centre: `size` pixels a side, a millimetre each, row 0 at the top. */
function slice(sample: (p: Vec3) => number, c: PlaneCamera, size = 40): number[][] {
  const right = rightOf(c);
  const up = c.viewUp;
  const out: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const u = x - size / 2;
      const v = size / 2 - y;
      row.push(sample([right[0] * u + up[0] * v, right[1] * u + up[1] * v, right[2] * u + up[2] * v]));
    }
    out.push(row);
  }
  return out;
}

/** The angle of the bands on the picture, in degrees: how far down the pattern moves from a column left of centre to one just right of it. */
function bandAngle(img: number[][]): number {
  const size = img.length;
  // four pixels apart, so a band moves less than half its period (eight) between them even at 30 degrees
  const [x0, x1] = [size / 2 - 2, size / 2 + 2];
  const col = (x: number) => img.map((r) => r[x]);
  const a = col(x0);
  const b = col(x1);
  let best = 0;
  let score = Infinity;
  for (let s = -3.9; s <= 3.9; s += 0.01) {
    let e = 0;
    let n = 0;
    for (let y = 8; y < size - 8; y++) {
      const yy = y + s;
      const lo = Math.floor(yy);
      const f = yy - lo;
      if (lo < 0 || lo + 1 >= size) continue;
      const bv = b[lo] * (1 - f) + b[lo + 1] * f;
      e += (a[y] - bv) ** 2;
      n += 1;
    }
    if (n > 0 && e / n < score - 1e-9) {
      score = e / n;
      best = s;
    }
  }
  return Math.abs(deg(Math.atan2(best, x1 - x0)));
}

describe("an oblique axial volume resampled through the cameras", () => {
  for (const d of [15, 30]) {
    it(`${d} degrees: the sagittal and coronal show the stack's planes level in the acquisition's planes, tilted by ${d} along the scanner's`, () => {
      const g = axialTilted(d);
      const sample = bands(g);
      const acq = planeCameras(g, "acquisition");
      const pat = planeCameras(g, "patient");
      // the bands are the axial planes: level on the sagittal and the coronal the stack gives
      expect(bandAngle(slice(sample, acq.sagittal))).toBeLessThan(1);
      expect(bandAngle(slice(sample, acq.coronal))).toBeLessThan(1);
      // the scanner's sagittal shows them at the planned angle
      expect(Math.abs(bandAngle(slice(sample, pat.sagittal)) - d)).toBeLessThan(1.5);
    });
  }
});
