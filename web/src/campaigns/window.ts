// SPDX-License-Identifier: AGPL-3.0-only
// One window across the panels of a comparison (the post-contrast study:
// pair mode and anchored reading). Each viewer on its own opens at its own
// stack's percentiles, which normalises the enhancement away. Here every
// stack is first scaled by its reference tissue (viewer/reference.ts, the
// head's central median), and one window in those units is shown on every
// panel: a stack whose vessels, choroid plexus and dura are brighter than
// its brain's reference than in the other stack reads brighter. Window and
// level move together: a drag on one panel sets the shared window, read
// back through that panel's reference. The toggle gives each panel its own
// window again.

import { useCallback, useEffect, useMemo, useState } from "react";
import { storedValue, type Manifest } from "../viewer/doors";
import { reference, type Reference } from "../viewer/reference";

/** A window in units of a stack's reference: 1 is the reference tissue. */
export interface Norm {
  lower: number;
  upper: number;
}

/** A window in the stored values the planes hold, as the viewer sets it. */
export interface Range {
  lower: number;
  upper: number;
}

const modality = (m: Pick<Manifest, "slope" | "intercept">, stored: number) => stored * (m.slope !== undefined && m.slope !== 0 ? m.slope : 1) + (m.intercept ?? 0);

/** A shared window as one stack's stored values: its reference times the window, in the planes' own values. */
export function toStored(n: Norm, ref: number, m: Manifest): Range {
  const a = storedValue(m, n.lower * ref);
  const b = storedValue(m, n.upper * ref);
  return { lower: Math.min(a, b), upper: Math.max(a, b) };
}

/** A window one stack showed, as a shared window: its values over the stack's reference. */
export function toNorm(r: Range, ref: number, m: Manifest): Norm {
  const a = modality(m, r.lower) / ref;
  const b = modality(m, r.upper) / ref;
  return { lower: Math.min(a, b), upper: Math.max(a, b) };
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

/**
 * The shared window a comparison opens at: the median across the panels
 * of each stack's own window (its 1st to 99th percentile) over its
 * reference, so no one panel's brightest vessels set it.
 */
export function openingNorm(panels: { m: Manifest; ref: number }[]): Norm | null {
  const ok = panels.filter((p) => p.ref > 0 && Number.isFinite(p.ref));
  if (ok.length === 0) return null;
  const lows = ok.map((p) => (p.m.window.center - p.m.window.width / 2) / p.ref);
  const highs = ok.map((p) => (p.m.window.center + p.m.window.width / 2) / p.ref);
  const lower = Math.max(0, median(lows));
  const upper = median(highs);
  return upper > lower ? { lower, upper } : null;
}

export type WindowMode = "shared" | "own";

export interface SharedWindow {
  mode: WindowMode;
  setMode: (m: WindowMode) => void;
  /** Whether one window can be shown: every panel's manifest read and a reference found in each. */
  ready: boolean;
  /** Why it cannot, in a few words, while it cannot. */
  why: string | null;
  norm: Norm | null;
  /** The window a panel's viewer is given: its share of the shared window, or null for its own. */
  voiFor: (key: string) => Range | null;
  /** A drag on a panel: the shared window follows it. */
  dragged: (key: string, r: Range) => void;
  /** Back to the opening window. */
  reset: () => void;
}

/**
 * The shared window of a page's panels, by a key per panel (a side, a
 * role): the references are read once each panel's manifest is in.
 */
export function useSharedWindow(panels: Record<string, { stack: number; manifest?: Manifest } | undefined>): SharedWindow {
  const [mode, setMode] = useState<WindowMode>("shared");
  const [refs, setRefs] = useState<Record<string, Reference | "failed">>({});
  const [norm, setNorm] = useState<Norm | null>(null);
  const keyOf = Object.entries(panels)
    .map(([k, p]) => `${k}:${p?.stack ?? ""}:${p?.manifest ? 1 : 0}`)
    .join("|");
  // a new set of stacks: new references, the opening window again
  const stacksKey = Object.entries(panels)
    .map(([k, p]) => `${k}:${p?.stack ?? ""}`)
    .join("|");
  useEffect(() => {
    setRefs({});
    setNorm(null);
  }, [stacksKey]);
  useEffect(() => {
    let alive = true;
    for (const [k, p] of Object.entries(panels)) {
      if (!p?.manifest) continue;
      reference(p.stack, p.manifest).then(
        (r) => alive && setRefs((x) => (x[k] === r ? x : { ...x, [k]: r })),
        () => alive && setRefs((x) => ({ ...x, [k]: "failed" })),
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyOf]);
  const keys = Object.keys(panels);
  const refValue = (k: string): number | null => {
    const r = refs[k];
    return r && r !== "failed" && r.value !== null && r.value > 0 ? r.value : null;
  };
  const all = keys.every((k) => panels[k]?.manifest && refValue(k) !== null);
  const failed = keys.some((k) => refs[k] !== undefined && refValue(k) === null);
  const opening = useMemo(() => (all ? openingNorm(keys.map((k) => ({ m: panels[k]!.manifest!, ref: refValue(k)! }))) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, refs, keyOf],
  );
  useEffect(() => {
    if (opening && norm === null) setNorm(opening);
  }, [opening, norm]);
  const ready = all && norm !== null;
  const why = ready ? null : failed ? "no reference tissue found in a stack" : "reading each stack's reference";
  const voiFor = useCallback(
    (k: string): Range | null => {
      if (mode !== "shared" || !ready || !norm) return null;
      const p = panels[k];
      const r = refs[k];
      if (!p?.manifest || !r || r === "failed" || r.value === null) return null;
      return toStored(norm, r.value, p.manifest);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, ready, norm, refs, keyOf],
  );
  const dragged = useCallback(
    (k: string, range: Range) => {
      if (mode !== "shared" || !ready) return;
      const p = panels[k];
      const r = refs[k];
      if (!p?.manifest || !r || r === "failed" || r.value === null) return;
      setNorm(toNorm(range, r.value, p.manifest));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, ready, refs, keyOf],
  );
  const reset = useCallback(() => setNorm(opening), [opening]);
  return { mode, setMode, ready, why, norm, voiFor, dragged, reset };
}

/** The reference of a panel once read, for a page that needs its extent or its value. */
export function useReference(stack: number | null, manifest: Manifest | undefined): Reference | null {
  const [r, setR] = useState<Reference | null>(null);
  useEffect(() => {
    setR(null);
    if (stack === null || !manifest) return;
    let alive = true;
    reference(stack, manifest).then(
      (x) => alive && setR(x),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [stack, manifest]);
  return r;
}

/** The shared window in words: "0.00 to 1.80 × reference". */
export function normWords(n: Norm | null): string {
  if (!n) return "";
  return `${n.lower.toFixed(2)} to ${n.upper.toFixed(2)} × reference`;
}
