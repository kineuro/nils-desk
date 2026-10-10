// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's filters as questions, against a live engine (Wave 7a,
// 2026-10-10): for every dataset and cohort, the subjects, visits and scans
// the viewer's own doors answer for each filter they offer are the rows the
// question keep.ts writes for that filter answers, key for key; and a filter
// no question asks is named rather than written. Skipped unless an engine
// is named:
//
//   KEEP_ENGINE=http://127.0.0.1:18611 npx vitest run src/data/keep.live.test.ts
//
// KEEP_TOKEN carries a bearer token where the engine asks for one. It keeps
// documents and runs them, so it is run against a throwaway registry (nils
// synth with datasets planted), never one that holds work.

import { beforeAll, describe, expect, it } from "vitest";
import { ask, door } from "../ask/client";
import { filterWords, matches } from "./tree";
import { browserKept, countOf, keepDoors, scansKept, subjectsKept, unasked, visitsKept, type Kept } from "./keep";
import { foundIds, viewerDoors, type Scope, type SubjectsAsk } from "./viewer";
import type { Scan } from "./scans";

const ENGINE = process.env.KEEP_ENGINE ?? "";
const TOKEN = process.env.KEEP_TOKEN ?? "";
const say = (line: string) => console.log(`keep: ${line}`);

/** Every subject the subjects door answers for an ask, page after page. */
async function doorSubjects(scope: Scope, filter: string[], q = ""): Promise<number[]> {
  const ask: SubjectsAsk = { q, show: "code", order: "code", filter };
  const out: number[] = [];
  let after: number | null = null;
  for (let i = 0; i < 100; i++) {
    const p = await viewerDoors.subjects(scope, ask, after);
    out.push(...p.subjects.map((s) => s.id));
    if (p.next === null) break;
    after = p.next;
  }
  return out.sort((a, b) => a - b);
}

/** Every key a question answers: kept, run and read page after page. */
async function questionKeys(k: Kept): Promise<number[]> {
  const id = await keepDoors.store(k.document);
  const run = await ask.run(id);
  expect(run.truncated, "a whole answer").toBe(false);
  const out = run.rows.map((r) => Number(r[0]));
  for (let page = 1; page < run.pages; page++) out.push(...(await ask.rows(run.handle, page)).rows.map((r) => Number(r[0])));
  const counted = countOf(await keepDoors.count(k.document), String((k.document.out as { set: string }).set));
  expect(counted?.rows, "the count is the run's").toBe(run.row_count);
  return out.sort((a, b) => a - b);
}

