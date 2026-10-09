// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Datasets and cohorts on one page (Wave 7a, the design of 2026-10-09), as
// it draws against an engine: two bands, a card's only button View, the
// first card that needs a person chosen on arrival with its next step the
// one primary button; a cohort chosen lights up the datasets that feed it
// and dims the rest, a dataset the cohorts it brings subjects into; the
// chosen card again lets go; a dataset's detail with where it is, what it
// holds, its main scans and its log with the running job and its Stop; a
// cohort's detail with how it grew, where its subjects come from and what
// they have; and on the surface subjects, never people, and no engine word.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { caps7a, dialogs, engine, settle, type Call } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import type { Cohort, CohortDetail } from "./cohorts";
import { DataPage, chosenOf, firstChoice } from "./DataPage";
import type { Dataset } from "./datasets";
import { makingRefusal, nameRefusal } from "./NewCohort";
import type { DatasetSummary, SummaryStep } from "./summary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.restoreAllMocks();
});

const DOORS = [
  "GET /api/sources",
  "GET /api/cohorts",
  "GET /api/cohorts/{name}",
  "GET /api/datasets/{name}/summary",
  "GET /api/datasets/{name}/scans",
  "GET /api/jobs",
  "POST /api/jobs",
  "POST /api/jobs/{id}/cancel",
  "GET /api/picks/summary",
  "POST /api/cohorts",
  "PUT /api/cohorts/{name}",
  "POST /api/cohorts/{name}/members",
  "POST /api/releases",
  "PUT /api/places/{id}",
];

const AT = "2026-10-09T10:00:00Z";

function ds(name: string, id: number, over: Partial<Dataset> & { dataset?: unknown } = {}): Dataset {
  return {
    id,
    name,
    path: `/srv/in/${name}`,
    guarantees: {},
    probed: null,
    handling: { arrives: "deidentified", on_release: { uids: "preserve", deface: false } },
    handling_declared: false,
    roots: 1,
    arrives: "deidentified",
    patient_id: "subject-code",
    subjects: "generated",
    held: null,
    cohort: null,
    // the sources door says the dataset twice: its fields at the top, and the whole of it as the place declares it
    dataset: { kind: "dataset", state: "anonymised", root: "incoming", arrives: "deidentified", patient_id: "subject-code", subjects: "generated" },
    trees: { originals: null, anon: { path: `/srv/in/${name}/derivatives/dcm-anon`, files: 120, last_written: null } },
    digests: { count: 1, first: null, last: null, recent: [{ id: id * 10, name: `${name}-2026-10-09`, state: "done", started_at: AT, finished_at: AT, job_id: id, files: { seen: 120, new: 120, changed: 0, unchanged: 0, refused: 0 }, subjects_added: 12, stacks_added: 30, classified: 30, to_sort: 0 }] },
    totals: { subjects: 12, studies: 20, sessions: 20, stacks: 30, refused_files: 0, to_sort: 0, sure: 30, unsorted: 0 },
    ...over,
  } as Dataset;
}

const done = ds("ward-f", 7);
const looked = ds("study-big", 3, { cohort: "ms-followup", totals: { subjects: 12, studies: 20, sessions: 20, stacks: 40, refused_files: 1, to_sort: 8, sure: 32, unsorted: 0 } });
const loose = ds("ward-c", 4, { arrives: "undeclared", patient_id: null, subjects: null, dataset: { kind: "dataset", state: "unknown", root: "incoming", arrives: "undeclared", patient_id: null, subjects: null }, trees: { originals: null, anon: null }, digests: { count: 0, first: null, last: null, recent: [] }, totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 } });

const step = (name: SummaryStep["step"], over: Partial<SummaryStep> = {}): SummaryStep => ({ step: name, state: "done", job: null, started_at: AT, finished_at: AT, progress: null, ...over });

