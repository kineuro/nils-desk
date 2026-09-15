// SPDX-License-Identifier: AGPL-3.0-only
// The queue as it draws: the costliest first with the act each kind takes,
// the three cards on top with the rules' guess accepted in bulk only for the
// items triage says need no reading, and the items of one batch.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { needsOf, ofBatch, QueueTable } from "./Queue";
import { bulkPlan } from "./triage";

function item(id: number, kind: string, scope: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return { id, kind, scope, status: "open", created_at: `2026-09-0${(id % 9) + 1}T10:00:00Z`, ...over };
}

const items = [
  item(1, "technique:missing", "group", { members: 21, ref: { batch_id: 7 }, evidence: { batch_name: "alpha-2026-08-20" } }),
  item(2, "identity.collision", "subject", { evidence: { sessions: 6, place: "alpha" } }),
  item(3, "base:vote", "group", { members: 14, ref: { stack_id: 48112, batch_id: 7 }, evidence: { values: ["T1w", "T2w"], batch_name: "alpha-2026-08-20" } }),
  item(4, "session.moved", "subject", { evidence: { from: 2, to: 3, scheme: "visits-90d" } }),
  item(5, "base:low_confidence", "stack", { ref: { stack_id: 48113, batch_id: 8 } }),
  item(6, "base:missing", "stack", { status: "accepted", ref: { stack_id: 9 } }),
];

describe("the queue's table", () => {
  it("sorts the costliest first and offers Decide, Look or See by kind", () => {
    const html = renderToStaticMarkup(<QueueTable items={items} may onDecide={() => undefined} onLook={() => undefined} onSee={() => undefined} />);
    // an identity question first, then a session that moved (a subject-wide question), then the classifier's, the decided one last
    const order = [...html.matchAll(/<span class="tag ?([a-z]*)">([a-z]+)<\/span>/gu)].map((m) => m[2]);
    expect(order).toEqual(["identity", "moved", "unsure", "unsure", "unsure", "unsure"]);
    expect(html).toContain("two codes share one identifier · 6 sessions between them");
    expect(html).toContain("T1w or T2w, the vote split · 14 stacks alike");
    expect(html).toContain("scheme visits-90d");
    expect(html).toContain("alpha-2026-08-20");
    expect(html.match(/>Decide<\/button>/gu)).toHaveLength(4);
    expect(html.match(/>Look<\/button>/gu)).toHaveLength(3);
    expect(html.match(/>See<\/button>/gu)).toHaveLength(1);
    expect(html).toContain('class="decided"');
  });
  it("offers no Decide to a person who may only see", () => {
    const html = renderToStaticMarkup(<QueueTable items={items} may={false} onDecide={() => undefined} onLook={() => undefined} onSee={() => undefined} />);
    expect(html).not.toContain(">Decide</button>");
    expect(html.match(/>Look<\/button>/gu)).toHaveLength(3);
  });
});

describe("the three kinds on top", () => {
  it("count stacks, subjects and sessions, and the rules' guess only where no reading is needed", () => {
    const cards = needsOf(items);
    expect(cards.map((c) => [c.family, c.value, c.count])).toEqual([
      ["unsure", "36 stacks", 3],
      ["identity", "1 subject", 1],
      ["moved", "1 session", 1],
    ]);
    expect(cards[0].meta).toBe("batches alpha-2026-08-20, 8 · mostly technique or base · 21 with no value");
    expect(cards[1].meta).toBe("the same identifier under two codes · from source alpha");
    expect(cards[2].meta).toBe("the scheme visits-90d read new dates · cards that pinned them are marked");
    // the vote and the low-confidence items are read; the missing value is accepted in bulk, one audit row
    expect(cards[0].bulk).toBe(1);
    const plan = bulkPlan(items, [1, 3, 5, 6]);
    expect(plan.accepts.map((i) => i.id)).toEqual([1]);
    expect(plan.refused.map((r) => r.item.id)).toEqual([3, 5, 6]);
  });
  it("keeps the items of one batch when reached from its page", () => {
    expect(ofBatch(items, 7).map((i) => i.id)).toEqual([1, 3]);
    expect(ofBatch(items, null)).toHaveLength(6);
  });
});
