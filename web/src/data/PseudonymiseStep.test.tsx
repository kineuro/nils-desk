// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The pseudonymise step of a dataset on the Data page (Wave 7a, the design
// Nima confirmed on 2026-10-09), as it draws and acts against an engine: it
// opens in place under the rail where IDs need a subject code, never on a page of its
// own, with the three boxes, one primary action and the rules as one line;
// the IDs listed one row each by their shape, a dropped map rehearsed and the
// rows filled as they match, a pasted one taken while the box has the focus
// wherever the browser aims the paste, one with no header kept whole with none
// of its IDs drawn, a code generated for one, the IDs shown once and recorded,
// and the button that says what it will do filing the map and then starting
// the dataset's thread; the rules opened from Change with four choices; the
// old address opening the dataset with the step open; once done, what every
// file got and what the last run did; and the page's words about a run that
// go once it is over. Every ID, code and name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import servedPolicy from "../../test/fixtures/pseudonymize_tags.json";
import { button, caps7a, dialogs, engine, settle as settleReal, type Call } from "../../test/safeWayIn";
import { placesKept } from "../objects/kept";
import { DataPage } from "./DataPage";
import type { Dataset } from "./datasets";
import { policyKept } from "./policy";
import type { DatasetSummary, SummaryStep } from "./summary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every promise the last act started, settled; under the test's own clock, by running its timers as far as now. */
async function settle(times = 6) {
  if (!vi.isFakeTimers()) return settleReal(times);
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

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

type HeldRowState = { state: string; code: string | null; also_in: string[]; id_type?: string; shape?: string };

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

async function page(
  d: Dataset,
  pseudonymised: Partial<SummaryStep>,
  route: (c: Call, nth: number) => { status: number; body?: unknown } | undefined = () => undefined,
  opts: { step?: string; held?: ReturnType<typeof heldIds>; hold?: (url: string) => boolean } = {},
) {
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
  // a door the test holds answers never, as one that takes longer than the test looks
  const hold = opts.hold;
  if (hold) {
    const answered = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => (hold(String(input)) ? new Promise<Response>(() => undefined) : answered(input, init)));
  }
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
  it("opens in place under the rail where IDs need a subject code: three boxes, one primary action, the rules as one line", async () => {
    await page(dataset(), {});
    const detail = host.querySelector(".dp-detail")!;
    const panel = detail.querySelector(".ps-step")!;
    expect(panel).not.toBeNull();
    // never a page of its own: the dataset's detail holds it, and its other columns step aside
    expect(location.hash).not.toContain("pseudonymisation");
    expect(detail.textContent).not.toContain("What it holds");
    expect(panel.querySelector(".tag.caution")?.textContent).toBe("8 IDs need a subject code");
    expect([...panel.querySelectorAll(".ps-box-label")].map((b) => b.textContent)).toEqual(["Originals", "IDs to subject codes", "Pseudonymised copy"]);
    expect([...panel.querySelectorAll(".ps-big")].map((b) => b.textContent)).toEqual(["7,544", "8", "0"]);
    expect(panel.textContent).toContain("files · 1.9 GB · locked");
    expect(panel.textContent).toContain("IDs · none has a subject code yet");
    expect(panel.textContent).toContain("files · what NILS reads");
    // files that wait for subject codes: one line says it is the next step and why, and generating them is the one primary act
    expect(panel.querySelector(".ps-next")?.textContent).toBe("Next: 8 IDs have no subject code yet, so their 7,544 files wait. Generate the subject codes from the IDs, or give them from a map.");
    expect(panel.querySelector(".ps-actions .button:not(.secondary)")?.textContent).toBe("Generate subject codes");
    expect(button(panel, "Give them from a map")?.classList.contains("secondary")).toBe(true);
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
    expect(pick.closest(".dp-step")!.textContent).toContain("8 IDs need a subject code");
    expect(pick.closest(".dp-step")!.textContent).toContain("next step");
    expect(detail.querySelector(".dp-step")!.textContent).toContain("7,544 files, with names");
    act(() => pick.click());
    expect(detail.querySelector(".ps-step")).toBeNull();
    expect(detail.textContent).toContain("What it holds");
    act(() => pick.click());
    expect(detail.querySelector(".ps-step")).not.toBeNull();
  });

  it("generates every waiting ID's subject code and runs the dataset's own thread in one press (2026-10-10)", async () => {
    const e = await page(dataset(), {}, (c) => {
      if (c.method === "POST" && c.url === "/api/linkage/held/code") return { status: 200, body: { files: 7544, state: "marked" } };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 61, state: "queued" } };
      return undefined;
    });
    act(() => button(host, "Generate subject codes")!.click());
    await settle(10);
    // every held ID of the dataset, none chosen one by one, marked and not run by the door itself
    expect(e.of("POST", "/api/linkage/held/code").map((c) => c.body)).toEqual([{ place: "study-identified", run: false }]);
    // then the dataset's own thread: pseudonymise, read and sort
    expect(e.of("POST", "/api/jobs")).toHaveLength(1);
  });

  it("lists the IDs by their shape, fills them as a dropped map matches, and files it before it pseudonymises and sorts", async () => {
    const e = await page(dataset(), {}, (c) => {
      if (c.method === "POST" && c.url === "/api/linkage/imports") return c.body?.dry_run ? { status: 200, body: REHEARSED } : { status: 202, body: { job: 51, state: "queued", rows: 6 } };
      if (c.method === "GET" && c.url === "/api/jobs/51") return { status: 200, body: { id: 51, kind: "linkage", name: "study-identified", state: "done", started_at: AT, heartbeat_at: null, finished_at: AT, progress: null, error: null, args: {}, result: null } };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 52, state: "queued" } };
      return undefined;
    });
    act(() => button(host, "Give them from a map")!.click());
    const rows = () => [...host.querySelectorAll(".ps-table .ps-row:not(.head)")];
    expect(rows()).toHaveLength(8);
    expect(rows().map((r) => r.querySelector(".ps-shape")?.textContent)).toEqual(FILES.map((_, i) => SHAPE(i)));
    expect(rows().every((r) => r.textContent?.includes("no subject code yet"))).toBe(true);
    expect(rows().filter((r) => button(r, "Generate a subject code") !== null)).toHaveLength(8);
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
    expect(rows().filter((r) => r.textContent?.includes("no subject code yet"))).toHaveLength(2);
    expect(host.querySelector(".ps-foot .warn")?.textContent).toBe("200 files of 2 IDs wait for a subject code");
    expect(button(host, "Generate subject codes for these 2")).not.toBeNull();
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

  it("finishes what it started when the step is closed from the rail while the map files: the run is queued and the step stops saying it acts", async () => {
    let filed = false;
    const e = await page(dataset(), {}, (c) => {
      if (c.method === "POST" && c.url === "/api/linkage/imports") return c.body?.dry_run ? { status: 200, body: REHEARSED } : { status: 202, body: { job: 51, state: "queued", rows: 6 } };
      if (c.method === "GET" && c.url === "/api/jobs/51") return { status: 200, body: { id: 51, kind: "linkage", name: "study-identified", state: filed ? "done" : "running", started_at: AT, heartbeat_at: null, finished_at: filed ? AT : null, progress: null, error: null, args: {}, result: null } };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 52, state: "queued" } };
      return undefined;
    });
    act(() => button(host, "Give them from a map")!.click());
    const input = host.querySelector<HTMLInputElement>(".ps-file input")!;
    Object.defineProperty(input, "files", { value: [new File([MAP], "map.csv", { type: "text/csv" })], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(8);
    await act(async () => {
      button(host, "Pseudonymise and sort 7,344 files")!.click();
    });
    await settle(4);
    expect(e.of("POST", "/api/linkage/imports")).toHaveLength(2);
    // closed from the rail while the map files
    act(() => host.querySelector<HTMLButtonElement>(".dp-step-pick")!.click());
    expect(host.querySelector(".ps-step")).toBeNull();
    await act(async () => {
      await new Promise((done) => setTimeout(done, 1200));
    });
    expect(e.of("POST", "/api/jobs")).toHaveLength(0);
    filed = true;
    await act(async () => {
      await new Promise((done) => setTimeout(done, 1200));
    });
    await settle(8);
    // the map's run is queued all the same, and nothing says the codes are still being given
    expect(e.of("POST", "/api/jobs")).toHaveLength(1);
    expect(text()).not.toContain("giving the codes");
    expect(text()).toContain("study-identified: pseudonymising, then reading and sorting.");
  }, 20_000);

  it("draws two hundred IDs at a time, the most files first, where a dataset holds thousands", async () => {
    const many = { ...heldIds(), identifiers: 450, ids: Array.from({ length: 450 }, (_, i) => ({ id: 1000 + i, shape: "aAAA9999", id_type: "study-id", files: 450 - i, first_seen: AT, batch: 3, waits_for: null, state: "held" as const, code: null, also_in: [] })) };
    await page(dataset({ held: { files: ORIGINALS, identifiers: 450 } }), {}, () => undefined, { held: many });
    act(() => button(host, "Give them from a map")!.click());
    const rows = () => [...host.querySelectorAll(".ps-table .ps-row:not(.head)")].filter((r) => r.querySelector(".ps-shape"));
    expect(rows()).toHaveLength(200);
    expect(rows()[0].textContent).toContain("450");
    expect(host.querySelector(".ps-table")?.textContent).toContain("200 of 450 IDs, the most files first");
    act(() => button(host, "Show 200 more")!.click());
    expect(rows()).toHaveLength(400);
    act(() => button(host, "Show 50 more")!.click());
    expect(rows()).toHaveLength(450);
    expect(host.querySelector(".ps-table")?.textContent).not.toContain("more");
  });

  it("takes a map pasted while the box has the focus, wherever the browser aims the paste, and Paste unread says to press Ctrl+V there", async () => {
    const e = await page(dataset(), {}, (c) => (c.method === "POST" && c.url === "/api/linkage/imports" ? { status: 200, body: REHEARSED } : undefined));
    act(() => button(host, "Give them from a map")!.click());
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
    act(() => button(host, "Give them from a map")!.click());
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

  it("names a map's header that is a value by its place, and prints no value of the file (Wave 7b, section 18)", async () => {
    const e = await page(dataset(), {}, (c) => (c.method === "POST" && c.url === "/api/linkage/imports" ? { status: 200, body: REHEARSED } : undefined));
    act(() => button(host, "Give them from a map")!.click());
    const input = host.querySelector<HTMLInputElement>(".ps-file input")!;
    // a header with the digits of a number in it is a value and no name: its place stands for it, and the other header is still its own
    const csv = MAP.replace("study ID,subject code", "ABC12345,subject code");
    Object.defineProperty(input, "files", { value: [new File([csv], "map.csv", { type: "text/csv" })], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(8);
    expect(e.of("POST", "/api/linkage/imports")).toHaveLength(1);
    expect(text()).toContain("column 1, subject code");
    // no value of the file is drawn: not the header that was one, not an ID (the subject codes a match fills in are the table's own, by design)
    for (const value of ["ABC12345", "ABC123456", "aBCD1234", "aBCE1234"]) expect(text()).not.toContain(value);
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
    act(() => button(host, "Give them from a map")!.click());
    const last = [...host.querySelectorAll(".ps-table .ps-row:not(.head)")][7];
    await act(async () => {
      button(last, "Generate a subject code")!.click();
    });
    await settle(8);
    expect(e.of("POST", "/api/linkage/held/code")[0].body).toEqual({ place: "study-identified", ids: [107], run: false });
    expect(e.of("POST", "/api/jobs")).toHaveLength(0);
    const after = [...host.querySelectorAll(".ps-table .ps-row:not(.head)")][7];
    expect(after.textContent).toContain("a generated subject code, at the run");
    expect(button(after, "Generate a subject code")).toBeNull();
  });

  it("says where an ID's shape is the study's UID, not an ID of PatientID's form", async () => {
    // 2026-10-10: study UID shapes stood under "ID, as its shape" unexplained
    await page(dataset(), {}, undefined, { held: heldIds({ 101: { state: "held", code: null, also_in: [], id_type: "study-instance-uid", shape: "9.99.999.9.9" } }) });
    act(() => button(host, "Give them from a map")!.click());
    const rows = [...host.querySelectorAll(".ps-table .ps-row:not(.head)")];
    expect(rows[1].querySelector(".ps-shape")?.textContent).toBe("9.99.999.9.9 no ID in PatientID's form: by study UID");
    expect(rows[0].querySelector(".ps-shape-note")).toBeNull();
  });

  it("shows the IDs once, recorded, in their rows, and lets them go", async () => {
    const e = await page(dataset(), {}, (c) =>
      c.method === "POST" && c.url === "/api/linkage/held/reveal" ? { status: 200, body: [{ shape: "AAA999999", id_type: "study-id", files: 3115, identifiers: [{ id: 100, value: "ABC123456", files: 3115 }] }] } : undefined,
    );
    act(() => button(host, "Give them from a map")!.click());
    await act(async () => {
      button(host, "Show the IDs · recorded")!.click();
    });
    await settle(4);
    expect(e.of("POST", "/api/linkage/held/reveal")).toHaveLength(1);
    expect(host.querySelector(".ps-table .ps-row:not(.head) .ps-shape")?.textContent).toBe("ABC123456");
    act(() => button(host, "Hide the IDs")!.click());
    expect(text()).not.toContain("ABC123456");
  });

  it("opens the rules from Change: its choices, Save sends what changed, a purge warns", async () => {
    const e = await page(dataset(), {}, (c) => (c.method === "PUT" && c.url === "/api/places/9" ? { status: 200, body: {} } : undefined));
    act(() => button(host.querySelector(".ps-step")!, "Change")!.click());
    await settle(4);
    const dialog = host.querySelector("dialog")!;
    expect(dialog.querySelector("h2")?.textContent).toBe("Rules for study-identified");
    expect([...dialog.querySelectorAll(".ps-rule-label")].map((l) => l.textContent)).toEqual(["PatientID holds", "The pseudonymised copy's PatientID gets", "An ID with no subject code", "Tags", "The originals, once done"]);
    expect(dialog.textContent).not.toContain("Feeds a cohort");
    expect(dialog.textContent).toContain("Standard, 96 removed");
    act(() => button(dialog, "Purged")!.click());
    expect(dialog.textContent).toContain("Deleted once each copy is proven. It cannot be undone.");
    act(() => button(dialog, "Kept")!.click());
    act(() => button(dialog, "It gets a generated subject code")!.click());
    await act(async () => {
      button(dialog, "Save")!.click();
    });
    await settle(6);
    expect(e.of("PUT", "/api/places/9")[0].body).toEqual({ unmapped: "code" });
  });

  it("changes what the originals' PatientID holds in the rules, before anything is pseudonymised", async () => {
    // 2026-10-10: a dataset added with the wrong kind of ID had no way back but removing it
    const e = await page(dataset(), {}, (c) => (c.method === "PUT" && c.url === "/api/places/9" ? { status: 200, body: {} } : undefined));
    act(() => button(host.querySelector(".ps-step")!, "Change")!.click());
    await settle(4);
    const dialog = host.querySelector("dialog")!;
    act(() => button(dialog, "The same everywhere (personnummer, national ID)")!.click());
    await act(async () => {
      button(dialog, "Save")!.click();
    });
    await settle(6);
    expect(e.of("PUT", "/api/places/9")[0].body).toEqual({ identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } });
  });

  it("says where its run stopped, in the job's own words, and tries it again: a failure never looks like nothing happened", async () => {
    // 2026-10-10: a pseudonymise run that failed at once left the step as it was, its button the same
    const words = "no id type named study-id; nils linkage id-type list shows them, id-type add creates one";
    const e = await page(dataset({ held: { files: 0, identifiers: 0 }, identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } }), { held: 0, state: "failed", job: 154 }, (c) => {
      if (c.method === "GET" && c.url === "/api/jobs/154") return { status: 200, body: { id: 154, kind: "pseudonymize", state: "failed", error: words } };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 155, state: "queued" } };
      return undefined;
    }, { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } });
    await settle(6);
    const panel = host.querySelector(".ps-step")!;
    expect(panel.querySelector(".ps-stopped")?.textContent).toBe(`Stopped: ${words} Change what it names, then try again.`);
    // inside the panel, under its boxes, never at its edge (2026-10-10)
    expect(panel.querySelector(".ps-pad > .ps-stopped")).not.toBeNull();
    // the steps line says it stopped
    const rail = host.querySelector(".dp-steps")!;
    expect([...rail.querySelectorAll(".dp-step")].find((li) => li.textContent?.startsWith("Pseudonymised"))?.textContent).toContain("stopped");
    // the one button tries the run again
    const again = button(panel, "Try again")!;
    expect(again).not.toBeNull();
    expect(button(panel, "Pseudonymise and sort 7,544 files")).toBeNull();
    await act(async () => {
      again.click();
    });
    await settle(6);
    expect(e.of("POST", "/api/jobs")).toHaveLength(1);
  });

  it("goes at once where PatientID holds a personnummer: the key codes it, no map", async () => {
    const e = await page(dataset({ held: { files: 0, identifiers: 0 }, identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } }), { held: 0 }, (c) =>
      c.method === "POST" && c.url === "/api/jobs" ? { status: 202, body: { job: 60, state: "queued" } } : undefined,
      { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } },
    );
    const panel = host.querySelector(".ps-step")!;
    expect(panel.textContent).toContain("coded by the key from an ID that is the same everywhere");
    await act(async () => {
      button(panel, "Pseudonymise and sort 7,544 files")!.click();
    });
    await settle(6);
    expect(e.of("POST", "/api/jobs")[0].body!.command).toEqual(["bring-in", "@study-identified", "--name", expect.stringMatching(/^study-identified-/), "--pack", "mri"]);
  });

  it("says a count of the originals that stopped short as at least, on the box and the button, and a whole one as it is (2026-10-16)", async () => {
    const partial = dataset({
      held: { files: 0, identifiers: 0 },
      identity: { id_type: "personnummer", from: [{ field: "PatientID" }] },
      trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: ORIGINALS, bytes: 1_900_000_000, partial: true }, anon: { path: "/srv/x/derivatives/dcm-anon", files: 0, last_written: null } },
    });
    await page(partial, { held: 0, waiting_partial: true }, () => undefined, { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } });
    const panel = host.querySelector(".ps-step")!;
    const box = panel.querySelector(".ps-big")!;
    expect(box.textContent).toBe("at least 7,544");
    expect(box.getAttribute("title")).toBe("at least 7,544 files: counted until the count stopped; a run counts them all");
    expect(button(panel, "Pseudonymise and sort at least 7,544 files")).not.toBeNull();
    expect(button(panel, "Pseudonymise and sort 7,544 files")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    // the same dataset counted whole says no "at least" anywhere
    const whole = dataset({ ...partial, trees: { ...partial.trees!, originals: { ...partial.trees!.originals!, partial: false } } });
    await page(whole, { held: 0 }, () => undefined, { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } });
    const again = host.querySelector(".ps-step")!;
    expect(again.querySelector(".ps-big")!.textContent).toBe("7,544");
    expect(button(again, "Pseudonymise and sort 7,544 files")).not.toBeNull();
    expect(host.querySelector(".dp-steps")!.textContent).not.toContain("at least");
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
    expect(summary.textContent).toContain("2 subjects have generated subject codes; a map later folds them into the right subject");
    expect(summary.textContent).toContain("The originals are kept, locked, 1.9 GB");
    expect(button(summary, "Vault or purge")).not.toBeNull();
    // and the log beside it
    expect(host.querySelector(".ps-cols")!.textContent).toContain("Its log");
    // done, the step is not opened by itself: the address opened it
    expect(host.querySelector(".dp-step-pick")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("says once done what the last run did: the files written, the codes made, what the registry held already and what is not an image", async () => {
    // 2026-10-10: a run on a test install wrote every file, and its read found the scans in the registry already, from another dataset
    const done = dataset({ held: { files: 0, identifiers: 0 }, trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: ORIGINALS, bytes: 1_900_000_000 }, anon: { path: "/srv/x/derivatives/dcm-anon", files: ORIGINALS, last_written: AT } } });
    const summary = summaryOf(done, { state: "done", files: ORIGINALS, waiting: 0, held: 0, job: 127, started_at: "2026-10-10T09:50:43Z", finished_at: "2026-10-10T09:50:47Z" });
    summary.steps = summary.steps.map((x) => (x.step === "read" ? { ...x, state: "done", job: 128, files: 7328, refused: 216, set_aside: 216, reads: 1 } : x));
    const job = (id: number, kind: string, result: unknown, progress: unknown = null) => ({ status: 200, body: { id, kind, name: "study-identified-2026-10-10", state: "done", started_at: AT, heartbeat_at: null, finished_at: AT, progress, error: null, args: {}, result } });
    await page(
      done,
      {},
      (c) => {
        if (c.url === "/api/datasets/study-identified/summary") return { status: 200, body: summary };
        if (c.method === "GET" && c.url === "/api/jobs/127") return job(127, "pseudonymize", { files: { seen: ORIGINALS, written: ORIGINALS, unchanged: 0, held: 0 }, subjects: { new: 8 } });
        if (c.method === "GET" && c.url === "/api/jobs/128") return job(128, "digest", null, { ingested: 0, duplicate: 7328, changed: 0, held: 0, gone: 0, stacks_created: 0 });
        return undefined;
      },
      { step: "pseudonymisation", held: { ...heldIds({}, { coded: 8, generated: 8 }), files: 0, identifiers: 0, ids: [] } },
    );
    const line = host.querySelector(".ps-done .ps-outcome");
    expect(line?.textContent).toBe("Last run7,544 files pseudonymised · 8 new subject codes · 7,328 files already in the registry · 216 files set aside: not scans");
    // the button that started it is gone: there is nothing left to pseudonymise
    expect(button(host, "Pseudonymise and sort 7,544 files")).toBeNull();
  });

  it("says on the page that the run started while it goes, and lets the words go once it is over", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      let phase: "before" | "running" | "over" = "before";
      const d = dataset({ held: { files: 0, identifiers: 0 }, identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } });
      await page(
        d,
        { held: 0 },
        (c) => {
          if (c.method === "POST" && c.url === "/api/jobs") {
            phase = "running";
            return { status: 202, body: { job: 60, state: "queued" } };
          }
          if (c.url === "/api/datasets/study-identified/summary" && phase !== "before")
            return { status: 200, body: summaryOf(d, phase === "running" ? { state: "running", job: 60, held: 0 } : { state: "done", job: 60, files: ORIGINALS, waiting: 0, held: 0, finished_at: new Date().toISOString() }) };
          return undefined;
        },
        { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } },
      );
      await act(async () => {
        button(host.querySelector(".ps-step")!, "Pseudonymise and sort 7,544 files")!.click();
      });
      await settle(8);
      expect(text()).toContain("study-identified: pseudonymising, then reading and sorting.");
      expect(host.querySelector(".ps-step .tag")?.textContent).toBe("Running");
      // the run ends: the page reads the dataset again while it ran, and the words go with the run
      phase = "over";
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      await settle(8);
      expect(text()).not.toContain("pseudonymising, then reading and sorting.");
      expect(host.querySelector(".ps-done")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);

  it("asks the held IDs once while their door has not answered, however often the summary moves under a run (2026-10-17)", async () => {
    // production: the held IDs door took 13 s on a large dataset, and each read of the summary asked it again
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      let files = 0;
      const d = dataset();
      await page(d, {}, (c) => (c.url === "/api/datasets/study-identified/summary" ? { status: 200, body: summaryOf(d, { state: "running", job: 60, files: (files += 1000) }) } : undefined));
      const answered = globalThis.fetch;
      let reads = 0;
      vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).startsWith("/api/linkage/held/ids")) return answered(input, init);
        reads += 1;
        return new Promise<Response>(() => undefined);
      });
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000);
        });
        await settle(6);
      }
      // the summary moved on each of its reads; the held IDs were asked once, and that read is still out
      expect(files).toBeGreaterThan(4_000);
      expect(reads).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);

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

