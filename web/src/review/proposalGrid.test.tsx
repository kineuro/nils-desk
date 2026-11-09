// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The batch accept grid (UX round 5): the doors' answers read into one shape;
// the filter an address names and the one a page opens with; the grid's
// state (a click sets apart, shift-click a range, the keys move and set apart,
// Enter accepts; 0 opens the value list and a pick corrects a set-apart scan,
// UX round 6 item 4); the accept body (every scan seen, the set-apart ones as
// exceptions, the corrected ones with the person's value and not in except);
// the words; and the page itself against a fake engine, reading its counts,
// narrowing, correcting a tile, accepting a page and loading the next, and an
// older engine without the axis's values offering no correction; the Review
// link on the cards.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorError, type Json } from "../ask/client";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { ProposalGrid } from "./ProposalGrid";
import { StandingCard } from "./ModelStanding";
import { standingOf } from "./modelFamily";
import {
  acceptBody,
  acceptWords,
  acceptedOf,
  acceptedFollowLine,
  acceptedWords,
  bandWords,
  chooseValue,
  closeList,
  correctedWords,
  corrects,
  defaultFilter,
  filterOf,
  GRID_DOORS,
  gridHref,
  gridOf,
  gridServed,
  keyAct,
  mayAccept,
  moved,
  openList,
  listedOf,
  pageOf,
  paletteOf,
  rangeApart,
  refusedWords,
  setCorrection,
  slots,
  spaceApart,
  stateLine,
  tally,
  tileTitle,
  toggleApart,
} from "./proposalGrid";
import { accepted, type AcceptSent, gpage, LEGAL, MODEL } from "./proposalGrid.fixture";
import { WorkBody } from "./WorkPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = [GRID_DOORS.scans, GRID_DOORS.accept, "GET /api/review", "GET /api/review/summary", "GET /api/review/proposals", "POST /api/decisions/commit", "POST /api/review/proposals/campaign", "GET /api/campaigns"];
const caps = capsWith(DOORS, [...GRANTS] as Grant[]);
const reader = capsWith(DOORS, ["review:see"] as Grant[]);

const page = pageOf(gpage({ value: "neck", max: 0.9, size: 10, total: 41212 }));

describe("the doors' answers, read into one shape", () => {
  it("reads a page: the model, the counts for the chips and the histogram, and each scan as the grid draws it", () => {
    expect(page.model).toEqual({ id: 12, name: "bodypart-cascade", version: "r7-fast" });
    expect(page.label).toBe("bodypart-cascade@r7-fast");
    expect(page.axis).toBe("body_part");
    expect(page.value).toBe("neck");
    expect(page.max).toBe(0.9);
    expect(page.threshold).toBe(0.9);
    expect(page.range).toEqual({ low: 0.3, high: 0.89 });
    expect(page.values.map((v) => v.value)).toEqual(["neck", "spine", "brain"]);
    expect(page.legal).toEqual(LEGAL);
    expect(page.bands).toHaveLength(10);
    expect(page.bands.reduce((s, b) => s + b.count, 0)).toBe(41212);
    expect(page.total).toBe(41212);
    expect(page.pages).toBe(4122);
    expect(page.scans).toHaveLength(10);
    const first = page.scans[0];
    expect(first).toMatchObject({ stack: 1000, proposed: "neck", probability: 0.9, status: "open", run: 184, now: "brain", decided: true, name: "Ax_T2w_2D_TSE_1000" });
    expect(first.picture?.startsWith("data:image/svg+xml")).toBe(true);
    // an engine that said less still reads
    const bare = pageOf({ scans: [{ stack: 5, proposed: "neck" }, { stack: 6 }] });
    expect(bare.scans).toHaveLength(1);
    expect(bare.total).toBe(1);
    expect(bare.range).toBeNull();
    expect(bare.label).toBe("0");
    expect(bare.legal).toEqual([]);
    expect(pageOf(gpage({ legal: null })).legal).toEqual([]);
  });

  it("reads what the accept did", () => {
    const a = acceptedOf(accepted({ seen: [1000, 1001, 1002], except: [1002], value: "neck" }));
    expect(a).toMatchObject({ value: "neck", decided: 1, corrected: 0, keptDecided: 1, setApart: 1, closed: [903], leftInItems: 12, resort: { job: 356, state: "queued", stacks: 1 } });
    expect(acceptedOf({}).resort).toBeNull();
    expect(acceptedOf({}).corrected).toBe(0);
    expect(acceptedOf(accepted({ seen: [1001, 1002, 1003], except: [1003], value: "neck", corrections: [{ stack: 1002, value: "brain" }] }))).toMatchObject({ decided: 1, corrected: 1, setApart: 1, resort: { stacks: 2 } });
  });

  it("knows the doors and the grants", () => {
    expect(gridServed(caps)).toBe(true);
    expect(mayAccept(caps)).toBe(true);
    expect(mayAccept(reader)).toBe(false);
    expect(gridServed(capsWith([], [...GRANTS] as Grant[]))).toBe(false);
  });
});

