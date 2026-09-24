// SPDX-License-Identifier: AGPL-3.0-only
// Wave 45's headless walk (record 45 S5 to S7), through a running desk's
// proxy with the desk's own client code: skipped unless the addresses are
// given, so CI never runs it. Against a throwaway engine only, never an
// install that holds work.
//
//   WALK_PICKS=http://127.0.0.1:<desk port> NILS=<nils binary> NILS_REGISTRY=<its registry> NILS_PACKS=<pack dir>
//     a pick.border item answered from Review with a person's pick, which a
//     `nils pick run` afterwards leaves standing;
//   WALK_MODELS=http://127.0.0.1:<desk port>
//     a model registered, its promotion refused before admission in the
//     engine's words, admitted and promoted; a pipeline run on a selection
//     from the catalog; its synthetic results' staged decisions committed by
//     model, from and to, with nothing in force before and nothing else after.
//
//   npx vitest run src/walk45.test.ts

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DoorError, type Json } from "./ask/client";
import { checkOf, models } from "./models/client";
import { engineWords } from "./models/ModelsPage";
import { catalog, runCommand } from "./ops/catalog";
import { ops } from "./ops/client";
import { review } from "./review/client";
import { commitBody, commitPlan, committedWords, decisions, fromOfRow, modelGroups, NOW_UNKNOWN } from "./review/modelFamily";
import { borderOf, pickBody, picks } from "./review/picks";

const PICKS = process.env.WALK_PICKS ?? "";
const MODELS = process.env.WALK_MODELS ?? "";

/** The desk's client speaks relative paths, as in the browser: here they go to the desk named, as its own origin. */
function through(base: string) {
  const real = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" && input.startsWith("/") ? `${base}${input}` : input;
      const headers = new Headers(init?.headers);
      headers.set("Origin", base);
      return real(url, { ...init, headers });
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = real;
  });
}

const nils = (...args: string[]) => JSON.parse(execFileSync(process.env.NILS!, ["--registry", process.env.NILS_REGISTRY!, ...args], { encoding: "utf8" })) as unknown;

describe.skipIf(PICKS === "")("a person's pick answered from Review", () => {
  through(PICKS);
  it("stands through a pick run, and the border is not raised again", async () => {
    const open = (await review.list({ kind: "pick.border", status: "open", limit: 500 })).items;
    expect(open.length).toBeGreaterThan(0);
    const item = open[0];
    const b = borderOf(item)!;
    // not the run's own pick: the runner-up, so what stands is visibly the person's
    const choice = b.candidates.find((c) => !c.chosen)!;
    const written = await picks.set(pickBody(b, choice.stacks, "walk: the sharper of the two"));
    expect(written.answered).toBe(1);
    // the list door carries the decision; one item's door does not
    const listed = async () => (await review.list({ kind: "pick.border", limit: 500 })).items.find((i) => i.id === item.id)!;
    const after = await listed();
    expect(after.status).toBe("accepted");
    expect((after.decision as Json).pick_id).toBe(written.id);

    const run = nils("pick", "run", "--pack-dir", process.env.NILS_PACKS!, "--json") as Json;
    expect(run.standing as number).toBeGreaterThanOrEqual(1);

    const again = (await review.list({ kind: "pick.border", limit: 500 })).items.filter((i) => i.group_key === item.group_key);
    expect(again.filter((i) => i.status === "open")).toEqual([]);
    const kept = await listed();
    expect(kept.status).toBe("accepted");
    expect((kept.decision as Json).pick_id).toBe(written.id);
    const list = nils("pick", "list", "--json") as Json[];
    const mine = list.filter((p) => p.author_kind === "person" && p.session === b.day && p.role === b.role);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(written.id);
    console.log(`pick ${written.id} (stacks ${choice.stacks.join(",")}) for ${b.role} on ${b.day} stands after the run: standing ${String(run.standing)}, raised ${String(run.raised)}`);
  });
});

