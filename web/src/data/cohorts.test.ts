// SPDX-License-Identifier: AGPL-3.0-only
// The cohort doors against answers shaped as the contract, and the words and
// points the Cohorts, cohort and Release pages draw from them.

import { afterEach, describe, expect, it, vi } from "vitest";
import cohortFixture from "../../test/fixtures/cohort.json";
import cohortsFixture from "../../test/fixtures/cohorts.json";
import releasesFixture from "../../test/fixtures/releases.json";
import selectFixture from "../../test/fixtures/select.json";
import type { Source } from "./sources";
import {
  cohorts,
  cohortState,
  leavingLines,
  ledeWords,
  membersBody,
  metaWords,
  policyWords,
  provenanceLine,
  provenanceWords,
  reachesWords,
  releases,
  chartLabels,
  stepChart,
  suggestedName,
  type Cohort,
  type CohortDetail,
  type Join,
  type Release,
} from "./cohorts";

type Answer = { status: number; body: unknown };
function fakeFetch(route: (method: string, path: string, body: unknown) => Answer) {
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method: init?.method ?? "GET", path, body, headers: (init?.headers ?? {}) as Record<string, string> });
      const a = route(init?.method ?? "GET", path, body);
      return { ok: a.status < 400, status: a.status, text: async () => JSON.stringify(a.body) } as Response;
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const list = cohortsFixture as Cohort[];
const north = cohortFixture as CohortDetail;
const NOW = new Date("2026-09-15T12:00:00Z");

describe("the cohort doors", () => {
  it("read the list and one cohort as the contract shapes them", async () => {
    const calls = fakeFetch((_m, p) => ({ status: 200, body: p === "/api/cohorts" ? cohortsFixture : cohortFixture }));
    const all = await cohorts.list();
    expect(all.map((c) => c.name)).toEqual(["north", "north-7t", "pilot", "ct-lab"]);
    expect(all[0].from).toEqual({ kind: "source", detail: { place: "north-3t" } });
    const one = await cohorts.get("north");
    expect(one.joins).toHaveLength(5);
    expect(one.sources_holding.map((s) => s.name)).toEqual(["north-3t", "archive-2019"]);
    expect(one.releases[0].name).toBe("north-2026.08.21.1");
    expect(calls.map((c) => c.path)).toEqual(["/api/cohorts", "/api/cohorts/north"]);
    // an engine that wraps the list is read the same
    fakeFetch(() => ({ status: 200, body: { cohorts: cohortsFixture } }));
    expect((await cohorts.list()).length).toBe(4);
  });
  it("make, rename, retire and change members through their doors, every write with the desk header", async () => {
    const calls = fakeFetch(() => ({ status: 200, body: {} }));
    await cohorts.make({ name: "pilot", owner: "erik", description: "a pilot" });
    await cohorts.set("pilot", { name: "pilot-2" });
    await cohorts.set("pilot-2", { retired: true });
    await cohorts.members("pilot-2", { add: ["A001"], remove: [], why: "from the list" });
    await cohorts.promote(77, { cohort: "north-7t", create: true, reason: "the 7T arm" });
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["POST", "/api/cohorts"],
      ["PUT", "/api/cohorts/pilot"],
      ["PUT", "/api/cohorts/pilot-2"],
      ["POST", "/api/cohorts/pilot-2/members"],
      ["POST", "/api/ask/handles/77/promote"],
    ]);
    expect(calls[0].body).toEqual({ name: "pilot", owner: "erik", description: "a pilot" });
    expect(calls[2].body).toEqual({ retired: true });
    expect(calls[3].body).toEqual({ add: ["A001"], remove: [], why: "from the list" });
    expect(calls[4].body).toEqual({ cohort: "north-7t", create: true, reason: "the 7T arm" });
    expect(calls.every((c) => c.headers["X-Nils-Desk"] === "1")).toBe(true);
  });
  it("list the releases, select first and release", async () => {
    const calls = fakeFetch((_m, p) => ({ status: 200, body: p === "/api/select" ? selectFixture : p.startsWith("/api/releases?") ? releasesFixture : { job: 12, state: "queued" } }));
    const r = await releases.list();
    expect(r.releases.map((x) => x.name)).toEqual(["pilot-2026.09.10.1", "north-2026.08.21.1"]);
    expect(r.releases[1].policies).toHaveLength(2);
    const s = await releases.select({ cohorts: ["north"] });
    expect(s.reaches.stacks).toBe(3106);
    expect(reachesWords(s, (b) => `${Math.round(b / 1e9)} GB`)).toBe("Reaches 212 subjects, 240 studies, 3,106 stacks, 118,400 files (16 GB).");
    const made = await releases.make({ name: "north-2026.09.15.1", out: "/exports/north-2026.09.15.1", cohorts: ["north"] });
    expect(made.job).toBe(12);
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/api/releases?limit=50"],
      ["POST", "/api/select"],
      ["POST", "/api/releases"],
    ]);
  });
});