describe("the filter", () => {
  it("is read from the address, held to what is offered, and written back to it", () => {
    expect(filterOf(undefined)).toEqual({ value: null, min: null, max: null, size: 500 });
    expect(filterOf({ value: "neck", min: "0.6", max: "0.9", size: "250" })).toEqual({ value: "neck", min: 0.6, max: 0.9, size: 250 });
    expect(filterOf({ min: "2", size: "7" })).toEqual({ value: null, min: null, max: null, size: 500 });
    expect(gridHref(12, "body_part")).toBe("#review/proposals/12/body_part");
    expect(gridHref("12", "body_part", { value: "neck", min: 0.6, max: 0.9, size: 250 })).toBe("#review/proposals/12/body_part?value=neck&min=0.6&max=0.9&size=250");
    expect(gridHref(12, "body_part", { size: 500 })).toBe("#review/proposals/12/body_part");
  });

  it("opens on the value with the most scans over the whole band below the threshold, unless the address says", () => {
    const given = filterOf(undefined);
    expect(defaultFilter(page, given)).toEqual({ value: "neck", min: null, max: null, size: 500 });
    expect(defaultFilter(page, { ...given, value: "spine" }).value).toBe("spine");
    expect(defaultFilter(page, { ...given, min: 0.5 })).toMatchObject({ value: "neck", min: 0.5 });
    expect(defaultFilter({ ...page, values: [] }, given).value).toBeNull();
  });
});

