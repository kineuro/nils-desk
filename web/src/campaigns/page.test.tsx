// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's page as an app page (UX round 5, finding 7): the head's words,
// the one next action for each state through the fixtures, people by name
// with the principal cut short on hover and never a whole hash, each item
// named by its scan, and each answer as a value word.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import closedCampaign from "../../test/fixtures/campaigns/campaign_closed.json";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import answersOpen from "../../test/fixtures/campaigns/answers_open.json";
import { href } from "../routes";
import { ANCHORED } from "./anchored";
import { CampaignBody } from "./CampaignPage";
import { ADMIN, capsFor, DOORS, RATER } from "./caps.fixture";
import type { Answer, Campaign, Item } from "./client";
import { answerValueWords, askWords, headTone, itemName, ledeWords, nextAct, readersWords, valueWord } from "./page";
import { hashLike, nameOf, namesMap, namesWords, shortPrincipal } from "./people";

const open = openCampaign as unknown as Campaign;
const closed = closedCampaign as unknown as Campaign;
const answers = (answersOpen as { answers: Answer[] }).answers;
const none = () => undefined;
const text = (html: string) => html.replace(/<[^>]+>/gu, "");
const HASH = "4c1070c1a9f3e2b7d6c5a4b3c2d1e0f9@auth.example.org";
const OTHER = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b@auth.example.org";

describe("what a campaign asks, in a person's words", () => {
  it("says the question by its kind", () => {
    expect(askWords({ kind: "anchored", axis: "post_contrast" })).toBe("Is the scan like the pre or the post?");
    expect(askWords({ kind: "pair", axis: "post_contrast" })).toBe("Which of the two is the post?");
    expect(askWords({ kind: "axis", axis: "body_part" })).toBe("What is each scan's body part?");
    expect(askWords({ kind: "axes", axes: ["body_part", "body_region"] })).toBe("What are each scan's body part and body region?");
    expect(askWords({ kind: "pick", role: "t1w" })).toBe("Which stack is the t1w?");
    expect(askWords({ kind: "check" })).toBe("Is each result right?");
  });

  it("says who reads it: you, one by name, two by name, or how many", () => {
    const caps = capsFor({ principal: "carol@walk" });
    const names = new Map([[HASH, "Rune"]]);
    expect(readersWords(caps, { rater_policy: { raters: [], adjudicators: [] } }, names)).toBe("anyone with work on Campaigns reads them");
    expect(readersWords(caps, { rater_policy: { raters: ["carol@walk"], adjudicators: [] } }, names)).toBe("you read them");
    expect(readersWords(caps, { rater_policy: { raters: [HASH], adjudicators: [] } }, names)).toBe("Rune reads them");
    expect(readersWords(caps, { rater_policy: { raters: [HASH, "bo@walk"], adjudicators: [] } }, names)).toBe("Rune and bo read them");
    expect(readersWords(caps, { rater_policy: { raters: ["carol@walk", HASH], adjudicators: [] } }, names)).toBe("you and Rune read them");
    expect(readersWords(caps, { rater_policy: { raters: [HASH, "a@w", "b@w", "c@w"], adjudicators: [] } }, names)).toBe("4 raters");
  });

  it("puts the head's line together: the question once, what it is about, how many, who reads them", () => {
    const anchored: Campaign = { ...open, question: { kind: "anchored", axis: "post_contrast" }, rater_policy: { raters: ["carol@walk"], adjudicators: [] }, counts: { items: { open: 2, agreed: 34 }, assignments: {}, answers: 34 } };
    expect(ledeWords(capsFor({ principal: "carol@walk" }), anchored, new Map())).toBe("Is the scan like the pre or the post? · post_contrast · 36 scans · you read them");
    expect(ledeWords(capsFor({ principal: "carol@walk" }), { ...anchored, question: { kind: "axis", axis: "body_part", values: ["brain", "neck", "spine"] } }, new Map())).toBe("What is each scan's body part? · body_part · 3 values · 36 scans · you read them");
    expect(ledeWords(capsFor({ principal: "carol@walk" }), { ...anchored, question: { kind: "pick", role: "t1w" } }, new Map())).toBe("Which stack is the t1w? · 36 scans · you read them");
    expect(ledeWords(capsFor(), { ...open, grain: "session", counts: { items: { open: 1 }, assignments: {}, answers: 0 } }, new Map())).toContain("· 1 session ·");
  });

  it("tells the state by a tone: being read the brand's, closing the caution's, closed quiet", () => {
    expect(headTone(open)).toBe("brand");
    expect(headTone({ ...open, status: "closing" })).toBe("caution");
    expect(headTone(closed)).toBe("neutral");
  });
});

