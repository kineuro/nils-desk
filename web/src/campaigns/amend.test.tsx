// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// After the first gold campaign (record 50): a colour and a shape per value
// beside its key; one's own answers listed, the latest first, and one of
// them corrected as a new answer that supersedes it (`u` opens the last
// answer again); the items held back said with why and a way to read them;
// and the next item read ahead while this one is read. The pure parts, then
// the reader and the gallery drawn in jsdom against a fake engine.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { givenOfMine, mineOf, mineWords, singleValueOf, type Question } from "./client";
import { Gallery } from "./Gallery";
import { aloneWords, keyAct as galleryKey, pageOf } from "./gallery";
import { amendHref, amendRefusal, whenWords } from "./MyAnswers";
import { claimIn, forgetHeaders, forgetReadings, hintOf, nextOf, prefetchOn } from "./readerDoors";
import { SHAPES, slotOf, valueTone } from "./values";
import { Workspace } from "./Workspace";
import { amendSeat, keyAct } from "./workspace";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALUES = ["neck", "spine", "brain", "brain-neck", "chest", "other"];
const AXIS: Question = { kind: "axis", axis: "body_part", values: VALUES, unsure: true };
const ONE_AXIS: Question = { kind: "axes", axes: ["body_part"], values: { body_part: VALUES }, cant_tell: "cant_tell", unsure: true };

const MINE_RAW = {
  campaign: 7,
  principal: "rater@site",
  open: true,
  count: 2,
  total: 2,
  values: { brain: 1, chest: 1 },
  answers: [
    { answer: 91, item: 1001, stack: 501, position: 1, value: "chest", answered_at: "2026-09-26T10:00:00Z", via: "batch", unsure: false, supersedes: null, role: "rater", round: 1, thumb: "/api/instances/501/thumb", sealed: false },
    { answer: 90, item: 1000, stack: 500, position: 0, value: "brain", answered_at: "2026-09-26T09:59:00Z", via: "claim", unsure: true, supersedes: 80, role: "rater", round: 1, thumb: "/api/instances/500/thumb", sealed: true },
    { item: 3 },
  ],
};

describe("a colour and a shape per value", () => {
  it("takes the slot of the value's place, one per key, none past the tenth", () => {
    const eleven = [...VALUES, "a", "b", "c", "d", "e"];
    expect(slotOf(VALUES, "neck")).toBe(1);
    expect(slotOf(VALUES, "other")).toBe(6);
    expect(slotOf(eleven, "d")).toBe(10);
    expect(slotOf(eleven, "e")).toBeNull();
    expect(slotOf(VALUES, "elbow")).toBeNull();
    expect(slotOf(VALUES, null)).toBeNull();
    expect(valueTone(VALUES, "brain")).toEqual({ "data-slot": 3 });
    expect(valueTone(VALUES, null)).toEqual({});
    // ten shapes, every one its own
    expect(new Set(SHAPES).size).toBe(10);
  });
});

