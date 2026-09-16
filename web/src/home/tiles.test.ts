// SPDX-License-Identifier: AGPL-3.0-only
// Home's four tiles: which are offered, and their words over each door's answer.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import type { Summary } from "../objects/client";
import { day, holdsTile, needsTile, runningTile, sinceTile, tilesOffered } from "./tiles";

function caps(doors: string[], grants: Grant[]): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.14" },
      contracts: {},
      doors,
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 0, schema_version: 37 },
      packs: [],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "p", display_name: "p", grants, detail: "plain", groups: [] },
    desk: { version: "1.0.0-alpha.14", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    epoch: 0,
    synthetic: null,
    cohorts: 0,
    subjects: { total: 0, by_cohort: {} },
    sessions: { total: 0, by_cohort: {} },
    stacks: { total: 0, by_cohort: {} },
    since: null,
    ...over,
  };
}

const job = (state: JobRow["state"]): JobRow => ({ id: 1, kind: "digest", name: null, state, started_at: "", heartbeat_at: null, finished_at: null, progress: null, error: null, args: {}, result: null });

describe("the tiles offered", () => {
  it("follow the doors and the grants", () => {
    const all = ["GET /api/summary", "GET /api/review", "GET /api/jobs"];
    expect(tilesOffered(caps(all, SETS.operator.grants))).toEqual(["holds", "needs", "running", "since"]);
    expect(tilesOffered(caps(all, SETS.reader.grants))).toEqual(["holds", "since"]);
    expect(tilesOffered(caps(["GET /api/jobs"], SETS.admin.grants))).toEqual(["running"]);
    expect(tilesOffered(caps(all, ["review:see"]))).toEqual(["needs"]);
    expect(tilesOffered(caps(all, ["pipelines:work", "query:see"]))).toEqual(["holds", "running", "since"]);
  });
});

describe("the words", () => {
  it("say an empty registry the way the design does", () => {
    expect(holdsTile(summary(), 37)).toEqual({ id: "holds", eyebrow: "The registry holds", value: "0", meta: "subjects · epoch 0 · schema 37" });
  });
  it("say a registry that holds something with its sessions and stacks", () => {
    const s = summary({ epoch: 1412, subjects: { total: 48, by_cohort: {} }, sessions: { total: 172, by_cohort: {} }, stacks: { total: 1, by_cohort: {} } });
    expect(holdsTile(s, 37)).toMatchObject({ value: "48", meta: "subjects · 172 sessions · 1 stack · epoch 1,412" });
  });
  it("name the window the session cache was built under, where the summary says it", () => {
    const s = summary({ epoch: 1412, subjects: { total: 48, by_cohort: {} }, sessions: { total: 172, by_cohort: {}, window_days: 90 }, stacks: { total: 1, by_cohort: {} } });
    expect(holdsTile(s, 37)).toMatchObject({ meta: "subjects · 172 sessions in a 90-day window · 1 stack · epoch 1,412" });
    // one session, one day, and an engine that says no window at all
    const one = summary({ subjects: { total: 1, by_cohort: {} }, sessions: { total: 1, by_cohort: {}, window_days: 1 }, stacks: { total: 0, by_cohort: {} } });
    expect(holdsTile(one).meta).toBe("subject · 1 session in a 1-day window · 0 stacks · epoch 0");
  });
  it("say what needs you and what runs", () => {
    expect(needsTile(0).meta).toBe("nothing to review");
    expect(needsTile(1)).toMatchObject({ value: "1", meta: "review item open" });
    expect(runningTile([])).toMatchObject({ value: "0", meta: "no jobs" });
    expect(runningTile([job("running"), job("queued"), job("queued"), job("done"), { ...job("running"), kind: "worker" }])).toMatchObject({ value: "3", meta: "1 running, 2 queued" });
  });
  it("say what changed since the last visit, and nothing on the first", () => {
    const last = "2026-09-12T12:00:00Z";
    expect(sinceTile(null, null)).toMatchObject({ value: "First visit", meta: "changes land here" });
    expect(sinceTile(last, summary())).toMatchObject({ value: "Nothing new", meta: `since ${day(last)}` });
    const since = { date: last, subjects: 2, sessions: 3, stacks: 40, handles: 0, releases: 1 };
    expect(sinceTile(last, summary({ since }))).toMatchObject({ value: "40", meta: `stacks since ${day(last)}, 2 subjects, 3 sessions, 1 release` });
    expect(day("not a date")).toBe("not a date");
  });
});
