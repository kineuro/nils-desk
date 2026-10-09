// SPDX-License-Identifier: AGPL-3.0-only
// Datasets and cohorts on one page (Wave 7a, 2026-10-09), its words and
// shapes: a card's six steps from the summary or from the sources door
// alone; each step of the detail's rail in three short lines; a card's line;
// how a dataset and a cohort relate; how a cohort grew, spread so no two
// events sit on each other; a job of the dataset as a line of its log; and
// never an engine word or "people" on the surface.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import type { Cohort, Join } from "./cohorts";
import type { Dataset } from "./datasets";
import { nextStep } from "./steps";
import {
  cardLine,
  clock,
  cohortLine,
  cohortRelation,
  datasetRelation,
  fedWords,
  feedsWords,
  filesOf,
  growth,
  idsWords,
  joinTitle,
  logLine,
  originWords,
  partLabel,
  railOf,
  railSteps,
  roleOrder,
  roleWord,
  runningWords,
  slotOf,
  stateOf,
  stateWord,
  stepsOfSources,
  stepWords,
  took,
  whereWords,
  type DatasetSummary,
  type SummaryStep,
} from "./summary";

const NOW = new Date("2026-10-09T15:00:00Z");
const today = (hhmm: string) => {
  const t = new Date(NOW);
  const [h, m] = hhmm.split(":").map(Number);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};

function dataset(over: Partial<Dataset> & { dataset?: unknown } = {}): Dataset {
  return {
    id: 3,
    name: "study-big",
    path: "/srv/data/study-big",
    guarantees: {},
    probed: null,
    handling: { arrives: "deidentified", on_release: { uids: "preserve", deface: false } },
    handling_declared: false,
    roots: 1,
    arrives: "deidentified",
    patient_id: "subject-code",
    subjects: "generated",
    trees: { originals: null, anon: { path: "/srv/data/study-big/derivatives/dcm-anon", files: 45395, last_written: null } },
    digests: {
      count: 1,
      first: null,
      last: null,
      recent: [
        {
          id: 1,
          name: "study-big-2026-10-09",
          state: "done",
          started_at: null,
          finished_at: null,
          job_id: 4,
          files: { seen: 45395, new: 45179, changed: 0, unchanged: 0, refused: 216 },
          subjects_added: 70,
          stacks_added: 1003,
          classified: 1003,
          to_sort: 203,
        },
      ],
    },
    totals: { subjects: 70, studies: 112, sessions: 112, stacks: 1003, refused_files: 216, to_sort: 203, sure: 788, unsorted: 12 },
    ...over,
  } as Dataset;
}

const step = (name: SummaryStep["step"], over: Partial<SummaryStep> = {}): SummaryStep => ({ step: name, state: "done", job: null, started_at: null, finished_at: null, progress: null, ...over });

function summary(over: Partial<DatasetSummary> = {}): DatasetSummary {
  return {
    dataset: "study-big",
    dataset_id: 3,
    detail: "plain",
    state: "anonymised",
    added_at: today("13:56"),
    subjects: 70,
    sessions: 112,
    studies: 115,
    scans: 1003,
    sure: 788,
    need_a_look: 203,
    unsorted: 12,
    look_kinds: {},
    kinds: [
      { kind: "T1w", scans: 281 },
      { kind: "T2w", scans: 213 },
    ],
    body_regions: [{ region: "head", scans: 990 }],
    files: { found: 45395, bytes: 9.5e9, read: 45179, refused: 216, refused_batch: 7, held: 0 },
    pictures_place: "working",
    steps: [
      step("found", { finished_at: today("13:56"), files: 45395, bytes: 9.5e9, tree: "anon" }),
      step("read", { job: 4, started_at: today("13:57"), finished_at: today("13:57"), files: 45179, refused: 216, reads: 1 }),
      step("sorted", { job: 6, started_at: today("13:58"), finished_at: today("14:01"), scans: 1003, of: 1003, look: 203, unsorted: 0 }),
      step("main_scans", { job: 8, started_at: today("14:04"), finished_at: today("14:04"), picked: 97, borders: 76 }),
      step("pictures", { job: 6, started_at: today("13:58"), finished_at: today("14:05"), made: 991, of: 1003, in_sort: true }),
      step("views", { state: "running", job: 9, started_at: new Date(NOW.getTime() - 60_000).toISOString(), progress: { done: 57, total: 1001 }, made: 57, of: 1003 }),
    ],
    ...over,
  };
}