describe.skipIf(!ENGINE)("the viewer's filters as questions, on a live engine", () => {
  const scopes: Scope[] = [];
  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(`${ENGINE}${String(input)}`, { ...init, headers: { ...(init?.headers as Record<string, string>), ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) } })) as typeof fetch;
    const listed = await door<{ sources: { name: string; dataset?: { kind?: string } | null }[] }>("GET", "/api/sources");
    const places = await door<{ places?: { name: string; role: string; dataset?: { kind?: string } }[] }>("GET", "/api/places").catch(() => ({ places: [] }));
    const roots = new Set((places.places ?? []).filter((p) => p.role === "source" && p.dataset?.kind === "root").map((p) => p.name));
    for (const s of listed.sources) if (!roots.has(s.name)) scopes.push({ kind: "dataset", name: s.name });
    const cohorts = await door<{ name: string; retired_at: string | null }[] | { cohorts: { name: string; retired_at: string | null }[] }>("GET", "/api/cohorts");
    for (const c of Array.isArray(cohorts) ? cohorts : cohorts.cohorts) if (!c.retired_at) scopes.push({ kind: "cohort", name: c.name });
    say(`scopes ${scopes.map((s) => `${s.kind} ${s.name}`).join(", ")}`);
  });

  it("asks the subjects every filter of the subjects grid leaves, alone and together", { timeout: 300_000 }, async () => {
    let compared = 0;
    for (const scope of scopes) {
      const first = await viewerDoors.subjects(scope, { q: "", show: "code", order: "code", filter: [] });
      const offered = [
        "visits2",
        ...first.facets.roles.map((r) => `main:${r.name}`),
        ...first.facets.regions.map((r) => `region:${r.name}`),
        ...first.facets.makers.map((m) => `maker:${m.name}`),
      ];
      const roles = first.facets.roles.map((r) => `main:${r.name}`);
      const makers = first.facets.makers.map((m) => `maker:${m.name}`);
      const asks: string[][] = [[], ...offered.map((f) => [f]), roles, makers.slice(0, 2), ["visits2", ...roles.slice(0, 1), ...makers.slice(0, 1)]];
      for (const filter of asks) {
        const want = await doorSubjects(scope, filter);
        const k = subjectsKept(scope, { found: null, filter }, { shown: want.length });
        expect(unasked(k), `${scope.name} ${filter}`).toEqual([]);
        expect(await questionKeys(k), `${scope.kind} ${scope.name} [${filter.join(",")}]`).toEqual(want);
        compared += 1;
      }
      // the search, by part of a code
      const code = first.subjects[0]?.code;
      if (code) {
        const q = code.slice(-3);
        const want = await doorSubjects(scope, [], q);
        const found = await foundIds(scope, { q, show: "code", order: "look", filter: [] });
        expect(await questionKeys(subjectsKept(scope, { found, filter: [] }, { shown: want.length })), `${scope.name} q=${q}`).toEqual(want);
        compared += 1;
      }
      // what no question asks is named, not written
      expect(unasked(subjectsKept(scope, { found: null, filter: ["look"] }, { shown: null })).map((x) => x.key)).toEqual(["look"]);
    }
    say(`${compared} subject questions match the subjects door`);
    expect(compared).toBeGreaterThan(0);
  });

  it("asks one subject's visits each filter of the visits grid leaves", { timeout: 300_000 }, async () => {
    let compared = 0;
    for (const scope of scopes) {
      const first = await viewerDoors.subjects(scope, { q: "", show: "code", order: "visits", filter: [] });
      for (const subject of first.subjects.slice(0, 3)) {
        for (const filter of [[], ["symri"], ["region:brain"], ["region:spine"], ["symri", "region:brain"]]) {
          const page = await viewerDoors.visits(scope, subject.id, { name: "date", show: "code", filter });
          const k = visitsKept(scope, { id: subject.id, label: subject.code }, filter, page.visits, page.matched);
          const want = page.visits.filter((v) => v.session !== null).map((v) => v.session as number).sort((a, b) => a - b);
          expect(await questionKeys(k), `${scope.name} subject ${subject.id} [${filter}]`).toEqual(want);
          compared += 1;
        }
        const contrast = visitsKept(scope, { id: subject.id, label: subject.code }, ["contrast"], null, null);
        expect(unasked(contrast).map((x) => x.key)).toEqual(["contrast"]);
      }
    }
    say(`${compared} visit questions match the visits door`);
    expect(compared).toBeGreaterThan(0);
  });

  it("asks one visit's scans as the scans door lists them", { timeout: 300_000 }, async () => {
    let compared = 0;
    for (const scope of scopes) {
      const first = await viewerDoors.subjects(scope, { q: "", show: "code", order: "visits", filter: [] });
      for (const subject of first.subjects.slice(0, 2)) {
        const page = await viewerDoors.visits(scope, subject.id, { name: "date", show: "code", filter: [] });
        for (const v of page.visits.slice(0, 3)) {
          const scans = await viewerDoors.visit(scope, v.key, false);
          const k = scansKept(scope, { subject: subject.id, subjectLabel: subject.code, visit: v.key, label: v.label, number: v.number, studies: v.studies, session: v.session }, scans.scans, scans.total);
          const want = scans.scans.filter((s) => s.axes.disposition !== "excluded").map((s) => s.id).sort((a, b) => a - b);
          expect(await questionKeys(k), `${scope.name} ${v.key}`).toEqual(want);
          compared += 1;
        }
      }
    }
    say(`${compared} visit scan questions match the scans door`);
    expect(compared).toBeGreaterThan(0);
  });

  it("names the scans the browser's words leave, and the scope's whole without words", { timeout: 300_000 }, async () => {
    let compared = 0;
    for (const scope of scopes) {
      const all: Scan[] = [];
      let after: number | null = null;
      let total = 0;
      for (let i = 0; i < 200; i++) {
        const p = await viewerDoors.tree(scope, after);
        all.push(...p.scans);
        total = p.total;
        if (p.next === null) break;
        after = p.next;
      }
      for (const text of ["", "t1w", "flair axial"]) {
        const words = filterWords(text);
        const left = words.length > 0 ? all.filter((s) => matches(s, words)) : all;
        const k = browserKept(scope, words, left, { read: all.length, total });
        const want = left.filter((s) => s.axes.disposition !== "excluded").map((s) => s.id).sort((a, b) => a - b);
        expect(await questionKeys(k), `${scope.name} "${text}"`).toEqual(want);
        expect(k.shown).toBe(want.length);
        compared += 1;
      }
    }
    say(`${compared} browser questions match the scans the browser shows`);
    expect(compared).toBeGreaterThan(0);
  });
});
