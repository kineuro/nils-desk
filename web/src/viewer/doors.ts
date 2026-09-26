// SPDX-License-Identifier: AGPL-3.0-only
// The gated instance doors (Wave 5 section 12.7, shaped by the viewer study):
// the manifest of a stack's viewing pyramid, one plane's tiles in one
// response, a slab of planes, and the server's render of one plane. This is
// the one file that knows the wire; the loader speaks in planes.

import { DoorError } from "../ask/client";

export interface Manifest {
  codec: "htj2k" | "j2k";
  tile: number;
  levels: number;
  /** [nz, ny, nx] at level 0. */
  shape: [number, number, number];
  /** [dz, dy, dx] in mm at level 0. */
  spacing: [number, number, number];
  dtype: "uint16" | "int16" | "uint8";
  window: { percentiles?: Record<string, number>; center: number; width: number };
  bytes_per_level?: number[];
  annotation?: { burned_in: boolean; where?: string | null };
  built_at?: string;
  pack_version?: string;
  /** Planes per slab the door answers at most; 32 by the study. */
  slab?: number;
  /** The engine's own shapes per level, when it names them (A6): [nz, ny, nx] and the tile grid. */
  level_shapes?: { level: number; shape: [number, number, number]; tiles: [number, number]; bytes?: number }[];
  /**
   * A stored value is the modality's as stored * slope + intercept (record 45
   * E2, the file's rescale with a signed volume's shift folded in); the window
   * is in the modality's values. A manifest from before has no slope, which
   * reads as one, and its intercept is the shift alone.
   */
  intercept?: number;
  slope?: number;
  /** The files did not share one rescale; the first file's is the manifest's. */
  rescale_varies?: boolean;
  /** Burned-in annotation held below the operator role: the tiles refuse and the render blanks the band. */
  held?: boolean;
  stack?: number;
  /** Record 45 E2: the six direction cosines of a row and a column (DICOM's orientation); absent before, read as axial. */
  orientation?: number[] | null;
  /** Record 45 E2: false when the files did not say, and `orientation` is the axial the engine reads it as. */
  orientation_known?: boolean;
  /** Record 45 E2: the first plane's first pixel in the patient, mm; the planes run along row cross column. */
  origin?: number[] | null;
  /** Record 45 E2: whether the planes are parallel and evenly spaced; null in a manifest from before. */
  frame?: boolean | { parallel?: boolean; evenly_spaced?: boolean } | null;
  /** Record 45 E2: the patient plane nearest the stack's, and whether the stack is oblique to it. */
  plane?: string;
  oblique?: boolean;
  /**
   * The mean step from one plane to the next in the patient, mm, from the
   * planes' positions: along the normal by spacing[0] for most stacks, with
   * a part in the plane where the acquisition was sheared (a tilted gantry,
   * a slab whose planes shift as they go). Absent before, read as along the
   * normal.
   */
  step?: number[] | null;
}

/** A modality value as the planes store it: the manifest's value is stored * slope + intercept (record 45 E2). */
export function storedValue(m: Pick<Manifest, "slope" | "intercept">, v: number): number {
  const slope = m.slope !== undefined && m.slope !== 0 ? m.slope : 1;
  return (v - (m.intercept ?? 0)) / slope;
}

/** The window as stored values: the manifest names it in the modality's values; a width below one is one, as the render door has it. */
export function storedWindow(m: Manifest): { lower: number; upper: number } {
  const width = Number.isFinite(m.window.width) ? Math.max(1, m.window.width) : 1;
  const a = storedValue(m, m.window.center - width / 2);
  const b = storedValue(m, m.window.center + width / 2);
  return { lower: Math.min(a, b), upper: Math.max(a, b) };
}

/**
 * What the viewer sets on a viewport: the window in the stored values the
 * planes hold, and the grey inverted where the rescale's slope is negative,
 * since a higher stored value is then a lower value of the modality. The
 * planes stay the stored values, so the stack and the three planes' volume
 * read them alike.
 */
