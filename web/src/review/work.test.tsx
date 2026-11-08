// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review's first page (redesigned 2026-11-08): the production case as a
// fixture. What models proposed as cards with Commit and Read, the scans to
// answer as one card per axis with the reasons summed in plain words, the
// campaigns as cards with their one act, the person's own first, and what
// else waits folded with its count; an engine without the proposals door
// shows no proposals band; a rater who holds only campaigns:* sees their
// campaigns alone and the page never reads the queue for them; nothing
// proposed and nothing to answer shows the campaigns alone; old Campaigns
// addresses lead to the same page inside Review.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import listed from "../../test/fixtures/campaigns/list.json";
import { capsFor, DOORS } from "../campaigns/caps.fixture";
import type { Campaign } from "../campaigns/client";
import { fromCampaigns, parse } from "../routes";
import { familyOf, itemWords, kindTag } from "./client";
import { CAMPAIGNS, ME, QUESTIONS, STANDINGS, SUMMARY } from "./work.fixture";
import { alsoRows, alsoSummary, alsoWords, axisCards, axisTitle, campaignBand, heldCount, modelWords, queuedCount, readerOf, reasonLine, shareWords, sortStandings, standingMeta, standingTitle, theirs } from "./work";
import { WorkBody, WorkPage } from "./WorkPage";

const list = (listed as { campaigns: Campaign[] }).campaigns;
const none = () => undefined;
const NOW = Date.parse("2026-11-08T10:00:00Z");
const REVIEW = [...DOORS, "GET /api/review", "GET /api/review/summary", "GET /api/picks/rules", "GET /api/campaigns/{id}/mine", "GET /api/review/proposals", "POST /api/review/proposals/campaign", "GET /api/review/questions", "GET /api/review/questions/{key}/scans"];
const caps = capsFor({ doors: REVIEW, principal: ME });
const production = { caps, summary: SUMMARY, standings: STANDINGS, qlist: QUESTIONS, list: CAMPAIGNS, now: NOW, onMake: none };

describe("the words", () => {
  it("name an axis and a model as a person does", () => {
    expect(axisTitle("post_contrast")).toBe("Post-contrast");
    expect(axisTitle("body_part")).toBe("Body part");
    expect(axisTitle("body_region")).toBe("Body region");
    expect(modelWords(STANDINGS[0])).toBe("NILS post-contrast model 0.3.1");
    expect(modelWords({ model: { id: 9, name: "region-head", version: "2" }, label: "region-head@2" })).toBe("region-head 2");
    expect(modelWords({ model: { id: 9, name: "region-head", version: "" }, label: "region-head" })).toBe("region-head");
    expect(standingTitle(STANDINGS[0])).toBe("Post-contrast · NILS post-contrast model 0.3.1");
  });

  it("say a model's line: sure at the threshold, unsure, in a campaign already, moved on", () => {
    expect(standingMeta(STANDINGS[0])).toBe("1,701 sure at 0.99 or above · 190 unsure · 12 in a campaign already · 3 moved on");
    expect(standingMeta(STANDINGS[1])).toBe("59 sure at 0.90 or above · 0 unsure");
    expect(standingMeta({ ...STANDINGS[1], threshold: null })).toBe("59 sure · 0 unsure");
    expect(sortStandings([STANDINGS[1], STANDINGS[0]]).map((s) => s.axis)).toEqual(["post_contrast", "body_part"]);
  });

  it("say a reason, counted", () => {
    expect(reasonLine("missing", 1)).toBe("1 with no value");
    expect(reasonLine("decision", 14)).toBe("14 where a decision disagrees");
    expect(reasonLine("vote", 5)).toBe("5 where the rules disagree");
    expect(reasonLine("disagree", 12)).toBe("12 where the rules and System 1 disagree");
    expect(reasonLine("session", 1)).toBe("1 session question");
    expect(reasonLine("conflict", 2000)).toBe("2,000 where the rules conflict");
  });

  it("say what else waits by its kind, never in the engine's words", () => {
    expect(alsoWords("identity.same_instance")).toBe("The same scan under two subjects");
    expect(alsoWords("identity.collision")).toBe("Two subject codes may be one person");
    expect(alsoWords("identity.empty_study")).toBe("Studies with no files");
    expect(alsoWords("identity.unmapped")).toBe("Files that need a subject code");
    expect(alsoWords("linkage.provisional")).toBe("Files that need a subject code");
    expect(alsoWords("release.shared_name")).toBe("Files that would share a name in a release");
    expect(alsoWords("release.no_task")).toBe("A release with nothing to do");
    expect(alsoWords("ingest.quarantine")).toBe("Files NILS could not read");
    expect(alsoWords("pipeline:qc")).toBe("Results a run's checks flagged");
    expect(alsoWords("classify.excluded")).toBe("Scans the rules set aside");
    expect(alsoWords("classify.asked")).toBe("What System 1 asks");
    expect(alsoWords("pick.border")).toBe("Occasions a pick run doubts");
    expect(alsoWords("body_part:model")).toBe("Body part: scans a model proposes");
    expect(alsoWords("something.odd")).toBe("something odd");
  });
});

