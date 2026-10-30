// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The rule reviews on the Rules page against an engine whose doors answer
// as the contract has them: a graded round with a wrong stack and no review
// yet opens one with a press and follows it to the campaign; a round whose
// review is open links it; a round with nothing wrong is not listed; a
// person who may only see gets the link but no press to open one.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine } from "./mainScans.fixture";
import { RuleReviews } from "./RuleReviews";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  location.hash = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DOORS = ["GET /api/audit/draws", "POST /api/audit/draws/{id}/rule-review"];
const grade = (wrong: number) => ({ read: 150, wrong, error: wrong / 150, bound: 0.05, confidence: 0.95, wrong_by_axis: {}, not_settled: 0, cant_tell: 0 });
const draw = (id: number, wrong: number | null, review: number | null) => ({
  id,
  round_id: 3,
  seed: "s",
  share: 0,
  frame: { stacks: 900, digest: "d" },
  drawn: 150,
  campaign_id: 40 + id,
  created_by: "cleo",
  created_at: "2026-10-30T10:00:00Z",
  grade: wrong === null ? null : grade(wrong),
  graded_at: wrong === null ? null : "2026-10-30T11:00:00Z",
  campaigns: { raters: 40 + id, settle: 50 + id, rule_review: review },
});
const DRAWS = { draws: [draw(1, 2, 77), draw(2, 1, null), draw(3, 0, null), draw(4, null, null)] };

function engine() {
  return fakeEngine((c) => {
    if (c.method === "GET" && c.path === "/api/audit/draws") return { status: 200, body: DRAWS };
    if (c.method === "POST" && c.path === "/api/audit/draws/2/rule-review")
      return { status: 200, body: { draw: 2, round_id: 3, graded: true, wrong: 1, passed: true, rule_review: { campaign_id: 91, name: "audit-draw-2-rule-review", status: "open", counts: {}, opened: true } } };
    return undefined;
  });
}

async function open(grants: Grant[]) {
  act(() => root.render(<RuleReviews caps={capsWith(DOORS, grants)} />));
  await settle();
}

const rows = () => [...host.querySelectorAll(".rule-reviews li")].map((li) => li.textContent);

describe("the rule reviews on the Rules page", () => {
  it("lists each graded round with a wrong stack; Review opens the one not yet open and follows it", async () => {
    const e = engine();
    await open([...GRANTS] as Grant[]);
    expect(rows()).toEqual(["Round 3, audit 2: 1 wrong of 150Review", "Round 3, audit 1: 2 wrong of 150Review"]);
    const link = host.querySelector<HTMLAnchorElement>(".rule-reviews li:nth-child(2) a")!;
    expect(link.getAttribute("href")).toBe("#review/campaigns/77");
    act(() => button(host.querySelector(".rule-reviews li:first-child")!, "Review")!.click());
    await settle();
    expect(e.of("POST", "/api/audit/draws/2/rule-review")).toHaveLength(1);
    expect(location.hash).toBe("#review/campaigns/91");
  });

  it("gives one who may only see the open review's link and no press", async () => {
    const e = engine();
    await open(["review:see", "campaigns:see"]);
    expect(host.querySelectorAll(".rule-reviews button")).toHaveLength(0);
    expect(host.querySelectorAll(".rule-reviews a")).toHaveLength(1);
    expect(e.of("POST", "/api/audit/draws/2/rule-review")).toHaveLength(0);
  });

  it("draws nothing on an engine without the audit doors", async () => {
    const e = engine();
    act(() => root.render(<RuleReviews caps={capsWith([], [...GRANTS] as Grant[])} />));
    await settle();
    expect(host.querySelector(".rule-reviews")).toBeNull();
    expect(e.calls).toHaveLength(0);
  });
});
