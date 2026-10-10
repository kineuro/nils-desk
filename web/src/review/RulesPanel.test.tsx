// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Rules panel beside Main scans (record 55, decision 6), against an
// engine whose doors answer as the build spec's section 5 has them: a draft
// lives in the browser until it is saved, each change asks the map door
// again once the draft settles, and the effect against the saved version
// comes first; the kinds keep their places, a new one marked and last;
// contrast is asked only of a role with contrast kinds; a save names the
// version it was based on and one line follows its pick run, then the page
// reads again; someone who saved first is said in one line and the rules
// read again; a refused field and an empty reason are said; and the rules
// show as text.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine, MAIN_SCANS_DOORS, mainScansDoors, RULES, rulesAnswer, type FakeAnswer, type FakeCall } from "./mainScans.fixture";
import { ReviewPage } from "./ReviewPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  sessionStorage.clear();
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

const ALL = capsWith(MAIN_SCANS_DOORS, [...GRANTS] as Grant[]);

async function open(over?: (c: FakeCall) => FakeAnswer, caps = ALL) {
  const engine = fakeEngine(mainScansDoors(over));
  act(() => root.render(<ReviewPage caps={caps} page="picks" query={{ cohort: "ms-followup" }} />));
  await settle();
  return engine;
}

/** A while past the panel's debounce, so a draft settles and is asked of the map door. */
async function settled(ms = 350) {
  await act(async () => {
    await new Promise((done) => setTimeout(done, ms));
  });
  await settle();
}

const panel = () => host.querySelector<HTMLElement>(".ms-rules")!;
const press = (words: string | RegExp, within: ParentNode = panel()) => act(() => button(within, words)!.click());
const drafts = (engine: ReturnType<typeof fakeEngine>) => engine.of("POST", "/api/picks/map").filter((c) => c.body?.rules !== undefined);