function summaryOf(d: Dataset, running = false): DatasetSummary {
  const scans = d.totals.stacks;
  return {
    dataset: d.name,
    dataset_id: d.id,
    detail: "sensitive",
    state: d.name === "ward-c" ? "unknown" : "anonymised",
    added_at: AT,
    subjects: d.totals.subjects,
    sessions: d.totals.sessions,
    studies: d.totals.studies,
    scans,
    sure: d.totals.sure ?? 0,
    need_a_look: d.totals.to_sort,
    unsorted: 0,
    look_kinds: {},
    kinds: scans > 0 ? [{ kind: "T1w", scans: 16 }, { kind: "FLAIR", scans: 8 }] : [],
    body_regions: [],
    files: { found: d.trees?.anon?.files ?? null, bytes: 5_000_000, read: 120, refused: d.totals.refused_files, refused_batch: d.totals.refused_files > 0 ? 30 : null, held: 0 },
    pictures_place: "working",
    steps:
      scans === 0
        ? [step("found", { state: "waiting", files: null }), step("read", { state: "waiting", reads: 0, files: 0, refused: 0 }), step("sorted", { state: "waiting", scans: 0, of: 0 }), step("main_scans", { state: "waiting", picked: 0, borders: 0 }), step("pictures", { state: "waiting", made: 0, of: 0 }), step("views", { state: "waiting", made: 0, of: 0 })]
        : [
            step("found", { files: 120, tree: "anon" }),
            step("read", { job: 4, files: 120, refused: d.totals.refused_files, reads: 1 }),
            step("sorted", { job: 6, scans, of: scans, look: d.totals.to_sort, unsorted: 0 }),
            step("main_scans", { job: 8, picked: 28, borders: 2 }),
            step("pictures", { job: 6, made: scans, of: scans, in_sort: true }),
            running ? step("views", { state: "running", job: 9, finished_at: null, progress: { done: 12, total: 40 }, made: 12, of: scans }) : step("views", { job: 9, made: scans, of: scans }),
          ],
  };
}

const cohorts: Cohort[] = [
  {
    name: "ms-followup",
    owner: "anna",
    description: "the follow-up visits of the MS group",
    subjects: 16,
    sessions: 24,
    stacks: 52,
    feeds: ["study-big"],
    from: { kind: "source", detail: { dataset: "study-big", batch: 30 } },
    waiting: 3,
    releases: 1,
    created_at: "2026-09-12T10:00:00Z",
    last_joined: AT,
    retired_at: null,
    parts: [
      { from: "dataset", dataset: "study-big", subjects: 12 },
      { from: "hand", dataset: null, subjects: 4 },
    ],
    datasets: [
      { name: "study-big", subjects: 12, scans: 40, feeds: true },
      { name: "ward-f", subjects: 4, scans: 12, feeds: false },
    ],
  },
  {
    name: "qc-sample",
    owner: "anna",
    description: null,
    subjects: 5,
    sessions: null,
    stacks: 10,
    feeds: [],
    from: { kind: "manual", detail: { actor: "anna" } },
    waiting: 0,
    releases: 0,
    created_at: AT,
    last_joined: AT,
    retired_at: null,
    parts: [{ from: "hand", dataset: null, subjects: 5 }],
    datasets: [{ name: "ward-f", subjects: 5, scans: 10, feeds: false }],
  },
];

const detail: CohortDetail = {
  ...cohorts[0],
  joins: [
    { when: "2026-10-09T09:00:00Z", what: "manual", subjects: 4, by: "anna", reason: "asked" },
    { when: "2026-09-12T10:00:00Z", what: "digest", subjects: 12, by: "anna", batch: 30, dataset: "study-big" },
  ],
  sources_holding: [{ place: "study-big", subjects: 12 }],
  releases: [{ id: 1, name: "ms-followup-r1", layout: "bids", subjects: 12, finished_at: "2026-10-05T10:00:00Z", handed_over: true }],
  clinical: [
    { kind: "EDSS", primary: true, subjects: 10 },
    { kind: "Relapse", primary: false, subjects: 3 },
  ],
};

