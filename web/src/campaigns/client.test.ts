// SPDX-License-Identifier: AGPL-3.0-only
// The Campaigns pages' pure parts against what an OpenAPI 7 engine answered:
// the body a make and an answer send, what a close will write, who may rate,
// and the address that opens the make dialog filled in.

import { describe, expect, it } from "vitest";
import answersOpen from "../../test/fixtures/campaigns/answers_open.json";
import closedCampaign from "../../test/fixtures/campaigns/campaign_closed.json";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import formCampaign from "../../test/fixtures/campaigns/campaign_form.json";
import closeAnswer from "../../test/fixtures/campaigns/close.json";
import { parse } from "../routes";
import { ADMIN, capsFor, DOORS, RATER } from "./caps.fixture";
import {
  agreementWords,
  answerBody,
  answerWords,
  CANDIDATES,
  closedWords,
  closeRefusal,
  closure,
  conditionWords,
  emptyDraft,
  formProblem,
  holds,
  jointOf,
  kindsOffered,
  legalProblem,
  makeBody,
  makeHref,
  prefillOf,
  progress,
  questionWords,
  rateRefusal,
  sourceWords,
  type Answer,
  type AxesConstraints,
  type Campaign,
  type Closed,
} from "./client";

const open = openCampaign as unknown as Campaign;
const closed = closedCampaign as unknown as Campaign;
const form = formCampaign as unknown as Campaign;
const answers = (answersOpen as { answers: Answer[] }).answers;

describe("a campaign read from the engine", () => {
  it("says its question, its source and how far it is", () => {
    expect(questionWords(open.question)).toBe("base · 11 values");
    expect(questionWords(form.question)).toBe("form · 4 fields");
    expect(sourceWords(open.source)).toBe("selection probe@1");
    expect(sourceWords(form.source)).toBe("result 1");
    expect(sourceWords({ review: { kind_prefix: "base:" } })).toBe("review base:*");
    expect(progress(open.counts).map((p) => [p.state, p.n])).toEqual([
      ["open", 3],
      ["needs_adjudication", 1],
      ["agreed", 2],
    ]);
    expect(agreementWords(open.agreement)).toBe("67% exact · κ 0.40 · over 3 items");
    expect(agreementWords(null)).toBe("not measured yet");
  });

  it("counts what a close will write before it writes anything", () => {
    const plan = closure(open, answers);
    expect(plan.writes).toEqual({ n: 2, words: "decisions in force" });
    expect(plan.staged).toBe(0);
    expect(plan.unresolved).toEqual([
      { state: "open", words: "open", n: 3 },
      { state: "needs_adjudication", words: "to adjudicate", n: 1 },
    ]);
    expect(plan.unresolvedTotal).toBe(4);
    expect(plan.leases).toBe(1);
    // a model's answer behind a settled item stages its decision whatever the campaign says (record 42 R6)
    const byModel = answers.map((a) => (a.item_id === open.items![0].id ? { ...a, author_kind: "model" } : a));
    expect(closure(open, byModel).staged).toBe(1);
    expect(closure({ ...open, closes_into: "stage" }, answers).writes.words).toBe("staged decisions, for a person to commit");
    expect(closure({ ...open, closes_into: "none" }, answers).writes.words).toBe("review items closed with their outcomes");
    expect(closure({ ...open, question: { kind: "axes", axes: ["base", "technique", "modifier"] } }, answers).writes).toEqual({ n: 6, words: "decisions in force, one per axis of 2 items" });
  });

  it("says what the close answered, and a closed campaign's panel counts what it resolved", () => {
    expect(closedWords(closeAnswer as Closed, "decision")).toBe("Closed: 1 decision, 5 unresolved.");
    expect(closedWords({ ...(closeAnswer as Closed), staged: true, decisions: [1, 2] }, "stage")).toBe("Closed: 2 decisions, staged, 5 unresolved.");
    expect(closedWords({ ...(closeAnswer as Closed), skipped: [{ item: 4, why: "decided" }] }, "decision")).toBe("Closed: 1 decision, 5 unresolved; 1 skipped, decided by someone while the campaign was open.");
    expect(closure(closed).already).toBe(1);
    expect(closure(closed).writes.n).toBe(0);
  });
});

