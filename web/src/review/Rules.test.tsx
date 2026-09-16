// SPDX-License-Identifier: AGPL-3.0-only
// Rules by axis (record 27, R5a): the chosen axis's values with the words
// that reach each, the site's own words drawn apart from the pack's and said
// for which scope adopted them, how a value is reached by flags whether or
// not a word reaches it too, the counts by value and by axis, the three axes
// the pack reaches by no word at all, and what the page says of a pack whose
// engine lets a site amend its buckets alone.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OverlayRow, Signals } from "../ops/client";
import { axisEditable, axisHasWords, valueEditable, whyNoWords, type PackDoc, type PackValue } from "./client";
import { NO_WORDS, PACK, PACK_4 } from "./pack.fixture";
import { AxisValues, railWords } from "./Rules";

const overlays: OverlayRow[] = [
  { id: 1, name: "site-resolve", version: "1.0.0", status: "adopted", scope: "scanner Prisma 3T", document: { lists: { "technique.MS-EPI": { add: ["ms_epi"], remove: [] } } } },
  { id: 2, name: "tune-technique", version: "1.0.0", status: "proposed", scope: "batch alpha-2026-08-20", document: { lists: { "technique.DWI-EPI": { add: ["diff_ep2d"], remove: [] } } } },
  // the pack door names this one among construct.diffusion's own words too, so the page must draw it once and say which scope adopted it
  { id: 3, name: "site-ep2d", version: "1.0.0", status: "adopted", scope: "everything", document: { lists: { "construct.diffusion": { add: ["ep2d_site"], remove: [] } } } },
];

const signals = {
  scope: "batch:12",
  axes: { technique: { tiers: { keyword: 200, flag: 40 }, confidence: {}, open_review: { "technique:vote": 2 }, disagreeing_terms: [] } },
  open_review: {},
  diagnostics: {},
  shadowed_keywords: ["spc"],
  unused_overlay_terms: [],
  by_value: { technique: { "MS-EPI": { decided: 12, unsure: 0 }, "DWI-EPI": { decided: 86, unsure: 0 }, "SS-GRE": { decided: 118, unsure: 2 } } },
} as Signals;

const axisNamed = (name: string) => PACK.axes.find((a) => a.axis === name)!;
const axis4 = (name: string) => PACK_4.axes.find((a) => a.axis === name)!;
const draw = (axis = axisNamed("technique"), may = true, pack: PackDoc = PACK, s: Signals | null = signals) =>
  renderToStaticMarkup(<AxisValues pack={pack} axis={axis} signals={s} overlays={overlays} may={may} onAdd={() => undefined} />);

describe("the values of the chosen axis", () => {
  const html = draw();

  it("lists each value with its words, its label and family, how it is reached, and its counts", () => {
    expect(html).toContain('<b>MS-EPI</b><span class="meta">RESOLVE</span><span class="meta">EPI</span>');
    // the flag is how a worded value is actually reached, and the page says so for every value that has one
    expect(html).toContain("reached first by is_epi_diff_resolve, else has_segmented_kspace and has_epi");
    expect(html).toContain("reached first by is_dwi");
    expect(html).toContain("reached first by is_3d_tse");
    expect(html).toContain('<span class="word">resolve</span>');
    expect(html).toContain('<span class="word">muse</span>');
    expect(html).toContain("118 sorted · 2 unsure");
    expect(html).toContain("stands behind an earlier word");
    expect(html).not.toContain("undefined");
  });

  it("draws a word the site adopted apart from one the pack shipped, says which scope adopted it, and marks one only proposed", () => {
    expect(html).toContain('<span class="word site" title="adopted for scanner Prisma 3T">ms_epi<small class="scope">scanner Prisma 3T</small></span>');
    expect(html).toContain('<span class="word proposed" title="proposed for batch alpha-2026-08-20, not adopted yet">diff_ep2d<small class="scope">batch alpha-2026-08-20, proposed</small></span>');
    // this door named the site's word among the value's own words: it is drawn once, as the site's, with the scope the overlay names
    const construct = draw(axisNamed("construct"));
    expect(construct).toContain('<span class="word">adc</span>');
    expect(construct).toContain('<span class="word site" title="adopted for everything">ep2d_site<small class="scope">everything</small></span>');
    expect(construct.match(/ep2d_site/gu)).toHaveLength(1);
  });

  it("offers Add a word on every value the pack lets a site grow, and none to a person who may only see", () => {
    expect(html.match(/>Add a word<\/button>/gu)).toHaveLength(3);
    expect(draw(axisNamed("technique"), false)).not.toContain(">Add a word</button>");
  });

  it("says when the door numbered the values but listed none of them, and keeps the axis's own counts all the same", () => {
    const counted = { ...signals, by_value: undefined, axes: { ...signals.axes, body_part: { tiers: { keyword: 90, flag: 10 }, confidence: {}, open_review: { "body_part:vote": 4 }, disagreeing_terms: [] } } } as Signals;
    const html = draw(axisNamed("body_part"), true, PACK, counted);
    expect(html).toContain("4 values; this engine lists their words with its next release.");
    expect(html).toContain("100 sorted on this axis, 4 unsure.");
  });

  it("folds the long tail behind one button, and falls back to the axis's counts on an engine without by_value", () => {
    const value = (v: string): PackValue => ({ value: v, label: null, family: null, keywords: [], flag: null, threshold: null, list: null, site: null });
    const technique = axisNamed("technique");
    const long = { ...technique, values: [...technique.values, ...Array.from({ length: 8 }, (_, i) => value(`V${i}`))] };
    const html = draw(long, false, PACK, { ...signals, by_value: undefined } as Signals);
    expect(html).toContain("All 11 values");
    expect(html).toContain("<b>V6</b>");
    expect(html).not.toContain("<b>V7</b>");
    expect(html).toContain("240 sorted on this axis, 2 unsure.");
    expect(html).not.toContain(">Add a word</button>");
  });
});

