// SPDX-License-Identifier: AGPL-3.0-only
// Making a verify campaign in the form (record 58 P1, spec 12.3): the Verify
// purpose beside the four of Wave 7a; with it the planted share at 10 %, a
// seed, and the confusion table pasted or read from a file, said under the
// field as rows; nothing shown beside each item cannot be chosen, since the
// proposal is what the reader verifies.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { capsFor } from "./caps.fixture";
import { emptyDraft, type Draft } from "./client";
import { MakeForm } from "./MakeCampaign";

const none = () => undefined;
const draft = (p: Partial<Draft>): Draft => ({ ...emptyDraft(), name: "verify-december", kind: "axes", axes: ["technique"], ...p });
const form = (d: Draft) => renderToStaticMarkup(<MakeForm caps={capsFor()} draft={d} pack={null} onChange={none} />);

describe("the make form in verify", () => {
  it("offers Verify as a purpose, and with it the share, the seed and the table", () => {
    const html = form(draft({ purpose: "verify", seed: "0123456789abcdef" }));
    expect(html).toContain('aria-pressed="true">Verify</button>');
    expect(html).toContain('aria-label="Planted share" value="0.1"');
    expect(html).toContain('aria-label="Seed" value="0123456789abcdef"');
    expect(html).toContain('aria-label="Confusion table"');
    expect(html).toContain("None: a random other legal value is planted.");
    expect(html).toContain("Read a file");
    // the proposal is shown first: nothing cannot be chosen beside each item
    expect(html).toContain('title="a verify campaign shows its proposal first"');
  });

  it("says the rows a pasted table gives", () => {
    const html = form(draft({ purpose: "verify", seed: "s", plantedFrom: "MPRAGE\tMEMPRAGE\t12\nTSE\t3D-TSE\t4\njunk\n" }));
    expect(html).toContain("2 rows · 16 confusions · 1 line skipped. The commonest wrong value for each true value is planted.");
  });

  it("shows none of it for another purpose", () => {
    const html = form(draft({ purpose: "measure" }));
    expect(html).not.toContain("Planted share");
    expect(html).not.toContain("Confusion table");
    expect(html).not.toContain("a verify campaign shows its proposal first");
  });
});