describe("a card's six steps", () => {
  it("come from the summary: done, running, waiting", () => {
    expect(railOf(dataset(), summary())).toEqual(["done", "done", "done", "done", "done", "run"]);
    const off = summary({ steps: summary().steps.map((s) => (s.step === "pictures" || s.step === "views" ? { ...s, state: "off" as const } : s)) });
    expect(railOf(dataset(), off)).toEqual(["done", "done", "done", "done", "wait", "wait"]);
  });

  it("say what the sources door already says before the summary is read", () => {
    expect(railOf(dataset(), null)).toEqual(["done", "done", "wait", "wait", "wait", "wait"]);
    const sorted = dataset({ totals: { ...dataset().totals, unsorted: 0 } });
    expect(railOf(sorted, null)).toEqual(["done", "done", "done", "wait", "wait", "wait"]);
    // a dataset whose structure says nothing has found nothing it reads
    const loose = dataset({ arrives: "undeclared", trees: { originals: null, anon: null }, digests: { count: 0, first: null, last: null, recent: [] }, dataset: { state: "unknown" } });
    expect(railOf(loose, null)).toEqual(["wait", "wait", "wait", "wait", "wait", "wait"]);
  });
});

describe("the detail's rail", () => {
  it("names each step, what it did and when, the running one in the brand's colour", () => {
    const s = summary();
    const words = railSteps(s).map((x) => stepWords(x, NOW));
    expect(words.map((w) => w.title)).toEqual(["Found", "Read", "Sorted", "Main scans", "Pictures", "3D views"]);
    expect(words[0]).toMatchObject({ what: "45,395 files", when: clock(today("13:56"), NOW) });
    expect(words[1].what).toBe("45,179 read · 216 refused");
    expect(words[2].what).toBe("1,003 scans · 203 to look at");
    expect(words[2].when).toBe(`${clock(today("14:01"), NOW)} · 3 min`);
    expect(words[3].what).toBe("97 picked · 76 borders");
    expect(words[4]).toMatchObject({ what: "991 of 1,003", when: `${clock(today("14:05"), NOW)} · in the sort` });
    expect(words[5]).toMatchObject({ what: "57 of 1,001", now: true });
    expect(words[5].when).toMatch(/^now · about \d+ min left$/);
  });

  it("pseudonymises only where the dataset has originals, and says a waiting step without a time", () => {
    const s = summary({
      steps: [
        step("found", { files: 213, tree: "originals" }),
        step("pseudonymised", { state: "waiting", files: 0, waiting: 213, held: 0, finished_at: today("10:00") }),
        step("read", { state: "waiting", files: 0, refused: 0, reads: 0 }),
      ],
    });
    expect(railSteps(s).map((x) => x.step)).toEqual(["found", "pseudonymised", "read"]);
    const [, pseudo, read] = railSteps(s).map((x) => stepWords(x, NOW));
    expect(pseudo).toMatchObject({ what: "213 to do", when: "" });
    expect(read).toMatchObject({ what: "not yet", when: "" });
    expect(stepWords(step("sorted", { state: "waiting", scans: 0, of: 0 }), NOW).what).toBe("not yet");
    expect(stepWords(step("main_scans", { state: "off", picked: 0, borders: 0 }), NOW).what).toBe("off");
    expect(stepWords(step("views", { state: "off", made: 0, of: 3 }), NOW).what).toBe("no place for them");
  });
});

