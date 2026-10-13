// SPDX-License-Identifier: AGPL-3.0-only
// T32's proof, headless (record 55 H3; spec 13.2 and 17): against a live
// engine over a lab registry, through the desk's own client and the pages'
// own logic, and nothing else (no database read or written but through the
// engine's doors): Review's one list of work built from the summary and the
// campaigns; a body-part curation round and a per-axis review each made from
// the make dialog's body, rated by two people with the reader's keys, one
// disagreement adjudicated, closed into decisions that the explain door then
// reads; the three kinds the make door draws (pair, anchored, A/B) made and
// read by their readers' doors; Browse's doors over the registry and the
// cohort's picks for the heatmap. Skipped unless an engine is named:
//
//   T32_ENGINE=http://127.0.0.1:18471 \
//   T32_TOKENS=alice@lab=<token>,bob@lab=<token>,carol@lab=<token> \
//   npx vitest run src/review/t32.live.test.ts
//
// alice and bob hold campaigns:see and campaigns:work only (raters); carol
// makes, adjudicates and closes (every grant). It writes selections,
// campaigns and decisions into that registry, so it runs against a
// throwaway one (nils synth), never an install's.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { door } from "../ask/client";
import type { Capabilities, EngineCapabilities } from "../capabilities";
import { campaigns, emptyDraft, keyOf, makeBody, type Campaign, type Draft } from "../campaigns/client";
import { blank } from "../campaigns/renderers";
import { bodyOf, given, keyAct, rowsOf, seatOf, type Seat } from "../campaigns/workspace";
import { REGISTRY, viewerDoors } from "../data/viewer";
import { picksDoors } from "../data/picksHeat";
import { review, type ReviewSummary } from "./client";
import { heldCount, workList } from "./work";

const ENGINE = process.env.T32_ENGINE ?? "";
const PEOPLE = (process.env.T32_TOKENS ?? "")
  .split(",")
  .filter(Boolean)
  .map((p) => {
    const [who, token] = p.split("=");
    return { who, token };
  });
const [ALICE, BOB, CAROL] = PEOPLE;
const STAMP = Date.now().toString(36);
const say = (line: string) => console.log(`t32: ${line}`);

let acting = CAROL;
const realFetch = globalThis.fetch;
function as<T>(person: typeof CAROL, f: () => Promise<T>): Promise<T> {
  acting = person;
  return f();
}
const capsOf = (engine: EngineCapabilities, who: string) =>
  ({ engine, kvasir: null, assistant: null, apps: [], person: { subject: who, display_name: "", grants: engine.grants ?? [], detail: engine.detail ?? "plain", groups: [] }, desk: { mode: "local" } }) as unknown as Capabilities;

/** A selection saved as Query saves one: every stack whose id is in the list, frozen by the campaign. */
async function selection(name: string, where: unknown[]): Promise<string> {
  const saved = await as(CAROL, () => door<{ version: number }>("PUT", `/api/ask/selections/${name}`, { document: { ast_version: 1, sets: { every: { grain: "stack", where } }, out: { set: "every", level: "record" } } }));
  return `${name}@${saved.version}`;
}

/** One rater's pass through the reader of a one-axis campaign: claim, the value's key, answer, until nothing is left. */
async function rate(person: typeof ALICE, c: Campaign, valueFor: (stack: number) => string): Promise<number> {
  const q = c.question;
  const rows = rowsOf(q, null);
  let seat: Seat = seatOf(await as(person, () => campaigns.claim(c.id)));
  let n = 0;
  while (seat.kind === "holding") {
    const value = valueFor(seat.item.stack_id ?? 0);
    const key = keyOf(0, rows[0].values.indexOf(value));
    expect(key).not.toBeNull();
    const act = keyAct(key ?? "", { ctrl: false, inField: false, q, rows });
    expect(act?.kind).toBe("choose");
    const g = act?.kind === "choose" ? given(q, blank(q), act.row, act.value) : blank(q);
    const body = bodyOf(q, g);
    expect(body.ok).toBe(true);
    if (!body.ok) break;
    const holding = seat;
    await as(person, () => campaigns.answer(c.id, holding.assignment.id, body.body));
    n++;
    seat = seatOf(await as(person, () => campaigns.claim(c.id)));
  }
  return n;
}