describe("the grid's state", () => {
  it("sets a scan apart on a click, a range on a shift-click, and counts what Accept writes", () => {
    let s = gridOf(page);
    expect(s.focus).toBe(1000);
    expect(tally(s)).toEqual({ accept: 9, corrected: 0, apart: 0, decided: 1, total: 10 });
    s = toggleApart(s, 1003);
    expect(s.apart).toEqual({ 1003: true });
    expect(s.focus).toBe(1003);
    expect(s.anchor).toBe(1003);
    s = rangeApart(s, 1006);
    expect(Object.keys(s.apart).map(Number)).toEqual([1003, 1004, 1005, 1006]);
    expect(s.focus).toBe(1006);
    expect(tally(s)).toEqual({ accept: 5, corrected: 0, apart: 4, decided: 1, total: 10 });
    // a click again puts one back
    s = toggleApart(s, 1004);
    expect(1004 in s.apart).toBe(false);
    // a range backwards from the anchor
    s = rangeApart(gridOf(page), 1002);
    expect(Object.keys(s.apart)).toEqual(["1002"]);
    s = rangeApart(toggleApart(gridOf(page), 1005), 1002);
    expect(Object.keys(s.apart).map(Number)).toEqual([1002, 1003, 1004, 1005]);
    // a scan not on the page changes nothing
    expect(toggleApart(s, 77)).toBe(s);
    expect(rangeApart(s, 77)).toBe(s);
  });

  it("gives a set-apart scan the person's value: 0 opens the list once, the pick marks the tile, a click takes it back", () => {
    let s = gridOf(page);
    expect(corrects(s)).toBe(true);
    // 0 on a scan not set apart sets it apart and opens the list for it, in one move
    s = openList(moved(s, 3));
    expect(s.listing).toBe(1003);
    expect(s.apart).toEqual({ 1003: true });
    expect(s.focus).toBe(1003);
    // again closes it; the scan stays set apart
    expect(openList(s).listing).toBeNull();
    expect(openList(s).apart).toEqual({ 1003: true });
    expect(closeList(s).listing).toBeNull();
    // the pick gives the scan the value, frames it so, and closes the list
    s = chooseValue(s, "brain");
    expect(s.listing).toBeNull();
    expect(s.corrections).toEqual({ 1003: "brain" });
    expect(1003 in s.apart).toBe(true);
    expect(tally(s)).toEqual({ accept: 8, corrected: 1, apart: 0, decided: 1, total: 10 });
    // a value the axis does not take, or a scan not on the page, changes nothing
    expect(setCorrection(s, 1004, "liver")).toBe(s);
    expect(setCorrection(s, 77, "brain")).toBe(s);
    expect(chooseValue(s, "neck")).toBe(s);
    // with several set apart and the focus on one, 0 opens the list for all of them, and the pick gives each the value
    s = rangeApart(s, 1006);
    expect(s.listing).toBeNull();
    s = openList(s);
    expect(s.listing).toBe("apart");
    // the list is for the ones still without a value (and the focus): the scan corrected to brain already is not swept along
    expect(listedOf(s)).toEqual([1004, 1005, 1006]);
    s = chooseValue(s, "neck");
    expect(s.corrections).toEqual({ 1003: "brain", 1004: "neck", 1005: "neck", 1006: "neck" });
    expect(tally(s)).toMatchObject({ accept: 5, corrected: 4, apart: 0 });
    // the corner of a scan not in focus opens the list for that scan alone
    expect(openList(s, 1008)).toMatchObject({ listing: 1008, focus: 1008, apart: { 1003: true, 1004: true, 1005: true, 1006: true, 1008: true } });
    // a click on a corrected scan takes it back to the model's proposal; space leaves it set apart with no value
    const clicked = toggleApart(s, 1004);
    expect(1004 in clicked.corrections).toBe(false);
    expect(1004 in clicked.apart).toBe(false);
    const spaced = spaceApart(s, 1005);
    expect(1005 in spaced.corrections).toBe(false);
    expect(1005 in spaced.apart).toBe(true);
    expect(tally(spaced)).toMatchObject({ corrected: 3, apart: 1 });
    expect(spaceApart(spaced, 1005).apart).not.toHaveProperty("1005");
    // the colours: the page's values by name, the filter's, the values corrected to, then the axis's other values
    expect(paletteOf(s)).toEqual(["brain", "neck", "spine", "brain-neck", "chest"]);
    expect(paletteOf(gridOf(page))).toEqual(["brain", "neck", "spine", "brain-neck", "chest"]);
  });

  it("offers no correction on an engine that says no values", () => {
    const old = gridOf(pageOf(gpage({ value: "neck", size: 10, legal: null })));
    expect(corrects(old)).toBe(false);
    const s = toggleApart(old, 1003);
    expect(openList(s)).toBe(s);
    expect(setCorrection(s, 1003, "brain")).toBe(s);
    expect(acceptBody(s, { value: "neck", min: null, max: null, size: 10 })).not.toHaveProperty("corrections");
  });

  it("maps the keys and moves the focus within the page", () => {
    expect([" ", "Enter", "f", "Escape", "x", "1", "0"].map((k) => keyAct(k).kind)).toEqual(["apart", "apply", "full", "back", "none", "none", "list"]);
    expect(keyAct("ArrowDown", 12)).toEqual({ kind: "move", by: 12 });
    expect(keyAct("ArrowUp", 12)).toEqual({ kind: "move", by: -12 });
    expect(keyAct("ArrowLeft")).toEqual({ kind: "move", by: -1 });
    const s = gridOf(page);
    expect(moved(s, 3).focus).toBe(1003);
    expect(moved(s, -3).focus).toBe(1000);
    expect(moved(s, 99).focus).toBe(1009);
  });

  it("sends every scan seen with the set-apart ones as exceptions, in the band the page was read in", () => {
    const f = { value: "neck", min: 0.6, max: 0.9, size: 10 };
    const s = rangeApart(toggleApart(gridOf(page), 1001), 1002);
    expect(acceptBody(s, f)).toEqual({ model: "12", axis: "body_part", value: "neck", min: 0.6, max: 0.9, seen: [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009], except: [1001, 1002] });
    // a corrected scan goes with the person's value, and not among the exceptions
    const c = setCorrection(setCorrection(s, 1002, "brain"), 1005, "chest");
    expect(acceptBody(c, f)).toMatchObject({ except: [1001], corrections: [{ stack: 1002, value: "brain" }, { stack: 1005, value: "chest" }] });
    expect(acceptBody(c, f)!.seen).toHaveLength(10);
    // an open edge is left out; no value, no body
    expect(acceptBody(gridOf(page), { value: "neck", min: null, max: null, size: 10 })).not.toHaveProperty("min");
    expect(acceptBody(gridOf(pageOf(gpage({ value: null, size: 3 }))), { value: null, min: null, max: null, size: 3 })).toBeNull();
    expect(acceptBody(gridOf(pageOf(gpage({ value: "neck", size: 3, total: 0 }))), f)).toBeNull();
  });
});

