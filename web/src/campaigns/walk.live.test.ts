// SPDX-License-Identifier: AGPL-3.0-only
// The campaign walk, headless (record 45 S3 and S4's proof): against a live
// engine, through the desk's own client and the workspace's own logic, three
// people make a two-rater campaign, rate it with the workspace's keys,
// disagree once, adjudicate, close it after the closure panel counted what
// it would write, and export it; a second campaign lets a lease run out and
// shows the item back in the pool. Skipped unless an engine is named:
//
//   CAMPAIGN_WALK_ENGINE=http://127.0.0.1:18461 \
//   CAMPAIGN_WALK_TOKENS=alice@node=<token>,bob@node=<token>,carol@node=<token> \
//   npm run walk:campaigns
//
// The first two tokens rate (campaigns:work), the third makes, adjudicates
// and closes (campaigns:work, review:work, query:work at detail quasi). It
// writes a selection, two campaigns, their decisions and two label sets into
// that registry, so it is run against a throwaway one (nils synth).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { door } from "../ask/client";
import type { Capabilities, EngineCapabilities } from "../capabilities";
import { answerWords, axesServed, campaigns, closure, emptyDraft, makeBody, type Answer, type Campaign, type Claimed, type Given } from "./client";
import { beatSeat, bodyOf, disagreementWords, findMatches, given, givenNone, illegal, keyAct, marksOf, rowsOf, seatOf, type Seat } from "./workspace";
import { blank } from "./renderers";

const ENGINE = process.env.CAMPAIGN_WALK_ENGINE ?? "";
const PEOPLE = (process.env.CAMPAIGN_WALK_TOKENS ?? "")
  .split(",")
  .filter(Boolean)
  .map((p) => {
    const [who, token] = p.split("=");
    return { who, token };
  });
const [ALICE, BOB, CAROL] = PEOPLE;
const STAMP = Date.now().toString(36);
const say = (line: string) => console.log(`walk: ${line}`);

let acting = CAROL;
const realFetch = globalThis.fetch;
/** The desk's client speaks to its own origin; here each call goes to the engine with the acting person's token. */
function as<T>(person: typeof CAROL, f: () => Promise<T>): Promise<T> {
  acting = person;
  return f();
}

