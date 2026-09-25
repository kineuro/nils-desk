// SPDX-License-Identifier: AGPL-3.0-only
// The reader (record 48 R1): the suggestion filled in and confirmed with one
// key, the candidates where the systems differ, the evidence one line per
// axis, the keys, the clock and the pace, the prefetch's scheduling, batches
// accepted with their held back, and the parts as they draw.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import askedItem from "../../test/fixtures/campaigns/reader_asked.json";
import whyDoc from "../../test/fixtures/campaigns/reader_why.json";
import claimed from "../../test/fixtures/campaigns/claim.json";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import type { Json } from "../ask/client";
import { capsFor, DOORS, RATER } from "./caps.fixture";
import type { Campaign, Claimed, Given, Item, Question } from "./client";
import { BatchView } from "./Batches";
import { CampaignBody } from "./CampaignPage";
import {
  acceptedOf,
  acceptPlan,
  askedAxes,
  baselineOf,
  batchesOf,
  blindReading,
  bound,
  batchKey,
  changesOf,
  chosenCandidate,
  Clock,
  complete,
  givenOf,
  givenOfCandidate,
  lineWords,
  median,
  NO_PACE,
  paced,
  paceWords,
  planWords,
  Prefetcher,
  readingFromAsked,
  readingOf,
  statsOf,
  suggestedValue,
  suggestionOf,
  upcoming,
  type Reading,
} from "./reader";
import { hintOf, R48, valueOrderServed } from "./readerDoors";
import { EvidenceLines, PaceCount, SuggestionBar } from "./ReaderParts";
import { blank } from "./renderers";
import { WorkspaceBody, type WorkspaceBodyProps } from "./Workspace";
import { bodyOf, enterOwnedBy, keyAct, rowsOf, seatOf } from "./workspace";

const AXES: Question = { kind: "axes", axes: ["base", "technique", "modifier"], values: { base: ["DWI", "T1w", "T2w"], technique: ["MPRAGE", "TSE", "SE"], modifier: ["FatSat", "FLAIR"] } };
const BASE: Question = { kind: "axis", axis: "base", values: ["DWI", "T1w", "T2w"] };
const whole = readingOf(whyDoc as unknown as Json);
// as the reader holds it: the lines of the axes the question asks
const reading: Reading = { ...whole, lines: whole.lines.filter((l) => askedAxes(AXES).includes(l.axis)) };
const asked = (askedItem as { evidence: Json }).evidence;

