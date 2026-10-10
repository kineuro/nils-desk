// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The pseudonymise step of a dataset on the Data page (Wave 7a, the design
// Nima confirmed on 2026-10-09), as it draws and acts against an engine: it
// opens in place under the rail where IDs need a code, never on a page of its
// own, with the three boxes, one primary action and the rules as one line;
// the IDs listed one row each by their shape, a dropped map rehearsed and the
// rows filled as they match, a pasted one taken while the box has the focus
// wherever the browser aims the paste, one with no header kept whole with none
// of its IDs drawn, a code generated for one, the IDs shown once and recorded,
// and the button that says what it will do filing the map and then starting
// the dataset's thread; the rules opened from Change with four choices; the
// old address opening the dataset with the step open; and, once done, what
// every file got. Every ID, code and name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import servedPolicy from "../../test/fixtures/pseudonymize_tags.json";
import { button, caps7a, dialogs, engine, settle, type Call } from "../../test/safeWayIn";
import { placesKept } from "../objects/kept";
import { DataPage } from "./DataPage";
import type { Dataset } from "./datasets";
import { policyKept } from "./policy";
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
  "GET /api/places",
  "PUT /api/places/{id}",
  "GET /api/places/{id}/originals",
  "POST /api/places/{id}/originals",
  "GET /api/datasets/{name}/summary",
  "GET /api/jobs",
  "POST /api/jobs",
  "GET /api/linkage/types",
  "POST /api/linkage/imports",
  "GET /api/linkage/held/ids",
  "POST /api/linkage/held/code",
  "POST /api/linkage/held/reveal",
  "GET /api/pseudonymize/tags",
];

const AT = "2026-10-09T19:44:00Z";
const ORIGINALS = 7544;
/** Eight IDs held, by shape; the values stay with the engine. */
const FILES = [3115, 2834, 652, 480, 183, 158, 80, 42];
const SHAPE = (i: number) => (i === 0 ? "AAA999999" : "aAAA9999");

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    id: 9,
    name: "study-identified",
    path: "/srv/data-test/study-identified",
    guarantees: {},
    probed: null,
    handling: { arrives: "identified", on_release: { uids: "remap", deface: false } },
    handling_declared: false,
    roots: 0,
    kind: "dataset",
    state: "identified",
    root: "data-test",
    arrives: "identified",
    patient_id: "subject-code",
    identity: { id_type: "study-id", from: [{ field: "PatientID" }] },
    unmapped: "hold",
    cohort: null,
    tags: null,
    held: { files: ORIGINALS, identifiers: 8 },
    trees: { originals: { path: "/srv/data-test/study-identified/derivatives/dcm-original", files: ORIGINALS, bytes: 1_900_000_000 }, anon: { path: "/srv/data-test/study-identified/derivatives/dcm-anon", files: 0, last_written: null } },
    digests: { count: 0, first: null, last: null, recent: [] },
    totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
    ...over,
  } as Dataset;
}

const step = (name: SummaryStep["step"], over: Partial<SummaryStep> = {}): SummaryStep => ({ step: name, state: "waiting", job: null, started_at: null, finished_at: null, progress: null, ...over });

function summaryOf(d: Dataset, pseudonymised: Partial<SummaryStep>): DatasetSummary {
  return {
    dataset: d.name,
    dataset_id: d.id,
    detail: "sensitive",
    state: "identified",
    added_at: "2026-10-09T19:12:00Z",
    subjects: 0,
    sessions: 0,
    studies: 0,
    scans: 0,
    sure: 0,
    need_a_look: 0,
    unsorted: 0,
    look_kinds: {},
    kinds: [],
    body_regions: [],
    files: { found: ORIGINALS, bytes: 1_900_000_000, read: 0, refused: 0, refused_batch: null, held: d.held?.files ?? 0 },
    pictures_place: "working",
    steps: [
      step("found", { state: "done", finished_at: "2026-10-09T19:12:00Z", files: ORIGINALS, tree: "originals" }),
      step("pseudonymised", { files: 0, waiting: ORIGINALS, held: d.held?.files ?? 0, ...pseudonymised }),
      step("read", { reads: 0, files: 0, refused: 0 }),
      step("sorted", { scans: 0, of: 0 }),
      step("body_part", { served: true, answered: 0, look: 0, of: 0, jobs: [] }),
      step("post_contrast", { state: "off", served: false, answered: 0, look: 0, of: 0, jobs: [] }),
      step("main_scans", { picked: 0, borders: 0 }),
      step("pictures", { made: 0, of: 0 }),
      step("views", { made: 0, of: 0 }),
    ],
  };
}