/** Two raters, one disagreement, the adjudicator settles it, the close writes one decision per item: what the explain door then reads. */
async function round(c: Campaign, value: string, other: string): Promise<{ decisions: number; stacks: number[] }> {
  const items = c.items ?? [];
  const odd = items[items.length - 1].stack_id;
  const a = await rate(ALICE, c, () => value);
  const b = await rate(BOB, c, (stack) => (stack === odd ? other : value));
  expect([a, b]).toEqual([items.length, items.length]);
  const adj = seatOf(await as(CAROL, () => campaigns.claim(c.id, "adjudicator")));
  expect(adj.kind).toBe("holding");
  if (adj.kind === "holding") {
    expect(adj.item.stack_id).toBe(odd);
    const settle = bodyOf(c.question, { kind: "value", value }, "T32's adjudicator");
    if (settle.ok) await as(CAROL, () => campaigns.answer(c.id, adj.assignment.id, settle.body));
  }
  const closed = await as(CAROL, () => campaigns.close(c.id));
  const after = await as(CAROL, () => campaigns.one(c.id));
  expect(after.status).toBe("closed");
  say(`${c.name}: ${items.length} items, alice ${a}, bob ${b}, 1 adjudicated, closed into ${closed.decisions.length} decisions, ${closed.unresolved} unresolved`);
  return { decisions: closed.decisions.length, stacks: items.map((i) => i.stack_id ?? 0) };
}

