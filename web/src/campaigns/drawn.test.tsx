// SPDX-License-Identifier: AGPL-3.0-only
// Every campaign kind made in the desk, nothing typed by hand (Wave 7a,
// record 55 H3; spec 13.2): the make door draws pair, anchored and A/B items
// from selections with the seed of the draw, offered where the engine's
// capabilities say it draws them; the sources, the values and the raters are
// chosen from lists; an A/B campaign's voters are read in the browser from a
// folder of JSON files, one per stack, as the engine reads a voter's folder.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { packDoc } from "../review/client";
import { capsFor } from "./caps.fixture";
import { emptyDraft, kindsOffered, makeBody, voterName, voterOf, drawnCountsWords, type Draft } from "./client";
import { MakeForm, reviewChoices, selectionWords, specOf, type MakeLists } from "./MakeCampaign";
import type { SelectionRow } from "../query/selections";

const none = () => undefined;
const DRAWS = { campaigns: { question_kinds: ["axis", "axes"], draws: ["pair", "anchored", "ab"] } };
const draft = (p: Partial<Draft>): Draft => ({ ...emptyDraft(), name: "drawn", seed: "written-down", ...p });
const row = (name: string, version: number, rows: number | null, grain = "stack"): SelectionRow => ({
  id: version,
  name,
  spec: `selection:${name}@${version}`,
  description: null,
  versions: version,
  grain,
  owner: null,
  created_at: "2026-10-12T10:00:00Z",
  updated_at: null,
  updated_by: null,
  note: null,
  cohort: null,
  size: { rows, grain, version, handle: 9, at: "2026-10-12T10:00:00Z", truncated: false },
});
const LISTS: MakeLists = {
  selections: [row("t1-pre", 2, 140), row("t1-post", 1, 130), row("sealed-sample", 3, null)],
  handles: [],
  kinds: [
    ["base:missing", 7],
    ["base:low_confidence", 3],
    ["identity.collision", 2],
  ],
  people: [
    { principal: "alice@walk", display: "Alice", holds: true },
    { principal: "dee@walk", display: "Dee", holds: false },
  ],
};

describe("the kinds the make door draws", () => {
  it("are offered only where the engine says it draws them", () => {
    expect(kindsOffered(capsFor())).not.toContain("pair");
    expect(kindsOffered(capsFor({ engine: DRAWS }))).toEqual(["axis", "axes", "form", "free", "derivative", "pick", "pair", "anchored", "ab"]);
  });

  it("a pair campaign from one selection, or each stack paired with another selection's in its session", () => {
    const one = makeBody(draft({ kind: "pair", from: "t1-pre@2" }));
    expect(one.ok && one.body).toMatchObject({ question: { kind: "pair" }, source: { pair: { selection: "t1-pre@2", seed: "written-down" } }, closes_into: "none", adjudication: { when: "never" } });
    const two = makeBody(draft({ kind: "pair", from: "t1-pre@2", with: "t1-post@1", pairAxis: "post_contrast", postValue: "given", preValue: "none" }));
    expect(two.ok && two.body.source).toEqual({ pair: { selection: "t1-pre@2", with: "t1-post@1", seed: "written-down" } });
    expect(two.ok && two.body.question).toEqual({ kind: "pair", axis: "post_contrast", post: "given", pre: "none" });
    expect(makeBody(draft({ kind: "pair", from: "" }))).toEqual({ ok: false, needs: "a selection" });
    expect(makeBody(draft({ kind: "pair", from: "t1-pre@2", seed: " " }))).toEqual({ ok: false, needs: "a seed for the draw" });
  });

  it("an anchored campaign from its candidates and its two anchors' selections", () => {
    const made = makeBody(draft({ kind: "anchored", from: "cands@1", pre: "t1-pre@2", post: "t1-post@1" }));
    expect(made.ok && made.body.source).toEqual({ anchored: { selection: "cands@1", pre: "t1-pre@2", post: "t1-post@1", seed: "written-down" } });
    expect(makeBody(draft({ kind: "anchored", from: "cands@1", post: "t1-post@1" }))).toEqual({ ok: false, needs: "the pre anchors' selection" });
  });

  it("an A/B campaign from a selection, the rules and the voters read from folders, with its audit share", () => {
    const judge = voterOf("judge", [
      { name: "12.json", text: JSON.stringify({ base: { value: "T1w", reason: "TI 900" } }) },
      { name: "x.json", text: JSON.stringify({ stack: 13, answer: { base: { value: "FLAIR", reason: "TI 2500" } } }) },
      { name: "notes.txt", text: "skip" },
      { name: "bad.json", text: "{" },
      { name: "nostack.json", text: "{}" },
    ]);
    expect(judge).toEqual({ name: "judge", stacks: { "12": { base: { value: "T1w", reason: "TI 900" } }, "13": { base: { value: "FLAIR", reason: "TI 2500" } } }, files: 4, skipped: 2 });
    const made = makeBody(draft({ kind: "ab", from: "sealed-sample@3", axes: ["base"], voters: [judge], auditShare: "0.2", closesInto: "stage" }));
    expect(made.ok && made.body).toMatchObject({
      // the localizer's axis is always asked
      question: { kind: "axes", axes: ["provenance", "base"] },
      source: { ab: { selection: "sealed-sample@3", rules: true, voters: { judge: judge.stacks }, seed: "written-down", audit_share: 0.2, localizer_asks: ["provenance"] } },
      raters_per_item: 1,
      closes_into: "stage",
    });
    expect(makeBody(draft({ kind: "ab", from: "sealed-sample@3", rules: false }))).toEqual({ ok: false, needs: "a voter: the rules, or readings from a folder" });
    expect(makeBody(draft({ kind: "ab", from: "sealed-sample@3", auditShare: "2" }))).toEqual({ ok: false, needs: "an audit share from 0 to 1" });
    expect(voterName("judge", ["judge"])).toBe("judge-2");
    expect(voterName("rules", [])).toBe("rules-2");
    expect(voterName("my judge/", [])).toBe("my-judge");
  });

  it("says what a preview counted, each by its engine name", () => {
    expect(drawnCountsWords({ pairs: 12, stacks: 24, left_out: 3, refusal: "x" })).toBe("12 pairs · 24 stacks · 3 left out");
  });
});

