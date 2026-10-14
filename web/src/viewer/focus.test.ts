// SPDX-License-Identifier: AGPL-3.0-only
// One point for every panel, and a part brought into view (record 55 H3,
// job type 3, D1): each scan's own plane nearest a point, at its own
// spacing; the three planes moved along their normals only; a focused view
// on the plane of the part's anchor, centred on its box, zoomed to the box
// with 15 mm each side and at least 40 mm across.

import { describe, expect, it } from "vitest";
import type { Manifest } from "./doors";
import { boxOnScreen, FOCUS_MARGIN_MM, FOCUS_MIN_MM, focusCamera, isPartPlace, planeOfPoint, pointOnPlane, throughPoint, type Camera, type PartPlace } from "./focus";
import { PATIENT_CAMERAS, type Vec3 } from "./geometry";

const base = { codec: "htj2k", tile: 256, levels: 2, dtype: "uint16", window: { center: 500, width: 900 }, orientation_known: true } as const;
// a 1 mm axial stack and a 2 mm one of the same frame, and a sagittal one
const t1: Manifest = { ...base, shape: [64, 128, 128], spacing: [1, 1, 1], orientation: [1, 0, 0, 0, 1, 0], origin: [-64, -64, -32] };
const flair: Manifest = { ...base, shape: [32, 128, 128], spacing: [2, 1, 1], orientation: [1, 0, 0, 0, 1, 0], origin: [-64, -64, -32] };
const sag: Manifest = { ...base, shape: [40, 128, 128], spacing: [2.5, 1, 1], orientation: [0, -1, 0, 0, 0, -1], origin: [-50, 64, 64] };

const part: PartPlace = { anchor: [32, 35, -16], box: [[20, 25, -20], [45, 45, -10]] };

describe("the point's plane on each scan", () => {
  it("is each scan's own plane nearest it, at its own spacing", () => {
    expect(planeOfPoint(t1, [0, 0, -16])).toEqual({ z: 16, inside: true });
    expect(planeOfPoint(flair, [0, 0, -16])).toEqual({ z: 8, inside: true });
    // 2.9 mm on is the nearer of 2 and 4 mm
    expect(planeOfPoint(flair, [0, 0, 2.9]).z).toBe(17);
    // a sagittal stack runs along x from -50 mm by 2.5
    expect(planeOfPoint(sag, [-20, 3, 4]).z).toBe(12);
  });

  it("gives the nearest end for a point outside the scan, and says it is outside", () => {
    expect(planeOfPoint(flair, [0, 0, 80])).toEqual({ z: 31, inside: false });
    expect(planeOfPoint(t1, [0, 0, -40])).toEqual({ z: 0, inside: false });
  });

  it("puts a plane's point on the plane the stack view shows", () => {
    expect(pointOnPlane(flair, 0, 8)[2]).toBe(-16);
    expect(pointOnPlane(t1, 1, 16)[2]).toBe(-16);
  });
});

const cam = (p: "axial" | "coronal" | "sagittal", focal: Vec3 = [0, 0, 0]): Camera => {
  const c = PATIENT_CAMERAS[p];
  return { ...c, focalPoint: focal, position: [focal[0] + c.viewPlaneNormal[0] * 500, focal[1] + c.viewPlaneNormal[1] * 500, focal[2] + c.viewPlaneNormal[2] * 500], parallelScale: 64 };
};

describe("a plane through the point", () => {
  it("moves along its own normal only", () => {
    for (const p of ["axial", "coronal", "sagittal"] as const) {
      const c = cam(p, [1, 2, 3]);
      const moved = throughPoint(c, [10, 20, 30]);
      const n = c.viewPlaneNormal;
      const d = [0, 1, 2].map((i) => moved.focalPoint[i] - c.focalPoint[i]);
      // the move is along the normal: nothing across it
      const along = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
      expect(Math.hypot(d[0] - along * n[0], d[1] - along * n[1], d[2] - along * n[2])).toBeCloseTo(0, 9);
      // and the plane holds the point
      expect([10, 20, 30].reduce((a, v, i) => a + (v - moved.focalPoint[i]) * n[i], 0)).toBeCloseTo(0, 9);
      expect(Math.hypot(...[0, 1, 2].map((i) => moved.position[i] - moved.focalPoint[i]))).toBeCloseTo(500, 9);
    }
  });
});

describe("a part in focus", () => {
  const scale = (w: number, h: number, aspect = 1) => Math.max((h + 2 * FOCUS_MARGIN_MM) / 2, (w + 2 * FOCUS_MARGIN_MM) / (2 * aspect), FOCUS_MIN_MM / (2 * Math.min(1, aspect)));

  it("puts each plane through the anchor, centred on the box, zoomed to it with the margin", () => {
    // axial shows x and y, coronal x and z, sagittal y and z
    const want = { axial: { along: 2, w: 25, h: 20 }, coronal: { along: 1, w: 25, h: 10 }, sagittal: { along: 0, w: 20, h: 10 } } as const;
    for (const p of ["axial", "coronal", "sagittal"] as const) {
      const f = focusCamera(cam(p), part, 1);
      expect(f.focalPoint[want[p].along]).toBeCloseTo(part.anchor[want[p].along], 9);
      for (const a of [0, 1, 2].filter((a) => a !== want[p].along)) expect(f.focalPoint[a]).toBeCloseTo((part.box[0][a] + part.box[1][a]) / 2, 9);
      expect(boxOnScreen(cam(p), part.box)).toEqual({ w: want[p].w, h: want[p].h });
      expect(f.parallelScale).toBeCloseTo(scale(want[p].w, want[p].h), 9);
    }
  });

  it("shows at least 40 mm across a small part, on its narrower side", () => {
    const dot: PartPlace = { anchor: [20, -20, 10], box: [[20, -20, 10], [20, -20, 10]] };
    expect(focusCamera(cam("axial"), dot, 1).parallelScale).toBe(FOCUS_MIN_MM / 2);
    // a view twice as wide as high: its height is the narrower side
    expect(focusCamera(cam("axial"), dot, 2).parallelScale).toBe(FOCUS_MIN_MM / 2);
    // a view twice as high as wide: its width is, and the height doubles
    expect(focusCamera(cam("axial"), dot, 0.5).parallelScale).toBe(FOCUS_MIN_MM);
  });

  it("fits a wide box in a narrow view by its width", () => {
    expect(focusCamera(cam("axial"), part, 0.5).parallelScale).toBeCloseTo(scale(25, 20, 0.5), 9);
    expect(scale(25, 20, 0.5)).toBe(55);
  });

  it("keeps the stack view on the plane of the stack that holds the anchor", () => {
    const on = pointOnPlane(flair, 0, planeOfPoint(flair, part.anchor).z);
    const f = focusCamera(cam("axial", [0, 0, 7]), part, 1, on);
    expect(f.focalPoint[2]).toBe(-16);
    expect(f.position[2] - f.focalPoint[2]).toBeCloseTo(-500, 9);
  });

  it("is read defensively from a door's answer", () => {
    expect(isPartPlace(part)).toBe(true);
    expect(isPartPlace({ anchor: [1, 2], box: part.box })).toBe(false);
    expect(isPartPlace({ anchor: part.anchor, box: [[1, 2, 3]] })).toBe(false);
    expect(isPartPlace(null)).toBe(false);
  });
});
