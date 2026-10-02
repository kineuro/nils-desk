// SPDX-License-Identifier: AGPL-3.0-only
// The slabs a page has read, kept across stacks (the reader, 2026-10-02:
// "the next few items in memory already, even 2 before and 5 after"). Every
// slab the viewer, the three planes' volume and the reference sample ask
// for comes through here: one read per slab while it is kept, a slab asked
// for twice at once read once, and the encoded bytes kept under one budget,
// the least recently used let go first. A reader warms the items ahead
// through the same door (campaigns/ahead.ts), so the item it moves to is
// drawn from memory. A warm read that nobody asked for since may be called
// off when the reader jumps elsewhere; one the pictures wait on never is.
// The decoded planes are cornerstone's and the viewer's (loader.ts); only
// the encoded ones, a few times smaller, are kept here.

import { doors } from "./doors";

export interface Slab {
  /** Each plane's tiles, in row-major order of its grid. */
  planes: Uint8Array[][];
  codec: string;
  bytes: number;
}

/** What the page keeps: the encoded slabs of about eight items' pictures (three stacks each, the three planes' volumes included). */
export const SLAB_BUDGET = 320 * 1024 * 1024;

interface Reading {
  p: Promise<Slab>;
  ctl: AbortController;
  /** Asked for by a picture on the screen, not only to warm: never called off. */
  wanted: boolean;
  stack: number;
}

const kept = new Map<string, Slab>();
const reading = new Map<string, Reading>();
/** Stacks whose slabs are not let go while another fits: the items on the screen and the two before. */
const pinned = new Set<number>();
let used = 0;
let budget = SLAB_BUDGET;

export const slabCounters = { hits: 0, reads: 0, joined: 0, cancelled: 0, bytes: 0 };

export function slabKey(stack: number, level: number, z0: number, z1: number): string {
  return `${stack}/${level}/${z0}-${z1}`;
}

const stackOf = (key: string) => Number(key.slice(0, key.indexOf("/")));

function keep(key: string, s: Slab): void {
  if (kept.has(key)) return;
  kept.set(key, s);
  used += s.bytes;
  if (used <= budget) return;
  // the least recently used first, the pinned stacks' last
  for (const pass of [false, true]) {
    for (const [k, v] of kept) {
      if (used <= budget) return;
      if (k === key || (!pass && pinned.has(stackOf(k)))) continue;
      kept.delete(k);
      used -= v.bytes;
    }
  }
}

/** Whether a slab is in memory now. */
export function hasSlab(stack: number, level: number, z0: number, z1: number): boolean {
  return kept.has(slabKey(stack, level, z0, z1));
}

/**
 * A slab, from memory where it is kept, else read once. `warm` reads it
 * for later: it waits behind nothing, but it may be called off by
 * `calloff` until something on the screen asks for it too.
 */
export function slab(stack: number, level: number, z0: number, z1: number, o: { warm?: boolean; signal?: AbortSignal } = {}): Promise<Slab> {
  const key = slabKey(stack, level, z0, z1);
  const have = kept.get(key);
  if (have) {
    // the most recently used last
    kept.delete(key);
    kept.set(key, have);
    slabCounters.hits += 1;
    return Promise.resolve(have);
  }
  const on = reading.get(key);
  if (on) {
    if (!o.warm) on.wanted = true;
    slabCounters.joined += 1;
    return on.p;
  }
  const ctl = new AbortController();
  // a caller's own signal stops its wait, never a read another may share
  const r: Reading = { ctl, wanted: !o.warm, stack, p: Promise.resolve(null as unknown as Slab) };
  r.p = doors.slab(stack, level, z0, z1, ctl.signal).then(
    (x) => {
      const s: Slab = { planes: x.planes, codec: x.codec, bytes: x.bytes };
      slabCounters.reads += 1;
      slabCounters.bytes += x.bytes;
      if (reading.get(key) === r) reading.delete(key);
      keep(key, s);
      return s;
    },
    (e: unknown) => {
      if (reading.get(key) === r) reading.delete(key);
      throw e;
    },
  );
  reading.set(key, r);
  if (o.signal) {
    const sig = o.signal;
    return new Promise<Slab>((resolve, reject) => {
      if (sig.aborted) return reject(new DOMException("aborted", "AbortError"));
      sig.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      r.p.then(resolve, reject);
    });
  }
  return r.p;
}

/** Call off the warm reads of stacks no longer wanted ahead; a read a picture waits on goes on. */
export function calloff(keepStacks: ReadonlySet<number>): number {
  let n = 0;
  for (const [key, r] of reading) {
    if (r.wanted || keepStacks.has(r.stack)) continue;
    r.ctl.abort();
    reading.delete(key);
    n += 1;
  }
  slabCounters.cancelled += n;
  return n;
}

/** The stacks kept first when the budget is short: those on the screen and the items just read. */
export function pin(stacks: Iterable<number>): void {
  pinned.clear();
  for (const s of stacks) pinned.add(s);
}

/** How much is kept, for the viewer's numbers and the tests. */
export function slabsKept(): { slabs: number; bytes: number; reading: number } {
  return { slabs: kept.size, bytes: used, reading: reading.size };
}

/** Forget everything (a test), or set another budget. */
export function forgetSlabs(nextBudget = SLAB_BUDGET): void {
  for (const r of reading.values()) r.ctl.abort();
  reading.clear();
  kept.clear();
  pinned.clear();
  used = 0;
  budget = nextBudget;
  for (const k of Object.keys(slabCounters) as (keyof typeof slabCounters)[]) slabCounters[k] = 0;
}
