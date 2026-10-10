// SPDX-License-Identifier: AGPL-3.0-only
// Main scans' doors and pure parts (record 55, decision 6): each door asked
// as the build spec names it, with the scope in its query or its body and
// the draft only where there is one; the answers read defensively; a draft
// edited without touching what it came from, a kind keeping its place and a
// new kind coming last; what each way of keeping alike keeps and gives up;
// and the refusals of a save, each said in one line.

import { afterEach, describe, expect, it, vi } from "vitest";
import { DoorError } from "../ask/client";
import {
  canonical,
  effectRows,
  effectWords,
  groupTitle,
  hasContrastKinds,
  isNewKind,
  keptBy,
  kindsOrder,
  litOf,
  mainScans,
  mapOf,
  moveKind,
  moveTie,
  numbersOf,
  paletteOf,
  refusalWords,
  rolesOf,
  rulesDocOf,
  runOf,
  sameRules,
  saveRefusal,
  scopeOf,
  stripsOf,
  subjectsOf,
  toggleKind,
  versionsWords,
} from "./mainScans";
import { METRICS, RULES } from "./mainScans.fixture";

interface Seen {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

/** A fetch that answers every call with one body and keeps what it was asked. */
function answering(status: number, body: unknown, raw = false) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ method: init?.method ?? "GET", url: String(input), body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null, headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response(raw ? (body as string) : JSON.stringify(body), { status });
    }),
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the scope", () => {
  it("is the cohort or the dataset the address names, the cohort when both, none when neither", () => {
    expect(scopeOf({ cohort: "ms-followup" })).toEqual({ kind: "cohort", name: "ms-followup" });
    expect(scopeOf({ dataset: "study-big" })).toEqual({ kind: "dataset", name: "study-big" });
    expect(scopeOf({ cohort: "a", dataset: "b" })).toEqual({ kind: "cohort", name: "a" });
    expect(scopeOf({ cohort: " " })).toBeNull();
    expect(scopeOf(undefined)).toBeNull();
  });
});

describe("the rules door", () => {
  it("reads the scope's rules, version 1 the pack's defaults while nothing is saved", async () => {
    const seen = answering(200, { scope: { cohort: "ms followup" }, pack: { name: "mri", version: "1.1.0" }, current: { version: 1, saved: false, reason: "", author: null, at: null, digest: "d1", rules: { roles: { t1w: { kinds_in_order: ["3D MPRAGE"], future: 7 } } } }, versions: [] });
    const doc = await mainScans.rules({ kind: "cohort", name: "ms followup" });
    expect(seen[0]).toMatchObject({ method: "GET", url: "/api/picks/rules?cohort=ms%20followup" });
    expect(doc.current).toMatchObject({ version: 1, saved: false, reason: "the pack's defaults" });
    expect(doc.pack).toEqual({ name: "mri", version: "1.1.0" });
    // what the engine left out takes the pack's default; what the desk does not know is kept
    expect(doc.current.rules.roles.t1w).toMatchObject({ keep_alike: "balanced", kinds_in_order: ["3D MPRAGE"], not_used: [], contrast: "either", dimension: "any", body_part: "brain", slice_thickness_at_most_mm: null, future: 7 });
    expect(doc.current.rules.same_kind_in_one_visit.near_tie_goes_to).toHaveLength(5);
    expect(doc.versions).toEqual([{ version: 1, reason: "the pack's defaults", author: null, at: null }]);
  });
  it("lists the versions newest first, and says them in one line", () => {
    const doc = rulesDocOf({ current: { version: 2, saved: true, reason: "3D first", author: "astrid", at: "2026-10-10T10:00:00Z", rules: {} }, versions: [{ version: 1, reason: "the pack's defaults" }, { version: 2, reason: "3D first", author: "astrid" }] });
    expect(doc.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versionsWords(doc.versions)).toBe("Version 2: 3D first · Version 1: the pack's defaults. A release records its version.");
  });
  it("reads a version as text, and a refusal as the JSON doors' are", async () => {
    const seen = answering(200, "roles:\n  t1w:\n    keep_alike: balanced\n", true);
    expect(await mainScans.text({ kind: "dataset", name: "study-big" }, 3)).toContain("keep_alike: balanced");
    expect(seen[0].url).toBe("/api/picks/rules/text?dataset=study-big&version=3");
    expect(seen[0].headers["X-Nils-Desk"]).toBe("1");
    answering(404, { error: "no version 9" });
    await expect(mainScans.text({ kind: "dataset", name: "study-big" }, 9)).rejects.toMatchObject({ status: 404, message: "no version 9" });
  });
  it("saves the draft as the next version, based on the one it was made from", async () => {
    const seen = answering(201, { version: 3, job: 41 });
    expect(await mainScans.save({ kind: "dataset", name: "study-big" }, RULES, "  3D only  ", 2)).toEqual({ version: 3, job: 41 });
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/picks/rules?dataset=study-big", body: { rules: RULES, reason: "3D only", based_on: 2 } });
  });
});