describe("the evidence line", () => {
  it("reads the why door: flags, rule and clause, the header values read, votes, words, System 1", () => {
    expect(whole.item).toBe(301);
    expect(whole.stack).toBe(1207);
    expect(whole.axes).toEqual(["base", "technique", "modifier", "disposition"]);
    // the value order's worth: disagreement first, then the least sure
    expect(whole.value).toBeCloseTo(1.29);
    const base = whole.lines[0];
    expect(base.flags).toEqual(["inversion"]);
    expect(base.rule).toBe("technique:MPRAGE");
    expect(base.clause).toBe("clause 0");
    expect(base.reads).toEqual([
      ["TI", "900"],
      ["TR", "2300"],
    ]);
    // a clause that only restates another axis is no vote
    expect(base.votes).toEqual([
      { rule: "base/technique:MPRAGE", value: "T1w" },
      { rule: "keyword/T1w", value: "T1w" },
    ]);
    expect(base.words).toEqual(["t1_mprage"]);
    expect(base.model).toEqual({ value: "T1w", p: 0.93, weighed: [] });
    expect(base.agree).toBe(true);
    expect(whole.lines[1].reads).toEqual([["scanning sequence", "GR\\IR"]]);
    // below detail quasi the door leaves the words out, and the line says so
    expect(whole.lines[1].words).toBeNull();
    expect(whole.lines[2].agree).toBe(false);
    // a person's decision names who, not a rule
    expect(whole.lines[3].rule).toBe("a person's decision");
    // an illegal candidate is never drawn
    expect(whole.candidates.map((c) => c.p)).toEqual([0.71, 0.22]);
  });

  it("says the value, then what decided it, in one line", () => {
    const w = lineWords(reading.lines[0]);
    expect(w.value).toBe("T1w");
    expect(w.why).toEqual(["flags inversion", "rule technique:MPRAGE", "TI 900 TR 2300", "“t1_mprage”", "1 more vote", "System 1 T1w 0.93"]);
    expect(lineWords(reading.lines[2]).value).toBe("no value");
  });

  it("builds the lines from a classify.asked item and the explain door where the engine has no evidence door", () => {
    const explain = {
      axes: [
        { axis: "base", value: "T1w", confidence: 0.97, evidence: [{ rule_set: "base", rule: "technique:MPRAGE", source: "TI", matched: "900", value: "T1w" }, { rule_set: "keyword", rule: "T1w", source: "SeriesDescription", matched: "t1_mprage_sag", value: "T1w" }] },
        { axis: "technique", value: "MPRAGE", confidence: 0.95, evidence: [] },
      ],
    };
    const r = readingFromAsked(asked, explain, 1207, askedAxes(AXES));
    expect(r.axes).toEqual(["base", "technique", "modifier"]);
    const base = r.lines[0];
    expect(base.rule).toBe("technique:MPRAGE");
    expect(base.reads).toEqual([["TI", "900"]]);
    expect(base.words).toEqual(["t1_mprage_sag"]);
    expect(base.agree).toBe(true);
    expect(r.lines[2].agree).toBe(false);
    expect(r.candidates.length).toBe(3);
  });
});

describe("the suggestion", () => {
  it("fills in what both systems agree on, and leaves the axis they differ on with the candidates offered", () => {
    const s = suggestionOf(AXES, reading)!;
    expect(s.agreed).toEqual(["base", "technique"]);
    expect(s.differ).toEqual(["modifier"]);
    expect(s.offered.length).toBe(2);
    const g = givenOf(AXES, s)!;
    expect(g).toEqual({ kind: "values", values: { base: "T1w", technique: "MPRAGE" } });
    expect(complete(AXES, g)).toBe(false);
    // a candidate is one key: every axis at once, an empty set as none
    const c = givenOfCandidate(AXES, s.offered[1])!;
    expect(c).toEqual({ kind: "values", values: { base: "T1w", technique: "MPRAGE", modifier: null } });
    expect(bodyOf(AXES, c).ok).toBe(true);
    expect(chosenCandidate(AXES, s.offered, c)).toBe(s.offered[1]);
    // what an answer changed is counted against the suggestion whole: the first candidate
    expect(changesOf(AXES, baselineOf(AXES, s), c)).toBe(1);
    expect(changesOf(AXES, baselineOf(AXES, s), givenOfCandidate(AXES, s.offered[0])!)).toBe(0);
    // the engine is told the first candidate as what was suggested
    expect(suggestedValue(AXES, s)).toEqual({ base: "T1w", technique: "MPRAGE", modifier: ["FatSat"] });
  });

  it("confirms with Enter alone where they agree on every axis", () => {
    const agreed: Reading = { ...reading, lines: reading.lines.map((l) => ({ ...l, agree: true })) };
    const s = suggestionOf(AXES, agreed)!;
    expect(s.differ).toEqual([]);
    expect(s.offered).toEqual([]);
    const g = givenOf(AXES, s)!;
    expect(complete(AXES, g)).toBe(true);
    expect(bodyOf(AXES, g)).toEqual({ ok: true, body: { value: { base: "T1w", technique: "MPRAGE", modifier: ["FatSat"] } } });
    expect(keyAct("Enter", { ctrl: false, inField: false, q: AXES, rows: rowsOf(AXES, null) })).toEqual({ kind: "answer" });
    expect(changesOf(AXES, g, g)).toBe(0);
  });

  it("takes the engine's own suggestion first, and fills in only values the question lists", () => {
    const s = suggestionOf(BASE, { ...reading, suggested: { base: "T2w" } })!;
    expect(givenOf(BASE, s)).toEqual({ kind: "value", value: "T2w" });
    const odd = suggestionOf(BASE, { ...reading, suggested: { base: "FLAIR" } })!;
    expect(odd.differ).toEqual(["base"]);
    expect(givenOf(BASE, odd)).toEqual({ kind: "value", value: "" });
  });

  it("fills in the rules' value where System 1 has not spoken, and nothing for other questions", () => {
    const rulesOnly: Reading = { ...reading, candidates: [], lines: reading.lines.map((l) => ({ ...l, model: null, agree: null })) };
    expect(givenOf(BASE, suggestionOf(BASE, rulesOnly))).toEqual({ kind: "value", value: "T1w" });
    expect(suggestionOf({ kind: "form" }, reading)).toBeNull();
    expect(suggestionOf(AXES, null)).toBeNull();
  });

  it("never fills in a combination the pack forbids", () => {
    const q: Question = {
      kind: "axes",
      axes: ["base", "technique"],
      constraints: { implications: [{ rule: "mprage-is-t1", when: { axis: "technique", is: "MPRAGE" }, then: [{ axis: "base", value: "T1w" }] }] },
    };
    const bad: Reading = { ...reading, suggested: { base: "T2w", technique: "MPRAGE" } };
    const s = suggestionOf(q, bad)!;
    expect(s.agreed).toEqual([]);
    expect(s.differ).toEqual(["base", "technique"]);
  });
});

