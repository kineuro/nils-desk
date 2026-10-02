// SPDX-License-Identifier: AGPL-3.0-only
// The views a stack is read in, apart from the viewer so a page can name
// and keep them without loading cornerstone: the stack in its own planes,
// the three planes, or one of them alone (the reader, 2026-10-02: "see
// everything in axial only, and keep it").

import { cutsAcross, type Manifest } from "./doors";
import { geometry, type Planes, type Vec3 } from "./geometry";
import { PLANES, type Plane } from "./prefetch";

/** What the viewer shows: the stack in its own planes, the three planes, or one of them alone. */
export type ViewMode = "stack" | "planes" | Plane;
export const VIEW_MODES: readonly ViewMode[] = ["stack", "planes", "axial", "coronal", "sagittal"];
export const isViewMode = (v: unknown): v is ViewMode => typeof v === "string" && (VIEW_MODES as readonly string[]).includes(v);

/** Whether a stack lies off the scanner's axes: a row, a column or the normal more than about a degree from every axis. */
export function isOblique(g: { row: Vec3; col: Vec3; normal: Vec3; known: boolean }): boolean {
  return g.known && [g.row, g.col, g.normal].some((v) => Math.max(...v.map(Math.abs)) < 0.9998);
}

/**
 * How a view is drawn for a stack: the stack's own viewport or the
 * volume's planes, and the plane enlarged. One plane alone is the stack's
 * viewport where it is the plane the stack was acquired in (and the planes
 * are cut in the stack's own, or the stack lies square to the scanner), so
 * every plane of the stack is read at its own resolution; otherwise it is
 * that plane of the volume. A stack of one plane has nothing to cut across
 * and is always its own. Before the manifest is read, a plane is the
 * volume's.
 */
export function drawnAs(mode: ViewMode, m: Manifest | null, cut: Planes = "acquisition"): { view: "stack" | "planes"; big: Plane | null } {
  if (mode === "stack") return { view: "stack", big: null };
  if (m && !cutsAcross(m)) return { view: "stack", big: null };
  if (mode === "planes") return { view: "planes", big: null };
  if (!m) return { view: "planes", big: mode };
  const own = PLANES.find((p) => p === m.plane) ?? "axial";
  if (mode === own && (cut === "acquisition" || !isOblique(geometry(m)))) return { view: "stack", big: null };
  return { view: "planes", big: mode };
}

/** Whether a view draws from the volume for this stack (the three planes, or a plane that is not the stack's own). */
export function needsVolume(mode: ViewMode, m: Manifest | null, cut: Planes = "acquisition"): boolean {
  return drawnAs(mode, m, cut).view === "planes";
}
