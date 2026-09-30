// SPDX-License-Identifier: AGPL-3.0-only
// Record 51 slice C on the Review queue: the queue filters by axis and by
// reason in the page's address, carries the filter to the campaign maker as
// the source `--review-kind` or `--review-prefix` makes, and a model that
// disagrees with a person's decision carries a badge in the queue and in Look.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyDraft, makeBody, prefillOf } from "../campaigns/client";
import type { Grant } from "../grants";
import { GRANTS } from "../grants";
import type { ReviewItem } from "../ops/client";
import { PLACEHOLDERS } from "../home/placeholders";
import { parse } from "../routes";
import { capsWith } from "./caps.fixture";
import { DISAGREES, itemWords, modelDisagrees } from "./client";
import { filterChoices, filterKind, NO_FILTER, passes, queueFilterOf, queueHref } from "./filter";
import { LookDialog, QueuePage, QueueTable } from "./Queue";

function item(id: number, kind: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return { id, kind, scope: "stack", status: "open", created_at: `2026-09-0${(id % 9) + 1}T10:00:00Z`, ref: { stack_id: 100 + id }, ...over };
}

const items: ReviewItem[] = [
  item(1, "base:conflict", { evidence: { axis: "base", value: "T1w", other: "T2w" } }),
  item(2, "base:conflict", { evidence: { axis: "base", value: "T2w", other: "PDw" } }),
  item(3, "base:low_confidence", { evidence: { value: "T1w" } }),
  item(4, "technique:conflict", { evidence: {} }),
  item(5, "technique:missing", { evidence: {} }),
  item(6, "pick.border", { scope: "subject", ref: { subject_id: 2, session_day: "2010-01-01", role: "t1w" }, evidence: { borders: ["too_close"] } }),
  item(7, "pick.border", { scope: "subject", ref: { subject_id: 3, session_day: "2011-01-01", role: "flair" }, evidence: { borders: ["retake", "rare"] } }),
  item(8, "identity.collision", { scope: "subject", evidence: {} }),
];

// as the engine raises it (record 51 R5, kineuro/nils proposals::ingest)
const disagrees = item(9, "body_part:decision", {
  evidence: {
    axis: "body_part",
    decision: "spine",
    decision_id: 41,
    decided_by: "anna@lab",
    source: "model",
    model: { id: 3, name: "bp-head", version: "1", digest: `sha256:${"1".repeat(64)}`, state: "admitted" },
    model_id: 3,
    value: "brain",
    confidence: 0.95,
    threshold: 0.8,
    run_id: 7,
  },
});

