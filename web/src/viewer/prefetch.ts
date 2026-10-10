// SPDX-License-Identifier: AGPL-3.0-only
// The pictures ready before they are asked for (record 48 R1): a stack's
// manifest and the server's render of the middle plane in each of the three
// planes, the first thing the viewer's planes show, fetched ahead so the
// browser's cache holds them (the engine sends them private, for an hour).
// The viewer takes its first planes' addresses from here, so the warmed ones
// are the ones it asks for. No cornerstone here: the reader's page loads this
// without the viewer's weight.

import { doors, levelShape, levelSpacing, type Manifest } from "./doors";
import { geometry, nearestAxis, renderAxes, type Axis, type Geometry, type Vec3 } from "./geometry";
import { tileManifest } from "./tiles";

export type Plane = "axial" | "coronal" | "sagittal";
export const PLANES: Plane[] = ["axial", "coronal", "sagittal"];

/** The patient plane's normal, for the server axis that stands in for it. */
export const NORMAL: Record<Plane, Vec3> = { axial: [0, 0, 1], coronal: [0, 1, 0], sagittal: [1, 0, 0] };

/** The level the server's planes are drawn at. */
export const serverLevel = (m: Manifest) => Math.min(m.levels - 1, 2);

/** One of the three planes from the server's render door, at a position between 0 and 1: its address and how it is laid out. */
export function serverPlane(stack: number, m: Manifest, g: Geometry, p: Plane, pos: number) {
  const level = serverLevel(m);
  const shape = levelShape(m, level);
  const axis: Axis = nearestAxis(g, NORMAL[p]);
  const axes = renderAxes(g, shape, levelSpacing(m, level), axis);
  const along = axis === "z" ? shape[0] : axis === "y" ? shape[1] : shape[2];
  const index = Math.round(pos * (along - 1));
  return { src: doors.renderUrl(stack, level, index, m.window.width, m.window.center, axis), axes, known: g.known };
}

/** The addresses the planes view shows first: each plane's middle. */
export function firstPlanes(stack: number, m: Manifest): string[] {
  const g = geometry(m);
  return PLANES.map((p) => serverPlane(stack, m, g, p, 0.5).src);
}

/** Load an image into the browser's cache; settles either way, and at once when aborted. */
export function load(src: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  if (typeof Image === "undefined") return fetch(src, { signal }).then(() => undefined, () => undefined);
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    // an empty source cancels the request the image made
    const abort = () => {
      img.onload = img.onerror = null;
      img.src = "";
      resolve();
    };
    signal?.addEventListener("abort", abort, { once: true });
    img.decoding = "async";
    img.onload = done;
    img.onerror = done;
    img.src = src;
  });
}

/** Warm one stack: its manifest, then its three first planes; an abort stops it between the two and cancels the planes. */
export async function warmStack(stack: number, signal?: AbortSignal): Promise<number> {
  const m = await tileManifest(stack, undefined, signal).catch((e: unknown) => {
    if (signal?.aborted) return null;
    throw e;
  });
  if (m === null || signal?.aborted) return 0;
  const planes = firstPlanes(stack, m);
  await Promise.all(planes.map((src) => load(src, signal)));
  return signal?.aborted ? 0 : planes.length;
}
