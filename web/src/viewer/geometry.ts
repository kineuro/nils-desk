// SPDX-License-Identifier: AGPL-3.0-only
// Where a stack sits in the patient (record 45 S2, study A3 "MPR in the
// browser"): the manifest's orientation (six direction cosines), origin (the
// first plane's position) and frame, read into the geometry the loader and
// the volume hand to cornerstone3D, and the letters (L, R, A, P, S, I) drawn
// at a viewport's edges. A manifest from before the engine named them is
// read as axial at the origin, and says so. Pure, so the gate can hold it.

import type { Manifest } from "./doors";

export type Vec3 = [number, number, number];

export interface Geometry {
  /** The direction of a row, left to right on the stored plane (DICOM's first three cosines). */
  row: Vec3;
  /** The direction of a column, top to bottom on the stored plane. */
  col: Vec3;
  /** The direction from one plane to the next: row cross column, the order the engine sorts planes in. */
  normal: Vec3;
  /** The centre of the first plane's first pixel at level 0, in mm. */
  origin: Vec3;
  /** False when the manifest named no orientation: the geometry is axial by assumption. */
  known: boolean;
  /** False when the engine says the planes are not parallel or not evenly spaced. */
  regular: boolean;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a;
}

function vec3(v: unknown): Vec3 | null {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null;
}

/** Whether the frame the engine names is regular: parallel planes evenly spaced. Absent reads as regular. */
function regularFrame(frame: Manifest["frame"]): boolean {
  if (frame === undefined || frame === null) return true;
  if (typeof frame === "boolean") return frame;
  return frame.parallel !== false && frame.evenly_spaced !== false;
}

/** The stack's geometry from its manifest. */
export function geometry(m: Manifest): Geometry {
  const o = m.orientation;
  const rowIn = Array.isArray(o) && o.length === 6 ? vec3(o.slice(0, 3)) : null;
  const colIn = Array.isArray(o) && o.length === 6 ? vec3(o.slice(3, 6)) : null;
  const origin = vec3(m.origin) ?? [0, 0, 0];
  const regular = regularFrame(m.frame);
  if (m.orientation_known === false || !rowIn || !colIn || Math.abs(dot(norm(rowIn), norm(colIn))) > 0.01) {
    return { row: [1, 0, 0], col: [0, 1, 0], normal: [0, 0, 1], origin, known: false, regular };
  }
  const row = norm(rowIn);
  const col = norm(colIn);
  return { row, col, normal: norm(cross(row, col)), origin, known: true, regular };
}

/** A pyramid level's pixel is the mean of a 2^level square of level 0's, so its centre sits half a square in. */
export function levelOrigin(g: Geometry, spacing: [number, number, number], level: number): Vec3 {
  const [, dy, dx] = spacing;
  const shift = (2 ** level - 1) / 2;
  return [0, 1, 2].map((i) => g.origin[i] + g.row[i] * dx * shift + g.col[i] * dy * shift) as Vec3;
}

/** The position of plane z at a level (every level keeps every plane). */
export function planePosition(g: Geometry, spacing: [number, number, number], level: number, z: number): Vec3 {
  const o = levelOrigin(g, spacing, level);
  return [0, 1, 2].map((i) => o[i] + g.normal[i] * spacing[0] * z) as Vec3;
}

/** DICOM's patient axes: +x is the patient's left, +y posterior, +z superior (head). */
const LETTERS: [string, string][] = [
  ["L", "R"],
  ["P", "A"],
  ["S", "I"],
];

/**
 * The letters for a direction in the patient: the axes it leans along, strongest
 * first, each counted when it carries at least a quarter of the direction
 * (about fifteen degrees), and two at most, so a plane tilted a little reads
 * as its main letter and an oblique one names the two it lies between.
 */
export function letters(v: Vec3, threshold = 0.25): string {
  const n = norm(v);
  return [0, 1, 2]
    .filter((i) => Math.abs(n[i]) >= threshold)
    .sort((a, b) => Math.abs(n[b]) - Math.abs(n[a]))
    .slice(0, 2)
    .map((i) => LETTERS[i][n[i] > 0 ? 0 : 1])
    .join("");
}

