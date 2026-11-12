// SPDX-License-Identifier: AGPL-3.0-only
// A read kept between pages. A page draws what was read last at once and says
// when that was; it reads again when a person asks, when something done on it
// changed what was read, or when another page has read it since. Nothing is
// kept past the life of the browser tab.
//
// And the reads a page repeats while it is open (2026-10-17): a dataset's
// summary that took 30 to 40 s was asked again every 5 s whether or not the
// last read had answered, about ten of them out at once, and an older answer
// could land after a newer one. A page reads each thing once at a time, reads
// a thing it follows again a while after the last answer, and lets go of an
// answer to a read it let go of.
//
// And what such reads brought, kept between visits (2026-11-12): a page that
// held its lists in its own state waited for every one of them on each
// arrival, seconds each on a large registry. A shelf keeps what a page's reads
// brought, by key, for the person they were read for; the page draws from it
// at once and reads again behind. An answer is placed by when its read was
// sent, so a slow older one never lands over a newer one, whichever visit
// sent it; and what was kept for one person is never handed to another.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface Kept<T> {
  value: T | null;
  /** When the value was read, in milliseconds. */
  at: number | null;
  /** How the last read failed, when it did; the value read before it stays. */
  error: unknown;
  reading: boolean;
}

export interface Keeper<T> {
  get(): Kept<T>;
  subscribe(listener: () => void): () => void;
  /** Read again, the usual way or another; the usual read already under way is joined. */
  refresh(read?: () => Promise<T>): Promise<T>;
  /** A value another page read, kept as the newest. */
  put(value: T): void;
  /** Read once, when nothing was read yet. */
  ensure(): void;
  /** Forget the value and any read under way; for tests. */
  reset(): void;
}

export function keeper<T>(read: () => Promise<T>): Keeper<T> {
  let state: Kept<T> = { value: null, at: null, error: null, reading: false };
  let under: { read: () => Promise<T>; done: Promise<T> } | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Kept<T>) => {
    state = next;
    for (const l of listeners) l();
  };

  const refresh = (r: () => Promise<T> = read): Promise<T> => {
    if (under && under.read === r) return under.done;
    // another kind of read waits for the one under way, then reads for itself
    if (under) return under.done.catch(() => undefined).then(() => refresh(r));
    set({ ...state, reading: true });
    const done = r().then(
      (value) => {
        under = null;
        set({ value, at: Date.now(), error: null, reading: false });
        return value;
      },
      (error: unknown) => {
        under = null;
        set({ ...state, error, reading: false });
        throw error;
      },
    );
    under = { read: r, done };
    return done;
  };

  return {
    get: () => state,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    refresh,
    put: (value) => set({ value, at: Date.now(), error: null, reading: state.reading }),
    reset: () => {
      under = null;
      set({ value: null, at: null, error: null, reading: false });
    },
    ensure: () => {
      if (state.value === null && under === null) refresh().catch(() => undefined);
    },
  };
}

/** What a keeper holds now, drawn again whenever it changes; the same when a page is drawn to static markup. */
export function useKept<T>(k: Keeper<T>): Kept<T> {
  return useSyncExternalStore(k.subscribe, k.get, k.get);
}

/** How long ago something was read: just now, 4 minutes ago, 2 hours ago. */
export function agoWords(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return m === 1 ? "a minute ago" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "a day ago" : `${d} days ago`;
}

/* ---------------------------------------------------------------- a page's reads, one at a time */

/** How long after its answer a thing a page follows is read again. */
export const READ_AGAIN_MS = 5_000;

/** What a page does with one door's answers, by the key of the thing read: a dataset's name, or one key for a list. */
export interface ReadsOf<T> {
  read: (key: string) => Promise<T>;
  got: (key: string, value: T) => void;
  failed?: (key: string, e: unknown) => void;
  /** How long after its answer a followed key is read again. */
  every?: number;
}

