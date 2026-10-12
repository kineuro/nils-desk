// SPDX-License-Identifier: AGPL-3.0-only
// Answers built through SLICE's names (failure.ts), so a test holds when the
// engine's failure slice reports other names.

import { SLICE } from "./failure";

/** An answer with a value at each of SLICE's dotted paths. */
export function withSlice<T extends object>(answer: T, values: Partial<Record<keyof typeof SLICE, unknown>>): T {
  const out = structuredClone(answer) as Record<string, unknown>;
  for (const [name, v] of Object.entries(values)) {
    const path = SLICE[name as keyof typeof SLICE].split(".");
    let o = out;
    for (const k of path.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[path[path.length - 1]] = v;
  }
  return out as T;
}