describe.skipIf(!ENGINE || PEOPLE.length < 3)("a campaign walked by three people on a live engine", () => {
  let caps: Capabilities;
  beforeAll(async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(`${ENGINE}${String(input)}`, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${acting.token}` } })) as typeof fetch;
    const engine = await as(CAROL, () => door<EngineCapabilities>("GET", "/api/capabilities"));
    caps = { engine, kvasir: null, assistant: null, apps: [], person: { subject: CAROL.who, display_name: "", grants: engine.grants ?? [], detail: engine.detail ?? "plain", groups: [] }, desk: {} } as unknown as Capabilities;
    say(`engine ${engine.engine.version}, OpenAPI ${engine.contracts.openapi ?? "?"}, epoch ${engine.registry.epoch}`);
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  /** One rater's pass through the workspace: claim, choose by key, answer, until nothing is left. */
  async function rate(person: typeof ALICE, c: Campaign, keyFor: (stack: number) => string): Promise<number> {
    const q = c.question;
    const rows = rowsOf(q, null);
    let seat: Seat = seatOf(await as(person, () => campaigns.claim(c.id)));
    let n = 0;
    while (seat.kind === "holding") {
      const act = keyAct(keyFor(seat.item.stack_id ?? 0), { ctrl: false, inField: false, q, rows });
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

  it("makes, rates twice, adjudicates, closes and exports", { timeout: 120_000 }, async () => {
    // a selection of four stacks, saved as Query saves one
    const sel = `walk-${STAMP}`;
    const saved = await as(CAROL, () =>
      door<{ version: number }>("PUT", `/api/ask/selections/${sel}`, { document: { ast_version: 1, sets: { every: { grain: "stack", where: [["<=", {}, ["field", {}, "id"], 4]] } }, out: { set: "every", level: "record" } } }),
    );
    // the make dialog's body
    const made = makeBody({ ...emptyDraft({ source: "selection", from: `${sel}@${saved.version}` }), name: `walk-base-${STAMP}`, axis: "base", adjudicators: CAROL.who, closesInto: "decision", leaseMinutes: 15 });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const c = await as(CAROL, () => campaigns.make(made.body));
    const items = c.items ?? [];
    say(`made ${c.name}: ${items.length} items, ${c.raters_per_item} raters each, adjudicated by ${c.rater_policy.adjudicators.join(", ")}`);
    expect(items.length).toBeGreaterThan(1);
    const odd = items[items.length - 1].stack_id;

    // alice answers T1w everywhere (key 9); bob the same but T2w (key 7) on the last stack
    const a = await rate(ALICE, c, () => "9");
    const b = await rate(BOB, c, (stack) => (stack === odd ? "7" : "9"));
    say(`alice answered ${a}, bob answered ${b}`);
    expect([a, b]).toEqual([items.length, items.length]);
    // a rater is never handed an item twice
    expect((await as(ALICE, () => campaigns.claim(c.id))).assignment).toBeNull();

    // carol adjudicates with every rater's answer beside the options
    const adj = seatOf(await as(CAROL, () => campaigns.claim(c.id, "adjudicator")));
    expect(adj.kind).toBe("holding");
    if (adj.kind !== "holding") return;
    expect(adj.item.stack_id).toBe(odd);
    const seen = await as(CAROL, () => campaigns.answers(c.id));
    const split = disagreementWords(c.question, seen, adj.item.id);
    say(`adjudicator sees: ${split}`);
    expect(split).toBe("The raters differ: T1w or T2w.");
    expect(marksOf(c.question, seen, adj.item.id)).toEqual({ base: { T1w: [ALICE.who], T2w: [BOB.who] } });
    const settle = bodyOf(c.question, { kind: "value", value: "T1w" }, "the walk's adjudicator");
    expect(settle.ok).toBe(true);
    if (settle.ok) await as(CAROL, () => campaigns.answer(c.id, adj.assignment.id, settle.body));

    // the closure panel, then the close: what it said is what it wrote
    const before = await as(CAROL, () => campaigns.one(c.id));
    const answers: Answer[] = await as(CAROL, () => campaigns.answers(c.id));
    const plan = closure(before, answers);
    say(`closure panel: writes ${plan.writes.n} ${plan.writes.words}, ${plan.unresolvedTotal} unresolved, ${plan.leases} leases out`);
    const closed = await as(CAROL, () => campaigns.close(c.id));
    say(`closed: ${closed.decisions.length} decisions, ${closed.unresolved} unresolved, staged ${closed.staged}, exact ${closed.agreement?.exact}`);
    expect(closed.decisions.length).toBe(plan.writes.n);
    expect(closed.unresolved).toBe(plan.unresolvedTotal);
    // one decision per item, every answer kept
    const after = await as(CAROL, () => campaigns.one(c.id));
    expect(after.status).toBe("closed");
    const decided = (after.items ?? []).map((i) => i.decision_id);
    expect(new Set(decided).size).toBe(items.length);
    expect(decided.every((d) => typeof d === "number")).toBe(true);
    const kept = await as(CAROL, () => campaigns.answers(c.id));
    expect(kept.length).toBe(2 * items.length + 1);
    say(`after the close: ${items.length} items, ${new Set(decided).size} decisions, ${kept.length} answers kept (${kept.map((x) => answerWords(x)).join(" ")})`);

    // export: the outcomes and every answer, each a label set read back with its digest
    const outcomes = await as(CAROL, () => campaigns.export(c.id, { of: "outcomes" }));
    const everyAnswer = await as(CAROL, () => campaigns.export(c.id, { of: "answers" }));
    const set = await as(CAROL, () => campaigns.labelSet(outcomes.id));
    const rows = (set.files?.["labels.tsv"] ?? "").split("\n").filter(Boolean).length - 1;
    say(`exported ${outcomes.name} v${outcomes.version} (${outcomes.rows} rows, sha256 ${outcomes.digest.slice(0, 12)}) and ${everyAnswer.name} v${everyAnswer.version} (${everyAnswer.rows} rows)`);
    expect(outcomes.rows).toBe(items.length);
    expect(rows).toBe(items.length);
    expect(everyAnswer.rows).toBe(kept.length);
    expect((await as(CAROL, () => campaigns.labelSets())).some((s) => s.id === outcomes.id)).toBe(true);
  });

  it("asks every axis of a stack at once, holds the answer to the pack, and closes one decision per axis", { timeout: 120_000 }, async (ctx) => {
    if (!axesServed(caps)) {
      say("axes: this engine does not ask the axes question; skipped");
      ctx.skip();
      return;
    }
    const sel = `walk-${STAMP}`;
    const made = makeBody({ ...emptyDraft({ source: "selection", from: `${sel}@1` }), name: `walk-axes-${STAMP}`, kind: "axes", axes: ["base", "technique", "modifier"], adjudicators: CAROL.who, closesInto: "decision" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const c = await as(CAROL, () => campaigns.make(made.body));
    const q = c.question;
    const rows = rowsOf(q, null);
    const items = c.items ?? [];
    say(`axes: made ${c.name}, ${items.length} items, ${rows.map((r) => `${r.axis} ${r.values.length}${r.multi ? " several" : ""}`).join(", ")}; pictures ${c.pictures ? `${c.pictures.have} of ${c.pictures.stacks}` : "not said"}`);
    expect(rows.find((r) => r.axis === "modifier")?.multi).toBe(true);
    const odd = items[items.length - 1].stack_id;
    // the desk refuses what the pack forbids before it is sent, and the engine refuses the same body in its own words
    const bad: Given = { kind: "values", values: { base: "T2w", technique: "MPRAGE", modifier: null } };
    const said = illegal(q, bad);
    expect(said).toMatch(/sets base to T1w when technique is MPRAGE/u);
    const first = seatOf(await as(ALICE, () => campaigns.claim(c.id)));
    expect(first.kind).toBe("holding");
    if (first.kind !== "holding") return;
    const refusedBy = await as(ALICE, () => campaigns.answer(c.id, first.assignment.id, { value: { base: "T2w", technique: "MPRAGE", modifier: null } })).then(
      () => null,
      (e: Error) => e.message,
    );
    say(`axes: the desk said "${said}"; the engine said "${refusedBy}"`);
    expect(refusedBy).toMatch(/T1w/u);
    // the refusal wrote nothing: the same assignment takes the legal answer
    await as(ALICE, () => campaigns.answer(c.id, first.assignment.id, { value: { base: "T1w", technique: "MPRAGE", modifier: null } }));
    // two raters: base found by its number and letters (T1w), technique chosen, modifier none; bob differs on the technique of the last stack
    const rate = async (person: typeof ALICE, technique: (stack: number) => string) => {
      let seat: Seat = seatOf(await as(person, () => campaigns.claim(c.id)));
      let n = 0;
      while (seat.kind === "holding") {
        // three rows: `1` finds the base row and its first letters find T1w (record 48, one screen)
        const k = keyAct("1", { ctrl: false, inField: false, q, rows });
        let g: Given = { kind: "values", values: {} };
        const found = k?.kind === "find" ? findMatches(k.row, "t1w")[0] : null;
        if (k?.kind === "find" && found?.kind === "value") g = given(q, g, k.row, found.value);
        g = given(q, g, rows[1], technique(seat.item.stack_id ?? 0));
        g = givenNone(g, "modifier");
        expect(illegal(q, g)).toBeNull();
        const body = bodyOf(q, g);
        expect(body.ok).toBe(true);
        if (!body.ok) break;
        const holding = seat;
        await as(person, () => campaigns.answer(c.id, holding.assignment.id, body.body));
        n++;
        seat = seatOf(await as(person, () => campaigns.claim(c.id)));
      }
      return n;
    };
    const a = 1 + (await rate(ALICE, () => "MPRAGE"));
    const b = await rate(BOB, (stack) => (stack === odd ? "TSE" : "MPRAGE"));
    say(`axes: alice answered ${a}, bob answered ${b}`);
    expect([a, b]).toEqual([items.length, items.length]);
    const adj = seatOf(await as(CAROL, () => campaigns.claim(c.id, "adjudicator")));
    expect(adj.kind === "holding" && adj.item.stack_id).toBe(odd);
    if (adj.kind !== "holding") return;
    const seen = await as(CAROL, () => campaigns.answers(c.id));
    const split = disagreementWords(q, seen, adj.item.id);
    say(`axes: adjudicator sees: ${split}`);
    expect(split).toBe("The raters differ on technique.");
    const settle = bodyOf(q, { kind: "values", values: { base: "T1w", technique: "MPRAGE", modifier: null } }, "the walk's adjudicator");
    if (settle.ok) await as(CAROL, () => campaigns.answer(c.id, adj.assignment.id, settle.body));
    const before = await as(CAROL, () => campaigns.one(c.id));
    const plan = closure(before, await as(CAROL, () => campaigns.answers(c.id)));
    const closed = await as(CAROL, () => campaigns.close(c.id));
    const after = await as(CAROL, () => campaigns.one(c.id));
    const perItem = (after.items ?? []).map((i) => Object.keys(i.outcome?.decisions ?? {}).length);
    say(`axes: closure panel said ${plan.writes.n} ${plan.writes.words}; the close wrote ${closed.decisions.length} decisions (${perItem.join(", ")} per item), ${closed.unresolved} unresolved; by axis ${Object.entries(after.agreement?.per_axis ?? {}).map(([k, v]) => `${k} ${v.exact}`).join(", ")}`);
    expect(plan.writes.n).toBe(closed.decisions.length);
    expect(closed.unresolved).toBe(0);
    expect(perItem.every((x) => x === 3)).toBe(true);
  });

  it("puts an item whose lease ran out back in the pool, and the heartbeat says so", { timeout: 60_000 }, async () => {
    const sel = `walk-${STAMP}`;
    const made = makeBody({ ...emptyDraft({ source: "selection", from: `${sel}@1` }), name: `walk-lease-${STAMP}`, axis: "base", ratersPerItem: 1 });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    // two seconds, shorter than the desk's form offers, so the walk need not wait a minute
    const c = await as(CAROL, () => campaigns.make({ ...made.body, lease_seconds: 2 }));
    const first = seatOf(await as(ALICE, () => campaigns.claim(c.id)));
    expect(first.kind).toBe("holding");
    if (first.kind !== "holding") return;
    // the heartbeat while the lease holds hands the same one back
    const held: Claimed = await as(ALICE, () => campaigns.renew(caps, c.id, first.assignment.id, "rater"));
    expect(beatSeat(first, held)).toMatchObject({ kind: "holding", assignment: { id: first.assignment.id } });
    await new Promise((r) => setTimeout(r, 3_000));
    // bob finds the item alice held, back in the pool
    const bob = seatOf(await as(BOB, () => campaigns.claim(c.id)));
    expect(bob.kind === "holding" && bob.item.id).toBe(first.item.id);
    // alice's next heartbeat says her lease ended, and hands her the next item
    const beat = beatSeat(first, await as(ALICE, () => campaigns.renew(caps, c.id, first.assignment.id, "rater")));
    say(`lease: bob took item ${bob.kind === "holding" ? bob.item.id : "none"}; alice's heartbeat: ${beat.kind === "holding" ? beat.note : beat.kind === "done" ? beat.why : beat.kind}`);
    expect(beat.kind === "holding" && beat.item.id).not.toBe(first.item.id);
    expect(beat.kind === "holding" && beat.note).toMatch(/^Your lease on stack \d+ ended; stack \d+ is yours now\.$/u);
    // an answer on the ended lease is refused
    const late = await as(ALICE, () => campaigns.answer(c.id, first.assignment.id, { value: "T1w" })).then(
      () => null,
      (e: Error) => e.message,
    );
    say(`an answer on the ended lease: ${late}`);
    expect(late).not.toBeNull();
    for (const s of [bob, beat]) if (s.kind === "holding") await as(s === bob ? BOB : ALICE, () => campaigns.release(c.id, s.assignment.id));
  });
});
