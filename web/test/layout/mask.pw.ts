// SPDX-License-Identifier: AGPL-3.0-only
// A result's mask in the real viewer, drawn by cornerstone in chromium
// (record 55 H3, job type 3, build spec section 16, D1): mask.tsx shows two
// scans of an item over a fake engine that serves the instance doors and
// the result's layer doors as E1 does. The layer's labels reach the
// labelmap voxel for voxel on the stack view and on the three planes; the
// fill, the outline and the opacity apply; `o` hides the mask and shows it
// again without a read; focusing a part moves every panel to the plane of
// its anchor and zooms to its box; a click links the panels' point. The
// bench (mask-bench.pw.ts) prints the time to the next item from memory
// with its masks, and from one lesion to the next.
//
//   PORT=5297 npx playwright test mask
//   LAYOUT_FIREFOX=1 PORT=5297 npx playwright test mask --project=firefox
// Playwright's headless Firefox has no WebGL on a machine without a display
// (FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS), and the checks skip with that
// reason there. Headed on a headless compositor of its own they run: start
// one with every XDG directory and HOME in a scratch folder and a private
// session bus (dbus-run-session -- gnome-shell --headless --no-x11
// --wayland-display <name> --virtual-monitor 1600x1300), then run with
// WAYLAND_DISPLAY=<name>, that XDG_RUNTIME_DIR, MOZ_ENABLE_WAYLAND=1 and
// --headed, and stop the compositor after.

import { expect, test, type Page } from "@playwright/test";
import { call, fetches, open } from "./mask.fixture";

type Vec3 = [number, number, number];
const FOCUS_MARGIN_MM = 15;
const FOCUS_MIN_MM = 40;

test.use({ viewport: { width: 900, height: 1300 } });

// cornerstone draws through WebGL: a browser without it (Playwright's headless
// Firefox on a machine with no GL driver it can take) is said so, not failed
test.beforeEach(async ({ page }) => {
  await page.goto("about:blank");
  const why = await page.evaluate(() => {
    const c = document.createElement("canvas");
    let said = "";
    c.addEventListener("webglcontextcreationerror", (e) => (said = (e as WebGLContextEvent).statusMessage));
    return c.getContext("webgl2") ? null : said || "no WebGL 2";
  });
  test.skip(why !== null, `this browser draws no WebGL here: ${why}`);
});

/** How much redder than grey a pixel is. */
const red = (c: number[] | null) => (c ? c[0] - (c[1] + c[2]) / 2 : 0);

test("the layer's labels reach the stack view's labelmap exactly, on both scans and at every plane shown", async ({ page }) => {
  const errors = await open(page, "stack");
  const parts = await call<{ label: number; anchor: Vec3 }[]>(page, "parts");
  for (const part of parts) {
    await call(page, "point", part.anchor);
    await page.waitForTimeout(300);
    for (const stack of [100, 101]) {
      const v = await call<{ stack: { index: number } }>(page, "view", stack);
      const z = v.stack.index;
      // the stack's own plane nearest the anchor: 1 mm planes from -32, and 2 mm ones
      expect(z).toBe(stack === 100 ? part.anchor[2] + 32 : Math.round((part.anchor[2] + 32) / 2));
      expect(await call<number | null>(page, "planeDiffers", stack, 0, z), `stack ${stack} plane ${z}: voxels that differ from the layer`).toBe(0);
      // the known voxel: the anchor's column and row on a 128 by 128 plane from -64 mm
      const got = await call<number[]>(page, "labelPlane", stack, 0, z);
      const [x, y] = [part.anchor[0] + 64, part.anchor[1] + 64];
      expect(got[y * 128 + x], `the anchor of part ${part.label} on stack ${stack}`).toBe(part.label);
      // drawn: the anchor is red on the screen, a voxel beside the lesions grey
      expect(red(await call(page, "colourAt", stack, "stack", part.anchor)), `part ${part.label} drawn on stack ${stack}`).toBeGreaterThan(25);
    }
  }
  expect(red(await call(page, "colourAt", 100, "stack", [-40, -40, 10]))).toBeLessThan(8);
  expect(errors).toEqual([]);
});

