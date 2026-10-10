// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review, Main scans (record 55, decision 6), against an engine whose doors
// answer as the build spec's section 5 has them: the chooser of a dataset or
// cohort; the page of one, its role keys and ways of keeping alike, the five
// numbers with what a way keeps and gives up, the kinds, where they come
// from, the series, visit by visit and the group's subjects as cards a page
// at a time or every subject as a strip with the group lit; a series or a
// cell opening its subjects; a card's visit opening its pick, which belongs
// to the scope; the quiet link to the earlier runs' questions; and on the
// surface subjects, visits, scans, kinds and rules, never the engine's words.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine, MAIN_SCANS_DOORS, mainScansDoors, subjectsAnswer, type FakeAnswer, type FakeCall } from "./mainScans.fixture";
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

/** The fixture's page of subjects, told it is one of several. */
const subjectsOf = (total: number) => subjectsAnswer(total);

async function open(query: Record<string, string> | undefined, over?: (c: FakeCall) => FakeAnswer, caps = ALL) {
  const engine = fakeEngine(mainScansDoors(over));
  act(() => root.render(<ReviewPage caps={caps} page="picks" query={query} />));
  await settle();
  return engine;
}

const text = (sel: string) => [...host.querySelectorAll(sel)].map((e) => e.textContent?.trim() ?? "");
const pressed = (group: string) => [...host.querySelectorAll(`[role="group"][aria-label="${group}"] [aria-pressed="true"]`)].map((b) => b.textContent);

describe("Main scans without a dataset or cohort", () => {
  it("offers the datasets and the cohorts the person may see, each opening the page about it", async () => {
    await open(undefined);
    expect(host.querySelector("h1")?.textContent).toBe("Which dataset or cohort");
    const links = [...host.querySelectorAll<HTMLAnchorElement>(".ms-choose a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["study-big", "#review/picks?dataset=study-big"],
      ["ward-c", "#review/picks?dataset=ward-c"],
      ["ms-followup", "#review/picks?cohort=ms-followup"],
    ]);
    // the old table is out of sight while no earlier run's question is open
    expect(host.textContent).not.toContain("from earlier runs");
  });

  it("says so on an engine that does not serve the map yet", async () => {
    await open({ cohort: "ms-followup" }, undefined, capsWith(["GET /api/review/summary"], [...GRANTS] as Grant[]));
    expect(host.textContent).toContain("This engine does not draw a dataset's or cohort's main scans yet.");
  });
});

