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
import { answerWords, campaigns, closure, emptyDraft, makeBody, type Answer, type Campaign, type Claimed } from "./client";
import { beatSeat, bodyOf, disagreementWords, given, keyAct, marksOf, rowsOf, seatOf, type Seat } from "./workspace";
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