describe("who may do what", () => {
  it("lets anyone with work rate a campaign that names no raters, and names the ones it does", () => {
    expect(rateRefusal(capsFor({ grants: RATER, principal: "alice@walk" }), open)).toBeNull();
    expect(rateRefusal(capsFor({ grants: ["campaigns:see"], principal: "alice@walk" }), open)).toBe("Rating needs work on the Campaigns page.");
    expect(rateRefusal(capsFor({ grants: RATER, principal: "alice@walk" }), open, "adjudicator")).toBe("The campaign names its adjudicators, and you are not one.");
    expect(rateRefusal(capsFor({ grants: RATER, principal: "carol@walk" }), open, "adjudicator")).toBeNull();
    expect(rateRefusal(capsFor(), closed)).toBe("The campaign is closed.");
    expect(rateRefusal(capsFor({ doors: ["GET /api/campaigns"] }), open)).toBe("This engine has no door for claiming an item.");
  });

  it("asks Review work beside Campaigns work to close, since a close writes decisions", () => {
    expect(closeRefusal(capsFor({ grants: ADMIN }), open)).toBeNull();
    expect(closeRefusal(capsFor({ grants: ["campaigns:see", "campaigns:work"] }), open)).toBe("Closing writes through Review, so it needs work on the Review page as well.");
    expect(closeRefusal(capsFor(), closed)).toBe("It is closed.");
  });

  it("offers the axes question only where the engine asks it", () => {
    expect(kindsOffered(capsFor())).toEqual(["axis", "form", "free", "derivative", "pick"]);
    expect(kindsOffered(capsFor({ engine: { campaigns: { question_kinds: ["axis", "axes", "pick", "form", "derivative", "free"] } } }))).toContain("axes");
    // a record 45 engine grew OpenAPI 7 in place: its candidates door says it asks axes, where a pack is served
    expect(kindsOffered(capsFor({ doors: [...DOORS, CANDIDATES] }))).toEqual(["axis", "axes", "form", "free", "derivative", "pick"]);
    expect(kindsOffered(capsFor({ doors: [...DOORS, CANDIDATES], engine: { packs: [] } }))).not.toContain("axes");
  });
});

