// SPDX-License-Identifier: AGPL-3.0-only
// Rules by axis (record 27, R5a): the chosen axis's values with the words
// that reach each, the site's own words drawn apart from the pack's, a
// proposed word marked as not adopted, the counts by value, and the three
// axes the pack reaches by no word at all, which are shown, marked, and take
// no word from anyone.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OverlayRow, Signals } from "../ops/client";
import { axisEditable, valueEditable, whyNoWords } from "./client";
import { NO_WORDS, PACK } from "./pack.fixture";
import { AxisValues, railWords } from "./Rules";

const overlays: OverlayRow[] = [
  { id: 1, name: "site-resolve", version: "1.0.0", status: "adopted", scope: "scanner Prisma 3T", document: { lists: { "technique.MS-EPI": { add: ["ms_epi"], remove: [] } } } },
  { id: 2, name: "tune-technique", version: "1.0.0", status: "proposed", scope: "batch alpha-2026-08-20", document: { lists: { "technique.DWI-EPI": { add: ["diff_ep2d"], remove: [] } } } },
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
const draw = (axis = axisNamed("technique"), may = true) => renderToStaticMarkup(<AxisValues pack={PACK} axis={axis} signals={signals} overlays={overlays} may={may} onAdd={() => undefined} />);

describe("the values of the chosen axis", () => {
  const html = draw();

  it("lists each value with its words, its label and family, and its counts", () => {
    expect(html).toContain("<b>MS-EPI</b>");
    expect(html).toContain("RESOLVE");
    expect(html).toContain("EPI");
    expect(html).toContain('<span class="word">resolve</span>');
    expect(html).toContain('<span class="word">muse</span>');
    expect(html).toContain("118 sorted · 2 unsure");
    expect(html).toContain("stands behind an earlier word");
    expect(html).not.toContain("undefined");
  });

  it("draws a word the site added apart from one the pack shipped, and a proposed one as not yet adopted", () => {
    // the pack door carries the site's adopted words among the value's own, with its own edit beside it
    const construct = draw(axisNamed("construct"));
    expect(construct).toContain('<span class="word">adc</span>');
    expect(construct).toContain('class="word site"');
    expect(construct).toContain("ep2d_site");
    // a word only proposed is not in the pack's list yet, and is drawn as pending
    expect(html).toContain('class="word proposed"');
    expect(html).toContain("diff_ep2d");
  });

  it("offers Add a word on every value the pack lets a site grow, and none to a person who may only see", () => {
    expect(html.match(/>Add a word<\/button>/gu)).toHaveLength(3);
    expect(draw(axisNamed("technique"), false)).not.toContain(">Add a word</button>");
  });

  it("says when the door numbered the values but listed none of them", () => {
    expect(draw(axisNamed("body_part"))).toContain("4 values; this engine lists their words with its next release.");
  });
});

describe("the axes that carry no words", () => {
  it("are the three the pack reaches by no word, and the pack says so, not the desk", () => {
    for (const name of NO_WORDS) {
      const axis = axisNamed(name);
      expect(axisEditable(PACK, axis)).toBe(false);
      for (const v of axis.values) expect(valueEditable(PACK, name, v.value)).toBe(false);
      expect(railWords(PACK, axis)).toBe("no words");
    }
    // every other axis of the eleven does take a word, body_part included: this door
    // only numbered its values, and the lists the pack opens still name it
    const takes = PACK.axes.filter((a) => axisEditable(PACK, a)).map((a) => a.axis);
    expect(takes).toEqual(["provenance", "technique", "modifier", "construct", "base", "body_part", "post_contrast", "directory_type"]);
  });

  it("are shown with their values all the same, and their Add a word is refused with the reason", () => {
    const html = draw(axisNamed("disposition"));
    expect(html).toContain("<b>acquisition</b>");
    expect(html).toContain("<b>working</b>");
    expect(html).toContain("no words · a rule decides");
    // the control is there and disabled, rather than missing
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("reached by no word");
    expect(whyNoWords(PACK, axisNamed("disposition"))).toBe("No words anywhere: it is decided from the axes above it.");
    expect(whyNoWords(PACK, axisNamed("role"))).toBe("No words anywhere: it is decided from the axes above it.");
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
