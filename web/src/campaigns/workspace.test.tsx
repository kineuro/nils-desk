// SPDX-License-Identifier: AGPL-3.0-only
// The rating workspace (record 45 S4) against an OpenAPI 7 engine's answers:
// the seat a claim gives, what a heartbeat does to it, the keys, the rows of
// values with the pack's families, the adjudicator's view with every rater's
// answer and the disagreement named, and each question kind's renderer.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answerDisagree from "../../test/fixtures/campaigns/answer_disagree.json";
import answersClosed from "../../test/fixtures/campaigns/answers_closed.json";
import closedCampaign from "../../test/fixtures/campaigns/campaign_closed.json";
import formCampaign from "../../test/fixtures/campaigns/campaign_form.json";
import maskCampaign from "../../test/fixtures/campaigns/campaign_mask.json";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import claimed from "../../test/fixtures/campaigns/claim.json";
import claimedAdj from "../../test/fixtures/campaigns/claim_adjudicator.json";
import nothing from "../../test/fixtures/campaigns/claim_nothing.json";
import { packDoc } from "../review/client";
import { capsFor, RATER } from "./caps.fixture";
import { answerBody, answerWords, beatEvery, jointOf, leaseWords, legalProblem, type Answer, type Campaign, type Candidates, type Claimed, type Given } from "./client";
import { answeringApp, blank } from "./renderers";
import { candidatesOf, factsOf, WorkspaceBody, type WorkspaceBodyProps } from "./Workspace";
import { answeredWords, beatSeat, boardOf, chosenOf, disagreementWords, given, givenCantTell, givenNone, illegal, keyAct, marksOf, pendingWords, rowsOf, seatOf, type Seat } from "./workspace";

const open = openCampaign as unknown as Campaign;
const closed = closedCampaign as unknown as Campaign;
const form = formCampaign as unknown as Campaign;
const mask = maskCampaign as unknown as Campaign;
const claim = claimed as unknown as Claimed;
const claimAdj = claimedAdj as unknown as Claimed;
const answers = (answersClosed as { answers: Answer[] }).answers;
const NOW = Date.parse(claim.assignment!.leased_at!) + 60_000;
const none = () => undefined;

const PACK = packDoc({
  pack: "mri",
  version: "0.4.0",
  axes: [
    {
      axis: "base",
      values: [
        { name: "T1w", family: "anatomical" },
        { name: "DWI", family: "diffusion" },
        { name: "T2w", family: "anatomical" },
        { name: "Unknown", family: null },
      ],
    },
    { axis: "modifier", multi: true, values: [{ name: "FLAIR" }, { name: "FS" }] },
  ],
});

function draw(p: Partial<WorkspaceBodyProps> & { campaign: Campaign }): string {
  const q = p.campaign.question;
  const props: WorkspaceBodyProps = {
    caps: capsFor({ grants: RATER, principal: "alice@walk" }),
    role: "rater",
    seat: seatOf(claim),
    rows: rowsOf(q, null),
    given: blank(q),
    why: "",
    marks: {},
    split: null,
    raterAnswers: [],
    evidence: null,
    candidates: [],
    now: NOW,
    busy: false,
    refused: null,
    said: null,
    open: 3,
    done: 0,
    keys: false,
    onGiven: none,
    onWhy: none,
    onAnswer: none,
    onSkip: none,
    onStop: none,
    onKeys: none,
    onAgain: none,
    ...p,
  };
  return renderToStaticMarkup(<WorkspaceBody {...props} />);
}

