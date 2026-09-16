// SPDX-License-Identifier: AGPL-3.0-only
// A read kept between pages. A page draws what was read last at once and says
// when that was; it reads again when a person asks, when something done on it
// changed what was read, or when another page has read it since. Nothing is
// kept past the life of the browser tab.

import { useSyncExternalStore } from "react";

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