describe("making one", () => {
  const draft = (p: Partial<ReturnType<typeof emptyDraft>>) => ({ ...emptyDraft(), name: "base-check", from: "probe@1", axis: "base", ...p });

  it("sends the body the make door takes, from a selection, a result or Review", () => {
    const b = makeBody(draft({ adjudicators: "carol@walk" }));
    expect(b).toEqual({
      ok: true,
      body: {
        name: "base-check",
        question: { kind: "axis", axis: "base" },
        source: { selection: "probe@1" },
        raters_per_item: 2,
        adjudicators: ["carol@walk"],
        adjudication: { when: "disagree", metric: "exact" },
        closes_into: "stage",
        lease_seconds: 3600,
      },
    });
    expect(makeBody(draft({ source: "handle", from: "12" })).ok && (makeBody(draft({ source: "handle", from: "12" })) as { body: { source: unknown } }).body.source).toEqual({ handle: 12 });
    const review = makeBody(draft({ source: "review", from: "base:" }));
    expect(review.ok && review.body.source).toEqual({ review: { kind_prefix: "base:" } });
    const one = makeBody(draft({ source: "review", from: "base:vote" }));
    expect(one.ok && one.body.source).toEqual({ review: { kind: "base:vote" } });
  });

  it("says what it still needs, in words", () => {
    expect(makeBody(draft({ name: "" }))).toEqual({ ok: false, needs: "a name" });
    expect(makeBody(draft({ from: "probe" }))).toEqual({ ok: false, needs: "a selection as name@version" });
    expect(makeBody(draft({ axis: "" }))).toEqual({ ok: false, needs: "the axis to ask" });
    expect(makeBody(draft({ kind: "pick" }))).toEqual({ ok: false, needs: "the role to pick, such as main_t1" });
    expect(makeBody(draft({ kind: "form", fields: [{ name: "motion", type: "enum", choices: "", required: true }] }))).toEqual({ ok: false, needs: "the choices of motion" });
    expect(makeBody(draft({ metric: "kappa", threshold: "2" }))).toEqual({ ok: false, needs: "a threshold between 0 and 1" });
  });

  it("builds a form's schema, a file question and a pick", () => {
    const f = makeBody(
      draft({
        kind: "form",
        closesInto: "stage",
        fields: [
          { name: "motion", type: "enum", choices: "none, mild, severe", required: true },
          { name: "lesions", type: "integer", choices: "", required: false },
        ],
      }),
    );
    expect(f.ok && f.body.question).toEqual({ kind: "form", schema: { properties: { motion: { enum: ["none", "mild", "severe"] }, lesions: { type: "integer" } }, required: ["motion"] } });
    // a form closes into nothing: its answers are the labels
    expect(f.ok && f.body.closes_into).toBe("none");
    const mask = makeBody(draft({ kind: "derivative", derivativeKind: "mask" }));
    expect(mask.ok && mask.body.question).toEqual({ kind: "derivative", derivative_kind: "mask" });
    expect(mask.ok && mask.body.adjudication).toEqual({ when: "disagree", metric: "external", threshold: 0.8 });
    const pick = makeBody(draft({ kind: "pick", role: "main_t1", closesInto: "pick" }));
    expect(pick.ok && [pick.body.question, pick.body.closes_into]).toEqual([{ kind: "pick", role: "main_t1" }, "pick"]);
  });

  it("opens from another page with its source filled in", () => {
    const at = parse(makeHref("selection", "probe@1"));
    expect(at.section).toBe("campaigns");
    expect(prefillOf(at.query)).toEqual({ source: "selection", from: "probe@1" });
    expect(prefillOf(parse(makeHref("review", "base:")).query)).toEqual({ source: "review", from: "base:" });
    expect(prefillOf(undefined)).toBeNull();
  });
});