test("the layer's labels fill the three planes' labelmap volume exactly, drawn on each plane", async ({ page }) => {
  const errors = await open(page, "planes");
  for (const stack of [100, 101]) {
    const v = await call<{ dims: number[]; differ: number; labelled: number } | null>(page, "volumeDiffers", stack, 0, 1);
    expect(v, `the labelmap volume of ${stack}`).not.toBeNull();
    expect(v!.dims).toEqual([128, 128, stack === 100 ? 64 : 32]);
    expect(v!.labelled).toBeGreaterThan(0);
    expect(v!.differ, `voxels of ${stack} that differ from the layer`).toBe(0);
  }
  const part = (await call<{ label: number; anchor: Vec3 }[]>(page, "parts"))[0];
  await call(page, "point", part.anchor);
  await page.waitForTimeout(500);
  for (const stack of [100, 101]) for (const where of ["axial", "coronal", "sagittal"]) expect(red(await call(page, "colourAt", stack, where, part.anchor)), `${where} of ${stack}`).toBeGreaterThan(25);
  expect(errors).toEqual([]);
});

test("fill, outline and opacity apply; o hides the mask and shows it again without a read", async ({ page }) => {
  await open(page, "stack");
  const anchor = (await call<{ anchor: Vec3 }[]>(page, "parts"))[0].anchor;
  await call(page, "point", anchor);
  await page.waitForTimeout(300);
  const style = () => call<{ fill: number; colour: number[]; outline: boolean; outlineOpacity: number }>(page, "style", 100, "stack");
  const shown = await style();
  expect(shown.fill).toBeCloseTo(0.5, 5);
  expect(shown.outline).toBe(true);
  expect(shown.outlineOpacity).toBe(1);
  // the part's colour is the theme's --n-mask-part
  const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--n-mask-part").trim());
  expect(token).toMatch(/^#[0-9a-f]{6}$/iu);
  expect(shown.colour).toEqual([1, 3, 5].map((i) => parseInt(token.slice(i, i + 2), 16)));
  const half = red(await call(page, "colourAt", 100, "stack", anchor));

  const before = await fetches(page);
  // o: hidden, nothing read; o again: shown, nothing read
  const hidden = async () => {
    const st = await style();
    return st.fill === 0 && st.outline === false && red(await call(page, "colourAt", 100, "stack", anchor)) < 8;
  };
  await page.keyboard.press("o");
  await page.waitForTimeout(250);
  expect(await hidden()).toBe(true);
  await page.keyboard.press("o");
  await page.waitForTimeout(250);
  expect(await hidden()).toBe(false);
  expect((await style()).fill).toBeCloseTo(0.5, 5);
  expect(red(await call(page, "colourAt", 100, "stack", anchor))).toBeGreaterThan(25);
  // held: hidden until let go
  await page.keyboard.down("o");
  await page.waitForTimeout(450);
  expect(await hidden()).toBe(true);
  await page.keyboard.up("o");
  await page.waitForTimeout(250);
  expect(await hidden()).toBe(false);

  // ] twice: the fill at 0.7, redder; [ seven times: at 0
  await page.keyboard.press("]");
  await page.keyboard.press("]");
  await page.waitForTimeout(250);
  expect((await style()).fill).toBeCloseTo(0.7, 5);
  expect(red(await call(page, "colourAt", 100, "stack", anchor))).toBeGreaterThan(half);
  for (let i = 0; i < 7; i++) await page.keyboard.press("[");
  await page.waitForTimeout(250);
  expect((await style()).fill).toBeCloseTo(0, 5);
  await call(page, "look", { opacity: 0.5 });
  // f: the fill alone (no outline), then the outline alone (the fill all but clear), then both
  await page.keyboard.press("f");
  await page.waitForTimeout(250);
  expect(await style()).toMatchObject({ outline: false });
  expect((await style()).fill).toBeCloseTo(0.5, 5);
  await page.keyboard.press("f");
  await page.waitForTimeout(250);
  const outline = await style();
  expect(outline.outline).toBe(true);
  expect(outline.fill).toBeLessThan(0.05);
  expect(red(await call(page, "colourAt", 100, "stack", anchor))).toBeLessThan(half);
  await page.keyboard.press("f");
  await page.waitForTimeout(250);
  expect(await style()).toMatchObject({ outline: true });
  expect((await style()).fill).toBeCloseTo(0.5, 5);
  // none of it read anything
  expect(await fetches(page)).toBe(before);
});

/** The zoom a part's box asks for on a square view, as focus.ts reckons it: the box with the margin, at least the least across. */
const scaleFor = (w: number, h: number) => Math.max((h + 2 * FOCUS_MARGIN_MM) / 2, (w + 2 * FOCUS_MARGIN_MM) / 2, FOCUS_MIN_MM / 2);

test("focusing a part moves every panel to its anchor's plane and zooms to its box; a click links the panels' point", async ({ page }) => {
  await open(page, "stack");
  const parts = await call<{ label: number; anchor: Vec3; box: [Vec3, Vec3] }[]>(page, "parts");
  const big = parts.find((p) => p.label === 3)!;
  await call(page, "focus", 3);
  await page.waitForTimeout(400);
  for (const stack of [100, 101]) {
    const v = (await call<{ stack: { index: number; focalPoint: number[]; parallelScale: number; aspect: number } }>(page, "view", stack)).stack;
    expect(v.index).toBe(stack === 100 ? big.anchor[2] + 32 : (big.anchor[2] + 32) / 2);
    const centre = [0, 1].map((a) => (big.box[0][a] + big.box[1][a]) / 2);
    expect(v.focalPoint[0]).toBeCloseTo(centre[0], 1);
    expect(v.focalPoint[1]).toBeCloseTo(centre[1], 1);
    expect(v.focalPoint[2]).toBeCloseTo(big.anchor[2], 1);
    expect(v.aspect).toBeCloseTo(1, 1);
    expect(v.parallelScale).toBeCloseTo(scaleFor(big.box[1][0] - big.box[0][0], big.box[1][1] - big.box[0][1]), 1);
  }
  // a small part: the least the view shows across
  await call(page, "focus", 2);
  await page.waitForTimeout(400);
  for (const stack of [100, 101]) expect((await call<{ stack: { parallelScale: number } }>(page, "view", stack)).stack.parallelScale).toBeCloseTo(FOCUS_MIN_MM / 2, 1);
  // focus taken away: the whole picture again, the plane kept
  await call(page, "focus", null);
  await page.waitForTimeout(400);
  const whole = (await call<{ stack: { parallelScale: number; index: number } }>(page, "view", 100)).stack;
  expect(whole.parallelScale).toBeGreaterThan(50);
  expect(whole.index).toBe(parts.find((p) => p.label === 2)!.anchor[2] + 32);

  // the second panel paged alone, then a click on it: the first follows to the plane through the point clicked
  const second = page.locator(".viewer").nth(1).locator(".viewer-stage .viewer-element");
  const box = (await second.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(400);
  const paged = (await call<{ stack: { index: number } }>(page, "view", 101)).stack.index;
  expect(paged).not.toBe((parts.find((p) => p.label === 2)!.anchor[2] + 32) / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const first = (await call<{ stack: { index: number } }>(page, "view", 100)).stack.index;
  // a 2 mm plane k sits at -32 + 2k mm, the 1 mm plane there is 2k
  expect(first).toBe(2 * paged);
});

test("focusing a part on the three planes moves each plane through its anchor and zooms each to the box", async ({ page }) => {
  await open(page, "planes");
  const big = (await call<{ label: number; anchor: Vec3; box: [Vec3, Vec3] }[]>(page, "parts")).find((p) => p.label === 3)!;
  await call(page, "focus", 3);
  await page.waitForTimeout(500);
  const ext = [0, 1, 2].map((a) => big.box[1][a] - big.box[0][a]);
  // axial shows x and y, coronal x and z, sagittal y and z; each plane on the anchor along its own normal
  const want = { axial: { along: 2, scale: scaleFor(ext[0], ext[1]) }, coronal: { along: 1, scale: scaleFor(ext[0], ext[2]) }, sagittal: { along: 0, scale: scaleFor(ext[1], ext[2]) } } as const;
  for (const stack of [100, 101]) {
    const v = await call<Record<string, { focalPoint: number[]; parallelScale: number }>>(page, "view", stack);
    for (const [plane, w] of Object.entries(want)) {
      expect(v[plane].focalPoint[w.along], `${plane} of ${stack} through the anchor`).toBeCloseTo(big.anchor[w.along], 1);
      expect(v[plane].parallelScale, `${plane} of ${stack} zoomed to the box`).toBeCloseTo(w.scale, 1);
    }
  }
});