describe("the one next action, chosen from the state", () => {
  const opts = { results: true, href };
  it("reads the items left where the person may claim them", () => {
    expect(nextAct(capsFor({ grants: ADMIN, principal: "carol@walk" }), open, opts)).toEqual({ kind: "read", words: "Read the 3 left", href: "#review/campaigns/6/rate" });
    const anchored = { ...open, question: { kind: "anchored", axis: "post_contrast" } };
    expect(nextAct(capsFor({ grants: RATER, principal: "alice@walk", doors: [...DOORS, ANCHORED.sheet] }), anchored, opts)).toEqual({ kind: "read", words: "Read the 3 left", href: "#review/campaigns/6/anchored" });
    expect(nextAct(capsFor({ grants: RATER, principal: "alice@walk" }), anchored, opts).kind).toBe("read");
  });

  it("settles what waits for an adjudicator who may not read", () => {
    const named = { ...open, rater_policy: { raters: ["alice@walk"], adjudicators: ["carol@walk"] } };
    expect(nextAct(capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "carol@walk" }), named, opts)).toEqual({ kind: "settle", words: "Settle the 1", href: "#review/campaigns/6/adjudicate" });
  });

  it("closes where nothing is left to read and the person may close", () => {
    const done = { ...open, rater_policy: { raters: ["alice@walk"], adjudicators: [] }, counts: { items: { agreed: 6 }, assignments: {}, answers: 12 } };
    expect(nextAct(capsFor({ grants: ADMIN, principal: "carol@walk" }), done, opts)).toEqual({ kind: "close", words: "Close" });
    // a rater who may not close has nothing to do here
    expect(nextAct(capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "bo@walk" }), done, opts)).toEqual({ kind: "none" });
  });

  it("follows a close running, runs again one that stopped, and opens a closed campaign's results", () => {
    const job = { id: 8, state: "running", running: true, by: "carol@walk", started_at: "2026-09-24T10:00:00Z", finished_at: null, result: null, error: null };
    expect(nextAct(capsFor({ grants: ADMIN }), { ...open, status: "closing", close_job: job }, opts)).toEqual({ kind: "none" });
    expect(nextAct(capsFor({ grants: ADMIN }), { ...open, status: "closing", close_job: { ...job, state: "failed", running: false } }, opts)).toEqual({ kind: "close-again", words: "Run the close again" });
    expect(nextAct(capsFor({ grants: ADMIN }), closed, opts)).toEqual({ kind: "results", words: "Results" });
    expect(nextAct(capsFor({ grants: ADMIN }), closed, { ...opts, results: false })).toEqual({ kind: "none" });
  });
});