describe("the seat", () => {
  it("holds the item a claim hands, or says why nothing is left", () => {
    const s = seatOf(claim);
    expect(s.kind === "holding" && [s.assignment.id, s.item.stack_id]).toEqual([claim.assignment!.id, claim.item!.stack_id]);
    expect(seatOf(nothing as unknown as Claimed)).toEqual({ kind: "done", why: "nothing in campaign probe-form is left for carol@walk as a adjudicator" });
  });

  it("keeps the lease while a heartbeat hands the same one back, and says so when it ended", () => {
    const s = seatOf(claim) as Extract<Seat, { kind: "holding" }>;
    const later = { ...claim, held: true, assignment: { ...claim.assignment!, lease_until: "2099-01-01T00:00:00Z" } };
    const kept = beatSeat(s, later);
    expect(kept.kind === "holding" && kept.assignment.lease_until).toBe("2099-01-01T00:00:00Z");
    const next = { assignment: { ...claim.assignment!, id: 99 }, item: { ...claim.item!, id: 500, stack_id: 5 }, held: false };
    const moved = beatSeat(s, next);
    expect(moved.kind === "holding" && moved.note).toBe(`Your lease on stack ${claim.item!.stack_id} ended; stack 5 is yours now.`);
    expect(beatSeat(s, { assignment: null, item: null, why: "nothing in campaign base-check is left for alice@walk as a rater" })).toEqual({
      kind: "done",
      why: `Your lease on stack ${claim.item!.stack_id} ended, and nothing in campaign base-check is left for alice@walk as a rater.`,
    });
  });

  it("asks after the lease a third of the way through it, between 15 s and a minute", () => {
    expect(beatEvery(3600)).toBe(60_000);
    expect(beatEvery(90)).toBe(30_000);
    expect(beatEvery(2)).toBe(15_000);
    expect(leaseWords(840)).toBe("14 min left on the lease");
    expect(leaseWords(42)).toBe("42 s left on the lease");
    expect(leaseWords(0)).toBe("the lease has ended");
  });
});

describe("the keys", () => {
  const rows = rowsOf(open.question, null);
  it("pick a value with 1 to 0, answer with Enter, give back with s, and leave a text field alone", () => {
    expect(keyAct("1", { ctrl: false, inField: false, q: open.question, rows })).toEqual({ kind: "choose", row: rows[0], value: "DWI" });
    expect(keyAct("9", { ctrl: false, inField: false, q: open.question, rows })).toEqual({ kind: "choose", row: rows[0], value: "T1w" });
    expect(keyAct("Enter", { ctrl: false, inField: false, q: open.question, rows })).toEqual({ kind: "answer" });
    expect(keyAct("s", { ctrl: false, inField: false, q: open.question, rows })).toEqual({ kind: "skip" });
    expect(keyAct("?", { ctrl: false, inField: false, q: open.question, rows })).toEqual({ kind: "keys" });
    expect(keyAct("1", { ctrl: false, inField: true, q: open.question, rows })).toBeNull();
    expect(keyAct("Enter", { ctrl: true, inField: true, q: open.question, rows })).toEqual({ kind: "answer" });
    expect(keyAct("1", { ctrl: true, inField: false, q: open.question, rows })).toBeNull();
  });

  it("use q to p on the second axis of an axes question, and toggle a multi-valued one", () => {
    const q = { kind: "axes", axes: ["base", "modifier"] };
    const two = rowsOf(q, PACK);
    expect(two.map((r) => r.axis)).toEqual(["base", "modifier"]);
    expect(keyAct("w", { ctrl: false, inField: false, q, rows: two })).toEqual({ kind: "choose", row: two[1], value: "FS" });
    let g: Given = blank(q);
    g = given(q, g, two[0], "T1w");
    g = given(q, g, two[1], "FLAIR");
    g = given(q, g, two[1], "FS");
    expect(chosenOf(q, g)).toEqual({ base: "T1w", modifier: ["FLAIR", "FS"] });
    g = given(q, g, two[1], "FLAIR");
    expect(chosenOf(q, g)).toEqual({ base: "T1w", modifier: ["FS"] });
  });

  it("group the values by the pack's family, the pack's order kept inside each", () => {
    const [row] = rowsOf({ kind: "axis", axis: "base", values: ["T1w", "DWI", "T2w", "Unknown"] }, PACK);
    expect(row.values).toEqual(["T1w", "T2w", "DWI", "Unknown"]);
    const html = draw({ campaign: { ...open, question: { kind: "axis", axis: "base", values: ["T1w", "DWI", "T2w", "Unknown"] } }, rows: [row] });
    expect(html).toContain('<span class="axis-family-name">anatomical</span>');
    expect(html.indexOf("T2w")).toBeLessThan(html.indexOf("DWI"));
  });
});