type HeldRowState = { state: string; code: string | null; also_in: string[] };

/** The engine's held IDs: one row each, by shape and never by value. */
function heldIds(states: Record<number, HeldRowState> = {}, subjects = { coded: 0, generated: 0 }) {
  return {
    place: "study-identified",
    files: ORIGINALS,
    identifiers: 8,
    ids: FILES.map((files, i) => ({ id: 100 + i, shape: SHAPE(i), id_type: "study-id", files, first_seen: "2026-10-09T19:12:00Z", batch: 3, waits_for: null, ...(states[100 + i] ?? { state: "held", code: null, also_in: [] }) })),
    subjects,
  };
}

/** What the rehearsal of the map answers: six of the eight named, two of them subjects study-big holds already. */
const REHEARSED = {
  rows: 6,
  subjects: { named: 6, known: 2, new: 4 },
  identifiers: { filed: 6, known: 0, new: 6, types_new: 0 },
  held_released: 7344,
  held_released_by: [{ type: "study-id", held_as: "study-id", files: 7344 }],
  merges: [],
  conflicts: [],
  dry_run: true,
  written: false,
  held_ids: [100, 101, 102, 103, 104, 106].map((id, i) => ({ id, code: `3e1b77c0a9d2f4${i}${i}`, also_in: i === 0 || i === 3 ? ["study-big"] : [] })),
};

/** A map of ID and subject code; the IDs are made up and have the held shapes. */
const MAP = "study ID,subject code\nABC123456,3e1b77c0a9d2f400\naBCD1234,3e1b77c0a9d2f411\naBCE1234,3e1b77c0a9d2f422\naBCF1234,3e1b77c0a9d2f433\naBCG1234,3e1b77c0a9d2f444\naBCI1234,3e1b77c0a9d2f455\n";

async function page(d: Dataset, pseudonymised: Partial<SummaryStep>, route: (c: Call, nth: number) => { status: number; body?: unknown } | undefined = () => undefined, opts: { step?: string; held?: ReturnType<typeof heldIds> } = {}) {
  const e = engine((c, nth) => {
    const r = route(c, nth);
    if (r) return r;
    if (c.url.startsWith("/api/sources")) return { status: 200, body: { count: 1, window_days: 30, sources: [d], rates: null } };
    if (c.method === "GET" && /^\/api\/places(\?|$)/.test(c.url)) return { status: 200, body: { places: [{ id: 30, name: "cold-store", role: "backup", path: "/vault/cold", retired_at: null }], enforced: true } };
    if (c.url === "/api/datasets/study-identified/summary") return { status: 200, body: summaryOf(d, pseudonymised) };
    if (c.url.startsWith("/api/linkage/held/ids?place=study-identified")) return { status: 200, body: opts.held ?? heldIds() };
    if (c.url === "/api/linkage/types") return { status: 200, body: [{ name: "study-id", description: "the study's own number" }] };
    if (c.url === "/api/pseudonymize/tags") return { status: 200, body: servedPolicy };
    if (c.url === "/api/places/9/originals") return { status: 200, body: { files: ORIGINALS, bytes: 1_900_000_000, verified: ORIGINALS, unverified: 0, held: 0, ready: true } };
    if (c.method === "GET" && c.url.startsWith("/api/jobs?")) return { status: 200, body: { count: 0, jobs: [] } };
    return undefined;
  });
  await act(async () => {
    await placesKept.refresh().catch(() => undefined);
    await policyKept.refresh().catch(() => undefined);
  });
  act(() => root.render(<DataPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} dataset={d.name} step={opts.step ?? null} />));
  await settle(10);
  return e;
}

