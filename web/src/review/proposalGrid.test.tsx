// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The batch accept grid (UX round 5): the doors' answers read into one shape;
// the filter an address names and the one a page opens with; the grid's
// state (a click sets apart, shift-click a range, the keys move and set apart,
// Enter accepts); the accept body (every scan seen, the set-apart ones as
// exceptions); the words; and the page itself against a fake engine, reading
// its counts, narrowing, accepting a page and loading the next; the Review
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
  acceptedWords,
  bandWords,
  defaultFilter,
  filterOf,
  GRID_DOORS,
  gridHref,
  gridOf,
  gridServed,
  keyAct,
  mayAccept,
  moved,
  pageOf,
  rangeApart,
  refusedWords,
  slots,
  stateLine,
  tally,
  tileTitle,
  toggleApart,
} from "./proposalGrid";
import { accepted, gpage, MODEL } from "./proposalGrid.fixture";
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
  });

  it("reads what the accept did", () => {
    const a = acceptedOf(accepted({ seen: [1000, 1001, 1002], except: [1002], value: "neck" }));
    expect(a).toMatchObject({ value: "neck", decided: 1, keptDecided: 1, setApart: 1, closed: [903], leftInItems: 12, resort: { job: 356, state: "queued", stacks: 1 } });
    expect(acceptedOf({}).resort).toBeNull();
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
    expect(tally(s)).toEqual({ accept: 9, apart: 0, decided: 1, total: 10 });
    s = toggleApart(s, 1003);
    expect(s.apart).toEqual({ 1003: true });
    expect(s.focus).toBe(1003);
    expect(s.anchor).toBe(1003);
    s = rangeApart(s, 1006);
    expect(Object.keys(s.apart).map(Number)).toEqual([1003, 1004, 1005, 1006]);
    expect(s.focus).toBe(1006);
    expect(tally(s)).toEqual({ accept: 5, apart: 4, decided: 1, total: 10 });
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

  it("maps the keys and moves the focus within the page", () => {
    expect([" ", "Enter", "f", "Escape", "x", "1"].map((k) => keyAct(k).kind)).toEqual(["apart", "apply", "full", "back", "none", "none"]);
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
  beforeEach(() => {
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
        return reply(gpage({ value, min: q.get("min") ? Number(q.get("min")) : null, max: q.get("max") ? Number(q.get("max")) : null, size: Number(q.get("size") ?? 500), page: Number(q.get("page") ?? 1), total: value === "spine" ? 0 : undefined }));
      }
      if (url === "/api/review/proposals/accept") return reply(accepted(body as { seen: number[]; except: number[]; value: string }));
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
    await settle();
    expect(location.hash).toBe("#review/proposals/12/body_part?value=spine&size=250");
    expect(calls.at(-1)?.url).toBe("/api/review/proposals/scans?model=12&axis=body_part&value=spine&page=1&size=250");
    expect(host.querySelector(".qgrid-done .lede")?.textContent).toBe("Nothing left here for spine.");
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
    // the next page is read, and the line says what was written and that the sort runs again
    expect(calls.length).toBe(reads + 2);
    expect(calls.at(-1)?.url).toBe("/api/review/proposals/scans?model=12&axis=body_part&value=neck&page=1&size=250");
    expect(host.querySelector(".qgrid-said")?.textContent).toBe("Accepted 244 as neck in your name · 5 set apart stay proposals · 1 keeps a person's decision · 1 question closed · sorted again as job 356");
    expect(host.querySelectorAll(".pg-tile.apart")).toHaveLength(0);
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