describe("an axes question", () => {
  const q = {
    kind: "axes",
    axes: ["base", "modifier"],
    values: { base: ["T1w", "T2w"], modifier: ["FLAIR", "FS"] },
    constraints: { values: { base: ["T1w", "T2w"], modifier: ["FLAIR", "FS"] }, multi: ["modifier"], groups: {}, implications: [{ rule: "r/flair-t2", when: { axis: "modifier", is: "FLAIR" }, then: [{ axis: "base", value: "T2w" }] }] },
  };
  const c = { ...open, question: q };
  it("draws a row per axis, several on a multi-valued one, and none on each", () => {
    const rows = rowsOf(q, null);
    expect(rows.map((r) => [r.axis, r.values, r.multi === true])).toEqual([
      ["base", ["T1w", "T2w"], false],
      ["modifier", ["FLAIR", "FS"], true],
    ]);
    const html = draw({ campaign: c, rows, given: { kind: "values", values: { base: "T1w", modifier: null } } });
    expect(html).toContain("<kbd>q</kbd>FLAIR");
    expect(html).toContain('<span class="meta"> · several</span>');
    expect(html).toContain('class="opt on" aria-pressed="true">none</button>');
    expect(html).not.toContain("The pack does not allow this");
  });

  it("says what the pack forbids as the person chooses", () => {
    let g = givenNone(blank(q), "base");
    expect(chosenOf(q, g)).toEqual({ base: null });
    g = given(q, { kind: "values", values: { base: "T1w" } }, rowsOf(q, null)[1], "FLAIR");
    expect(illegal(q, g)).toBe("the pack's rule r/flair-t2 sets base to T2w when modifier is FLAIR, and the answer says base is T1w");
    expect(draw({ campaign: c, rows: rowsOf(q, null), given: g })).toContain("The pack does not allow this: the pack&#x27;s rule r/flair-t2 sets base to T2w");
  });
});

