// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's upkeep on its page (2026-11-05, a campaign of 4,838 items read
// alone): the close followed as a job until the page stands closed, each open
// item's lease in words with Release where the person may give it back, one
// line for each way of reading the page does not offer and why, and the items
// read one by one, counted, with "Read all in batches" where the campaign
// allows it. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, engine, settle } from "../../test/safeWayIn";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import { ADMIN, DOORS, RATER, capsFor } from "./caps.fixture";
import { CampaignBody, CloseDialog } from "./CampaignPage";
import { closure, type Assignment, type Campaign, type Item } from "./client";
import { AskOneDialog } from "./AskOneDialog";
import { aloneWords, askOnePlan, askOneRefused, askOneSaid, closeStage, closingWords, leaseLine, mayAskOneAxis, mayReadAllInBatches, missingModes, REQUESTION, type CloseJob } from "./upkeep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse("2026-11-05T20:00:00Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const base = openCampaign as unknown as Campaign;
const item = (id: number, over: Partial<Item> = {}): Item => ({ ...(base.items![0] as Item), id, position: id, state: "open", outcome: null, agreement: null, ...over });
const lease = (id: number, itemId: number, principal: string, state: string, until: string): Assignment => ({ id, item_id: itemId, principal, role: "rater", round: 1, state, created_at: at(-30), leased_at: at(-30), lease_until: until, ended_at: state === "leased" ? null : until });
const campaign = (over: Partial<Campaign> = {}): Campaign => ({ ...base, owner: "carol@walk", rater_policy: { raters: ["rune@walk"], adjudicators: [] }, items: [], assignments: [], ...over });
const DOORS_NOW = [...DOORS, "GET /api/campaigns/{id}/gallery", "POST /api/campaigns/{id}/gallery/accept", "GET /api/campaigns/{id}/batches", "POST /api/campaigns/{id}/hold-back"];
const owner = capsFor({ grants: ADMIN, principal: "carol@walk", doors: DOORS_NOW });
const rater = capsFor({ grants: RATER.filter((g) => g !== "review:work"), principal: "rune@walk", doors: DOORS_NOW });
const job = (over: Partial<CloseJob> = {}): CloseJob => ({ id: 41, state: "running", running: true, by: "carol@walk", started_at: at(-1), finished_at: null, result: null, error: null, ...over });

describe("the close as it runs", () => {
  it("is running, stopped part way, or none", () => {
    expect(closeStage({ status: "open", close_job: null })).toBe("none");
    expect(closeStage({ status: "closing", close_job: job() })).toBe("running");
    expect(closeStage({ status: "closing", close_job: job({ running: false, state: "failed" }) })).toBe("stopped");
    // an engine before the close job: a campaign seen closing is closing now
    expect(closeStage({ status: "closing" })).toBe("running");
  });
  it("says how far it is from the items' states", () => {
    const c = campaign({ status: "closing", counts: { items: { resolved: 1200, refused: 3, agreed: 3635 }, assignments: {}, answers: 4838 } });
    expect(closingWords(c)).toBe("1,203 written, 3,635 to go.");
  });
});

describe("an open item's lease", () => {
  it("names who holds it until when, with Release for the maker", () => {
    const c = campaign({ items: [item(1)], assignments: [lease(9, 1, "rune@walk", "leased", at(10))] });
    const l = leaseLine(owner, c, c.items![0], NOW)!;
    expect(l.words).toMatch(/^with rune until \d\d:\d\d$/);
    expect(l.release?.id).toBe(9);
    // a rater sees no Release on another's lease
    const other = leaseLine(capsFor({ grants: RATER.filter((g) => g !== "review:work"), principal: "eve@walk", doors: DOORS_NOW }), c, c.items![0], NOW)!;
    expect(other.release).toBeNull();
  });
  it("says a lease that ran out needs no release, and whose the item is now", () => {
    const sole = campaign({ items: [item(1)], assignments: [lease(9, 1, "rune@walk", "expired", at(-5))] });
    expect(leaseLine(owner, sole, sole.items![0], NOW)).toEqual({ words: "lease ran out; free again for rune, no release needed", release: null });
    // still written leased, but past its time: the same
    const late = campaign({ items: [item(1)], assignments: [lease(9, 1, "rune@walk", "leased", at(-5))] });
    expect(leaseLine(owner, late, late.items![0], NOW)?.release).toBeNull();
    // two named raters who each held it once: none is served it
    const study = campaign({ raters_per_item: 1, rater_policy: { raters: ["ann@walk", "bo@walk"], adjudicators: [] }, items: [item(1)], assignments: [lease(9, 1, "ann@walk", "expired", at(-50)), lease(10, 1, "bo@walk", "released", at(-5))] });
    expect(leaseLine(owner, study, study.items![0], NOW)?.words).toContain("every named rater held it once");
  });
  it("says an item set aside is read one by one, and nothing of an item no one holds", () => {
    const c = campaign({ items: [item(1, { held_back: true }), item(2)] });
    expect(leaseLine(owner, c, c.items![0], NOW)?.words).toBe("read one by one, never in a batch or the gallery");
    expect(leaseLine(owner, c, c.items![1], NOW)).toBeNull();
  });
  it("shows on the items table with Release, which gives the lease back", () => {
    const c = campaign({ items: [item(1)], assignments: [lease(9, 1, "rune@walk", "leased", new Date(Date.now() + 600_000).toISOString())] });
    const onRelease = vi.fn();
    const html = renderToStaticMarkup(<CampaignBody caps={owner} campaign={c} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} onRelease={onRelease} />);
    expect(html).toContain("with rune until");
    expect(html).toContain(">Release</button>");
  });
});