describe("the reader's keys", () => {
  const rows = rowsOf(AXES, null);
  const k = (key: string, more: Partial<Parameters<typeof keyAct>[1]> = {}) => keyAct(key, { ctrl: false, inField: false, q: AXES, rows, offered: 2, batches: true, ...more });
  it("choose a candidate with z and x, open the evidence with h, go back with Backspace, batches with b", () => {
    expect(k("z")).toEqual({ kind: "candidate", index: 0 });
    expect(k("x")).toEqual({ kind: "candidate", index: 1 });
    // only as many as are shown
    expect(k("c")).toBeNull();
    expect(k("h")).toEqual({ kind: "evidence" });
    expect(k("Backspace")).toEqual({ kind: "reset" });
    expect(k("b")).toEqual({ kind: "batch" });
    expect(k("b", { batches: false })).toBeNull();
    // the row keys are untouched: none of the reader's keys finds a row
    expect(k("1")?.kind).toBe("find");
    // with the whole header served, h opens it and H the evidence
    expect(k("h", { header: true })).toEqual({ kind: "header" });
    expect(k("H", { header: true })).toEqual({ kind: "evidence" });
    // and a text field keeps its letters
    expect(k("z", { inField: true })).toBeNull();
  });

  it("in the batch view: Enter accepts, n the next, b or Escape back", () => {
    expect(batchKey("Enter", false)).toEqual({ kind: "accept" });
    expect(batchKey("n", false)).toEqual({ kind: "next" });
    expect(batchKey("Escape", false)).toEqual({ kind: "back" });
    expect(batchKey("b", false)).toEqual({ kind: "back" });
    expect(batchKey("Enter", true)).toBeNull();
    expect(batchKey("1", false)).toBeNull();
  });
});

describe("the clock and the pace", () => {
  it("times an item from when it was shown, once", () => {
    const c = new Clock();
    c.start(1, 1_000);
    c.start(1, 5_000);
    expect(c.stop(1, 4_500)).toBe(3.5);
    expect(c.stop(1, 9_000)).toBeNull();
  });

  it("counts decisions and their median, and a batch as each of its stacks", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    let p = paced(NO_PACE, 2, 0);
    p = paced(p, 4, 1);
    p = paced(p, 3, null);
    expect(paceWords(p)).toBe("3 decided · median 3.0 s");
    expect([p.suggested, p.changed]).toEqual([2, 1]);
    p = paced(p, 10, 0, 5);
    expect(p.seconds.length).toBe(8);
    expect(p.batched).toBe(5);
    expect(paceWords(NO_PACE)).toBe("no decisions yet");
  });

});