describe("the rater's workspace", () => {
  it("shows the stack, the item under its lease and the question's values with their keys", () => {
    const html = draw({ campaign: open });
    expect(html).toContain("<h1>Rate</h1>");
    expect(html).toContain(`<b>stack ${claim.item!.stack_id}</b>`);
    expect(html).toContain("14 min left on the lease");
    expect(html).toContain("loading the viewer");
    expect(html).toContain('<span class="axis-name">base</span>');
    expect(html).toContain("<kbd>1</kbd>DWI");
    expect(html).toContain("<kbd>9</kbd>T1w");
    expect(html).toContain("Answer <kbd>Enter</kbd>");
    expect(html).toContain("Give back <kbd>s</kbd>");
    expect(html).toContain("<b>3</b> open");
    // a rater never sees another rater's answer
    expect(html).not.toContain("adjudicate");
    expect(html).not.toContain("bob@walk");
  });

  it("marks the value given and says what the engine refused", () => {
    const html = draw({ campaign: open, given: { kind: "value", value: "T2w" }, refused: "Refused: the lease ran out." });
    expect(html).toContain('class="opt on" aria-pressed="true"><kbd>7</kbd>T2w');
    expect(html).toContain('title="Refused: the lease ran out.">Refused: the lease ran out.</p>');
  });

  it("says nothing is left, with the way back, and refuses a person the campaign does not name", () => {
    const done = draw({ campaign: open, seat: seatOf(nothing as unknown as Claimed) });
    expect(done).toContain("Nothing left for you.");
    expect(done).toContain('href="#campaigns/6"');
    const notOne = draw({ campaign: open, role: "adjudicator", seat: { kind: "claiming" } });
    expect(notOne).toContain("The campaign names its adjudicators, and you are not one.");
    expect(draw({ campaign: closed, seat: { kind: "claiming" } })).toContain("The campaign is closed.");
  });

  it("draws a form from its schema, words for a free question, and the key list", () => {
    const f = draw({ campaign: form, given: { kind: "form", form: { motion: "mild" } }, keys: true });
    expect(f).toContain("motion");
    expect(f).toContain('class="opt on" aria-pressed="true">mild</button>');
    expect(f).toContain("lesions · optional");
    expect(f).toContain('type="number"');
    expect(f).toContain(">yes</button>");
    expect(f).toContain("<dt>Enter</dt><dd>answer, then the next item</dd>");
    const free = draw({ campaign: { ...form, question: { kind: "free" } }, given: { kind: "text", text: "" } });
    expect(free).toContain("Your words");
    expect(free).toContain("Ctrl+Enter answers.");
  });

  it("hands a file question to the app that makes it, or says no app here answers it", () => {
    const g: Given = { kind: "file", derivative: null, form: {} };
    const alone = draw({ campaign: mask, given: g });
    expect(alone).toContain("No app here answers this.");
    expect(alone).toContain("A file registered elsewhere, by number");
    const apps = [{ id: "segment", title: "Segment", capabilities: { answers: ["derivative:mask"] } }];
    const withApp = draw({ campaign: mask, given: g, caps: capsFor({ grants: RATER, principal: "alice@walk", apps }) });
    expect(withApp).toContain(`href="/apps/segment/?campaign=${mask.id}&amp;assignment=${claim.assignment!.id}&amp;item=${claim.item!.id}&amp;stack=${claim.item!.stack_id}"`);
    expect(withApp).toContain("Open in Segment");
    expect(answeringApp(capsFor({ apps: [{ id: "tool", capabilities: { answers: ["derivative:mesh"] } }] }), "mask")).toBeNull();
    // where the item starts from a file, the link says where it comes from
    const seat = seatOf({ ...claim, item: { ...claim.item!, input_derivative_ids: [12] } });
    expect(draw({ campaign: mask, given: g, seat })).toContain('<a href="/api/derivatives/12" target="_blank" rel="noopener">file 12</a>');
  });

  it("offers a pick's candidates from the item's evidence and reads plain facts from it", () => {
    expect(candidatesOf({ candidates: [{ stack: 12, p: 0.7 }, { stack: 14 }] })).toEqual([12, 14]);
    expect(candidatesOf(null)).toEqual([]);
    expect(factsOf({ campaign: 6, campaign_name: "x", axis: "base", confidence: 0.41, rule: "t1-by-te" })).toEqual([
      ["confidence", "0.41"],
      ["rule", "t1-by-te"],
    ]);
    const pick = draw({ campaign: { ...open, question: { kind: "pick", role: "main_t1" } }, given: { kind: "stacks", stacks: [14] }, candidates: [12, 14], stackWords: { 12: "T1w MPRAGE" } });
    expect(pick).toContain('stack 12<span class="meta"> · T1w MPRAGE</span>');
    expect(pick).toContain("The stacks that stand for main_t1");
    expect(pick).toContain('<kbd>2</kbd>stack 14');
  });
});

describe("an answer", () => {
  it("says what it did to the item, and when it went to an adjudicator", () => {
    expect(answeredWords(answerDisagree as never, claim.item!)).toBe(`Answered stack ${claim.item!.stack_id}: to adjudicate; it goes to an adjudicator.`);
    expect(answeredWords({ answer: 7, item: 1, state: "agreed", adjudication: null }, claim.item!)).toBe(`Answered stack ${claim.item!.stack_id}: agreed.`);
  });
});