describe("one's own answers", () => {
  it("reads the mine door into one shape, and each answer as the rows show it", () => {
    const m = mineOf(MINE_RAW);
    expect(m.answers.map((a) => a.answer)).toEqual([91, 90]);
    expect(m.answers[1]).toMatchObject({ sealed: true, unsure: true, supersedes: 80, via: "claim" });
    expect(m.values).toEqual({ brain: 1, chest: 1 });
    expect(mineOf({}).open).toBe(true);
    expect(mineOf({ open: false }).open).toBe(false);
    expect(givenOfMine(AXIS, "chest")).toEqual({ kind: "value", value: "chest" });
    // a single-axis axes question: the bare value, or the joint
    expect(givenOfMine(ONE_AXIS, "chest")).toEqual({ kind: "values", values: { body_part: "chest" } });
    expect(givenOfMine(ONE_AXIS, '{"body_part":"spine"}')).toEqual({ kind: "values", values: { body_part: "spine" } });
    expect(givenOfMine({ kind: "axes", axes: ["base", "modifier"] }, { base: "T1w", modifier: [] })).toEqual({ kind: "values", values: { base: "T1w", modifier: null } });
    expect(givenOfMine({ kind: "free" }, "x")).toBeNull();
    expect(mineWords(ONE_AXIS, { body_part: "brain" })).toBe("brain");
    expect(mineWords({ kind: "axes", axes: ["base", "modifier"] }, { base: "T1w", modifier: ["FLAIR", "FS"] })).toBe("base T1w · modifier FLAIR+FS");
    expect(singleValueOf(ONE_AXIS, { body_part: "neck" })).toBe("neck");
    expect(singleValueOf({ kind: "axes", axes: ["base", "modifier"] }, { base: "T1w" })).toBeNull();
  });

  it("opens an answer in the reader where it can be corrected, and says why not where it cannot", () => {
    const caps = capsWith(["POST /api/campaigns/{id}/answers/{answer}/amend"]);
    expect(amendHref(7, 91, "gallery")).toBe("#campaigns/7/rate?amend=91&back=gallery");
    expect(amendRefusal(caps, { status: "open", question: AXIS }, { open: true })).toBeNull();
    expect(amendRefusal(caps, { status: "closed", question: AXIS }, null)).toContain("closed");
    expect(amendRefusal(caps, { status: "open", question: AXIS }, { open: false })).toContain("closed");
    expect(amendRefusal(capsWith([]), { status: "open", question: AXIS }, null)).toContain("does not take corrections");
    expect(amendRefusal(caps, { status: "open", question: { kind: "free" } }, null)).toContain("axis");
    expect(whenWords("2026-09-26T10:00:00Z", Date.parse("2026-09-26T10:00:30Z"))).toBe("30 s ago");
    expect(whenWords("2026-09-26T10:00:00Z", Date.parse("2026-09-26T10:05:00Z"))).toBe("5 min ago");
  });

  it("seats a correction without a lease, the item blind where its sample is sealed", () => {
    const a = mineOf(MINE_RAW).answers[1];
    const s = amendSeat(a, null);
    expect(s.kind).toBe("holding");
    if (s.kind !== "holding") return;
    expect(s.assignment.id).toBe(-90);
    expect(s.assignment.lease_until).toBeNull();
    expect(s.item).toMatchObject({ id: 1000, stack_id: 500, blind: true });
    expect(s.amend?.answer).toBe(90);
  });

  it("`u` undoes the last answer where it is no value's key", () => {
    const rows = [{ axis: "body_part", values: VALUES }];
    expect(keyAct("u", { ctrl: false, inField: false, q: AXIS, rows })).toEqual({ kind: "undo" });
    expect(keyAct("u", { ctrl: false, inField: true, q: AXIS, rows })).toBeNull();
    // on a second row of seven values or more, u is a value's key
    const two = [{ axis: "a", values: ["x"] }, { axis: "b", values: ["1", "2", "3", "4", "5", "6", "7"] }];
    expect(keyAct("u", { ctrl: false, inField: false, q: { kind: "axes", axes: ["a", "b"] }, rows: two })).toMatchObject({ kind: "choose", value: "7" });
    expect(galleryKey("u", VALUES)).toEqual({ kind: "mine" });
  });
});

describe("the items held back and the next item", () => {
  it("says how many are held back and why", () => {
    const p = pageOf({ campaign: 7, axis: "body_part", values: VALUES, sealed: 3, held_back: 4, held_back_open: 219, alone: 222, hold_back: 0.1, left: 0, items: [] });
    expect(p.held_back_open).toBe(219);
    expect(aloneWords(p)).toBe("219 items are held back to be read one by one: the campaign holds back 10 % of what is accepted in batches, chosen at random, so the engine can check how often a batch answer is right; 3 are of a sealed sample, read blind with nothing suggested.");
    expect(aloneWords(pageOf({ held_back: 0, sealed: 0, items: [] }))).toBeNull();
    // an engine before the count says what its page held back
    expect(aloneWords(pageOf({ held_back: 2, hold_back: 0.1, sealed: 0, items: [] }))).toContain("2 items are held back");
  });

  it("reads the claim's next item in every shape the engine may say it", () => {
    expect(nextOf({ next: { item: 12, stack: 34 } })).toEqual([{ item: 12, stack: 34 }]);
    expect(nextOf({ next: [34, { stack_id: 35 }] })).toEqual([{ item: null, stack: 34 }, { item: null, stack: 35 }]);
    expect(nextOf({ next: null })).toEqual([]);
    expect(hintOf({ next: { item: 12, stack: 34 } })).toEqual([34]);
  });

  it("reads ahead unless a person turned it off", () => {
    localStorage.removeItem("nils.reader.prefetch");
    expect(prefetchOn()).toBe(true);
    localStorage.setItem("nils.reader.prefetch", "off");
    expect(prefetchOn()).toBe(false);
    localStorage.removeItem("nils.reader.prefetch");
  });
});

// ---------------------------------------------------------------- drawn

function capsWith(extra: string[]): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.47" },
      contracts: { openapi: "7" },
      doors: [
        "GET /api/campaigns",
        "GET /api/campaigns/{id}",
        "POST /api/campaigns/{id}/claim",
        "POST /api/campaigns/{id}/assignments/{assignment}/answer",
        "POST /api/campaigns/{id}/assignments/{assignment}/renew",
        "GET /api/campaigns/{id}/items/{item}/why",
        "GET /api/campaigns/{id}/items/{item}/header",
        "GET /api/campaigns/{id}/gallery",
        "POST /api/campaigns/{id}/gallery/accept",
        ...extra,
      ],
      policy: [],
      auth: "token",
      principal: "rater@site",
      roles: [],
      registry: { epoch: 4 },
      packs: [],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