describe.skipIf(MODELS === "")("models, a run and commit by filter", () => {
  through(MODELS);
  const name = `walk-head-${randomBytes(3).toString("hex")}`;
  let id = 0;
  it("refuses a promotion before admission in the engine's words, then admits and promotes", async () => {
    const digest = `sha256:${createHash("sha256").update(name).digest("hex")}`;
    const m = await models.register({ name, version: "1", kind: "pass", digest, task: "axis:body_part", threshold: 0.7 });
    expect(m.state).toBe("registered");
    id = m.id;
    let words = "";
    try {
      await models.promote(id);
    } catch (e) {
      expect(e).toBeInstanceOf(DoorError);
      expect((e as DoorError).status).toBe(409);
      words = engineWords(e);
    }
    expect(words).toMatch(/is registered and not admitted/u);
    console.log(`promotion refused: ${words}`);
    const admitted = await models.admit(id, checkOf("heldout", [{ name: "ece", passed: true, value: "0.04", threshold: "0.05" }]));
    expect(admitted.state).toBe("admitted");
    const promoted = await models.promote(id, "walk");
    expect(promoted.model.state).toBe("promoted");
  });
  it("runs a pipeline on a selection from the catalog, and commits the staged part by model, from and to", async () => {
    const { pipelines, capability } = await catalog.list();
    expect(capability?.enabled).toBe(true);
    const p = pipelines.find((x) => x.name === "walk-infer")!;
    const sel = await catalog.selection("every");
    const command = runCommand({ pipeline: p, over: { selection: sel.name, version: sel.version }, params: {}, models: [`${name}@1`], labels: null });
    const queued = await ops.enqueue(command);
    let state = "queued";
    for (let i = 0; i < 120 && state !== "done" && state !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      state = (await ops.job(queued.job)).state;
    }
    expect(state).toBe("done");

    const read = async () => modelGroups([...(await review.list({ status: "open", limit: 500 })).items, ...(await review.list({ status: "staged", limit: 500 })).items]).filter((g) => g.model === `${name}@1`);
    const groups = await read();
    expect(groups.length).toBeGreaterThan(0);
    // nothing in force before the commit: every group at or above the threshold is staged, the one below is asked
    expect([...new Set(groups.filter((g) => g.staged).map((g) => g.to))].sort()).toEqual(["brain", "chest"]);
    expect(groups.filter((g) => !g.staged).map((g) => g.to)).toEqual(["spine"]);
    const chest = groups.find((g) => g.to === "chest")!;
    const stack = (((await ops.reviewItem(chest.item.id)) as unknown as Json).member_stacks as { stack_id: number }[] | undefined)?.[0]?.stack_id ?? null;
    // what the stack holds now on the axis, as the explain door says it: null for no value
    const held = stack !== null ? ((await review.explain(stack)).axes.find((a) => a.axis === "body_part")?.value ?? null) : null;
    expect(held).not.toBe("chest");

    // the filter as the page makes it from the matrix: from where the group's evidence says what the stacks hold now, else not named
    const row = chest.from ? Object.keys(chest.from)[0] : NOW_UNKNOWN;
    const filter = { model: `${name}@1`, axis: "body_part", to: "chest", ...(fromOfRow(row) !== undefined ? { from: fromOfRow(row) } : {}) };
    const plan = commitPlan(groups, filter);
    const staged = groups.filter((g) => g.staged).length;
    let done = await decisions.commitWhere(commitBody(filter)).catch((e: unknown) => e);
    // the registry moved on since the run staged them: the person ticks "commit anyway", as the panel offers
    if (done instanceof DoorError && /moved on/u.test(engineWords(done))) done = await decisions.commitWhere(commitBody(filter, true)).catch((e: unknown) => e);
    // the stack holds a value now, so the engine's own from filter is tried beside it and its answer said
    if (held !== null && fromOfRow(row) === undefined) {
      const byFrom = await decisions.commitWhere(commitBody({ ...filter, from: held }, true)).catch((e: unknown) => e);
      console.log(`by from ${held} as well: ${byFrom instanceof Error ? engineWords(byFrom) : committedWords(byFrom as Awaited<ReturnType<typeof decisions.commitWhere>>)}`);
    }
    const now = await read();
    if (done instanceof DoorError) {
      // an engine without commit by model, from and to (before record 45 E3) names no filter it knows and commits nothing
      expect(done.status).toBe(409);
      expect(now.filter((g) => g.staged)).toHaveLength(staged);
      console.log(`this engine refused the filter and committed nothing: ${engineWords(done)}`);
      return;
    }
    if (done instanceof Error) throw done;
    const part = done as Awaited<ReturnType<typeof decisions.commitWhere>>;
    expect(part.committed).toHaveLength(plan.groups);
    expect(now.find((g) => g.item.id === chest.item.id)).toBeUndefined();
    expect([...new Set(now.filter((g) => g.staged).map((g) => g.to))]).toEqual(["brain"]);
    expect(now.filter((g) => g.staged)).toHaveLength(staged - plan.groups);
    // the group is closed, its decision the model's and now in force
    // (by status: the engine reads a kind with a colon only as written, not percent-encoded)
    const closed = (await review.list({ status: "accepted", limit: 500 })).items.find((i) => i.id === chest.item.id)!;
    expect(closed.status).toBe("accepted");
    expect(part.committed).toContain((closed.decision as Json).decision);
    console.log(`${committedWords(part)} (by ${filter.model}, ${filter.axis} ${"from" in filter ? `from ${String(filter.from)} ` : ""}to chest; the stack held ${String(held)})`);
  }, 90_000);
});
