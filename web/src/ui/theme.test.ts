// SPDX-License-Identifier: AGPL-3.0-only
// The theme's twin tables carry the same keys, and the mark renders at 16 and
// at 256 (Wave 5 slice B1). A result's mask (record 55 H3, job type 3) is
// drawn in the theme's own colours, the same in both themes since it lies on
// the image's black, and the viewer names no colour of its own.
import { readdirSync, readFileSync } from "node:fs";
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

  it("the mask's colours are in every table, the same in each, since a mask lies on the image's black", () => {
    const values = (b: string) => Object.fromEntries([...b.matchAll(/(--n-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const tables = [block("\n:root {"), block(':root:not([data-theme="light"])'), block(':root[data-theme="dark"]')].map(values);
    for (const k of ["--n-mask-part", "--n-mask-focus", "--n-mask-flagged"]) {
      expect(tables[0][k], k).toMatch(/^#[0-9A-F]{6}$/);
      for (const t of tables) expect(t[k], k).toBe(tables[0][k]);
    }
    // three colours, told apart
    expect(new Set(["--n-mask-part", "--n-mask-focus", "--n-mask-flagged"].map((k) => tables[0][k])).size).toBe(3);
    // a flagged part is the caution colour, as the theme draws it on a dark ground (the build spec, section 4)
    expect(tables[0]["--n-mask-flagged"]).toBe(tables[1]["--n-caution-fg"]);
  });

  it("the viewer names no colour of its own: its rules and its code speak in the theme's tokens", () => {
    const dir = new URL("../viewer/", import.meta.url);
    const files = readdirSync(dir).filter((f) => /\.(css|ts|tsx)$/.test(f) && !/\.test\./.test(f));
    expect(files).toContain("mask.ts");
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), "utf8");
      expect(text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d|hsla?\(\s*\d/g), f).toBeNull();
    }
  });

  // record 55 K5b (round 4): what fills a bar or marks a step must show on the ground in both themes
  it("a mark and a bar's fill stand out from the page and the sunken ground, and a selected row from the page, in both themes", () => {
    const values = (b: string) => Object.fromEntries([...b.matchAll(/(--n-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const [name, t] of [["light", values(block("\n:root {"))], ["dark", values(block(':root:not([data-theme="light"])'))]] as const) {
      for (const k of ["--n-brand-mark", "--n-progress"]) for (const g of ["--n-bg-page", "--n-bg-sunken", "--n-bg-raised"]) expect(ratio(t[k], t[g]), `${name} ${k} on ${g}`).toBeGreaterThanOrEqual(3);
      expect(ratio(t["--n-bg-selected"], t["--n-bg-page"]), `${name} selected`).toBeGreaterThanOrEqual(1.12);
    }
  });

  it("the shell draws no mark in the plain brand colour, which vanishes on the dark ground", () => {
    for (const f of ["../shell.css", "../campaigns/campaigns.css", "../data/data.css", "../viewer/viewer.css", "../review/mainScans.css"]) {
      const text = readFileSync(new URL(f, import.meta.url), "utf8");
      const rules = text.split("}").filter((r) => /var\(--n-brand\)/.test(r));
      // a filled control carries its words in the brand's own text colour, so it stays readable; a mark has none
      for (const r of rules.filter((r) => !/color:\s*var\(--n-text-on-brand\)/.test(r))) expect(/(accent-color|outline|box-shadow|border(-top|-left)?(-color)?)\s*:[^;]*var\(--n-brand\)/.test(r) || /::before|::after|\.now \{|progress|track|meter/.test(r) && /background:\s*var\(--n-brand\)/.test(r), `${f}: ${r.trim().slice(0, 80)}`).toBe(false);
    }
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
