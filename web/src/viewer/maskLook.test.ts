// SPDX-License-Identifier: AGPL-3.0-only
// How a mask is shown (record 55 H3, job type 3, D1, build spec sections
// 4 and 10.3): fill, outline or both by `f`; the fill's opacity by tenths
// with `[` and `]`, half by default, the outline always full; `o` hides;
// none of these keys meets a key of the comparison reader; the colours are
// the theme's, a part's tone over its colour, a label map's structures in
// the value palette.

import { describe, expect, it } from "vitest";
import { compareKey } from "../campaigns/compare";
import { SLOTS } from "../campaigns/values";
import { colourTable, DEFAULT_LOOK, labelmapStyle, maskKey, nextDraw, rgbOf, withOpacity, type MaskPalette } from "./maskLook";

describe("the look", () => {
  it("is shown, filled and outlined at half by default", () => {
    expect(DEFAULT_LOOK).toEqual({ shown: true, fill: true, outline: true, opacity: 0.5 });
  });

  it("goes both, fill, outline and back on f", () => {
    const a = nextDraw(DEFAULT_LOOK);
    expect([a.fill, a.outline]).toEqual([true, false]);
    const b = nextDraw(a);
    expect([b.fill, b.outline]).toEqual([false, true]);
    const c = nextDraw(b);
    expect([c.fill, c.outline]).toEqual([true, true]);
  });

  it("steps the opacity by tenths between 0 and 1", () => {
    let l = DEFAULT_LOOK;
    for (let i = 0; i < 3; i++) l = withOpacity(l, 0.1);
    expect(l.opacity).toBe(0.8);
    for (let i = 0; i < 9; i++) l = withOpacity(l, 0.1);
    expect(l.opacity).toBe(1);
    for (let i = 0; i < 15; i++) l = withOpacity(l, -0.1);
    expect(l.opacity).toBe(0);
    // at the end nothing changes, so nothing is drawn again
    expect(withOpacity(l, -0.1)).toBe(l);
  });

  it("is cornerstone's labelmap style: the fill's alpha, the outline full, the same active or not", () => {
    expect(labelmapStyle({ shown: true, fill: true, outline: false, opacity: 0.3 })).toMatchObject({ renderFill: true, renderFillInactive: true, fillAlpha: 0.3, fillAlphaInactive: 0.3, renderOutline: false, renderOutlineInactive: false, outlineOpacity: 1, outlineOpacityInactive: 1 });
    expect(labelmapStyle({ shown: true, fill: false, outline: true, opacity: 0.7 })).toMatchObject({ renderFill: false, renderOutline: true, outlineOpacity: 1 });
  });

  it("hides the mask as a clear fill with no outline, whatever it was drawn as", () => {
    for (const l of [DEFAULT_LOOK, { shown: true, fill: false, outline: true, opacity: 0.7 }]) expect(labelmapStyle({ ...l, shown: false })).toMatchObject({ renderFill: true, fillAlpha: 0, fillAlphaInactive: 0, renderOutline: false, renderOutlineInactive: false });
  });
});

describe("the mask's keys", () => {
  it("are o, f, [ and ], and none of them is the comparison reader's", () => {
    expect(maskKey("o", { inField: false })).toEqual({ kind: "hide" });
    expect(maskKey("f", { inField: false })).toEqual({ kind: "draw" });
    expect(maskKey("[", { inField: false })).toEqual({ kind: "opacity", delta: -0.1 });
    expect(maskKey("]", { inField: false })).toEqual({ kind: "opacity", delta: 0.1 });
    for (const k of ["o", "f", "[", "]"]) expect(compareKey(k, { inField: false, answers: 9, difference: true }), k).toBeNull();
  });

  it("are not the mask's in a field or with a modifier", () => {
    expect(maskKey("o", { inField: true })).toBeNull();
    expect(maskKey("f", { inField: false, modifier: true })).toBeNull();
    expect(maskKey("x", { inField: false })).toBeNull();
  });
});

const palette: MaskPalette = {
  part: [224, 57, 62],
  focus: [255, 122, 127],
  flagged: [242, 160, 61],
  values: Array.from({ length: SLOTS }, (_, i) => [i, i, i] as [number, number, number]),
};

describe("the colour table", () => {
  it("draws every part of a lesion set in the part's colour, nothing at 0", () => {
    const t = colourTable({ kind: "components", max: 4, palette });
    expect(t).toHaveLength(5);
    expect(t[0]).toEqual([0, 0, 0, 0]);
    for (let i = 1; i <= 4; i++) expect(t[i]).toEqual([224, 57, 62, 255]);
  });

  it("draws a part's tone over it: in focus brighter, flagged in the caution colour, dimmer for context", () => {
    const t = colourTable({ kind: "components", max: 4, palette, tones: new Map([[2, "focus"], [3, "flagged"], [4, "dim"]]) });
    expect(t[1]).toEqual([224, 57, 62, 255]);
    expect(t[2]).toEqual([255, 122, 127, 255]);
    expect(t[3]).toEqual([242, 160, 61, 255]);
    expect(t[4].slice(0, 3)).toEqual([224, 57, 62]);
    expect(t[4][3]).toBeLessThan(255);
  });

  it("draws a label map's structures by their place among the set's labels, round the palette past the tenth", () => {
    const labels = [2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 17, 18];
    const t = colourTable({ kind: "labels", max: 18, labels, palette });
    // the first label takes slot 1, the tenth slot 10, the eleventh slot 1 again
    expect(t[2]).toEqual([0, 0, 0, 255]);
    expect(t[13]).toEqual([9, 9, 9, 255]);
    expect(t[17]).toEqual([0, 0, 0, 255]);
    expect(t[18]).toEqual([1, 1, 1, 255]);
  });

  it("reads the theme's colours as written: #rgb, #rrggbb, with an alpha left out, or rgb()", () => {
    expect(rgbOf("#E0393E")).toEqual([224, 57, 62]);
    expect(rgbOf(" #e0393eff ")).toEqual([224, 57, 62]);
    expect(rgbOf("#fff")).toEqual([255, 255, 255]);
    expect(rgbOf("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(rgbOf("plum")).toBeNull();
    expect(rgbOf("")).toBeNull();
  });
});
