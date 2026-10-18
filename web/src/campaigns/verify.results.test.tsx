// SPDX-License-Identifier: AGPL-3.0-only
// Results and Pace of a verify campaign (record 58 P1, spec 12.5): the catch
// rate beside the agreement, overall and per reader, a campaign under the 90
// percent bar marked plainly; readers by their account name, the sign-in
// subject only as a hover title; the campaign page's planted fact; the
// counts export offered on a verify campaign.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAMPAIGN, PLANTED, READER_A, READER_B, RESULTS_VERIFY, STATS_VERIFY } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import { CampaignBody } from "./CampaignPage";
import { capsFor, DOORS } from "./caps.fixture";
import type { Campaign } from "./client";
import { statsOf } from "./reader";
import { RaterStats } from "./ReaderParts";
import { RESULTS, resultsOf, type Results } from "./results";
import { ResultsBody } from "./Results";

const results = resultsOf(RESULTS_VERIFY as unknown as Results);
const none = () => undefined;

describe("results with the catch rate", () => {
  const html = renderToStaticMarkup(<ResultsBody results={results} sets={[]} onDownload={none} />);

  it("puts the catch beside the agreement and marks a campaign under the bar plainly", () => {
    expect(html).toContain('<span class="k">exact</span><span class="v">94%</span>');
    expect(html).toContain('<span class="k">caught</span><span class="v">21 of 25 · 84%</span>');
    expect(html).toContain("under the bar");
    expect(html).toContain("Caught 84% of the planted values; the bar is 90%. This result does not stand alone.");
    const over = renderToStaticMarkup(<ResultsBody results={{ ...results, catch: { ...results.catch!, caught: 24, rate: 0.96 }, below_bar: false }} sets={[]} />);
    expect(over).toContain("24 of 25 · 96%");
    expect(over).not.toContain("under the bar");
  });

  it("names each reader by the account, the subject as a hover title, with the catch per reader", () => {
    expect(html).toContain(`<td title="${READER_A}">Astrid</td><td class="num">250</td><td class="num">0</td><td class="num">2</td><td class="num">21 of 25 · 84%</td>`);
    expect(html).toContain(`<td title="${READER_B}">Bo</td><td class="num">50</td><td class="num">0</td><td class="num">0</td><td class="num">5 of 5 · 100%</td>`);
    expect(html).toContain(`<th title="${READER_A}">Astrid</th><th title="${READER_B}">Bo</th><th>Adjudication</th>`);
    // the long sign-in code is never a column's text
    expect(html.replace(/title="[^"]*"/gu, "")).not.toContain(READER_A);
  });

  it("has no catch and no Caught column on another campaign", () => {
    const plain = renderToStaticMarkup(<ResultsBody results={{ ...results, catch: null, below_bar: false }} sets={[]} />);
    expect(plain).not.toContain("caught");
    expect(plain).not.toContain(">Caught<");
  });
});

describe("pace by account name", () => {
  it("shows the account's name and keeps the subject as a hover title", () => {
    const html = renderToStaticMarkup(<RaterStats stats={statsOf(STATS_VERIFY as unknown as Json)} />);
    expect(html).toContain(`<td title="${READER_A}">Astrid</td>`);
    expect(html).toContain(`<td title="${READER_B}">Bo</td>`);
    expect(html.replace(/title="[^"]*"/gu, "")).not.toContain(READER_B);
    // an older engine without names shows the principal, as before
    const old = renderToStaticMarkup(<RaterStats stats={statsOf({ raters: [{ principal: "alice@walk", answers: 3 }] })} />);
    expect(old).toContain('<td title="alice@walk">alice@walk</td>');
  });
});

describe("the campaign page of a verify campaign", () => {
  const verify = { ...(CAMPAIGN as unknown as Campaign), status: "closed", closed_at: "2026-12-02T12:00:00Z", purpose: "verify", suggest: "rules", planted: PLANTED, owner: "carol@walk" } as Campaign;
  const caps = capsFor({ doors: [...DOORS, RESULTS] });

  it("says what the answers are for and the planted values as the door reports them, never the items", () => {
    const html = renderToStaticMarkup(<CampaignBody caps={caps} campaign={verify} answers={[]} sets={[]} stats={statsOf(STATS_VERIFY as unknown as Json)} onAct={none} />);
    expect(html).toContain("<dt>for</dt><dd>Verify · ");
    expect(html).toContain("<dt>planted</dt><dd>10 % of the items · 25 planted · the list stays sealed until the close</dd>");
    // the pace table by account name
    expect(html).toContain(`<td title="${READER_A}">Astrid</td>`);
  });

  it("offers Results where the door is", () => {
    const html = renderToStaticMarkup(<CampaignBody caps={caps} campaign={verify} answers={[]} sets={[]} view="results" onAct={none} />);
    expect(html).toContain('aria-selected="true">Results</button>');
  });
});