describe("the ways of reading not offered", () => {
  const axes = (over: Partial<Campaign> = {}) => campaign({ question: { kind: "axes", axes: ["body_part", "body_region"] }, suggest: "rules", ...over });
  it("says why there is no gallery and what brings it", () => {
    expect(missingModes(owner, axes())).toEqual(["No gallery: it shows one axis at a time, and this campaign asks 2 (body_part, body_region). Asking one axis, the others derived from it, brings it."]);
    expect(missingModes(owner, axes({ question: { kind: "axes", axes: ["body_part"] } }))).toEqual([]);
  });
  it("says why there are no batches", () => {
    expect(missingModes(owner, axes({ question: { kind: "axis", axis: "body_part" }, suggest: "none" }))).toEqual(["No batches: a batch groups stacks by the rules' answer, and this campaign shows no suggestion, as it was made."]);
  });
  it("says a study is read before its suggestion shows, and a verify campaign one stack per screen", () => {
    expect(missingModes(owner, axes({ purpose: "train" }))[0]).toContain("each item is answered before its suggestion shows");
    expect(missingModes(owner, axes({ purpose: "verify" }))).toHaveLength(1);
  });
  it("draws the line on the campaign's page", () => {
    const c = axes({ counts: { items: { open: 2 }, assignments: {}, answers: 0 } });
    const html = renderToStaticMarkup(<CampaignBody caps={owner} campaign={c} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} />);
    expect(html).toContain("No gallery: it shows one axis at a time");
  });
});

describe("asking one axis, which brings the gallery", () => {
  const two = (over: Partial<Campaign> = {}) => campaign({ question: { kind: "axes", axes: ["body_part", "body_region"] }, suggest: "rules", counts: { items: { open: 2 }, assignments: {}, answers: 3 }, ...over });
  const asks = capsFor({ grants: ADMIN, principal: "carol@walk", doors: [...DOORS_NOW, REQUESTION] });
  const plan = { campaign: base.id, name: base.name, asked_before: ["body_part", "body_region", "technique"], asked: ["body_part"], derive: ["body_region"], answers_kept: 1204, answers_derived: 0, dry_run: true };
  it("is the maker's or a Review worker's, on an open campaign asking two axes or more, where the engine has the door", () => {
    expect(mayAskOneAxis(asks, two())).toBe(true);
    expect(mayAskOneAxis(owner, two())).toBe(false);
    expect(mayAskOneAxis(capsFor({ grants: RATER.filter((g) => g !== "review:work"), principal: "rune@walk", doors: [...DOORS_NOW, REQUESTION] }), two())).toBe(false);
    expect(mayAskOneAxis(asks, two({ status: "closed" }))).toBe(false);
    expect(mayAskOneAxis(asks, two({ question: { kind: "axes", axes: ["body_part", "body_region"], derive: ["body_region"] } }))).toBe(false);
  });
  it("puts the button on the No gallery line, named for the first axis", () => {
    const html = renderToStaticMarkup(<CampaignBody caps={asks} campaign={two()} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} onAskOne={() => undefined} />);
    expect(html).toMatch(/No gallery: it shows one axis at a time[^<]*<button[^>]*>Ask body_part alone<\/button>/);
    const without = renderToStaticMarkup(<CampaignBody caps={owner} campaign={two()} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} onAskOne={() => undefined} />);
    expect(without).not.toContain("alone</button>");
  });
  it("says what changes: asked, derived, no longer asked, and the answers kept", () => {
    expect(askOnePlan(plan)).toEqual([
      { k: "Asked", v: "body_part" },
      { k: "Derived from it", v: "body_region" },
      { k: "Not asked any more", v: "technique" },
      { k: "Answers given", v: "1,204 kept, read on body_part" },
    ]);
    expect(askOnePlan({ ...plan, asked_before: ["body_part", "body_region"], derive: [], answers_kept: 0 })).toEqual([
      { k: "Asked", v: "body_part" },
      { k: "Not asked any more", v: "body_region" },
      { k: "Answers given", v: "none yet" },
    ]);
    expect(askOneSaid({ ...plan, dry_run: false, answers_derived: 1204 })).toBe("Asks body_part alone now; body_region derived from it. 1,204 answers kept.");
  });
  it("says a leased item holds it back in the page's words", () => {
    expect(askOneRefused("2 item(s) of body-part-curation are leased under the question as it stands; wait for them to be answered or released (nils campaign release <assignment>)")).toBe("2 items are being read now. Ask again once they are answered or given back.");
    expect(askOneRefused("campaign x is closed")).toBe("Refused: campaign x is closed.");
  });
});