describe("the pseudonymise step after a run, where the probe stopped short (2026-10-17)", () => {
  // the probe of each tree is bounded (2 s or 200,000 entries): on a large dataset it stops short of both
  const big = () =>
    dataset({
      held: { files: 0, identifiers: 0 },
      identity: { id_type: "personnummer", from: [{ field: "PatientID" }] },
      trees: {
        originals: { path: "/srv/x/derivatives/dcm-original", files: 78570, bytes: 12_299_736_493, partial: true },
        anon: { path: "/srv/x/derivatives/dcm-anon", files: 0, last_written: null, partial: true },
      },
    });
  const SUBJECTS = { ...heldIds({}, { coded: 4399, generated: 0 }), files: 0, identifiers: 0, ids: [] };
  const RAN = { job: 69, started_at: "2026-10-16T18:44:00Z", finished_at: "2026-10-17T01:51:34Z" };
  /** The summary as the engine answers it: the found step counts the originals the run walked, whole. */
  function after(d: Dataset, pseudonymised: Partial<SummaryStep>, walked: number | null = 30_689_981): DatasetSummary {
    const s = summaryOf(d, { held: 0, ...pseudonymised });
    if (walked === null) return s;
    return {
      ...s,
      files: { ...s.files, found: walked, bytes: null, found_partial: false },
      steps: s.steps.map((x) => (x.step === "found" ? { ...x, files: walked, bytes: null, partial: false, counted_by: "pseudonymise" as const } : x)),
    };
  }
  const offers = () => [...host.querySelectorAll("button")].map((b) => b.textContent ?? "").filter((t) => t.startsWith("Pseudonymise and sort"));
  const railStep = (title: string) => [...host.querySelectorAll(".dp-steps .dp-step")].find((li) => li.querySelector(".dp-step-title")?.textContent === title)!;

  it("is done once the run wrote every copy it could: no button, the rail done, the originals as the run counted them, the card past it", async () => {
    // engine 1.0.0-alpha.89: counted from the newest whole run, 35,549 of the files refused as not DICOM
    const d = big();
    const s = after(d, { ...RAN, state: "done", files: 30_654_432, waiting: 0, partial: false, waiting_partial: false });
    await page(d, {}, (c) => (c.url === "/api/datasets/study-identified/summary" ? { status: 200, body: s } : undefined), { step: "pseudonymisation", held: SUBJECTS });
    expect(offers()).toEqual([]);
    expect(host.querySelector(".ps-step")).toBeNull();
    const done = host.querySelector(".ps-done")!;
    expect(done.querySelector(".tag.ok")?.textContent).toBe("30,654,432 files · 4,399 subjects");
    expect([...done.querySelectorAll(".ps-big")].map((b) => b.textContent)).toEqual(["30,689,981", "4,399", "30,654,432"]);
    // no size from a probe that measured part of the tree
    expect(done.textContent).toContain("The originals are kept, locked");
    expect(done.textContent).not.toContain("GB");
    const rail = railStep("Pseudonymised");
    expect(rail.classList.contains("done")).toBe(true);
    expect(rail.textContent).toContain("30,654,432 files");
    expect(rail.textContent).not.toContain("not yet");
    expect(rail.textContent).not.toContain("next step");
    // the card and the dataset's head go on to the read, never back to pseudonymising
    const card = host.querySelector(".dp-card")!;
    expect(card.querySelector(".dp-card-head .tag")?.textContent).toBe("Ready");
    expect(card.querySelector(".dp-line")?.textContent).toBe("Not read yet");
    expect(card.querySelector(".dp-nums b")?.textContent).toBe("30,689,981");
    expect(host.querySelector(".dp-detail .dp-acts .button:not(.secondary):not(.quiet)")?.textContent).toBe("Read");
    expect(host.querySelector(".dp-detail-where")?.textContent).toContain("pseudonymised");
  });

  it("is never a dataset never run against an engine whose counts are the probe's: the rest is offered, never every file again", async () => {
    // engine 1.0.0-alpha.88: the step's counts are the probe's (a copy of 0, stopped short), but it names the run
    const d = big();
    const s = after(d, { ...RAN, state: "waiting", files: 0, waiting: 78570, partial: true, waiting_partial: true });
    const e = await page(
      d,
      {},
      (c) => {
        if (c.url === "/api/datasets/study-identified/summary") return { status: 200, body: s };
        if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 73, state: "queued" } };
        if (c.method === "PUT" && c.url === "/api/places/9") return { status: 200, body: {} };
        return undefined;
      },
      { held: SUBJECTS },
    );
    const panel = host.querySelector(".ps-step")!;
    // the originals as the run walked them; the copy's count stopped before it reached a file, so it is not said
    const boxes = [...panel.querySelectorAll(".ps-big")];
    expect(boxes.map((b) => b.textContent)).toEqual(["30,689,981", "4,399", "?"]);
    expect(boxes[2].getAttribute("title")).toBe("not counted: the count stopped before it reached a file");
    expect(panel.textContent).not.toContain("12.3 GB");
    expect(offers()).toEqual(["Pseudonymise and sort the rest"]);
    expect(text()).not.toContain("78,570");
    const rail = railStep("Pseudonymised");
    expect(rail.textContent).toContain("the rest to go");
    expect(rail.textContent).not.toContain("not yet");
    expect(host.querySelector(".dp-card .dp-line")?.textContent).toBe("The rest waits to be pseudonymised");
    // what PatientID holds is not offered for change: the copy holds files, however its count stopped
    act(() => button(panel, "Change")!.click());
    await settle(4);
    const dialog = host.querySelector("dialog")!;
    expect([...dialog.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent === "A hospital or study ID").every((b) => b.disabled)).toBe(true);
    act(() => button(dialog, "Cancel")!.click());
    // a run again skips what is done
    await act(async () => {
      button(panel, "Pseudonymise and sort the rest")!.click();
    });
    await settle(6);
    expect(e.of("POST", "/api/jobs")[0].body!.command).toEqual(["bring-in", "@study-identified", "--name", expect.stringMatching(/^study-identified-/), "--pack", "mri"]);
  });

  it("offers nothing for files a run refused, where the counts are whole, and draws the step done though the engine says it waits", async () => {
    // 7,544 originals, 7,444 written, 100 not DICOM: the originals less the copy would offer those 100 again
    const d = dataset({ ...big(), trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: ORIGINALS, bytes: 1_900_000_000 }, anon: { path: "/srv/x/derivatives/dcm-anon", files: 7444, last_written: AT } } });
    const s = after(d, { ...RAN, state: "waiting", files: 7444, waiting: 0, partial: false, waiting_partial: false }, null);
    await page(d, {}, (c) => (c.url === "/api/datasets/study-identified/summary" ? { status: 200, body: s } : undefined), { held: SUBJECTS });
    expect(offers()).toEqual([]);
    // done, the step does not open by itself
    expect(host.querySelector(".ps-step")).toBeNull();
    const rail = railStep("Pseudonymised");
    expect(rail.classList.contains("done")).toBe(true);
    expect(rail.classList.contains("next")).toBe(false);
    expect(rail.textContent).toContain("7,444 files");
    expect(host.querySelector(".dp-card .dp-card-head .tag")?.textContent).toBe("Ready");
  });

  it("offers the rest of a run that was cut short, never at least 0 files", async () => {
    // an update cancelled the run part way: what no run has decided is not known
    const d = dataset({
      ...big(),
      trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: 200_000, bytes: 1, partial: true }, anon: { path: "/srv/x/derivatives/dcm-anon", files: 120_000, last_written: AT, partial: true } },
    });
    const s = after(d, { job: 71, state: "waiting", files: 120_000, waiting: 0, partial: false, waiting_partial: true }, null);
    await page(d, {}, (c) => (c.url === "/api/datasets/study-identified/summary" ? { status: 200, body: s } : undefined), { held: SUBJECTS });
    expect(offers()).toEqual(["Pseudonymise and sort the rest"]);
    expect(railStep("Pseudonymised").textContent).toContain("the rest to go");
    expect(text()).not.toContain("at least 0");
  });

  it("leaves a dataset never run as it was: every original to go, and the rail says not yet", async () => {
    const d = dataset({ ...big(), trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: ORIGINALS, bytes: 1_900_000_000 }, anon: { path: "/srv/x/derivatives/dcm-anon", files: 0, last_written: null } } });
    await page(d, { held: 0 }, () => undefined, { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] } });
    expect(offers()).toEqual(["Pseudonymise and sort 7,544 files"]);
    expect(railStep("Pseudonymised").textContent).toContain("not yet");
    expect(host.querySelector(".dp-card .dp-line")?.textContent).toBe("Waits to be pseudonymised");
  });
});