describe("a cohort's card", () => {
  it("leads with what waits, then empty, then new, then sorted, and retired above all", () => {
    expect(cohortState(list[0], NOW.getTime())).toEqual({ words: "62 wait", tone: "caution" });
    expect(cohortState(list[1], NOW.getTime())).toEqual({ words: "new", tone: "brand" });
    expect(cohortState(list[2], NOW.getTime())).toEqual({ words: "sorted", tone: "ok", check: true });
    expect(cohortState(list[3], NOW.getTime())).toEqual({ words: "empty", tone: "neutral" });
    expect(cohortState({ ...list[2], retired_at: "2026-09-14T00:00:00Z" }, NOW.getTime()).words).toBe("retired");
    // a day later the promoted cohort is sorted, and one with waiting stacks waits even when new
    expect(cohortState(list[1], NOW.getTime() + 2 * 24 * 3600 * 1000).words).toBe("sorted");
    expect(cohortState({ ...list[1], waiting: 3 }, NOW.getTime()).words).toBe("3 wait");
  });
  it("says where its members come from", () => {
    expect(provenanceWords(list[0], NOW)).toBe("fed by the dataset north-3t · last joined today 08:40".replace("08:40", new Date("2026-09-15T08:40:00Z").toTimeString().slice(0, 5)));
    expect(provenanceLine(list[1], NOW)).toEqual({ icon: "search", lead: "promoted from the card", name: "north at 7T", tail: "v2 · today " + new Date("2026-09-15T11:58:00Z").toTimeString().slice(0, 5) });
    expect(provenanceWords(list[2], NOW)).toBe("by hand astrid · 40 subjects from a list · 3 Sept");
    expect(provenanceWords(list[3], NOW)).toBe("fed by the dataset ct-lab · nothing read yet");
    expect(provenanceWords({ ...list[3], from: { kind: "import", detail: { file: "visits.csv" } } }, NOW)).toBe("from a clinical import visits.csv · 10 Sept");
    // a detail given as one word names the thing
    expect(provenanceLine({ ...list[0], from: { kind: "source", detail: "north-3t" } }, NOW).name).toBe("north-3t");
  });
  it("ends with its releases, owner and age, and says what fills an empty one", () => {
    expect(metaWords(list[0], NOW)).toBe("1 release · owner astrid · since 11 May");
    expect(metaWords(list[1], NOW)).toMatch(/^no release yet · owner astrid · since today/);
    expect(metaWords(list[3], NOW)).toBe("fills when ct-lab is digested");
    expect(metaWords({ ...list[2], releases: 2, owner: null }, NOW)).toBe("2 releases · since 3 Sept");
  });
  it("has a lede on its own page", () => {
    expect(ledeWords(list[0], NOW)).toBe("Fed by the dataset north-3t since 11 May. Owner astrid. Every subject a digest of that folder brings in joins here.");
    expect(ledeWords(list[2], NOW)).toBe("Made by hand by astrid on 3 Sept. Owner erik. Members are added and taken out with a reason.");
    expect(ledeWords({ ...list[1], retired_at: "2026-09-15T13:00:00Z" }, NOW)).toMatch(/^Promoted from the card north at 7T v2 on today .*The card keeps its version and epoch on every membership\. Retired today .*: its members and history stay\.$/);
  });
});