describe("the pictures ready", () => {
  const item = (id: number, position: number, stack: number, state = "open", value?: number) => ({ ...(claimed as unknown as Claimed).item!, id, position, stack_id: stack, state, ...(value !== undefined ? { value } : {}) }) as Item & { value?: number };
  const items = [item(1, 0, 10), item(2, 1, 11), item(3, 2, 12, "agreed"), item(4, 3, 13), item(5, 4, 14)];

  it("names the next two by position after the current one, less what was answered here and what is settled", () => {
    expect(upcoming(items[0], items, new Set(), "position")).toEqual([11, 13]);
    expect(upcoming(items[0], items, new Set([2]), "position")).toEqual([13, 14]);
    // wrapping to the start when the end is reached
    expect(upcoming(items[4], items, new Set(), "position")).toEqual([10, 11]);
  });

  it("follows the value where the items carry it, and the engine's hint before anything", () => {
    const valued = [item(1, 0, 10, "open", 0.1), item(2, 1, 11, "open", 0.9), item(4, 3, 13, "open", 0.5), item(5, 4, 14, "open", 0.95)];
    expect(upcoming(valued[0], valued, new Set(), "value")).toEqual([14, 11]);
    expect(upcoming(valued[0], valued, new Set(), "value", 2, [13])).toEqual([13, 14]);
    expect(hintOf({ next: [{ stack_id: 13 }, 14, "x"] })).toEqual([13, 14]);
  });

  it("warms two at a time, each once, and drops a queued stack no longer wanted", async () => {
    const started: number[] = [];
    const finish = new Map<number, () => void>();
    const p = new Prefetcher((s) => {
      started.push(s);
      return new Promise<void>((r) => finish.set(s, r));
    }, 2);
    p.want([1, 2, 3]);
    expect(started).toEqual([1, 2]);
    // the reader moved on: 3 is no longer wanted, 4 and 5 are
    p.want([4, 5]);
    finish.get(1)!();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([1, 2, 4]);
    finish.get(2)!();
    finish.get(4)!();
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual([1, 2, 4, 5]);
    // warmed once: asking again starts nothing
    finish.get(5)!();
    await new Promise((r) => setTimeout(r, 0));
    p.want([4, 5, 1]);
    expect(started).toEqual([1, 2, 4, 5]);
    expect(p.has(5)).toBe(true);
    expect(p.has(3)).toBe(false);
  });
});