describe("the adjudicator's view", () => {
  const q = closed.question;
  const item = claimAdj.item!.id;
  it("names who gave what beside the options, and the disagreement", () => {
    const marks = marksOf(q, answers, item);
    expect(marks).toEqual({ base: { T1w: ["alice@walk"], T2w: ["bob@walk"] } });
    expect(disagreementWords(q, answers, item)).toBe("The raters differ: T1w or T2w.");
    const html = draw({
      campaign: { ...closed, status: "open" },
      role: "adjudicator",
      caps: capsFor({ principal: "carol@walk" }),
      seat: seatOf(claimAdj),
      marks,
      split: disagreementWords(q, answers, item),
      raterAnswers: answers.filter((a) => a.item_id === item && a.role === "rater"),
    });
    expect(html).toContain("<h1>Adjudicate</h1>");
    expect(html).toContain("The raters differ: T1w or T2w.");
    expect(html).toContain("<b>alice@walk</b> T1w");
    expect(html).toContain("<span class=\"meta\"> · looks T1</span>");
    expect(html).toContain('title="given by bob@walk"');
    expect(html).toContain("round 2");
  });

  it("names the axes the raters differ on in an axes question", () => {
    const aq = { kind: "axes", axes: ["base", "technique"] };
    const two: Answer[] = [
      { ...answers[0], value: { base: "T1w", technique: "MPRAGE" } },
      { ...answers[1], value: { base: "T1w", technique: "SE" } },
    ];
    expect(disagreementWords(aq, two, item)).toBe("The raters differ on technique.");
    // as the engine gives an axes answer back: one text
    const kept = two.map((a) => ({ ...a, value: JSON.stringify(a.value) }));
    expect(disagreementWords(aq, kept, item)).toBe("The raters differ on technique.");
    expect(marksOf(aq, kept, item).technique).toEqual({ MPRAGE: ["alice@walk"], SE: ["bob@walk"] });
    expect(marksOf(aq, two, item)).toEqual({ base: { T1w: ["alice@walk", "bob@walk"] }, technique: { MPRAGE: ["alice@walk"], SE: ["bob@walk"] } });
  });
});

describe("a pick question's session board", () => {
  it("draws what the run considered, best first with its pick marked, then the session's other stacks by acquisition", () => {
    const c: Candidates = {
      campaign: 3,
      item: 7,
      role: "t1w",
      count: 5,
      candidates: [
        { stack_id: 405, series_id: 50, axes: {}, picked_by: [] },
        { stack_id: 406, series_id: 51, axes: { base: ["T1w"] }, picked_by: [81] },
        { stack_id: 409, series_id: 52, axes: { base: ["T1w"] }, picked_by: [] },
        { stack_id: 410, series_id: 53, axes: {}, picked_by: [] },
        { stack_id: 411, series_id: 53, axes: {}, picked_by: [] },
      ],
      picks: [{ id: 81, author_kind: "rule", stacks: [406], score: 0.66, considered: [{ stacks: [406], score: 0.66 }, { stacks: [409], score: 0.64 }] }],
    };
    expect(boardOf(c).map((b) => [b.stacks, b.score, b.chosen])).toEqual([
      [[406], 0.66, true],
      [[409], 0.64, false],
      [[405], null, false],
      [[410, 411], null, false],
    ]);
    // no run's pick: every acquisition of the session, none marked
    expect(boardOf({ ...c, picks: [] }).map((b) => b.stacks)).toEqual([[405], [406], [409], [410, 411]]);
  });
});

