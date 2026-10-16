// SPDX-License-Identifier: AGPL-3.0-only
// Each campaign page of Review as it draws from what an OpenAPI 7
// engine answered: the campaigns in the one list of work, one campaign with its closure panel, the make
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
import { WorkBody } from "../review/WorkPage";
import { closure, emptyDraft, type Answer, type Campaign, type LabelSet } from "./client";
import { LabelSetBody, LabelSetsBody, tsvRows } from "./LabelSets";
import { ratersRefusal } from "./raters";
import { MakeForm } from "./MakeCampaign";

const list = (listed as { campaigns: Campaign[] }).campaigns;
const open = openCampaign as unknown as Campaign;
const closed = closedCampaign as unknown as Campaign;
const answers = (answersOpen as { answers: Answer[] }).answers;
const none = () => undefined;
const NOW = Date.parse("2026-09-24T10:00:00Z");

describe("the list, inside Review's one list of work", () => {
  const html = renderToStaticMarkup(<WorkBody caps={capsFor({ grants: RATER, principal: "alice@walk" })} summary={null} list={list} now={NOW} onMake={none} />);

  it("lists the open campaigns under their job with their question and items by state, and keeps the closed ones apart", () => {
    expect(html).toContain("<h1>Work</h1>");
    expect(html).toContain('<a class="work-title" href="#review/campaigns/6/rate">base-check</a>');
    expect(html).toContain("campaign · base · 11 values");
    expect(html).toContain("1 to adjudicate · 2 agreed of 6");
    expect(html).toContain('<i class="s-ok" style="width:33.3%"></i>');
    // the pick campaign is a session's main scan, job type 2
    expect(html.indexOf("probe-pick")).toBeGreaterThan(html.indexOf("Pick a main scan"));
    expect(html.indexOf("probe-pick")).toBeLessThan(html.indexOf("Check a result"));
    expect(html).toContain("1 closed campaign keeps every answer");
    expect(html.indexOf("probe-axis")).toBeGreaterThan(html.indexOf("closed campaign keeps"));
  });

  it("offers Rate where the person may claim, Adjudicate only to a named adjudicator, and Make with work", () => {
    expect(html).toContain('href="#review/campaigns/6/rate"');
    expect(html).not.toContain('href="#review/campaigns/6/adjudicate"');
    expect(html).toContain("Make a campaign");
    const carol = renderToStaticMarkup(<WorkBody caps={capsFor({ principal: "carol@walk" })} summary={null} list={list} now={NOW} onMake={none} />);
    expect(carol).toContain('href="#review/campaigns/6/adjudicate"');
    expect(carol.indexOf("#review/campaigns/6/adjudicate")).toBeGreaterThan(carol.indexOf("Settle a disagreement"));
    const looker = renderToStaticMarkup(<WorkBody caps={capsFor({ grants: ["campaigns:see"] })} summary={null} list={list} now={NOW} onMake={none} />);
    expect(looker).not.toContain("/rate");
    expect(looker).not.toContain("Make a campaign");
  });

  it("says nothing waits where a job has nothing, and why a list could not be read", () => {
    expect(renderToStaticMarkup(<WorkBody caps={capsFor()} summary={null} list={[]} now={NOW} onMake={none} />)).toContain("Nothing waits.");
    expect(renderToStaticMarkup(<WorkBody caps={capsFor()} summary={null} list={null} why={["the campaigns could not be read: the engine answered 500"]} now={NOW} onMake={none} />)).toContain(
      "The campaigns could not be read: the engine answered 500",
    );
  });

  // record 55 H2, round 4: one navigation pattern, a section's pages in the side (sections.test.ts), none as chips in the page
  it("draws no tabs of Review's pages: the side carries them", () => {
    expect(html).not.toContain('class="chips pages"');
    expect(html).not.toContain('href="#review/label-sets"');
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

  // record 48, after the first gold campaign (gate T31, step 11.8): people change while a round is open
  it("offers Change beside the raters of an open campaign that names them, to its maker or a reviewer", () => {
    const named = { ...open, rater_policy: { raters: ["alice@walk", "bob@walk"], adjudicators: ["carol@walk"] } };
    const html = draw(capsFor({ grants: ADMIN }), named);
    expect(html).toContain("<dt>raters</dt><dd>alice@walk, bob@walk<button");
    expect(html).toContain('aria-label="Change the raters"');
    expect(html).toContain(">Change</button>");
    // its maker, with work on Campaigns, whatever else they hold
    expect(draw(capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "carol@walk" }), named)).toContain('aria-label="Change the raters"');
    // a reviewer who did not make it
    expect(draw(capsFor({ grants: ADMIN, principal: "dave@walk" }), named)).toContain('aria-label="Change the raters"');
  });

  it("offers no Change where the engine would refuse it, and says why in words", () => {
    const named = { ...open, rater_policy: { raters: ["alice@walk"], adjudicators: [] } };
    const no = (html: string) => expect(html).not.toContain("Change the raters");
    // it names no raters: anyone with work on Campaigns rates it, and naming one would shut out the rest
    no(draw(capsFor({ grants: ADMIN }), open));
    expect(ratersRefusal(capsFor({ grants: ADMIN }), open)).toBe("It names no raters, so anyone with work on Campaigns rates it.");
    // not open
    no(draw(capsFor({ grants: ADMIN }), { ...named, status: "closed" }));
    expect(ratersRefusal(capsFor({ grants: ADMIN }), { ...named, status: "closed" })).toBe("The campaign is closed.");
    // a rater who is neither its maker nor a reviewer, and one who only looks
    no(draw(capsFor({ grants: ["campaigns:see", "campaigns:work", "data:see"], principal: "alice@walk" }), named));
    expect(ratersRefusal(capsFor({ grants: ["campaigns:see", "campaigns:work"], principal: "alice@walk" }), named)).toBe("A campaign's raters are its maker's to change, or work on the Review page's.");
    no(draw(capsFor({ grants: ["campaigns:see", "review:work"] }), named));
    expect(ratersRefusal(capsFor({ grants: ["campaigns:see", "review:work"] }), named)).toBe("Changing raters needs work on the Campaigns page.");
    // an engine from before the door
    const old = capsFor({ grants: ADMIN, doors: DOORS.filter((d) => !d.endsWith("/raters")) });
    no(draw(old, named));
    expect(ratersRefusal(old, named)).toBe("This engine has no door for changing raters.");
  });

  it("names raters just added who already read these stacks elsewhere, in the engine's words", () => {
    const warned = [{ principal: "bob@walk", stacks: 12, campaigns: [{ campaign: "earlier-read", stacks: 12 }], why: "bob@walk already answered 12 of the stacks campaign base-check asks, in other campaigns" }];
    const html = renderToStaticMarkup(<CampaignBody caps={capsFor({ grants: ADMIN })} campaign={open} answers={answers} sets={[]} said="Bob added." warned={warned} onAct={none} />);
    expect(html).toContain('<p class="warn">bob@walk already answered 12 of the stacks campaign base-check asks, in other campaigns</p>');
    expect(draw()).not.toContain('class="warn">bob@walk');
  });

  it("says what the raters are shown beside each item: what the campaign was made with, the rules for an engine that does not say", () => {
    expect(draw()).toContain("<dt>suggests</dt><dd>the rules&#x27; answer · ");
    const unled = draw(capsFor({ grants: ADMIN }), { ...open, suggest: "none" });
    expect(unled).toContain("<dt>suggests</dt><dd>nothing · Raters read every item unled");
    expect(draw(capsFor({ grants: ADMIN }), { ...open, suggest: "imported" })).toContain("<dt>suggests</dt><dd>imported suggestions · ");
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
    expect(rater).toContain('href="#review/campaigns/6/rate"');
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
    expect(html).toContain('<a href="#review/label-sets/1">probe-axis v1</a>');
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
    // prepared on first opening: no command to copy (Wave 7a)
    expect(html).toContain("Each is prepared when it is first opened.");
    expect(html).not.toContain("pyramid build");
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

describe("a check whose close refused an item", () => {
  const why = "the outcome of item 1 (result 1) cannot be read, so nothing is written for it: form.parts is a list";
  const base = closed.items![0];
  const check: Campaign = {
    ...closed,
    name: "SYNTHSEG structures, run 1",
    question: { kind: "check", part_set: "structures", grain: "result", reasons: [{ id: "boundary_off", words: "Boundary off", needs: "none" }] } as unknown as Campaign["question"],
    closes_into: "check",
    close_again: true,
    counts: { ...closed.counts, items: { refused: 1, resolved: 1 } },
    items: [
      { ...base, id: 1, position: 0, stack_id: null, state: "refused", outcome: { value: "accepted", form: { reasons: [], parts: "x" } }, decision_id: null, resolved_at: null, derivative_id: 1, part_set: "structures", part_label: null, refused: { why, at: "2026-10-12T02:47:16Z" } },
      { ...base, id: 2, position: 1, stack_id: null, state: "resolved", outcome: { value: "rejected", form: { reasons: [] }, decisions: { result: 1 } }, decision_id: 1, derivative_id: 4, part_set: "structures", part_label: null, refused: null },
    ],
  };
  const draw = (c: Campaign, caps = capsFor({ grants: ADMIN })) => renderToStaticMarkup(<CampaignBody caps={caps} campaign={c} answers={[]} sets={[]} onAct={none} />);

  it("shows the refused item as refused with the engine's reason, never as agreed and accepted", () => {
    const html = draw(check);
    expect(html).toContain('<span class="tag caution">refused</span>');
    expect(html).toContain(`Not written: ${why}`);
    expect(html).not.toContain(">agreed</span>");
    expect(html).not.toMatch(/<td>accepted/u);
    expect(html).toContain("refused <b>1</b>");
    expect(html).toContain("1 refused · 1 resolved of 2");
    expect(html).toContain("1 item was refused at the close; nothing was written for it, and the row says why. Close again once the reason is gone.");
  });

  it("offers Close again where the engine says the check may be closed again, and only then", () => {
    expect(draw(check)).toContain(">Close again</button>");
    const done = draw({ ...check, close_again: false });
    expect(done).not.toContain(">Close again</button>");
    expect(done).not.toContain("Close again once");
    expect(draw(check, capsFor({ grants: ["campaigns:see", "campaigns:work"] }))).not.toContain(">Close again</button>");
    // a later close tries the refused item again, and counts the one resolved before
    const plan = closure(check);
    expect([plan.writes.n, plan.already, plan.unresolvedTotal]).toEqual([1, 1, 0]);
    const html = renderToStaticMarkup(<ClosurePanel campaign={check} plan={plan} />);
    expect(html).toContain("Writes 1 result&#x27;s check, with its parts&#x27;.");
    expect(html).toContain("named as refused, with why");
    // a check's items no one settled are asked again by a later check, never left in the queue
    const unread = { ...check, items: [...check.items!, { ...base, id: 3, position: 2, state: "open", outcome: null, decision_id: null }] };
    expect(renderToStaticMarkup(<ClosurePanel campaign={unread} plan={closure(unread)} />)).toContain("Leaves 1 unresolved: 1 open. Their questions close with it; a later check asks them again.");
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

  it("asks what the raters are shown, nothing unless chosen, for an axis question and not a form", () => {
    const html = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={emptyDraft()} pack={pack} onChange={none} />);
    expect(html).toContain("Shown beside each item");
    expect(html).toContain('class="opt on" aria-pressed="true">nothing</button>');
    expect(html).toContain("Raters read every item unled");
    const form = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={{ ...emptyDraft(), kind: "form" }} pack={pack} onChange={none} />);
    expect(form).not.toContain("Shown beside each item");
  });

  // record 51 R4 and R8: the maker says who rates an unnamed campaign, and offers the served pack's roles
  it("says an unnamed campaign is rated by reviewers, and offers a pick the pack's roles", () => {
    const html = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={emptyDraft()} pack={pack} onChange={none} />);
    expect(html).toContain("No raters named, so only reviewers (work on the Review page) and you rate it");
    expect(html).not.toContain("anyone with work");
    const roles = packDoc({ pack: "mri", version: "0.16.0", axes: [], picks: [{ name: "main", roles: ["t1w", "flair", "t2w"] }] });
    const pick = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={{ ...emptyDraft(), kind: "pick", role: "t2w" }} pack={roles} onChange={none} />);
    expect(pick).toContain('class="opt on" aria-pressed="true">t2w</button>');
    expect(pick).toContain(">flair</button>");
    expect(pick).toContain("The roles the pack&#x27;s picks declare.");
    // an engine that serves no picks leaves the role to be typed
    const typed = renderToStaticMarkup(<MakeForm caps={capsFor()} draft={{ ...emptyDraft(), kind: "pick" }} pack={pack} onChange={none} />);
    expect(typed).toContain('placeholder="t1w"');
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
    expect(html).toContain('<a href="#review/label-sets/1">probe-axis v1</a>');
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
    expect(html).toContain('<a href="#review/campaigns/1">probe-axis</a>');
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
  const pages = (caps: ReturnType<typeof capsFor>) => sections(caps).find((s) => s.id === "review")?.pages?.map((p) => p.title) ?? null;
  it("is Review: one section whose list holds the campaigns, with no Campaigns of its own (record 55 H3)", () => {
    const ids = sections(capsFor({ doors: [...base, ...DOORS], grants: ADMIN })).map((s) => s.id);
    expect(ids).toContain("review");
    expect(ids).not.toContain("campaigns");
    expect(pages(capsFor({ doors: [...base, ...DOORS], grants: ADMIN }))).toEqual(["Work", "Main scans", "Subjects", "Rules", "Label sets"]);
  });

  it("opens for a rater who holds only campaigns:*, with their list and the label sets, and no queue, rules or subjects", () => {
    const rater = capsFor({ doors: [...base, ...DOORS], grants: ["campaigns:see", "campaigns:work"] });
    expect(sections(rater).map((s) => s.id)).toContain("review");
    expect(pages(rater)).toEqual(["Work", "Label sets"]);
  });

  it("is absent where the person reads neither the queue nor a campaign, or the engine serves neither door", () => {
    expect(sections(capsFor({ doors: [...base, ...DOORS], grants: ["data:see"] })).map((s) => s.id)).not.toContain("review");
    expect(sections(capsFor({ doors: base.filter((d) => d !== "GET /api/review"), grants: ADMIN })).map((s) => s.id)).not.toContain("review");
  });
});
