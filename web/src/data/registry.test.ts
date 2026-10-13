// SPDX-License-Identifier: AGPL-3.0-only
// Data, Browse (Wave 7a, spec 13.1; record 55 H3): the dataset viewer over
// the whole registry, subjects then sessions then scans, through the
// registry's own doors (GET /api/subjects, /api/subjects/{id}/sessions,
// /api/sessions/{id}/stacks and /api/scans), at its own address, offered in
// the side where the engine serves them.

import { afterEach, describe, expect, it, vi } from "vitest";
import { capsFor } from "../campaigns/caps.fixture";
import { sections } from "../sections";
import { mayBrowse, mayGrid, REGISTRY, scopeHome, scopeList, viewerDoors, viewHref } from "./viewer";

const BROWSE = ["GET /api/subjects", "GET /api/subjects/{id}/sessions", "GET /api/sessions/{id}/stacks", "GET /api/scans", "GET /api/sources"];
const caps = capsFor({ doors: BROWSE, grants: ["data:see"] });

afterEach(() => vi.unstubAllGlobals());

function asked(): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ total: 0, scans: [], next: null, subjects: [], visits: [], totals: {}, facets: {} }), { status: 200, headers: { "content-type": "application/json" } });
  });
  return urls;
}

describe("Browse", () => {
  it("lives at its own address, the view kept in the query", () => {
    expect(viewHref(REGISTRY)).toBe("#data/browse?mode=grid");
    expect(viewHref(REGISTRY, { subject: 12, visit: "s34" })).toBe("#data/browse?mode=grid&subject=12&visit=s34");
    expect(scopeHome(REGISTRY)).toBe("#data/browse");
    expect(scopeList(REGISTRY).label).toBe("Data");
  });

  it("is offered where the engine serves the registry's doors and the person reads Data", () => {
    expect(mayBrowse(caps, REGISTRY)).toBe(true);
    expect(mayGrid(caps, REGISTRY)).toBe(true);
    expect(mayBrowse(capsFor({ doors: BROWSE, grants: ["review:see"] }), REGISTRY)).toBe(false);
    expect(mayGrid(capsFor({ doors: BROWSE.filter((d) => d !== "GET /api/subjects"), grants: ["data:see"] }), REGISTRY)).toBe(false);
    const data = sections(caps).find((s) => s.id === "data");
    expect(data?.pages?.map((p) => p.title)).toEqual(["Datasets and cohorts", "Browse"]);
    expect(sections(capsFor({ doors: ["GET /api/sources"], grants: ["data:see"] })).find((s) => s.id === "data")?.pages?.map((p) => p.title)).toEqual(["Datasets and cohorts"]);
  });

  it("reads the subjects, a subject's sessions, a session's scans and every scan through the registry's doors", async () => {
    const urls = asked();
    await viewerDoors.subjects(REGISTRY, { q: "", show: "code", order: "code", filter: ["look"] });
    await viewerDoors.visits(REGISTRY, 12, { name: "date", show: "code", filter: [] });
    await viewerDoors.visit(REGISTRY, "s34");
    await viewerDoors.visit(REGISTRY, "t7.8", false);
    await viewerDoors.tree(REGISTRY, 500);
    expect(urls).toEqual([
      "/api/subjects?limit=60&order=code&show=code&filter=look",
      "/api/subjects/12/sessions?name=date&show=code",
      "/api/sessions/34/stacks?limit=200&pictures=1",
      "/api/sessions/none/stacks?studies=7%2C8&limit=200",
      "/api/scans?limit=200&after=500",
    ]);
  });

  it("leaves a dataset's and a cohort's doors as they were", async () => {
    const urls = asked();
    await viewerDoors.visit({ kind: "dataset", name: "ms-a" }, "s34", false);
    await viewerDoors.tree({ kind: "cohort", name: "north" });
    expect(urls).toEqual(["/api/datasets/ms-a/scans?session=34&limit=200", "/api/cohorts/north/scans?limit=200"]);
  });
});
