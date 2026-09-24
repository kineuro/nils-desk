// SPDX-License-Identifier: AGPL-3.0-only
// The queue as it draws: the costliest first with the act each kind takes,
// the three cards on top with the rules' guess accepted in bulk only for the
// items triage says need no reading, and the items of one batch.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { itemKey } from "./client";
import { needsOf, ofBatch, ofRun, QueueTable } from "./Queue";
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
    expect(cards[1].meta).toBe("the same identifier under two codes · from dataset alpha");
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

describe("the identity questions on the queue", () => {
  const held = item(7, "identity.unmapped", "batch", { members: 160, evidence: { files: 160, shape: "AA9999", place: "north" } });
  const provisional = item(8, "identity.provisional", "subject", { evidence: { place: "north" } });
  it("count held files as what they are, with Map them to the dataset's page, and never as one person twice", () => {
    const [, card] = needsOf([held]);
    expect([card.value, card.words, card.count]).toEqual(["160 files", "held until mapped", 1]);
    expect(card.meta).toBe("an identifier the map does not know · from dataset north");
    expect(card.act).toEqual({ label: "Map them", href: "#data/datasets/north/pseudonymisation" });
    // held files of two datasets are named on the Identifiers page
    expect(needsOf([held, item(9, "identity.unmapped", "batch", { evidence: { files: 20, place: "south" } })])[1].act).toEqual({ label: "Map them", href: "#review/identifiers" });
    // a collision leads, with the held files beside it
    const [, both] = needsOf([held, items[1]]);
    expect([both.value, both.words]).toEqual(["1 subject", "may be one person twice"]);
    expect(both.meta).toBe("the same identifier under two codes · from datasets north and alpha · 160 files held until mapped");
    expect(both.act).toEqual({ label: "Decide", href: "#review/identifiers" });
    // a provisional subject is merged
    const [, coded] = needsOf([provisional]);
    expect([coded.value, coded.words, coded.act?.label]).toEqual(["1 subject", "coded without a map", "Merge"]);
    expect(needsOf([])[1]).toMatchObject({ value: "0 subjects", words: "may be one person twice", count: 0, act: null });
  });
  it("offer Map them and no Decide on a held row, Merge on a provisional one, Decide on a collision", () => {
    const html = renderToStaticMarkup(<QueueTable items={[held, provisional, items[1]]} may onDecide={() => undefined} onLook={() => undefined} onSee={() => undefined} />);
    expect(html).toContain("160 files held until the map names an identifier shaped AA9999");
    expect(html).toContain('href="#data/datasets/north/pseudonymisation">Map them</a>');
    expect(html).toContain('href="#review/identifiers">Merge</a>');
    expect(html.match(/>Decide<\/button>/gu)).toHaveLength(1);
  });
});

describe("a run's pipeline:qc items below detail quasi", () => {
  // as the engine lists them (w49 dd41d9a): one entry a check or reason, no id, a count held to 5
  const grouped = [
    { kind: "pipeline:qc", grouped: true, scope: "run", status: "open", ref: { run_id: 9, pipeline: "volumes@1" }, evidence: { status: "breach", check: "snr >= 8" }, group_key: "run:9", units: 6 },
    { kind: "pipeline:qc", grouped: true, scope: "run", status: "open", ref: { run_id: 9, pipeline: "volumes@1" }, evidence: { status: "breach", check: "holes <= 200" }, group_key: "run:9", units: null, withheld: true },
    { kind: "pipeline:qc", grouped: true, scope: "run", status: "open", ref: { run_id: 9, pipeline: "volumes@1" }, evidence: { status: "failed", check: null }, group_key: "run:9", units: 7 },
  ] as unknown as ReviewItem[];
  it("draws each group with its check and count, fewer than five where withheld, and nothing to open or decide", () => {
    const html = renderToStaticMarkup(<QueueTable items={grouped} may onDecide={() => undefined} onLook={() => undefined} onSee={() => undefined} />);
    expect(html).toContain("snr &gt;= 8 in run 9: 6 units");
    expect(html).toContain("holes &lt;= 200 in run 9: fewer than five units");
    expect(html).toContain("failed in run 9: 7 units");
    expect(html).not.toContain(">Decide</button>");
    expect(html).not.toContain("undefined");
    expect(html.match(/counted at your detail/gu)).toHaveLength(3);
    expect(ofRun(grouped, 9)).toHaveLength(3);
    expect(new Set(grouped.map(itemKey)).size).toBe(3);
  });
});