export interface EdgeLabels {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

/** The letters at a viewport's edges from the screen's right and down directions in the patient. */
export function edgeLabels(right: Vec3, down: Vec3): EdgeLabels {
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  return { top: letters(neg(down)), bottom: letters(down), left: letters(neg(right)), right: letters(right) };
}

/** A camera's screen directions: up is the camera's view-up, and right is up cross the plane normal that points at the viewer. */
export function cameraLabels(viewUp: Vec3, viewPlaneNormal: Vec3): EdgeLabels {
  const right = norm(cross(viewUp, viewPlaneNormal));
  const down: Vec3 = [-viewUp[0], -viewUp[1], -viewUp[2]];
  return edgeLabels(right, down);
}

/** The stored plane as the stack viewport shows it: rows run right, columns run down. */
export function stackLabels(g: Geometry): EdgeLabels {
  return edgeLabels(g.row, g.col);
}

export type Axis = "z" | "y" | "x";

/** The server render of one axis as the engine draws it: the image's right and down in the patient, its pixels and their size in mm. */
export function renderAxes(g: Geometry, shape: [number, number, number], spacing: [number, number, number], axis: Axis): { right: Vec3; down: Vec3; w: number; h: number; mmW: number; mmH: number } {
  const [nz, ny, nx] = shape;
  const [dz, dy, dx] = spacing;
  // z: the stored plane; y: a row of every plane, planes running down; x: a column of every plane, planes running down
  if (axis === "z") return { right: g.row, down: g.col, w: nx, h: ny, mmW: dx, mmH: dy };
  if (axis === "y") return { right: g.row, down: g.normal, w: nx, h: nz, mmW: dx, mmH: dz };
  return { right: g.col, down: g.normal, w: ny, h: nz, mmW: dy, mmH: dz };
}

/** The server axis whose plane lies closest to a patient plane: the one whose normal is most nearly along it. */
export function nearestAxis(g: Geometry, planeNormal: Vec3): Axis {
  const score = (v: Vec3) => Math.abs(dot(v, planeNormal));
  const n = score(g.normal);
  const y = score(g.col);
  const x = score(g.row);
  return n >= y && n >= x ? "z" : y >= x ? "y" : "x";
}

/** The radiological screen of the patient plane nearest an image: axial (L right, P down), coronal (L right, I down), sagittal (P right, I down). */
function standardScreen(normal: Vec3): { right: Vec3; down: Vec3 } {
  const a = normal.map(Math.abs);
  if (a[2] >= a[0] && a[2] >= a[1]) return { right: [1, 0, 0], down: [0, 1, 0] };
  if (a[1] >= a[0]) return { right: [1, 0, 0], down: [0, 0, -1] };
  return { right: [0, 1, 0], down: [0, 0, -1] };
}

/**
 * How to turn an image whose right and down are given so it reads the way a
 * radiologist expects: a signed permutation as a canvas transform
 * [a, b, c, d] (x' = a x + c y, y' = b x + d y), and the directions the
 * screen's right and down then show, for the letters.
 */
export function conventional(right: Vec3, down: Vec3): { m: [number, number, number, number]; right: Vec3; down: Vec3 } {
  const s = standardScreen(cross(right, down));
  const pick = (target: Vec3): [number, number] => {
    const u = dot(right, target);
    const v = dot(down, target);
    return Math.abs(u) >= Math.abs(v) ? [Math.sign(u) || 1, 0] : [0, Math.sign(v) || 1];
  };
  const [a, c] = pick(s.right);
  const [b, d] = pick(s.down);
  if (a * d - b * c === 0) return { m: [1, 0, 0, 1], right, down };
  const neg = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  return { m: [a, b, c, d], right: a !== 0 ? neg(right, a) : neg(down, c), down: b !== 0 ? neg(right, b) : neg(down, d) };
}

// ---------------------------------------------------------------- the planes' cameras

/** Which way the three planes are cut from the volume. */
export type Planes = "acquisition" | "patient";

/** The cornerstone camera of a plane: the normal that points at the viewer, and the screen's up. */
export interface PlaneCamera {
  viewPlaneNormal: Vec3;
  viewUp: Vec3;
}

type PlaneName = "axial" | "coronal" | "sagittal";

/**
 * The patient's planes as cornerstone draws them (its MPR camera values):
 * axial seen from the feet with anterior up, coronal from the front and
 * sagittal from the left, the head up in both. The radiological screen.
 */
export const PATIENT_CAMERAS: Record<PlaneName, PlaneCamera> = {
  axial: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
  coronal: { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] },
  sagittal: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
};