describe("nothing typed by hand", () => {
  const pack = packDoc({ pack: "mri", version: "1.1.0", axes: [{ axis: "body_part", values: ["brain", "spine", "neck"] }, { axis: "post_contrast", values: ["given", "none"] }] });

  it("a selection is chosen from the saved ones, named with its version and size", () => {
    expect(specOf(LISTS.selections![0])).toBe("t1-pre@2");
    expect(selectionWords(LISTS.selections![0])).toBe("t1-pre v2 · 140 stacks");
    expect(selectionWords(LISTS.selections![2])).toBe("sealed-sample v3 · size held back");
    const html = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={emptyDraft()} pack={pack} lists={LISTS} onChange={none} />);
    expect(html).toContain('<option value="t1-pre@2">t1-pre v2 · 140 stacks</option>');
    expect(html).not.toContain('placeholder="name@version"');
  });

  it("Review items are chosen from the open kinds, each axis's together where it has several", () => {
    expect(reviewChoices(LISTS.kinds!)).toEqual([
      { value: "base:missing", words: "base: no value · 7 open" },
      { value: "base:low_confidence", words: "base: not confident · 3 open" },
      { value: "identity.collision", words: "identity collision · 2 open" },
      { value: "base:", words: "every base question · 10 open" },
    ]);
    const html = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={emptyDraft({ source: "review", from: "" })} pack={pack} lists={LISTS} onChange={none} />);
    expect(html).toContain('<option value="base:">every base question · 10 open</option>');
  });

  it("an axis question's values are keys from the pack, and the raters are the people on the desk", () => {
    const html = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={{ ...emptyDraft(), axis: "body_part", values: "brain" }} pack={pack} lists={LISTS} onChange={none} />);
    expect(html).toContain('class="opt on" aria-pressed="true">brain</button>');
    expect(html).toContain('aria-pressed="false">spine</button>');
    expect(html).toContain("1 of 3.");
    // the raters a maker may name: those who hold work on Campaigns, and Me
    expect(html).toContain(">Alice</button>");
    expect(html).toContain(">Me</button>");
    expect(html).not.toContain(">Dee</button>");
  });

  it("a pair campaign's form: two selections, the axis and its values from the pack, and the seed", () => {
    const html = renderToStaticMarkup(<MakeForm caps={capsFor({ engine: DRAWS })} draft={draft({ kind: "pair" })} pack={pack} lists={LISTS} onChange={none} />);
    expect(html).toContain("Paired with");
    expect(html).toContain('<option value="given">given</option>');
    expect(html).toContain('value="written-down"');
    expect(html).toContain("the campaign keeps only its hash");
    // no source of keys, and no adjudication: a pair is read blind by its readers
    expect(html).not.toContain(">Review items</button>");
    expect(html).not.toContain("Adjudicators");
  });

  it("an A/B campaign's form: the rules as a voter, a folder for each other voter, and the audit share", () => {
    const html = renderToStaticMarkup(<MakeForm caps={capsFor({ engine: DRAWS })} draft={draft({ kind: "ab" })} pack={pack} lists={LISTS} onChange={none} />);
    expect(html).toContain("The rules");
    expect(html).toContain("Add a voter&#x27;s folder");
    expect(html).toContain("webkitdirectory");
    expect(html).toContain('aria-label="Audit share"');
  });
});