describe("the scans to answer", () => {
  it("one card per axis from the questions, the reasons summed by their counts, one click to the scans", () => {
    const cards = axisCards(QUESTIONS, SUMMARY);
    expect(cards.map((c) => [c.title, c.scans])).toEqual([
      ["Body part", 20],
      ["Base", 19],
      ["Construct", 7],
      ["Modifier", 4],
      ["Post-contrast", 3],
    ]);
    const by = Object.fromEntries(cards.map((c) => [c.axis, c]));
    expect(by.body_part.meta).toBe("14 where a decision disagrees · 5 where the rules disagree · 1 with no value");
    // several questions on the axis: the list, narrowed to it
    expect(by.body_part.href).toBe("#review/questions?axis=body_part");
    // one question: its grid
    expect(by.post_contrast.href).toBe("#review/questions/post_contrast%3Amissing");
    // a session's questions, which the questions doors do not carry, under their axis
    expect(by.construct.meta).toBe("7 session questions");
    expect(by.construct.href).toBe("#review/questions?axis=construct");
    expect(by.base.meta).toBe("12 where the rules and System 1 disagree · 7 with no value");
  });

  it("without the questions doors, the summary's kinds by axis", () => {
    const cards = axisCards(null, SUMMARY);
    expect(cards.map((c) => [c.title, c.scans, c.meta])).toEqual([
      ["Body part", 19, "14 where a decision disagrees · 5 where the rules disagree"],
      ["Base", 7, "7 with no value"],
      ["Construct", 7, "7 session questions"],
      ["Modifier", 4, "4 session questions"],
    ]);
    expect(cards[0].href).toBe("#review/questions?axis=body_part");
    expect(axisCards(null, null)).toEqual([]);
    expect(axisCards({ ...QUESTIONS, questions: [] }, { by_kind: { "campaign.axis": 3 }, cohorts: [], none: 0 })).toEqual([]);
  });

  it("the queue's own count leaves the campaigns' items out, and a campaign's item is a family of its own", () => {
    expect(heldCount(SUMMARY)).toBe(219);
    expect(queuedCount(SUMMARY)).toBe(1282);
    expect(familyOf("campaign.axis")).toBe("campaigns");
    expect(kindTag("campaign.pair").words).toBe("campaign");
    const item = { id: 1, kind: "campaign.axis", scope: "stack", status: "open", ref: { stack_id: 4 }, evidence: { campaign: 6, campaign_name: "base-check" }, created_at: "" } as never;
    expect(itemWords(item)).toBe("in campaign base-check, answered there");
  });
});

describe("the campaigns", () => {
  it("each open one a card with the act of its reader, the person's own first, then the most open; an adjudication a card of its own", () => {
    const cards = campaignBand(caps, CAMPAIGNS);
    expect(cards.map((c) => [c.campaign.name, c.kind, c.act, c.own])).toEqual([
      ["body-part-curation-round-9", "campaign", "Rate", true],
      ["post-contrast-pairs-r3", "campaign", "Read", true],
      ["body-part-curation-round-9", "adjudication", "Adjudicate", true],
      ["samseg-lesions-check", "campaign", "Check", false],
      ["reference-ab-cert3", "campaign", "Settle", false],
    ]);
    expect(cards[0].href).toBe("#review/campaigns/11/rate");
    expect(cards[2].href).toBe("#review/campaigns/11/adjudicate");
    expect(cards[2].meta).toBe("3 to adjudicate");
    expect(cards[4].meta).toBe("base, technique, modifier · audit, never trains");
    // the closed ones are not cards
    expect(cards.some((c) => c.campaign.status === "closed")).toBe(false);
    expect(readerOf({ ...list[0], question: { kind: "anchored" } })).toEqual({ view: "anchored", act: "Read" });
  });

  it("a rater sees the campaigns that are theirs, a reviewer every one", () => {
    const rater = capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "alice@walk", doors: REVIEW });
    const named = { ...list[1], rater_policy: { raters: ["alice@walk"], adjudicators: [] } } as Campaign;
    const other = { ...list[2], rater_policy: { raters: ["bob@walk"], adjudicators: [] } } as Campaign;
    expect(theirs(rater, named)).toBe(true);
    expect(theirs(rater, other)).toBe(false);
    expect(theirs(caps, other)).toBe(true);
    expect(campaignBand(rater, [named, other]).map((c) => c.campaign.name)).toEqual(["probe-pick"]);
  });

  it("says the person's own share", () => {
    expect(shareWords(4, list[0])).toBe("4 of 6 yours");
    expect(shareWords(0, list[0])).toBe("none yours yet");
    expect(shareWords(undefined, list[0])).toBeNull();
  });
});