/** The patient axis each plane looks along (0 left-right, 1 front-back, 2 feet-head), and the one its screen's up runs along. */
const ALONG: Record<PlaneName, number> = { sagittal: 0, coronal: 1, axial: 2 };
const UP: Record<PlaneName, number> = { axial: 1, coronal: 2, sagittal: 2 };

/**
 * Which of the volume's three axes (row, column, normal) stands for each
 * patient axis: the assignment that keeps every axis as near its patient
 * axis as it can (the largest sum of |cosine|), so a stack tilted even 45
 * degrees still gives each axis once.
 */
export function axisMap(g: Geometry): [number, number, number] {
  const axes = [g.row, g.col, g.normal];
  const perms: [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let best = perms[0];
  let score = -1;
  for (const p of perms) {
    // p[patient axis] = the volume axis that stands for it
    const s = Math.abs(axes[p[0]][0]) + Math.abs(axes[p[1]][1]) + Math.abs(axes[p[2]][2]);
    if (s > score + 1e-9) {
      score = s;
      best = p;
    }
  }
  return best;
}

/**
 * The cameras of the three planes (record 48, after the learners report).
 * `patient` cuts the volume along the scanner's axes, the way the patient
 * lay: an oblique stack (an axial tilted to the AC-PC line, a sagittal
 * angled to the midline) shows its slab and the head in it tilted by the
 * angle it was planned at. `acquisition` cuts it along the stack's own
 * axes: each plane is the volume axis nearest the patient's plane, turned
 * the radiological way round (head up, the patient's left on the screen's
 * right for axial and coronal, anterior left on sagittal), so the head
 * stands the way the operator aligned it and no voxel is interpolated
 * across a tilt. A stack that is not oblique gives the same cameras either
 * way. This is what the kineuro DICOM and NIfTI viewer settled on.
 */
export function planeCameras(g: Geometry, planes: Planes): Record<PlaneName, PlaneCamera> {
  if (planes === "patient" || !g.known) return PATIENT_CAMERAS;
  const axes = [g.row, g.col, g.normal];
  const map = axisMap(g);
  const signed = (v: Vec3, like: Vec3): Vec3 => (dot(v, like) >= 0 ? [...v] : [-v[0], -v[1], -v[2]]);
  const out = {} as Record<PlaneName, PlaneCamera>;
  for (const p of ["axial", "coronal", "sagittal"] as const) {
    const std = PATIENT_CAMERAS[p];
    out[p] = { viewPlaneNormal: signed(axes[map[ALONG[p]]], std.viewPlaneNormal), viewUp: signed(axes[map[UP[p]]], std.viewUp) };
  }
  return out;
}

/**
 * How far a plane's picture is turned from the stack's own grid, in
 * degrees: the angle between the screen's up and the nearest of the
 * volume's axes in the plane. Zero means the voxels' rows run straight
 * across the screen; a tilted cut shows the stack's slab at this angle.
 */
export function tiltOf(g: Geometry, cam: PlaneCamera): number {
  const axes = [g.row, g.col, g.normal];
  const n = norm(cam.viewPlaneNormal);
  // the up direction as the screen shows it: the camera's up, flattened onto the plane
  const u0 = cam.viewUp;
  const k = dot(u0, n);
  const up = norm([u0[0] - k * n[0], u0[1] - k * n[1], u0[2] - k * n[2]]);
  let best = 90;
  for (const a of axes) {
    const along = dot(a, n);
    const flat: Vec3 = [a[0] - along * n[0], a[1] - along * n[1], a[2] - along * n[2]];
    if (Math.hypot(...flat) < 1e-6) continue;
    const c = Math.min(1, Math.abs(dot(norm(flat), up)));
    const deg = (Math.acos(c) * 180) / Math.PI;
    best = Math.min(best, deg, 90 - deg);
  }
  return best;
}
