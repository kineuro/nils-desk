// SPDX-License-Identifier: AGPL-3.0-only
// The gate of orientation (record 45 S2): the manifest's orientation and
// origin read into a geometry, a manifest without them read as axial and
// said so, and the letters at a picture's edges right for axial, coronal,
// sagittal and an oblique stack, on cornerstone's own cameras.
import { describe, expect, it } from "vitest";
import type { Manifest } from "./doors";
import { cameraLabels, conventional, edgeLabels, geometry, letters, levelOrigin, nearestAxis, planePosition, renderAxes, stackLabels, type Vec3 } from "./geometry";

const base: Manifest = { codec: "htj2k", tile: 256, levels: 4, shape: [96, 256, 256], spacing: [1, 1, 1], dtype: "uint16", window: { center: 500, width: 1000 } };

/** The synthetic oblique stack of the bench: rotated 25 degrees about x, then 20 about z. */
function oblique(): { row: Vec3; col: Vec3 } {
  const a = (25 * Math.PI) / 180;
  const b = (20 * Math.PI) / 180;
  const rot = (v: Vec3): Vec3 => {
    const x = [v[0], Math.cos(a) * v[1] - Math.sin(a) * v[2], Math.sin(a) * v[1] + Math.cos(a) * v[2]];
    return [Math.cos(b) * x[0] - Math.sin(b) * x[1], Math.sin(b) * x[0] + Math.cos(b) * x[1], x[2]];
  };
  return { row: rot([1, 0, 0]), col: rot([0, 1, 0]) };
}

describe("the stack's geometry", () => {
  it("reads the orientation and origin the manifest names", () => {
    const g = geometry({ ...base, orientation: [0, 1, 0, 0, 0, -1], origin: [-90, -120, 100], frame: true });
    expect(g.known).toBe(true);
    expect(g.row).toEqual([0, 1, 0]);
    expect(g.col).toEqual([0, 0, -1]);
    // a sagittal stack: row cross column runs to the patient's left
    expect(g.normal).toEqual([-1, 0, 0].map((v) => v || 0));
    expect(g.origin).toEqual([-90, -120, 100]);
  });
  it("reads a manifest from before the engine named orientation as axial, and says it does not know", () => {
    const g = geometry(base);
    expect(g.known).toBe(false);
    expect(g.row).toEqual([1, 0, 0]);
    expect(g.normal).toEqual([0, 0, 1]);
    expect(geometry({ ...base, orientation: [1, 0, 0] }).known).toBe(false);
    expect(geometry({ ...base, orientation: [1, 0, 0, 1, 0, 0] }).known).toBe(false);
    // the engine re-reading an old manifest names the axial it assumes, and says it does not know
    expect(geometry({ ...base, orientation: [1, 0, 0, 0, 1, 0], origin: [0, 0, 0], frame: null, orientation_known: false }).known).toBe(false);
    expect(geometry({ ...base, orientation: [1, 0, 0, 0, 1, 0], orientation_known: true }).known).toBe(true);
  });
  it("hears the frame's word on uneven planes", () => {
    expect(geometry({ ...base, frame: { parallel: true, evenly_spaced: false } }).regular).toBe(false);
    expect(geometry({ ...base, frame: { parallel: false, evenly_spaced: true } }).regular).toBe(false);
    expect(geometry({ ...base, frame: { parallel: true, evenly_spaced: true } }).regular).toBe(true);
    expect(geometry({ ...base, frame: null }).regular).toBe(true);
  });
  it("puts a level's first pixel half a square in and each plane along the normal", () => {
    const g = geometry({ ...base, spacing: [2, 0.5, 0.5], orientation: [1, 0, 0, 0, 1, 0], origin: [0, 0, 0] });
    expect(levelOrigin(g, [2, 0.5, 0.5], 0)).toEqual([0, 0, 0]);
    expect(levelOrigin(g, [2, 0.5, 0.5], 2)).toEqual([0.75, 0.75, 0]);
    expect(planePosition(g, [2, 0.5, 0.5], 0, 10)).toEqual([0, 0, 20]);
  });
});