describe("the map doors", () => {
  it("ask for one role with the scope in the body, the draft only where there is one", async () => {
    const seen = answering(200, {});
    await mainScans.map({ kind: "cohort", name: "ms-followup" }, "t1w", "scanner", null);
    await mainScans.map({ kind: "dataset", name: "study-big" }, "flair", "dataset", RULES);
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/picks/map", body: { scope: { cohort: "ms-followup" }, role: "t1w", columns: "scanner" } });
    expect(seen[0].body).not.toHaveProperty("rules");
    expect(seen[1].body).toMatchObject({ scope: { dataset: "study-big" }, role: "flair", columns: "dataset", rules: RULES });
  });
  it("read the map: kinds, the five numbers, a cell a column, the series most first, visit by visit and the effect", () => {
    const m = mapOf({
      role: "t1w",
      rules_version: 2,
      kinds: [{ key: "3D MPRAGE", visits_with: 412, visits_taken: 388, allowed: true, used: true, new: false }, { key: "2D SE", visits_with: 40, visits_taken: 0, allowed: false, used: false, new: true }, { visits_with: 3 }],
      metrics: METRICS(),
      columns: [{ key: "Siemens Skyra · 3 T", visits: 420 }, { key: "Other scanners", visits: 9 }],
      matrix: [{ kind: "3D MPRAGE", cells: [210, 0, 12] }, { kind: null, cells: [3] }],
      series: [{ steps: ["2D SE", "3D MPRAGE"], subjects: 40 }, { steps: ["3D MPRAGE"], subjects: 120 }, { steps: [], subjects: 9 }],
      single_visit_subjects: 290,
      by_visit: [{ visit: 2, visits: 300, kinds: [{ kind: null, visits: 12 }] }, { visit: 1, visits: 600, kinds: [{ kind: "3D MPRAGE", visits: 300 }] }],
      effect: { visits_changed: 37, subjects_changed: 21, before: METRICS({ visits_taken: 1000 }) },
    });
    expect(m.kinds.map((k) => [k.key, k.allowed, k.used, k.new])).toEqual([
      ["3D MPRAGE", true, true, false],
      ["2D SE", false, false, true],
    ]);
    expect(m.matrix).toEqual([
      { kind: "3D MPRAGE", cells: [210, 0] },
      { kind: null, cells: [3, 0] },
    ]);
    expect(m.series.map((s) => s.subjects)).toEqual([120, 40]);
    expect(m.by_visit.map((b) => b.visit)).toEqual([1, 2]);
    expect(m.effect?.before.visits_taken).toBe(1000);
    expect(mapOf({}).effect).toBeNull();
  });
  it("ask for a page of a group's subjects, and read a visit's pick, its scans and its candidates", async () => {
    const seen = answering(200, {
      total: 140,
      page: 1,
      per_page: 24,
      subjects: [{ subject_id: 17, subject: "5a9f30c6e8b21d41", visits: [{ session: "17:2010-01-02", visit: 1, column: "Siemens Skyra · 3 T", field: "3 T", kind: "3D MPRAGE", stack: 123, by: "rules", changed: false, candidates: [{ stacks: [123], kind: "3D MPRAGE", score: 0.9 }, { stack: 124, kind: "3D MPRAGE" }] }, { visit: 2, kind: null, stack: null, by: null, changed: true }] }],
    });
    const page = await mainScans.subjects({ kind: "cohort", name: "ms-followup" }, "t1w", { by: "series", steps: ["2D SE", "3D MPRAGE"] }, "visits", 1, RULES);
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/picks/map/subjects", body: { scope: { cohort: "ms-followup" }, role: "t1w", group: { by: "series", steps: ["2D SE", "3D MPRAGE"] }, order: "visits", page: 1, per_page: 24, rules: RULES } });
    const [one, two] = page.subjects[0].visits;
    expect(one).toMatchObject({ kind: "3D MPRAGE", stacks: [123], by: "rules", changed: false, pick: null });
    expect(one.candidates).toEqual([
      { stacks: [123], kind: "3D MPRAGE", score: 0.9 },
      { stacks: [124], kind: "3D MPRAGE", score: null },
    ]);
    expect(two).toMatchObject({ visit: 2, kind: null, stacks: [], changed: true, candidates: null });
    expect(subjectsOf({}).per_page).toBe(24);
  });
  it("ask for every subject's strips, and light the group's subjects in them", async () => {
    const seen = answering(200, { kinds: ["3D MPRAGE", "2D SE"], columns: [{ key: "Site A · 3 T" }, "Site B · 1.5 T"], subjects: [{ subject_id: 1, column: 0, visits: [0, 0] }, { subject_id: 2, column: 1, visits: [1, 0, -1] }, { subject_id: 3, column: 1, visits: [1] }, { subject_id: 4, column: 0, visits: [1, 1, 0] }] });
    const strips = await mainScans.strips({ kind: "dataset", name: "study-big" }, "t1w", null);
    expect(seen[0].body).toEqual({ scope: { dataset: "study-big" }, role: "t1w" });
    expect(strips.columns).toEqual(["Site A · 3 T", "Site B · 1.5 T"]);
    expect([...litOf(strips, { by: "breaks" })].sort()).toEqual([2, 4]);
    expect([...litOf(strips, { by: "series", steps: ["2D SE", "3D MPRAGE"] })]).toEqual([4]);
    expect([...litOf(strips, { by: "series", steps: ["3D MPRAGE"] })]).toEqual([1]);
    expect([...litOf(strips, { by: "cell", kind: "2D SE", column: "Site B · 1.5 T" })].sort()).toEqual([2, 3]);
    expect([...litOf(strips, { by: "cell", kind: null, column: "Site B · 1.5 T" })]).toEqual([2]);
    expect(stripsOf({ subjects: [{ subject_id: 9, visits: [0, "x"] }] }).subjects[0]).toEqual({ subject_id: 9, column: -1, visits: [0, -1] });
  });
  it("write a person's pick of a visit and its withdrawal in the scope", async () => {
    const seen = answering(201, { id: 97, stacks: [124] });
    await mainScans.pick({ kind: "cohort", name: "ms-followup" }, "t1w", [124], "  motion in series 9 ");
    await mainScans.withdraw({ kind: "dataset", name: "study-big" }, 97, " ");
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/picks", body: { role: "t1w", stacks: [124], why: "motion in series 9", cohort: "ms-followup" } });
    expect(seen[1]).toMatchObject({ method: "POST", url: "/api/picks/97/withdraw", body: { dataset: "study-big" } });
  });
});

