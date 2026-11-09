// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 (record 56 section 6.3): the questions as the engine says
// them, read into one shape; the grid's state as the gallery's (UX round 6:
// the first answer every scan's at open, a key for every scan, a click for
// one, space sets one apart and it stays open, 0 the whole list once) and
// what Enter sends (one answer for the page's scans, the ones set otherwise
// as exceptions); the list in plain words with its counts and the ways out;
// the grid's one bar and its tiles, answering a page and opening the next;
// and the same keys under an open scan in the dataset viewer.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorError, type Json } from "../ask/client";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { KEYS_HELP, QuestionGrid, QuestionsPage } from "./Questions";
import {
  answerBody,
  answeredOf,
  answeredWords,
  apartOf,
  chooseKey,
  chooseNothing,
  chooseValue,
  elsewhereHref,
  gridHref,
  gridOf,
  keyAct,
  kindsAnswered,
  listHref,
  listOf,
  moved,
  openList,
  otherOf,
  pageOf,
  QUESTION_DOORS,
  refusedWords,
  ruleLine,
  slots,
  tally,
  tallyWords,
  tileAnswer,
  toggleApart,
  toggleTile,
  whereOf,
  wordsOf,
} from "./questions";
import { answered, LIST, PAGE_MISSING, PAGE_PAIR } from "./questions.fixture";
import { ScanQuestion } from "./ScanQuestion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = [QUESTION_DOORS.list, QUESTION_DOORS.scans, QUESTION_DOORS.answer, "GET /api/review", "GET /api/review/summary", "POST /api/campaigns"];
const caps = capsWith(DOORS, [...GRANTS] as Grant[]);
const reader = capsWith(DOORS, ["review:see"] as Grant[]);

describe("the doors' answers, read into one shape", () => {
  it("reads a list, its vocabularies, what is answered elsewhere and what campaigns hold", () => {
    const l = listOf(LIST);
    expect(l.scope).toEqual({ kind: "dataset", name: "ms-a", id: 3 });
    expect(l.questions.map((q) => [q.key, q.shape, q.scans, q.staged])).toEqual([
      ["base:PDw|T2w", "pair", 12, 0],
      ["base:missing", "missing", 7, 1],
    ]);
    expect(l.vocabularies.base.find((v) => v.name === "T2starw")).toEqual({ value: "T2*w", name: "T2starw", label: "T2*w" });
    expect(l.elsewhere).toEqual([{ kind: "classify.asked", scans: 2, words: "System 1 asks about a whole scan", page: "asked" }]);
    expect(l.held).toEqual({ scans: 3, campaigns: [{ id: 6, name: "base-check" }] });
    // read for one scan, each question says that scan's mode, and nothing else is one
    const one = listOf({ ...LIST, questions: [{ ...(LIST.questions as Json[])[1], mode: "blind_first" }, { ...(LIST.questions as Json[])[0], mode: "maybe" }] });
    expect(one.questions.map((q) => q.mode)).toEqual(["blind_first", undefined]);
    expect(l.questions.every((q) => !("mode" in q))).toBe(true);
    // an engine that said less still reads
    expect(listOf({ questions: [{ key: "base:missing", axis: "base" }, { axis: "nokey" }] }).questions).toEqual([{ key: "base:missing", axis: "base", shape: "missing", values: [], words: "Which base?", reason: "", scans: 0, staged: 0, kinds: {} }]);
  });

  it("reads a page of scans, and a blind scan keeps none of NILS's answers whatever came", () => {
    const p = pageOf(PAGE_MISSING);
    expect(p.scans).toHaveLength(7);
    expect(p.system1.status).toBe("not_confirmed");
    const staged = p.scans.find((s) => s.stack === 203)!;
    expect(staged.staged).toMatchObject({ value: "T2w", author_kind: "model", actor: "s1c" });
    expect(staged.status).toBe("staged");
    const blind = pageOf({ ...PAGE_MISSING, scans: [{ ...(PAGE_MISSING.scans as object[])[4], nils: "T1w", system1: { value: "T1w", p: 0.9 }, staged: { value: "T1w" }, name: "Ax_T1w" }] }).scans[0];
    expect(blind).toMatchObject({ blind: true, nils: null, system1: null, staged: null, name: null, rules: null });
    expect(blind.picture).toMatch(/^data:image/u);
    expect(pageOf({}).scans).toEqual([]);
  });

  it("reads what the answer did", () => {
    const a = answeredOf(answered("base:missing", [201, 202, 203], 4, [203]));
    expect(a).toMatchObject({ answered: 2, skipped: [203], left: 4, resort: { state: "done", job: 88 } });
    expect(a.decisions.map((d) => d.stack)).toEqual([201, 202]);
  });

  it("says a question in words where the engine gave none", () => {
    expect(wordsOf("missing", "body_part", [])).toBe("Which body part?");
    expect(wordsOf("pair", "base", ["T2w", "PDw"])).toBe("T2w or PDw?");
    expect(wordsOf("doubt", "base", ["T2w"])).toBe("T2w?");
  });
});