/** A value typed or slid, as a person changes it. */
function set(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const reason = () => panel().querySelector<HTMLInputElement>(".ms-reason input")!;
const use = (kind: string) => panel().querySelector<HTMLInputElement>(`input[aria-label="Use ${kind}"]`)!;

describe("the Rules panel", () => {
  it("opens beside the page with the effect first, the saved version's, and nothing changed", async () => {
    await open();
    const p = panel();
    expect(p.getAttribute("aria-label")).toBe("Rules for ms-followup");
    expect(p.querySelector(".ms-rules-head .eyebrow")?.textContent).toBe("Rules · version 2");
    expect(p.querySelector(".ms-rules-head h2")?.textContent).toBe("Main scans of ms-followup");
    expect(p.querySelector(".ms-effect .eyebrow")?.textContent).toBe("Saved · T1w");
    expect(p.querySelector(".ms-effect-line")?.textContent).toBe("No change yet");
    expect(button(p, "Save as version 3")!.disabled).toBe(true);
    expect(button(p, "Back to version 2")!.disabled).toBe(true);
    expect(p.querySelector(".ms-versions")?.textContent).toBe("Version 2: 3D first for the lesion study · Version 1: the pack's defaults. A release records its version.");
    press("Close the rules");
    expect(host.querySelector(".ms-rules")).toBeNull();
    expect(host.querySelector(".ms-rules-toggle")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps a draft in the browser and asks the map door again once it settles, with the effect against the saved version", async () => {
    const engine = await open();
    press("Across the data");
    // the page and the panel change one draft
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 2 · changed");
    expect(panel().querySelector(".ms-rules-head .eyebrow")?.textContent).toBe("Rules · version 2, changed");
    expect([...host.querySelectorAll(".ms-number.given .eyebrow")].map((e) => e.textContent)).toEqual(["Alike within subjects"]);
    expect(drafts(engine)).toHaveLength(0);
    await settled();
    const asked = drafts(engine);
    expect(asked).toHaveLength(1);
    expect(asked[0].body?.role).toBe("t1w");
    expect((asked[0].body?.rules as typeof RULES).roles.t1w.keep_alike).toBe("across_the_data");
    expect(panel().querySelector(".ms-effect .eyebrow")?.textContent).toBe("If saved · T1w");
    expect(panel().querySelector(".ms-effect-line")?.textContent).toBe("37 visits change their pick · 21 subjects their series");
    const rows = [...panel().querySelectorAll(".ms-effect-row")].map((r) => [r.querySelector(".label")?.textContent, r.querySelector(".before")?.textContent, r.querySelector(".after")?.textContent, r.querySelector(".after")?.classList.contains("up")]);
    expect(rows[0]).toEqual(["Visits", "95 %", "96 %", true]);
    expect(rows[2]).toEqual(["Alike across the data", "61 %", "66 %", true]);
    expect(rows[3]).toEqual(["Alike within subjects", "81 %", "81 %", false]);
    // the draft is kept for this tab: the page opened again finds it, and asks the map door with it at once
    act(() => root.unmount());
    root = createRoot(host);
    const again = await open();
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 2 · changed");
    // kept by the scope the engine answered, its kind and id
    expect(Object.keys(sessionStorage)).toEqual(["nils.mainScans.draft.cohort:7"]);
    await settled();
    expect(again.of("POST", "/api/picks/map")).toHaveLength(1);
    expect((again.of("POST", "/api/picks/map")[0].body?.rules as typeof RULES).roles.t1w.keep_alike).toBe("across_the_data");
  });

  it("asks once for changes made quickly one after another, then goes back to the saved version", async () => {
    const engine = await open();
    press("Within each subject");
    press("Across the data");
    act(() => use("3D MPRAGE +C").click());
    await settled();
    const asked = drafts(engine);
    expect(asked).toHaveLength(1);
    const rules = asked[0].body?.rules as typeof RULES;
    expect(rules.roles.t1w).toMatchObject({ keep_alike: "across_the_data", not_used: ["3D MPRAGE +C"] });
    press("Back to version 2");
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 2");
    await settled();
    expect(engine.of("POST", "/api/picks/map").at(-1)?.body).not.toHaveProperty("rules");
    expect(panel().querySelector(".ms-effect-line")?.textContent).toBe("No change yet");
  });

  it("orders the kinds the data holds, a kind switched off in its place and struck, a new kind marked and last", async () => {
    const engine = await open();
    const rows = () => [...panel().querySelectorAll(".ms-order-row")];
    expect(rows().map((r) => [r.querySelector(".ms-rank")?.textContent, r.querySelector(".ms-kind")?.textContent, r.querySelector(".tag.caution")?.textContent ?? ""])).toEqual([
      ["1", "3D MPRAGE", ""],
      ["2", "3D MPRAGE +C", ""],
      ["3", "2D SE", ""],
      ["4", "3D SPGR", "new"],
    ]);
    act(() => use("3D MPRAGE +C").click());
    const off = rows()[1];
    expect(off.querySelector(".ms-rank")?.textContent).toBe("");
    expect(off.querySelector(".ms-kind")?.classList.contains("off")).toBe(true);
    expect(use("3D MPRAGE +C").checked).toBe(false);
    // the switches are quiet: no row's is a coloured key
    expect(panel().querySelectorAll(".ms-order-row .opt")).toHaveLength(0);
    expect(rows()[2].querySelector(".ms-rank")?.textContent).toBe("2");
    press("Move 3D SPGR up");
    expect(rows().map((r) => r.querySelector(".ms-kind")?.textContent)).toEqual(["3D MPRAGE", "3D MPRAGE +C", "3D SPGR", "2D SE"]);
    expect(button(rows()[0], "Move 3D MPRAGE up")!.disabled).toBe(true);
    await settled();
    expect((drafts(engine).at(-1)?.body?.rules as typeof RULES).roles.t1w).toMatchObject({ kinds_in_order: ["3D MPRAGE", "3D MPRAGE +C", "3D SPGR", "2D SE"], not_used: ["3D MPRAGE +C"] });
  });

  it("asks contrast only of a role with contrast kinds, and sets dimension, body part and slice thickness", async () => {
    const engine = await open();
    const group = (name: string) => panel().querySelector(`[role="group"][aria-label="${name}"]`);
    expect(group("Contrast")).not.toBeNull();
    press("Without", group("Contrast")!);
    press("3D only", group("Dimension")!);
    press("Any", group("Body part")!);
    const mm = panel().querySelector<HTMLInputElement>('.ms-range input[type="range"]')!;
    set(mm, "3");
    expect(panel().querySelector(".ms-range .val")?.textContent).toBe("at most 3.0 mm");
    await settled();
    expect((drafts(engine).at(-1)?.body?.rules as typeof RULES).roles.t1w).toMatchObject({ contrast: "without", dimension: "3d", body_part: "any", slice_thickness_at_most_mm: 3 });
    set(mm, "6");
    expect(panel().querySelector(".ms-range .val")?.textContent).toBe("any");
    // FLAIR has no contrast kind
    press("FLAIR", panel().querySelector('[role="group"][aria-label="Role of the rules"]')!);
    await settle();
    expect(group("Contrast")).toBeNull();
    expect(host.querySelector('.ms-keys [role="group"][aria-label="Role"] [aria-pressed="true"]')?.textContent).toBe("FLAIR");
  });

  it("folds how two scans of one kind in a visit are told apart: the weights, the derived factor, the near tie and its order", async () => {
    const engine = await open();
    expect(panel().textContent).not.toContain("The score's parts");
    press("Two scans of one kind in a visit");
    expect(button(panel(), "Two scans of one kind in a visit")?.getAttribute("aria-expanded")).toBe("true");
    const ranges = [...panel().querySelectorAll<HTMLInputElement>(".ms-fold-body input[type='range']")];
    expect(ranges).toHaveLength(7);
    set(ranges[0], "0.3");
    set(ranges[5], "0.25");
    set(ranges[6], "8");
    press("Move The earlier series up");
    expect([...panel().querySelectorAll(".ms-tie-row")].map((r) => r.querySelector("span:nth-child(2)")?.textContent)).toEqual([
      "Axial, then coronal, then sagittal",
      "Thinner slices",
      "The scanner's default reconstruction",
      "The earlier series",
      "Of two full repeats, the later",
    ]);
    await settled();
    const same = (drafts(engine).at(-1)?.body?.rules as typeof RULES).same_kind_in_one_visit;
    expect(same).toMatchObject({ derived_series_scores: 0.25, near_tie_within_percent: 8 });
    expect(same.weights.slice_count).toBe(0.3);
    expect(same.near_tie_goes_to.slice(-2)).toEqual(["earlier_series", "later_full_repeat"]);
  });

  it("shows the saved version as text from the text door", async () => {
    const engine = await open();
    press("As text");
    expect(button(panel(), "Hide the text")?.getAttribute("aria-expanded")).toBe("true");
    await settle();
    expect(engine.of("GET", "/api/picks/rules/text")[0].query.toString()).toBe("cohort=ms-followup&version=2");
    expect(panel().querySelector(".ms-yaml")?.textContent).toContain("# Main scans of ms-followup, version 2");
    press("Hide the text");
    expect(panel().querySelector(".ms-yaml")).toBeNull();
  });
});

describe("saving the rules", () => {
  it("saves the draft as the next version with its why, and one line follows the pick run until the page reads again", async () => {
    let saved = false;
    let polls = 0;
    const engine = await open((c) => {
      if (c.method === "POST" && c.path === "/api/picks/rules") {
        saved = true;
        return { status: 201, body: { version: 3, job: 41 } };
      }
      if (c.method === "GET" && c.path === "/api/picks/rules" && saved) return { status: 200, body: rulesAnswer(3, (c.body?.rules as typeof RULES) ?? RULES) };
      if (c.method === "GET" && c.path === "/api/jobs/41") return { status: 200, body: { id: 41, kind: "pick", name: null, state: polls++ === 0 ? "running" : "done", started_at: "2026-10-10T10:00:00Z", heartbeat_at: null, finished_at: null, progress: null, error: null, args: {}, result: null } };
      return undefined;
    });
    press("Across the data");
    expect(button(panel(), "Save as version 3")!.disabled).toBe(true);
    set(reason(), "  the lesion study wants 3D T1 only ");
    // not before the effect of the draft is read
    expect(button(panel(), "Save as version 3")!.disabled).toBe(true);
    await settled();
    expect(button(panel(), "Save as version 3")!.disabled).toBe(false);
    press("Save as version 3");
    await settle();
    const save = engine.of("POST", "/api/picks/rules")[0];
    expect(save.query.toString()).toBe("cohort=ms-followup");
    expect(save.body).toMatchObject({ reason: "the lesion study wants 3D T1 only", based_on: 2 });
    expect((save.body?.rules as typeof RULES).roles.t1w.keep_alike).toBe("across_the_data");
    // the rules are read again at once: version 3, nothing changed, the why cleared
    expect(panel().querySelector(".ms-rules-head .eyebrow")?.textContent).toBe("Rules · version 3");
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 3");
    expect(reason().value).toBe("");
    expect(panel().querySelector(".ms-rules-foot .wait-phase")?.textContent).toBe("Version 3 saved; picking with it (job 41, running)");
    const before = engine.of("POST", "/api/picks/map").length;
    await settled(2200);
    expect(panel().querySelector(".ms-status")?.textContent).toBe("Version 3 saved; its picks are written.");
    expect(engine.of("POST", "/api/picks/map").length).toBeGreaterThan(before);
    expect(sessionStorage.length).toBe(0);
  });

  it("says in one line that someone saved first, reads the rules again and moves the draft onto their version", async () => {
    let refused = false;
    const engine = await open((c) => {
      if (c.method === "POST" && c.path === "/api/picks/rules") {
        refused = true;
        return { status: 409, body: { error: "version 2 is not the latest; version 3 is" } };
      }
      if (c.method === "GET" && c.path === "/api/picks/rules" && refused) return { status: 200, body: rulesAnswer(3, RULES, "bertil") };
      return undefined;
    });
    press("Across the data");
    set(reason(), "3D only");
    await settled();
    press("Save as version 3");
    await settle();
    expect(engine.of("GET", "/api/picks/rules")).toHaveLength(2);
    expect(panel().querySelector(".ms-status")?.textContent).toBe("Your changes were made on version 2; version 3 is saved now by bertil. The effect shows them against it.");
    // the draft is kept, now against version 3, and its effect asked again
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 3 · changed");
    await settled();
    expect((drafts(engine).at(-1)?.body?.rules as typeof RULES).roles.t1w.keep_alike).toBe("across_the_data");
    expect(button(panel(), "Save as version 4")!.disabled).toBe(false);
  });

  it("names a refused field, and says when the why is missing", async () => {
    let answer: FakeAnswer = { status: 400, body: { error: "from 0.5 to 10 mm", field: "roles.t1w.slice_thickness_at_most_mm" } };
    await open((c) => (c.method === "POST" && c.path === "/api/picks/rules" ? answer : undefined));
    press("Across the data");
    set(reason(), "thin slices");
    await settled();
    press("Save as version 3");
    await settle();
    expect(panel().querySelector(".ms-status")?.textContent).toBe("Not saved: roles.t1w.slice_thickness_at_most_mm: from 0.5 to 10 mm.");
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 2 · changed");
    answer = { status: 422, body: { error: "a version says why" } };
    press("Save as version 3");
    await settle();
    expect(panel().querySelector(".ms-status")?.textContent).toBe("Not saved: say why this version.");
    expect(reason().value).toBe("thin slices");
  });

  it("marks the roles a draft changes, since a save writes every role", async () => {
    await open();
    press("FLAIR", panel().querySelector('[role="group"][aria-label="Role of the rules"]')!);
    await settle();
    press("Across the data");
    const keys = (label: string) => [...host.querySelectorAll(`[role="group"][aria-label="${label}"] .opt`)].map((b) => b.textContent);
    expect(keys("Role")).toEqual(["T1w", "FLAIR · changed", "T2w"]);
    expect(keys("Role of the rules")).toEqual(["T1w", "FLAIR · changed", "T2w"]);
  });

  it("holds the save while the effect of the latest changes could not be read, and says so", async () => {
    let fail = false;
    await open((c) => (fail && c.path === "/api/picks/map" ? { status: 500, body: { error: "the map is busy" } } : undefined));
    press("Across the data");
    set(reason(), "3D only");
    await settled();
    expect(button(panel(), "Save as version 3")!.disabled).toBe(false);
    fail = true;
    press("Within each subject");
    await settled();
    expect(panel().querySelector(".ms-effect")?.classList.contains("stale")).toBe(true);
    expect(panel().textContent).toContain("The effect of your latest changes could not be read: the map is busy");
    expect(button(panel(), "Save as version 3")!.disabled).toBe(true);
  });

  it("follows a save's pick run on the page when the panel is closed", async () => {
    await open((c) => {
      if (c.method === "POST" && c.path === "/api/picks/rules") return { status: 201, body: { version: 3, job: 41 } };
      if (c.method === "GET" && c.path === "/api/jobs/41") return { status: 200, body: { id: 41, kind: "pick", name: null, state: "running", started_at: "2026-10-10T10:00:00Z", heartbeat_at: null, finished_at: null, progress: null, error: null, args: {}, result: null } };
      return undefined;
    });
    press("Across the data");
    set(reason(), "3D only");
    await settled();
    press("Save as version 3");
    await settle();
    press("Close the rules");
    expect(host.querySelector(".ms-main .wait-phase")?.textContent).toBe("Version 3 saved; picking with it (job 41, running)");
  });

  it("offers no save to a person who may not start a pick run", async () => {
    await open(undefined, capsWith(MAIN_SCANS_DOORS, ["review:see", "review:work", "data:see", "pipelines:see"]));
    expect(button(panel(), "Save as version 3")).toBeNull();
    expect(panel().querySelector(".ms-reason")).toBeNull();
    expect(panel().textContent).toContain("Saving a version needs work on Pipelines.");
    expect(button(panel(), "Back to version 2")).not.toBeNull();
  });
});