describe("members over time", () => {
  it("steps up at each join and down at each leave, oldest first, carried to today", () => {
    const joins: Join[] = [
      { when: "2026-09-03T00:00:00Z", what: "taken out", subjects: 10, left: true, by: "astrid" },
      { when: "2026-05-11T00:00:00Z", what: "first read", subjects: 50, by: "the rule" },
      { when: "2026-07-02T00:00:00Z", what: "batch", subjects: 50, by: "the rule" },
    ];
    const chart = stepChart(joins)!;
    expect(chart.points.map((p) => p.total)).toEqual([50, 100, 90]);
    expect(chart.points.map((p) => p.delta)).toEqual([50, 50, -10]);
    expect(chart.points.map((p) => p.x)).toEqual([60, 300, 540]);
    // the axis at 100, the top at 5: 100 of 100 is the top, 50 halfway
    expect(chart.points.map((p) => p.y)).toEqual([52.5, 5, 14.5]);
    expect(chart.line).toBe("60,52.5 300,52.5 300,5 540,5 540,14.5 600,14.5");
    expect(chart.area).toBe("60,100 60,52.5 300,52.5 300,5 540,5 540,14.5 600,14.5 600,100");
    expect(chart.end).toEqual({ x: 600, y: 14.5 });
  });
  it("draws one join as a flat line, and nothing when nothing joined", () => {
    const one = stepChart([{ when: "2026-05-11T00:00:00Z", what: "first read", subjects: 92, by: "the rule" }])!;
    expect(one.points).toHaveLength(1);
    expect(one.line).toBe("60,5 600,5");
    expect(stepChart([])).toBeNull();
    // the fixture's five events end at 212 members
    expect(stepChart(north.joins)!.points.map((p) => p.total)).toEqual([92, 135, 176, 174, 212]);
  });
  it("labels the first and the last step always, thins the ones between so no two draw within 60 of each other or over each other, and writes today only where it clears the last", () => {
    const monthly: Join[] = Array.from({ length: 12 }, (_, i) => ({ when: `2025-${String(i + 1).padStart(2, "0")}-10T00:00:00Z`, what: "batch", subjects: 10, by: "the rule" }));
    const labels = chartLabels(stepChart(monthly)!, NOW);
    const steps = labels.filter((l) => l.kind === "step");
    expect(steps[0]).toMatchObject({ x: 60, total: 10, words: "10 Jan 2025 · first", anchor: "start" });
    expect(steps[steps.length - 1]).toMatchObject({ x: 540, total: 120, words: "10 Dec 2025" });
    expect(steps.length).toBeLessThan(12);
    for (let i = 1; i < labels.length; i++) expect(labels[i].x - labels[i - 1].x, `${labels[i - 1].words} then ${labels[i].words}`).toBeGreaterThanOrEqual(60);
    // a date at the last step, 60 before the end, never clears "today" written back from the end: today gives way, the end dot marks it
    expect(labels[labels.length - 1]).toMatchObject({ kind: "step", x: 540 });
    // a last step of today, at 540, would draw its time over today at 600: today gives way
    const recent: Join[] = [
      { when: "2026-05-11T00:00:00Z", what: "first read", subjects: 50, by: "the rule" },
      { when: "2026-09-15T05:39:00Z", what: "batch", subjects: 4, by: "the rule" },
    ];
    const words = chartLabels(stepChart(recent)!, NOW).map((l) => l.words);
    expect(words[0]).toBe("11 May · first");
    expect(words[1]).toMatch(/^today \d\d:\d\d$/u);
    expect(words).toHaveLength(2);
    // one join long ago: its label and today
    expect(chartLabels(stepChart([monthly[0]])!, NOW).map((l) => l.words)).toEqual(["10 Jan 2025 · first", "today"]);
    // thirty steps sixteen apart: the first and the last are named, the steps too near the last give way, and every label keeps its distance
    const dense: Join[] = Array.from({ length: 30 }, (_, i) => ({ when: new Date(Date.UTC(2025, 0, 1 + i * 7)).toISOString(), what: "batch", subjects: 2, by: "the rule" }));
    const thinned = chartLabels(stepChart(dense)!, NOW);
    expect(thinned[0].x).toBe(60);
    expect(thinned[thinned.length - 1]).toMatchObject({ kind: "step", x: 540 });
    expect(thinned.length).toBeGreaterThan(2);
    for (let i = 1; i < thinned.length; i++) expect(thinned[i].x - thinned[i - 1].x).toBeGreaterThanOrEqual(60);
  });
});