describe("batches of like stacks", () => {
  const raw = {
    campaign: 7,
    open: 40,
    sealed: 2,
    unsuggested: 3,
    count: 2,
    groups: [
      { key: "a1b2c3", count: 30, suggested: "T1w", signature: { rules: { base: "base/technique:MPRAGE" }, header: { text_sequence_name: "*tfl3d1_16ns", repetition_time: 2300 } }, sample: [1, 2, 3, 4, 5] },
      { key: "d4e5f6", count: 0, suggested: "T2w", signature: {}, sample: [] },
    ],
  };
  const stacks: Record<number, number> = { 1: 10, 2: 11, 3: 12, 4: 13 };
  const batches = batchesOf(raw, (i) => stacks[i] ?? null, "base");
  const b = batches[0];

  it("reads the batches door: the suggestion, what the stacks share, the items shown with their stacks", () => {
    expect(batches.length).toBe(1);
    expect(b.values).toEqual({ base: "T1w" });
    expect(b.count).toBe(30);
    expect(b.words).toBe("sequence *tfl3d1_16ns · TR 2300 · base by base/technique:MPRAGE");
    expect(b.items.map((i) => i.stack)).toEqual([10, 11, 12, 13, null]);
    // an axes question's suggestion is an object
    expect(batchesOf({ groups: [{ key: "k", count: 1, suggested: { base: "T1w", modifier: null }, sample: [9] }] })[0].values).toEqual({ base: "T1w", modifier: null });
  });

  it("accepts the whole batch with a tenth held back, or only the shown others where the person held some", () => {
    const whole = acceptPlan(b, new Set());
    expect(whole).toEqual({ items: null, n: 30, drawn: 3, read: [] });
    expect(planWords(whole)).toBe("27 stacks take the suggestion; 3 held back to read one by one.");
    const some = acceptPlan(b, new Set([4]));
    expect(some).toEqual({ items: [1, 2, 3, 5], n: 4, drawn: 1, read: [4] });
    expect(planWords(some)).toBe("3 stacks take the suggestion; 2 held back to read one by one.");
    // a batch of one holds none back
    expect(acceptPlan({ ...b, count: 1, items: [b.items[0]] }, new Set()).drawn).toBe(0);
    expect(acceptedOf({ campaign: 7, batch: "a1b2c3", hold_back: 0.1, accepted: [{ item: 1, answer: 5, state: "agreed" }, { item: 2, answer: 6, state: "agreed" }], held_back: [3], refused: [] })).toEqual({ accepted: 2, held: [3], refused: 0 });
  });

  it("draws the grid with its counts, the held marked, one move to accept", () => {
    const none = () => undefined;
    const html = renderToStaticMarkup(<BatchView batches={batches} at={0} mine={new Set([4])} busy={false} said={null} onHold={none} onAccept={none} onNext={none} onBack={none} />);
    expect(html).toContain("batch 1 of 1 · 30 like stacks · 5 shown");
    expect(html).toContain("<b>3</b> take the suggestion · <b>2</b> held back");
    expect(html).toContain("the 25 not shown wait for a later move");
    expect(html).toContain("Accept for 4");
    expect(html).toContain("held back by you");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    const all = renderToStaticMarkup(<BatchView batches={batches} at={0} mine={new Set()} busy={false} said={null} onHold={none} onAccept={none} onNext={none} onBack={none} />);
    expect(all).toContain("<b>27</b> take the suggestion · <b>3</b> held back (3 at random for the draw)");
    expect(all).toContain("Accept for 30");
    const empty = renderToStaticMarkup(<BatchView batches={[]} at={0} mine={new Set()} busy={false} said={null} onHold={none} onAccept={none} onNext={none} onBack={none} />);
    expect(empty).toContain("No batch of like stacks is left here.");
  });
});