describe("the words", () => {
  it("say the band, the state line, the button and what an accept did", () => {
    expect(bandWords(0.6, 0.9)).toBe("at 0.60 to 0.90");
    expect(bandWords(null, 0.9)).toBe("below 0.90");
    expect(bandWords(0.6, null)).toBe("at 0.60 or above");
    expect(bandWords(null, null)).toBe("");
    const f = { value: "neck", min: 0.6, max: 0.9, size: 10 };
    expect(stateLine(page, f)).toBe("page 1 of 4,122 · 41,212 neck at 0.60 to 0.90");
    const s = toggleApart(gridOf(page), 1003);
    expect(acceptWords(s, f)).toBe("Accept 8 as neck");
    const a = acceptedOf(accepted({ seen: page.scans.map((x) => x.stack), except: [1003], value: "neck" }));
    expect(acceptedWords(a, s)).toBe("Accepted 8 as neck in your name · 1 set apart stays a proposal · 1 keeps a person's decision · 1 question closed · sorted again as job 356");
    expect(acceptedWords(acceptedOf({ decided: 3, value: "spine", resort: { job: null, state: "done", stacks: 3 } }))).toBe("Accepted 3 as spine in your name · sorted again");
    // corrected: the button counts them, the line says how many and which values, most first
    const c = setCorrection(setCorrection(setCorrection(toggleApart(s, 1007), 1004, "brain"), 1005, "chest"), 1006, "brain");
    expect(correctedWords(c)).toBe("2 brain, 1 chest");
    expect(acceptWords(c, f)).toBe("Accept 4 as neck · 3 corrected");
    const ca = acceptedOf(accepted({ seen: page.scans.map((x) => x.stack), except: [1003, 1007], value: "neck", corrections: [{ stack: 1004, value: "brain" }, { stack: 1005, value: "chest" }, { stack: 1006, value: "brain" }] }));
    expect(acceptedWords(ca, c)).toBe("Accepted 4 as neck and corrected 3 (2 brain, 1 chest) in your name · 2 set apart stay proposals · 1 keeps a person's decision · 1 question closed · sorted again as job 356");
    expect(acceptedWords(ca)).toBe("Accepted 4 as neck and corrected 3 in your name · 2 set apart stay proposals · 1 keeps a person's decision · 1 question closed · sorted again as job 356");
    expect(tileTitle(page.scans[3], "brain")).toBe("Ax_T2w_2D_TSE_1003 · now neck · neck 0.90 · your value brain · subject 9f3c03a7e1b2d4");
    // the line follows the job as the commit's does: how far, the job while it runs, then done
    const row = (state: "queued" | "running" | "done", done: number) => ({ state, progress: { done, of: 8, what: "scans" }, error: null, result: null });
    expect(acceptedFollowLine(a, s, row("queued", 0))).toBe("Accepted 8 as neck in your name · 1 set apart stays a proposal · 1 keeps a person's decision · 1 question closed · 0 of 8 sorted again · waiting for a worker (job 356)");
    expect(acceptedFollowLine(a, s, row("running", 5))).toBe("Accepted 8 as neck in your name · 1 set apart stays a proposal · 1 keeps a person's decision · 1 question closed · 5 of 8 sorted again (job 356)");
    expect(acceptedFollowLine(a, s, row("done", 8))).toBe("Accepted 8 as neck in your name · 1 set apart stays a proposal · 1 keeps a person's decision · 1 question closed · 8 of 8 sorted again");
    expect(refusedWords(new DoorError(409, { error: "bp-head@1 no longer proposes neck on scan 4" }))).toEqual({ words: "bp-head@1 no longer proposes neck on scan 4. The page is read again.", stale: true });
    expect(refusedWords(new DoorError(403, {}))).toEqual({ words: "Accepting needs work on the Review page.", stale: false });
    expect(tileTitle(page.scans[0])).toBe("Ax_T2w_2D_TSE_1000 · now brain · neck 0.90 · decided by a person · subject 9f3c00a7e1b2d4");
    expect(slots(page.values)).toEqual(["brain", "neck", "spine"]);
    expect(slots(page.values, ["other"])).toEqual(["brain", "neck", "spine", "other"]);
  });
});

