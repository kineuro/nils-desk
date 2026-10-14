// SPDX-License-Identifier: AGPL-3.0-only
// The mask check's ways into its page (mask.tsx): the page opened with both
// panels and both masks drawn, one of its probes called or one of its values
// read, and how many doors it asked the fake engine.

import type { Page } from "@playwright/test";

/** The page with both panels drawn and both masks on them. */
export async function open(page: Page, view: "stack" | "planes", items = 3) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/mask.html?view=${view}&items=${items}`);
  await page.waitForFunction(
    () => {
      const p = (window as unknown as { maskPage?: { events: { stack: number; e: { kind: string } }[]; stacksOf: (n: number) => number[] } }).maskPage;
      if (!p) return false;
      const masks = [...document.querySelectorAll<HTMLElement>(".viewer")].map((v) => v.dataset.mask);
      return masks.length === 2 && masks.every((m) => m === "ready") && p.stacksOf(0).every((s) => p.events.some((e) => e.stack === s && e.e.kind === "mask"));
    },
    null,
    // the three planes' volumes are built and coloured in software on a runner without a GPU
    { timeout: 75_000 },
  );
  // the actors coloured: cornerstone colours a labelmap on the render after it is added
  await page.waitForTimeout(400);
  return errors;
}

/** One of the page's probes called, or one of its values read. */
export const call = <T,>(page: Page, f: string, ...args: unknown[]) =>
  page.evaluate(
    ([f, args]) => {
      const v = (window as unknown as { maskPage: Record<string, unknown> }).maskPage[f as string];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown)(...(args as unknown[])) : v;
    },
    [f, args] as const,
  ) as Promise<T>;
export const fetches = (page: Page) => page.evaluate(() => (window as unknown as { maskPage: { fetches: string[] } }).maskPage.fetches.length);

