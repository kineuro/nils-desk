// SPDX-License-Identifier: AGPL-3.0-only
// One point in the patient for every panel, and a part brought into view
// (record 55 H3, job type 3, build spec sections 4 and 5.5). The point is
// in the patient's millimetres (DICOM's, LPS), as the engine names a part's
// anchor and box: each panel shows the plane through it, the stack view the
// stack's own plane nearest it, the three planes their planes moved along
// their normals. Focusing a part sets the point to its anchor (a voxel
// inside the part, so a curved lesion is never missed) and zooms every
// panel to its box with a margin. Pure, so the gate holds it; the viewer
// hands the cameras to cornerstone.

import { levelShape, type Manifest } from "./doors";
import { cross, dot, geometry, planePosition, type Vec3 } from "./geometry";

/** A part as the engine places it: its anchor and its box (the minimum and maximum corner), mm in LPS. */
export interface PartPlace {
  anchor: Vec3;
  box: [Vec3, Vec3];
}

/** Room left around a part's box, each side, mm. */
export const FOCUS_MARGIN_MM = 15;
/** The least a focused view shows across its narrower side, mm. */
export const FOCUS_MIN_MM = 40;

/** A camera as cornerstone names it. */
export interface Camera {
  viewPlaneNormal: Vec3;
  viewUp: Vec3;
  focalPoint: Vec3;
  position: Vec3;
  parallelScale?: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? scale(a, 1 / l) : a;
}

/** Whether a value is a point in the patient: three finite numbers. */
export function isPoint(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));
}

/** Whether a value is a part's place: an anchor and a box of two points. */
export function isPartPlace(v: unknown): v is PartPlace {
  const o = v as Partial<PartPlace> | null;
  return !!o && isPoint(o.anchor) && Array.isArray(o.box) && o.box.length === 2 && isPoint(o.box[0]) && isPoint(o.box[1]);
}

/**
 * The stack's own plane nearest a point (every level keeps every plane),
 * and whether the point lies within half a plane of the stack. Outside it
 * the nearest end is given, so a panel never shows nothing.
 */
export function planeOfPoint(m: Manifest, p: Vec3): { z: number; inside: boolean } {
  const g = geometry(m);
  const nz = levelShape(m, 0)[0];
  const along = dot(g.step, g.normal);
  const k = along > 0 ? dot(sub(p, g.origin), g.normal) / along : 0;
  const z = Math.min(nz - 1, Math.max(0, Math.round(k)));
  return { z, inside: k >= -0.5 && k <= nz - 0.5 };
}

/** A point on a stack's plane z at a level, for a camera that must stay on the plane it shows. */
export function pointOnPlane(m: Manifest, level: number, z: number): Vec3 {
  return planePosition(geometry(m), m.spacing, level, z);
}

/** A camera moved along its normal until its plane holds the point; nothing else of it changes. */
export function throughPoint(cam: Camera, p: Vec3): Pick<Camera, "focalPoint" | "position"> {
  const n = unit(cam.viewPlaneNormal);
  const d = scale(n, dot(sub(p, cam.focalPoint), n));
  return { focalPoint: add(cam.focalPoint, d), position: add(cam.position, d) };
}

/** The screen's right and up in the patient for a camera: up is its view-up flattened onto the plane, right is up cross the normal. */
export function screenAxes(cam: Pick<Camera, "viewPlaneNormal" | "viewUp">): { right: Vec3; up: Vec3; normal: Vec3 } {
  const n = unit(cam.viewPlaneNormal);
  const u0 = cam.viewUp;
  const up = unit(sub(u0, scale(n, dot(u0, n))));
  return { right: unit(cross(up, n)), up, normal: n };
}

/** How wide and high a box stands on a camera's screen, mm: its eight corners along the screen's right and up. */
export function boxOnScreen(cam: Pick<Camera, "viewPlaneNormal" | "viewUp">, box: [Vec3, Vec3]): { w: number; h: number } {
  const { right, up } = screenAxes(cam);
  const [a, b] = box;
  let r0 = Infinity;
  let r1 = -Infinity;
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const x of [a[0], b[0]])
    for (const y of [a[1], b[1]])
      for (const z of [a[2], b[2]]) {
        const c: Vec3 = [x, y, z];
        const r = dot(c, right);
        const u = dot(c, up);
        r0 = Math.min(r0, r);
        r1 = Math.max(r1, r);
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
      }
  return { w: r1 - r0, h: u1 - u0 };
}

/**
 * The camera that shows a part: its plane through `on` (the anchor, or a
 * point of the stack's plane that holds it), centred on the part's box, and
 * zoomed so the box with the margin on each side fits, and the narrower
 * side shows at least FOCUS_MIN_MM. `aspect` is the viewport's width over
 * its height; `parallelScale` is half the height it shows, mm.
 */
export function focusCamera(cam: Camera, part: PartPlace, aspect: number, on: Vec3 = part.anchor): Required<Pick<Camera, "focalPoint" | "position" | "parallelScale">> {
  const n = unit(cam.viewPlaneNormal);
  const [a, b] = part.box;
  const centre: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  // the box's centre moved along the normal onto the plane through `on`
  const focalPoint = add(centre, scale(n, dot(sub(on, centre), n)));
  const away = Math.hypot(...sub(cam.position, cam.focalPoint)) || 1000;
  const position = add(focalPoint, scale(n, away));
  const { w, h } = boxOnScreen(cam, part.box);
  const r = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const m = 2 * FOCUS_MARGIN_MM;
  const parallelScale = Math.max((h + m) / 2, (w + m) / (2 * r), FOCUS_MIN_MM / (2 * Math.min(1, r)));
  return { focalPoint, position, parallelScale };
}