describe("the page", () => {
  let root: Root;
  let host: HTMLElement;
  let calls: { method: string; url: string; body: Json | null }[];
  let holds: (() => void)[];
  // the axis's legal values the fake engine serves; null for an engine before them
  let legal: string[] | null | undefined;
  const release = () => act(async () => {
    holds.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  });
  beforeEach(() => {
    holds = [];
    legal = undefined;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    calls = [];
    location.hash = "#review/proposals/12/body_part";
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Json) : null;
      calls.push({ method, url, body });
      const reply = (doc: unknown, status = 200) => new Response(JSON.stringify(doc), { status });
      if (url.startsWith("/api/review/proposals/scans?")) {
        const u = new URL(url, "http://desk");
        const q = u.searchParams;
        const value = q.get("value");
        const doc = gpage({ value, min: q.get("min") ? Number(q.get("min")) : null, max: q.get("max") ? Number(q.get("max")) : null, size: Number(q.get("size") ?? 500), page: Number(q.get("page") ?? 1), total: value === "spine" ? 0 : undefined, legal });
        // spine and a band answer when the test lets them, so a later read can land before them and the veil can be seen
        if (value === "spine" || q.get("min")) await new Promise<void>((r) => holds.push(r));
        return reply(doc);
      }
      if (url === "/api/review/proposals/accept") return reply(accepted(body as unknown as AcceptSent));
      // the re-sort job the accept queued, over on its first read
      if (url === "/api/jobs/356") return reply({ id: 356, kind: "resort", name: "re-sort after astrid accepted 244 decision(s)", state: "done", progress: { done: 244, of: 244, what: "scans" }, error: null, result: null });
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
  const click = (el: Element, shift = false) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: shift })));

  it("opens on the most proposed value below the threshold, with the chips, the histogram, the state line and the dense grid", async () => {
    await act(async () => root.render(<ProposalGrid caps={caps} model="12" axis="body_part" query={{ size: "250" }} />));
    await settle();
    await settle();
    // one small read for the counts, then the page under the filter they open
    expect(calls[0].url).toBe("/api/review/proposals/scans?model=12&axis=body_part&page=1&size=1");
    expect(calls[1].url).toBe("/api/review/proposals/scans?model=12&axis=body_part&value=neck&page=1&size=250");
    expect(host.querySelector("h1")?.textContent).toBe("Body part · what the model is unsure of");
    expect([...host.querySelectorAll(".pg-values .opt")].map((b) => b.textContent)).toEqual(["neck41,212", "spine30,180", "brain2,740"]);
    expect(host.querySelector(".pg-values .opt.on")?.textContent).toBe("neck41,212");
    expect(host.querySelectorAll(".pg-bar")).toHaveLength(10);
    expect(host.querySelector(".pg-state")?.textContent).toBe("page 1 of 165 · 41,212 neck");
    expect(host.querySelectorAll(".pg-tile")).toHaveLength(250);
    // every tile framed in the proposed value's colour; the decided one dashed and kept
    expect(host.querySelectorAll(".pg-tile[data-slot]")).toHaveLength(250);
    expect(host.querySelector('.pg-tile[data-stack="1000"]')?.className).toContain("decided");
    expect(host.querySelector(".pg-foot .button")?.textContent).toBe("Accept 249 as neck Enter");
    expect(host.querySelector("dialog")).toBeNull();
    // the address keeps the filter once the person narrows
    await click(host.querySelectorAll(".pg-values .opt")[1]);
    await release();
    expect(location.hash).toBe("#review/proposals/12/body_part?value=spine&size=250");
    expect(calls.at(-1)?.url).toBe("/api/review/proposals/scans?model=12&axis=body_part&value=spine&page=1&size=250");
    expect(host.querySelector(".qgrid-done .lede")?.textContent).toBe("Nothing left here for spine.");
  });

  it("keeps the grid on screen while a narrower page is read, asks one read for a drag of a handle, and drops an answer that lands late", async () => {
    await act(async () => root.render(<ProposalGrid caps={caps} model="12" axis="body_part" query={{ size: "250" }} />));
    await settle();
    await settle();
    const before = calls.length;
    const low = host.querySelector<HTMLInputElement>(".pg-handles input")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    // five moves of the lower handle: the band follows on screen, nothing is read yet
    for (const v of ["0.2", "0.25", "0.3", "0.35", "0.4"]) {
      await act(async () => {
        setValue.call(low, v);
        low.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(calls.length).toBe(before);
    expect(host.querySelectorAll(".pg-tile")).toHaveLength(250);
    expect(host.querySelector(".pg-band")?.textContent).toContain("0.40");
    // the release asks the one read; the grid stays under a veil until it lands
    await act(async () => void low.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)?.url).toContain("min=0.4");
    expect(host.querySelectorAll(".pg-tile")).toHaveLength(250);
    expect(host.querySelector(".pg-veil")).not.toBeNull();
    await release();
    expect(host.querySelector(".pg-veil")).toBeNull();
    expect(host.querySelectorAll(".pg-tile")).toHaveLength(250);
    // spine is held and neck answers at once: the page shows neck, and spine's late answer is dropped
    const chips = host.querySelectorAll(".pg-values .opt");
    await click(chips[1]);
    await click(chips[0]);
    await settle();
    expect(host.querySelectorAll(".pg-tile")).toHaveLength(250);
    await release();
    expect(host.querySelector(".qgrid-done")).toBeNull();
    expect(host.querySelectorAll(".pg-tile")).toHaveLength(250);
    expect(host.querySelector(".pg-values .opt.on")?.textContent).toBe("neck41,212");
  });

  it("sets apart on click and shift-click and the keys, accepts the page on Enter, says what was written, and loads the next page", async () => {
    await act(async () => root.render(<ProposalGrid caps={caps} model="12" axis="body_part" query={{ size: "250" }} />));
    await settle();
    await settle();
    await click(host.querySelector('.pg-tile[data-stack="1003"]')!);
    await click(host.querySelector('.pg-tile[data-stack="1006"]')!, true);
    expect(host.querySelectorAll(".pg-tile.apart")).toHaveLength(4);
    await press("ArrowRight");
    await press(" ");
    expect(host.querySelector('.pg-tile[data-stack="1007"]')?.className).toContain("apart");
    expect(host.querySelector(".pg-foot .q-tally")?.textContent).toContain("5 set apart");
    expect(host.querySelector(".pg-foot .button")?.textContent).toBe("Accept 244 as neck Enter");
    const reads = calls.length;
    await press("Enter");
    await settle();
    await settle();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/review/proposals/accept");
    expect(post.body).toMatchObject({ model: "12", axis: "body_part", value: "neck", except: [1003, 1004, 1005, 1006, 1007] });
    expect((post.body as { seen: number[] }).seen).toHaveLength(250);
    expect(post.body).not.toHaveProperty("min");
    expect(post.body).not.toHaveProperty("max");
    // the next page is read, the line says what was written and that the sort runs again, and the page follows that job
    expect(calls.length).toBe(reads + 3);
    expect(calls.filter((c) => c.url.startsWith("/api/review/proposals/scans?")).at(-1)?.url).toBe("/api/review/proposals/scans?model=12&axis=body_part&value=neck&page=1&size=250");
    expect(calls.at(-1)?.url).toBe("/api/jobs/356");
    expect(host.querySelector(".qgrid-said")?.textContent).toMatch(/^Accepted 244 as neck in your name · 5 set apart stay proposals · 1 keeps a person's decision · 1 question closed · (sorted again as job 356|244 of 244 sorted again)$/u);
    await settle();
    expect(host.querySelector(".qgrid-said")?.textContent).toBe("Accepted 244 as neck in your name · 5 set apart stay proposals · 1 keeps a person's decision · 1 question closed · 244 of 244 sorted again");
    expect(host.querySelectorAll(".pg-tile.apart")).toHaveLength(0);
  });

  it("gives a set-apart tile its value: 0 opens the list over it, a pick frames it and names it, Accept sends the correction and says it", async () => {
    await act(async () => root.render(<ProposalGrid caps={caps} model="12" axis="body_part" query={{ size: "250" }} />));
    await settle();
    await settle();
    expect(host.querySelector(".pg-foot .q-help")?.textContent).toContain("0other value");
    expect(host.querySelector(".pg-foot .q-tally")?.textContent).toBe("click a wrong one to set it apart, 0 gives it its value · 1 decided by a person, kept");
    // a click sets apart; 0 opens the axis's list over that tile, once
    const tile = host.querySelector('.pg-tile[data-stack="1003"]')!;
    await click(tile);
    expect(tile.querySelector(".pg-mark")?.textContent).toBe("apart");
    await press("0");
    const pop = tile.querySelector(".q-pop")!;
    expect(pop).not.toBeNull();
    expect(host.querySelectorAll(".q-pop")).toHaveLength(1);
    expect(pop.querySelector(".q-pop-for")?.textContent).toBe("scan 1003 · body part");
    expect([...pop.querySelectorAll(".opt")].map((b) => b.textContent)).toEqual(LEGAL);
    // Escape closes it without a value; the corner opens it again
    await press("Escape");
    expect(tile.querySelector(".q-pop")).toBeNull();
    expect(location.hash).toBe("#review/proposals/12/body_part");
    await click(tile.querySelector(".pg-corner")!);
    expect(tile.querySelector(".q-pop")).not.toBeNull();
    // the pick: the tile takes the value's frame and word, the button and the tally count it
    await click([...tile.querySelectorAll(".q-pop .opt")].find((b) => b.textContent === "brain")!);
    expect(tile.querySelector(".q-pop")).toBeNull();
    expect(tile.className).toContain("corrected");
    expect(tile.className).not.toContain("apart");
    expect(tile.querySelector(".pg-mark")?.textContent).toBe("brain");
    // brain's slot (the page's values by name: brain 1, neck 2), no longer neck's
    expect(tile.getAttribute("data-slot")).toBe("1");
    expect(host.querySelector('.pg-tile[data-stack="1002"]')?.getAttribute("data-slot")).toBe("2");
    expect(tile.getAttribute("aria-label")).toContain("corrected to brain");
    expect(host.querySelector(".pg-foot .button")?.textContent).toBe("Accept 248 as neck · 1 corrected Enter");
    expect(host.querySelector(".pg-foot .q-tally")?.textContent).toBe("1 corrected (1 brain) · 1 decided by a person, kept");
    // 0 on a tile not set apart sets it apart and opens the list in one move; a tile set apart with no value stays one
    await press("ArrowRight");
    await press("ArrowRight");
    await press("0");
    expect(host.querySelector('.pg-tile[data-stack="1005"] .q-pop')).not.toBeNull();
    await press("Escape");
    expect(host.querySelector('.pg-tile[data-stack="1005"]')?.className).toContain("apart");
    expect(host.querySelector(".pg-foot .q-tally")?.textContent).toBe("1 corrected (1 brain) · 1 set apart · 1 decided by a person, kept");
    // Enter: the correction goes with the body, out of except; the line says both
    await press("Enter");
    await settle();
    await settle();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ value: "neck", except: [1005], corrections: [{ stack: 1003, value: "brain" }] });
    await settle();
    expect(host.querySelector(".qgrid-said")?.textContent).toMatch(/^Accepted 247 as neck and corrected 1 \(1 brain\) in your name · 1 set apart stays a proposal · 1 keeps a person's decision · 1 question closed · .* sorted again$/u);
    expect(host.querySelectorAll(".pg-tile.corrected")).toHaveLength(0);
  });

  it("offers no correction on an engine before the axis's values: no 0, no corner button, no corrections sent", async () => {
    legal = null;
    await act(async () => root.render(<ProposalGrid caps={caps} model="12" axis="body_part" query={{ size: "250" }} />));
    await settle();
    await settle();
    expect(host.querySelector(".pg-foot .q-help")?.textContent).not.toContain("other value");
    expect(host.querySelector(".pg-foot .q-tally")?.textContent).toBe("click a wrong one to set it apart · 1 decided by a person, kept");
    const tile = host.querySelector('.pg-tile[data-stack="1003"]')!;
    await click(tile);
    expect(tile.querySelector(".pg-mark")?.textContent).toBe("apart");
    expect(tile.querySelector("button")).toBeNull();
    await press("0");
    expect(host.querySelector(".q-pop")).toBeNull();
    await press("Enter");
    await settle();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ except: [1003] });
    expect(post.body).not.toHaveProperty("corrections");
  });

  it("offers no accept to a reader, and refuses with the way out when the page moved on", async () => {
    await act(async () => root.render(<ProposalGrid caps={reader} model="12" axis="body_part" query={{ size: "250" }} />));
    await settle();
    await settle();
    expect((host.querySelector(".pg-foot .button") as HTMLButtonElement).disabled).toBe(true);
    await press("Enter");
    expect(host.querySelector(".qgrid-said")?.textContent).toBe("Accepting needs work on the Review page.");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("the cards", () => {
  const standing = standingOf({ model: MODEL, label: "bodypart-cascade@r7-fast", axis: "body_part", threshold: 0.9, staged: { groups: 9, stacks: 1250 }, held: { groups: 0, stacks: 0 }, commit: { groups: 9, stacks: 1250 }, drifted: 0, below: { groups: 30, stacks: 74132 }, asked: { groups: 0, stacks: 0 }, campaigns: [], runs: [184], name: "x" })!;

  it("offer Review the N as the primary act for the unsure, the campaign second, where the engine has the grid", () => {
    const html = renderToStaticMarkup(<WorkBody caps={caps} summary={null} standings={[standing]} list={[]} onMake={() => undefined} onCommit={() => undefined} onRead={() => undefined} reviewHref={(s) => gridHref(s.model.id, s.axis)} />);
    expect(html).toContain('<a class="button" href="#review/proposals/12/body_part">Review the 74,132</a>');
    expect(html).toContain('class="button secondary">Read the 74,132</button>');
    // without the grid, the card is as it was
    const old = renderToStaticMarkup(<WorkBody caps={caps} summary={null} standings={[standing]} list={[]} onMake={() => undefined} onCommit={() => undefined} onRead={() => undefined} />);
    expect(old).not.toContain("Review the");
    expect(old).toContain('class="button secondary">Read the 74,132</button>');
    const card = renderToStaticMarkup(<StandingCard s={standing} acts={{ commit: true, campaign: true }} onCommit={() => undefined} onCampaign={() => undefined} reviewHref={gridHref(12, "body_part")} />);
    expect(card).toContain('href="#review/proposals/12/body_part">Review the 74,132</a>');
    expect(card).toContain("button secondary");
  });
});
