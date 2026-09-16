// SPDX-License-Identifier: AGPL-3.0-only
// Data / Cohorts as it draws: one card per cohort with its state, its
// provenance, its numbers and its last line; New cohort and From a list only
// for work on the Data page where the engine has the door; the three ways a
// subject joins; the page while it reads, when it cannot, and with no cohort.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import cohortsFixture from "../../test/fixtures/cohorts.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Grant } from "../grants";
import type { Cohort } from "./cohorts";
import { CohortsBody, makingRefusal } from "./CohortsPage";

const list = cohortsFixture as Cohort[];
const NOW = Date.parse("2026-09-15T12:00:00Z");
const none = () => undefined;

const caps = (grants: Grant[] = [...GRANTS], doors: string[] = ["POST /api/cohorts", "POST /api/cohorts/{name}/members"]) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid Berg", grants, detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const draw = (c: Capabilities, l: Cohort[] | null = list, why: string | null = null, windowDays: number | null = 90) =>
  renderToStaticMarkup(<CohortsBody caps={c} list={l} why={why} now={NOW} windowDays={windowDays} onNew={none} />);

describe("Data / Cohorts", () => {
  const html = draw(caps());

  it("draws one card per cohort with its state, where its members come from, its numbers and its last line", () => {
    expect(html).toContain("<h1>Cohorts</h1>");
    expect(html).toContain('href="#data/cohorts/north"');
    expect(html).toContain('<span class="tag caution">62 wait</span>');
    expect(html).toMatch(/<span class="tag brand">new<\/span>/u);
    expect(html).toMatch(/<span class="tag ok"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>sorted<\/span>/u);
    expect(html).toContain('<span class="tag">empty</span>');
    expect(html).toContain("fed by the dataset <b>north-3t</b>");
    expect(html).toContain("promoted from the card <b>north at 7T</b> · v2 · today");
    expect(html).toContain("by hand <b>astrid</b> · 40 subjects from a list · 3 Sep");
    expect(html).toContain("<b>240</b>sessions");
    expect(html).toContain("<b>3,106</b>stacks");
    expect(html).toContain('<span class="meta">1 release · owner astrid · since 11 May</span>');
    expect(html).toContain("fills when ct-lab is digested");
    // the newest promoted cohort is marked on its card
    expect(html).toContain('class="ccard new"');
  });

  // record 27, R5c: the three-column explainer and the paragraph above it are one disclosure,
  // so the three ways keep their words and their links but no longer take a section of their own
  it("offers a new cohort three ways, and the dashed card, to work on the Data page", () => {
    expect(html).toContain("New cohort");
    expect(html).toContain('class="ccard add"');
    expect(html).toContain("<summary>Three ways a subject joins</summary>");
    expect(html).toContain("A dataset feeds it");
    expect(html).toContain('href="#data"');
    expect(html).toContain("A query promotes them");
    expect(html).toContain('href="#query"');
    expect(html).toContain("A hand adds them");
    expect(html).toContain(">From a list</button>");
    expect(html).toContain("Sessions and stacks are never members");
  });

  it("counts the sessions out of the session cache: the window it was built under, and not built yet where nobody has", () => {
    expect(html).toContain("Out of the session cache as it stands, built under a 90-day window.");
    expect(html).toContain("Where nobody has built it they are not built yet");
    // an engine whose summary the page could not read says the rest all the same
    expect(draw(caps(), list, null, null)).toContain("Out of the session cache as it stands. Where nobody has built it");
    const unbuilt = draw(caps(), list.map((c) => ({ ...c, sessions: null })));
    expect(unbuilt).toContain("<b>not built yet</b>sessions");
    expect(unbuilt).not.toContain("<b>240</b>sessions");
  });

  it("offers no new cohort to a person who may only look, or where the engine has no door", () => {
    const look = draw(caps(["data:see"]));
    expect(look).toContain('href="#data/cohorts/north"');
    expect(look).not.toContain(">New cohort<");
    expect(look).not.toContain('class="ccard add"');
    expect(look).toContain("Making a cohort needs work on the Data page.");
    expect(look).not.toContain(">From a list</button>");
    expect(makingRefusal(caps([...GRANTS], []))).toBe("This engine has no door for making a cohort.");
  });

  it("says it reads, why it could not, that there is none yet, and keeps a retired one folded", () => {
    expect(draw(caps(), null)).toContain("reading the cohorts");
    expect(draw(caps(), null, "no such door")).toContain('<p class="warn">The cohorts could not be read: no such door</p>');
    const empty = draw(caps(), []);
    expect(empty).toContain("No cohort yet.");
    expect(empty).toContain('class="ccard add"');
    const retired = draw(caps(), [{ ...list[2], retired_at: "2026-09-14T10:00:00Z" }]);
    expect(retired).toContain("1 retired cohort keeps its members and history");
    expect(retired).toContain('href="#data/cohorts/pilot"');
    expect(retired).not.toContain('class="ccard" href="#data/cohorts/pilot"');
  });
});