/** The badge as a static render writes it. */
const BADGE = DISAGREES.replace(/'/gu, "&#x27;");

const built = PLACEHOLDERS.some((p) => p.id === "campaigns" && p.built === true);
const caps = capsWith(["POST /api/campaigns", "GET /api/campaigns", "GET /api/review/summary"], [...GRANTS] as Grant[]);

describe("the queue's filter by axis and reason", () => {
  it("offers the axes and reasons of the kinds the engine lists, and a pick border's reasons", () => {
    const summary = { by_kind: { "base:conflict": 2, "base:low_confidence": 1, "technique:conflict": 1, "technique:missing": 1, "pick.border": 2, "identity.collision": 1, "pipeline:qc": 3 }, cohorts: [], none: 0 };
    expect(filterChoices(summary, items)).toEqual({ axes: ["base", "technique"], reasons: ["missing", "conflict", "low_confidence", "pick.border"], borders: ["rare", "retake", "too_close"] });
    expect(filterChoices(null, items).axes).toEqual(["base", "technique"]);
  });

  it("keeps base:conflict through a reload, shows only those items, and hands --review-kind base:conflict to the maker", () => {
    const address = queueHref({ axis: "base", reason: "conflict", border: null }, "north");
    expect(address).toBe("#review?cohort=north&axis=base&reason=conflict");
    // a reload reads the page's address back
    const route = parse(address);
    expect(route.section).toBe("review");
    const filter = queueFilterOf(route.query);
    expect(filter).toEqual({ axis: "base", reason: "conflict", border: null });
    expect(items.filter((i) => passes(i, filter)).map((i) => i.id)).toEqual([1, 2]);
    // the page drawn from that address lists the two and nothing else
    const html = renderToStaticMarkup(
      <QueuePage caps={caps} items={items} summary={null} cohort="north" onCohort={() => undefined} batch={null} onDecide={() => undefined} onExplain={() => undefined} onChanged={() => undefined} filter={filter} onFilter={() => undefined} />,
    );
    expect(html).toContain("base: rules conflict, 2 open");
    expect(html.match(/<tr class="">/gu)).toHaveLength(2);
    expect(html).toContain("T1w over T2w: two rules on base disagree");
    const body = /<tbody>(.*)<\/tbody>/su.exec(html)?.[1] ?? "";
    expect(body).not.toContain("technique");
    expect(body).not.toContain("not sure");
    expect(html).toContain('aria-pressed="true">base</button>');
    // "Ask people about these" carries it to the maker as a kind, the source --review-kind makes
    expect(filterKind(filter)).toEqual({ kind: "base:conflict" });
    const ask = /href="(#campaigns\?make=review[^"]*)">Ask people about these/u.exec(html);
    expect(ask !== null).toBe(built);
    const href = (ask?.[1] ?? "#campaigns?make=review&from=base%3Aconflict&cohort=north").replace(/&amp;/gu, "&");
    const prefill = prefillOf(parse(href).query)!;
    expect(prefill).toEqual({ source: "review", from: "base:conflict", cohort: "north" });
    const made = makeBody({ ...emptyDraft(prefill), name: "ask", axis: "base" });
    expect(made.ok && made.body.source).toEqual({ review: { kind: "base:conflict" } });
  });

  it("carries an axis alone as a prefix, a pick border as its kind, and a reason alone not at all", () => {
    expect(filterKind({ axis: "technique", reason: null, border: null })).toEqual({ kind_prefix: "technique:" });
    const prefill = prefillOf(parse("#campaigns?make=review&from=technique%3A").query)!;
    const made = makeBody({ ...emptyDraft(prefill), name: "ask", axis: "technique" });
    expect(made.ok && made.body.source).toEqual({ review: { kind_prefix: "technique:" } });
    expect(filterKind({ axis: null, reason: "pick.border", border: "retake" })).toEqual({ kind: "pick.border" });
    expect(filterKind({ axis: null, reason: "conflict", border: null })).toBeNull();
    expect(items.filter((i) => passes(i, { axis: null, reason: "conflict", border: null })).map((i) => i.id)).toEqual([1, 2, 4]);
    expect(items.filter((i) => passes(i, { axis: null, reason: "pick.border", border: "retake" })).map((i) => i.id)).toEqual([7]);
    expect(items.filter((i) => passes(i, NO_FILTER))).toHaveLength(items.length);
  });

  it("reads nothing it does not know from the address", () => {
    expect(queueFilterOf({ axis: "base", reason: "nonsense" })).toEqual({ axis: "base", reason: null, border: null });
    expect(queueFilterOf({ axis: "<b>", reason: "pick.border", border: "too_close" })).toEqual({ axis: null, reason: "pick.border", border: "too_close" });
    expect(queueFilterOf(undefined)).toEqual(NO_FILTER);
  });
});

describe("a model that disagrees with a person's decision", () => {
  it("is read from its evidence, and a rules disagreement is not", () => {
    expect(modelDisagrees(disagrees)).toEqual({ axis: "body_part", decision: "spine", value: "brain", model: "bp-head 1", confidence: 0.95 });
    expect(modelDisagrees(item(10, "body_part:decision", { evidence: { axis: "body_part", rule: "brain", decision: "spine" } }))).toBeNull();
    expect(itemWords(disagrees)).toBe("bp-head 1 proposes brain at 0.95 where a person decided body_part is spine");
  });

  it("carries the badge in the queue, with Look and Decide", () => {
    const html = renderToStaticMarkup(<QueueTable items={[disagrees, items[0]]} may onDecide={() => undefined} onLook={() => undefined} onSee={() => undefined} />);
    expect(html.split(BADGE)).toHaveLength(2);
    expect(html).toContain(`<span class="tag caution badge">${BADGE}</span>bp-head 1 proposes brain`);
    expect(html.match(/>Decide<\/button>/gu)).toHaveLength(2);
    expect(html.match(/>Look<\/button>/gu)).toHaveLength(2);
  });

  it("carries the badge in Look, beside Decide", () => {
    const html = renderToStaticMarkup(<LookDialog item={disagrees} stack={109} onClose={() => undefined} onExplain={() => undefined} onDecide={() => undefined} />);
    expect(html).toContain(BADGE);
    expect(html).toContain(">Decide</button>");
    const plain = renderToStaticMarkup(<LookDialog item={items[0]} stack={101} onClose={() => undefined} onExplain={() => undefined} onDecide={() => undefined} />);
    expect(plain).not.toContain(BADGE);
  });
});
