// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 (record 56 section 6.3): the questions as the engine says
// them, read into one shape; the grid's keys and what Enter sends (one answer
// for the page's scans, the scans set apart as exceptions taking the other
// key's answer, a scan left for later); the list in plain words with its
// counts and the ways out; the grid answering a page and opening the next;
// and the same keys under an open scan in the dataset viewer.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorError, type Json } from "../ask/client";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { QuestionGrid, QuestionsList } from "./Questions";
import {
  answerBody,
  answeredOf,
  answeredWords,
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
  setApart,
  slots,
  tally,
  tileAnswer,
  toggleApart,
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

describe("the grid's keys and what Enter sends", () => {
  const p = pageOf(PAGE_PAIR);

  it("sends nothing until an answer is chosen", () => {
    expect(answerBody(gridOf(p), { dataset: "ms-a" })).toBeNull();
  });

  it("answers every scan of the page with one key, and a scan set apart takes the other key", () => {
    let s = chooseKey(gridOf(p), "1");
    expect(s.choice).toEqual({ kind: "value", value: "T2w", key: "1" });
    s = toggleApart(s, 304);
    s = toggleApart(s, 309);
    expect(otherOf(s)).toBe("PDw");
    expect(tileAnswer(s, 304)).toEqual({ kind: "value", value: "PDw" });
    expect(tileAnswer(s, 301)).toEqual({ kind: "value", value: "T2w" });
    expect(answerBody(s, { dataset: "ms-a" })).toEqual({
      value: "T2w",
      stacks: p.scans.map((x) => x.stack),
      except: [
        { stack: 304, value: "PDw" },
        { stack: 309, value: "PDw" },
      ],
      dataset: "ms-a",
    });
    // the other key chosen after: the scans set apart follow it
    s = chooseKey(s, "2");
    expect(tileAnswer(s, 304)).toEqual({ kind: "value", value: "T2w" });
    expect(answerBody(s, {})?.except).toEqual([
      { stack: 304, value: "T2w" },
      { stack: 309, value: "T2w" },
    ]);
    // space again puts a scan back
    s = toggleApart(s, 304);
    expect(answerBody(s, {})?.except).toEqual([{ stack: 309, value: "T2w" }]);
    expect(tally(s)).toEqual({ answer: "PDw", apart: 1, skip: 0, total: 12 });
  });

  it("gives a scan set apart a value of its own, no value, or later, and drops one that only repeats the answer", () => {
    let s = chooseKey(gridOf(p), "1");
    s = setApart(toggleApart(s, 301), 301, { kind: "value", value: "PDw" });
    s = setApart(toggleApart(s, 302), 302, { kind: "nothing" });
    s = setApart(toggleApart(s, 303), 303, { kind: "skip" });
    s = setApart(toggleApart(s, 305), 305, { kind: "value", value: "T2w" });
    expect(answerBody(s, { cohort: "north" })).toEqual({
      value: "T2w",
      stacks: p.scans.map((x) => x.stack),
      except: [
        { stack: 301, value: "PDw" },
        { stack: 302, nothing: true },
        { stack: 303, skip: true },
      ],
      cohort: "north",
    });
    expect(tally(s).skip).toBe(1);
  });

  it("takes no value as the page's answer, a value from the whole list, and the list for one scan set apart", () => {
    let s = chooseNothing(gridOf(p));
    expect(answerBody(s, {})).toMatchObject({ nothing: true });
    expect(answerBody(s, {})?.value).toBeUndefined();
    s = openList(s);
    expect(s.listing).toBe("answer");
    s = chooseValue(s, "T2*w");
    expect(s.choice).toEqual({ kind: "value", value: "T2*w", key: "0" });
    expect(s.listing).toBeNull();
    // the whole list's value that is one of the keys counts as that key
    expect(chooseValue(openList(s), "PDw").choice).toEqual({ kind: "value", value: "PDw", key: "2" });
    // with a value from the list, a scan set apart takes the first key that is not it
    s = toggleApart(s, 306);
    expect(tileAnswer(s, 306)).toEqual({ kind: "value", value: "T2w" });
    s = chooseValue(openList(s, 306), "SWI");
    expect(tileAnswer(s, 306)).toEqual({ kind: "value", value: "SWI" });
    expect(s.choice).toEqual({ kind: "value", value: "T2*w", key: "0" });
  });

  it("leaves a scan set apart for later where the question has no other answer", () => {
    const one = pageOf({ ...PAGE_PAIR, values: ["T2w"] });
    const s = toggleApart(chooseKey(gridOf(one), "1"), 301);
    expect(chooseKey(s, "2")).toBe(s);
    expect(tileAnswer(s, 301)).toEqual({ kind: "skip" });
  });

  it("maps the keys, and moves the focus within the page", () => {
    expect(["1", "2", "0", "-", " ", "Enter", "f", "?", "Escape", "x"].map((k) => keyAct(k).kind)).toEqual(["key", "key", "list", "nothing", "apart", "apply", "full", "reasons", "back", "none"]);
    expect(keyAct("ArrowDown", 4)).toEqual({ kind: "move", by: 4 });
    expect(keyAct("ArrowLeft")).toEqual({ kind: "move", by: -1 });
    const s = gridOf(p);
    expect(s.focus).toBe(301);
    expect(moved(s, 5).focus).toBe(306);
    expect(moved(s, -3).focus).toBe(301);
    expect(moved(s, 99).focus).toBe(312);
  });

  it("says what an answer did, and reads a stale page again", () => {
    const s = toggleApart(chooseKey(gridOf(p), "1"), 304);
    expect(answeredWords(answeredOf(answered("base:PDw|T2w", [301, 302], 0)), s)).toBe("2 scans answered: T2w · 1 set apart · sorted again");
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

describe("the list in plain words", () => {
  it("each question with its scans, why, its staged answers and the way to its grid; what is answered elsewhere and held by campaigns", () => {
    const html = renderToStaticMarkup(<QuestionsList list={listOf(LIST)} where={{ dataset: "ms-a" }} />);
    expect(html).toContain('<span class="q-words">T2w or PDw?</span>');
    expect(html).toContain("The rules found no base for these scans.");
    expect(html).toContain("<b>7</b> scans");
    expect(html).toContain('<span class="tag caution">1 staged</span>');
    expect(html).toContain('href="#review/questions/base%3Amissing?dataset=ms-a"');
    expect(html.match(/>Answer<\/a>/gu)).toHaveLength(2);
    expect(html).toContain('System 1 asks about a whole scan: 2 scans<a href="#review/asked">Open</a>');
    expect(html).toContain("3 scans are held by campaign base-check, answered there.");
    expect(renderToStaticMarkup(<QuestionsList list={listOf({ questions: [] })} where={{}} />)).toContain("No question waits: the rules decided every scan.");
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

  it("draws the page's scans framed by NILS's answer, the keys, and nothing of NILS's on a blind scan", async () => {
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    expect(calls[0].url).toBe("/api/review/questions/base%3Amissing/scans?dataset=ms-a&page=1&limit=50");
    expect(host.querySelector("h1")?.textContent).toBe("Which base?");
    expect(host.querySelectorAll(".q-tile")).toHaveLength(7);
    // NILS has no answer here: the tiles say so, in the caution colour
    expect(host.querySelectorAll(".q-tile.none")).toHaveLength(6);
    const blind = host.querySelector('[data-stack="205"]')!;
    expect(blind.className).toContain("blind");
    expect(blind.querySelector(".q-s1")).toBeNull();
    expect(host.querySelector('[data-stack="203"] .q-staged')?.textContent).toBe("staged T2w");
    expect(host.querySelector('[data-stack="201"] .q-s1')?.textContent).toBe("S1 T1w 0.91");
    expect([...host.querySelectorAll(".q-keys .opt")].map((b) => b.textContent)).toEqual(["1T1w", "2T2w", "0other value", "-no value"]);
    // no dialog, no scope, no why field
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(host.querySelector('input[aria-label="Why"]')).toBeNull();
    expect(host.querySelector(".q-keys .opt.on")).toBeNull();
  });

  it("answers the page with one key and a scan set apart on Enter, then goes on to the next question", async () => {
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    await press("1");
    // only the chosen key in colour
    expect(host.querySelector(".q-keys .opt.on")?.textContent).toBe("1T1w");
    expect(host.querySelector(".q-keys .opt.on")?.getAttribute("data-slot")).toBe("6");
    await press("ArrowRight");
    await press("ArrowRight");
    await press(" ");
    expect(host.querySelector('[data-stack="203"]')?.className).toContain("apart");
    await press("Enter");
    await settle();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/review/questions/base%3Amissing/answer");
    expect(post.body).toEqual({ value: "T1w", stacks: [201, 202, 203, 204, 205, 206, 207], except: [{ stack: 203, value: "T2w" }], dataset: "ms-a" });
    // nothing left of this question: the next one in the list opens
    expect(location.hash).toBe("#review/questions/base%3APDw%7CT2w?dataset=ms-a");
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

  it("reads the page again while scans are left, and says nothing can be applied before a key", async () => {
    left = 2;
    await act(async () => root.render(<QuestionGrid caps={caps} qkey="base:missing" where={{ dataset: "ms-a" }} />));
    await settle();
    await press("Enter");
    expect(host.querySelector(".qgrid-said")?.textContent).toBe("Choose an answer first: 1, 2, 0 or -.");
    await press("-");
    await press("Enter");
    await settle();
    expect(calls.filter((c) => c.method === "POST")[0].body).toMatchObject({ nothing: true, except: [] });
    expect(calls.filter((c) => c.url.includes("/scans")).length).toBe(2);
    expect(host.querySelector(".qgrid-said")?.textContent).toContain("7 scans answered: no value");
  });

  it("offers no answer to a person who may only see", async () => {
    await act(async () => root.render(<QuestionGrid caps={reader} qkey="base:missing" where={{}} />));
    await settle();
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
