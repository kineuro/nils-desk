// SPDX-License-Identifier: AGPL-3.0-only
// The mask's bench (record 55 H3, job type 3, build spec sections 13 and 16,
// D1): the reader's next item drawn from memory with its masks, its items
// ahead warmed with their layers, against the same items with no mask; and
// from one lesion to the next on the stack view and on the three planes.
// It runs on the machine's GPU where it has one (as scripts/viewer-bench.mjs
// does): headless chromium otherwise draws WebGL in software, whose frames
// are a loaded machine's, not a reader's.
//
//   PORT=5297 npx playwright test mask-bench

import { expect, test } from "@playwright/test";
import { call, fetches, open } from "./mask.fixture";

test.use({ viewport: { width: 900, height: 1300 }, channel: "chromium", launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"] } });

test("the next item from memory with its masks, and lesion to lesion", async ({ page }) => {
  test.setTimeout(150_000);
  const items = 10;
  const renderer = async () => page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const d = gl?.getExtension("WEBGL_debug_renderer_info");
    return d && gl ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : "none";
  });
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const run = async (mask: boolean) => {
    await page.goto(`/mask.html?view=stack&items=${items}${mask ? "" : "&mask=off"}`);
    await page.waitForFunction(() => (window as unknown as { maskPage?: { events: { e: { kind: string } }[] } }).maskPage?.events.filter((e) => e.e.kind === "first-image").length === 2, null, { timeout: 30_000 });
    await page.waitForTimeout(600);
    const out: { pictures: number; masks: number; frame: number }[] = [];
    for (let i = 0; i < items - 1; i++) {
      // the items ahead warmed (with their layers) while this one is read
      await call(page, "warm");
      await page.waitForTimeout(400);
      const before = await fetches(page);
      out.push(await call(page, "next"));
      // from memory: the next item read nothing
      expect(await fetches(page), `item ${i + 1} read nothing`).toBe(before);
      await page.waitForTimeout(300);
    }
    return out;
  };
  // the items with no mask first, then with (the page's code is warm for both)
  const bare = await run(false);
  const masked = await run(true);
  const gpu = await renderer();
  // lesion to lesion on the stack view: a plane decoded from memory, the camera moved
  const hops: Record<string, { ms: number; frames: number }[]> = { stack: [], planes: [] };
  for (const label of [1, 3, 1, 3, 1, 3]) hops.stack.push(await call(page, "focusTimed", label, ["stack"]));
  // lesion to lesion on the three planes: only the cameras move
  await open(page, "planes", 2);
  for (const label of [1, 3, 1, 3, 1, 3]) hops.planes.push(await call(page, "focusTimed", label, ["axial", "coronal", "sagittal"]));

  const pics = masked.map((n) => Math.round(n.pictures));
  const masks = masked.map((n) => Math.round(n.masks));
  const bares = bare.map((n) => Math.round(n.pictures));
  const frame = Math.round(median(masked.map((n) => n.frame)));
  const line = (xs: { ms: number; frames: number }[]) => xs.map((x) => `${Math.round(x.ms)} ms/${x.frames}f`).join(", ");
  console.log(`renderer: ${gpu}; a frame ${frame} ms`);
  console.log(`next item from memory, two panels: pictures ${pics.join(", ")} ms (median ${median(pics)}); their masks on the screen ${masks.join(", ")} ms (median ${median(masks)}); the same items with no mask: pictures ${bares.join(", ")} ms (median ${median(bares)})`);
  console.log(`lesion to lesion, stack view: ${line(hops.stack)}; three planes: ${line(hops.planes)}`);
  // the masks do not hold the pictures back, and follow them within two frames (cornerstone colours a labelmap on its next render)
  expect(median(pics)).toBeLessThanOrEqual(median(bares) + 10);
  expect(median(masks)).toBeLessThanOrEqual(median(pics) + 2 * frame + 10);
  // from lesion to lesion on the three planes, one frame
  expect(median(hops.planes.map((h) => h.frames))).toBeLessThanOrEqual(1);
});
