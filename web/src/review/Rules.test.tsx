// SPDX-License-Identifier: AGPL-3.0-only
// The rules table from a pack fixture: the values in the pack's order with
// their words, the site's adopted and proposed words as tags, a shadowed
// word named, the counts by value where the engine gives them, and the axis's
// own counts where it does not.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OverlayRow, Signals } from "../ops/client";
import { PACK } from "./pack.fixture";
import { AxisTable } from "./Rules";

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

describe("the rules table", () => {
  const technique = PACK.axes[1];
  it("lists each value with its words, flag, the site's words and its counts", () => {
    const html = renderToStaticMarkup(<AxisTable axis={technique} signals={signals} overlays={overlays} may all onAll={() => undefined} onAdd={() => undefined} />);
    expect(html).toContain("<b>MS-EPI</b>");
    expect(html).toContain("shown as RESOLVE · family EPI");
    expect(html).toContain("resolve, muse");
    expect(html).toContain("is_epi_diff_resolve, else has_segmented_kspace and has_epi");
    expect(html).toContain('<span class="tag ok">+ ms_epi for scanner Prisma 3T</span>');
    expect(html).toContain('<span class="tag brand">+ diff_ep2d proposed</span>');
    expect(html).toContain("shadowed behind an earlier word");
    expect(html).toContain('<td class="num">118</td><td class="num">2</td>');
    expect(html.match(/>Add a word<\/button>/gu)).toHaveLength(3);
    expect(html).not.toContain("This engine counts by axis");
  });
  it("falls back to the axis's counts on an engine without by_value, and folds the long tail", () => {
    const long = { ...technique, values: [...technique.values, ...Array.from({ length: 8 }, (_, i) => ({ value: `V${i}`, label: null, family: null, keywords: [], flag: null, threshold: null }))] };
    const html = renderToStaticMarkup(<AxisTable axis={long} signals={{ ...signals, by_value: undefined }} overlays={[]} may={false} all={false} onAll={() => undefined} onAdd={() => undefined} />);
    expect(html).toContain("3 more values: V5, V6, V7");
    expect(html).toContain("240 stacks sorted, 2 unsure");
    expect(html).not.toContain(">Add a word</button>");
  });
  it("says when the door numbered the values but listed no words", () => {
    const html = renderToStaticMarkup(<AxisTable axis={PACK.axes[3]} signals={null} overlays={[]} may all onAll={() => undefined} onAdd={() => undefined} />);
    expect(html).toContain("4 values; this engine lists their words with its next release.");
  });
});
