// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review's one list of work (Wave 7a, record 55 H3; spec 13.2): the machine's
// open questions by kind with their counts and the campaigns with their state
// and the person's own share, each under the job a person does; a campaign's
// items held in the queue as a family of their own; a rater who holds only
// campaigns:* sees their campaigns and the page never reads the queue for
// them; old Campaigns addresses lead to the same page inside Review.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import listed from "../../test/fixtures/campaigns/list.json";
import { capsFor, DOORS } from "../campaigns/caps.fixture";
import type { Campaign } from "../campaigns/client";
import { fromCampaigns, parse } from "../routes";
import { familyOf, itemWords, kindTag } from "./client";
import { heldCount, jobOf, machineRow, machineRows, queuedCount, readerOf, shareWords, theirs, workList } from "./work";
import { WorkBody, WorkPage } from "./WorkPage";

const list = (listed as { campaigns: Campaign[] }).campaigns;
const none = () => undefined;
const NOW = Date.parse("2026-10-13T10:00:00Z");
const REVIEW = [...DOORS, "GET /api/review", "GET /api/review/summary", "GET /api/picks/rules", "GET /api/campaigns/{id}/mine"];
const summary = { by_kind: { "base:missing": 7, "body_part:model": 40, "pick.border": 3, "identity.collision": 2, "campaign.axis": 12, "classify.asked": 5 }, cohorts: [], none: 0 };

describe("the machine's questions", () => {
  it("each kind is a row under its job, with where it is worked and its act", () => {
    expect(machineRow("base:missing", 7)).toMatchObject({ job: "answer", title: "base: no value", count: 7, href: "#review/questions?axis=base&reason=missing", act: "Answer" });
    expect(machineRow("body_part:model", 40)).toMatchObject({ job: "answer", href: "#review/proposals" });
    expect(machineRow("pick.border", 3)).toMatchObject({ job: "pick", href: "#review/picks?earlier=1" });
    expect(machineRow("identity.collision", 2)).toMatchObject({ job: "answer", title: "Subjects: collision", href: "#review/identifiers", act: "Decide" });
    expect(machineRow("pipeline:qc", 4)).toMatchObject({ job: "check" });
    // a campaign's items are answered there, never a row of the queue's
    expect(machineRow("campaign.axis", 12)).toBeNull();
    expect(machineRow("base:missing", 0)).toBeNull();
  });

  it("the most waiting first, and the queue's own count leaves the campaigns' items out", () => {
    expect(machineRows(summary).map((r) => r.count)).toEqual([40, 7, 5, 3, 2]);
    expect(heldCount(summary)).toBe(12);
    expect(queuedCount(summary)).toBe(57);
  });

  it("a campaign's item is a family of its own in the queue, named by its campaign", () => {
    expect(familyOf("campaign.axis")).toBe("campaigns");
    expect(kindTag("campaign.pair").words).toBe("campaign");
    const item = { id: 1, kind: "campaign.axis", scope: "stack", status: "open", ref: { stack_id: 4 }, evidence: { campaign: 6, campaign_name: "base-check" }, created_at: "" } as never;
    expect(itemWords(item)).toBe("held by campaign base-check, answered there");
  });
});

describe("the campaigns", () => {
  const caps = capsFor({ doors: REVIEW });
  it("each under the job its readers do, read in its own reader", () => {
    const ab = { ...list[0], source: { ab: { voters: ["rules", "judge"] } } } as Campaign;
    expect(jobOf(ab)).toBe("settle");
    expect(readerOf(ab)).toEqual({ view: "settle", act: "Settle" });
    expect(jobOf({ ...list[0], question: { kind: "check" } })).toBe("check");
    expect(jobOf({ ...list[0], question: { kind: "pick", role: "t1w" } })).toBe("pick");
    expect(readerOf({ ...list[0], question: { kind: "pair" } })).toEqual({ view: "pairs", act: "Read" });
    expect(readerOf({ ...list[0], question: { kind: "anchored" } })).toEqual({ view: "anchored", act: "Read" });
  });

  it("the whole list by job: questions first, Main scans under Pick, then the campaigns, and an adjudication under Settle", () => {
    const groups = workList(caps, summary, list);
    expect(groups.map((g) => g.job)).toEqual(["answer", "pick", "check", "settle"]);
    const titles = (job: string) => groups.find((g) => g.job === job)!.rows.map((r) => r.title);
    expect(titles("answer").slice(0, 4)).toEqual(["body_part: a model proposes", "base: no value", "System 1 asks", "Subjects: collision"]);
    expect(titles("pick")).toEqual(["Pick borders", "Main scans", "probe-pick"]);
    expect(titles("settle")).toEqual(["base-check"]);
    // the closed campaign is not on the list
    expect(groups.flatMap((g) => g.rows).some((r) => r.title === "probe-axis")).toBe(false);
  });

  it("a rater sees the campaigns that are theirs, a reviewer every one", () => {
    const rater = capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "alice@walk", doors: REVIEW });
    const named = { ...list[1], rater_policy: { raters: ["alice@walk"], adjudicators: [] } } as Campaign;
    const other = { ...list[2], rater_policy: { raters: ["bob@walk"], adjudicators: [] } } as Campaign;
    expect(theirs(rater, named)).toBe(true);
    expect(theirs(rater, other)).toBe(false);
    expect(theirs(caps, other)).toBe(true);
    // and no question of the machine's is listed for them
    expect(workList(rater, summary, [named]).flatMap((g) => g.rows).map((r) => r.title)).toEqual(["probe-pick"]);
  });

  it("says the person's own share", () => {
    expect(shareWords(4, list[0])).toBe("4 of 6 yours");
    expect(shareWords(0, list[0])).toBe("none yours yet");
    expect(shareWords(undefined, list[0])).toBeNull();
  });
});

describe("the page", () => {
  it("draws each job with its rows, the held line, and Questions with the queue's own count", () => {
    const html = renderToStaticMarkup(<WorkBody caps={capsFor({ doors: REVIEW })} summary={summary} list={list} mine={{ 6: 2 }} now={NOW} onMake={none} />);
    expect(html).toContain("<h1>Work</h1>");
    for (const t of ["Answer a question", "Pick a main scan", "Check a result", "Settle a disagreement"]) expect(html).toContain(`<h2>${t}</h2>`);
    expect(html).not.toContain("Draw");
    expect(html).toContain('href="#review/questions">Questions<b>57</b>');
    expect(html).toContain("12 questions are held by campaigns, answered there.");
    expect(html).toContain("base · 11 values · 2 of 6 yours");
    // a row's kind is its border's colour, never a glyph
    expect(html).toContain('class="work-row from-campaign"');
    expect(html).toContain('class="work-row from-adjudication"');
    expect(html).toContain('class="work-row from-machine"');
    // Check a result has nothing yet, and says so
    expect(html).toMatch(/<h2>Check a result<\/h2>.*?Nothing waits\./su);
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

  it("reads the campaigns and their own share, never the queue", async () => {
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
    expect(host.textContent).toContain("The campaigns you read.");
    expect(host.textContent).toContain("probe-pick");
    expect(host.textContent).toContain("3 of 172 yours");
    expect(asked.some((p) => p.startsWith("/api/review"))).toBe(false);
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
