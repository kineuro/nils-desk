// SPDX-License-Identifier: AGPL-3.0-only
// The layout check's stand-in for the viewer's decode worker (mask.pw.ts):
// the fake engine of test/layout/mask.tsx packs each tile as raw values, a
// u32 width and a u32 height, then width by height little endian u16, so the
// real viewer, its slab cache and its labelmaps run in the browser with no
// codec. The desk serves the real worker from web/public/codecs.
self.onmessage = (e) => {
  const { id, tiles, nx, ny, tile } = e.data;
  try {
    const t0 = performance.now();
    const tx = Math.ceil(nx / tile);
    const plane = new Uint16Array(nx * ny);
    for (let i = 0; i < tiles.length; i++) {
      const b = tiles[i];
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const tw = v.getUint32(0, true);
      const th = v.getUint32(4, true);
      const ty0 = Math.floor(i / tx) * tile;
      const tx0 = (i % tx) * tile;
      for (let y = 0; y < th && ty0 + y < ny; y++)
        for (let x = 0; x < tw && tx0 + x < nx; x++) plane[(ty0 + y) * nx + tx0 + x] = v.getUint16(8 + (y * tw + x) * 2, true);
    }
    self.postMessage({ id, plane, ms: performance.now() - t0 }, [plane.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