describe("the grid's state and what Enter sends", () => {
  const p = pageOf(PAGE_PAIR);

  it("gives every scan the question's first answer at open, so Enter has something to send", () => {
    const s = gridOf(p);
    expect(s.answer).toBe("T2w");
    expect(tileAnswer(s, 301)).toEqual({ kind: "value", value: "T2w" });
    expect(answerBody(s, { dataset: "ms-a" })).toEqual({ value: "T2w", stacks: p.scans.map((x) => x.stack), except: [], dataset: "ms-a" });
    expect(tallyWords(s)).toBe("12 scans · T2w 12");
    // a question that offers no answer sends nothing
    const none = gridOf(pageOf({ ...PAGE_PAIR, values: [] }));
    expect(none.answer).toBeNull();
    expect(answerBody(none, {})).toBeNull();
    expect(tileAnswer(none, 301)).toBeNull();
  });

  it("a key makes its answer every scan's; a click gives a scan the other answer and takes it back", () => {
    let s = chooseKey(gridOf(p), "2");
    expect(s.answer).toBe("PDw");
    expect(otherOf(s)).toBe("T2w");
    s = toggleTile(s, 304);
    s = toggleTile(s, 309);
    expect(s.focus).toBe(309);
    expect(tileAnswer(s, 304)).toEqual({ kind: "value", value: "T2w" });
    expect(tileAnswer(s, 301)).toEqual({ kind: "value", value: "PDw" });
    expect(answerBody(s, { dataset: "ms-a" })).toEqual({
      value: "PDw",
      stacks: p.scans.map((x) => x.stack),
      except: [
        { stack: 304, value: "T2w" },
        { stack: 309, value: "T2w" },
      ],
      dataset: "ms-a",
    });
    expect(tallyWords(s)).toBe("12 scans · PDw 10 · T2w 2");
    // the other key after: the scans the person clicked keep their answer, now the page's, and say nothing of their own
    s = chooseKey(s, "1");
    expect(s.answer).toBe("T2w");
    expect(s.tiles).toEqual({});
    expect(answerBody(s, {})?.except).toEqual([]);
    expect(tallyWords(s)).toBe("12 scans · T2w 12");
    // a click again puts a scan back
    s = toggleTile(toggleTile(s, 304), 304);
    expect(answerBody(s, {})?.except).toEqual([]);
    // a key with no answer behind it changes nothing
    const one = gridOf(pageOf({ ...PAGE_PAIR, values: ["T2w"] }));
    expect(chooseKey(one, "2")).toBe(one);
    expect(otherOf(one)).toBeNull();
    expect(toggleTile(one, 301)).toBe(one);
  });

  it("sets a scan apart for later, and it stays open whatever key is pressed", () => {
    let s = toggleApart(gridOf(p), 303);
    expect(tileAnswer(s, 303)).toEqual({ kind: "skip" });
    expect(apartOf(s)).toEqual([303]);
    s = chooseKey(s, "2");
    expect(tileAnswer(s, 303)).toEqual({ kind: "skip" });
    expect(answerBody(s, { cohort: "north" })).toEqual({ value: "PDw", stacks: p.scans.map((x) => x.stack), except: [{ stack: 303, skip: true }], cohort: "north" });
    expect(tally(s)).toEqual({ total: 12, counts: [["PDw", 11]], nothing: 0, apart: 1 });
    expect(tallyWords(s)).toBe("12 scans · PDw 11 · 1 set apart");
    // space again puts it back; a click on one set apart puts it back as well
    expect(apartOf(toggleApart(s, 303))).toEqual([]);
    expect(toggleTile(s, 303).tiles[303]).toBeUndefined();
  });

  it("opens the whole list once, for the scan in focus or for the scans set apart, and the pick closes it", () => {
    let s = gridOf(p);
    s = openList(moved(s, 5));
    expect(s.listing).toBe(306);
    s = chooseValue(s, "SWI");
    expect(s.listing).toBeNull();
    expect(tileAnswer(s, 306)).toEqual({ kind: "value", value: "SWI" });
    // the list's value that is the page's answer says nothing of its own
    s = chooseValue(openList(s, 306), "T2w");
    expect(s.tiles[306]).toBeUndefined();
    // no value for one scan
    s = chooseNothing(openList(s, 307));
    expect(tileAnswer(s, 307)).toEqual({ kind: "nothing" });
    expect(tallyWords(s)).toBe("12 scans · T2w 11 · no value 1");
    // with the scan in focus set apart, 0 opens the list for every scan set apart, and the pick gives them that value;
    // in focus on another scan, it is that scan's
    s = toggleApart(toggleApart(s, 301), 302);
    expect(openList(moved(s, 3)).listing).toBe(305);
    s = openList(s);
    expect(s.listing).toBe("apart");
    s = chooseValue(s, "DWI");
    expect(apartOf(s)).toEqual([]);
    expect(tileAnswer(s, 301)).toEqual({ kind: "value", value: "DWI" });
    expect(tileAnswer(s, 302)).toEqual({ kind: "value", value: "DWI" });
    expect(answerBody(s, {})?.except).toEqual([
      { stack: 301, value: "DWI" },
      { stack: 302, value: "DWI" },
      { stack: 307, nothing: true },
    ]);
    // 0 again closes it; a pick with nothing open changes nothing
    expect(openList(openList(s)).listing).toBeNull();
    expect(chooseValue(s, "SWI")).toBe(s);
  });

  it("maps the keys, and moves the focus within the page", () => {
    expect(["1", "2", "0", " ", "Enter", "f", "?", "Escape", "-", "x"].map((k) => keyAct(k).kind)).toEqual(["key", "key", "list", "apart", "apply", "full", "reasons", "back", "none", "none"]);
    expect(keyAct("ArrowDown", 4)).toEqual({ kind: "move", by: 4 });
    expect(keyAct("ArrowLeft")).toEqual({ kind: "move", by: -1 });
    const s = gridOf(p);
    expect(s.focus).toBe(301);
    expect(moved(s, 5).focus).toBe(306);
    expect(moved(s, -3).focus).toBe(301);
    expect(moved(s, 99).focus).toBe(312);
  });

  it("says what an answer did, and reads a stale page again", () => {
    const s = toggleTile(gridOf(p), 304);
    expect(answeredWords(answeredOf(answered("base:PDw|T2w", [301, 302], 0)), s)).toBe("2 scans answered: T2w 11, PDw 1 · sorted again");
    expect(answeredWords(answeredOf(answered("base:PDw|T2w", [301, 302], 0)), gridOf(p))).toBe("2 scans answered: T2w · sorted again");
    expect(answeredWords(answeredOf({ answered: 1, skipped: [5], resort: { state: "waiting", why: "a sort is running; these scans wait for the next" } }))).toBe("1 scan answered · 1 left for later · a sort is running; these scans wait for the next");
    expect(refusedWords(new DoorError(409, { error: "stack 303 is not asked by base:missing here" }))).toEqual({ words: "stack 303 is not asked by base:missing here. The page is read again.", stale: true });
    expect(refusedWords(new DoorError(403, {}))).toEqual({ words: "Answering needs work on the Review page.", stale: false });
  });

  it("draws a scan's rule with what it was decided over", () => {
    const scan = p.scans[0];
    expect(ruleLine(scan.rules)).toBe("base: T2w by base/t2_by_name (name) · over physics/pd_by_te (PDw)");
    expect(ruleLine(null)).toBeNull();
  });

  it("slots the colours by the axis's own order, so a value keeps its colour everywhere", () => {
    expect(slots(p.vocabulary, p.values).slice(0, 4)).toEqual(["DWI", "SWI", "T2*w", "T2w"]);
    expect(slots([], ["T2w", "PDw"])).toEqual(["T2w", "PDw"]);
  });
});

