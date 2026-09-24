// SPDX-License-Identifier: AGPL-3.0-only
// Each page of the Campaigns section as it draws from what an OpenAPI 7
// engine answered: the list, one campaign with its closure panel, the make
// dialog's form, the label sets and one set; and the section itself, offered
// where the grant and the door are and absent where either is not.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answersOpen from "../../test/fixtures/campaigns/answers_open.json";
import closedCampaign from "../../test/fixtures/campaigns/campaign_closed.json";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import labelSet from "../../test/fixtures/campaigns/label_set.json";
import labelSets from "../../test/fixtures/campaigns/label_sets.json";
import listed from "../../test/fixtures/campaigns/list.json";
import { packDoc } from "../review/client";
import { sections } from "../sections";
import { ADMIN, capsFor, DOORS, RATER } from "./caps.fixture";
import { CampaignBody, ClosurePanel } from "./CampaignPage";
import { CampaignsBody } from "./CampaignsPage";
import { closure, emptyDraft, type Answer, type Campaign, type LabelSet } from "./client";
import { LabelSetBody, LabelSetsBody, tsvRows } from "./LabelSets";
import { MakeForm } from "./MakeCampaign";

const list = (listed as { campaigns: Campaign[] }).campaigns;
const open = openCampaign as unknown as Campaign;
const closed = closedCampaign as unknown as Campaign;
const answers = (answersOpen as { answers: Answer[] }).answers;
const none = () => undefined;
const NOW = Date.parse("2026-09-24T10:00:00Z");

describe("the list", () => {
  const html = renderToStaticMarkup(<CampaignsBody caps={capsFor({ grants: RATER, principal: "alice@walk" })} list={list} why={null} now={NOW} onMake={none} />);

  it("lists the open campaigns with their question, source and items by state, and keeps the closed ones apart", () => {
    expect(html).toContain("<h1>Campaigns</h1>");
    expect(html).toContain('<a href="#campaigns/6">base-check</a>');
    expect(html).toContain("stack · 2 raters each");
    expect(html).toContain("One axis<div class=\"meta\">base · 11 values</div>");
    expect(html).toContain("selection probe@1");
    expect(html).toContain("1 to adjudicate · 2 agreed of 6");
    expect(html).toContain('<i class="s-ok" style="width:33.3%"></i>');
    expect(html).toContain("session · 1 rater each");
    expect(html).toContain("1 closed campaign keeps every answer");
    expect(html.indexOf("probe-axis")).toBeGreaterThan(html.indexOf("closed campaign keeps"));
    expect(html).toContain("0% exact · κ 0.00 · over 1 item");
  });

  it("offers Rate where the person may claim, Adjudicate only to a named adjudicator, and Make with work", () => {
    expect(html).toContain('href="#campaigns/6/rate"');
    expect(html).not.toContain('href="#campaigns/6/adjudicate"');
    expect(html).toContain("Make a campaign");
    const carol = renderToStaticMarkup(<CampaignsBody caps={capsFor({ principal: "carol@walk" })} list={list} why={null} now={NOW} onMake={none} />);
    expect(carol).toContain('href="#campaigns/6/adjudicate"');
    const looker = renderToStaticMarkup(<CampaignsBody caps={capsFor({ grants: ["campaigns:see"] })} list={list} why={null} now={NOW} onMake={none} />);
    expect(looker).not.toContain("/rate");
    expect(looker).not.toContain("Make a campaign");
  });

  it("says there is none yet, and why it could not be read", () => {
    expect(renderToStaticMarkup(<CampaignsBody caps={capsFor()} list={[]} why={null} now={NOW} onMake={none} />)).toContain("No campaign yet.");
    expect(renderToStaticMarkup(<CampaignsBody caps={capsFor()} list={null} why="the engine answered 500" now={NOW} onMake={none} />)).toContain("The campaigns could not be read: the engine answered 500");
  });

  it("shows the label sets tab only where the door and a grant that reads it are", () => {
    expect(html).toContain('href="#campaigns/label-sets"');
    const old = renderToStaticMarkup(<CampaignsBody caps={capsFor({ doors: DOORS.filter((d) => !d.includes("label-sets")) })} list={list} why={null} now={NOW} onMake={none} />);
    expect(old).not.toContain("label-sets");
  });
});