describe("what else waits", () => {
  it("every kind no band shows, the most first, then Main scans, and the fold's line counts them", () => {
    const rows = alsoRows(caps, SUMMARY, true);
    expect(rows.map((r) => [r.words, r.count])).toEqual([
      ["Files that would share a name in a release", 948],
      ["The same scan under two subjects", 208],
      ["Scans the rules set aside", 12],
      ["Files that need a subject code", 6],
      ["What System 1 asks", 5],
      ["Files NILS could not read", 4],
      ["Two subject codes may be one person", 3],
      ["Main scans · each dataset's and cohort's picks", null],
    ]);
    expect(rows.map((r) => r.href).slice(0, 5)).toEqual(["#review/questions", "#review/identifiers", "#review/questions", "#review/identifiers", "#review/asked"]);
    expect(rows[7].href).toBe("#review/picks");
    expect(alsoSummary(rows)).toBe("Also waiting: 1,186 subjects, files and checks");
    // without the proposals band, a model's proposals wait here, with the way to them
    const older = alsoRows(caps, SUMMARY, false);
    expect(older.find((r) => r.key === "kind:body_part:model")).toMatchObject({ words: "Body part: scans a model proposes", count: 59, href: "#review/proposals" });
    expect(alsoSummary(older)).toBe("Also waiting: 1,245 subjects, files and checks");
    // no Main scans without its door
    expect(alsoRows(capsFor({ doors: DOORS, principal: ME }), SUMMARY, true).some((r) => r.key === "main-scans")).toBe(false);
  });
});

