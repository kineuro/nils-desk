// SPDX-License-Identifier: AGPL-3.0-only
// Review's model family (record 45 S7): `<axis>:model` groups as a run's
// proposals write them, staged at the model's threshold and asked below it;
// the change matrix from the value held now to the value proposed; commit by
// filter counted from the staged part only, with a body that never names a
// confidence alone; and the acts each grant and door leaves open.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { capsWith } from "./caps.fixture";
import { familyOf, itemWords } from "./client";
import { ChangeMatrix, CommitDialog, ModelFamily } from "./ModelFamily";
import { changeMatrix, commitBody, commitPlan, modelActs, modelGroups, NOW_UNKNOWN } from "./modelFamily";

function group(id: number, value: string, band: string, members: number, over: { from?: unknown; staged?: boolean; model?: string; confidence?: number } = {}): ReviewItem {
  const staged = over.staged ?? band !== "below";
  const run = 3;
  const model = over.model ?? "bodypart-head@1";
  return {
    id,
    kind: "body_part:model",
    scope: "group",
    status: staged ? "staged" : "open",
    created_at: "2026-09-24T10:00:00Z",
    ref: { group: `run:${run}|body_part:model|${value}|${band}|model:7`, run_id: run },
    evidence: { axis: "body_part", value, tier: band, confidence: over.confidence ?? 0.9, mean_confidence: 0.93, threshold: 0.7, model, run_id: run, members, group: "g", ...(over.from !== undefined ? { from: over.from } : {}) },
    decision: staged ? { axis: "body_part", value, author_kind: "model", model_id: 7, decision: 500 + id, staged: true } : null,
    members,
    group_key: `run:${run}|body_part:model|${value}|${band}|model:7`,
  };
}

// a synthetic results file's proposals, as the engine groups them: head at two bands, chest at one, spine below the threshold
const ITEMS = [
  group(1, "head", "p>=0.95", 40, { from: { head: 30, spine: 10 } }),
  group(2, "head", "p>=0.7", 12, { from: { head: 12 } }),
  group(3, "chest", "p>=0.9", 8, { from: "spine" }),
  group(4, "spine", "below", 5, { from: { spine: 5 }, confidence: 0.41 }),
  group(5, "chest", "p>=0.9", 3, { model: "bodypart-head@2", from: "spine" }),
  { ...group(6, "head", "p>=0.99", 9), status: "accepted" },
];

describe("the model family", () => {
  it("is its own family, not the rules' unsure", () => {
    expect(familyOf("body_part:model")).toBe("proposals");
    expect(familyOf("body_part:low_confidence")).toBe("unsure");
    expect(itemWords(ITEMS[0])).toBe("head proposed by bodypart-head@1 at p>=0.95 · 40 stacks alike");
  });
  it("keeps the groups that wait, staged or asked, with their staged decision", () => {
    const g = modelGroups(ITEMS);
    expect(g.map((x) => [x.item.id, x.staged, x.decision])).toEqual([
      [1, true, 501],
      [2, true, 502],
      [3, true, 503],
      [4, false, null],
      [5, true, 505],
    ]);
  });
  it("counts the change matrix from the value held now to the value proposed", () => {
    const m = changeMatrix(modelGroups(ITEMS), "body_part");
    expect(m.froms).toEqual(["head", "spine"]);
    expect(m.tos).toEqual(["head", "chest", "spine"]);
    expect(m.cells.head.head.stacks).toBe(42);
    expect(m.cells.spine.head.stacks).toBe(10);
    expect(m.cells.spine.chest).toMatchObject({ stacks: 11, staged: 11 });
    expect(m.cells.spine.spine).toMatchObject({ stacks: 5, staged: 0 });
    expect(m.total).toBe(68);
    // a group whose evidence says nothing of the values held now is one row of its own
    const unknown = changeMatrix(modelGroups([group(9, "head", "p>=0.9", 4)]), "body_part");
    expect(unknown.froms).toEqual([NOW_UNKNOWN]);
  });
  it("counts what a commit by filter puts in force: the staged part of one model, from and to, and nothing below the threshold", () => {
    const g = modelGroups(ITEMS);
    expect(commitPlan(g, { model: "bodypart-head@1", axis: "body_part", from: "spine", to: "chest" })).toEqual({ groups: 1, stacks: 8, open: 0 });
    expect(commitPlan(g, { model: "bodypart-head@1", axis: "body_part", from: "head", to: "head" })).toEqual({ groups: 2, stacks: 42, open: 0 });
    expect(commitPlan(g, { model: "bodypart-head@1", axis: "body_part", from: "spine", to: "spine" })).toEqual({ groups: 0, stacks: 0, open: 5 });
  });
  it("sends a body that names the model, the axis, from and to, and never a confidence an older engine would commit everything by", () => {
    expect(commitBody({ model: "bodypart-head@1", axis: "body_part", from: "spine", to: "chest" })).toEqual({ model: "bodypart-head@1", axis: "body_part", to: "chest", from: "spine" });
    expect(commitBody({ model: "m@1", axis: "body_part", from: null, to: "head" }, true)).toEqual({ model: "m@1", axis: "body_part", to: "head", anyway: true });
    expect(commitBody({ model: "m@1", axis: "body_part", from: null, to: "head" })).not.toHaveProperty("min_confidence");
  });
});

describe("the family's page", () => {
  const doors = ["GET /api/review", "POST /api/decisions/{id}/commit", "POST /api/decisions/{id}/withdraw", "POST /api/decisions/commit"];
  it("draws the matrix with a number per cell a person opens", () => {
    const html = renderToStaticMarkup(<ChangeMatrix groups={modelGroups(ITEMS)} axis="body_part" on={{ from: "spine", to: "chest" }} onCell={() => undefined} />);
    expect(html).toContain("<th class=\"from\">body_part now</th>");
    expect(html).toContain("to chest");
    expect(html).toMatch(/<td class="num on"><button type="button" aria-pressed="true" title="11 staged">11<\/button><\/td>/u);
  });
  it("offers commit and commit by filter only with review work and the doors", () => {
    expect(modelActs(capsWith(doors, ["review:see", "review:work"]))).toEqual({ commit: true, byFilter: true, withdraw: true });
    expect(modelActs(capsWith(doors, ["review:see"]))).toEqual({ commit: false, byFilter: false, withdraw: false });
    expect(modelActs(capsWith(["GET /api/review", "POST /api/decisions/{id}/commit"], ["review:work"]))).toEqual({ commit: true, byFilter: false, withdraw: false });
  });
  it("draws no campaign link when the Campaigns section is not here", () => {
    const html = renderToStaticMarkup(<ModelFamily caps={capsWith(doors, ["review:see", "review:work"])} groups={modelGroups(ITEMS)} askHref={null} onChanged={() => undefined} />);
    expect(html).not.toContain("#campaigns");
    expect(html).toContain("body_part now");
  });
  it("says in its closure panel what the commit puts in force, counted", () => {
    const html = renderToStaticMarkup(<CommitDialog groups={modelGroups(ITEMS)} filter={{ model: "bodypart-head@1", axis: "body_part", from: "spine", to: "chest" }} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("8 stacks in 1 staged group: body_part from spine to chest, by bodypart-head@1.");
    expect(html).toContain("Nothing else is put in force.");
    expect(html).toContain(">Commit 8</button>");
  });
});