describe("people by name", () => {
  it("tells a provider's subject hash from a username, and cuts a hash to eight characters", () => {
    expect(hashLike(HASH)).toBe(true);
    expect(hashLike("7f3a9c2e-0b1d-4e6f-8a21-5c9d3e7b1a40")).toBe(true);
    expect(hashLike("rune@site")).toBe(false);
    expect(shortPrincipal(HASH)).toBe("4c1070c1…@auth.example.org");
    expect(shortPrincipal("rune@site")).toBe("rune@site");
  });

  it("names a mapped principal by its display name, a username by its local part, and an unmapped hash as a rater, never whole", () => {
    const names = new Map([[HASH, "Rune"]]);
    expect(nameOf(names, HASH)).toEqual({ name: "Rune", title: "4c1070c1…@auth.example.org" });
    expect(nameOf(names, "bo@walk")).toEqual({ name: "bo", title: "bo@walk" });
    expect(nameOf(names, OTHER)).toEqual({ name: "a rater", title: "9e8d7c6b" });
    expect(nameOf(names, null)).toEqual({ name: "a rater", title: null });
    expect(namesWords(names, [HASH, "bo@walk", "cy@walk"])).toBe("Rune, bo and cy");
  });

  it("maps the desk's people to the engine's principals and puts the person's own name first", () => {
    const caps = capsFor({ principal: "carol@walk" });
    const names = namesMap(caps, [{ principal: HASH, display: "Rune" }], new Map([["bo@walk", "Bo Berg"]]));
    expect(names.get(HASH)).toBe("Rune");
    expect(names.get("bo@walk")).toBe("Bo Berg");
    expect(names.get("carol@walk")).toBe("carol");
  });

  it("draws the raters line, the made line and each answer by name, the principal only on hover", () => {
    const c: Campaign = { ...open, owner: HASH, rater_policy: { raters: [HASH, "bob@walk"], adjudicators: [] } };
    const given = [{ ...answers[0], principal: HASH }, answers[1]];
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor({ grants: ADMIN, principal: "carol@walk" })} campaign={c} answers={given} sets={[]} names={new Map([[HASH, "Rune"], ["bob@walk", "Bob Berg"]])} onAct={none} />);
    expect(html).toContain("Rune and Bob Berg read them");
    expect(html).toContain('<dt>made</dt><dd><span class="who" title="4c1070c1…@auth.example.org">Rune</span> · 24 Sept 2026');
    expect(html).toContain('<span class="answer-chip"><span class="who" title="4c1070c1…@auth.example.org">Rune</span> T1w</span>');
    expect(html).toContain('<span class="who" title="bob@walk">Bob Berg</span> T1w');
    expect(html).not.toContain("4c1070c1a9f3e2b7d6c5a4b3c2d1e0f9");
  });

  it("says a rater for a hash the desk cannot name, with its first eight characters on hover", () => {
    const c: Campaign = { ...open, rater_policy: { raters: [OTHER], adjudicators: [] } };
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor({ grants: ADMIN })} campaign={c} answers={[]} sets={[]} onAct={none} />);
    expect(html).toContain("a rater reads them");
    expect(html).toContain('<dt>raters</dt><dd><span><span class="who" title="9e8d7c6b">a rater</span></span></dd>');
    expect(html).not.toContain("9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b");
  });
});

describe("items named by their scan, answers as value words", () => {
  const item = open.items![0];
  it("names an item by its series description where the page read it, else by its place in the campaign, the engine's words on hover", () => {
    expect(itemName(item, open, { description: "t1_mprage_sag", code: "S0042" })).toEqual({ name: "t1_mprage_sag · S0042", title: "stack 1" });
    expect(itemName(item, open, { description: "t1_mprage_sag", code: null })).toEqual({ name: "t1_mprage_sag", title: "stack 1" });
    expect(itemName(item, open)).toEqual({ name: "scan 1 of the campaign", title: "stack 1" });
    const anchored: Item = { ...item, position: 3, stack_id: null, key: "anchored:3" };
    expect(itemName(anchored, open)).toEqual({ name: "scan 4 of the campaign", title: "anchored:3" });
    expect(itemName({ ...item, stack_id: null, subject_id: 7, session_day: "2026-01-02" }, { grain: "session" })).toEqual({ name: "session 1 of the campaign", title: "subject 7 · 2026-01-02" });
  });

  it("says a value as its word: like the post, can't tell, the pack's label, the value itself; nothing for null", () => {
    const anchored = { question: { kind: "anchored", axis: "post_contrast" } };
    expect(valueWord(anchored, "like_post")).toBe("like the post");
    expect(valueWord(anchored, "cant_tell")).toBe("can't tell");
    expect(valueWord({ question: { kind: "pair" } }, "left_post")).toBe("left is post");
    expect(valueWord(open, "T1w")).toBe("T1w");
    expect(valueWord({ question: { kind: "axis", axis: "base", vocabulary: { base: { T1w: { label: "T1-weighted" } } } } }, "T1w")).toBe("T1-weighted");
    expect(valueWord(open, null)).toBe("");
    expect(answerValueWords(open, null, () => "fallback")).toBe("");
    expect(answerValueWords({ question: { kind: "axes", axes: ["body_part", "body_region"] } }, { body_part: "brain", body_region: "head" }, () => "fallback")).toBe("body part brain · body region head");
    expect(answerValueWords(anchored, ["like_pre", "like_post"], () => "fallback")).toBe("like the pre, like the post");
  });

  it("draws the rows so: the scan, the state as the row's colour, the answer's word, and never null", () => {
    const c: Campaign = { ...open, question: { kind: "anchored", axis: "post_contrast" }, items: [{ ...item, stack_id: 5001, key: "anchored:0", outcome: { value: "like_post", answers: [4] } }, { ...open.items![3], stack_id: 5004, key: "anchored:3", outcome: null }] };
    const given = [{ ...answers[0], value: "like_post" }, { ...answers[1], value: "like_pre" }];
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor({ grants: ADMIN })} campaign={c} answers={given} sets={[]} scans={new Map([[5001, { description: "t1_mprage_sag_p2", code: null }]])} onAct={none} />);
    expect(html).toContain('<tr class="item-row s-ok"><td class="num">1</td><td><span class="item-name" title="stack 5001">t1_mprage_sag_p2</span></td>');
    expect(html).toContain('<span class="item-name" title="stack 5004">scan 4 of the campaign</span>');
    expect(text(html)).toContain("alice like the postbob like the pre");
    expect(html).toContain("<td>like the post</td>");
    expect(html).not.toContain("like_post");
    expect(html).not.toContain("null");
    expect(html).not.toContain("anchored:0</");
  });
});