const jobsOfBig = [
  { id: 9, kind: "pyramid", name: "pictures after job 6", state: "running", started_at: AT, heartbeat_at: null, finished_at: null, progress: { done: 12, total: 40 }, error: null, args: { queued: ["pyramid", "build", "--classified", "6"], principal: "anna" }, result: null },
  { id: 8, kind: "pick", name: "sort:6", state: "done", started_at: AT, heartbeat_at: null, finished_at: "2026-10-09T10:04:00Z", progress: null, error: null, args: {}, result: { subjects: 12 } },
  { id: 4, kind: "digest", name: "study-big-2026-10-09", state: "done", started_at: AT, heartbeat_at: null, finished_at: "2026-10-09T10:01:00Z", progress: { batch_id: 30, ingested: 120, changed: 0, subjects_created: 12 }, error: null, args: {}, result: null },
];

type Answer = { status: number; body?: unknown } | undefined;

async function page(opts: { grants?: readonly Grant[]; list?: Dataset[]; query?: Record<string, string>; running?: boolean; route?: (c: Call, nth: number) => Answer } = {}) {
  const list = opts.list ?? [done, looked, loose];
  const e = engine((c, nth) => {
    const routed = opts.route?.(c, nth);
    if (routed) return routed;
    const url = new URL(c.url, "http://x");
    if (c.method === "GET" && url.pathname === "/api/sources") return { status: 200, body: { count: list.length, window_days: 30, sources: list, rates: null } };
    if (c.method === "GET" && url.pathname === "/api/cohorts") return { status: 200, body: cohorts };
    const sum = /^\/api\/datasets\/([^/]+)\/summary$/.exec(url.pathname);
    if (c.method === "GET" && sum) {
      const d = list.find((x) => x.name === decodeURIComponent(sum[1]));
      return d ? { status: 200, body: summaryOf(d, opts.running === true && d.name === "study-big") } : { status: 404, body: { error: "no dataset" } };
    }
    if (c.method === "GET" && url.pathname === "/api/jobs") {
      const dataset = url.searchParams.get("dataset");
      if (dataset === "study-big") return { status: 200, body: { count: 3, jobs: opts.running ? jobsOfBig : jobsOfBig.slice(1) } };
      if (dataset) return { status: 200, body: { count: 0, jobs: [] } };
      return { status: 200, body: { count: 0, jobs: url.searchParams.get("all") ? [] : opts.running ? [jobsOfBig[0]] : [] } };
    }
    if (c.method === "GET" && url.pathname === "/api/picks/summary") {
      if (url.searchParams.get("cohort")) return { status: 200, body: { cohort: "ms-followup", subjects: 16, roles: { t1w: { picked: 14, clear: 12, tied: 0, borders: {}, review_items: 2, subjects: 11 }, flair: { picked: 9, clear: 9, tied: 0, borders: {}, review_items: 0, subjects: 9 } } } };
      return { status: 200, body: { dataset: url.searchParams.get("dataset"), roles: { t1w: { picked: 20, clear: 17, tied: 1, borders: { too_close: 2 }, review_items: 2, subjects: 12 } } } };
    }
    if (c.method === "GET" && url.pathname === "/api/cohorts/ms-followup") return { status: 200, body: detail };
    return undefined;
  });
  act(() => root.render(<DataPage caps={caps7a(DOORS, opts.grants ?? GRANTS)} install={null} onChanged={() => undefined} query={opts.query} />));
  await settle(10);
  return e;
}

const card = (name: string) => [...host.querySelectorAll<HTMLElement>(".dp-card")].find((c) => c.querySelector(".dp-pick")?.textContent === name)!;
const text = () => host.querySelector("section.dp")!.textContent ?? "";