describe("the reader's parts", () => {
  it("draws the suggestion: agreed with Enter, or the candidates with their keys and probabilities", () => {
    const s = suggestionOf(AXES, reading)!;
    const html = renderToStaticMarkup(<SuggestionBar s={s} chosen={null} onChoose={() => undefined} busy={false} />);
    expect(html).toContain("They agree on base, technique and differ on modifier");
    expect(html).toContain("<kbd>z</kbd>0.71");
    expect(html).toContain("<kbd>x</kbd>0.22");
    // bare: the disclosures are the lines' job here
    expect(html).not.toContain("Both systems");
    const all = renderToStaticMarkup(<SuggestionBar s={{ ...s, differ: [], offered: [] }} chosen={null} onChoose={() => undefined} busy={false} />);
    expect(all).toContain("Rules and System 1 agree · p 0.71. Enter confirms.");
  });

  it("draws one line per axis, and the rest when opened", () => {
    const shut = renderToStaticMarkup(<EvidenceLines lines={reading.lines} open={false} onToggle={() => undefined} />);
    expect((shut.match(/class="ev( differ)?"/g) ?? []).length).toBe(3);
    expect(shut).toContain("how it was decided");
    expect(shut).not.toContain("ev-more");
    const opened = renderToStaticMarkup(<EvidenceLines lines={reading.lines} open onToggle={() => undefined} />);
    expect(opened).toContain("base/technique:MPRAGE · held: clause 0");
    expect(opened).toContain("not at this detail");
    expect(opened).toContain("FatSat · p 0.76");
  });

  it("puts the suggestion, the lines, the pace and the order in the workspace", () => {
    const open = openCampaign as unknown as Campaign;
    const q = { ...open.question, ...AXES, axis: undefined };
    const c = { ...open, question: q };
    const s = suggestionOf(q, reading)!;
    const none = () => undefined;
    const props: WorkspaceBodyProps = {
      caps: capsFor({ grants: RATER, principal: "alice@walk", doors: [...DOORS, R48.line, R48.batches] }),
      campaign: c,
      role: "rater",
      seat: seatOf(claimed as unknown as Claimed),
      rows: rowsOf(q, null),
      given: givenOf(q, s) as Given,
      why: "",
      marks: {},
      split: null,
      raterAnswers: [],
      evidence: null,
      candidates: [],
      now: Date.parse("2026-09-24T09:56:13Z"),
      busy: false,
      refused: null,
      said: null,
      open: 3,
      done: 1,
      keys: true,
      onGiven: none,
      onWhy: none,
      onAnswer: none,
      onSkip: none,
      onStop: none,
      onKeys: none,
      onAgain: none,
      lines: reading.lines,
      suggestion: s,
      pace: paced(NO_PACE, 3.2, 0),
      order: "value",
      onOrder: none,
      batchesOffered: true,
      onBatches: none,
    };
    const html = renderToStaticMarkup(<WorkspaceBody {...props} />);
    expect(html).toContain("1 decided · median 3.2 s");
    expect(html).toMatch(/aria-pressed="true"[^>]*>by value/u);
    expect(html).toContain("Like stacks in batches");
    expect(html).toContain("They agree on base, technique");
    // the evidence is one key away (record 48, one screen): H opens it over the reader
    expect(html).toContain("<kbd>H</kbd>how decided");
    expect(html).not.toContain("rule technique:MPRAGE");
    expect(renderToStaticMarkup(<WorkspaceBody {...props} evOpen />)).toContain("rule technique:MPRAGE");
    // the agreed values are drawn chosen on their rows
    expect(html).toMatch(/class="opt on" aria-pressed="true"[^>]*>T1w/u);
    // the key list names the reader's keys
    expect(html).toContain("confirm the answer filled in");
    expect(html).toContain("<dt>z x</dt>");
    // the batch view takes the stack's place while it is open
    const batch = renderToStaticMarkup(<WorkspaceBody {...props} batch={{ batches: [], at: 0, mine: new Set(), busy: false, said: null, onHold: none, onAccept: none, onNext: none, onBack: none }} />);
    expect(batch).toContain("No batch of like stacks");
    expect(batch).not.toContain("rate-grid");
    // without the reader's props the workspace is record 45's
    const plain = renderToStaticMarkup(<WorkspaceBody {...props} lines={null} suggestion={null} pace={undefined} order={null} batchesOffered={false} />);
    expect(plain).not.toContain("by value");
    expect(plain).toContain("1 answered here");
  });

  it("says the pace and offers value order only where the engine does", () => {
    expect(renderToStaticMarkup(<PaceCount pace={paced(paced(NO_PACE, 2, 1), 4, 0)} />)).toContain("2 decided · median 3.0 s · 1 of 2 suggestions changed");
    expect(valueOrderServed(capsFor())).toBe(false);
    expect(valueOrderServed(capsFor({ doors: [...DOORS, R48.stats] }))).toBe(true);
    expect(valueOrderServed(capsFor({ engine: { campaigns: { claim_orders: ["position"] } }, doors: [...DOORS, R48.stats] }))).toBe(false);
  });

  it("shows each rater's pace on the campaign page, or a rater's own row alone", () => {
    const all = statsOf({ all: { answers: 123 }, raters: [{ principal: "alice@walk", answers: 120, median_seconds: 3.4, p90_seconds: 7.2, suggested: 100, changed: 7, share_changed: 0.07, batched: 40 }, { rater: "bob@walk", answers: 3 }, { nobody: 1 }] });
    expect(all).toEqual({
      raters: [
        { principal: "alice@walk", decisions: 120, median_seconds: 3.4, p90_seconds: 7.2, changed: 0.07, batched: 40 },
        { principal: "bob@walk", decisions: 3, median_seconds: null, p90_seconds: null, changed: null, batched: null },
      ],
      blind: false,
    });
    const c = openCampaign as unknown as Campaign;
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor()} campaign={c} answers={[]} sets={[]} stats={all} onAct={() => undefined} />);
    expect(html).toContain("<h2>Pace</h2>");
    expect(html).toContain("alice@walk");
    expect(html).toContain(">7.2<");
    expect(html).toContain(">7%<");
    // the door's totals are never drawn
    expect(html).not.toContain("123");
    // a rater's own row, blind: no name column, no one else, no totals
    const own = statsOf({ raters: [{ principal: "alice@walk", answers: 12, median_seconds: 2.5 }], blind: true });
    const mine = renderToStaticMarkup(<CampaignBody caps={capsFor()} campaign={c} answers={[]} sets={[]} stats={own} onAct={() => undefined} />);
    expect(mine).toContain("<h2>Your pace</h2>");
    expect(mine).not.toContain("<th>Rater</th>");
    expect(mine).toContain(">2.5<");
    expect(renderToStaticMarkup(<CampaignBody caps={capsFor()} campaign={c} answers={[]} sets={[]} onAct={() => undefined} />)).not.toContain("Pace</h2>");
  });

  it("starts from a blank answer where nothing is suggested", () => {
    expect(givenOf(AXES, null)).toBeNull();
    expect(blank(AXES)).toEqual({ kind: "values", values: {} });
  });
});