describe.skipIf(!ENGINE || PEOPLE.length < 3)("T32 on a live engine over a lab registry", () => {
  let caps: Capabilities;
  let stacks: number[] = [];
  beforeAll(async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(`${ENGINE}${String(input)}`, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${acting.token}` } })) as typeof fetch;
    const engine = await as(CAROL, () => door<EngineCapabilities>("GET", "/api/capabilities"));
    caps = capsOf(engine, CAROL.who);
    say(`engine ${engine.engine.version}, epoch ${engine.registry.epoch}`);
    // the stacks the rounds read: the registry's first sixty, read through Browse's doors
    const page = await as(CAROL, () => viewerDoors.tree(REGISTRY));
    stacks = page.scans.map((s) => s.id).slice(0, 60);
    say(`Browse: ${page.total} scans in the registry, ${page.scans.length} on the first page`);
    expect(stacks.length).toBeGreaterThan(20);
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("a body-part curation round, made, rated, adjudicated and closed in the desk", { timeout: 180_000 }, async () => {
    const sel = await selection(`t32-bodypart-${STAMP}`, [["in", {}, ["field", {}, "id"], stacks.slice(0, 8)]]);
    const draft: Draft = { ...emptyDraft({ source: "selection", from: sel }), name: `t32-body-part-${STAMP}`, axis: "body_part", values: "brain, spine, neck, brain-neck", raters: `${ALICE.who}, ${BOB.who}`, adjudicators: CAROL.who, closesInto: "decision" };
    const made = makeBody(draft);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const c = await as(CAROL, () => campaigns.make(made.body));
    expect(c.items?.length).toBe(8);
    const r = await round(c, "brain", "spine");
    expect(r.decisions).toBe(8);
    // the decisions are what the sort now says of each stack, read through the explain door
    const why = await as(CAROL, () => door<{ axes: { axis: string; value: string | null; decision?: { actor?: string } | null }[] }>("GET", `/api/explain/${r.stacks[0]}`));
    const bp = why.axes.find((a) => a.axis === "body_part");
    say(`explain ${r.stacks[0]}: body_part ${bp?.value}, decided by ${bp?.decision?.actor ?? "?"}`);
    expect(bp?.value).toBe("brain");
  });

  it("a per-axis review: the open questions of one axis asked of two raters and closed into decisions", { timeout: 180_000 }, async () => {
    const before = (await as(CAROL, () => review.summary())) as ReviewSummary;
    const axes = Object.entries(before.by_kind).filter(([k, n]) => /^[a-z_]+:[a-z_]+$/u.test(k) && !k.endsWith(":model") && n > 0);
    say(`summary before: ${JSON.stringify(before.by_kind)}`);
    // the axis with the most open questions, or a per-axis round over a selection where the lab has none
    const top = axes.sort((a, b) => b[1] - a[1])[0];
    let draft: Draft;
    if (top) {
      const axis = top[0].split(":")[0];
      draft = { ...emptyDraft({ source: "review", from: `${axis}:`, limit: 6 }), name: `t32-axis-${axis}-${STAMP}`, axis, raters: `${ALICE.who}, ${BOB.who}`, adjudicators: CAROL.who, closesInto: "decision" };
    } else {
      const sel = await selection(`t32-axis-${STAMP}`, [["in", {}, ["field", {}, "id"], stacks.slice(10, 16)]]);
      draft = { ...emptyDraft({ source: "selection", from: sel }), name: `t32-axis-base-${STAMP}`, axis: "base", raters: `${ALICE.who}, ${BOB.who}`, adjudicators: CAROL.who, closesInto: "decision" };
    }
    const made = makeBody(draft);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const c = await as(CAROL, () => campaigns.make(made.body));
    const values = rowsOf(c.question, null)[0].values;
    say(`${c.name}: ${c.items?.length} items from ${JSON.stringify(c.source)}, values ${values.slice(0, 6).join(", ")}`);
    // while it is open, Review's one list says its questions are held by a campaign
    const held = (await as(CAROL, () => review.summary())) as ReviewSummary;
    if (top) expect(heldCount(held)).toBeGreaterThan(0);
    const r = await round(c, values[0], values[1]);
    expect(r.decisions).toBe(c.items?.length);
  });

  it("the three kinds the make door draws: pair, anchored and A/B, each read by its reader's door", { timeout: 180_000 }, async () => {
    const drawn = (caps.engine as { campaigns?: { draws?: string[] } }).campaigns?.draws ?? [];
    expect(drawn).toEqual(expect.arrayContaining(["pair", "anchored", "ab"]));
    const a = await selection(`t32-pairs-${STAMP}`, [["in", {}, ["field", {}, "id"], stacks.slice(0, 30)]]);
    const pair = makeBody({ ...emptyDraft(), name: `t32-pair-${STAMP}`, kind: "pair", from: a, seed: `t32-${STAMP}`, raters: ALICE.who });
    expect(pair.ok).toBe(true);
    if (!pair.ok) return;
    const preview = await as(CAROL, () => campaigns.preview(pair.body));
    say(`pair preview: ${JSON.stringify(preview.counts)}`);
    const p = await as(CAROL, () => campaigns.make(pair.body));
    const pi = await as(CAROL, () => campaigns.one(p.id));
    const sheet = await as(ALICE, () => door<Record<string, unknown>>("GET", `/api/campaigns/${p.id}/items/${pi.items![0].id}/pair`));
    say(`pair ${p.name}: ${pi.items?.length} items; an item's sheet has ${Object.keys(sheet).join(", ")}`);

    const anchored = makeBody({ ...emptyDraft(), name: `t32-anchored-${STAMP}`, kind: "anchored", from: a, pre: a, post: a, seed: `t32-${STAMP}`, raters: ALICE.who });
    expect(anchored.ok).toBe(true);
    if (anchored.ok) {
      const an = await as(CAROL, () => campaigns.make(anchored.body)).catch((e: Error) => {
        say(`anchored refused: ${e.message}`);
        return null;
      });
      if (an) say(`anchored ${an.name}: ${(await as(CAROL, () => campaigns.one(an.id))).items?.length} items`);
    }

    const ab = makeBody({ ...emptyDraft(), name: `t32-ab-${STAMP}`, kind: "ab", from: a, axes: ["base"], seed: `t32-${STAMP}`, rules: true, voters: [{ name: "judge", stacks: Object.fromEntries(stacks.slice(0, 30).map((s, i) => [String(s), { base: { value: i % 3 === 0 ? "T2w" : "T1w", reason: "the lab's judge" } }])), files: 30, skipped: 0 }], raters: CAROL.who });
    expect(ab.ok).toBe(true);
    if (ab.ok) {
      const made = await as(CAROL, () => campaigns.make(ab.body));
      const items = (await as(CAROL, () => campaigns.one(made.id))).items ?? [];
      const sheet = await as(CAROL, () => door<Record<string, unknown>>("GET", `/api/campaigns/${made.id}/items/${items[0].id}/ab`));
      say(`A/B ${made.name}: ${items.length} items to settle; an item's sheet has ${Object.keys(sheet).join(", ")}`);
      expect(items.length).toBeGreaterThan(0);
    }
  });

  it("Review's one list, as a reviewer and as a rater who never reads the queue", { timeout: 60_000 }, async () => {
    const summary = (await as(CAROL, () => review.summary())) as ReviewSummary;
    const list = await as(CAROL, () => campaigns.list());
    const groups = workList(caps, summary, list);
    for (const g of groups) say(`${g.title}: ${g.rows.length} rows, ${g.waiting} waiting (${g.rows.map((r) => r.title).slice(0, 4).join("; ")})`);
    expect(groups.flatMap((g) => g.rows).length).toBeGreaterThan(0);
    // alice holds campaigns:* only: her list is her campaigns, and the engine refuses her the queue
    const aliceEngine = await as(ALICE, () => door<EngineCapabilities>("GET", "/api/capabilities"));
    const alice = capsOf(aliceEngine, ALICE.who);
    const hers = workList(alice, null, await as(ALICE, () => campaigns.list()));
    say(`alice's list: ${hers.flatMap((g) => g.rows).map((r) => r.title).join("; ")}`);
    const refused = await as(ALICE, () => review.summary()).then(
      () => 200,
      (e: { status?: number }) => e.status ?? 0,
    );
    expect(refused).toBe(403);
  });

  it("Browse's doors over the registry, and a cohort's picks for the heatmap", { timeout: 60_000 }, async () => {
    const subjects = await as(CAROL, () => viewerDoors.subjects(REGISTRY, { q: "", show: "code", order: "code", filter: [] }));
    const first = subjects.subjects[0];
    const visits = await as(CAROL, () => viewerDoors.visits(REGISTRY, first.id, { name: "date", show: "code", filter: [] }));
    const scans = await as(CAROL, () => viewerDoors.visit(REGISTRY, visits.visits[0].key, false));
    say(`Browse: ${subjects.totals.subjects} subjects; subject ${first.id} has ${visits.visits.length} sessions; its first ${scans.scans.length} scans`);
    expect(scans.scans.length).toBeGreaterThan(0);
    const cohorts = await as(CAROL, () => door<{ name: string }[] | { cohorts: { name: string }[] }>("GET", "/api/cohorts"));
    const names = (Array.isArray(cohorts) ? cohorts : cohorts.cohorts).map((c) => c.name);
    say(`cohorts: ${names.join(", ")}`);
    if (names.length === 0) return;
    const picks = await as(CAROL, () => picksDoors.page(names[0]));
    say(`picks of ${names[0]}: ${picks.subjects.length} subjects, roles ${picks.roles.join(", ")}, totals ${JSON.stringify(picks.totals)}`);
    expect(picks.roles.length).toBeGreaterThan(0);
  });
});
