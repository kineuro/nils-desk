// SPDX-License-Identifier: AGPL-3.0-only
// The theme's twin tables carry the same keys, and the mark renders at 16 and
// at 256 (Wave 5 slice B1).
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

function keys(block: string): Set<string> {
  return new Set([...block.matchAll(/(--n-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

function block(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, selector).toBeGreaterThan(-1);
  let depth = 0;
  let i = css.indexOf("{", at);
  const start = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) break;
  }
  return css.slice(start, i);
}

describe("theme", () => {
  const light = keys(block("\n:root {"));
  const dark = keys(block(':root:not([data-theme="light"])'));
  const forced = keys(block(':root[data-theme="dark"]'));
  const colourKeys = [...light].filter((k) => !/^--n-(font|text-size|line-height|control|space|radius|measure)/.test(k));

  it("the light table names the surfaces, text, lines, brand, six intents and seven grains", () => {
    for (const k of ["--n-bg-page", "--n-text", "--n-line", "--n-brand", "--n-control", "--n-font-sans", "--n-font-serif", "--n-font-mono"]) expect(light.has(k), k).toBe(true);
    for (const i of ["neutral", "brand", "ok", "caution", "blocked", "gated"]) for (const p of ["fg", "bg", "line", "icon"]) expect(light.has(`--n-${i}-${p}`), `${i}-${p}`).toBe(true);
    for (const g of ["cohort", "subject", "session", "stack", "instance", "event", "group"]) expect(light.has(`--n-grain-${g}`), g).toBe(true);
  });

  it("the dark tables carry every colour key of the light table, and nothing else", () => {
    for (const k of colourKeys) {
      expect(dark.has(k), `dark lacks ${k}`).toBe(true);
      expect(forced.has(k), `forced dark lacks ${k}`).toBe(true);
    }
    for (const k of dark) expect(light.has(k), `dark adds ${k}`).toBe(true);
    for (const k of forced) expect(light.has(k), `forced dark adds ${k}`).toBe(true);
  });

  it("the two dark tables agree", () => {
    const d = block(':root:not([data-theme="light"])').replace(/\s+/g, " ");
    const f = block(':root[data-theme="dark"]').replace(/\s+/g, " ");
    const values = (b: string) => Object.fromEntries([...b.matchAll(/(--n-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    expect(values(d)).toEqual(values(f));
  });
});

describe("the mark", () => {
  const svg = readFileSync(new URL("../../public/brand/nils-mark.svg", import.meta.url), "utf8");
  for (const size of [16, 256]) {
    it(`renders at ${size}`, () => {
      const image = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render();
      expect(image.width).toBe(size);
      expect(image.height).toBe(size);
      const px = image.pixels;
      const at = (x: number, y: number) => [px[(y * size + x) * 4], px[(y * size + x) * 4 + 1], px[(y * size + x) * 4 + 2]];
      // the corner is plum, the middle of the staff is cream
      const [r, g, b] = at(1, 1);
      expect(r).toBeGreaterThan(g);
      expect(b).toBeGreaterThan(g);
      const [sr, sg, sb] = at(size >> 1, size >> 1);
      expect(Math.min(sr, sg, sb)).toBeGreaterThan(200);
    });
  }
  it("the favicon is the mark", () => {
    expect(readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8")).toBe(svg);
  });
});