describe("the page", () => {
  const render = (over: Partial<Parameters<typeof WorkBody>[0]> = {}) => renderToStaticMarkup(<WorkBody {...production} onCommit={none} onRead={none} {...over} />);
  const bands = (html: string) => [...html.matchAll(/<section class="rv-band" aria-label="([^"]+)"/gu)].map((m) => m[1]);
  const cards = (html: string, kind: string) => [...html.matchAll(new RegExp(`<article class="rv-card ${kind}" aria-label="([^"]+)"`, "gu"))].map((m) => m[1]);

  it("draws the production case as four bands of cards", () => {
    const html = render();
    expect(html).toContain("<h1>Review</h1>");
    expect(html).not.toContain("<h1>Work</h1>");
    expect(bands(html)).toEqual(["Proposed by models", "Scans to answer", "Campaigns"]);
    // band 1: two cards, the most proposed first, with Commit and Read on the card
    expect(cards(html, "proposed")).toEqual(["Post-contrast · NILS post-contrast model 0.3.1", "Body part · NILS body part model 1.2.0"]);
    expect(html).toContain("<b>50,006</b><span>proposed</span>");
    expect(html).toContain("1,701 sure at 0.99 or above · 190 unsure · 12 in a campaign already · 3 moved on");
    expect(html).toContain(">Commit 1,701</button>");
    expect(html).toContain(">Read the 190</button>");
    expect(html).toContain(">Commit 59</button>");
    expect(html).not.toContain("Read the 0");
    expect(html).toContain('href="#review/proposals">Value by value</a>');
    // band 2: one card per axis with its sum and its reasons
    expect(cards(html, "answer")).toEqual(["Body part", "Base", "Construct", "Modifier", "Post-contrast"]);
    expect(html).toContain("<b>20</b><span>scans</span>");
    expect(html).toContain("14 where a decision disagrees · 5 where the rules disagree · 1 with no value");
    expect(html).toContain('href="#review/questions?axis=body_part">Answer</a>');
    // band 3: the four open campaigns with their acts, and the adjudication
    expect(cards(html, "campaign")).toEqual(["body-part-curation-round-9", "post-contrast-pairs-r3", "samseg-lesions-check", "reference-ab-cert3"]);
    expect(cards(html, "adjudication")).toEqual(["body-part-curation-round-9"]);
    for (const act of [">Rate</a>", ">Read</a>", ">Check</a>", ">Settle</a>", ">Adjudicate</a>"]) expect(html).toContain(act);
    expect(html).toContain("audit, never trains");
    expect(html).toContain("2 closed campaigns keep every answer");
    // band 4: the fold, closed, its line counting what it holds
    expect(html).toContain('<details class="rv-fold"><summary>Also waiting: 1,186 subjects, files and checks</summary>');
    expect(html).toContain("Files that would share a name in a release");
    // no engine words, no job groups, no lede
    for (const gone of ["Waiting in the queue", "staged", "queue", "Answer a question", "Pick a main scan", "What the machine asks", "release shared name", "a model proposes</"]) expect(html).not.toContain(gone);
    expect(html).not.toContain('class="lede"');
  });

  it("says the person's share on their campaign's card, and leaves a person who may not act the numbers alone", () => {
    const html = render({ mine: { 15: 34 } });
    expect(html).toContain("which is post · post_contrast · 34 of 120 yours");
    const quiet = render({ onCommit: undefined, onRead: undefined });
    expect(quiet).not.toContain(">Commit ");
    expect(quiet).not.toContain(">Read the ");
    expect(quiet).toContain("<b>50,006</b><span>proposed</span>");
  });

  it("an engine without the proposals door shows no proposals band, and the model's proposals wait in the fold", () => {
    const html = render({ standings: null });
    expect(bands(html)).toEqual(["Scans to answer", "Campaigns"]);
    expect(html).toContain("Body part: scans a model proposes");
    expect(html).toContain("Also waiting: 1,245 subjects, files and checks");
  });

  it("a rater who holds only campaigns:* sees the campaigns alone", () => {
    const rater = capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "alice@walk", doors: REVIEW });
    const theirsOnly = CAMPAIGNS.map((c) => (c.id === 15 ? ({ ...c, owner: "alice@walk", rater_policy: { raters: ["alice@walk"], adjudicators: [] } } as Campaign) : c));
    const html = render({ caps: rater, summary: null, standings: null, qlist: null, list: theirsOnly });
    expect(bands(html)).toEqual(["Campaigns"]);
    expect(cards(html, "campaign")).toEqual(["post-contrast-pairs-r3"]);
    expect(html).not.toContain("rv-fold");
    // the make button stays grant-gated as before: a rater who may work campaigns has it
    expect(html).toContain("Make a campaign");
  });

  it("nothing proposed and nothing to answer shows the campaigns alone", () => {
    const html = render({ standings: [], qlist: { ...QUESTIONS, questions: [] }, summary: { by_kind: { "campaign.axis": 219 }, cohorts: [], none: 0 } });
    expect(bands(html)).toEqual(["Campaigns"]);
    expect(html).not.toContain("rv-fold");
    const empty = render({ standings: [], qlist: { ...QUESTIONS, questions: [] }, summary: { by_kind: {}, cohorts: [], none: 0 }, list: [] });
    expect(bands(empty)).toEqual([]);
    expect(empty).toContain("Nothing waits.");
  });

  it("waits while anything is read, and says why a reading failed", () => {
    const html = render({ since: NOW - 2000, standings: null, qlist: null, why: ["the proposals could not be read: 502"] });
    expect(html).toContain("The proposals could not be read: 502");
    expect(html).toContain("reading what waits");
  });
});

describe("a rater's page", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("reads the campaigns and their own share, never the queue, the proposals or the questions", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
      asked.push(url.pathname);
      const body = url.pathname === "/api/campaigns" ? { count: 1, campaigns: [{ ...list[1], rater_policy: { raters: ["alice@walk"], adjudicators: [] } }] } : url.pathname.endsWith("/mine") ? { campaign: 5, principal: "alice@walk", open: true, count: 3, total: 3, values: {}, answers: [] } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    root = createRoot(host);
    await act(async () => root.render(<WorkPage caps={capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "alice@walk", doors: REVIEW })} />));
    for (let i = 0; i < 50 && !host.textContent?.includes("3 of 172 yours"); i++) await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(host.querySelector("h1")?.textContent).toBe("Review");
    expect(host.textContent).toContain("probe-pick");
    expect(host.textContent).toContain("3 of 172 yours");
    expect(asked.some((p) => p.startsWith("/api/review"))).toBe(false);
    expect(host.querySelector(".rv-fold")).toBeNull();
    expect(host.querySelector('a[href="#review/questions"]')).toBeNull();
  });
});

describe("the old addresses", () => {
  it("lead to the same page inside Review, the query kept", () => {
    expect(fromCampaigns(parse("#campaigns"))).toBe("#review/campaigns");
    expect(fromCampaigns(parse("#campaigns?make=review&from=base%3A"))).toBe("#review/campaigns?make=review&from=base%3A");
    expect(fromCampaigns(parse("#campaigns/7/rate?amend=91"))).toBe("#review/campaigns/7/rate?amend=91");
    expect(fromCampaigns(parse("#campaigns/7"))).toBe("#review/campaigns/7");
    expect(fromCampaigns(parse("#campaigns/label-sets/4"))).toBe("#review/label-sets/4");
  });
});