describe("can't tell and unsure (record 48)", () => {
  const constraints = { values: { base: ["T1w", "T2w"], modifier: ["FLAIR", "FS"] }, multi: ["modifier"], groups: { modifier: { IR: ["FLAIR", "FS"] } }, implications: [{ rule: "r/flair-t2", when: { axis: "modifier", is: "FLAIR" }, then: [{ axis: "base", value: "T2w" }] }] };
  const q = { kind: "axes", axes: ["base", "modifier", "technique"], values: { base: ["T1w", "T2w"], modifier: ["FLAIR", "FS"], technique: ["SE", "GRE"] }, constraints, cant_tell: "cant_tell", unsure: true };
  const older = { kind: "axes", axes: ["base", "modifier", "technique"], values: q.values, constraints };
  const rows = rowsOf(q, null);
  const at = (key: string, question: typeof q | typeof older = q, inField = false) => keyAct(key, { ctrl: false, inField, q: question, rows });
  const c = { ...open, question: q };

  it("says can't tell with a, d, f on the rows in turn, and marks unsure with m, where the question takes them", () => {
    expect(at("a")).toEqual({ kind: "cant_tell", row: rows[0] });
    expect(at("d")).toEqual({ kind: "cant_tell", row: rows[1] });
    expect(at("F")).toEqual({ kind: "cant_tell", row: rows[2] });
    // past the last row, and on an axis question, nothing
    expect(at("g")).toBeNull();
    expect(keyAct("a", { ctrl: false, inField: false, q: { kind: "axis", axis: "base", cant_tell: "cant_tell" }, rows: rows.slice(0, 1) })).toBeNull();
    expect(at("m")).toEqual({ kind: "unsure" });
    expect(keyAct("m", { ctrl: false, inField: false, q: { kind: "free", unsure: true }, rows: [] })).toEqual({ kind: "unsure" });
    // no clash with the keys already there: on three rows or more a number finds its row (record 48, one screen)
    expect(at("1")).toEqual({ kind: "find", row: rows[0] });
    expect(at("s")).toEqual({ kind: "skip" });
    expect(at("h")).toEqual({ kind: "evidence" });
    expect(at("a", q, true)).toBeNull();
    // an older engine names neither
    expect(at("a", older)).toBeNull();
    expect(at("m", older)).toBeNull();
  });

  it("toggles can't tell apart from none, and a value chosen after it replaces it", () => {
    let g = givenCantTell(q, blank(q), "base");
    expect(chosenOf(q, g)).toEqual({ base: "cant_tell" });
    expect(chosenOf(q, givenCantTell(q, g, "base"))).toEqual({ base: "" });
    g = givenNone(g, "modifier");
    g = givenCantTell(q, g, "modifier");
    expect(chosenOf(q, g)).toEqual({ base: "cant_tell", modifier: "cant_tell" });
    expect(chosenOf(q, givenNone(g, "modifier"))).toEqual({ base: "cant_tell", modifier: null });
    expect(chosenOf(q, given(q, g, rows[0], "T2w")).base).toBe("T2w");
    expect(chosenOf(q, given(q, g, rows[1], "FS")).modifier).toEqual(["FS"]);
    // an older engine's question takes no can't tell
    expect(givenCantTell(older, blank(older), "base")).toEqual(blank(older));
  });

  it("sends can't tell for an axis and unsure only when set, and says can't tell among what is missing", () => {
    const values = { base: "cant_tell", modifier: null, technique: "SE" };
    expect(answerBody(q, { kind: "values", values })).toEqual({ ok: true, body: { value: values } });
    expect(answerBody(q, { kind: "values", values }, "", true)).toEqual({ ok: true, body: { value: values, unsure: true } });
    expect(answerBody(q, { kind: "values", values: { base: "cant_tell" } })).toEqual({ ok: false, needs: "a value for modifier, technique, or none, or can't tell" });
    expect(answerBody(older, { kind: "values", values: { base: "T1w" } })).toEqual({ ok: false, needs: "a value for modifier, technique, or none" });
    // an engine that does not take the mark is not sent it
    expect(answerBody(older, { kind: "values", values: { base: "T1w", modifier: null, technique: "SE" } }, "", true)).toEqual({ ok: true, body: { value: { base: "T1w", modifier: null, technique: "SE" } } });
    expect(answerBody({ kind: "free", unsure: true }, { kind: "text", text: "odd" }, "", true)).toEqual({ ok: true, body: { value: "odd", unsure: true } });
  });

  it("never holds can't tell to the pack's implications or exclusion groups", () => {
    // FLAIR sets base to T2w; base can't tell names nothing, so nothing is broken
    const g = { kind: "values" as const, values: { base: "cant_tell", modifier: ["FLAIR"], technique: "SE" } };
    expect(jointOf(g.values)).toEqual({ modifier: ["FLAIR"], technique: ["SE"] });
    expect(illegal(q, g)).toBeNull();
    expect(answerBody(q, g).ok).toBe(true);
    expect(legalProblem(constraints, { base: ["cant_tell"], modifier: ["FLAIR"] })).toBeNull();
    // a value named still is
    expect(illegal(q, { kind: "values", values: { base: "T1w", modifier: ["FLAIR"] } })).toContain("sets base to T2w");
    expect(illegal(q, { kind: "values", values: { base: "cant_tell", modifier: "cant_tell" } })).toBeNull();
  });

  it("draws can't tell on every row with its key, the unsure toggle, and what will be sent", () => {
    const g = { kind: "values" as const, values: { base: "cant_tell", modifier: null } };
    const html = draw({ campaign: c, rows, given: g, unsure: true, keys: true });
    expect(html).toContain("<kbd>a</kbd>can&#x27;t tell");
    expect(html).toContain("<kbd>d</kbd>can&#x27;t tell");
    expect(html).toContain("<kbd>f</kbd>can&#x27;t tell");
    expect(html).toMatch(/class="opt on" aria-pressed="true"[^>]*><kbd>a<\/kbd>can&#x27;t tell/u);
    expect(html).toContain('class="opt on" aria-pressed="true">none</button>');
    expect(html).toContain("Unsure <kbd>m</kbd>");
    expect(html).toContain("Sends: base can&#x27;t tell · modifier none · technique –");
    expect(html).toContain('<span class="tag caution">unsure</span>');
    expect(html).toContain("<dt>a d f</dt>");
    expect(html).toContain("<dt>m</dt>");
    expect(pendingWords(q, g, true)).toBe("base can't tell · modifier none · technique – · unsure");
    // a blind item draws the same controls
    expect(draw({ campaign: c, rows, given: g, blind: true, header: [] })).toContain("<kbd>a</kbd>can&#x27;t tell");
  });

  it("draws neither where the question does not carry them", () => {
    const html = draw({ campaign: { ...open, question: older }, rows: rowsOf(older, null), given: blank(older), unsure: true, keys: true });
    expect(html).not.toContain("can&#x27;t tell");
    expect(html).not.toContain("Unsure");
    expect(html).not.toContain("<dt>m</dt>");
    expect(html).not.toContain('<span class="tag caution">unsure</span>');
    expect(pendingWords(older, { kind: "values", values: { base: "T1w" } }, true)).toBe("base T1w · modifier – · technique –");
  });

  it("marks can't tell apart from none for the adjudicator, and counts it a disagreement against a value", () => {
    const item = claimAdj.item!.id;
    const two: Answer[] = [
      { ...answers[0], value: JSON.stringify({ base: "cant_tell", modifier: null, technique: "SE" }), unsure: true },
      { ...answers[1], value: JSON.stringify({ base: "T1w", modifier: null, technique: "SE" }) },
    ];
    expect(marksOf(q, two, item).base).toEqual({ cant_tell: ["alice@walk"], T1w: ["bob@walk"] });
    expect(disagreementWords(q, two, item)).toBe("The raters differ on base.");
    const both = [two[0], { ...two[1], value: two[0].value }];
    expect(disagreementWords(q, both, item)).toBe("The raters agree on every axis; the metric sent it here.");
    const noneAndCant = [two[0], { ...two[1], value: JSON.stringify({ base: null, modifier: null, technique: "SE" }) }];
    expect(disagreementWords(q, noneAndCant, item)).toBe("The raters differ on base.");
    expect(answerWords(two[0])).toBe("base can't tell · modifier none · technique SE");
    const html = draw({ campaign: { ...c, status: "open" }, role: "adjudicator", caps: capsFor({ principal: "carol@walk" }), seat: seatOf(claimAdj), marks: marksOf(q, two, item), raterAnswers: two.filter((a) => a.item_id === item) });
    expect(html).toContain('<span class="tag caution">unsure</span>');
    expect(html).toContain('title="given by alice@walk"><kbd>a</kbd>can&#x27;t tell<span class="said-by">1</span>');
  });
});
