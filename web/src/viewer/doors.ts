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
}

const H = { "X-Nils-Desk": "1" };

/** The shape of a level: every level halves in plane, never in depth (the slab is scrolled at full depth). */
export function levelShape(m: Manifest, level: number): [number, number, number] {
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

/** The tiles of one or more planes, as the door packs them: [u32 count][u32 offsets...][tiles...]. */
export function unpackTiles(buf: ArrayBuffer): Uint8Array[] {
  const view = new DataView(buf);
  const count = view.getUint32(0, true);
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(view.getUint32(4 + i * 4, true));
  const start = 4 + count * 4;
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const a = start + offsets[i];
    const b = i + 1 < count ? start + offsets[i + 1] : buf.byteLength;
    out.push(new Uint8Array(buf, a, b - a));
  }
  return out;
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
  /** Up to 32 planes, tiles in plane order; the door says how many tiles a plane has through the manifest. */
  slab: async (stack: number, level: number, z0: number, z1: number, signal?: AbortSignal): Promise<{ tiles: Uint8Array[]; codec: string; bytes: number }> => {
    const r = await fetch(`/api/instances/${stack}/slab/${level}/${z0}-${z1}`, { headers: H, signal });
    if (!r.ok) await fail(r);
    const buf = await r.arrayBuffer();
    return { tiles: unpackTiles(buf), codec: r.headers.get("X-Nils-Codec") ?? "", bytes: buf.byteLength };
  },
  /** The server's render of one plane with window and level applied, as an image URL; the first picture, the thin client's, the gated case's. */
  renderUrl: (stack: number, level: number, z: number, w: number, c: number, axis: "z" | "y" | "x" = "z"): string =>
    `/api/instances/${stack}/render/${level}/${z}?w=${encodeURIComponent(String(Math.round(w)))}&c=${encodeURIComponent(String(Math.round(c)))}&axis=${axis}`,
};
