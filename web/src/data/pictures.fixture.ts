// SPDX-License-Identifier: AGPL-3.0-only
// A planes body for the tests, built the way the engine's planes door sends one.

/** A planes body as the door sends it: a u32 length, the JSON index, the frames. */
export function framesBody(frames: { plane: number; bytes: Uint8Array; mime?: string }[], shape: "object" | "array" = "object"): ArrayBuffer {
  let offset = 0;
  const rows = frames.map((f) => {
    const r = { plane: f.plane, offset, length: f.bytes.length, ...(f.mime ? { mime: f.mime } : {}) };
    offset += f.bytes.length;
    return r;
  });
  const index = new TextEncoder().encode(JSON.stringify(shape === "array" ? rows : { mime: "image/webp", frames: rows }));
  const out = new Uint8Array(4 + index.length + offset);
  new DataView(out.buffer).setUint32(0, index.length, true);
  out.set(index, 4);
  let at = 4 + index.length;
  for (const f of frames) {
    out.set(f.bytes, at);
    at += f.bytes.length;
  }
  return out.buffer;
}