describe("Main scans of a cohort", () => {
  it("reads its rules, the map of its first role and the subjects whose series breaks", async () => {
    const engine = await open({ cohort: "ms-followup" });
    // each read once, however often the page draws
    expect(engine.of("GET", "/api/picks/rules")).toHaveLength(1);
    expect(engine.of("POST", "/api/picks/map")).toHaveLength(1);
    expect(engine.of("POST", "/api/picks/map/subjects")).toHaveLength(1);
    expect(engine.of("GET", "/api/picks/rules")[0].query.get("cohort")).toBe("ms-followup");
    expect(engine.of("POST", "/api/picks/map")[0].body).toEqual({ scope: { cohort: "ms-followup" }, role: "t1w", columns: "scanner" });
    expect(engine.of("POST", "/api/picks/map/subjects")[0].body).toEqual({ scope: { cohort: "ms-followup" }, role: "t1w", columns: "scanner", group: { by: "breaks" }, order: "changes", page: 0, per_page: 24 });
    expect(host.querySelector(".ms-head .eyebrow")?.textContent).toBe("Main scans · cohort");
    expect(host.querySelector(".ms-head h1")?.textContent).toBe("ms-followup");
    expect(pressed("Role")).toEqual(["T1w", "T1w"]);
    expect(text('.ms-keys [role="group"][aria-label="Role"] .opt')).toEqual(["T1w", "FLAIR", "T2w"]);
    expect(pressed("Keep alike")).toEqual(["Balanced: the data first, then each subject", "Balanced: the data first, then each subject"]);
    expect(host.querySelector(".ms-line")?.textContent).toBe("The data's order first; a subject keeps one kind where one covers all its visits.");
    expect(host.querySelector(".ms-rules-toggle")?.textContent).toBe("Rules · version 2");
  });

  it("shows the five numbers, the ones balanced keeps marked with the brand bar and none given up", async () => {
    await open({ cohort: "ms-followup" });
    expect(text(".ms-number .ms-value")).toEqual(["95 %", "98 %", "61 %", "81 %", "90 %"]);
    expect([...host.querySelectorAll(".ms-number.kept .eyebrow")].map((e) => e.textContent)).toEqual(["Alike across the data", "Alike within subjects"]);
    expect(host.querySelectorAll(".ms-number.given")).toHaveLength(0);
    expect(text(".ms-number .ms-sub")[0]).toBe("1,050 of 1,100 have a T1w");
  });

  it("draws each kind in its colour as a framed tag, never a glyph, the new kind after the named ones", async () => {
    await open({ cohort: "ms-followup" });
    const kinds = [...host.querySelectorAll(".ms-kinds .ms-kind-row .ms-kind")];
    expect(kinds.map((k) => [k.textContent, k.getAttribute("data-slot")])).toEqual([
      ["3D MPRAGE", "1"],
      ["3D MPRAGE +C", "2"],
      ["2D SE", "3"],
      ["3D SPGR", "4"],
    ]);
    expect(text(".ms-kinds .ms-count")[0]).toBe("388 taken of 412");
    // no pick is a dashed "none", in every part that shows one
    expect(host.querySelector(".ms-where .ms-kind.none")?.textContent).toBe("none");
    expect(host.querySelectorAll(".dot, .dp-sw")).toHaveLength(0);
  });

  it("opens a cell's subjects and a series' subjects, and goes back to the ones whose series breaks", async () => {
    const engine = await open({ cohort: "ms-followup" });
    act(() => button(host, "300 visits at Siemens Skyra · 3 T take 3D MPRAGE")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body?.group).toEqual({ by: "cell", kind: "3D MPRAGE", column: "Siemens Skyra · 3 T" });
    expect(host.querySelector(".ms-group-title")?.textContent).toBe("Subjects with a visit at Siemens Skyra · 3 T taking 3D MPRAGE");
    act(() => button(host, "Show the 40 subjects whose series is 2D SE then 3D MPRAGE")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body?.group).toEqual({ by: "series", steps: ["2D SE", "3D MPRAGE"] });
    expect(host.querySelector(".ms-group-title")?.textContent).toBe("Subjects whose series is 2D SE then 3D MPRAGE");
    act(() => button(host, "Back to the subjects whose series breaks")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body?.group).toEqual({ by: "breaks" });
  });

  it("draws the subjects as cards, visits as columns, a changed visit in the caution colour, and pages them", async () => {
    const engine = await open({ cohort: "ms-followup" }, (c) => (c.path === "/api/picks/map/subjects" ? { status: 200, body: { ...subjectsOf(50), page: Number(c.body?.page ?? 0) } } : undefined));
    const cards = host.querySelectorAll(".ms-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".ms-card-head b")?.textContent).toBe("5a9f30c6e8b21d41");
    const visits = [...cards[0].querySelectorAll(".ms-visit")];
    expect(visits.map((v) => [v.querySelector(".ms-visit-head")?.textContent, v.classList.contains("changed")])).toEqual([
      ["V1 · 1.5 T", false],
      ["V2 · 3 T", true],
    ]);
    // the second subject has one visit: a blank keeps the columns aligned
    expect(cards[1].querySelectorAll(".ms-visit.blank")).toHaveLength(1);
    expect(host.querySelector(".ms-pager")?.textContent).toBe("1 of 3");
    act(() => button(host, "Next page")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body?.page).toBe(1);
    act(() => button(host, "Most visits")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body).toMatchObject({ order: "visits", page: 0 });
  });

  it("draws every subject as a strip by scanner with the group lit, a changed visit's edge marked", async () => {
    const engine = await open({ cohort: "ms-followup" });
    act(() => button(host, "All subjects")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/strips")[0].body).toEqual({ scope: { cohort: "ms-followup" }, role: "t1w", columns: "scanner" });
    expect(text(".ms-strip-label")).toEqual(["Siemens Skyra · 3 T · 2 subjects", "GE Signa · 1.5 T · 1 subject"]);
    // subject 19 has nothing at its third visit and 17 changes from 2D SE to 3D MPRAGE: both break, and both are lit
    const lit = [...host.querySelectorAll(".ms-strip.lit")];
    expect(lit.map((s) => s.getAttribute("aria-label"))).toEqual(["3D MPRAGE, 3D MPRAGE, none", "2D SE, 3D MPRAGE"]);
    expect(lit.map((s) => s.querySelectorAll("i.changed").length)).toEqual([1, 1]);
    expect([...host.querySelectorAll(".ms-strip:not(.lit)")].map((s) => s.getAttribute("aria-label"))).toEqual(["3D MPRAGE"]);
  });

  it("opens a card's visit on its pick, and a person's pick there belongs to the cohort", async () => {
    const engine = await open({ cohort: "ms-followup" }, (c) => (c.method === "POST" && c.path === "/api/picks" ? { status: 201, body: { id: 99, stacks: [124] } } : undefined));
    act(() => button(host, "Subject 5a9f30c6e8b21d41, visit 2: 3D MPRAGE, a change")!.click());
    const d = host.querySelector("dialog")!;
    expect(d.querySelector("h2")?.textContent).toBe("This visit's T1w");
    expect(d.textContent).toContain("Subject 5a9f30c6e8b21d41 · visit 2 · Siemens Skyra · 3 T");
    expect(d.textContent).toContain("Picked by rules version 2. Nobody was asked.");
    expect(d.querySelectorAll(".bundle")).toHaveLength(2);
    expect(d.querySelector(".bundle.on")?.textContent).toContain("the rules' pick");
    expect(d.querySelector(".bundle .value-tag")?.textContent).toBe("3D MPRAGE");
    const keep = button(d, "Keep my pick")!;
    expect(keep.disabled).toBe(true);
    act(() => d.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    const why = d.querySelector<HTMLInputElement>('input[aria-label="Why"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(why, "motion in series 9");
      why.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => keep.click());
    await settle();
    expect(engine.of("POST", "/api/picks")[0].body).toEqual({ role: "t1w", stacks: [124], why: "motion in series 9", cohort: "ms-followup" });
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.querySelector(".ms-said")?.textContent).toBe("Picked scan 124 for subject 5a9f30c6e8b21d41, visit 2. Later runs leave it standing.");
    // what the pick changed is read again
    expect(engine.of("POST", "/api/picks/map").length).toBeGreaterThan(1);
  });

  it("never offers a visit of another role's page: the cards wait for the role's own", async () => {
    await open({ cohort: "ms-followup" }, (c) => (c.path === "/api/picks/map/subjects" && c.body?.role === "flair" ? { status: 500, body: { error: "not now" } } : undefined));
    expect(host.querySelectorAll(".ms-card")).toHaveLength(2);
    act(() => button(host.querySelector(".ms-keys")!, "FLAIR")!.click());
    expect(host.querySelectorAll(".ms-card")).toHaveLength(0);
    await settle();
    expect(host.querySelectorAll(".ms-visit")).toHaveLength(0);
    expect(host.querySelector(".ms-group")?.textContent).toContain("The subjects could not be read: not now");
  });

  it("withdraws a person's pick of a visit in the scope", async () => {
    const engine = await open({ cohort: "ms-followup" }, (c) => (c.path === "/api/picks/97/withdraw" ? { status: 200, body: { id: 97, restored: [80] } } : undefined));
    act(() => button(host, "Subject 5a9f30c6e8b21d42, visit 1: 3D MPRAGE")!.click());
    const d = host.querySelector("dialog")!;
    expect(d.textContent).toContain("A person picked it: motion in series 9. Later runs leave it standing.");
    act(() => button(d, "Withdraw my pick")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/97/withdraw")[0].body).toEqual({ cohort: "ms-followup" });
    expect(host.querySelector(".ms-said")?.textContent).toBe("Withdrew the pick for subject 5a9f30c6e8b21d42, visit 1; the rules' pick applies again.");
  });

  it("leads to the earlier runs' questions with one quiet link while the engine still reports them", async () => {
    await open({ dataset: "study-big" }, (c) => (c.path === "/api/review/summary" ? { status: 200, body: { by_kind: { "pick.border": 3 }, cohorts: [], none: 0 } } : undefined));
    const link = [...host.querySelectorAll<HTMLAnchorElement>("a.button.quiet")].find((a) => a.textContent?.includes("from earlier runs"));
    expect(link?.textContent).toBe("3 pick questions from earlier runs");
    expect(link?.getAttribute("href")).toBe("#review/picks?earlier=1&dataset=study-big");
    // nothing else of the old table is on the page
    expect(host.querySelector("table")).toBeNull();
  });

  it("offers columns by dataset for a cohort only, and asks a cell's subjects and the strips by the same columns", async () => {
    const engine = await open({ cohort: "ms-followup" });
    act(() => button(host, "By dataset")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map").at(-1)?.body?.columns).toBe("dataset");
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body?.columns).toBe("dataset");
    act(() => button(host, "300 visits at Siemens Skyra · 3 T take 3D MPRAGE")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body).toMatchObject({ columns: "dataset", group: { by: "cell", kind: "3D MPRAGE", column: "Siemens Skyra · 3 T" } });
    act(() => button(host, "All subjects")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/strips").at(-1)?.body?.columns).toBe("dataset");
    act(() => root.unmount());
    root = createRoot(host);
    await open({ dataset: "study-big" });
    expect(button(host, "By dataset")).toBeNull();
  });

  it("chooses another dataset or cohort from beside the title", async () => {
    await open({ cohort: "ms-followup" });
    act(() => button(host, "Another dataset or cohort")!.click());
    await settle();
    const pop = host.querySelector(".ms-pop")!;
    expect(pop.querySelector('a[aria-current="page"]')?.textContent).toBe("ms-followup");
    expect(pop.querySelector<HTMLAnchorElement>('a[href="#review/picks?dataset=study-big"]')).not.toBeNull();
  });

  it("says subjects, visits, scans, kinds and rules, never the engine's words", async () => {
    await open({ cohort: "ms-followup" });
    act(() => button(host, "Subject 5a9f30c6e8b21d41, visit 2: 3D MPRAGE, a change")!.click());
    const words = (host.textContent ?? "").toLowerCase();
    for (const w of ["session", "stack", "occasion", "border", "profile"]) expect(words).not.toContain(w);
  });
});

