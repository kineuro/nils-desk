// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's proposed rule fixes in one line on its detail (record 56,
// 5.3): how many wait for a person, "from this read", with the way to them,
// the caution bar while one waits; and a plain line with the way to the
// rules when none does.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixesWords, RuleFixesLine } from "./RuleFixesLine";

describe("a dataset's proposed rule fixes", () => {
  it("say how many wait, from this read, and lead to them", () => {
    expect(fixesWords({ proposed: 3, adopted: 0, rejected: 0 })).toBe("3 proposed rule fixes from this read");
    expect(fixesWords({ proposed: 1, adopted: 0, rejected: 0 })).toBe("1 proposed rule fix from this read");
    const html = renderToStaticMarkup(<RuleFixesLine dataset="ward-c" counts={{ proposed: 3, adopted: 2, rejected: 1 }} link />);
    expect(html).toBe(
      '<div class="fixes-line waiting" aria-label="Proposed rule fixes"><span>3 proposed rule fixes from this read</span><span class="meta">2 adopted</span><a class="button quiet small" href="#review/rules/proposals?dataset=ward-c">Review them</a></div>',
    );
  });

  it("say so plainly when none waits, and offer the rules to one who may read them", () => {
    expect(renderToStaticMarkup(<RuleFixesLine dataset="ward-c" counts={{ proposed: 0, adopted: 0, rejected: 0 }} link />)).toBe(
      '<div class="fixes-line" aria-label="Proposed rule fixes"><span>No rule fix proposed from this read</span><a class="button quiet small" href="#review/rules/quality?dataset=ward-c">Rules</a></div>',
    );
    expect(renderToStaticMarkup(<RuleFixesLine dataset="ward-c" counts={{ proposed: 2, adopted: 0, rejected: 0 }} link={false} />)).not.toContain("<a");
  });
});
