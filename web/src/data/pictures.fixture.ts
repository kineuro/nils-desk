// SPDX-License-Identifier: AGPL-3.0-only
// A planes body and a preview for the tests, built the way the engine's doors send them.

/**
 * A planes body as the door sends it (`application/x-nils-frames`): u32
 * from, u32 count, u32 width, u32 height, count + 1 u32 offsets from the
 * body's start, then the frames back to back. The frames are planes from
 * the first one's on, one after another.
 */
export function framesBody(frames: { plane: number; bytes: Uint8Array }[], width = 64, height = 64): ArrayBuffer {
  const count = frames.length;
  const lead = 16 + 4 * (count + 1);
  const size = frames.reduce((n, f) => n + f.bytes.length, 0);
  const out = new Uint8Array(lead + size);
  const v = new DataView(out.buffer);
  v.setUint32(0, frames[0]?.plane ?? 0, true);
  v.setUint32(4, count, true);
  v.setUint32(8, width, true);
  v.setUint32(12, height, true);
  let at = lead;
  frames.forEach((f, i) => {
    v.setUint32(16 + 4 * i, at, true);
    out.set(f.bytes, at);
    at += f.bytes.length;
  });
  v.setUint32(16 + 4 * count, at, true);
  return out.buffer;
}

/** A preview door's answer: the header, the middle planes as data URLs, and the frames. */
export function previewBody(planes: number, middle: Partial<Record<"axial" | "coronal" | "sagittal", string>>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stack: 1,
    digest: null,
    shape: [planes, 64, 64],
    spacing: [1, 1, 1],
    plane: "axial",
    window: { percentiles: [1, 99], center: 300, width: 600 },
    held: false,
    middle: Object.fromEntries(Object.entries(middle).map(([k, data]) => [k, { width: 64, height: 64, bytes: 10, data }])),
    frames: { count: planes, width: 64, height: 64, bytes: planes * 10, url: `/api/instances/1/preview/planes?from=0&to=${planes}` },
    ...extra,
  };
}
