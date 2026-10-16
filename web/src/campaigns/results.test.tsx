// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's Results view (record 55, ruling 35 (d)): offered to its maker
// and a Review worker while it is open and to everyone once it closes; the
// answers by rater, the adjudication, the settled value and the decision
// written, the counts by value and the label sets to download; the raters
// named to the maker and a Review worker alone.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answersClosed from "../../test/fixtures/campaigns/answers_closed.json";
import closedCampaign from "../../test/fixtures/campaigns/campaign_closed.json";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import labelSets from "../../test/fixtures/campaigns/label_sets.json";
import resultsClosed from "../../test/fixtures/campaigns/results_closed.json";
import { capsFor, DOORS } from "./caps.fixture";
import { CampaignBody } from "./CampaignPage";
import type { Answer, Campaign, LabelSet } from "./client";
import { answerOf, byAxis, downloads, namesRaters, raterColumns, raterNames, RESULTS, resultsRefusal, type Results } from "./results";
import { ResultsBody } from "./Results";

const open = openCampaign as unknown as Campaign;
const closed = closedCampaign as unknown as Campaign;
const results = resultsClosed as unknown as Results;
const sets = (labelSets as { label_sets: LabelSet[] }).label_sets;
const answers = (answersClosed as { answers: Answer[] }).answers;
const WITH = [...DOORS, RESULTS];
const none = () => undefined;

describe("who reads a campaign's results", () => {
  const mine = { ...open, owner: "maya@walk", rater_policy: { raters: ["alice@walk", "bob@walk"], adjudicators: ["carol@walk"] } } as Campaign;

  it("is its maker and a Review worker while it is open, and refused to a rater", () => {
    expect(resultsRefusal(capsFor({ doors: WITH, principal: "maya@walk", grants: ["campaigns:see", "campaigns:work"] }), mine)).toBeNull();
    expect(resultsRefusal(capsFor({ doors: WITH, principal: "root@walk" }), mine)).toBeNull();
    expect(resultsRefusal(capsFor({ doors: WITH, principal: "carol@walk", grants: ["campaigns:see", "campaigns:work"] }), mine)).toBeNull();
    expect(resultsRefusal(capsFor({ doors: WITH, principal: "alice@walk", grants: ["campaigns:see", "campaigns:work"] }), mine)).toContain("Blind until it closes");
  });

  it("is blind to a maker who rates in it", () => {
    const self = { ...mine, rater_policy: { raters: ["maya@walk", "alice@walk"], adjudicators: [] } } as Campaign;
    expect(resultsRefusal(capsFor({ doors: WITH, principal: "maya@walk", grants: ["campaigns:see", "campaigns:work"] }), self)).toContain("Blind");
  });

  it("is every participant once it closes, and nobody on an engine without the door", () => {
    expect(resultsRefusal(capsFor({ doors: WITH, principal: "alice@walk", grants: ["campaigns:see"] }), closed)).toBeNull();
    expect(resultsRefusal(capsFor({ principal: "carol@walk" }), closed)).toContain("no door");
  });

  it("names the raters to the maker and a Review worker, and numbers them for anyone else", () => {
    expect(namesRaters(capsFor({ principal: "carol@walk", grants: ["campaigns:see"] }), closed)).toBe(true);
    expect(namesRaters(capsFor({ principal: "alice@walk", grants: ["campaigns:see"] }), closed)).toBe(false);
    const named = raterNames(answers, "alice@walk", false);
    expect(named.get("alice@walk")).toBe("alice");
    expect(named.get("bob@walk")).toBe("rater 1");
    expect(raterNames(answers, "carol@walk", true).get("bob@walk")).toBe("bob");
  });
});

describe("the results as they draw", () => {
  const html = renderToStaticMarkup(<ResultsBody results={results} sets={sets} onDownload={none} />);

  it("counts what was settled, adjudicated and written, with the agreement and the unsure", () => {
    expect(html).toContain('<span class="k">settled</span><span class="v">1 of 6</span>');
    expect(html).toContain('<span class="k">adjudicated</span><span class="v">1</span>');
    expect(html).toContain('<span class="k">decisions</span><span class="v">1</span>');
    expect(html).toContain('<span class="k">exact</span><span class="v">0%</span>');
    expect(html).toContain('<span class="k">unsure</span><span class="v">1</span>');
    expect(html).not.toContain("Raters by number.");
  });

  it("puts each rater's answer in a column, the adjudication and the decision beside", () => {
    expect(raterColumns(results)).toEqual(["alice@walk", "bob@walk"]);
    expect(html).toContain("<th>alice</th><th>bob</th><th>Adjudication</th><th>Settled</th><th>Written</th>");
    expect(answerOf(results.items[0], "bob@walk")?.value).toBe("T2w");
    expect(html).toContain('title="marked unsure">T2w ?</td>');
    expect(html).toContain("<td>carol: T1w</td><td>T1w</td><td>decision 1</td>");
  });

  it("counts by value and by rater in tables", () => {
    expect(byAxis(results.values)).toHaveLength(1);
    expect(html).toContain("<td>T1w</td><td class=\"num\">1</td><td class=\"num\">1</td>");
    expect(html).toContain("<td>T2w</td><td class=\"num\">1</td><td class=\"num\">0</td>");
    expect(html).toContain("<td>carol</td><td class=\"num\">0</td><td class=\"num\">1</td>");
  });

  it("offers each label set of the campaign to download, newest first", () => {
    const files = downloads(sets);
    expect(files.length).toBe(sets.length);
    expect(files[0].file).toMatch(/-v\d+-\w+\.tsv$/);
    expect(html).toContain("labels.tsv</button>");
    expect(renderToStaticMarkup(<ResultsBody results={results} sets={[]} />)).toContain("No label set yet. Export writes one.");
  });

  it("says when the raters are shown by number", () => {
    const unnamed = { ...results, named: false };
    expect(renderToStaticMarkup(<ResultsBody results={unnamed} sets={[]} />)).toContain("Raters by number.");
  });
});

describe("the campaign page", () => {
  const draw = (caps = capsFor({ doors: WITH }), view: "items" | "results" = "items") =>
    renderToStaticMarkup(<CampaignBody caps={caps} campaign={closed} answers={answers} sets={sets} view={view} onAct={none} />);

  it("offers Items and Results where the door is, and only Items where it is not", () => {
    expect(draw()).toContain('aria-selected="true">Items</button>');
    expect(draw()).toContain(">Results</button>");
    expect(draw(capsFor())).not.toContain(">Results</button>");
  });

  it("opens the Results view on the results, reading them first", () => {
    const html = draw(capsFor({ doors: WITH }), "results");
    expect(html).toContain('aria-selected="true">Results</button>');
    expect(html).toContain("reading the results");
    expect(html).not.toContain("<h2>Items</h2>");
  });

  it("names the raters of the items table to the maker, and numbers them for another rater", () => {
    expect(draw(capsFor({ doors: WITH, principal: "carol@walk", grants: ["campaigns:see"] }))).toContain("bob T2w");
    const alice = draw(capsFor({ doors: WITH, principal: "alice@walk", grants: ["campaigns:see"] }));
    expect(alice).toContain("rater 1 T2w");
    expect(alice).toContain("alice T1w");
    expect(alice).not.toContain("bob T2w");
  });
});
