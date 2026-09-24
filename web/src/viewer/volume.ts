// SPDX-License-Identifier: AGPL-3.0-only
// MPR in the browser (record 45 S2, study A3; record 20 section 7): a
// cornerstone3D volume at one pyramid level, filled from the slab door slab
// by slab from the current plane outwards, so a coronal line fills as the
// bytes land. The level rule: the finest level whose volume fits the budget
// (256 MB of texture by default) and the card's largest 3D texture. A stack
// deeper than that texture (2048 planes on most cards) is held at every
// second (third...) plane, which the view says in a note and the footer
// counts; the stack view keeps every plane (ruled 2026-09-24). What does not
// fit is the server's render, never a partial volume passed off as whole.

import * as cs from "@cornerstonejs/core";
import { doors, levelShape, levelSpacing, type Manifest } from "./doors";
import { geometry, levelOrigin } from "./geometry";
import { counters, decoder, storedWindow } from "./loader";
import { SLAB, fillOrder, volumeLevel, VOLUME_BUDGET, type VolumePlan } from "./ring";

export { fillOrder, volumeLevel, VOLUME_BUDGET, type VolumePlan } from "./ring";

let schemed = false;
/** The volume's planes are made in memory and cached; cornerstone asking for one by id gets it from the cache. */
function scheme(): void {
  if (schemed) return;
  schemed = true;
  cs.imageLoader.registerImageLoader("nilsvol", (id: string) => {
    const image = cs.cache.getImage(id);
    return { promise: image ? Promise.resolve(image) : Promise.reject(new Error(`${id} is not in the cache`)) } as cs.Types.IImageLoadObject;
  });
}

/** The largest 3D texture this browser's WebGL2 takes; 0 when it has no WebGL2. */
export function max3dTexture(): number {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return 0;
    const n = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return n;
  } catch {
    return 0;
  }
}

/** Why the volume path is not taken, or null when it is: no WebGL2, or no level that fits. */
export function volumePath(m: Manifest, budget = VOLUME_BUDGET, max3d = max3dTexture()): { plan: VolumePlan } | { why: string } {
  if (max3d <= 0) return { why: "this browser has no WebGL2" };
  // the heap the browser allows, when it says: the volume takes at most half of what is left
  const mem = (performance as unknown as { memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number } }).memory;
  const room = mem ? Math.max(0, (mem.jsHeapSizeLimit - mem.usedJSHeapSize) / 2) : budget;
  const plan = volumeLevel(m, Math.min(budget, room), max3d);
  return plan ? { plan } : { why: "the stack is larger than the planes' budget" };
}

export interface Filling {
  volumeId: string;
  plan: VolumePlan;
  /** Planes of the volume filled so far. */
  filled: number;
  done: boolean;
  /** Stop fetching and let the volume go. */
  close: () => void;
  /** Resolves when every plane is in. */
  ready: Promise<void>;
}

/**
 * Make the volume and fill it from the slab door, `at` (a plane of the level)
 * first. `onPlanes` is called as planes land, at most once a frame, so the
 * viewports render the new planes.
 */
export function fillVolume(stack: number, m: Manifest, plan: VolumePlan, at: number, onPlanes: (filled: number) => void, inflight = 3): Filling {
  scheme();
  const { level, stride, dims } = plan;
  const [nx, ny, depth] = dims;
  const [nz] = levelShape(m, level);
  const [dz, dy, dx] = levelSpacing(m, level);
  const g = geometry(m);
  const volumeId = `nilsvol:${stack}/${level}/${stride}`;
  const cached = cs.cache.getVolume(volumeId);
  const need = plan.bytes + 64 * 1024 * 1024;
  if (!cached && cs.cache.getBytesAvailable() < need) cs.cache.setMaxCacheSize(cs.cache.getCacheSize() + need + 256 * 1024 * 1024);
  const scalarData = cached ? null : new Uint16Array(nx * ny * depth);
  const win = storedWindow(m);
  const volume = (cached ??
    cs.volumeLoader.createLocalVolume(volumeId, {
      scalarData: scalarData!,
      dimensions: [nx, ny, depth],
      spacing: [dx, dy, dz * stride],
      origin: levelOrigin(g, m.spacing, level),
      direction: [...g.row, ...g.col, ...g.normal] as cs.Types.Mat3,
      metadata: {
        BitsAllocated: 16,
        BitsStored: 16,
        HighBit: 15,
        SamplesPerPixel: 1,
        PixelRepresentation: 0,
        PhotometricInterpretation: "MONOCHROME2",
        Modality: "OT",
        FrameOfReferenceUID: `nils-${stack}`,
        ImageOrientationPatient: [...g.row, ...g.col],
        PixelSpacing: [dy, dx],
        Rows: ny,
        Columns: nx,
        voiLut: [{ windowCenter: (win.lower + win.upper) / 2, windowWidth: win.upper - win.lower }],
        VOILUTFunction: "LINEAR",
      } as unknown as cs.Types.Metadata,
    })) as cs.Types.IImageVolume;
  const data = scalarData ?? (volume.voxelManager as unknown as { getCompleteScalarDataArray?: () => Uint16Array }).getCompleteScalarDataArray?.() ?? null;
  const state: Filling = { volumeId, plan, filled: cached ? depth : 0, done: !!cached, close: () => undefined, ready: Promise.resolve() };
  if (cached || !data) return state;

  const abort = new AbortController();
  let closed = false;
  let frame = 0;
  const tell = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!closed) onPlanes(state.filled);
    });
  };
  const texture = (volume as unknown as { vtkOpenGLTexture: { setUpdatedFrame: (i: number) => void } }).vtkOpenGLTexture;
  const pool = decoder();
  const slabs = Math.ceil(nz / SLAB);
  const order = fillOrder(slabs, Math.floor((at * stride) / SLAB));

  async function one(slab: number): Promise<void> {
    const z0 = slab * SLAB;
    const z1 = Math.min(nz, z0 + SLAB);
    const r = await doors.slab(stack, level, z0, z1, abort.signal);
    counters.bytes += r.bytes;
    counters.fetches += 1;
    const jobs: Promise<void>[] = [];
    for (let z = z0; z < z1; z++) {
      if (z % stride !== 0) continue;
      const k = z / stride;
      jobs.push(
        pool.decode(m.codec, r.planes[z - z0], nx, ny, m.tile).then(({ plane, ms }) => {
          if (closed) return;
          counters.planesDecoded += 1;
          counters.decodeMs += ms;
          data!.set(plane, k * nx * ny);
          texture.setUpdatedFrame(k);
          state.filled += 1;
          tell();
        }),
      );
    }
    await Promise.all(jobs);
  }

  state.ready = (async () => {
    let next = 0;
    const lane = async () => {
      while (!closed && next < order.length) await one(order[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(inflight, order.length) }, lane));
    if (!closed) {
      state.done = true;
      onPlanes(state.filled);
    }
  })();
  state.ready.catch(() => undefined);
  state.close = () => {
    closed = true;
    abort.abort();
    if (frame) cancelAnimationFrame(frame);
  };
  return state;
}

/** Let a volume go: the volume and the planes cornerstone made for it. */
export function dropVolume(volumeId: string): void {
  const v = cs.cache.getVolume(volumeId);
  if (!v) return;
  const ids = [...v.imageIds];
  try {
    cs.cache.removeVolumeLoadObject(volumeId);
  } catch {
    // already gone
  }
  for (const id of ids) {
    try {
      if (cs.cache.getImageLoadObject(id) || cs.cache.getImage(id)) cs.cache.removeImageLoadObject(id, { force: true });
    } catch {
      // already gone
    }
  }
}
