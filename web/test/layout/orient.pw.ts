// SPDX-License-Identifier: AGPL-3.0-only
// Oblique stacks are not tilted, drawn by cornerstone in a real browser
// (record 48, after the learners report): an axial volume tilted 15 and 30
// degrees, its planes banded and its head end bright, shown in the reader's
// sagittal and coronal through the stack's own planes has level bands and
// the head at the top; through the scanner's axes the sagittal shows the
// bands at the planned angle. orient.ts draws it; this reads its pixels.

import { expect, test, type Page } from "@playwright/test";

type Drawn = { grey: number[][]; camera: { viewUp: number[]; viewPlaneNormal: number[] } } | { error: string };

async function draw(page: Page, tilt: number, plane: string, cut: string): Promise<number[][]> {
  await page.goto(`/orient.html?tilt=${tilt}&plane=${plane}&cut=${cut}`);
  await page.waitForFunction(() => (window as unknown as { orient?: unknown }).orient !== undefined, null, { timeout: 20_000 });
  const d = (await page.evaluate(() => (window as unknown as { orient: unknown }).orient)) as Drawn;
  if ("error" in d) throw new Error(d.error);
  return d.grey;
}

/** The bands' angle on the picture, in degrees: how far a band moves down from a column left of centre to one right of it, the shift searched within half a band period. */
function bandAngle(img: number[][]): number {
  const h = img.length;
  const w = img[0].length;
  const [x0, x1] = [Math.round(w / 2 - 6), Math.round(w / 2 + 6)];
  // only the banded middle: the bright head end is left out
  const rows = [...Array(h).keys()].filter((y) => y > h * 0.35 && y < h * 0.75);
  let best = 0;
  let score = Infinity;
  for (let s = -8; s <= 8; s += 0.05) {
    let e = 0;
    for (const y of rows) {
      const yy = y + s;
      const lo = Math.floor(yy);
      const f = yy - lo;
      const b = img[lo][x1] * (1 - f) + img[lo + 1][x1] * f;
      e += (img[y][x0] - b) ** 2;
    }
    if (e < score - 1e-6 || (Math.abs(e - score) < 1e-6 && Math.abs(s) < Math.abs(best))) {
      score = e;
      best = s;
    }
  }
  return Math.abs((Math.atan2(best, x1 - x0) * 180) / Math.PI);
}

/** Mean brightness of the top and the bottom quarter of the picture's middle column band. */
function ends(img: number[][]): { top: number; bottom: number } {
  const h = img.length;
  const w = img[0].length;
  const mean = (y0: number, y1: number) => {
    let s = 0;
    let c = 0;
    for (let y = y0; y < y1; y++) for (let x = Math.round(w * 0.4); x < w * 0.6; x++) (s += img[y][x]), (c += 1);
    return s / c;
  };
  return { top: mean(Math.round(h * 0.1), Math.round(h * 0.3)), bottom: mean(Math.round(h * 0.7), Math.round(h * 0.9)) };
}

test.use({ viewport: { width: 300, height: 300 } });

for (const tilt of [15, 30]) {
  for (const plane of ["sagittal", "coronal"]) {
    test(`an axial stack ${tilt} degrees off: the ${plane} in the stack's planes has level bands and the head up`, async ({ page }) => {
      const img = await draw(page, tilt, plane, "acquisition");
      const a = bandAngle(img);
      const e = ends(img);
      console.log(`${tilt} ${plane} acquisition: bands at ${a.toFixed(1)} degrees, top ${Math.round(e.top)} bottom ${Math.round(e.bottom)}`);
      expect(a).toBeLessThan(1.5);
      expect(e.top).toBeGreaterThan(e.bottom);
    });
  }
  test(`an axial stack ${tilt} degrees off: the scanner's sagittal shows the tilt`, async ({ page }) => {
    const img = await draw(page, tilt, "sagittal", "patient");
    const a = bandAngle(img);
    console.log(`${tilt} sagittal patient: bands at ${a.toFixed(1)} degrees`);
    expect(Math.abs(a - tilt)).toBeLessThan(2.5);
  });
}