describe("a draft", () => {
  const held = ["3D MPRAGE", "2D SE", "3D SPGR"];
  it("orders a role's kinds as the list does, a kind switched off in its place and a new kind last", () => {
    expect(kindsOrder({ kinds_in_order: ["3D MPRAGE", "2D SE"], not_used: ["3D MPRAGE +C"] }, held)).toEqual(["3D MPRAGE", "2D SE", "3D MPRAGE +C", "3D SPGR"]);
    expect(isNewKind(RULES.roles.t1w, "3D SPGR")).toBe(true);
    expect(isNewKind(RULES.roles.t1w, "2D SE")).toBe(false);
  });
  it("moves a kind among the ones shown and writes the whole order, the rules it came from untouched", () => {
    const before = canonical(RULES);
    const up = moveKind(RULES, "t1w", held, "3D SPGR", -1, ["3D MPRAGE", "2D SE", "3D SPGR"]);
    expect(up.roles.t1w.kinds_in_order).toEqual(["3D MPRAGE", "3D MPRAGE +C", "3D SPGR", "2D SE"]);
    expect(canonical(RULES)).toBe(before);
    expect(moveKind(RULES, "t1w", held, "3D MPRAGE", -1)).toBe(RULES);
    expect(moveKind(RULES, "t1w", held, "2D SE", 1).roles.t1w.kinds_in_order).toEqual(["3D MPRAGE", "3D MPRAGE +C", "3D SPGR", "2D SE"]);
  });
  it("switches a kind off and on again in its place, and is the saved rules again when it is", () => {
    const off = toggleKind(RULES, "t1w", [], "3D MPRAGE +C");
    expect(off.roles.t1w).toMatchObject({ kinds_in_order: ["3D MPRAGE", "3D MPRAGE +C", "2D SE"], not_used: ["3D MPRAGE +C"] });
    expect(sameRules(off, RULES)).toBe(false);
    expect(sameRules(toggleKind(off, "t1w", [], "3D MPRAGE +C"), RULES)).toBe(true);
  });
  it("moves a tie key, and compares by what it says whatever the order of its keys", () => {
    expect(moveTie(RULES, "earlier_series", -1).same_kind_in_one_visit.near_tie_goes_to.slice(-2)).toEqual(["earlier_series", "later_full_repeat"]);
    expect(moveTie(RULES, "axial_coronal_sagittal", -1)).toBe(RULES);
    expect(canonical({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonical({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
  it("shows the roles the usual way, and asks contrast only of a role with contrast kinds", () => {
    expect(rolesOf(RULES)).toEqual(["t1w", "flair", "t2w"]);
    expect(hasContrastKinds(RULES.roles.t1w.kinds_in_order)).toBe(true);
    expect(hasContrastKinds(RULES.roles.flair.kinds_in_order)).toBe(false);
  });
  it("gives each kind its colour once, so moving it keeps its colour", () => {
    const first = paletteOf([], ["2D SE", "3D MPRAGE", "3D FLASH"], ["3D MPRAGE", "2D SE"]);
    expect(first).toEqual(["2D SE", "3D MPRAGE"]);
    expect(paletteOf(first, ["3D MPRAGE", "2D SE"], ["3D MPRAGE", "2D SE", "3D SPGR"])).toEqual(["2D SE", "3D MPRAGE", "3D SPGR"]);
  });
});

describe("the five numbers", () => {
  it("say what each way of keeping alike keeps and gives up", () => {
    expect(keptBy("across_the_data")).toEqual({ kept: ["data"], given: ["within"] });
    expect(keptBy("within_each_subject")).toEqual({ kept: ["within", "series"], given: ["data"] });
    expect(keptBy("balanced")).toEqual({ kept: ["data", "within"], given: [] });
  });
  it("read as shares with their lines, none where there is nothing to share", () => {
    const lines = numbersOf(METRICS(), "t1w");
    expect(lines.map((l) => l.value)).toEqual([95, 98, 61, 81, 90]);
    expect(lines[0].sub).toBe("1,050 of 1,100 have a T1w");
    expect(lines[2].sub).toBe("of visits take 3D MPRAGE");
    expect(numbersOf(METRICS({ alike_within: { subjects: 0, of: 0 } }), "t1w")[3].value).toBeNull();
  });
  it("say the effect of a draft against the saved version, each number up, down or the same", () => {
    const rows = effectRows(METRICS({ visits_taken: 1000, alike_data: { kind: "3D MPRAGE", visits: 700 } }), METRICS(), "t1w");
    expect(rows.map((r) => [r.before, r.after, r.way])).toEqual([
      [91, 95, "up"],
      [98, 98, "same"],
      [70, 61, "down"],
      [81, 81, "same"],
      [90, 90, "same"],
    ]);
    expect(effectWords({ visits_changed: 37, subjects_changed: 1 })).toBe("37 visits change their pick · 1 subject its series");
  });
  it("name the group shown", () => {
    expect(groupTitle({ by: "breaks" })).toBe("Subjects whose series breaks");
    expect(groupTitle({ by: "series", steps: ["2D SE", null] })).toBe("Subjects whose series is 2D SE then none");
    expect(groupTitle({ by: "cell", kind: null, column: "Site A · 3 T" })).toBe("Subjects with a visit at Site A · 3 T taking nothing");
    expect(runOf(["a", "a", null, null, "a"])).toEqual(["a", null, "a"]);
  });
});

describe("a refused save", () => {
  it("is said in one line: someone saved first, a field out of range, no reason, or the engine's words", () => {
    expect(saveRefusal(new DoorError(409, { error: "version 3 is not the latest" }))).toEqual({ kind: "stale" });
    const field = saveRefusal(new DoorError(400, { error: "from 0.5 to 10 mm", field: "roles.t1w.slice_thickness_at_most_mm" }));
    expect(refusalWords(field)).toBe("Not saved: roles.t1w.slice_thickness_at_most_mm: from 0.5 to 10 mm.");
    expect(refusalWords(saveRefusal(new DoorError(422, { error: "a reason" })))).toBe("Not saved: say why this version.");
    expect(refusalWords(saveRefusal(new DoorError(403, { error: "saving needs pipelines:work" })))).toBe("Not saved: saving needs pipelines:work");
    expect(refusalWords(saveRefusal(new Error("offline")))).toBe("Not saved: offline");
  });
});
