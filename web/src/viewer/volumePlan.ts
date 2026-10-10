// SPDX-License-Identifier: AGPL-3.0-only
// Whether a stack's three planes can be a volume in this browser, and at which
// level: kept apart from volume.ts so a page that only plans (the readers'
// warmer) does not load cornerstone with its first bundle.

import type { Manifest } from "./doors";
import { volumeLevel, VOLUME_BUDGET, type VolumePlan } from "./ring";

let max3d: number | null = null;

/**
 * The largest 3D texture this browser's WebGL2 takes; 0 when it has no
 * WebGL2. Asked once per page: making a WebGL context to ask and losing it
 * again costs the thread tens of milliseconds, which the reader paid on
 * every stack before its pictures were drawn.
 */
export function max3dTexture(): number {
  max3d ??= askMax3d();
  return max3d;
}

function askMax3d(): number {
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
