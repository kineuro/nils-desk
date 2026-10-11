// SPDX-License-Identifier: AGPL-3.0-only
// How a result's mask is shown over a scan (record 55 H3, build spec
// section 4): fill, outline or both, the fill's opacity from 0 to 1 in
// steps of a tenth (half by default, Neuroverify's), the outline always
// full, and shown or hidden without being read again. The colours are the
// theme's (`--n-mask-part`, `--n-mask-focus`, `--n-mask-flagged`, and the
// value palette for a label map's structures); no glyph marks anything.
// Apart from the viewer so a page can keep and key the look without
// loading cornerstone; pure but for reading the tokens off the page.

import { useEffect, useRef } from "react";
import { slotOf, SLOTS } from "../campaigns/values";

export interface MaskLook {
  /** Drawn at all; hiding it reads nothing again. */
  shown: boolean;
  fill: boolean;
  outline: boolean;
  /** The fill's opacity, 0 to 1 in steps of 0.1; the outline is always full. */
  opacity: number;
}

export const DEFAULT_LOOK: MaskLook = { shown: true, fill: true, outline: true, opacity: 0.5 };

/** `f`: both, then the fill alone, then the outline alone, then both again. */
export function nextDraw(l: MaskLook): MaskLook {
  if (l.fill && l.outline) return { ...l, outline: false };
  if (l.fill) return { ...l, fill: false, outline: true };
  return { ...l, fill: true, outline: true };
}

/** `[` and `]`: the fill's opacity a tenth down or up, kept between 0 and 1 and on the tenths. */
export function withOpacity(l: MaskLook, delta: number): MaskLook {
  const o = Math.round(Math.min(1, Math.max(0, l.opacity + delta)) * 10) / 10;
  return o === l.opacity ? l : { ...l, opacity: o };
}

/** What a key does to the mask: `o` hides it (held, until let go), `f` turns how it is drawn, `[` and `]` the opacity. */
export type MaskAct = { kind: "hide" } | { kind: "draw" } | { kind: "opacity"; delta: number };

export function maskKey(key: string, o: { inField: boolean; modifier?: boolean }): MaskAct | null {
  if (o.inField || o.modifier) return null;
  if (key === "o" || key === "O") return { kind: "hide" };
  if (key === "f" || key === "F") return { kind: "draw" };
  if (key === "[") return { kind: "opacity", delta: -0.1 };
  if (key === "]") return { kind: "opacity", delta: 0.1 };
  return null;
}

/** Held this long, `o` was a peek: the mask comes back when the key is let go. */
export const PEEK_MS = 300;

/**
 * The mask's keys on a page: `o` turns the mask off and on, and held down
 * hides it only until it is let go; `f` turns how it is drawn; `[` and `]`
 * the opacity. A key in a field, a dialog or with a modifier is not the
 * mask's. Nothing here reads anything: the look is the page's state.
 */
export function useMaskKeys(setLook: (f: (l: MaskLook) => MaskLook) => void, on = true): void {
  const set = useRef(setLook);
  set.current = setLook;
  useEffect(() => {
    if (!on) return;
    let down: number | null = null;
    const target = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || !!t.closest?.("dialog, .drawer, .mine-drawer"));
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const act = maskKey(e.key, { inField: target(e), modifier: e.altKey || e.metaKey || e.ctrlKey });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "hide") {
        if (e.repeat) return;
        down = performance.now();
        set.current((l) => ({ ...l, shown: !l.shown }));
      } else if (act.kind === "draw") set.current(nextDraw);
      else set.current((l) => withOpacity(l, act.delta));
    };
    const onUp = (e: KeyboardEvent) => {
      if ((e.key !== "o" && e.key !== "O") || down === null) return;
      const held = performance.now() - down;
      down = null;
      // held: a peek, the mask back as it was
      if (held >= PEEK_MS) set.current((l) => ({ ...l, shown: !l.shown }));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [on]);
}

/** How a part is drawn: as a part, in focus, flagged, or dimmer for context (a lesion beside the one an item is about). */
export type Tone = "part" | "focus" | "flagged" | "dim";