describe("datasets and cohorts on one page", () => {
  it("draws two bands, and on each card the only button is View", async () => {
    await page();
    expect(host.querySelector("h1")?.textContent).toBe("Datasets and cohorts");
    const heads = [...host.querySelectorAll(".dp-band-head")].map((h) => h.textContent);
    expect(heads).toEqual(["Datasetswhere the files come from", "Cohortsgroups of subjects, from any dataset"]);
    expect(host.querySelectorAll(".dp-grid.datasets .dp-card")).toHaveLength(3);
    expect(host.querySelectorAll(".dp-grid.cohorts .dp-card")).toHaveLength(2);
    for (const c of host.querySelectorAll(".dp-card")) {
      // the name chooses the card; the one action is View
      expect([...c.querySelectorAll("button")].map((b) => b.className)).toEqual(["dp-pick"]);
      expect(c.querySelectorAll("a").length + c.querySelectorAll(".dp-view[aria-disabled]").length).toBe(1);
    }
    expect(card("study-big").querySelector("a.dp-view")?.getAttribute("href")).toBe("#data/datasets/study-big/view");
    // nothing to view yet: View is there and says so
    expect(card("ward-c").querySelector(".dp-view")?.getAttribute("aria-disabled")).toBe("true");
    expect(card("ms-followup").querySelector("a.dp-view")?.getAttribute("href")).toBe("#data/cohorts/ms-followup/view");
    // the head: a new cohort beside adding a dataset, the dataset the primary one
    expect(host.querySelector(".data-head .button.secondary")?.textContent).toBe("New cohort");
    expect(host.querySelector(".data-head .button:not(.secondary)")?.textContent).toBe("Add a dataset");
  });

  it("says each dataset's state, numbers, six steps and how sure the sort is", async () => {
    await page();
    const big = card("study-big");
    expect(big.querySelector(".tag")?.textContent).toBe("Ready");
    expect([...big.querySelectorAll(".dp-nums > span")].map((s) => s.textContent)).toEqual(["120files", "12subjects", "40scans"]);
    expect([...big.querySelectorAll(".dp-rail > span")].map((s) => s.className)).toEqual(["done", "done", "done", "done", "done", "done"]);
    expect(big.querySelector(".dp-line")?.textContent).toBe("32 sure · 8 need a look");
    expect(big.querySelector(".dp-feeds")?.textContent).toBe("feeds ms-followup");
    const c = card("ward-c");
    expect(c.querySelector(".tag")?.textContent).toBe("Unknown");
    expect(c.querySelector(".dp-nums b")?.textContent).toBe("?");
    expect(c.querySelector(".dp-line")?.textContent).toBe("Loose files: choose where they go");
    const ms = card("ms-followup");
    expect(ms.querySelector(".tag")?.textContent).toBe("fed by study-big");
    expect(ms.querySelector(".dp-big")?.textContent).toBe("16subjects · 24 visits · 52 scans");
    expect([...ms.querySelectorAll(".dp-legend > span")].map((s) => s.textContent)).toEqual(["study-big 12", "by hand 4"]);
    expect(ms.querySelector(".dp-foot .dp-line")?.textContent).toBe("3 wait on Review · 1 release");
    // a cohort nobody built the visits of says its scans alone
    expect(card("qc-sample").querySelector(".dp-big")?.textContent).toBe("5subjects · 10 scans");
  });

  it("chooses the first dataset that needs a person, with its next step the one primary button", async () => {
    await page();
    const d = host.querySelector<HTMLElement>(".dp-detail")!;
    expect(d.getAttribute("aria-label")).toBe("study-big");
    expect(card("study-big").className).toContain("on");
    const primary = [...d.querySelectorAll<HTMLElement>(".dp-acts .button")].filter((b) => !b.classList.contains("secondary") && !b.classList.contains("quiet"));
    expect(primary.map((b) => b.textContent)).toEqual(["Review 8"]);
    expect(primary[0].getAttribute("href")).toBe("#review?dataset=study-big");
    expect([...d.querySelectorAll(".dp-acts .button.secondary")].map((b) => b.textContent)).toEqual(["Read new files", "View"]);
    expect(d.querySelector(".dp-detail-where")?.textContent).toBe("incoming/study-big · anonymised · PatientID holds the subject code");
    // the cohorts it brings subjects into light up; the rest dim
    expect(card("ms-followup").className).toContain("rel");
    expect(card("ms-followup").querySelector(".dp-rel")?.textContent).toBe("12 of its subjects come from study-big");
    expect(card("qc-sample").className).toContain("dim");
    expect(card("qc-sample").querySelector(".dp-rel")?.textContent).toBe("none of its subjects are in study-big");
  });

  it("opens a dataset's detail: where it is, what it holds, its main scans and its log", async () => {
    await page();
    const d = host.querySelector<HTMLElement>(".dp-detail")!;
    expect([...d.querySelectorAll(".dp-step-title")].map((s) => s.textContent)).toEqual(["Found", "Read", "Sorted", "Main scans", "Pictures", "3D views"]);
    expect([...d.querySelectorAll(".dp-step-what")].map((s) => s.textContent)).toEqual(["120 files", "120 read · 1 refused", "40 scans · 8 to look at", "28 picked · 2 borders", "40 made", "40 made"]);
    expect(d.querySelector(".dp-funnel")?.textContent).toBe("12 subjects→20 visits→40 scans");
    expect(d.querySelector(".dp-sure-words")?.textContent).toBe("32 sure8 need a look");
    expect([...d.querySelectorAll(".dp-kind > span:first-child")].map((s) => s.textContent)).toEqual(["T1w", "FLAIR"]);
    const refused = [...d.querySelectorAll("a")].find((a) => a.textContent === "1 refused, why");
    expect(refused?.getAttribute("href")).toBe("#data/batch/30");
    expect(d.querySelector(".dp-role-line")?.textContent).toBe("T1w20 picked · 17 clear · 2 bordersReview 2");
    expect(d.querySelector(".dp-role-line a")?.getAttribute("href")).toBe("#review/picks?dataset=study-big");
    const log = [...d.querySelectorAll(".dp-log-row")].map((r) => `${r.querySelector(".what")?.textContent} ${r.querySelector(".how")?.textContent}`);
    expect(log).toEqual(["Main scans picked for 12 subjects", "Read 120 files, 12 new subjects", "Added as a dataset anonymised, PatientID holds the subject code"]);
  });

  it("shows the running job of a dataset with its progress and Stop, which asks the engine to stop it", async () => {
    const e = await page({ running: true, route: (c) => (c.method === "POST" && c.url === "/api/jobs/9/cancel" ? { status: 200, body: { job: 9, state: "cancelling" } } : undefined) });
    const d = host.querySelector<HTMLElement>(".dp-detail")!;
    const box = d.querySelector<HTMLElement>(".dp-running")!;
    expect(box.querySelector(".dp-running-head .grow")?.textContent).toBe("Preparing 3D views");
    expect(box.querySelector(".dp-progress")?.getAttribute("aria-valuenow")).toBe("30");
    expect(box.querySelector(".meta")?.textContent).toMatch(/^12 of 40 scans · .*in the background$/);
    // the step runs: its segment on the card and its node on the rail
    expect([...card("study-big").querySelectorAll(".dp-rail > span")].map((s) => s.className)[5]).toBe("run");
    expect(d.querySelector(".dp-step.running .dp-step-title")?.textContent).toBe("3D views");
    expect(d.querySelector(".dp-step.running .dp-step-when")?.className).toContain("now");
    act(() => [...box.querySelectorAll("button")].find((b) => b.textContent === "Stop")!.click());
    await settle();
    expect(e.of("POST", "/api/jobs/9/cancel")).toHaveLength(1);
    expect(text()).toContain("Preparing 3D views: stopping.");
  });

  it("chooses a cohort: the datasets that feed it light up and the rest dim, and its detail says how it grew and what its subjects have", async () => {
    await page();
    act(() => (card("ms-followup").querySelector(".dp-big") as HTMLElement).click());
    await settle(8);
    const d = host.querySelector<HTMLElement>(".dp-detail")!;
    expect(d.getAttribute("aria-label")).toBe("ms-followup");
    expect(card("study-big").className).toContain("rel");
    expect(card("study-big").querySelector(".dp-rel")?.textContent).toBe("feeds it · 12 of its subjects");
    expect(card("ward-f").querySelector(".dp-rel")?.textContent).toBe("holds 4 of its subjects");
    expect(card("ward-c").className).toContain("dim");
    expect(card("ward-c").querySelector(".dp-rel")?.textContent).toBe("holds none of its subjects");
    // the rail gives way to how it relates on a dataset's card
    expect(card("study-big").querySelector(".dp-rail")).toBeNull();
    // its actions, Review the primary one
    expect([...d.querySelectorAll(".dp-acts .button.secondary")].map((b) => b.textContent)).toEqual(["Add subjects from a query", "Release", "View"]);
    const primary = d.querySelector<HTMLAnchorElement>(".dp-acts a.button:not(.secondary)")!;
    expect(primary.textContent).toBe("Review 3");
    expect(primary.getAttribute("href")).toBe("#review?cohort=ms-followup");
    expect(d.querySelector(".dp-detail-head .tag")?.textContent).toBe("fed by study-big");
    // how it grew: the read that fed it, its release, the hand that added more
    expect([...d.querySelectorAll(".dp-ev .title")].map((t) => t.textContent)).toEqual(["12 joined", "Release 1", "4 joined"]);
    expect([...d.querySelectorAll(".dp-ev .what")].map((t) => t.textContent)).toEqual(["from study-big", "BIDS · 12 subjects", "by hand"]);
    expect(d.querySelector(".dp-ev.release")).not.toBeNull();
    // where its subjects come from: the dataset that feeds it, and the one that only holds some
    expect([...d.querySelectorAll(".dp-src-line")].map((l) => l.textContent)).toEqual(["study-bigfeeds it12 subjects", "ward-fholds some4 subjects"]);
    // what its subjects have
    expect([...d.querySelectorAll(".dp-kind")].map((k) => k.textContent)).toEqual(["T1w11 of 16", "FLAIR9 of 16"]);
    expect(text()).toContain("Clinical: EDSS for 10 of 16, Relapse for 3 of 16");
    expect(text()).toContain("3 wait on Review");
    // its log and its releases
    expect([...d.querySelectorAll(".dp-log-row .what")].map((w) => w.textContent)).toEqual(["4 joined", "Released", "12 joined", "Made"]);
    expect(d.querySelector(".dp-release")?.textContent).toContain("ms-followup-r1");
  });

  it("lets go of the chosen card when it is chosen again, and the address keeps the choice", async () => {
    const replace = vi.spyOn(history, "replaceState");
    await page();
    act(() => (card("qc-sample").querySelector(".dp-pick") as HTMLButtonElement).click());
    await settle();
    expect(replace).toHaveBeenLastCalledWith(null, "", "#data/datasets?cohort=qc-sample");
    expect(host.querySelector(".dp-detail")?.getAttribute("aria-label")).toBe("qc-sample");
    act(() => (card("qc-sample").querySelector(".dp-pick") as HTMLButtonElement).click());
    await settle();
    expect(replace).toHaveBeenLastCalledWith(null, "", "#data/datasets");
    expect(host.querySelector(".dp-detail")).toBeNull();
    expect(host.querySelectorAll(".dp-card.dim, .dp-card.rel, .dp-card.on")).toHaveLength(0);
  });

  it("chooses what the address names", async () => {
    await page({ query: { dataset: "ward-c" } });
    const d = host.querySelector<HTMLElement>(".dp-detail")!;
    expect(d.getAttribute("aria-label")).toBe("ward-c");
    expect(d.querySelector(".dp-acts .button:not(.secondary)")?.textContent).toBe("Sort the files");
    expect(d.querySelector(".dp-funnel")).toBeNull();
    expect(d.textContent).toContain("Nothing read yet.");
    expect(chosenOf(null, { cohort: "qc" })).toEqual({ kind: "cohort", name: "qc" });
    expect(chosenOf("study-big", undefined)).toEqual({ kind: "dataset", name: "study-big" });
    expect(chosenOf(null, undefined)).toBeNull();
  });

  it("offers a person who may only look no act but View and Review", async () => {
    await page({ grants: ["data:see", "review:see"] });
    const d = host.querySelector<HTMLElement>(".dp-detail")!;
    expect([...d.querySelectorAll(".dp-acts > .button")].map((b) => b.textContent)).toEqual(["View", "Review 8"]);
    // the menu reads, and changes nothing: the files a read refused
    expect([...d.querySelectorAll(".more-list > *")].map((b) => b.textContent)).toEqual(["Refused files"]);
    expect(host.querySelector(".data-head .button")).toBeNull();
    // the log is the steps' own, for a person who does not read the jobs
    expect([...d.querySelectorAll(".dp-log-row .what")].map((w) => w.textContent)).toContain("Read");
  });

  it("says subjects, never people, and no engine word", async () => {
    await page();
    act(() => (card("ms-followup").querySelector(".dp-big") as HTMLElement).click());
    await settle(8);
    const words = text();
    expect(words).not.toMatch(/\bpeople\b|\bperson\b/i);
    expect(words).not.toMatch(/digest|\bbatch|\bstacks?\b|\bplace\b|arriv|dcm-anon|pyramid|classif/i);
  });
});

