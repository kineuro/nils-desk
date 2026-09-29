// SPDX-License-Identifier: AGPL-3.0-only
// Jumps to the places contrast shows first (the post-contrast study,
// anchored reading): the choroid plexus in the lateral ventricles' atria,
// the superior sagittal sinus, the transverse sinuses and the sella with the
// pituitary. There is no segmentation in the desk, so each place is
// estimated from the head's extent in the patient (viewer/reference.ts) by
// fixed fractions of an adult head, measured down from the vertex in units
// of the head's front-to-back length, which a brain scan nearly always
// covers whole while its lower end varies. The page says they are
// approximate: they put the reader near the place, and the reader pages
// from there.
//
// Patient axes are DICOM's: x to the patient's left, y to the back, z up.

import { dot, geometry, type Vec3 } from "../viewer/geometry";
import type { Manifest } from "../viewer/doors";
import type { Extent } from "../viewer/reference";

export interface Region {
  id: "ventricles" | "superior_sagittal" | "transverse" | "sella";
  /** The button's words. */
  label: string;
  /** What it is for, on the button's title. */
  title: string;
  /** The key, 7 to 0. */
  key: string;
  /** The place as fractions: across (of the width, from the middle, to the left), back (of the length, from the middle), down (of the length, from the vertex). */
  across: number;
  back: number;
  down: number;
}

export const REGIONS: Region[] = [
  { id: "ventricles", label: "ventricles", title: "the lateral ventricles' atria, where the choroid plexus enhances (approximate)", key: "7", across: 0.12, back: 0.08, down: 0.33 },
  { id: "superior_sagittal", label: "sagittal sinus", title: "the superior sagittal sinus, high and at the back of the midline (approximate)", key: "8", across: 0, back: 0.3, down: 0.15 },
  { id: "transverse", label: "transverse sinus", title: "the transverse sinuses, low at the back (approximate)", key: "9", across: 0.3, back: 0.4, down: 0.55 },
  { id: "sella", label: "sella", title: "the sella and the pituitary, in the midline at the skull base (approximate)", key: "0", across: 0, back: -0.03, down: 0.5 },
];

/** A region's point in the patient from the head's extent. */
export function regionPoint(r: Region, e: Extent): Vec3 {
  const width = e.hi[0] - e.lo[0];
  const length = e.hi[1] - e.lo[1];
  const cx = (e.lo[0] + e.hi[0]) / 2;
  const cy = (e.lo[1] + e.hi[1]) / 2;
  return [cx + r.across * width, cy + r.back * length, e.hi[2] - r.down * length];
}

/**
 * The plane of a stack nearest a point, along the stack's normal, and
 * whether the point lies within the stack (within half a plane of its
 * ends). Null where the manifest names no place.
 */
export function planeAt(m: Manifest, p: Vec3): { z: number; inside: boolean } | null {
  const g = geometry(m);
  if (!g.known || !Array.isArray(m.origin)) return null;
  const nz = m.shape?.[0] ?? 0;
  if (nz < 1) return null;
  const along = dot(g.step, g.normal);
  if (Math.abs(along) < 1e-6) return null;
  const k = dot([p[0] - g.origin[0], p[1] - g.origin[1], p[2] - g.origin[2]], g.normal) / along;
  const z = Math.min(nz - 1, Math.max(0, Math.round(k)));
  return { z, inside: k >= -0.5 && k <= nz - 0.5 };
}