describe("answering", () => {
  it("sends a value, a form, words, stacks or a file, and says what is missing first", () => {
    expect(answerBody(open.question, { kind: "value", value: "T1w" }, " looks T1 ")).toEqual({ ok: true, body: { value: "T1w", why: "looks T1" } });
    expect(answerBody(open.question, { kind: "value", value: "" })).toEqual({ ok: false, needs: "a value" });
    expect(answerBody(open.question, { kind: "value", value: "brain" })).toEqual({ ok: false, needs: "one of the question's values" });
    expect(answerBody(form.question, { kind: "form", form: { lesions: 2 } })).toEqual({ ok: false, needs: "motion" });
    expect(answerBody(form.question, { kind: "form", form: { motion: "awful" } })).toEqual({ ok: false, needs: "motion as one of its values" });
    expect(answerBody(form.question, { kind: "form", form: { motion: "mild", lesions: 2 } })).toEqual({ ok: true, body: { form: { motion: "mild", lesions: 2 } } });
    expect(answerBody({ kind: "free" }, { kind: "text", text: "  " })).toEqual({ ok: false, needs: "the words" });
    expect(answerBody({ kind: "pick", role: "main_t1" }, { kind: "stacks", stacks: [12, 14] })).toEqual({ ok: true, body: { value: [12, 14] } });
    expect(answerBody({ kind: "derivative", derivative_kind: "mask" }, { kind: "file", derivative: null, form: {} })).toEqual({ ok: false, needs: "the file, registered in the app that makes it" });
    expect(answerBody({ kind: "derivative", derivative_kind: "mask" }, { kind: "file", derivative: 9, form: {} })).toEqual({ ok: true, body: { derivative_id: 9 } });
  });

  it("answers every axis of an axes question at once, none where an axis has no value", () => {
    const q = { kind: "axes", axes: ["base", "technique"] };
    expect(answerBody(q, { kind: "values", values: { base: "T1w" } })).toEqual({ ok: false, needs: "a value for technique, or none" });
    expect(answerBody(q, { kind: "values", values: { base: "T1w", technique: "MPRAGE" } })).toEqual({ ok: true, body: { value: { base: "T1w", technique: "MPRAGE" } } });
    expect(answerBody(q, { kind: "values", values: { base: "T1w", technique: null } })).toEqual({ ok: true, body: { value: { base: "T1w", technique: null } } });
  });

  it("holds an axes answer to the pack's legal combinations before it is sent", () => {
    const constraints: AxesConstraints = {
      pack: "mri@0.4.0",
      values: { base: ["T1w", "T2w"], technique: ["MPRAGE", "TSE"], modifier: ["FLAIR", "IR", "FS"] },
      multi: ["modifier"],
      groups: { modifier: { IR_CONTRAST: ["FLAIR", "IR"] } },
      implications: [{ rule: "base/mprage-is-t1", when: { axis: "technique", is: "MPRAGE" }, then: [{ axis: "base", value: "T1w" }] }],
    };
    const q = { kind: "axes", axes: ["base", "technique", "modifier"], constraints };
    expect(legalProblem(constraints, jointOf({ base: "T2w", technique: "MPRAGE" }))).toBe(
      "the pack's rule base/mprage-is-t1 sets base to T1w when technique is MPRAGE, and the answer says base is T2w",
    );
    expect(legalProblem(constraints, jointOf({ modifier: ["FLAIR", "IR"] }))).toBe("FLAIR and IR are in the exclusion group IR_CONTRAST of modifier, and at most one of them holds");
    // an axis not chosen yet is not judged
    expect(legalProblem(constraints, jointOf({ technique: "MPRAGE", base: "" }))).toBeNull();
    expect(answerBody(q, { kind: "values", values: { base: "T2w", technique: "MPRAGE", modifier: null } })).toEqual({
      ok: false,
      needs: "a combination the pack allows: the pack's rule base/mprage-is-t1 sets base to T1w when technique is MPRAGE, and the answer says base is T2w",
    });
    expect(answerBody(q, { kind: "values", values: { base: "T1w", technique: "MPRAGE", modifier: ["FS"] } })).toEqual({ ok: true, body: { value: { base: "T1w", technique: "MPRAGE", modifier: ["FS"] } } });
    expect(holds({ any: [{ axis: "base", is: "T1w" }, { axis: "technique", is: "TSE" }] }, { base: ["T2w"] })).toBeNull();
    expect(holds({ not: { axis: "base", missing_or: "T1w" } }, { base: [] })).toBe(false);
    expect(conditionWords({ all: [{ axis: "technique", is: "MPRAGE" }, { not: { axis: "modifier", is: "FS" } }] })).toBe("technique is MPRAGE and not modifier is FS");
  });

  it("checks a form as the engine does", () => {
    expect(formProblem(form.question.schema, { motion: "none", lesions: 1.5 })).toBe("lesions as a number");
    expect(formProblem(form.question.schema, { motion: "none" })).toBeNull();
  });

  it("says an answer in a few words", () => {
    expect(answers.map((a) => answerWords(a))).toContain("T1w");
    expect(answerWords({ value: [12, 14] })).toBe("stacks 12, 14");
    expect(answerWords({ value: { base: "T1w", modifier: ["FLAIR", "FS"] } })).toBe("base T1w · modifier FLAIR+FS");
    expect(answerWords({ value: '{"base":"T1w","modifier":[],"technique":"MPRAGE"}' })).toBe("base T1w · modifier none · technique MPRAGE");
    expect(answerWords({ form: { motion: "mild" } })).toBe("motion mild");
    expect(answerWords({ derivative_id: 4 })).toBe("file 4");
    expect(answerWords({})).toBe("(not shown at this detail)");
  });
});