describe("the addresses", () => {
  it("encode a key, keep where the list was opened for, and lead to where a question is answered elsewhere", () => {
    expect(gridHref("base:PDw|T2w", { dataset: "ms-a" })).toBe("#review/questions/base%3APDw%7CT2w?dataset=ms-a");
    expect(listHref({ cohort: "north" })).toBe("#review/questions?cohort=north");
    expect(whereOf({ dataset: "ms-a", cohort: "x" })).toEqual({ dataset: "ms-a" });
    expect(whereOf({ cohort: "none" })).toEqual({});
    expect(elsewhereHref({ page: "asked" }, {})).toBe("#review/asked");
    expect(elsewhereHref({ page: "queue" }, {})).toBeNull();
    expect([...kindsAnswered(listOf(LIST))]).toEqual(["base:disagree", "base:missing"]);
  });
});

describe("the questions as cards", () => {
  it("each question a card with its words, its scans, why and the way to its grid; nothing else", () => {
    const html = renderToStaticMarkup(<QuestionsPage list={listOf(LIST)} where={{ dataset: "ms-a" }} />);
    expect(html).toContain("<h1>Scans to answer</h1>");
    expect(html).toContain('<span class="rv-title">T2w or PDw?</span>');
    expect(html).toContain("The rules found no base for these scans.");
    expect(html).toContain("<b>7</b><span>scans</span>");
    expect(html).toContain('href="#review/questions/base%3Amissing?dataset=ms-a"');
    expect(html.match(/>Answer<\/a>/gu)).toHaveLength(2);
    expect(html).toContain("in dataset ms-a");
    // what is answered elsewhere and what campaigns hold are not on this page
    expect(html).not.toContain("System 1 asks");
    expect(html).not.toContain("base-check");
    expect(html).not.toContain("staged");
    const axis = renderToStaticMarkup(<QuestionsPage list={listOf(LIST)} where={{}} axis="base" />);
    expect(axis).toContain("<h1>Base</h1>");
    expect(axis).not.toContain("in dataset");
    expect(renderToStaticMarkup(<QuestionsPage list={listOf({ questions: [] })} where={{}} />)).toContain("Nothing to answer here.");
  });
});