describe("the letters", () => {
  it("names a direction by the axes it leans along, strongest first, two at most", () => {
    expect(letters([1, 0, 0])).toBe("L");
    expect(letters([0, -1, 0])).toBe("A");
    expect(letters([0, 0, -1])).toBe("I");
    expect(letters([0.9, 0.1, 0])).toBe("L");
    expect(letters([0.7, -0.7, 0.1])).toMatch(/^(LA|AL)$/);
    expect(letters([0.8, 0.5, 0.33])).toBe("LP");
  });
  it("letters cornerstone's axial, coronal and sagittal cameras the radiological way", () => {
    // the cameras cornerstone3D uses for its orientations (constants/mprCameraValues)
    expect(cameraLabels([0, -1, 0], [0, 0, -1])).toEqual({ top: "A", bottom: "P", left: "R", right: "L" });
    expect(cameraLabels([0, 0, 1], [0, -1, 0])).toEqual({ top: "S", bottom: "I", left: "R", right: "L" });
    expect(cameraLabels([0, 0, 1], [1, 0, 0])).toEqual({ top: "S", bottom: "I", left: "A", right: "P" });
  });
  it("letters the stored plane of an oblique stack by what its rows and columns run along", () => {
    const { row, col } = oblique();
    const g = geometry({ ...base, orientation: [...row, ...col] });
    const l = stackLabels(g);
    // rows run mostly to the patient's left and a little posterior; columns mostly posterior, then up
    expect(l.right).toBe("LP");
    expect(l.left).toBe("RA");
    expect(l.bottom).toBe("PS");
    expect(l.top).toBe("AI");
    // the same as a camera looking down the normal would say
    const cam = cameraLabels([-col[0], -col[1], -col[2]], [-g.normal[0], -g.normal[1], -g.normal[2]]);
    expect(cam).toEqual(l);
  });
});

describe("the server's render, turned to read the radiological way", () => {
  const axial = geometry({ ...base, orientation: [1, 0, 0, 0, 1, 0] });
  it("leaves an axial plane as the engine draws it", () => {
    const a = renderAxes(axial, [96, 256, 256], [2, 1, 1], "z");
    const t = conventional(a.right, a.down);
    expect(t.m).toEqual([1, 0, 0, 1]);
    expect(edgeLabels(t.right, t.down)).toEqual({ top: "A", bottom: "P", left: "R", right: "L" });
  });
  it("turns the engine's coronal of an axial stack, whose planes run down from the feet, head up", () => {
    // axis y: a row of every plane, planes running down; the planes rise to the head, so the engine draws the head at the bottom
    const a = renderAxes(axial, [96, 256, 256], [2, 1, 1], "y");
    expect(a).toMatchObject({ w: 256, h: 96, mmW: 1, mmH: 2 });
    const t = conventional(a.right, a.down);
    expect(t.m).toEqual([1, 0, 0, -1]);
    expect(edgeLabels(t.right, t.down)).toEqual({ top: "S", bottom: "I", left: "R", right: "L" });
  });
  it("turns the engine's sagittal of an axial stack to anterior on the left, head up", () => {
    const a = renderAxes(axial, [96, 256, 256], [2, 1, 1], "x");
    const t = conventional(a.right, a.down);
    expect(edgeLabels(t.right, t.down)).toEqual({ top: "S", bottom: "I", left: "A", right: "P" });
  });
  it("turns a sagittal stack's stored plane the same way", () => {
    const sag = geometry({ ...base, orientation: [0, 1, 0, 0, 0, -1] });
    const a = renderAxes(sag, [176, 256, 256], [1, 1, 1], "z");
    const t = conventional(a.right, a.down);
    expect(t.m).toEqual([1, 0, 0, 1]);
    expect(edgeLabels(t.right, t.down)).toEqual({ top: "S", bottom: "I", left: "A", right: "P" });
    // and the server axis that stands in for the patient's axial plane is the one across the columns
    expect(nearestAxis(sag, [0, 0, 1])).toBe("y");
    expect(nearestAxis(sag, [1, 0, 0])).toBe("z");
  });
  it("keeps an oblique plane's mixed letters after the turn", () => {
    const { row, col } = oblique();
    const g = geometry({ ...base, orientation: [...row, ...col] });
    const a = renderAxes(g, [96, 256, 256], [1, 1, 1], "z");
    const t = conventional(a.right, a.down);
    expect(t.m).toEqual([1, 0, 0, 1]);
    expect(edgeLabels(t.right, t.down).right).toBe("LP");
  });
});