const DOORS = ["GET /api/campaigns/{id}/mine", "POST /api/campaigns/{id}/answers/{answer}/amend"];

interface Asked {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** A single-axis campaign's engine: items 1000 to 1004 claimed in turn, each claim naming the next. */
function engine(log: Asked[], opts: { status?: string; mineOpen?: boolean } = {}): typeof fetch {
  let at = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const item = (n: number) => ({ id: 1000 + n, position: n, review_item_id: null, stack_id: 500 + n, input_derivative_ids: null, state: "open", round: 1, agreement: null, metric: null, outcome: null, decision_id: null, pick_id: null, resolved_at: null });
  const campaign = { id: 7, name: "body parts", owner: "cleo@site", status: opts.status ?? "open", question: AXIS, grain: "stack", raters_per_item: 1, rater_policy: { raters: ["rater@site"], adjudicators: [] }, adjudication: { when: "never", metric: "exact" }, closes_into: "none", lease_seconds: 900, counts: { items: { open: 5 }, assignments: {}, answers: 0 }, items: [0, 1, 2, 3, 4].map(item) };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    log.push({ method, path: path + url.search, body });
    if (method === "GET" && path === "/api/campaigns/7") return json(200, campaign);
    if (method === "GET" && path === "/api/campaigns") return json(200, { count: 1, campaigns: [campaign] });
    if (method === "POST" && path === "/api/campaigns/7/claim") {
      const n = at;
      return json(200, {
        assignment: { id: 70 + n, item_id: 1000 + n, principal: "rater@site", role: "rater", round: 1, state: "leased", created_at: "", leased_at: "", lease_until: new Date(Date.now() + 900_000).toISOString(), ended_at: null },
        item: item(n),
        held: false,
        next: n < 4 ? { item: 1001 + n, stack: 501 + n } : null,
      });
    }
    if (method === "POST" && /\/assignments\/\d+\/answer$/u.test(path)) {
      at++;
      return json(200, { answer: 200 + at, item: 999 + at, state: "agreed", adjudication: null });
    }
    if (method === "POST" && /\/answers\/\d+\/amend$/u.test(path)) return json(200, { answer: 300, supersedes: Number(path.split("/")[5]), item: 1000, state: "agreed", adjudication: null, unchanged: false });
    if (method === "GET" && path === "/api/campaigns/7/mine") return json(200, { ...MINE_RAW, open: opts.mineOpen ?? true });
    const why = /^\/api\/campaigns\/7\/items\/(\d+)\/why$/u.exec(path);
    if (method === "GET" && why) return json(200, { stack: 500 + Number(why[1]) - 1000, item: Number(why[1]), axes: [], blind: false, suggested: "brain", header_door: `/api/campaigns/7/items/${why[1]}/header`, texts: { series_description: `series of item ${why[1]}` } });
    if (method === "GET" && /\/items\/\d+\/header$/u.test(path)) return json(200, { fields: [] });
    if (method === "GET" && path === "/api/campaigns/7/gallery") return json(200, { campaign: 7, axis: "body_part", values: VALUES, order: "uncertain", open: 5, sealed: 2, held_back: 0, held_back_open: 3, alone: 5, hold_back: 0.1, left: 0, items: [] });
    if (method === "GET" && path.startsWith("/api/instances/")) return json(404, { error: "no pyramid" });
    return json(404, { error: `no door ${method} ${path}` });
  }) as typeof fetch;
}

let host: HTMLDivElement;
let root: Root;
let log: Asked[];

beforeEach(() => {
  forgetReadings();
  forgetHeaders();
  log = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
  location.hash = "";
});

