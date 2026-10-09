// SPDX-License-Identifier: AGPL-3.0-only
// What the Assistant's query cards read, once each: a stored document never
// changes, and its profile changes only with the registry's epoch, so the
// inline cards and the panel ask for each once while the page lives. A read
// that failed is asked again next time.

import { ask, type DocumentHandle, type Profile } from "../ask/client";

const memo = new Map<string, Promise<unknown>>();

function once<T>(key: string, read: () => Promise<T>): Promise<T> {
  const had = memo.get(key) as Promise<T> | undefined;
  if (had) return had;
  const p = read();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

export const reads = {
  document: (id: number): Promise<DocumentHandle> => once(`d:${id}`, () => ask.get(id)),
  /** The profile of a document's answer, as the engine counts it by default. */
  profile: (id: number, epoch: number | null | undefined): Promise<Profile> => once(`p:${epoch ?? ""}:${id}`, () => ask.profile(id)),
  /** Forget everything read (a test starts from nothing). */
  forget: () => memo.clear(),
};
