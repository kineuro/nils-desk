// SPDX-License-Identifier: AGPL-3.0-only
// Sheared, anisotropic and double oblique stacks are drawn where their
// planes are, in a real browser: shear.ts draws a head-like ellipsoid
// sampled at the stack's true voxel positions in the reader's three planes;
// this reads the pixels back and checks each plane is upright (the
// ellipse's axes square to the screen), correctly proportioned (its width
// over its height as the radii say), whole (not clipped), and the head's
// cap at the top. A sheared stack held the old way, its planes unshifted,
// fails the same check.

import { expect, test, type Page } from "@playwright/test";

type Drawn = { planes: Record<string, number[][]>; grid: { size: [number, number]; sheared: boolean } } | { error: string };

const rad = (d: number) => (d * Math.PI) / 180;
type V = [number, number, number];
const rotX = (v: V, d: number): V => [v[0], Math.cos(rad(d)) * v[1] - Math.sin(rad(d)) * v[2], Math.sin(rad(d)) * v[1] + Math.cos(rad(d)) * v[2]];
const rotZ = (v: V, d: number): V => [Math.cos(rad(d)) * v[0] - Math.sin(rad(d)) * v[1], Math.sin(rad(d)) * v[0] + Math.cos(rad(d)) * v[1], v[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (...vs: [number, V][]): V => [0, 1, 2].map((i) => vs.reduce((s, [k, v]) => s + k * v[i], 0)) as V;

interface Case {
  name: string;
  row: V;
  col: V;
  /** The step: along the normal by `dz`, plus a part along the row and the column. */
  dz: number;
  inRow: number;
  inCol: number;
  shape: [number, number, number];
  ps: [number, number];
  oblique: boolean;
}

const tiltedRow = rotZ(rotX([1, 0, 0], 20), 15);
const tiltedCol = rotZ(rotX([0, 1, 0], 20), 15);
const CASES: Case[] = [
  // an axial on a gantry tilted 20 degrees: square planes, each 1.8 mm further forward
  { name: "a gantry-tilted axial (20 degree shear)", row: [1, 0, 0], col: [0, 1, 0], dz: 5, inRow: 0, inCol: 5 * Math.tan(rad(20)), shape: [40, 256, 256], ps: [0.9, 0.9], oblique: false },
  // an axial 20 degrees off, voxels 0.5 by 0.5 by 5 mm, no shear
  { name: "an oblique axial of 0.5 x 0.5 x 5 mm voxels", row: rotX([1, 0, 0], 20), col: rotX([0, 1, 0], 20), dz: 5, inRow: 0, inCol: 0, shape: [40, 400, 400], ps: [0.5, 0.5], oblique: true },
  // a double oblique (20 and 15 degrees) whose planes also shift along the row and the column
  { name: "a double oblique with an 18 degree shear", row: tiltedRow, col: tiltedCol, dz: 4, inRow: 1.0, inCol: 0.8, shape: [50, 256, 256], ps: [0.9, 0.9], oblique: true },
  // a sagittal, planes running to the patient's right (against x), sheared along its columns
  { name: "a sagittal running right to left with a 10 degree shear", row: [0, 1, 0], col: [0, 0, -1], dz: 3, inRow: 0, inCol: 3 * Math.tan(rad(10)), shape: [60, 256, 256], ps: [0.9, 0.9], oblique: false },
];

function url(c: Case, cut: string, frame: string, noshear = false): string {
  const normal = cross(c.row, c.col);
  const step = add([c.dz, normal], [c.inRow, c.row], [c.inCol, c.col]);
  const q = new URLSearchParams({ o: JSON.stringify([...c.row, ...c.col]), step: JSON.stringify(step), shape: JSON.stringify(c.shape), ps: JSON.stringify(c.ps), cut, frame, noshear: noshear ? "1" : "0" });
  return `/shear.html?${q}`;
}

async function draw(page: Page, u: string) {
  await page.goto(u);
  await page.waitForFunction(() => (window as unknown as { sheared?: unknown }).sheared !== undefined, null, { timeout: 60_000 });
  const d = (await page.evaluate(() => (window as unknown as { sheared: unknown }).sheared)) as Drawn;
  if ("error" in d) throw new Error(d.error);
  return d;
}

/** The ellipse on a picture: its width over its height, how far its axes are turned from the screen's, how much of its box it fills, and whether its cap is at the top. */
function measure(img: number[][]) {
  const h = img.length;
  const w = img[0].length;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  let cn = 0;
  let cy = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (img[y][x] <= 60) continue;
      n += 1;
      sx += x;
      sy += y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (img[y][x] > 200) {
        cn += 1;
        cy += y;
      }
    }
  const [mx, my] = [sx / n, sy / n];
  let mxx = 0;
  let myy = 0;
  let mxy = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (img[y][x] <= 60) continue;
      mxx += (x - mx) ** 2;
      myy += (y - my) ** 2;
      mxy += (x - mx) * (y - my);
    }
  const theta = (0.5 * Math.atan2(2 * mxy, mxx - myy) * 180) / Math.PI;
  const turn = Math.min(Math.abs(theta), Math.abs(90 - Math.abs(theta)));
  const [bw, bh] = [x1 - x0 + 1, y1 - y0 + 1];
  return { ratio: bw / bh, turn, fill: n / ((Math.PI / 4) * bw * bh), capTop: cn === 0 ? null : cy / cn < my, touches: x0 <= 0 || y0 <= 0 || x1 >= w - 1 || y1 >= h - 1 };
}

