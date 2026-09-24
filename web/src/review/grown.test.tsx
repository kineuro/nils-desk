// SPDX-License-Identifier: AGPL-3.0-only
// Review's grown families on the queue (record 45 S5, S7): picks, models'
// proposals and System 1's asked items are counted apart from the rules'
// unsure, each has a page of its own under Review, and a row of one opens
// that page rather than a decision.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { ASKED_ITEM } from "./asked.fixture";
import { BORDER } from "./picks.fixture";
import { needsOf, QueueTable } from "./Queue";
import { familyCounts, subOf } from "./ReviewPage";

const MODEL: ReviewItem = { id: 30, kind: "body_part:model", scope: "group", status: "open", created_at: "2026-09-24T10:00:00Z", members: 7, evidence: { axis: "body_part", value: "chest", tier: "below", model: "bodypart-head@1" } };
const UNSURE: ReviewItem = { id: 31, kind: "base:missing", scope: "stack", status: "open", created_at: "2026-09-24T10:00:00Z", ref: { stack_id: 5 } };

describe("the grown families on the queue", () => {
  it("name their pages, and an unknown page is the queue", () => {
    expect(["picks", "proposals", "asked", "rules", "nowhere", null].map(subOf)).toEqual(["picks", "proposals", "asked", "rules", "queue", "queue"]);
  });
  it("are counted from the summary where the engine gives one, else from the items", () => {
    expect(familyCounts([], { by_kind: { "pick.border": 4, "body_part:model": 3, "base:model": 1, "classify.asked": 2, "base:missing": 9 }, cohorts: [], none: 0 })).toEqual({ picks: 4, proposals: 4, asked: 2 });
    expect(familyCounts([BORDER, MODEL, ASKED_ITEM, UNSURE, { ...MODEL, id: 32, status: "staged" }], null)).toEqual({ picks: 1, proposals: 1, asked: 1 });
  });
  it("leave the rules' unsure card to the rules' own items", () => {
    const [unsure] = needsOf([BORDER, MODEL, ASKED_ITEM, UNSURE]);
    expect([unsure.value, unsure.count]).toEqual(["1 stack", 1]);
  });
  it("open their page from a row, and offer no Decide there", () => {
    const html = renderToStaticMarkup(<QueueTable items={[BORDER, MODEL, ASKED_ITEM]} may onDecide={() => undefined} onLook={() => undefined} onSee={() => undefined} />);
    expect(html).toContain('href="#review/picks"');
    expect(html).toContain('href="#review/proposals"');
    expect(html).toContain('href="#review/asked"');
    expect(html).not.toContain(">Decide</button>");
    expect(html).toContain("chest proposed by bodypart-head@1 at below · 7 stacks alike");
  });
});
