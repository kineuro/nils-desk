// SPDX-License-Identifier: AGPL-3.0-only
// The reader, headless (record 48 R1's proof): against a live engine,
// through the desk's own client and the reader's own logic, a rater reads a
// campaign as the page does (claim in value order, the evidence line, the
// suggestion filled in, one key, the answer timed, the next pictures warmed
// while this one is read), then accepts a batch of like stacks and reads the
// held back one by one; the campaign's pace is read back from the engine.
// It measures seconds per decision as it runs. Skipped unless an engine is
// named:
//
//   READER_WALK_ENGINE=http://127.0.0.1:18471 \
//   READER_WALK_TOKENS=alice@node=<token>,carol@node=<token> \
//   npx vitest run src/campaigns/reader.live.test.ts
//
// The first token rates (campaigns:work, review:see), the second makes the
// campaigns (campaigns:work, query:work). It writes a selection and two
// campaigns into that registry, so it is run against a throwaway one.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { door } from "../ask/client";
import type { Capabilities, EngineCapabilities } from "../capabilities";
import { door as served } from "../deployment";
import { warmStack } from "../viewer/prefetch";
import { campaigns, emptyDraft, makeBody, type Campaign, type Given } from "./client";
import { acceptPlan, baselineOf, changesOf, complete, givenOf, givenOfCandidate, median, Prefetcher, suggestedValue, suggestionOf, upcoming } from "./reader";
import { acceptBatch, batchesFor, claimIn, forgetReadings, hintOf, R48, readingFor, statsFor, timed, valueOrderServed } from "./readerDoors";
import { bodyOf, given, keyAct, rowsOf, seatOf } from "./workspace";

const ENGINE = process.env.READER_WALK_ENGINE ?? "";
const PEOPLE = (process.env.READER_WALK_TOKENS ?? "")
  .split(",")
  .filter(Boolean)
  .map((p) => {
    const [who, token] = p.split("=");
    return { who, token };
  });
const [ALICE, CAROL] = PEOPLE;
const STAMP = Date.now().toString(36);
const say = (line: string) => console.log(`reader walk: ${line}`);

