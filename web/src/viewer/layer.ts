// SPDX-License-Identifier: AGPL-3.0-only
// A result's layer on a scan (record 55 H3, job type 3, slice D1): the
// engine's label pyramid of a mask, with exactly the shape, levels and
// planes of the scan's picture pyramid, so the viewer draws it with the
// code that draws the pictures and never resamples anything here. Its doors
// answer as the instance doors do (`GET /api/derivatives/{id}/layers/
// {stack}/{set}/manifest`, `tiles/{level}/{z}`, `slab/{level}/{z0}-{z1}`):
// 202 with the job while it is built, 422 once that build failed. This file
// knows that wire; the slabs are kept with the pictures' (slabs.ts), and
// what each layer waits for is kept here, apart from the pictures' own
// state, so a mask being built never reads as a picture being built.

import { useSyncExternalStore } from "react";
import { DoorError } from "../ask/client";
import { BUILD_LIMIT_MS, NotBuilt, pictureAnswer, Preparing, retryPause, type Building } from "./building";
import { unpackSlab, unpackTiles, type Manifest } from "./doors";

/** Which result's layer, in which of its part sets, on the scan the viewer shows. */
export interface LayerRef {
  derivative: number;
  set: string;
}

/** The layer's manifest, as the engine answers it (E1, `LayerManifest`). */
export interface LayerManifest {
  stack: number;
  derivative: number;
  sha256?: string;
  set: string;
  /** components, labels or whole. */
  kind: string;
  /** What a voxel holds: a part's number, a label's value, or 1 for a whole mask. */
  values: string;
  /** same or world: world says the mask was placed by the scanner's position. */
  link: string;
  codec: string;
  tile: number;
  levels: number;
  /** [nz, ny, nx] at level 0: the scan's. */
  shape: [number, number, number];
  level_shapes?: Manifest["level_shapes"];
  dtype: string;
  voxels?: number;
  scan_built_at?: string;
  built_at?: string;
  grid_stack?: number;
}

/** One key per result, set and scan: the slabs, the states and the labelmaps are named by it. */
export function layerKey(stack: number, ref: LayerRef): string {
  return `${ref.derivative}/${ref.set}/${stack}`;
}

const H = { "X-Nils-Desk": "1" };

function base(stack: number, ref: LayerRef): string {
  return `/api/derivatives/${ref.derivative}/layers/${stack}/${encodeURIComponent(ref.set)}`;
}

async function fail(r: Response): Promise<never> {
  const body = await r.json().catch(() => ({ error: `the engine answered ${r.status}` }));
  throw new DoorError(r.status, body as Record<string, unknown>);
}

/** Whether a layer fits its scan's picture: the same planes and plane size, level by level. */
export function fitsScan(layer: Pick<LayerManifest, "shape" | "levels">, scan: Pick<Manifest, "shape" | "levels">): boolean {
  return layer.shape.length === 3 && layer.shape.every((n, i) => n === scan.shape[i]) && layer.levels === scan.levels;
}

export const layerDoors = {
  /** The manifest asked once: 202 throws `Preparing`, 422 `NotBuilt` (building.ts). */
  manifestOnce: async (stack: number, ref: LayerRef): Promise<LayerManifest> => {
    const r = await fetch(`${base(stack, ref)}/manifest`, { headers: H });
    await pictureAnswer(r, stack);
    if (!r.ok) await fail(r);
    return (await r.json()) as LayerManifest;
  },
  /** One plane's tiles in one round trip. */
  plane: async (stack: number, ref: LayerRef, level: number, z: number, signal?: AbortSignal): Promise<{ tiles: Uint8Array[]; codec: string; bytes: number }> => {
    const r = await fetch(`${base(stack, ref)}/tiles/${level}/${z}`, { headers: H, signal });
    await pictureAnswer(r, stack);
    if (!r.ok) await fail(r);
    const buf = await r.arrayBuffer();
    return { tiles: unpackTiles(buf), codec: r.headers.get("X-Nils-Codec") ?? "", bytes: buf.byteLength };
  },
  /** Up to 32 planes (z1 exclusive), as the instance slab door packs them. */
  slab: async (stack: number, ref: LayerRef, level: number, z0: number, z1: number, signal?: AbortSignal): Promise<{ planes: Uint8Array[][]; codec: string; bytes: number }> => {
    const r = await fetch(`${base(stack, ref)}/slab/${level}/${z0}-${z1}`, { headers: H, signal });
    await pictureAnswer(r, stack);
    if (!r.ok) await fail(r);
    const buf = await r.arrayBuffer();
    return { planes: unpackSlab(buf), codec: r.headers.get("X-Nils-Codec") ?? "", bytes: buf.byteLength };
  },
};

/** What a layer waits for: its build (or the scan's picture's, which goes first), or a build that failed. */
export type LayerState = { kind: "building"; building: Building } | { kind: "failed"; reason: string } | { kind: "refused"; why: string };

const states = new Map<string, LayerState>();
const subs = new Set<() => void>();
const told = () => subs.forEach((s) => s());

function put(key: string, s: LayerState | null): void {
  if (s === null) {
    if (!states.has(key)) return;
    states.delete(key);
  } else states.set(key, s);
  told();
}

export function layerState(key: string): LayerState | null {
  return states.get(key) ?? null;
}

/** A layer's state, kept current: null once it is there (or before it was asked for). */
export function useLayerState(key: string | null): LayerState | null {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => (key ? layerState(key) : null),
    () => null,
  );
}

const known = new Map<string, Promise<LayerManifest>>();
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * A layer's manifest, once per page: asked again after each pause while it
 * is built, its state kept for the viewer to say so. A refusal or a failed
 * build is kept as the state and thrown; neither is kept as the answer, so
 * the next viewer asks the engine again.
 */
export function layerManifest(stack: number, ref: LayerRef, wait: (ms: number) => Promise<void> = pause, limitMs = BUILD_LIMIT_MS): Promise<LayerManifest> {
  const key = layerKey(stack, ref);
  const have = known.get(key);
  if (have) return have;
  const p = (async () => {
    const until = Date.now() + limitMs;
    for (let attempt = 0; ; attempt++) {
      try {
        const m = await layerDoors.manifestOnce(stack, ref);
        put(key, null);
        return m;
      } catch (e) {
        if (e instanceof Preparing) {
          put(key, { kind: "building", building: e.building });
          if (Date.now() >= until) {
            put(key, { kind: "failed", reason: "build_failed" });
            throw new NotBuilt(stack, "build_failed", e.building.job);
          }
          await wait(retryPause(attempt, e.building.retryAfter));
          continue;
        }
        if (e instanceof NotBuilt) put(key, { kind: "failed", reason: e.reason });
        else if (e instanceof DoorError) put(key, { kind: "refused", why: e.status === 409 ? "cannot be drawn on this scan" : e.status === 403 || e.status === 401 ? "not open to you" : "not there" });
        throw e;
      }
    }
  })();
  known.set(key, p);
  p.catch(() => {
    if (known.get(key) === p) known.delete(key);
  });
  return p;
}

/** Forget the layers' manifests and states (a test, or a page that knows a layer was built again). */
export function forgetLayers(): void {
  known.clear();
  states.clear();
  told();
}