describe("the rows' names, read from each stack's header", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const until = async (what: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!what()) {
      if (Date.now() > end) throw new Error("not in time");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
  };

  it("reads each stack's header once, six at a time, and names its row as the names land", async () => {
    // eight stacks: six reads go out at once, two wait; each answer lands at its own time, so the rows are drawn
    // again while reads are still out, and no stack is asked twice for it
    const stacks = [5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008];
    const items: Item[] = stacks.map((stack, k) => ({ ...open.items![0], id: 900 + k, position: k, stack_id: stack, key: `anchored:${k}`, outcome: null, agreement: null }));
    const c: Campaign = { ...open, question: { kind: "anchored", axis: "post_contrast" }, items, counts: { items: { open: items.length }, assignments: {}, answers: 0 } };
    const log: string[] = [];
    let outAtOnce = 0;
    let mostAtOnce = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      log.push(url);
      const m = /\/api\/stacks\/(\d+)\/header$/u.exec(url);
      if (!m) return new Response(JSON.stringify({ error: `no door ${url}` }), { status: 404 });
      outAtOnce += 1;
      mostAtOnce = Math.max(mostAtOnce, outAtOnce);
      await new Promise((r) => setTimeout(r, 2 + (Number(m[1]) % 4) * 3));
      outAtOnce -= 1;
      return new Response(JSON.stringify({ stack: Number(m[1]), texts: { series_description: `series ${m[1]}` } }), { status: 200 });
    });
    const caps = capsFor({ grants: ADMIN, doors: [...DOORS, "GET /api/stacks/{stack}/header"] });
    await act(async () => root.render(<CampaignBody caps={caps} campaign={c} answers={[]} answersBlind={false} sets={[]} onAct={none} />));
    await until(() => [...host.querySelectorAll(".item-name")].every((e) => e.textContent?.startsWith("series ")));
    const names = [...host.querySelectorAll<HTMLElement>(".item-name")].map((e) => [e.title, e.textContent]);
    expect(names).toEqual(stacks.map((s) => [`stack ${s}`, `series ${s}`]));
    // one read a stack, no more
    const headers = log.filter((u) => u.endsWith("/header")).sort();
    expect(headers).toEqual(stacks.map((s) => `/api/stacks/${s}/header`));
    expect(mostAtOnce).toBe(6);
    // the rows drawn again with the same stacks: nothing is read again
    await act(async () => root.render(<CampaignBody caps={caps} campaign={c} answers={[]} answersBlind={false} sets={[]} onAct={none} />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(log.filter((u) => u.endsWith("/header"))).toHaveLength(stacks.length);
  });
});
