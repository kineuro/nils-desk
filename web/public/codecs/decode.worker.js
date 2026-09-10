// SPDX-License-Identifier: AGPL-3.0-only
// The decode worker (Wave 5 section 8.2, from the viewer study): the HTJ2K
// and JPEG 2000 WASM decoders run here, one plane of tiles per message, so
// the main thread only uploads the texture. The decoders are served from
// the desk's own origin, never a third party.
/* global importScripts, Module, OpenJPEGWASM */
let htj2k = null;
let j2k = null;

async function decoder(codec) {
  if (codec === "htj2k") {
    if (!htj2k) {
      importScripts("/codecs/openjphjs.js");
      const mod = await Module({ locateFile: (f) => `/codecs/${f}` });
      htj2k = new mod.HTJ2KDecoder();
    }
    return htj2k;
  }
  if (!j2k) {
    importScripts("/codecs/openjpegwasm_decode.js");
    const mod = await OpenJPEGWASM({ locateFile: (f) => `/codecs/${f}` });
    j2k = new mod.J2KDecoder();
  }
  return j2k;
}

self.onmessage = async (e) => {
  const { id, codec, tiles, nx, ny, tile } = e.data;
  try {
    const dec = await decoder(codec);
    const tx = Math.ceil(nx / tile);
    const plane = new Uint16Array(nx * ny);
    const t0 = performance.now();
    for (let i = 0; i < tiles.length; i++) {
      const bytes = tiles[i];
      const enc = dec.getEncodedBuffer(bytes.byteLength);
      enc.set(bytes);
      dec.decode();
      const info = dec.getFrameInfo();
      const out = dec.getDecodedBuffer();
      const tw = info.width;
      const th = info.height;
      const pixels = info.bitsPerSample > 8 ? new Uint16Array(out.buffer, out.byteOffset, tw * th) : Uint16Array.from(out.subarray(0, tw * th));
      const ty0 = Math.floor(i / tx) * tile;
      const tx0 = (i % tx) * tile;
      const w = Math.min(tw, nx - tx0);
      const h = Math.min(th, ny - ty0);
      for (let y = 0; y < h; y++) plane.set(pixels.subarray(y * tw, y * tw + w), (ty0 + y) * nx + tx0);
    }
    self.postMessage({ id, plane, ms: performance.now() - t0 }, [plane.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