describe("one campaign", () => {
  const draw = (caps = capsFor({ grants: ADMIN }), c = open, a: Answer[] | null = answers, sets: LabelSet[] = [], filter: string | null = null) =>
    renderToStaticMarkup(<CampaignBody caps={caps} campaign={c} answers={a} sets={sets} filter={filter} onAct={none} />);

  it("says the question, the source, who rates and adjudicates, and how well they agree", () => {
    const html = draw();
    expect(html).toContain("<h1>base-check</h1>");
    expect(html).toContain('One axis: base · 11 values <span class="tag ok">open</span>');
    expect(html).toContain('<span class="k">items</span><span class="v">6</span>');
    expect(html).toContain('<span class="k">exact</span><span class="v">67%</span>');
    expect(html).toContain('<span class="v">0.40</span>');
    expect(html).toContain("<dt>raters</dt><dd>anyone with work on Campaigns</dd>");
    expect(html).toContain("<dt>adjudicators</dt><dd>carol@walk</dd>");
    expect(html).toContain("<dt>adjudicated</dt><dd>on disagreement · exact</dd>");
    expect(html).toContain("<dt>closes into</dt><dd>decisions in force</dd>");
    expect(html).toContain("<dt>lease</dt><dd>15 min</dd>");
    expect(html).toContain("selection probe@1 · handle 5 · stacks");
  });

  it("lists the items by state with their answers, and filters them", () => {
    const html = draw();
    expect(html).toContain("all <b>6</b>");
    expect(html).toContain("to adjudicate <b>1</b>");
    expect(html).toContain('<span class="tag caution">to adjudicate</span>');
    expect(html).toContain('<span class="tag ok">agreed</span>');
    expect(html).toMatch(/alice T1w<\/span><span class="answer-chip"[^>]*>bob T1w/u);
    const only = draw(undefined, open, answers, [], "needs_adjudication");
    expect(only.match(/<tr>/gu)?.length).toBe(2);
    expect(only).toContain("alice T1w");
    expect(only).toContain("bob T2w");
  });

  it("lets a rater rate blind: counts, not the other raters' answers, until it closes", () => {
    const rater = draw(capsFor({ grants: RATER, principal: "alice@walk" }));
    expect(rater).not.toContain("bob T2w");
    expect(rater).toContain('<td class="meta">2 answers</td>');
    expect(rater).toContain("Raters rate blind");
    expect(draw(capsFor({ grants: RATER, principal: "carol@walk" }))).toContain("bob T2w");
  });

  it("offers Close and Export with the grants, and says why not without", () => {
    const html = draw();
    expect(html).toContain(">Close</button>");
    expect(html).toContain(">Export</button>");
    const rater = draw(capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "alice@walk" }));
    expect(rater).not.toContain(">Close</button>");
    expect(rater).toContain("Closing writes through Review, so it needs work on the Review page as well.");
    expect(rater).toContain('href="#campaigns/6/rate"');
    const looker = draw(capsFor({ grants: ["campaigns:see"] }));
    expect(looker).not.toContain(">Export</button>");
    expect(looker).not.toContain("/rate");
  });

  it("shows a closed campaign's outcome, its decision and its label sets", () => {
    const html = draw(capsFor(), closed, null, [labelSets.label_sets[0] as unknown as LabelSet]);
    expect(html).toContain('<span class="tag">closed</span>');
    expect(html).toContain("<dt>closed</dt><dd>carol@walk · 24 Sept 2026</dd>");
    expect(html).toContain('<span class="tag brand">resolved</span>');
    expect(html).toContain("T1w<span class=\"meta\"> · decision 1</span>");
    expect(html).toContain('<a href="#campaigns/label-sets/1">probe-axis v1</a>');
    expect(html).not.toContain(">Close</button>");
    expect(html).toContain("The answers could not be read at this detail.");
  });

  it("shows an axes campaign's agreement by axis, its decisions per item, and the stacks still without a picture", () => {
    const axes: Campaign = {
      ...open,
      question: { kind: "axes", axes: ["base", "technique"] },
      agreement: { ...open.agreement!, per_axis: { base: { ...open.agreement!, exact: 1 }, technique: { ...open.agreement!, exact: 0.5 } } },
      items: [{ ...open.items![0], state: "resolved", outcome: { value: { base: "T1w", technique: "MPRAGE" }, decisions: { base: 11, technique: 12 } }, decision_id: null }],
    };
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor()} campaign={axes} answers={[]} sets={[]} missing={4} onAct={none} />);
    expect(html).toContain("By axis: base 100% · technique 50%");
    expect(html).toContain("base T1w · technique MPRAGE<span class=\"meta\"> · decisions 11, 12</span>");
    expect(html).toContain("4 of its stacks have no picture yet.");
    expect(html).toContain("pyramid build --handle 5");
  });

  it("shows what a close will write before it writes it", () => {
    const html = renderToStaticMarkup(<ClosurePanel campaign={open} plan={closure(open, answers)} />);
    expect(html).toContain("Writes 2 decisions in force.");
    expect(html).toContain("Leaves 4 unresolved: 3 open, 1 to adjudicate. Their review items stay in the queue.");
    expect(html).toContain("Ends 1 lease still out.");
    const staged = renderToStaticMarkup(<ClosurePanel campaign={{ ...open, closes_into: "stage" }} plan={closure({ ...open, closes_into: "stage" }, answers)} />);
    expect(staged).toContain("Writes 2 staged decisions, for a person to commit.");
  });
});