async function until<T>(what: () => T | null | undefined | false, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = what();
    if (v) return v;
    if (Date.now() > end) throw new Error("waited in vain");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function press(key: string) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const itemShown = () => host.querySelector(".rate-item b")?.textContent ?? "";
const chosen = () => host.querySelector(".axis-row .opt.on")?.textContent ?? "";

describe("the reader corrects one's own answer", () => {
  it("answers, then `u` opens the answer again and Enter sends the correction as a new answer", async () => {
    vi.stubGlobal("fetch", engine(log));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(DOORS)} id="7" role="rater" />));
    await until(() => itemShown() === "stack 500" && chosen().includes("brain"));
    // the value keys set it: 5 is chest
    await press("5");
    await press("Enter");
    await until(() => itemShown() === "stack 501");
    await press("u");
    await until(() => host.textContent?.includes("correcting your answer"));
    expect(itemShown()).toBe("stack 500");
    // the rater's own answer, never the suggestion, is what is chosen
    await until(() => chosen().includes("chest"));
    expect(host.querySelector(".actions .button")?.textContent).toContain("Correct");
    await press("6");
    await press("Enter");
    const amend = await until(() => log.find((a) => a.method === "POST" && a.path.endsWith("/answers/201/amend")));
    expect(amend.body).toEqual({ value: "other" });
    await until(() => host.textContent?.includes("Corrected stack 500: chest is now other"));
    // then the item held before comes back
    await until(() => itemShown() === "stack 501");
  });

  it("reads the next item ahead: its evidence and its header, before it is claimed", async () => {
    localStorage.removeItem("nils.reader.prefetch");
    vi.stubGlobal("fetch", engine(log));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(DOORS)} id="7" role="rater" />));
    await until(() => itemShown() === "stack 500");
    await until(() => log.some((a) => a.path === "/api/campaigns/7/items/1001/header"));
    expect(log.some((a) => a.path === "/api/campaigns/7/items/1001/why")).toBe(true);
    const claims = log.filter((a) => a.path === "/api/campaigns/7/claim").length;
    expect(claims).toBe(1);
  });

  it("opens an answer a link names, blind where its sample is sealed, and asks only its own answers", async () => {
    vi.stubGlobal("fetch", engine(log));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(DOORS)} id="7" role="rater" query={{ amend: "90", back: "gallery" }} />));
    await until(() => host.textContent?.includes("correcting your answer"));
    expect(itemShown()).toBe("stack 500");
    expect(host.querySelector(".tag.gated")?.textContent).toContain("blind");
    // no claim: a correction holds no lease
    expect(log.some((a) => a.path.endsWith("/claim"))).toBe(false);
    await until(() => chosen().includes("brain"));
    // the answer was marked unsure, and still is
    expect(host.querySelector(".actions .opt.on")?.textContent).toContain("Unsure");
    await press("Enter");
    await until(() => log.some((a) => a.path.endsWith("/answers/90/amend")));
    await until(() => location.hash === "#campaigns/7/gallery");
  });

  it("claims only the items read one by one when the gallery's link asks", async () => {
    vi.stubGlobal("fetch", engine(log));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(DOORS)} id="7" role="rater" query={{ alone: "1" }} />));
    const c = await until(() => log.find((a) => a.path.endsWith("/claim")));
    expect(c.body).toMatchObject({ alone: true });
    vi.stubGlobal("fetch", engine(log));
    await claimIn(7, "adjudicator", "position", true);
    expect(log[log.length - 1].body).toEqual({ role: "adjudicator" });
  });
});

describe("the gallery", () => {
  it("says what is held back and why, links to read them, and lists one's own answers on `u`", async () => {
    vi.stubGlobal("fetch", engine(log));
    root = createRoot(host);
    await act(async () => root.render(<Gallery caps={capsWith(DOORS)} id="7" />));
    const line = await until(() => host.querySelector("[data-alone]"));
    expect(line.textContent).toContain("3 items are held back to be read one by one");
    expect(line.textContent).toContain("2 are of a sealed sample");
    expect(line.querySelector("a")?.getAttribute("href")).toBe("#campaigns/7/rate?alone=1");
    await press("u");
    const list = await until(() => host.querySelectorAll(".mine-row").length === 2 && host.querySelector(".mine-drawer"));
    const rows = [...list.querySelectorAll(".mine-row")];
    expect(rows[0].textContent).toContain("chest");
    expect(rows[0].textContent).toContain("in a batch");
    expect(rows[0].querySelector(".value-tag")?.getAttribute("data-slot")).toBe("5");
    expect(rows[1].querySelector(".tag.gated")?.textContent).toBe("blind");
    expect(rows[0].querySelector("a")?.getAttribute("href")).toBe("#campaigns/7/rate?amend=91&back=gallery");
    // nothing suggested is ever listed beside one's own answer
    expect(list.textContent).not.toContain("suggested");
    // a filter asks the engine for that value alone
    const chip = [...list.querySelectorAll<HTMLButtonElement>(".mine-filter .opt")].find((b) => b.textContent?.includes("brain"))!;
    await act(async () => chip.click());
    await until(() => log.some((a) => a.path.includes("/mine?value=brain")));
  });

  it("lists a closed campaign's answers without a way to correct them", async () => {
    vi.stubGlobal("fetch", engine(log, { mineOpen: false }));
    root = createRoot(host);
    await act(async () => root.render(<Gallery caps={capsWith(DOORS)} id="7" />));
    await until(() => host.querySelector("[data-alone]"));
    await press("u");
    await until(() => host.querySelectorAll(".mine-row").length === 2);
    expect(host.querySelector(".mine-drawer")?.textContent).toContain("closed");
    expect(host.querySelectorAll(".mine-row a")).toHaveLength(0);
    expect(host.querySelector<HTMLButtonElement>(".mine-row button")?.disabled).toBe(true);
  });
});