describe("the first card chosen", () => {
  it("is the first dataset that needs a person, else the first dataset, else the first cohort", () => {
    expect(firstChoice([done, looked, loose], () => null, cohorts)).toEqual({ kind: "dataset", name: "study-big" });
    expect(firstChoice([done], () => null, cohorts)).toEqual({ kind: "dataset", name: "ward-f" });
    expect(firstChoice([], () => null, cohorts)).toEqual({ kind: "cohort", name: "ms-followup" });
    expect(firstChoice([], () => null, [])).toBeNull();
  });
});

describe("a new cohort", () => {
  it("is offered where the engine makes one and the person works on Data", () => {
    expect(makingRefusal(caps7a(DOORS))).toBeNull();
    expect(makingRefusal(caps7a(["GET /api/cohorts"]))).toBe("This engine has no door for making a cohort.");
    expect(makingRefusal(caps7a(DOORS, ["data:see"]))).toBe("Making a cohort needs work on the Data page.");
  });

  it("needs a name of its own", () => {
    expect(nameRefusal("", [])).toBe("a name");
    expect(nameRefusal("ms-followup", ["ms-followup"])).toBe("another name; that one is taken");
    expect(nameRefusal("a b", [])).toBe("a name of letters, digits, dots, dashes or underscores");
    expect(nameRefusal("ms-2026", [])).toBeNull();
  });

  it("is made from the page's head and chosen at once", async () => {
    const e = await page({ route: (c) => (c.method === "POST" && c.url === "/api/cohorts" ? { status: 201, body: { name: "fresh" } } : undefined) });
    act(() => (host.querySelector(".data-head .button.secondary") as HTMLButtonElement).click());
    const input = document.querySelector<HTMLInputElement>('dialog input[placeholder="ms-followup"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "fresh");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((b) => b.textContent === "Make the cohort")!.click());
    await settle(8);
    expect(e.of("POST", "/api/cohorts")[0].body).toMatchObject({ name: "fresh" });
    expect(text()).toContain("fresh is made.");
  });
});