let acting = CAROL;
const realFetch = globalThis.fetch;
function as<T>(person: typeof CAROL, f: () => Promise<T>): Promise<T> {
  acting = person;
  return f();
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? null : s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

describe.skipIf(!ENGINE || PEOPLE.length < 2)("the reader walked on a live engine", () => {
  let caps: Capabilities;
  let selection = "";
  beforeAll(async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(`${ENGINE}${String(input)}`, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${acting.token}` } })) as typeof fetch;
    const engine = await as(ALICE, () => door<EngineCapabilities>("GET", "/api/capabilities"));
    caps = { engine, kvasir: null, assistant: null, apps: [], person: { subject: ALICE.who, display_name: "", grants: engine.grants ?? [], detail: engine.detail ?? "quasi", groups: [] }, desk: {} } as unknown as Capabilities;
    say(`engine ${engine.engine.version}, OpenAPI ${engine.contracts.openapi ?? "?"}; evidence door ${served(caps, R48.line)}, batches ${served(caps, R48.batches)}, stats ${served(caps, R48.stats)}, value order ${valueOrderServed(caps)}`);
    selection = `reader-${STAMP}`;
    await as(CAROL, () =>
      door<{ version: number }>("PUT", `/api/ask/selections/${selection}`, { document: { ast_version: 1, sets: { every: { grain: "stack", where: [["<=", {}, ["field", {}, "id"], 24]] } }, out: { set: "every", level: "record" } } }),
    );
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  async function make(name: string, raters = 1): Promise<Campaign> {
    const made = makeBody({ ...emptyDraft({ source: "selection", from: `${selection}@1` }), name, axis: "base", ratersPerItem: raters, closesInto: "none", leaseMinutes: 15 });
    expect(made.ok).toBe(true);
    if (!made.ok) throw new Error(made.needs);
    return as(CAROL, () => campaigns.make(made.body));
  }

  it("reads a campaign with the suggestion filled in, one key a stack, the next pictures warmed", { timeout: 300_000 }, async () => {
    forgetReadings();
    const c = await make(`reader-${STAMP}`);
    const q = c.question;
    const rows = rowsOf(q, null);
    const items = c.items ?? [];
    const order = valueOrderServed(caps) ? "value" : "position";
    say(`made ${c.name}: ${items.length} items, claims by ${order}`);
    const prefetch = new Prefetcher((s) => as(ALICE, () => warmStack(s)), 2);
    const answered = new Set<number>();
    const perDecision: number[] = [];
    const keysPer: number[] = [];
    let ready = 0;
    let prefilled = 0;
    let changed = 0;
    let t = performance.now();
    let claimed = await as(ALICE, () => claimIn(c.id, "rater", order));
    let seat = seatOf(claimed);
    while (seat.kind === "holding") {
      const item = seat.item;
      if (perDecision.length > 0 && item.stack_id !== null && prefetch.has(item.stack_id)) ready++;
      // what the page does when the item lands: its reading, the suggestion filled in, the next ones warmed
      const reading = await as(ALICE, () => readingFor(caps, c.id, q, item));
      const s = suggestionOf(q, reading);
      prefetch.want(upcoming(item, items, answered, order, 2, hintOf(claimed)));
      let g: Given = givenOf(q, s) ?? { kind: "value", value: "" };
      let keys = 0;
      if (complete(q, g)) prefilled++;
      else if (s && s.offered.length > 0) {
        // one key: the first candidate
        g = givenOfCandidate(q, s.offered[0]) ?? g;
        keys++;
      } else {
        // no suggestion: a value by its key, as record 45's workspace
        const k = keyAct("2", { ctrl: false, inField: false, q, rows });
        if (k?.kind === "choose") g = given(q, g, k.row, k.value);
        keys++;
      }
      keys++; // Enter
      const body = bodyOf(q, g);
      expect(body.ok).toBe(true);
      if (!body.ok) break;
      const ch = changesOf(q, baselineOf(q, s), g);
      if (ch !== null && ch > 0) changed++;
      const holding = seat;
      await as(ALICE, () => campaigns.answer(c.id, holding.assignment.id, timed(body.body, (performance.now() - t) / 1000, ch, suggestedValue(q, s))));
      answered.add(item.id);
      const now = performance.now();
      perDecision.push((now - t) / 1000);
      keysPer.push(keys);
      t = now;
      claimed = await as(ALICE, () => claimIn(c.id, "rater", order));
      seat = seatOf(claimed);
    }
    const m = median(perDecision);
    say(
      `${perDecision.length} decisions: median ${m?.toFixed(3)} s, p90 ${quantile(perDecision, 0.9)?.toFixed(3)} s of desk and engine time each; ${prefilled} filled in whole, ${changed} changed from the suggestion; median ${median(keysPer)} keys a decision; pictures warmed before ${ready} of ${Math.max(0, perDecision.length - 1)} items; ${prefetch.warmed.length} stacks warmed`,
    );
    expect(perDecision.length).toBe(items.length);
    if (served(caps, R48.stats)) {
      const stats = await as(CAROL, () => statsFor(c.id));
      const mine = stats.find((r) => r.principal === ALICE.who);
      say(`the engine's pace for ${ALICE.who}: ${mine?.decisions} decisions, median ${mine?.median_seconds} s, changed ${mine?.changed}`);
      expect(mine?.decisions).toBe(items.length);
    }
  });

  it("accepts a batch of like stacks and reads the held back one by one", { timeout: 300_000 }, async (ctx) => {
    if (!served(caps, R48.batches)) {
      say("batches: this engine groups no batches; skipped");
      ctx.skip();
      return;
    }
    const c = await make(`reader-batch-${STAMP}`);
    const t0 = performance.now();
    const batches = await as(ALICE, () => batchesFor(c.id));
    say(`batches: ${batches.length}, of ${batches.map((b) => `${b.items.length} (${b.held.length} held)`).join(", ")}`);
    expect(batches.length).toBeGreaterThan(0);
    const b = batches[0];
    const plan = acceptPlan(b, new Set());
    const r = await as(ALICE, () => acceptBatch(c.id, c.question, b, plan, (performance.now() - t0) / 1000));
    const took = (performance.now() - t0) / 1000;
    say(`accepted ${r.accepted} in ${took.toFixed(3)} s (${(took / Math.max(1, r.accepted)).toFixed(3)} s a stack); held back ${r.held.length}`);
    expect(r.accepted).toBe(plan.accept.length);
    // the held back come next, one by one
    for (const held of r.held) {
      const seat = seatOf(await as(ALICE, () => claimIn(c.id, "rater", "value", held)));
      expect(seat.kind).toBe("holding");
      if (seat.kind !== "holding") break;
      say(`held back item ${held}: claimed item ${seat.item.id}`);
      const s = suggestionOf(c.question, await as(ALICE, () => readingFor(caps, c.id, c.question, seat.item)));
      const g = givenOf(c.question, s);
      const body = g && complete(c.question, g) ? bodyOf(c.question, g) : bodyOf(c.question, { kind: "value", value: "T1w" });
      if (body.ok) await as(ALICE, () => campaigns.answer(c.id, seat.assignment.id, body.body));
    }
    if (served(caps, R48.stats)) {
      const mine = (await as(CAROL, () => statsFor(c.id))).find((x) => x.principal === ALICE.who);
      say(`the engine's pace after the batch: ${mine?.decisions} decisions, ${mine?.batched} in batches`);
      expect(mine?.batched).toBe(r.accepted);
    }
  });
});