/**
 * The labelmap style cornerstone takes for a look (@cornerstonejs/tools'
 * LabelmapStyle), the same whether its segmentation is the active one or
 * not. A hidden mask is a clear fill and no outline: the labels stay where
 * they are, so showing it again is a style again and never a read
 * (cornerstone's own visibility hides only the segments it was told of).
 */
export function labelmapStyle(l: MaskLook): Record<string, number | boolean> {
  const fill = l.shown ? l.fill : true;
  const alpha = l.shown ? l.opacity : 0;
  const outline = l.shown && l.outline;
  return {
    renderFill: fill,
    renderFillInactive: fill,
    fillAlpha: alpha,
    fillAlphaInactive: alpha,
    renderOutline: outline,
    renderOutlineInactive: outline,
    outlineOpacity: 1,
    outlineOpacityInactive: 1,
    outlineWidth: 1,
    outlineWidthInactive: 1,
    // the part in focus is the active segment: outlined thicker
    activeSegmentOutlineWidthDelta: 2,
  };
}

/** The colours the mask is drawn in, as [r, g, b] from 0 to 255, read from the theme. */
export interface MaskPalette {
  part: [number, number, number];
  focus: [number, number, number];
  flagged: [number, number, number];
  /** The value palette, slot 1 to SLOTS. */
  values: [number, number, number][];
}

/** A colour token's value as [r, g, b]: #rgb, #rrggbb (an alpha is left out) or rgb(); null for anything else. */
export function rgbOf(value: string): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/iu.exec(v);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as [number, number, number];
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
    return null;
  }
  const fn = /^rgba?\(([^)]+)\)$/iu.exec(v);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/u).filter(Boolean).slice(0, 3).map(Number);
    if (parts.length === 3 && parts.every((x) => Number.isFinite(x))) return parts.map((x) => Math.round(Math.min(255, Math.max(0, x)))) as [number, number, number];
  }
  return null;
}

/** The palette from the page's theme (ui/theme.css); a token the page lacks is the part's colour, or a grey where even that is missing. */
export function themePalette(root: Element | null = typeof document === "undefined" ? null : document.documentElement): MaskPalette {
  const style = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
  const read = (name: string) => (style ? rgbOf(style.getPropertyValue(name)) : null);
  const grey: [number, number, number] = [128, 128, 128];
  const part = read("--n-mask-part") ?? grey;
  return {
    part,
    focus: read("--n-mask-focus") ?? part,
    flagged: read("--n-mask-flagged") ?? part,
    values: Array.from({ length: SLOTS }, (_, i) => read(`--n-value-${i + 1}`) ?? part),
  };
}

/** How a dimmed part's colour is weighed against a full one: its fill a third as strong. */
const DIM = Math.round(255 / 3);

/**
 * The colour table cornerstone draws a labelmap by: one [r, g, b, a] per
 * label value from 0 (nothing, clear) to the largest. A components set (or
 * a whole mask) draws every part in the part's colour, a part's tone over
 * it; a labels set draws each structure in its value's colour by its place
 * among the set's labels (`slotOf`), round the palette past the tenth.
 */
export function colourTable(o: { kind: string; max: number; labels?: readonly number[]; tones?: ReadonlyMap<number, Tone>; palette: MaskPalette }): [number, number, number, number][] {
  const max = Math.max(1, Math.floor(o.max));
  const names = (o.labels ?? []).map(String);
  const out: [number, number, number, number][] = [[0, 0, 0, 0]];
  for (let v = 1; v <= max; v++) {
    const tone = o.tones?.get(v) ?? "part";
    let rgb = o.palette.part;
    if (o.kind === "labels") {
      const at = names.indexOf(String(v));
      const slot = slotOf(names, String(v)) ?? (at >= 0 ? (at % SLOTS) + 1 : ((v - 1) % SLOTS) + 1);
      rgb = o.palette.values[slot - 1] ?? o.palette.part;
    }
    if (tone === "focus") rgb = o.palette.focus;
    else if (tone === "flagged") rgb = o.palette.flagged;
    out.push([rgb[0], rgb[1], rgb[2], tone === "dim" ? DIM : 255]);
  }
  return out;
}