/**
 * A page's reads of one door, by key. A key never has two reads out at once;
 * a followed key is read again `every` after its answer, never on a clock
 * whether or not it answered; and every read takes a number, so the answer to
 * a read the page let go of (a dataset gone from the list, the page closed)
 * is let go too and never lands over a newer one.
 */
export interface Reads {
  /** Read the key, unless a read of it is out already: that answer will do. */
  read(key: string): void;
  /** Read the key once: nothing where it was read already since the page took it up. */
  ensure(key: string): void;
  /** Read the key from now on: at once, or right after the read out answers, whose answer may be from before what changed. */
  fresh(key: string): void;
  /** Follow these keys, each read again `every` after its answer, and no other. */
  follow(keys: readonly string[]): void;
  /** Let go of a key: a read of it still out answers to nobody, and it is followed no more. */
  drop(key: string): void;
  /** Let go of every key as the page goes; `start` takes the page up again, as React does with a page it draws twice in development. */
  stop(): void;
  start(): void;
}

/** One key's reads: whether one is out, whether to read again once it answers, the number of the newest, and the wait before the next. */
interface Slot {
  out: boolean;
  again: boolean;
  /** The number of the newest read of the key; 0 before the first. An answer to any other read is let go. */
  seq: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function reads<T>(o: ReadsOf<T>): Reads {
  const every = o.every ?? READ_AGAIN_MS;
  let slots = new Map<string, Slot>();
  let followed = new Set<string>();
  let alive = true;
  // one count for every read, so a key let go of and read again never meets an old number
  let numbered = 0;
  const slotOf = (key: string): Slot => {
    let s = slots.get(key);
    if (!s) {
      s = { out: false, again: false, seq: 0, timer: null };
      slots.set(key, s);
    }
    return s;
  };
  const halt = (s: Slot) => {
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = null;
  };
  const later = (key: string, s: Slot) => {
    halt(s);
    s.timer = setTimeout(() => {
      s.timer = null;
      go(key);
    }, every);
  };
  const go = (key: string) => {
    if (!alive) return;
    const s = slotOf(key);
    halt(s);
    s.out = true;
    s.again = false;
    const mine = ++numbered;
    s.seq = mine;
    // the newest read of a key the page still holds; never two out at once, so any other was let go of
    const newest = () => slots.get(key)?.seq === mine;
    const settle = (tell: () => void) => {
      if (!newest()) return;
      s.out = false;
      try {
        tell();
      } finally {
        if (alive && newest()) {
          if (s.again) go(key);
          else if (followed.has(key)) later(key, s);
        }
      }
    };
    let answer: Promise<T>;
    try {
      answer = o.read(key);
    } catch (e) {
      answer = Promise.reject(e);
    }
    answer.then(
      (v) => settle(() => o.got(key, v)),
      (e: unknown) => settle(() => o.failed?.(key, e)),
    );
  };
  return {
    read: (key) => {
      if (alive && !slots.get(key)?.out) go(key);
    },
    ensure: (key) => {
      if (alive && (slots.get(key)?.seq ?? 0) === 0) go(key);
    },
    fresh: (key) => {
      if (!alive) return;
      const s = slots.get(key);
      if (s?.out) s.again = true;
      else go(key);
    },
    follow: (keys) => {
      if (!alive) return;
      const next = new Set(keys);
      for (const key of followed) {
        const s = slots.get(key);
        if (!next.has(key) && s) halt(s);
      }
      // a key followed from now is read a while from now, or a while after the read out answers
      for (const key of next) {
        if (followed.has(key)) continue;
        const s = slotOf(key);
        if (!s.out && s.timer === null) later(key, s);
      }
      followed = next;
    },
    drop: (key) => {
      const s = slots.get(key);
      if (s) halt(s);
      slots.delete(key);
      followed.delete(key);
    },
    stop: () => {
      alive = false;
      for (const s of slots.values()) halt(s);
      slots = new Map();
      followed = new Set();
    },
    start: () => {
      alive = true;
    },
  };
}

/** A page's reads of one door for the life of the page, telling the newest functions it was drawn with. */
export function useReads<T>(read: (key: string) => Promise<T>, got: (key: string, value: T) => void, failed?: (key: string, e: unknown) => void, every = READ_AGAIN_MS): Reads {
  const latest = useRef({ read, got, failed });
  useEffect(() => {
    latest.current = { read, got, failed };
  });
  const [r] = useState(() =>
    reads<T>({
      read: (key) => latest.current.read(key),
      got: (key, value) => latest.current.got(key, value),
      failed: (key, e) => latest.current.failed?.(key, e),
      every,
    }),
  );
  useEffect(() => {
    r.start();
    return () => r.stop();
  }, [r]);
  return r;
}

/**
 * What a page's reads brought, by key, kept between its visits for one
 * person. `who` says the person and what they may read; a page takes the
 * shelf up for them on arrival, which lets go of what was kept for anyone
 * else, and nothing is handed out or kept under another `who` than that one.
 */
export interface Shelf<T> {
  /** What is kept for this person, by key: the same object until something changes, and nothing where it was kept for another. */
  get(who: string): Readonly<Record<string, T>>;
  subscribe(listener: () => void): () => void;
  /** The shelf taken up for this person; what was kept for another is let go. */
  take(who: string): void;
  /** The number a read takes as it is sent, which places its answer among the others. */
  sent(): number;
  /** Keep the answer to the read sent as `sent`; refused under another person than the shelf's, and where the answer to a read sent later is kept already. */
  land(who: string, key: string, sent: number, value: T): boolean;
  /** Let go of a key. */
  drop(who: string, key: string): void;
  /** Let go of every key but these. */
  only(who: string, keys: ReadonlySet<string>): void;
  /** Let go of everything, whoever it was kept for. */
  forget(): void;
}

const NOTHING: Readonly<Record<string, never>> = Object.freeze({});
// one count for the reads of every shelf, so answers kept on two shelves are placed alike
let sentSoFar = 0;

export function shelf<T>(): Shelf<T> {
  let owner: string | null = null;
  let kept: Readonly<Record<string, T>> = NOTHING;
  /** The number of the read whose answer each key holds, or held last. */
  let placed = new Map<string, number>();
  const listeners = new Set<() => void>();
  const set = (next: Readonly<Record<string, T>>) => {
    kept = next;
    for (const l of [...listeners]) l();
  };
  const clear = () => {
    placed = new Map();
    if (kept !== NOTHING) set(NOTHING);
  };
  return {
    get: (who) => (owner === who ? kept : NOTHING),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    take: (who) => {
      if (owner === who) return;
      owner = who;
      clear();
    },
    sent: () => ++sentSoFar,
    land: (who, key, sent, value) => {
      if (owner !== who || sent < (placed.get(key) ?? 0)) return false;
      placed.set(key, sent);
      set({ ...kept, [key]: value });
      return true;
    },
    drop: (who, key) => {
      if (owner !== who || !(key in kept)) return;
      const { [key]: _gone, ...rest } = kept;
      set(rest);
    },
    only: (who, keys) => {
      if (owner !== who || Object.keys(kept).every((k) => keys.has(k))) return;
      for (const k of placed.keys()) if (!keys.has(k)) placed.delete(k);
      set(Object.fromEntries(Object.entries(kept).filter(([k]) => keys.has(k))));
    },
    forget: () => {
      owner = null;
      clear();
    },
  };
}

/** What a shelf keeps for this person, drawn again when it changes. */
export function useShelf<T>(s: Shelf<T>, who: string): Readonly<Record<string, T>> {
  return useSyncExternalStore(
    s.subscribe,
    () => s.get(who),
    () => s.get(who),
  );
}