describe("the pseudonymise step while the dataset's summary is not read yet (2026-10-17)", () => {
  // production: the summary of a dataset of 30.65M files took tens of seconds; meanwhile the step offered to pseudonymise exactly the files
  // its run had refused, the card said it waited to be pseudonymised, and the IDs box said 0 subjects until the held IDs door answered
  const SHAPES = [
    { originals: 30_689_981, copy: 30_654_432, refused: 35_549 },
    { originals: 3_173_424, copy: 3_172_225, refused: 1_199 },
  ];
  const n = (v: number) => v.toLocaleString("en-US");
  const batch = {
    id: 9,
    name: "study-identified-2026-10-16",
    state: "done",
    started_at: AT,
    finished_at: AT,
    job_id: 70,
    files: { seen: 12, new: 12, changed: 0, unchanged: 0, refused: 0 },
    subjects_added: 3,
    stacks_added: 12,
    classified: 12,
    to_sort: 2,
    pseudonymised: { files: 0, changed: 0, held: 0, job: 69 },
    chain: { pseudonymize: 69, digest: 70, classify: [71] },
  };
  /** An identified dataset whose run finished: the sources door's trees whole, its batch pseudonymised, its read sorted. */
  const finished = (originals: number, copy: number) =>
    dataset({
      held: { files: 0, identifiers: 0 },
      identity: { id_type: "personnummer", from: [{ field: "PatientID" }] },
      trees: { originals: { path: "/srv/x/derivatives/dcm-original", files: originals, bytes: null }, anon: { path: "/srv/x/derivatives/dcm-anon", files: copy, last_written: AT } },
      digests: { count: 1, first: null, last: null, recent: [batch] } as Dataset["digests"],
      totals: { subjects: 3, studies: 3, sessions: 3, stacks: 12, refused_files: 0, to_sort: 2, sure: 10, unsorted: 0 },
    });
  const SUBJECTS = { ...heldIds({}, { coded: 4399, generated: 0 }), files: 0, identifiers: 0, ids: [] };
  const summaryDoor = (url: string) => url === "/api/datasets/study-identified/summary";
  const offers = () => [...host.querySelectorAll("button")].map((b) => b.textContent ?? "").filter((t) => t.startsWith("Pseudonymise and sort"));
  const again = () => {
    act(() => root.unmount());
    root = createRoot(host);
  };

  it("draws the counts it has, offers nothing, says no next step and that it counts what is left, and the card waits on nothing", async () => {
    for (const { originals, copy, refused } of SHAPES) {
      await page(finished(originals, copy), {}, () => undefined, { step: "pseudonymisation", held: SUBJECTS, hold: summaryDoor });
      const panel = host.querySelector(".ps-step")!;
      expect([...panel.querySelectorAll(".ps-big")].map((b) => b.textContent)).toEqual([n(originals), "4,399", n(copy)]);
      expect(offers()).toEqual([]);
      expect(panel.querySelector(".ps-counting")?.textContent).toBe("Counting what is left…");
      expect(panel.querySelector(".tag")).toBeNull();
      expect(panel.textContent).not.toMatch(/next step|not yet|wait/i);
      expect(text()).not.toContain(n(refused));
      // the rail is still being read: nothing on it is guessed
      expect(host.querySelector(".dp-detail")!.textContent).toContain("Reading where it is.");
      // the card and the head: the run finished, so nothing waits to be pseudonymised
      const card = host.querySelector(".dp-card")!;
      expect(card.querySelector(".dp-card-head .tag")?.textContent).toBe("Ready");
      expect(card.querySelector(".dp-line")?.textContent).toBe("10 sure · 2 need a look");
      expect(card.querySelector(".dp-line")?.textContent).not.toMatch(/wait/i);
      expect(host.querySelector(".dp-detail-where")?.textContent).not.toContain("the files carry names");
      // what the sources door does not show is not known yet on the card, never not yet
      expect([...card.querySelectorAll(".dp-rail > span")].map((x) => x.className).slice(3)).toEqual(["unknown", "unknown", "unknown"]);
      expect(card.querySelector(".dp-rail")?.getAttribute("aria-label")).toContain("main scans not known yet");
      again();
    }
  });

  it("keeps the done view once the summary says the run left nothing", async () => {
    for (const { originals, copy } of SHAPES) {
      const d = finished(originals, copy);
      const s = summaryOf(d, { job: 69, state: "done", files: copy, waiting: 0, held: 0, partial: false, waiting_partial: false, started_at: "2026-10-16T18:44:00Z", finished_at: "2026-10-17T01:51:34Z" });
      await page(d, {}, (c) => (summaryDoor(c.url) ? { status: 200, body: s } : undefined), { step: "pseudonymisation", held: SUBJECTS });
      expect(offers()).toEqual([]);
      expect(host.querySelector(".ps-step")).toBeNull();
      const done = host.querySelector(".ps-done")!;
      expect(done.querySelector(".tag.ok")?.textContent).toBe(`${n(copy)} files · 4,399 subjects`);
      expect(host.querySelector(".dp-card .dp-line")?.textContent).not.toMatch(/wait/i);
      again();
    }
  });

  it("says the subjects are on their way until the held IDs door answers, never 0", async () => {
    const d = finished(30_689_981, 30_654_432);
    const s = summaryOf(d, { job: 69, state: "done", files: 30_654_432, waiting: 0, held: 0, partial: false, waiting_partial: false });
    await page(d, {}, (c) => (summaryDoor(c.url) ? { status: 200, body: s } : undefined), { step: "pseudonymisation", hold: (url) => url.startsWith("/api/linkage/held/ids") });
    const done = host.querySelector(".ps-done")!;
    expect([...done.querySelectorAll(".ps-big")].map((b) => b.textContent)).toEqual(["30,689,981", "…", "30,654,432"]);
    expect(done.querySelector(".tag.ok")?.textContent).toBe("30,654,432 files");
    expect(done.textContent).not.toMatch(/\b0 subjects/);
    // and the step of a dataset with IDs of a type, opened while the door is out: the IDs on their way
    again();
    const typed = dataset({ ...finished(3_173_424, 3_172_225), identity: { id_type: "study-id", from: [{ field: "PatientID" }] } });
    await page(typed, {}, () => undefined, { step: "pseudonymisation", hold: (url) => url.startsWith("/api/linkage/held/ids") || summaryDoor(url) });
    const panel = host.querySelector(".ps-step")!;
    expect([...panel.querySelectorAll(".ps-big")].map((b) => b.textContent)).toEqual(["3,173,424", "…", "3,172,225"]);
    expect(panel.textContent).not.toContain("none held");
  });

  it("leaves a dataset never run as it was: every original to go, and the card says it waits", async () => {
    const never = dataset({ held: { files: 0, identifiers: 0 }, identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } });
    await page(never, {}, () => undefined, { held: { ...heldIds(), files: 0, identifiers: 0, ids: [] }, hold: summaryDoor });
    expect(offers()).toEqual(["Pseudonymise and sort 7,544 files"]);
    expect(host.querySelector(".ps-counting")).toBeNull();
    expect(host.querySelector(".dp-card .dp-card-head .tag")?.textContent).toBe("Identified");
    expect(host.querySelector(".dp-card .dp-line")?.textContent).toBe("Waits to be pseudonymised");
  });
});