describe("making one", () => {
  const pack = packDoc({ pack: "mri", version: "0.4.0", axes: [{ axis: "base", values: ["T1w"] }, { axis: "body_part", values: ["brain"] }] });

  it("starts from the source another page filled in, and lists the pack's axes", () => {
    const html = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={emptyDraft({ source: "review", from: "base:" })} pack={pack} onChange={none} />);
    expect(html).toContain('class="opt on" aria-pressed="true">Review items</button>');
    expect(html).toContain('value="base:"');
    expect(html).toContain('<option value="body_part">body_part</option>');
    expect(html).toContain("The open items of that kind, adopted as they are");
    expect(html).not.toContain("Several axes");
  });

  it("offers the axes question where the engine asks it, and a form's fields", () => {
    const caps = capsFor({ engine: { campaigns: { question_kinds: ["axis", "axes"] } } });
    expect(renderToStaticMarkup(<MakeForm caps={caps} draft={emptyDraft()} pack={pack} onChange={none} />)).toContain("Several axes");
    const f = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={{ ...emptyDraft(), kind: "form" }} pack={pack} onChange={none} />);
    expect(f).toContain('aria-label="field name"');
    expect(f).toContain("Add a field");
    expect(f).toContain("nothing: the answers are the labels");
  });
});

describe("label sets", () => {
  const sets = (labelSets as { label_sets: LabelSet[] }).label_sets;
  it("lists every set with where it came from and whether it may train", () => {
    const html = renderToStaticMarkup(<LabelSetsBody caps={capsFor()} sets={sets} why={null} since={NOW} />);
    expect(html).toContain('<a href="#campaigns/label-sets/1">probe-axis v1</a>');
    expect(html).toContain("campaign probe-axis · outcomes");
    expect(html).toContain('<span class="tag">allowed</span>');
    const sealed = renderToStaticMarkup(<LabelSetsBody caps={capsFor()} sets={[{ ...sets[0], sealed: true }]} why={null} since={NOW} />);
    expect(sealed).toContain('<span class="tag blocked">sealed</span>');
  });

  it("shows one set's digest, provenance and labels, leaving out the columns no row fills", () => {
    const s = labelSet as unknown as LabelSet;
    const html = renderToStaticMarkup(<LabelSetBody caps={capsFor()} set={s} />);
    expect(html).toContain("<h1>probe-axis v1</h1>");
    expect(html).toContain(`<dd class="mono">${s.digest}</dd>`);
    expect(html).toContain('<a href="#campaigns/1">probe-axis</a>');
    expect(html).toContain("<th>stack id</th><th>what</th><th>value</th><th>author kind</th><th>author</th><th>decision id</th><th>campaign id</th>");
    expect(html).toContain("<td>1</td><td>base</td><td>T1w</td><td>person</td><td>carol@walk</td><td>1</td><td>1</td>");
    expect(html).toContain("provenance.json");
    expect(tsvRows(s.files?.["labels.tsv"]).rows.length).toBe(1);
    const plain = renderToStaticMarkup(<LabelSetBody caps={capsFor({ detail: "plain" })} set={{ ...s, files: undefined }} />);
    expect(plain).toContain("at this detail the set shows its counts only");
    expect(plain).not.toContain("labels.tsv</h2>");
  });
});

describe("the section", () => {
  const base = ["GET /api/capabilities", "POST /api/ask/run", "GET /api/sources", "GET /api/review", "POST /api/releases", "GET /api/jobs"];
  it("sits after Review where the person holds campaigns:see and the engine serves the door", () => {
    const ids = sections(capsFor({ doors: [...base, ...DOORS], grants: ADMIN })).map((s) => s.id);
    expect(ids.indexOf("campaigns")).toBe(ids.indexOf("review") + 1);
  });

  it("is absent on an engine without the door and for a person without the grant", () => {
    expect(sections(capsFor({ doors: base, grants: ADMIN })).map((s) => s.id)).not.toContain("campaigns");
    expect(sections(capsFor({ doors: [...base, ...DOORS], grants: ["review:see"] })).map((s) => s.id)).not.toContain("campaigns");
  });
});