/** Width over height of each plane: the radii are 50 (left-right), 65 (front-back) and 80 mm (feet-head). */
const RATIO = { axial: 50 / 65, coronal: 50 / 80, sagittal: 65 / 80 };

function check(d: Exclude<Drawn, { error: string }>, label: string): string[] {
  const bad: string[] = [];
  for (const p of ["axial", "coronal", "sagittal"] as const) {
    const m = measure(d.planes[p]);
    console.log(`${label} ${p}: ratio ${m.ratio.toFixed(3)} (want ${RATIO[p].toFixed(3)}), turned ${m.turn.toFixed(2)} degrees, fills ${m.fill.toFixed(3)}, cap on top ${m.capTop}`);
    if (Math.abs(m.ratio / RATIO[p] - 1) > 0.04) bad.push(`${p} ratio ${m.ratio.toFixed(3)}`);
    if (m.turn > 1.5) bad.push(`${p} turned ${m.turn.toFixed(1)}`);
    if (m.fill < 0.96 || m.touches) bad.push(`${p} clipped (fills ${m.fill.toFixed(3)})`);
    if (p !== "axial" && m.capTop !== true) bad.push(`${p} cap not on top`);
  }
  return bad;
}

test.use({ viewport: { width: 780, height: 260 } });

for (const c of CASES) {
  test(`${c.name}: the scanner's planes show the head upright, in proportion and whole`, async ({ page }) => {
    const d = await draw(page, url(c, "patient", "patient"));
    expect(check(d, `${c.name}, scanner axes`)).toEqual([]);
  });
  test(`${c.name}: the stack's planes show a head aligned to the stack upright, in proportion and whole`, async ({ page }) => {
    const d = await draw(page, url(c, "acquisition", c.oblique ? "stack" : "patient"));
    expect(check(d, `${c.name}, stack's planes`)).toEqual([]);
  });
  if (c.inRow !== 0 || c.inCol !== 0) {
    test(`${c.name}: held unshifted, as before the step was read, the same head is skewed`, async ({ page }) => {
      const d = await draw(page, url(c, "patient", "patient", true));
      expect(d.grid.sheared).toBe(false);
      expect(check(d, `${c.name}, unshifted`).length).toBeGreaterThan(0);
    });
  }
}