describe("the review's findings", () => {
  const el = (tagName: string, opts: { role?: string; inRows?: boolean } = {}) => ({
    tagName,
    getAttribute: (n: string) => (n === "role" ? (opts.role ?? null) : null),
    closest: (sel: string) => (opts.inRows && sel.includes(".axis-rows") ? {} : null),
  });

  it("leaves Enter to a focused button, link, tile or toggle; only the body and the answer controls answer", () => {
    expect(enterOwnedBy(el("BUTTON"))).toBe(true);
    expect(enterOwnedBy(el("A"))).toBe(true);
    expect(enterOwnedBy(el("SUMMARY"))).toBe(true);
    // a batch tile is a div with the button role
    expect(enterOwnedBy(el("DIV", { role: "button" }))).toBe(true);
    // a value on the rows answers
    expect(enterOwnedBy(el("BUTTON", { inRows: true }))).toBe(false);
    expect(enterOwnedBy(el("BODY"))).toBe(false);
    expect(enterOwnedBy(el("SECTION"))).toBe(false);
    expect(enterOwnedBy(null)).toBe(false);
  });

  it("reads a blind item with no classification at all: only the raw header beside the pictures, an empty form", () => {
    const r = readingOf({ ...(whyDoc as unknown as Json), blind: true, suggested: { base: "T1w" } });
    expect(r.blind).toBe(true);
    // no values in force, deciding rules, votes, words, line text, who set it, System 1 or candidates
    expect(r.lines).toEqual([]);
    expect(r.candidates).toEqual([]);
    expect([r.suggested, r.suggestedOne, r.value, r.batch]).toEqual([null, null, null, null]);
    expect(JSON.stringify(r)).not.toMatch(/T1w|MPRAGE|technique:|keyword|carol@walk|person|System 1|t1_mprage/u);
    // the raw header stays
    expect(r.header).toContainEqual(["TR", "2300"]);
    expect(r.header).toContainEqual(["TI", "900"]);
    // the rater answers from an empty form: nothing suggested, Backspace goes back to blank
    expect(suggestionOf(AXES, r)).toBeNull();
    expect(suggestionOf(BASE, r)).toBeNull();
    expect(givenOf(AXES, suggestionOf(AXES, r))).toBeNull();
    // the campaign's own mark makes any reading blind the same way
    const b = blindReading({ ...reading, header: [["TR", "2300"]] }, 1207, askedAxes(AXES));
    expect(b.lines).toEqual([]);
    expect(b.header).toEqual([["TR", "2300"]]);
    expect(suggestionOf(AXES, b)).toBeNull();
    expect(blindReading(null, 5, ["base"])).toMatchObject({ blind: true, lines: [], header: [], stack: 5 });
    const open = openCampaign as unknown as Campaign;
    const none = () => undefined;
    const seat = seatOf({ ...(claimed as unknown as Claimed), item: { ...(claimed as unknown as Claimed).item!, blind: true } });
    const html = renderToStaticMarkup(
      <WorkspaceBody caps={capsFor()} campaign={open} role="rater" seat={seat} rows={rowsOf(open.question, null)} given={blank(open.question)} why="" marks={{}} split={null} raterAnswers={[]} evidence={null} candidates={[]} now={0} busy={false} refused={null} said={null} open={1} done={0} keys={false} onGiven={none} onWhy={none} onAnswer={none} onSkip={none} onStop={none} onKeys={none} onAgain={none} blind header={b.header} lines={reading.lines} suggestion={suggestionOf(AXES, reading)} />,
    );
    expect(html).toContain('class="tag gated"');
    expect(html).toContain(">blind<");
    expect(html).toContain('<span class="hb-v">TR 2300</span>');
    // even handed lines and a suggestion, a blind item draws neither
    expect(html).not.toContain("class=\"suggest");
    expect(html).not.toContain("evidence-lines");
    expect(html).not.toContain("technique:MPRAGE");
    // the form is empty: no value pressed
    expect(html).not.toContain('aria-pressed="true"');
  });

  it("never puts a blind item in a batch, and counts it out", () => {
    const raw = { groups: [{ key: "k", count: 6, suggested: "T1w", signature: {}, sample: [1, 2, { item: 3, blind: true }, 4] }] };
    const [b] = batchesOf(raw, () => null, "base", (i) => i === 2);
    expect(b.items.map((i) => i.item)).toEqual([1, 4]);
    expect(b.count).toBe(4);
  });

  it("labels a batch and a line without a sequence name below detail quasi", () => {
    const [b] = batchesOf({ groups: [{ key: "k", count: 3, suggested: "T1w", signature: { rules: { base: "base/technique:MPRAGE" }, header: { repetition_time: 2300, text_sequence_name: null } }, sample: [1] }] }, () => null, "base");
    expect(b.words).toBe("TR 2300 · base by base/technique:MPRAGE");
    const plain = readingOf({ axes: [{ axis: "base", value: "T1w", decided: { rule_set: "base", rule: "r", reads: { flags: [] }, header: { repetition_time: 2300 } }, voted: [] }] });
    expect(lineWords(plain.lines[0]).why.join(" ")).not.toContain("sequence");
    expect(plain.lines[0].words).toBeNull();
  });

  it("keeps at most the last entries in its caches", async () => {
    const m = new Map<number, number>();
    for (let i = 0; i < 250; i++) m.set(i, i);
    bound(m, 200);
    expect(m.size).toBe(200);
    expect(m.has(49)).toBe(false);
    expect(m.has(50)).toBe(true);
    const p = new Prefetcher(() => Promise.resolve(), 4, 3);
    for (let i = 1; i <= 5; i++) {
      p.want([i]);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(p.warmed).toEqual([3, 4, 5]);
    expect(p.has(1)).toBe(false);
    expect(p.has(5)).toBe(true);
  });
});
