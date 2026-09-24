// SPDX-License-Identifier: AGPL-3.0-only
// The manifest's rescale (record 45 E2): a stored value is the modality's as
// stored * slope + intercept, and the window the manifest names is in the
// modality's values, so the viewer's window in stored values undoes both. A
// manifest from before has no slope and its intercept is the signed shift.

import { describe, expect, it } from "vitest";
import { storedValue, storedWindow, viewWindow, type Manifest } from "./doors";

const m = (over: Partial<Manifest>): Manifest => ({ codec: "htj2k", tile: 256, levels: 1, shape: [1, 4, 4], spacing: [1, 1, 1], dtype: "uint16", window: { center: -50, width: 400 }, ...over });

describe("the window as the planes store it", () => {
  it("undoes the slope and the intercept", () => {
    const ct = m({ slope: 2, intercept: -50 - 32768 * 2 });
    expect(storedValue(ct, -250)).toBe(32668);
    expect(storedWindow(ct)).toEqual({ lower: 32668, upper: 32868 });
  });
  it("reads a manifest from before as slope one and the shift alone", () => {
    expect(storedWindow(m({ intercept: -32768 }))).toEqual({ lower: 32518, upper: 32918 });
    expect(storedWindow(m({}))).toEqual({ lower: -250, upper: 150 });
  });
});

describe("the window the viewer shows", () => {
  it("inverts the grey where the slope is negative, so a higher value is still lighter", () => {
    const up = viewWindow(m({ slope: 2, intercept: -1000 }));
    expect(up.invert).toBe(false);
    expect(up.voiRange).toEqual({ lower: 375, upper: 575 });
    const down = viewWindow(m({ slope: -2, intercept: 1000 }));
    expect(down.invert).toBe(true);
    // stored 625 is the modality's -250 and stored 425 its 150: the range in stored values, the grey turned over
    expect(down.voiRange).toEqual({ lower: 425, upper: 625 });
  });
  it("floors a window of no width at one", () => {
    const w = viewWindow(m({ window: { center: 10, width: 0 } }));
    expect(w.voiRange.upper - w.voiRange.lower).toBe(1);
  });
});
