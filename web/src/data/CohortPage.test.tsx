// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's page as it draws: its lede and acts, the four tiles with what
// waits on Review, the step chart, how they joined newest first, and the
// aside with its datasets, releases and the queries to start; what a person
// who may only look is offered; a retired cohort.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import cohortFixture from "../../test/fixtures/cohort.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Grant } from "../grants";
import type { CohortDetail } from "./cohorts";
import { CohortBody, cohortActs, holdingWords, joinWords } from "./CohortPage";

const north = cohortFixture as CohortDetail;
const NOW = Date.parse("2026-09-15T12:00:00Z");
const none = () => undefined;
const DOORS = ["PUT /api/cohorts/{name}", "POST /api/cohorts/{name}/members", "POST /api/releases", "POST /api/ask/start"];

const caps = (grants: Grant[] = [...GRANTS], doors: string[] = DOORS) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid Berg", grants, detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const draw = (c: Capabilities, cohort: CohortDetail | null = north, why: string | null = null) => renderToStaticMarkup(<CohortBody caps={c} cohort={cohort} why={why} now={NOW} onAct={none} onStart={none} />);

describe("a cohort's page", () => {
  const html = draw(caps());

  it("names it, says how it came to be, and offers its acts", () => {
    expect(html).toContain('<a href="#data/cohorts">Cohorts</a>');
    expect(html).toContain("<h1>north</h1>");
    expect(html).toContain("Fed by the dataset north-3t since 11 May. Owner astrid. Every subject a digest of that folder brings in joins here.");
    expect(html).toContain("Add or remove");
    expect(html).toContain(">Rename</button>");
    expect(html).toContain(">Retire</button>");
    expect(html).toContain('href="#release/new/north"');
  });

  it("counts subjects, sessions, stacks and what waits, with the way to Review", () => {
    expect(html).toContain('<span class="k">subjects</span><span class="v">212</span><span class="meta">38 joined today · 2 left</span>');
    expect(html).toContain('<span class="k">sessions</span><span class="v">240</span>');
    expect(html).toContain('<span class="k">stacks</span><span class="v">3,106</span><span class="meta">3,044 sorted</span>');
    expect(html).toContain('<div class="wait"><span class="k">waiting</span><span class="v">62</span><span class="meta">on Review</span><a class="tail" href="#review">Open on Review');
  });

  it("draws the members over time as a step chart from the joins", () => {
    expect(html).toContain('<polyline class="line" points="60,');
    expect(html).toContain('aria-label="members over time, 212 now"');
    expect(html).toContain(">212</text>");
    expect(html).toContain(">11 May · first</text>");
    expect(html).toContain(">today</text>");
  });

  it("lists how they joined, newest first, with a way to the batch or the audit", () => {
    expect(html).toContain("<h2>How they joined</h2>");
    expect(html.indexOf("batch north-3t-2026-09-15 of the dataset north-3t")).toBeLessThan(html.indexOf("first read of the dataset north-3t"));
    expect(html).toContain("<td>taken out by hand: consent withdrawn</td>");
    expect(html).toContain('<td class="num nowrap">2 left</td>');
    expect(html).toContain('<td class="num nowrap">92 joined</td>');
    expect(html).toContain('href="#data/batches/19"');
    expect(html).toContain('href="#settings/audit"');
    expect(joinWords({ when: "", what: "", subjects: -3, by: "" })).toBe("3 left");
  });

  it("keeps the datasets, the releases and the queries to start beside it", () => {
    expect(html).toContain("<h2>Datasets</h2>");
    expect(html).toContain("<dt>north-3t</dt><dd>feeds this cohort · arrives identified · 4 batches</dd>");
    expect(html).toContain("<dt>archive-2019</dt><dd>holds 6 of these subjects too · arrives de-identified · 1 batch</dd>");
    expect(html).toContain("<dt>north-2026.08.21.1</dt><dd>bids · 174 subjects · handed over</dd>");
    expect(html).toContain("Everyone in north");
    expect(html).toContain("Their sessions");
    expect(html).toContain("Their stacks");
    expect(holdingWords({ name: "x", subjects: 3, feeds: false })).toBe("holds 3 of these subjects too");
  });

  it("offers no act to a person who may only look, and says why", () => {
    const look = draw(caps(["data:see", "release:see"]));
    expect(look).toContain("<h1>north</h1>");
    expect(look).not.toContain("Add or remove");
    expect(look).not.toContain(">Rename</button>");
    expect(look).not.toContain('href="#release/new/north"');
    expect(look).toContain("Adding or taking out members needs work on the Data page.");
    expect(look).toContain("Keeping cards needs work on the Query page.");
    expect(look).not.toContain("Everyone in north");
    const acts = cohortActs(caps([...GRANTS], []), "north");
    expect(acts.changing).toBe("This engine has no door for changing a cohort.");
    expect(acts.starting).toBe("This engine has no start door.");
  });

  it("says a retired cohort keeps its members and offers to bring it back", () => {
    const retired = draw(caps(), { ...north, retired_at: "2026-09-14T10:00:00Z" });
    expect(retired).toContain("Retired 14 Sept: its members and history stay.");
    expect(retired).toContain(">Bring back</button>");
    expect(retired).not.toContain("Add or remove");
    expect(retired).not.toContain('href="#release/new/north"');
  });

  it("says it reads and why it could not", () => {
    expect(draw(caps(), null)).toContain("reading the cohort");
    expect(draw(caps(), null, "no such cohort")).toContain('<p class="warn">The cohort could not be read: no such cohort</p>');
  });
});