const text = () => host.textContent ?? "";

describe("the pseudonymise step, in the dataset", () => {
  it("opens in place under the rail where IDs need a code: three boxes, one primary action, the rules as one line", async () => {
    await page(dataset(), {});
    const detail = host.querySelector(".dp-detail")!;
    const panel = detail.querySelector(".ps-step")!;
    expect(panel).not.toBeNull();
    // never a page of its own: the dataset's detail holds it, and its other columns step aside
    expect(location.hash).not.toContain("pseudonymisation");
    expect(detail.textContent).not.toContain("What it holds");
    expect(panel.querySelector(".tag.caution")?.textContent).toBe("8 IDs need a code");
    expect([...panel.querySelectorAll(".ps-box-label")].map((b) => b.textContent)).toEqual(["Originals", "IDs to codes", "Pseudonymised copy"]);
    expect([...panel.querySelectorAll(".ps-big")].map((b) => b.textContent)).toEqual(["7,544", "8", "0"]);
    expect(panel.textContent).toContain("files · 1.9 GB · locked");
    expect(panel.textContent).toContain("IDs · none has a code yet");
    expect(panel.textContent).toContain("files · what NILS reads");
    expect(panel.querySelector(".ps-actions .button:not(.secondary)")?.textContent).toBe("Give the 8 IDs a code");
    expect(button(panel, "Generate codes")).not.toBeNull();
    expect(panel.querySelector(".ps-rules-line")?.textContent).toBe("Standard rules");
    expect(button(panel, "Change")).not.toBeNull();
    // one primary button on screen: the head of the dataset leaves its own out
    expect(detail.querySelectorAll(".dp-acts .button:not(.secondary):not(.quiet)")).toHaveLength(0);
    // the rail: Pseudonymised between Found and Read, next, and a button that opens and closes the step
    const titles = [...detail.querySelectorAll(".dp-step-title")].map((t) => t.textContent);
    expect(titles.slice(0, 3)).toEqual(["Found", "Pseudonymised", "Read"]);
    const pick = detail.querySelector<HTMLButtonElement>(".dp-step-pick")!;
    expect(pick.getAttribute("aria-expanded")).toBe("true");
    expect(pick.closest(".dp-step")!.classList.contains("next")).toBe(true);
    expect(pick.closest(".dp-step")!.textContent).toContain("8 IDs need a code");
    expect(pick.closest(".dp-step")!.textContent).toContain("next step");
    expect(detail.querySelector(".dp-step")!.textContent).toContain("7,544 files, with names");
    act(() => pick.click());
    expect(detail.querySelector(".ps-step")).toBeNull();
    expect(detail.textContent).toContain("What it holds");
    act(() => pick.click());
    expect(detail.querySelector(".ps-step")).not.toBeNull();
  });

  it("lists the IDs by their shape, fills them as a dropped map matches, and files it before it pseudonymises and sorts", async () => {
    const e = await page(dataset(), {}, (c) => {
      if (c.method === "POST" && c.url === "/api/linkage/imports") return c.body?.dry_run ? { status: 200, body: REHEARSED } : { status: 202, body: { job: 51, state: "queued", rows: 6 } };
      if (c.method === "GET" && c.url === "/api/jobs/51") return { status: 200, body: { id: 51, kind: "linkage", name: "study-identified", state: "done", started_at: AT, heartbeat_at: null, finished_at: AT, progress: null, error: null, args: {}, result: null } };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 52, state: "queued" } };
      return undefined;
    });
    act(() => button(host, "Give the 8 IDs a code")!.click());
    const rows = () => [...host.querySelectorAll(".ps-table .ps-row:not(.head)")];
    expect(rows()).toHaveLength(8);
    expect(rows().map((r) => r.querySelector(".ps-shape")?.textContent)).toEqual(FILES.map((_, i) => SHAPE(i)));
    expect(rows().every((r) => r.textContent?.includes("no code yet"))).toBe(true);
    expect(rows().filter((r) => button(r, "Generate a code") !== null)).toHaveLength(8);
    expect(button(host, "Show the IDs · recorded")).not.toBeNull();
    expect(host.querySelector(".ps-boxes.compact")).not.toBeNull();
    // the map dropped in
    const input = host.querySelector<HTMLInputElement>(".ps-file input")!;
    Object.defineProperty(input, "files", { value: [new File([MAP], "map.csv", { type: "text/csv" })], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(8);
    const rehearsal = e.of("POST", "/api/linkage/imports")[0].body!;
    expect(rehearsal).toMatchObject({ place: "study-identified", dry_run: true, columns: [{ header: "id", role: "identifier", id_type: "study-id" }, { header: "code", role: "code" }] });
    expect((rehearsal.rows as string[][])).toHaveLength(6);
    // the rows fill as they match, one subject wherever the data came from said so
    expect(text()).toContain("map.csv");
    expect(text()).toContain("6 of 8 IDs matched");
    expect(text()).toContain("study ID, subject code · 7,344 files can go now");
    expect(rows().filter((r) => r.querySelector(".ps-code-value"))).toHaveLength(6);
    expect([...host.querySelectorAll(".ps-code .tag")].map((t) => t.textContent)).toEqual(["also in study-big", "also in study-big"]);
    expect(rows().filter((r) => r.textContent?.includes("no code yet"))).toHaveLength(2);
    expect(host.querySelector(".ps-foot .warn")?.textContent).toBe("200 files of 2 IDs wait for a code");
    expect(button(host, "Generate codes for these 2")).not.toBeNull();
    // no value of an ID is drawn
    for (const value of ["ABC123456", "aBCD1234"]) expect(text()).not.toContain(value);
    // the one button says what it does, and does it: the map filed, then the dataset's own thread
    await act(async () => {
      button(host, "Pseudonymise and sort 7,344 files")!.click();
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 1200));
    });
    await settle(8);
    const filed = e.of("POST", "/api/linkage/imports")[1].body!;
    expect(filed).toMatchObject({ place: "study-identified", dry_run: false });
    expect(filed.rows).toEqual(rehearsal.rows);
    expect(e.of("GET", "/api/jobs/51").length).toBeGreaterThan(0);
    const queued = e.of("POST", "/api/jobs")[0].body!;
    expect(queued.command).toEqual(["bring-in", "@study-identified", "--name", expect.stringMatching(/^study-identified-\d{4}-\d\d-\d\d$/), "--pack", "mri"]);
    expect(e.calls.findIndex((c) => c.method === "POST" && c.url === "/api/jobs")).toBeGreaterThan(e.calls.findIndex((c) => c.url === "/api/jobs/51"));
    expect(text()).toContain("study-identified: pseudonymising, then reading and sorting.");
  });

  it("takes a map pasted while the box has the focus, wherever the browser aims the paste, and Paste unread says to press Ctrl+V there", async () => {
    const e = await page(dataset(), {}, (c) => (c.method === "POST" && c.url === "/api/linkage/imports" ? { status: 200, body: REHEARSED } : undefined));
    act(() => button(host, "Give the 8 IDs a code")!.click());
    // Ctrl+V as Firefox aims it: at the selection, here the body, not at the box that has the focus
    const pasted = () => {
      const ev = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "clipboardData", { value: { getData: () => MAP } });
      document.body.dispatchEvent(ev);
      return ev;
    };
    // nothing is taken while the focus is elsewhere
    await act(async () => void pasted());
    expect(e.of("POST", "/api/linkage/imports")).toHaveLength(0);
    // Paste, where the browser will not read the clipboard, says what to do and puts the focus on the box
    act(() => button(host, "Paste")!.click());
    expect(host.querySelector(".ps-codes > p.warn")?.textContent).toBe("Press Ctrl+V on the box to paste.");
    expect(document.activeElement).toBe(host.querySelector(".ps-drop"));
    let ev: Event | null = null;
    await act(async () => {
      ev = pasted();
    });
    await settle(8);
    expect(ev!.defaultPrevented).toBe(true);
    const rehearsal = e.of("POST", "/api/linkage/imports")[0].body!;
    expect(rehearsal).toMatchObject({ place: "study-identified", dry_run: true });
    expect(rehearsal.rows as string[][]).toHaveLength(6);
    expect(text()).toContain("pasted");
    expect(text()).toContain("6 of 8 IDs matched");
    expect(host.querySelector(".ps-codes > p.warn")).toBeNull();
  });

  it("keeps the first row of a map with no header, and draws no ID of it", async () => {
    const e = await page(dataset(), {}, (c) => (c.method === "POST" && c.url === "/api/linkage/imports" ? { status: 200, body: REHEARSED } : undefined));
    act(() => button(host, "Give the 8 IDs a code")!.click());
    const input = host.querySelector<HTMLInputElement>(".ps-file input")!;
    const bare = MAP.slice(MAP.indexOf("\n") + 1);
    Object.defineProperty(input, "files", { value: [new File([bare], "map.csv", { type: "text/csv" })], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(8);
    const rows = e.of("POST", "/api/linkage/imports")[0].body!.rows as string[][];
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual(["ABC123456", "3e1b77c0a9d2f400"]);
    expect(text()).toContain("6 of 8 IDs matched");
    expect(text()).toContain("no header row · 7,344 files can go now");
    for (const value of ["ABC123456", "aBCD1234"]) expect(text()).not.toContain(value);
  });

  it("gives one ID a generated code, marked for the next run and nothing queued", async () => {
    let marked = false;
    const e = await page(dataset(), {}, (c) => {
      if (c.method === "POST" && c.url === "/api/linkage/held/code") {
        marked = true;
        return { status: 200, body: { place: "study-identified", files: 42, job: null, state: "marked" } };
      }
      if (c.url.startsWith("/api/linkage/held/ids") && marked) return { status: 200, body: heldIds({ 107: { state: "generated", code: null, also_in: [] } }) };
      return undefined;
    });
    act(() => button(host, "Give the 8 IDs a code")!.click());
    const last = [...host.querySelectorAll(".ps-table .ps-row:not(.head)")][7];
    await act(async () => {
      button(last, "Generate a code")!.click();
    });
    await settle(8);
    expect(e.of("POST", "/api/linkage/held/code")[0].body).toEqual({ place: "study-identified", ids: [107], run: false });
    expect(e.of("POST", "/api/jobs")).toHaveLength(0);
    const after = [...host.querySelectorAll(".ps-table .ps-row:not(.head)")][7];
    expect(after.textContent).toContain("a generated code, at the run");
    expect(button(after, "Generate a code")).toBeNull();
  });

  it("shows the IDs once, recorded, in their rows, and lets them go", async () => {
    const e = await page(dataset(), {}, (c) =>
      c.method === "POST" && c.url === "/api/linkage/held/reveal" ? { status: 200, body: [{ shape: "AAA999999", id_type: "study-id", files: 3115, identifiers: [{ id: 100, value: "ABC123456", files: 3115 }] }] } : undefined,
    );
    act(() => button(host, "Give the 8 IDs a code")!.click());
    await act(async () => {
      button(host, "Show the IDs · recorded")!.click();
    });
    await settle(4);
    expect(e.of("POST", "/api/linkage/held/reveal")).toHaveLength(1);
    expect(host.querySelector(".ps-table .ps-row:not(.head) .ps-shape")?.textContent).toBe("ABC123456");
    act(() => button(host, "Hide the IDs")!.click());
    expect(text()).not.toContain("ABC123456");
  });

  it("opens the rules from Change: four choices, Save sends what changed, a purge warns", async () => {
    const e = await page(dataset(), {}, (c) => (c.method === "PUT" && c.url === "/api/places/9" ? { status: 200, body: {} } : undefined));
    act(() => button(host.querySelector(".ps-step")!, "Change")!.click());
    await settle(4);
    const dialog = host.querySelector("dialog")!;
    expect(dialog.querySelector("h2")?.textContent).toBe("Rules for study-identified");
    expect([...dialog.querySelectorAll(".ps-rule-label")].map((l) => l.textContent)).toEqual(["PatientID gets", "An ID with no code", "Tags", "The originals, once done"]);
    expect(dialog.textContent).not.toContain("Feeds a cohort");
    expect(dialog.textContent).toContain("Standard, 96 removed");
    act(() => button(dialog, "Purged")!.click());
    expect(dialog.textContent).toContain("Deleted once each copy is proven. It cannot be undone.");
    act(() => button(dialog, "Kept")!.click());
    act(() => button(dialog, "It gets a generated code")!.click());
    await act(async () => {
      button(dialog, "Save")!.click();
    });
    await settle(6);
    expect(e.of("PUT", "/api/places/9")[0].body).toEqual({ unmapped: "code" });
  });

  it("goes at once where PatientID holds a personnummer: the key codes it, no map", async () => {
    const e = await page(dataset({ held: { files: 0, identifiers: 0 }, identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } }), { held: 0 }, (c) =>
      c.method === "POST" && c.url === "/api/jobs" ? { status: 202, body: { job: 60, state: "queued" } } : undefined,
      { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } },
    );
    const panel = host.querySelector(".ps-step")!;
    expect(panel.textContent).toContain("personnummer, coded by the key");
    await act(async () => {
      button(panel, "Pseudonymise and sort 7,544 files")!.click();
    });
    await settle(6);
    expect(e.of("POST", "/api/jobs")[0].body!.command).toEqual(["bring-in", "@study-identified", "--name", expect.stringMatching(/^study-identified-/), "--pack", "mri"]);
  });

  it("is opened by the old address of the dataset's Pseudonymisation page, and once done says what every file got", async () => {
    const done = dataset({ held: { files: 0, identifiers: 0 }, trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: ORIGINALS, bytes: 1_900_000_000 }, anon: { path: "/srv/x/derivatives/dcm-anon", files: ORIGINALS, last_written: AT } } });
    await page(done, { state: "done", files: ORIGINALS, waiting: 0, held: 0, started_at: "2026-10-09T19:43:19Z", finished_at: AT }, () => undefined, { step: "pseudonymisation", held: { ...heldIds({}, { coded: 8, generated: 2 }), files: 0, identifiers: 0, ids: [] } });
    const summary = host.querySelector(".ps-done")!;
    expect(summary).not.toBeNull();
    expect(summary.querySelector(".ps-title")?.textContent).toBe("Pseudonymised");
    expect(summary.querySelector(".tag.ok")?.textContent).toBe("7,544 files · 8 subjects");
    expect(summary.textContent).toContain("6 from a map · 2 generated");
    expect(summary.textContent).toContain("In every file");
    expect(summary.textContent).toContain("the subject code");
    expect(summary.textContent).toContain("names, birth date, address and 93 more");
    expect(summary.textContent).toContain("See all 100");
    expect(summary.textContent).toContain("2 subjects have generated codes; a map later folds them into the right subject");
    expect(summary.textContent).toContain("The originals are kept, locked, 1.9 GB");
    expect(button(summary, "Vault or purge")).not.toBeNull();
    // and the log beside it
    expect(host.querySelector(".ps-cols")!.textContent).toContain("Its log");
    // done, the step is not opened by itself: the address opened it
    expect(host.querySelector(".dp-step-pick")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("stays closed on a done dataset unless asked, and offers the dataset's settings and its originals in its menu", async () => {
    const done = dataset({ held: { files: 0, identifiers: 0 }, trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: ORIGINALS, bytes: 1 }, anon: { path: "/srv/x/derivatives/dcm-anon", files: ORIGINALS, last_written: AT } } });
    await page(done, { state: "done", files: ORIGINALS, waiting: 0, held: 0 }, () => undefined, { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } });
    expect(host.querySelector(".ps-step, .ps-done")).toBeNull();
    const menu = host.querySelector(".dp-acts .more-list")!;
    expect(button(menu, "Settings")).not.toBeNull();
    expect(button(menu, "The originals")).not.toBeNull();
    expect(menu.textContent).not.toContain("Pseudonymisation");
    act(() => button(menu, "Settings")!.click());
    expect(host.querySelector("dialog h2")?.textContent).toBe("Settings of study-identified");
    expect(host.querySelector("dialog")!.textContent).toContain("Feeds a cohort");
  });
});