export function viewWindow(m: Manifest): { voiRange: { lower: number; upper: number }; invert: boolean } {
  return { voiRange: storedWindow(m), invert: (m.slope ?? 1) < 0 };
}

const H = { "X-Nils-Desk": "1" };

/** The shape of a level: every level halves in plane, never in depth (the slab is scrolled at full depth). */
export function levelShape(m: Manifest, level: number): [number, number, number] {
  const named = m.level_shapes?.find((l) => l.level === level);
  if (named) return named.shape;
  const f = 2 ** level;
  return [m.shape[0], Math.ceil(m.shape[1] / f), Math.ceil(m.shape[2] / f)];
}

export function levelSpacing(m: Manifest, level: number): [number, number, number] {
  const f = 2 ** level;
  return [m.spacing[0], m.spacing[1] * f, m.spacing[2] * f];
}

async function fail(r: Response): Promise<never> {
  const body = await r.json().catch(() => ({ error: `the engine answered ${r.status}` }));
  throw new DoorError(r.status, body as Record<string, unknown>);
}

/** One container as the door packs it: [u32 count][u32 offset...][parts...], little endian, each offset from the start of the container. */
export function unpackTiles(buf: ArrayBuffer, at = 0, end = buf.byteLength): Uint8Array[] {
  const view = new DataView(buf, at, end - at);
  const count = view.getUint32(0, true);
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(view.getUint32(4 + i * 4, true));
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const a = at + offsets[i];
    const b = i + 1 < count ? at + offsets[i + 1] : end;
    out.push(new Uint8Array(buf, a, b - a));
  }
  return out;
}

/** A slab: the same container one level up, each part a plane's own container of tiles. */
export function unpackSlab(buf: ArrayBuffer): Uint8Array[][] {
  return unpackTiles(buf).map((plane) => unpackTiles(buf, plane.byteOffset, plane.byteOffset + plane.byteLength));
}

export const doors = {
  manifest: async (stack: number): Promise<Manifest> => {
    const r = await fetch(`/api/instances/${stack}/manifest`, { headers: H });
    if (!r.ok) await fail(r);
    return (await r.json()) as Manifest;
  },
  /** One plane's tiles in one round trip; the codec comes back in a header. */
  plane: async (stack: number, level: number, z: number, signal?: AbortSignal): Promise<{ tiles: Uint8Array[]; codec: string; bytes: number }> => {
    const r = await fetch(`/api/instances/${stack}/tiles/${level}/${z}`, { headers: H, signal });
    if (!r.ok) await fail(r);
    const buf = await r.arrayBuffer();
    return { tiles: unpackTiles(buf), codec: r.headers.get("X-Nils-Codec") ?? "", bytes: buf.byteLength };
  },
  /** Up to 32 planes (z1 exclusive), each plane's tiles in row-major order of its grid. */
  slab: async (stack: number, level: number, z0: number, z1: number, signal?: AbortSignal): Promise<{ planes: Uint8Array[][]; codec: string; bytes: number }> => {
    const r = await fetch(`/api/instances/${stack}/slab/${level}/${z0}-${z1}`, { headers: H, signal });
    if (!r.ok) await fail(r);
    const buf = await r.arrayBuffer();
    return { planes: unpackSlab(buf), codec: r.headers.get("X-Nils-Codec") ?? "", bytes: buf.byteLength };
  },
  /** The server's render of one plane with window and level applied, as an image URL; the first picture, the thin client's, the gated case's. */
  renderUrl: (stack: number, level: number, z: number, w: number, c: number, axis: "z" | "y" | "x" = "z"): string =>
    `/api/instances/${stack}/render/${level}/${z}?w=${encodeURIComponent(String(Math.round(w)))}&c=${encodeURIComponent(String(Math.round(c)))}&axis=${axis}`,
};
