// SPDX-License-Identifier: AGPL-3.0-only
// A picture built when it is first asked for (Wave 7a, H2 round 3: no
// command line inside a flow). A stack with no pyramid answers the picture
// doors 202 with the build the engine queued for it and when to ask again;
// 422 once that build failed, with the class of why. The manifest is asked
// again after each pause until it is there, and what each stack is waiting
// for is kept here, so a reader, a tile or a thumbnail says "Preparing the
// picture" with its progress, or that it could not be built, and never shows
// a grey box or a command to copy.

import { useSyncExternalStore } from "react";

/** A build the engine is running for a stack's picture. */
export interface Building {
  stack: number;
  job: number | null;
  state: string;
  /** The job's progress as a fraction, where it says one. */
  fraction: number | null;
  /** Seconds before asking again. */
  retryAfter: number;
}

/** The picture's build is queued or running: ask again after `retryAfter`. */
export class Preparing extends Error {
  constructor(readonly building: Building) {
    super("preparing the picture");
  }
}

/** The picture's build failed; `reason` is its class, never a path. */
export class NotBuilt extends Error {
  constructor(
    readonly stackId: number,
    readonly reason: string,
    readonly job: number | null,
  ) {
    super(`this picture could not be built: ${reason}`);
  }
}

/** The reason's class as a few words. */
const REASONS: Record<string, string> = {
  no_files: "no files",
  compressed: "a compression it cannot read",
  undecodable: "pixels it cannot decode",
  unsupported_pixels: "pixels it does not support",
  mixed_matrix: "images of different sizes",
  unreadable: "files it cannot read",
  build_failed: "the build failed",
};

export function reasonWords(reason: string): string {
  return REASONS[reason] ?? reason.replace(/_/g, " ");
}

/** A job's progress as a fraction, from the shapes the engine writes: {done, total}, {fraction}, or a number. */
export function fractionOf(progress: unknown): number | null {
  if (typeof progress === "number" && Number.isFinite(progress)) return Math.min(1, Math.max(0, progress > 1 ? progress / 100 : progress));
  if (!progress || typeof progress !== "object") return null;
  const p = progress as Record<string, unknown>;
  if (typeof p.fraction === "number") return Math.min(1, Math.max(0, p.fraction));
  const done = typeof p.done === "number" ? p.done : null;
  const total = typeof p.total === "number" ? p.total : null;
  return done !== null && total !== null && total > 0 ? Math.min(1, done / total) : null;
}

/**
 * A picture door's answer read for its build: 202 throws `Preparing`, 422
 * throws `NotBuilt`; anything else returns, for the caller to read.
 */
export async function pictureAnswer(r: Response, stack: number): Promise<void> {
  if (r.status !== 202 && r.status !== 422) return;
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const job = typeof body.job === "number" ? body.job : null;
  if (r.status === 422) throw new NotBuilt(stack, typeof body.reason === "string" ? body.reason : "build_failed", job);
  const header = Number(r.headers.get("Retry-After"));
  const retryAfter =
    typeof body.retry_after_ms === "number" && body.retry_after_ms > 0
      ? body.retry_after_ms / 1000
      : typeof body.retry_after === "number" && body.retry_after > 0
        ? body.retry_after
        : Number.isFinite(header) && header > 0
          ? header
          : 2;
  throw new Preparing({ stack, job, state: typeof body.state === "string" ? body.state : "queued", fraction: fractionOf(body.progress), retryAfter });
}

/** What a stack's picture is waiting for, by stack: a build, or a build that failed. */
export type PictureState = { kind: "building"; building: Building } | { kind: "failed"; reason: string };

const states = new Map<number, PictureState>();
const subs = new Set<() => void>();
const told = () => subs.forEach((s) => s());

function put(stack: number, s: PictureState | null): void {
  if (s === null) {
    if (!states.has(stack)) return;
    states.delete(stack);
  } else states.set(stack, s);
  told();
}

export function pictureState(stack: number): PictureState | null {
  return states.get(stack) ?? null;
}

export function subscribePictures(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Forget every state (a test). */
export function forgetPictures(): void {
  states.clear();
  told();
}

/** A stack's picture state, kept current. */
export function usePicture(stack: number): PictureState | null {
  return useSyncExternalStore(
    subscribePictures,
    () => pictureState(stack),
    () => null,
  );
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * The pause before the n-th ask again (from 0) of a picture being built: a
 * quarter of a second at first, half again longer each time, never longer
 * than the engine asked. A small stack's build is done in well under a
 * second, so its picture is not held two seconds behind it.
 */
export function retryPause(attempt: number, retryAfterSeconds: number): number {
  const quick = 250 * 1.5 ** attempt;
  return Math.round(Math.max(100, Math.min(retryAfterSeconds * 1000, quick)));
}

/** How long a picture being built is waited for before it is given up on as one that failed. */
export const BUILD_LIMIT_MS = 2 * 60 * 60_000;

/**
 * One ask of a picture door, its answer kept as the stack's state: what it
 * answered, or the build to wait for. A `NotBuilt` is kept and thrown, and
 * any other failure thrown as it is.
 */
export async function askOnce<T>(stack: number, once: () => Promise<T>): Promise<{ got: T } | { building: Building }> {
  try {
    const got = await once();
    put(stack, null);
    return { got };
  } catch (e) {
    if (e instanceof NotBuilt) {
      put(stack, { kind: "failed", reason: e.reason });
      throw e;
    }
    if (!(e instanceof Preparing)) {
      put(stack, null);
      throw e;
    }
    put(stack, { kind: "building", building: e.building });
    return { building: e.building };
  }
}

/** A build waited for past its limit, kept as one that failed. */
export function givenUp(stack: number, job: number | null): NotBuilt {
  put(stack, { kind: "failed", reason: "build_failed" });
  return new NotBuilt(stack, "build_failed", job);
}

/**
 * Ask until the picture is there: each `Preparing` is kept as the stack's
 * state and asked again after its pause; a `NotBuilt` is kept and thrown.
 * A build that runs past `limitMs` is given up on as one that failed.
 */
export async function untilBuilt<T>(stack: number, once: () => Promise<T>, wait: (ms: number) => Promise<void> = pause, limitMs = BUILD_LIMIT_MS): Promise<T> {
  const until = Date.now() + limitMs;
  for (let attempt = 0; ; attempt++) {
    const r = await askOnce(stack, once);
    if ("got" in r) return r.got;
    if (Date.now() >= until) throw givenUp(stack, r.building.job);
    await wait(retryPause(attempt, r.building.retryAfter));
  }
}