describe("a question's grid", () => {
  let root: Root;
  let host: HTMLElement;
  let calls: { method: string; url: string; body: unknown }[];
  let left: number;
  let listDoc: typeof LIST;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    calls = [];
    left = 0;
    listDoc = LIST;
    location.hash = "";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      const reply = (doc: unknown, status = 200) => new Response(JSON.stringify(doc), { status });
      if (url.startsWith("/api/review/questions/base%3Amissing/scans")) return reply(PAGE_MISSING);
      if (url.startsWith("/api/review/questions/base%3Amissing/answer")) return reply(answered("base:missing", body.stacks, left));
      if (url.startsWith("/api/review/questions?")) return reply(listDoc);
      return reply({ error: "no such door" }, 404);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
  const press = (key: string) => act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
  const click = (sel: string, shift = false) => act(async () => void host.querySelector(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: shift })));
  const tile = (stack: number) => host.querySelector(`[data-stack="${stack}"]`)!;

  it("draws one bar and the scans framed by the answer they will get, the first answer at open, with no dropdown and nothing of NILS's on a blind scan", async () => {
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    expect(calls[0].url).toBe("/api/review/questions/base%3Amissing/scans?dataset=ms-a&page=1&limit=50");
    expect(host.querySelector("h1")?.textContent).toBe("Which base?");
    // the bar: the two answers as chips, other…, ?, the tally and Apply; nothing else above the pictures
    expect([...host.querySelectorAll(".qgrid-bar .q-keys .opt")].map((b) => b.textContent)).toEqual(["1T1w", "2T2w", "0other…", "?"]);
    expect(host.querySelector(".q-chip.on")?.textContent).toBe("1T1w");
    expect([...host.querySelectorAll(".q-chip")].map((b) => b.getAttribute("data-slot"))).toEqual(["6", "4"]);
    expect(host.querySelector(".q-tally")?.textContent).toBe("7 scans · T1w 7");
    expect(host.querySelector(".qgrid-bar .button")?.textContent).toBe("Apply Enter");
    expect(host.querySelector(".q-help")?.getAttribute("title")).toBe(KEYS_HELP);
    expect(host.querySelectorAll(".qgrid-page > *")).toHaveLength(3);
    // every tile framed in the first answer's colour, the word in its corner
    expect(host.querySelectorAll(".q-tile")).toHaveLength(7);
    expect([...host.querySelectorAll(".q-tile")].every((t) => t.getAttribute("data-slot") === "6")).toBe(true);
    expect(tile(201).querySelector(".q-answer")?.textContent).toBe("T1w");
    expect(tile(201).querySelector(".q-name")?.textContent).toBe("Ax_T2w_2D_TSE_201");
    expect(tile(201).getAttribute("title")).toContain("NILS: no value");
    expect(host.querySelector(".q-tile select")).toBeNull();
    expect(host.querySelector(".q-list")).toBeNull();
    // a blind scan keeps its mark and none of NILS's, a staged answer and System 1's are marked
    expect(tile(205).className).toContain("blind");
    expect(tile(205).querySelector(".q-blind")?.textContent).toBe("blind");
    expect(tile(205).querySelector(".q-s1")).toBeNull();
    expect(tile(203).querySelector(".q-staged")?.textContent).toBe("proposed T2w");
    expect(tile(201).querySelector(".q-s1")?.textContent).toBe("S1 T1w 0.91");
    expect(host.querySelector(".qgrid-head .meta")?.textContent).toContain("1 scan read blind first, NILS's answers hidden");
    // no dialog, no scope, no why field
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(host.querySelector('input[aria-label="Why"]')).toBeNull();
  });

  it("a key changes every scan's answer, a click one scan's, space sets one apart, and Enter sends them; the next question opens", async () => {
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    await press("2");
    expect(host.querySelector(".q-chip.on")?.textContent).toBe("2T2w");
    expect(tile(201).getAttribute("data-slot")).toBe("4");
    expect(tile(201).querySelector(".q-answer")?.textContent).toBe("T2w");
    await click('[data-stack="202"]');
    expect(tile(202).getAttribute("data-slot")).toBe("6");
    expect(tile(202).querySelector(".q-answer")?.textContent).toBe("T1w");
    expect(tile(202).className).toContain("own");
    expect(tile(202).getAttribute("aria-current")).toBe("true");
    await press("ArrowRight");
    await press(" ");
    expect(tile(203).className).toContain("apart");
    expect(tile(203).querySelector(".q-answer")?.textContent).toBe("set apart");
    expect(tile(203).hasAttribute("data-slot")).toBe(false);
    expect(host.querySelector(".q-tally")?.textContent).toBe("7 scans · T2w 5 · T1w 1 · 1 set apart");
    await press("Enter");
    await settle();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/review/questions/base%3Amissing/answer");
    expect(post.body).toEqual({
      value: "T2w",
      stacks: [201, 202, 203, 204, 205, 206, 207],
      except: [
        { stack: 202, value: "T1w" },
        { stack: 203, skip: true },
      ],
      dataset: "ms-a",
    });
    // nothing left of this question: the next one in the list opens
    expect(location.hash).toBe("#review/questions/base%3APDw%7CT2w?dataset=ms-a");
  });

  it("0 opens the whole list once over the scan in focus, or for the scans set apart, and the pick closes it", async () => {
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    await press("0");
    const pop = tile(201).querySelector(".q-pop")!;
    expect(pop.getAttribute("aria-label")).toBe("a value for scan 201");
    expect([...pop.querySelectorAll(".opt")].map((b) => b.textContent)).toEqual(["DWI", "SWI", "T2*w", "T2w", "PDw", "T1w", "no value"]);
    expect(host.querySelector(".q-other")?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => void [...pop.querySelectorAll("button")].find((b) => b.textContent === "PDw")!.click());
    expect(host.querySelector(".q-pop")).toBeNull();
    expect(tile(201).querySelector(".q-answer")?.textContent).toBe("PDw");
    expect(tile(201).getAttribute("data-slot")).toBe("5");
    // a click on it puts it back with the rest
    await click('[data-stack="201"]');
    expect(tile(201).querySelector(".q-answer")?.textContent).toBe("T1w");
    // shift-click sets apart; with scans set apart, the list opens for them under the bar
    await click('[data-stack="204"]', true);
    await click('[data-stack="206"]', true);
    expect(host.querySelectorAll(".q-tile.apart")).toHaveLength(2);
    await click(".q-other");
    const bar = host.querySelector(".qgrid-bar > .q-pop")!;
    expect(bar.getAttribute("aria-label")).toBe("a value for the 2 scans set apart");
    await act(async () => void [...bar.querySelectorAll("button")].find((b) => b.textContent === "no value")!.click());
    expect(host.querySelector(".q-pop")).toBeNull();
    expect(host.querySelectorAll(".q-tile.apart")).toHaveLength(0);
    expect(tile(204).className).toContain("nothing");
    expect(tile(204).querySelector(".q-answer")?.textContent).toBe("no value");
    expect(host.querySelector(".q-tally")?.textContent).toBe("7 scans · T1w 5 · no value 2");
    // Escape closes an open list and stays on the page
    await press("0");
    expect(host.querySelector(".q-pop")).not.toBeNull();
    await press("Escape");
    expect(host.querySelector(".q-pop")).toBeNull();
    expect(location.hash).toBe("");
  });

  it("says so when the last question is answered, with the way back to the list", async () => {
    listDoc = { ...LIST, questions: [(LIST.questions as object[])[1]] };
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    await press("2");
    await press("Enter");
    await settle();
    expect(location.hash).toBe("");
    expect(host.querySelector(".qgrid-done .lede")?.textContent).toBe("Nothing left to answer here.");
    expect(host.querySelector(".qgrid-done a.button")?.getAttribute("href")).toBe("#review/questions?dataset=ms-a");
    expect(host.querySelector(".qgrid-said")?.textContent).toBe("7 scans answered: T2w · sorted again");
  });

  it("applies the first answer as it stands, and reads the page again while scans are left", async () => {
    left = 2;
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    await press("Enter");
    await settle();
    expect(calls.filter((c) => c.method === "POST")[0].body).toEqual({ value: "T1w", stacks: [201, 202, 203, 204, 205, 206, 207], except: [], dataset: "ms-a" });
    expect(calls.filter((c) => c.url.includes("/scans")).length).toBe(2);
    expect(host.querySelector(".qgrid-said")?.textContent).toContain("7 scans answered: T1w");
  });

  it("offers no answer to a person who may only see", async () => {
    await act(async () => root.render(<QuestionGrid caps={reader} qkey="base:missing" where={{}} />));
    await settle();
    expect((host.querySelector(".qgrid-bar .button") as HTMLButtonElement).disabled).toBe(true);
    await press("1");
    await press("Enter");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(host.querySelector(".qgrid-said")?.textContent).toBe("Answering needs work on the Review page.");
  });
});

