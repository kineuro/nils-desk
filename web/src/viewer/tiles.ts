// SPDX-License-Identifier: AGPL-3.0-only
// The tile's pure parts (record 45 S2, study A3 "Components"): the manifests
// of a grid read a few at a time and once per stack, the plane a position
// names, the level a tile's pixels want, and the position a set of tiles
// scrolls in step. The engine writes one audit row per person and stack
// however many planes are asked, so a grid of 200 stacks is 200 rows.

import { DoorError } from "../ask/client";
import { askOnce, BUILD_LIMIT_MS, givenUp, NotBuilt, reasonWords, retryPause } from "./building";
import { doors, levelShape, type Manifest } from "./doors";
import { levelFor } from "./ring";
import type { Axis } from "./geometry";

/** At most this many manifests in flight, so a grid does not take every connection the browser has for the engine. */
export const MANIFESTS_AT_ONCE = 6;

/** One ask for a manifest: a picture being built throws `Preparing` (building.ts). */
type Read = () => Promise<Manifest>;

/** A stack's manifest being read or read: its answer, and how many still wait for it. */
interface Wanted {
  promise: Promise<Manifest>;
  wanting: number;
}
const known = new Map<number, Wanted>();
const waiting: (() => void)[] = [];
let running = 0;

function next(): void {
  while (running < MANIFESTS_AT_ONCE && waiting.length > 0) {
    running += 1;
    waiting.shift()!();
  }
}

/** One of the slots, held for one ask and let go as soon as the engine answers it. */
function slot(): Promise<() => void> {
  return new Promise((take) => {
    waiting.push(() =>
      take(() => {
        running -= 1;
        next();
      }),
    );
    next();
  });
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Nobody waits for the picture any more: every tile that asked for it went. */
const unwanted = () => new DOMException("the picture is no longer wanted", "AbortError");

/**
 * Ask until the manifest is there. A picture being built is waited for
 * outside the slots and asked again after its pause, so stacks whose
 * pictures are built never hold every slot from the rest (review of
 * 2026-10-10: the wait held a slot for up to two hours); and asking stops
 * once nobody wants it.
 */
async function asking(stack: number, read: Read, wanted: () => boolean): Promise<Manifest> {
  const until = Date.now() + BUILD_LIMIT_MS;
  for (let attempt = 0; ; attempt++) {
    if (!wanted()) throw unwanted();
    const free = await slot();
    let r: Awaited<ReturnType<typeof askOnce<Manifest>>>;
    try {
      if (!wanted()) throw unwanted();
      r = await askOnce(stack, read);
    } finally {
      free();
    }
    if ("got" in r) return r.got;
    if (Date.now() >= until) throw givenUp(stack, r.building.job);
    await pause(retryPause(attempt, r.building.retryAfter));
  }
}

/** One caller's share of a stack's manifest: it lets go when its signal aborts, and the asking stops once every caller let go. */
function follow(w: Wanted, signal?: AbortSignal): Promise<Manifest> {
  if (!signal) return w.promise;
  return new Promise<Manifest>((resolve, reject) => {
    let done = false;
    const end = () => {
      done = true;
      w.wanting -= 1;
      signal.removeEventListener("abort", leave);
    };
    const leave = () => {
      if (done) return;
      end();
      reject(unwanted());
    };
    if (signal.aborted) return leave();
    signal.addEventListener("abort", leave, { once: true });
    w.promise.then(
      (m) => {
        if (done) return;
        end();
        resolve(m);
      },
      (e: unknown) => {
        if (done) return;
        end();
        reject(e);
      },
    );
  });
}

/**
 * A stack's manifest for a tile: once per stack while the page lives, a few
 * at a time. A caller with a signal lets go of it when the signal aborts (a
 * tile that left the page); one without waits for it to the end.
 */
export function tileManifest(stack: number, read: Read = () => doors.manifestOnce(stack), signal?: AbortSignal): Promise<Manifest> {
  const have = known.get(stack);
  if (have) {
    have.wanting += 1;
    return follow(have, signal);
  }
  const w: Wanted = { promise: Promise.resolve() as unknown as Promise<Manifest>, wanting: 1 };
  w.promise = asking(stack, read, () => w.wanting > 0);
  known.set(stack, w);
  // a refusal, a failure or nobody wanting it is not kept, so a tile asked again asks the engine again
  w.promise.catch(() => {
    if (known.get(stack) === w) known.delete(stack);
  });
  return follow(w, signal);
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
  if (e instanceof NotBuilt) return `could not be built: ${reasonWords(e.reason)}`;
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