describe("an engine without the summary door", () => {
  it("still says found, read and sorted from the sources door, and the rest waiting", () => {
    const steps = stepsOfSources(dataset({ totals: { ...dataset().totals, unsorted: 0 } }));
    expect(steps.map((x) => [x.step, x.state])).toEqual([
      ["found", "done"],
      ["read", "done"],
      ["sorted", "done"],
      ["main_scans", "waiting"],
      ["pictures", "waiting"],
      ["views", "waiting"],
    ]);
    expect(steps.map((x) => stepWords(x, NOW).what).slice(0, 3)).toEqual(["45,395 files", "45,395 read · 216 refused", "1,003 scans · 203 to look at"]);
  });
});

describe("a card's line", () => {
  it("says how sure the sort is, or what the dataset still needs", () => {
    const d = dataset();
    expect(cardLine(d, nextStep(d), summary({ steps: summary().steps.filter((s) => s.step !== "views") }))).toBe("788 sure · 203 need a look · 12 not sorted");
    expect(cardLine(d, nextStep(d), summary())).toBe("3D views: running now");
    const loose = dataset({ arrives: "undeclared", dataset: { state: "unknown" } });
    expect(cardLine(loose, nextStep(loose), null)).toBe("Loose files: choose where they go");
    const fresh = dataset({ digests: { count: 0, first: null, last: null, recent: [] }, totals: { ...d.totals, stacks: 0, subjects: 0 } });
    expect(cardLine(fresh, nextStep(fresh), null)).toBe("Not read yet");
  });

  it("counts the files found, the originals of an identified dataset", () => {
    expect(filesOf(dataset(), summary())).toBe(45395);
    const ident = dataset({ trees: { originals: { path: "/x/derivatives/dcm-original", files: 213, bytes: null }, anon: { path: "/x/derivatives/dcm-anon", files: 0, last_written: null } } });
    expect(filesOf(ident, null)).toBe(213);
    expect(filesOf(dataset({ trees: null }), null)).toBeNull();
  });
});

describe("a dataset's head", () => {
  it("says where its folder is, what its structure is and what its IDs are", () => {
    const d = dataset({ dataset: { state: "anonymised", root: "data-test" } });
    expect(whereWords(d)).toBe("data-test/study-big");
    expect(whereWords(dataset())).toBe("data/study-big");
    expect(stateOf(d)).toBe("anonymised");
    expect(stateWord("anonymised")).toBe("anonymised");
    expect(stateWord("unknown")).toBe("loose files");
    expect(idsWords(d)).toBe("PatientID holds the subject code");
    expect(idsWords(dataset({ patient_id: "id-type:study-id", subjects: "map" }))).toBe("PatientID holds the study-id, codes from a map");
  });
});

const cohort = (over: Partial<Cohort> = {}): Cohort =>
  ({
    name: "ms-followup",
    owner: "anna",
    description: null,
    subjects: 58,
    sessions: 96,
    stacks: 840,
    feeds: ["study-big", "study-anon"],
    from: { kind: "source", detail: { dataset: "study-big", batch: 1 } },
    waiting: 12,
    releases: 2,
    created_at: "2026-09-12T10:00:00Z",
    last_joined: null,
    retired_at: null,
    parts: [
      { from: "dataset", dataset: "study-big", subjects: 48 },
      { from: "dataset", dataset: "study-anon", subjects: 10 },
    ],
    datasets: [
      { name: "study-big", subjects: 48, scans: 700, feeds: true },
      { name: "study-anon", subjects: 10, scans: 10, feeds: true },
      { name: "ward-3", subjects: 2, scans: 6, feeds: false },
    ],
    ...over,
  }) as Cohort;