describe("adding and taking out by hand", () => {
  it("wants codes and a reason, and never both ways for one code", () => {
    expect(membersBody("", "", "why")).toEqual({ ok: false, why: "codes to add or take out, one per line" });
    expect(membersBody("A001\nA002", "", "")).toEqual({ ok: false, why: "a reason; it is recorded on every membership" });
    expect(membersBody("A001", "A001", "why")).toEqual({ ok: false, why: "A001 is both added and taken out" });
    expect(membersBody("A001, A002\nA002", "B009", " consent withdrawn ")).toEqual({ ok: true, body: { add: ["A001", "A002"], remove: ["B009"], why: "consent withdrawn" }, summary: "2 added, 1 taken out" });
  });
});

describe("a new release", () => {
  const source = (name: string, dates: "keep" | "shift" | "year", uids: "remap" | "preserve", deface = false): Source =>
    ({ id: 1, name, path: `/data/${name}`, guarantees: {}, probed: null, handling: { arrives: "identified", on_release: { dates, uids, deface } }, handling_declared: true, roots: 1, digests: { count: 1, first: null, last: null, recent: [] }, totals: { subjects: 1, studies: 1, sessions: 1, stacks: 1, refused_files: 0, to_sort: 0 } }) as Source;
  it("is named for what it is of, the day and the next number", () => {
    const day = new Date("2026-09-15T12:00:00");
    expect(suggestedName("north", [], day)).toBe("north-2026.09.15.1");
    expect(suggestedName("north", [{ name: "north-2026.09.15.1" }, { name: "north-2026.09.14.1" }], day)).toBe("north-2026.09.15.2");
    expect(suggestedName("North at 7T", [], day)).toBe("north-at-7t-2026.09.15.1");
    expect(suggestedName("  ", [], day)).toBe("release-2026.09.15.1");
  });
  it("says how the files of each dataset leave, from that dataset's own handling", () => {
    const sources = [source("north-3t", "shift", "remap"), source("archive-2019", "year", "preserve", true)];
    expect(leavingLines(sources, north.sources_holding)).toEqual([
      { dataset: "north-3t", words: "dates shifted, one offset per subject · UIDs remapped · faces kept", note: "the dataset's handling" },
      { dataset: "archive-2019", words: "dates cut to the year · UIDs kept · faces removed", note: "6 subjects have files there too" },
    ]);
    // a dataset the sources door did not list says so; a card's answer lists every dataset
    expect(leavingLines([sources[0]], north.sources_holding)[1].words).toBe("handling not read");
    expect(leavingLines(sources, null).map((l) => l.dataset)).toEqual(["north-3t", "archive-2019"]);
    expect(leavingLines([source("x", "keep", "remap")], null)[0].words).toBe("dates kept · UIDs remapped · faces kept");
  });
  it("reads a release row's policy from its own columns, else from what it recorded per dataset", () => {
    const rows = (releasesFixture as { releases: Release[] }).releases;
    expect(policyWords(rows[0])).toEqual({ dates: "to the year", uids: "remapped" });
    expect(policyWords(rows[1])).toEqual({ dates: "shifted", uids: "remapped" });
    expect(policyWords({ ...rows[1], dates: "keep", uids: "preserve" })).toEqual({ dates: "kept", uids: "kept" });
    expect(policyWords({ ...rows[1], policies: undefined })).toEqual({ dates: "", uids: "" });
  });
});
