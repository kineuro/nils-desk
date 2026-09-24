// SPDX-License-Identifier: AGPL-3.0-only
// The tile's pure parts (record 45 S2, study A3 "Components"): the manifests
// of a grid read a few at a time and once per stack, the plane a position
// names, the level a tile's pixels want, and the position a set of tiles
// scrolls in step. The engine writes one audit row per person and stack
// however many planes are asked, so a grid of 200 stacks is 200 rows.

import { DoorError } from "../ask/client";
import { doors, levelShape, type Manifest } from "./doors";
import { levelFor } from "./ring";
import type { Axis } from "./geometry";

/** At most this many manifests in flight, so a grid does not take every connection the browser has for the engine. */
export const MANIFESTS_AT_ONCE = 6;

type Read = () => Promise<Manifest>;
const known = new Map<number, Promise<Manifest>>();
const waiting: (() => void)[] = [];
let running = 0;

function next(): void {
  while (running < MANIFESTS_AT_ONCE && waiting.length > 0) {
    running += 1;
    waiting.shift()!();
  }
}

/** A stack's manifest for a tile: once per stack while the page lives, a few at a time. */
export function tileManifest(stack: number, read: Read = () => doors.manifest(stack)): Promise<Manifest> {
  const have = known.get(stack);
  if (have) return have;
  const p = new Promise<Manifest>((resolve, reject) => {
    waiting.push(() => {
      read()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          next();
        });
    });
    next();
  });
  known.set(stack, p);
  // a refusal is not kept, so a tile asked again after a grant asks the engine again
  p.catch(() => known.delete(stack));
  return p;
}

/** Forget what was read (a test, or a page that knows the pyramids changed). */
export function forgetManifests(): void {
  known.clear();
}

/** The planes along an axis at a level. */
export function planesAlong(m: Manifest, level: number, axis: Axis): number {
  const [nz, ny, nx] = levelShape(m, level);
  return axis === "z" ? nz : axis === "y" ? ny : nx;
}

/** The plane a position between 0 and 1 names. */
export function planeAt(pos: number, planes: number): number {
  return Math.min(planes - 1, Math.max(0, Math.round(pos * (planes - 1))));
}

/** One plane on: the position of the next plane in a direction, from a position. */
export function step(pos: number, planes: number, dir: 1 | -1): number {
  if (planes <= 1) return pos;
  const z = planeAt(pos, planes) + dir;
  return Math.min(1, Math.max(0, z / (planes - 1)));
}

/** The coarsest level whose plane still fills the tile's device pixels. */
export function tileLevel(m: Manifest, px: number): number {
  return levelFor(px, Math.max(m.shape[1], m.shape[2]), m.levels);
}

/** What a tile says when it has no picture: the engine's refusal in the fewest words. */
export function tileAbsence(e: unknown): string {
  if (e instanceof DoorError) {
    if (e.status === 404) return "no picture yet";
    if (e.status === 401 || e.status === 403) return "not open to you";
    if (e.status === 409) return "no working place";
  }
  return "no picture";
}

/** A position that a set of tiles shares, so they scroll in step. */
export class TileSync {
  private pos: number;
  private subs = new Set<() => void>();
  constructor(pos = 0.5) {
    this.pos = pos;
  }
  get = (): number => this.pos;
  set = (pos: number): void => {
    const p = Math.min(1, Math.max(0, pos));
    if (p === this.pos) return;
    this.pos = p;
    for (const s of this.subs) s();
  };
  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
}