describe("datasets and cohorts, related", () => {
  it("light up the datasets that feed a cohort, and the ones that only hold some of its subjects", () => {
    expect(datasetRelation("study-big", cohort())).toEqual({ related: true, words: "feeds it · 48 of its subjects" });
    expect(datasetRelation("ward-3", cohort())).toEqual({ related: true, words: "holds 2 of its subjects" });
    expect(datasetRelation("record34", cohort())).toEqual({ related: false, words: "holds none of its subjects" });
    expect(datasetRelation("study-new", cohort({ feeds: ["study-new"], datasets: [] }))).toEqual({ related: true, words: "feeds it · none yet" });
  });

  it("light up the cohorts a dataset brings subjects into", () => {
    expect(cohortRelation("study-big", cohort())).toEqual({ related: true, words: "48 of its subjects come from study-big" });
    expect(cohortRelation("record34", cohort())).toEqual({ related: false, words: "none of its subjects are in record34" });
    expect(feedsWords("study-big", "ms-followup", [cohort(), cohort({ name: "qc", feeds: [] })])).toBe("feeds ms-followup");
    expect(feedsWords("record34", null, [cohort()])).toBe("");
  });

  it("say how a cohort came to be, its parts and its line", () => {
    expect(originWords(cohort())).toBe("fed by 2 datasets");
    expect(originWords(cohort({ feeds: ["study-big"] }))).toBe("fed by study-big");
    expect(originWords(cohort({ from: { kind: "promotion", detail: { handle: 3 } } }))).toBe("from a query");
    expect(originWords(cohort({ from: { kind: "manual", detail: null } }))).toBe("by hand");
    expect(fedWords(cohort())).toBe("fed by study-big and study-anon");
    expect(partLabel({ from: "query", dataset: null, subjects: 23 })).toBe("a query");
    expect(partLabel({ from: "hand", dataset: null, subjects: 2 })).toBe("by hand");
    expect(cohortLine(cohort())).toBe("12 wait on Review · 2 releases");
    expect(cohortLine(cohort({ waiting: 0, releases: 0 }))).toBe("no release yet");
  });

  it("give each dataset a colour of its own, and a query, a hand and an import theirs", () => {
    const names = ["study-big", "record34", "study-identified", "study-anon"];
    const slots = names.map((d) => slotOf({ from: "dataset", dataset: d }, names));
    expect(new Set(slots).size).toBe(4);
    expect(slots).not.toContain(7);
    expect(slots).not.toContain(10);
    expect(slotOf({ from: "query", dataset: null }, names)).toBe(7);
    expect(slotOf({ from: "hand", dataset: null }, names)).toBe(10);
  });
});

describe("how a cohort grew", () => {
  const joins: Join[] = [
    { when: "2026-09-12T10:00:00Z", what: "digest", subjects: 40, by: "anna", batch: 3, dataset: "study-big" },
    { when: "2026-10-01T10:00:00Z", what: "digest", subjects: 8, by: "anna", batch: 5, dataset: "study-big" },
    { when: "2026-10-09T09:00:00Z", what: "manual", subjects: 2, by: "anna" },
    { when: "2026-10-09T09:30:00Z", what: "remove", subjects: 1, by: "bo" },
  ];
  const releases = [
    { id: 1, name: "ms-followup-r1", layout: "bids", subjects: 40, finished_at: "2026-09-20T10:00:00Z" },
    { id: 2, name: "ms-followup-r2", layout: "bids", subjects: 48, finished_at: "2026-10-05T10:00:00Z" },
  ];

  it("names each join by what brought it, and a release by its turn", () => {
    expect(joinTitle(joins[0])).toEqual({ title: "40 joined", what: "from study-big", kind: "join" });
    expect(joinTitle(joins[2])).toEqual({ title: "2 joined", what: "by hand", kind: "join" });
    expect(joinTitle(joins[3])).toEqual({ title: "1 left", what: "by bo", kind: "leave" });
    const events = growth(joins, releases);
    expect(events.map((e) => e.title)).toEqual(["40 joined", "Release 1", "8 joined", "Release 2", "2 joined", "1 left"]);
    expect(events[1]).toMatchObject({ kind: "release", what: "BIDS · 40 subjects" });
  });

  it("places the events by their time, no two closer than the gap, and none past the line", () => {
    const events = growth(joins, releases, 6, 15);
    for (let i = 1; i < events.length; i++) expect(events[i].left - events[i - 1].left).toBeGreaterThanOrEqual(14.9);
    expect(events[0].left).toBe(0);
    expect(events[events.length - 1].left).toBeLessThanOrEqual(85);
    // the newest six, and an empty line for a cohort nobody joined
    expect(growth([...joins, ...joins], releases, 6)).toHaveLength(6);
    expect(growth([], [])).toEqual([]);
  });
});