describe("the ask-one confirm", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    dialogs();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const c = campaign({ question: { kind: "axes", axes: ["body_part", "body_region"] } });
  const answer = (axes: string[], dry: boolean) => ({ campaign: c.id, name: c.name, asked_before: ["body_part", "body_region"], asked: axes, derive: axes[0] === "body_part" ? ["body_region"] : [], answers_kept: 3, answers_derived: dry ? 0 : 3, dry_run: dry });

  it("reads the dry run first, moves only on the press, and says what it did", async () => {
    const door = engine((call) => {
      if (call.method !== "POST" || call.url !== `/api/campaigns/${c.id}/requestion`) return undefined;
      const body = call.body as { axes: string[]; dry_run?: boolean };
      return { status: 200, body: answer(body.axes, body.dry_run === true) };
    });
    const onDone = vi.fn();
    act(() => root.render(<AskOneDialog campaign={c} onClose={() => undefined} onDone={onDone} />));
    await settle();
    expect(door.of("POST", `/api/campaigns/${c.id}/requestion`).map((x) => x.body)).toEqual([{ axes: ["body_part"], dry_run: true }]);
    expect(host.textContent).toContain("Derived from itbody_region");
    expect(host.textContent).toContain("Answers given3 kept, read on body_part");
    // another axis is read again before anything moves
    act(() => button(host, "body_region")!.click());
    await settle();
    expect(door.of("POST", `/api/campaigns/${c.id}/requestion`).at(-1)!.body).toEqual({ axes: ["body_region"], dry_run: true });
    act(() => button(host, "body_part")!.click());
    await settle();
    act(() => button(host, "Ask body_part alone")!.click());
    await settle();
    expect(door.of("POST", `/api/campaigns/${c.id}/requestion`).at(-1)!.body).toEqual({ axes: ["body_part"] });
    expect(onDone).toHaveBeenCalledWith("Asks body_part alone now; body_region derived from it. 3 answers kept.");
  });

  it("offers no press while an item is leased, and says so", async () => {
    engine((call) => (call.method === "POST" ? { status: 409, body: { error: "1 item(s) of base-check are leased under the question as it stands; wait for them to be answered or released (nils campaign release <assignment>)" } } : undefined));
    act(() => root.render(<AskOneDialog campaign={c} onClose={() => undefined} onDone={() => undefined} />));
    await settle();
    expect(host.textContent).toContain("1 item is being read now. Ask again once it is answered or given back.");
    expect((button(host, "Ask body_part alone") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the items read one by one", () => {
  const c = campaign({ hold_back: 0.1, hold_back_none: true, items: [item(1, { held_back: true }), item(2, { held_back: true }), item(3, { held_back: true, state: "agreed" }), item(4)] });
  it("counts the open ones and says why in plain words", () => {
    expect(aloneWords(c)).toBe("2 open items are read one by one: the campaign sets aside 10 % of every batch and gallery page, at random, to check how often a page accepted at once is right.");
    expect(aloneWords(campaign({ items: [item(4)] }))).toBeNull();
  });
  it("offers the maker every item in batches where the campaign allows none set aside", () => {
    expect(mayReadAllInBatches(owner, c)).toBe(true);
    expect(mayReadAllInBatches(rater, c)).toBe(false);
    expect(mayReadAllInBatches(owner, { ...c, hold_back_none: false })).toBe(false);
    const html = renderToStaticMarkup(<CampaignBody caps={owner} campaign={c} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} onReadAll={() => undefined} />);
    expect(html).toContain("Read all in batches");
    expect(html).not.toMatch(/held back/i);
  });
});

describe("the close dialog", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    dialogs();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("follows the close's job, then says what it wrote and refused, and the page reads again", async () => {
    const c = campaign({ items: [item(1, { state: "agreed" }), item(2, { state: "agreed" }), item(3, { state: "agreed" })] });
    const closing = { ...c, status: "closing", close_job: job(), counts: { items: { resolved: 1, agreed: 2 }, assignments: {}, answers: 3 } };
    const closed = { ...c, status: "closed", close_job: job({ state: "done", running: false, finished_at: at(0), result: { decisions: [11, 12], picks: [], resolved: 2, unresolved: 0, refused: [{ item: 3, why: "a decision of a higher rank holds" }], staged: false, agreement: null } }) };
    const door = engine((call, nth) => {
      if (call.method === "POST" && call.url === `/api/campaigns/${c.id}/close`) return { status: 202, body: { job: 41, campaign: c.id, state: "running" } };
      if (call.method === "GET" && call.url === `/api/campaigns/${c.id}`) return { status: 200, body: nth === 1 ? closing : closed };
      return undefined;
    });
    const onClosed = vi.fn();
    const onDone = vi.fn();
    act(() => root.render(<CloseDialog campaign={c} plan={closure(c)} onClose={() => undefined} onDone={onDone} onClosed={onClosed} every={5} />));
    act(() => button(host, "Close the campaign")!.click());
    await settle();
    expect(door.of("POST", `/api/campaigns/${c.id}/close`)[0].body).toEqual({ background: true });
    // no second close while it runs
    expect(button(host, "Close the campaign")).toBeNull();
    for (let i = 0; i < 20 && !host.textContent?.includes("Closed:"); i++) await settle(2);
    expect(host.textContent).toContain("Closed: 2 decisions, 0 unresolved; 1 refused: a decision of a higher rank holds.");
    expect(host.textContent).toContain("Item 3: a decision of a higher rank holds");
    expect(onClosed).toHaveBeenCalled();
    act(() => button(host, "Done")!.click());
    expect(onDone).toHaveBeenCalledWith(expect.stringContaining("Closed: 2 decisions"));
  });

  it("says why when the close is refused", async () => {
    const c = campaign();
    engine((call) => (call.method === "POST" ? { status: 409, body: { error: "campaign base-check is closing now (job 40); it closes by itself, so wait for it" } } : undefined));
    act(() => root.render(<CloseDialog campaign={c} plan={closure(c)} onClose={() => undefined} onDone={() => undefined} />));
    act(() => button(host, "Close the campaign")!.click());
    await settle();
    expect(host.textContent).toContain("Refused: campaign base-check is closing now (job 40); it closes by itself, so wait for it.");
  });

  it("takes an engine's answer that closed in one call", async () => {
    const c = campaign();
    engine((call) => (call.method === "POST" ? { status: 200, body: { decisions: [1], picks: [], resolved: 1, unresolved: 0, refused: [], staged: false, agreement: null } } : undefined));
    act(() => root.render(<CloseDialog campaign={c} plan={closure(c)} onClose={() => undefined} onDone={() => undefined} />));
    act(() => button(host, "Close the campaign")!.click());
    await settle();
    expect(host.textContent).toContain("Closed: 1 decision, 0 unresolved.");
  });

  it("shows a running close on the page and offers no second close", () => {
    const c = campaign({ status: "closing", close_job: job(), counts: { items: { resolved: 10, agreed: 5 }, assignments: {}, answers: 15 } });
    const html = renderToStaticMarkup(<CampaignBody caps={owner} campaign={c} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} />);
    expect(html).toContain("Closing (started by carol): 10 written, 5 to go.");
    expect(html).not.toContain(">Close</button>");
    expect(html).not.toContain("Run the close again");
    const stopped = renderToStaticMarkup(<CampaignBody caps={owner} campaign={{ ...c, close_job: job({ running: false, state: "failed", error: "the engine restarted" }) }} answers={[]} answersBlind={false} sets={[]} onAct={() => undefined} />);
    expect(stopped).toContain("The close stopped part way: the engine restarted.");
    expect(stopped).toContain("Run the close again");
  });
});
