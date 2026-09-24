// SPDX-License-Identifier: AGPL-3.0-only
// The reader (record 48 R1): the suggestion filled in and confirmed with one
// key, the candidates where the systems differ, the evidence one line per
// axis, the keys, the clock and the pace, the prefetch's scheduling, batches
// accepted with their held back, and the parts as they draw.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import askedItem from "../../test/fixtures/campaigns/reader_asked.json";
import lineDoc from "../../test/fixtures/campaigns/reader_line.json";
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
import { hintOf, R48, timed, valueOrderServed } from "./readerDoors";
import { EvidenceLines, PaceCount, SuggestionBar } from "./ReaderParts";
import { blank } from "./renderers";
import { WorkspaceBody, type WorkspaceBodyProps } from "./Workspace";
import { bodyOf, keyAct, rowsOf, seatOf } from "./workspace";

const AXES: Question = { kind: "axes", axes: ["base", "technique", "modifier"], values: { base: ["DWI", "T1w", "T2w"], technique: ["MPRAGE", "TSE", "SE"], modifier: ["FatSat", "FLAIR"] } };
const BASE: Question = { kind: "axis", axis: "base", values: ["DWI", "T1w", "T2w"] };
const reading = readingOf(lineDoc as unknown as Json);
const asked = (askedItem as { evidence: Json }).evidence;

describe("the evidence line", () => {
  it("reads the engine's door: flags, rule and clause, the header values read, votes, words, System 1", () => {
    expect(reading.item).toBe(301);
    expect(reading.stack).toBe(1207);
    expect(reading.batch).toBe("siemens-mprage-t1");
    expect(reading.value).toBe(0.29);
    const base = reading.lines.find((l) => l.axis === "base")!;
    expect(base.flags).toEqual(["inversion"]);
    expect(base.clause).toBe("TI > 700 and TR < 3000");
    expect(base.reads).toContainEqual(["TI", "900"]);
    expect(base.reads).toContainEqual(["image type", "ORIGINAL\\PRIMARY\\M"]);
    expect(base.model).toEqual({ value: "T1w", p: 0.93, weighed: ["TI", "words"] });
    // a list of {name, value} reads as well as an object
    expect(reading.lines[1].reads).toEqual([
      ["MR acquisition type", "3D"],
      ["scanning sequence", "GR\\IR"],
    ]);
    // below the detail that shows words, none are drawn and the line says so
    expect(reading.lines[1].words).toBeNull();
    // an illegal candidate is never drawn
    expect(reading.candidates.map((c) => c.p)).toEqual([0.71, 0.22]);
  });

  it("says the value, then what decided it, in one line", () => {
    const w = lineWords(reading.lines[0]);
    expect(w.value).toBe("T1w");
    expect(w.why).toEqual(["flags inversion", "rule technique:MPRAGE (TI > 700 and TR < 3000)", "TR 2300 TE 2.98 TI 900 flip angle 9 sequence name *tfl3d1_16ns image type ORIGINAL\\PRIMARY\\M", "“t1”, “mprage”", "1 more vote", "System 1 T1w 0.93"]);
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
    // the value keys are untouched: none of the reader's keys is a value key
    expect(k("1")?.kind).toBe("choose");
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

  it("carries the seconds and the suggestion beside the answer", () => {
    expect(timed({ value: "T1w" }, 2.34567, 0, "T1w")).toEqual({ value: "T1w", seconds: 2.346, changes: 0, suggested: "T1w" });
    expect(timed({ value: "T1w" }, null, null, null)).toEqual({ value: "T1w" });
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
    batches: [
      { key: "b1", words: "Siemens MPRAGE, T1w suggested", values: { base: "T1w", technique: "MPRAGE" }, items: [{ item: 1, stack_id: 10 }, { item: 2, stack_id: 11 }, { item: 3, stack_id: 12 }, { item: 4, stack_id: 13 }, 5], held: [3] },
      { key: "b2", items: [] },
    ],
  };
  const batches = batchesOf(raw);
  const b = batches[0];

  it("reads the batches door, an empty batch left out", () => {
    expect(batches.length).toBe(1);
    expect(b.items.map((i) => i.item)).toEqual([1, 2, 3, 4, 5]);
    expect(b.items[4].stack).toBeNull();
    expect(b.held).toEqual([3]);
  });

  it("accepts for all but the held back: the engine's draw and the ones the person held", () => {
    const plan = acceptPlan(b, new Set([4]));
    expect(plan).toEqual({ accept: [1, 2, 5], read: [3, 4] });
    expect(planWords(plan)).toBe("3 stacks take the suggestion; 2 held back to read one by one.");
    expect(planWords(acceptPlan({ ...b, held: [] }, new Set()))).toBe("5 stacks take the suggestion.");
    expect(acceptedOf({ accepted: [1, 2, 5], held: [3, 4] }, plan)).toEqual({ accepted: 3, held: [3, 4] });
    // an engine that answers counts only
    expect(acceptedOf({ accepted: 3 }, plan)).toEqual({ accepted: 3, held: [3, 4] });
  });

  it("draws the grid with its counts, the held marked, one move to accept", () => {
    const none = () => undefined;
    const html = renderToStaticMarkup(<BatchView batches={batches} at={0} mine={new Set([4])} busy={false} said={null} onHold={none} onAccept={none} onNext={none} onBack={none} />);
    expect(html).toContain("batch 1 of 1 · 5 like stacks");
    expect(html).toContain("<b>3</b> take the suggestion · <b>2</b> held back");
    expect(html).toContain("Accept for 3");
    expect(html).toContain("held back for the certificate&#x27;s draw");
    expect(html).toContain("held back by you");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(2);
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
    expect(opened).toContain("held: TI &gt; 700 and TR &lt; 3000");
    expect(opened).toContain("not at this detail");
    expect(opened).toContain("weighed TI, words");
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
    expect(html).toContain("rule technique:MPRAGE");
    // the agreed values are drawn chosen on their rows
    expect(html).toContain(`class="opt on" aria-pressed="true"><kbd>2</kbd>T1w`);
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

  it("shows each rater's pace on the campaign page", () => {
    const stats = statsOf({ raters: [{ principal: "alice@walk", decisions: 120, median_seconds: 3.4, suggested: 100, changed: 7, batched: 40 }, { rater: "bob@walk", answers: 3 }, { nobody: 1 }] });
    expect(stats).toEqual([
      { principal: "alice@walk", decisions: 120, median_seconds: 3.4, changed: 0.07, batched: 40 },
      { principal: "bob@walk", decisions: 3, median_seconds: null, changed: null, batched: null },
    ]);
    const c = openCampaign as unknown as Campaign;
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor()} campaign={c} answers={[]} sets={[]} stats={stats} onAct={() => undefined} />);
    expect(html).toContain("<h2>Pace</h2>");
    expect(html).toContain("alice@walk");
    expect(html).toContain(">7%<");
    expect(renderToStaticMarkup(<CampaignBody caps={capsFor()} campaign={c} answers={[]} sets={[]} onAct={() => undefined} />)).not.toContain("<h2>Pace</h2>");
  });

  it("starts from a blank answer where nothing is suggested", () => {
    expect(givenOf(AXES, null)).toBeNull();
    expect(blank(AXES)).toEqual({ kind: "values", values: {} });
  });
});