describe("the question under an open scan", () => {
  let root: Root;
  let host: HTMLElement;
  let calls: { method: string; url: string; body: unknown }[];
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    calls = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      const reply = (doc: unknown) => new Response(JSON.stringify(doc), { status: 200 });
      if (url.startsWith("/api/review/questions?")) return reply({ ...LIST, questions: [(LIST.questions as object[])[0]] });
      if (url.includes("/answer")) return reply(answered("base:PDw|T2w", body.stacks, 11));
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
  const press = (key: string) => act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

  it("frames the picture by NILS's answer, takes the keys, and answers this scan alone", async () => {
    const marks: unknown[] = [];
    const done: [string, string | null][] = [];
    await act(async () => root.render(<ScanQuestion caps={caps} where={{ dataset: "ms-a" }} scan={{ id: 302, axes: { base: "T2w" } }} looks onMark={(m) => marks.push(m)} onAnswered={(a, v) => done.push([a, v])} />));
    await settle();
    expect(calls[0].url).toBe("/api/review/questions?dataset=ms-a&stack=302");
    expect(host.querySelector(".q-ask")?.textContent).toBe("T2w or PDw?");
    expect(marks.at(-1)).toEqual({ axis: "base", value: "T2w", slot: 4 });
    await press("2");
    expect(host.querySelector(".opt.on")?.textContent).toBe("2PDw");
    await press("Enter");
    await settle();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ value: "PDw", stacks: [302], except: [], dataset: "ms-a" });
    expect(done).toEqual([["base", "PDw"]]);
    expect(host.textContent).toContain("base: PDw · sorted again");
    expect(marks.at(-1)).toBeNull();
  });

  it("says a blind-first question is not read blind beside NILS's answer, and still answers it", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      const reply = (doc: unknown) => new Response(JSON.stringify(doc), { status: 200 });
      if (url.startsWith("/api/review/questions?")) return reply({ ...LIST, questions: [{ ...(LIST.questions as Json[])[1], mode: "blind_first" }] });
      if (url.includes("/answer")) return reply(answered("base:missing", body.stacks, 12));
      return new Response("{}", { status: 404 });
    });
    await act(async () => root.render(<ScanQuestion caps={caps} where={{ dataset: "ms-a" }} scan={{ id: 303, axes: {} }} looks onAnswered={() => undefined} />));
    await settle();
    expect(host.querySelector(".q-ask")?.textContent).toBe("Which base?");
    expect(host.textContent).toContain("NILS: no value");
    expect(host.querySelector(".q-seen")?.textContent).toBe("not blind here");
    await press("1");
    await press("Enter");
    await settle();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ value: "T1w", stacks: [303], except: [], dataset: "ms-a" });
  });

  it("says nothing of blindness for a routine question", async () => {
    await act(async () => root.render(<ScanQuestion caps={caps} where={{ dataset: "ms-a" }} scan={{ id: 302, axes: { base: "T2w" } }} looks onAnswered={() => undefined} />));
    await settle();
    expect(host.querySelector(".q-ask")?.textContent).toBe("T2w or PDw?");
    expect(host.querySelector(".q-seen")).toBeNull();
  });

  it("reads nothing for a scan that needs no look", async () => {
    await act(async () => root.render(<ScanQuestion caps={caps} where={{ dataset: "ms-a" }} scan={{ id: 1, axes: {} }} looks={false} onAnswered={() => undefined} />));
    await settle();
    expect(calls).toEqual([]);
    expect(host.innerHTML).toBe("");
  });
});