const job = (over: Partial<JobRow>): JobRow => ({
  id: 1,
  kind: "digest",
  name: null,
  state: "done",
  started_at: today("13:57"),
  heartbeat_at: null,
  finished_at: today("13:57"),
  progress: null,
  error: null,
  args: {},
  result: null,
  ...over,
});

describe("a dataset's log", () => {
  it("says each job as what it did and how it went, in a person's words", () => {
    expect(logLine(job({ progress: { batch_id: 7, ingested: 45179, changed: 0, subjects_created: 70 } }), NOW)).toMatchObject({ what: "Read", how: "45,179 files, 70 new subjects", batch: 7 });
    expect(logLine(job({ progress: { batch_id: 8, ingested: 0, changed: 0 } }), NOW)).toMatchObject({ what: "Read", how: "nothing new" });
    expect(logLine(job({ kind: "classify", result: { previews: { stacks: 1003, built: 991 } } }), NOW)).toMatchObject({ what: "Sorted", how: "1,003 scans, pictures made" });
    expect(logLine(job({ kind: "pick", result: { subjects: 70 } }), NOW)).toMatchObject({ what: "Main scans picked", how: "for 70 subjects" });
    expect(logLine(job({ kind: "pyramid", result: { built: 57, skipped: 0, failed: 2 } }), NOW)).toMatchObject({ what: "3D views", how: "57 made, 2 could not be" });
    expect(logLine(job({ kind: "classify", state: "failed", error: "no pack directory" }), NOW)).toMatchObject({ what: "Sort failed", how: "", failed: true });
    expect(logLine(job({ kind: "pseudonymize", result: { files: { written: 213 } } }), NOW)).toMatchObject({ what: "Pseudonymised", how: "213 files" });
  });

  it("says how far a running job is, and that the engine's own preparation runs in the background", () => {
    const r = runningWords({ kind: "pyramid", state: "running", started_at: new Date(NOW.getTime() - 60_000).toISOString(), progress: { done: 57, total: 1001 } }, NOW.getTime());
    expect(r.fraction).toBeCloseTo(57 / 1001, 5);
    expect(r.words).toMatch(/^57 of 1,001 scans · about \d+ min left · in the background$/);
    expect(runningWords({ kind: "digest", state: "queued", started_at: today("14:00"), progress: null }, NOW.getTime()).words).toBe("waits its turn");
  });
});

describe("the words of the page", () => {
  it("say times briefly", () => {
    expect(clock(today("14:05"), NOW)).toBe(new Date(today("14:05")).toTimeString().slice(0, 5));
    expect(clock("2026-09-20T10:00:00Z", NOW)).toBe("sep 20");
    expect(clock("2025-09-20T10:00:00Z", NOW)).toBe("sep 20 2025");
    expect(took("2026-10-09T13:57:00Z", "2026-10-09T13:57:04Z")).toBe("4 s");
    expect(took("2026-10-09T13:58:00Z", "2026-10-09T14:01:00Z")).toBe("3 min");
    expect(took(null, "2026-10-09T14:01:00Z")).toBe("");
  });

  it("name the roles as a person reads them, the usual ones first", () => {
    expect(["t2w", "flair", "t1w", "swi"].sort(roleOrder).map(roleWord)).toEqual(["T1w", "FLAIR", "T2w", "SWI"]);
  });
});