describe("the axes that carry no words", () => {
  it("are the three the pack reaches by no word, and the pack says so, not the desk", () => {
    for (const name of NO_WORDS) {
      const axis = axisNamed(name);
      expect(axisEditable(PACK, axis)).toBe(false);
      expect(axisHasWords(PACK, axis)).toBe(false);
      for (const v of axis.values) expect(valueEditable(PACK, name, v.value)).toBe(false);
      expect(railWords(PACK, axis)).toBe("no words");
    }
    // every other axis of the eleven does take a word, body_part included: this door
    // only numbered its values, and the lists the pack opens still name it
    const takes = PACK.axes.filter((a) => axisEditable(PACK, a)).map((a) => a.axis);
    expect(takes).toEqual(["provenance", "technique", "modifier", "construct", "base", "body_part", "post_contrast", "directory_type"]);
    // base holds no word today and the pack opens a list on it, so it is never marked wordless
    expect(axisHasWords(PACK, axisNamed("base"))).toBe(true);
  });

  it("are shown with their values all the same, and their Add a word is refused with the reason", () => {
    const html = draw(axisNamed("disposition"));
    expect(html).toContain("<b>acquisition</b>");
    expect(html).toContain("<b>working</b>");
    expect(html).toContain("no words · a rule decides");
    // the refused control is Add a word itself, disabled rather than missing, and it says why
    expect(html).toContain('<button type="button" class="button quiet small" disabled="" title="This value is reached by no word, so a site adds none to it.">Add a word</button>');
    expect(whyNoWords(PACK, axisNamed("disposition"))).toBe("No words anywhere: it is decided from the axes above it.");
    expect(whyNoWords(PACK, axisNamed("role"))).toBe("No words anywhere: it is decided from the axes above it.");
  });
});

describe("a pack whose engine lets a site amend its buckets alone", () => {
  const ENGINE = "This engine lets a site grow contrast_positive, contrast_negative, localizer_words, diffusion_tokens only.";

  it("refuses Add a word with the engine's reason, never by calling a worded value wordless", () => {
    const html = draw(axis4("technique"), true, PACK_4);
    expect(html.match(/>Add a word<\/button>/gu)).toHaveLength(3);
    expect(html).toContain(`<button type="button" class="button quiet small" disabled="" title="${ENGINE}">Add a word</button>`);
    expect(html).not.toContain("This value is reached by no word");
    // the words are still the pack's, and still shown
    expect(html).toContain('<span class="word">resolve</span>');
    expect(html).toContain("reached first by is_epi_diff_resolve, else has_segmented_kspace and has_epi");
  });

  it("keeps the site's adopted word, which this door attaches to no value of its own", () => {
    expect(axis4("technique").values[0].site).toBeNull();
    expect(draw(axis4("technique"), true, PACK_4)).toContain('<span class="word site" title="adopted for scanner Prisma 3T">ms_epi<small class="scope">scanner Prisma 3T</small></span>');
  });

  it("offers Add a word where a bucket stands for the value, and marks no axis wordless for carrying words the engine will not amend", () => {
    expect(valueEditable(PACK_4, "post_contrast", "yes")).toBe(true);
    expect(axisEditable(PACK_4, axis4("post_contrast"))).toBe(true);
    expect(axisEditable(PACK_4, axis4("technique"))).toBe(false);
    expect(railWords(PACK_4, axis4("technique"))).toBe("3 lists");
    expect(railWords(PACK_4, axis4("disposition"))).toBe("no words");
  });
});

describe("the axis rail", () => {
  it("says what each axis's rules are made of, or that it takes no word", () => {
    expect(PACK.axes.map((a) => railWords(PACK, a))).toEqual([
      "2 lists",
      "3 lists",
      "1 list",
      "1 list",
      "flags and physics",
      "4 values",
      "2 lists",
      "1 list",
      "no words",
      "no words",
      "no words",
    ]);
  });
});
