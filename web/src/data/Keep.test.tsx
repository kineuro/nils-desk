// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Save as a selection and Make a cohort from the dataset viewer (Wave 7a,
// 2026-10-10): on every level's bar and in the browser for a person who may
// keep, and for no one else; the engine counts the question the filters mean
// before anything is kept; a filter no question asks, and a count that is not
// the page's, go on only on the person's word; the question is kept as a
// card, then saved as a selection or run and its handle promoted, as the
// Query page's dialogs do; one line on the bar says where it went, a
// promotion's followed to its job's end; a refusal is one plain line with
// the engine's words behind a "?"; and the dialog's keys never move the page.

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, radio, settle, type Call } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { parse } from "../routes";
import type { ScanRow } from "./scans";

vi.mock("./ScanViewer", () => ({
  markOpen: () => undefined,
  ScanViewer: ({ scans, at }: { scans: { id: number }[]; at: number }) => <div data-testid="viewer" data-stack={scans[at].id} />,
}));

const { Viewer } = await import("./Viewer");
const { forgetHeld } = await import("./viewer");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = [
  "GET /api/datasets/{name}/scans",
  "GET /api/datasets/{name}/subjects",
  "GET /api/datasets/{name}/subjects/{subject}/visits",
  "POST /api/ask/diagnose",
  "POST /api/ask/documents",
  "POST /api/ask/run",
  "PUT /api/ask/selections/{name}",
  "POST /api/ask/handles/{id}/promote",
  "GET /api/cohorts",
  "GET /api/jobs/{id}",
];
const KEEPS: Grant[] = ["data:see", "data:work", "query:see", "query:work"];
const capsOf = (grants: Grant[] = KEEPS): Capabilities => caps7a(DOORS, grants);

/** The shell's part: the viewer the address names, drawn again as the address moves. */
function Harness({ caps }: { caps: Capabilities }) {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  if (route.sub !== "view" || !route.arg) return <div data-testid="away" />;
  return <Viewer caps={caps} scope={{ kind: "dataset", name: route.arg }} query={route.query} onSections={() => undefined} />;
}

/** An identifier a person types into the subjects' search. */
const TYPED_ID = "4711001234";
const subject = (id: number, code: string, look = 0) => ({ id, code, label: code, visits: 2, scans: 6, look, regions: ["brain"], makers: ["GE"], main: ["t1w"] });
const SUBJECTS = [subject(1, "sub-a1", 2), subject(2, "sub-b2"), subject(3, "sub-c3")];
const subjectsPage = (list: unknown[]) => ({
  scope: { kind: "dataset", name: "ms-a", id: 7 },
  detail: "quasi",
  show: "code",
  order: "look",
  totals: { subjects: 3, visits: 6, scans: 18, look: 2 },
  matched: list.length,
  count: list.length,
  subjects: list,
  next: null,
  facets: { makers: [{ name: "GE", subjects: 3 }], regions: [{ name: "brain", subjects: 3 }], roles: [{ name: "t1w", subjects: 3 }], id_types: [] },
});
const visit = (session: number, study: number, symri: number) => ({ session, studies: [study], label: `ses-2019091${session - 30}`, first: "2019-09-13", day: "0", number: session - 33, scans: 3, look: 0, regions: ["brain"], kinds: [], contrast: false, symri, main: [] });
const row = (stack: number, name: string, over: Partial<ScanRow> = {}): ScanRow => ({
  stack,
  subject: { id: 1, code: "sub-a1" },
  session: { id: 34, label: "20190913" },
  study: 5,
  series_description: null,
  orientation: "AXIAL",
  images: 10,
  day: "2019-09-13",
  name,
  bids: null,
  datatype: "anat",
  folder: "anat",
  axes: { base: "T1w" },
  series_number: stack,
  questions: [],
  ...over,
});
const SCANS = [row(11, "Sag_T1w_3D"), row(12, "Ax_FLAIR_2D", { axes: { base: "T2w", modifier: "FLAIR" } }), row(13, "Ax_T2w_2D", { axes: { base: "T2w" } })];

/** What the fake engine answers: the count of every question it is asked, and how a run ends. */
let found = { rows: 3, subjects: 3 };
let valid = true;
let truncated = false;

function route(c: Call) {
  const u = new URL(c.url, "http://desk");
  const json = (body: unknown, status = 200) => ({ status, body });
  if (u.pathname === "/api/datasets/ms-a/subjects") {
    const f = u.searchParams.get("filter") ?? "";
    const text = u.searchParams.get("q");
    // a full ID matches its subject, as the door does at the sensitive level
    if (text) return json(subjectsPage(text === TYPED_ID ? [SUBJECTS[1]] : SUBJECTS.filter((s) => s.code.includes(text))));
    return json(subjectsPage(f.includes("look") ? SUBJECTS.filter((s) => s.look > 0) : SUBJECTS));
  }
  if (u.pathname === "/api/datasets/ms-a/subjects/1/visits") {
    const visits = (u.searchParams.get("filter") ?? "").includes("symri") ? [visit(35, 6, 2)] : [visit(34, 5, 0), visit(35, 6, 2)];
    return json({ detail: "quasi", subject: { id: 1, code: "sub-a1", label: "sub-a1" }, totals: { visits: 2, scans: 6, look: 0, span: "0" }, matched: visits.length, visits });
  }
  if (u.pathname === "/api/datasets/ms-a/scans") return json({ total: SCANS.length, scans: SCANS, next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
  if (u.pathname === "/api/ask/diagnose") {
    const out = ((c.body?.document as { out: { set: string } }).out ?? { set: "" }).set;
    return json(valid ? { valid: true, issues: [], funnel: [{ set: out, grain: "subject", stage: "source", rows: 9, subjects: 9 }, { set: out, grain: "subject", stage: "where", ...found }] } : { valid: false, issues: [{ code: "unknown_value", path: "sets.x", message: "ms-a is not a dataset of this registry", next: "" }], funnel: [] });
  }
  if (u.pathname === "/api/ask/documents") return json({ document: 41, hash: "h", parent: null });
  if (u.pathname.startsWith("/api/ask/selections/")) {
    const name = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    return name === "ms" ? json({ error: "ms is a cohort; a selection may take a cohort's name only as that cohort's own source ask" }, 409) : json({ id: 1, name, version: 2, hash: "h" });
  }
  if (u.pathname === "/api/ask/run") return json({ handle: 77, hash: "h", grain: "subject", row_count: found.rows, declaration: {}, content_hash: "c", truncated, columns: [], rows: [], pages: 1 });
  if (u.pathname === "/api/ask/handles/77/promote") return json({ job: 9, state: "queued", handle: 77, cohort: (c.body as { cohort: string }).cohort }, 202);
  if (u.pathname === "/api/cohorts") return json([{ name: "ms", owner: null, description: null, subjects: 8, sessions: null, stacks: 40, feeds: [], from: { kind: "manual", detail: null }, waiting: 0, releases: 0, created_at: "2026-10-01T10:00:00Z", last_joined: null, retired_at: null }]);
  if (u.pathname === "/api/jobs/9") return json({ id: 9, kind: "ask", name: "x", state: "done", started_at: "", heartbeat_at: null, finished_at: "", progress: null, error: null, args: {}, result: { added: found.subjects, already: 0 } });
  return undefined;
}

describe("keeping what the dataset viewer shows", () => {
  let root: Root;
  let el: HTMLDivElement;
  let e: ReturnType<typeof engine>;
  beforeEach(() => {
    found = { rows: 3, subjects: 3 };
    valid = true;
    truncated = false;
    forgetHeld();
    dialogs();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    e = engine(route);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });
  const open = async (hash: string, c: Capabilities = capsOf()) => {
    location.hash = hash;
    await settle();
    act(() => root.render(<Harness caps={c} />));
    await settle();
  };
  const dialog = () => el.querySelector<HTMLDialogElement>("dialog[open]");
  const values = () => Object.fromEntries([...(dialog()?.querySelectorAll(".values > div") ?? [])].map((d) => [d.querySelector(".k")?.textContent, d.querySelector(".v")?.textContent]));
  const asked = (path: string, method = "POST") => e.calls.filter((c) => c.method === method && c.url.startsWith(path));
  const typeInto = (input: HTMLInputElement, text: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const keepButtons = () => [...el.querySelectorAll(".vw-keep > button")].map((b) => b.textContent);

  it("offers both actions on every level's bar and in the browser to a person who may keep, and nothing to one who only reads", async () => {
    for (const hash of ["#data/datasets/ms-a/view", "#data/datasets/ms-a/view?mode=grid&subject=1", "#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34", "#data/datasets/ms-a/view?mode=browser"]) {
      await open(hash);
      expect(keepButtons(), hash).toEqual(["Save as a selection", "Make a cohort"]);
    }
    // the browser says how many its filter leaves beside them
    expect(el.querySelector(".dview-keep .meta")?.textContent).toBe("3");
    await open("#data/datasets/ms-a/view", capsOf(["data:see", "query:see"]));
    expect(el.querySelector(".vw-keep")).toBeNull();
    // query work alone saves a selection; a cohort needs Data work too
    await open("#data/datasets/ms-a/view", capsOf(["data:see", "query:work"]));
    expect(keepButtons()).toEqual(["Save as a selection"]);
  });

  it("counts what the subjects' filters show, then keeps it as a card and saves it as a selection, the bar's line linking to Selections", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&filter=main:t1w,region:brain");
    act(() => button(el, "Save as a selection")!.click());
    expect(dialog()?.querySelector("h2")?.textContent).toBe("Save as a selection");
    await settle();
    // the question the filters mean, counted before anything is kept
    const counted = asked("/api/ask/diagnose");
    expect(counted).toHaveLength(1);
    const document = counted[0].body!.document as { sets: Record<string, unknown>; out: unknown };
    expect(document.out).toEqual({ set: "subjects", level: "record" });
    expect(Object.keys(document.sets).sort()).toEqual(["main", "region", "subjects"]);
    expect(asked("/api/ask/documents")).toHaveLength(0);
    expect(values()).toEqual({ from: "ms-a", filters: "with a main T1w · with brain scans", "it keeps": "3 subjects" });
    expect(dialog()!.querySelector(".note")).toBeNull();
    expect(dialog()!.querySelector<HTMLInputElement>("#keep-name")!.value).toBe("ms-a-t1w-brain");
    typeInto(dialog()!.querySelector<HTMLInputElement>("#keep-note")!, "the T1w brains");
    act(() => button(dialog()!, "Save")!.click());
    await settle();
    // the same question kept as a card, and the card saved under the name, as the Query page saves one
    expect(asked("/api/ask/documents")[0].body).toEqual({ document });
    expect(asked("/api/ask/selections/ms-a-t1w-brain", "PUT")[0].body).toEqual({ document_id: 41, note: "the T1w brains" });
    expect(dialog()).toBeNull();
    const said = el.querySelector(".vw-said")!;
    expect(said.textContent).toBe("Saved as ms-a-t1w-brain, version 2. Selections");
    expect(said.querySelector("a")?.getAttribute("href")).toBe("#query/selections");
  });

  it("keeps a search as the subjects it found, by id: what was typed goes into no address, history, storage or question", async () => {
    found = { rows: 1, subjects: 1 };
    await open("#data/datasets/ms-a/view");
    const box = el.querySelector<HTMLInputElement>(".vw-search input")!;
    typeInto(box, TYPED_ID);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await settle();
    expect([...el.querySelectorAll(".vw-card .vw-card-name")].map((x) => x.textContent)).toEqual(["sub-b2"]);
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid");
    // down to the subject and back up: the address never takes the search, and the page still holds it
    act(() => el.querySelector<HTMLAnchorElement>(".vw-card")!.click());
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=2");
    location.hash = "#data/datasets/ms-a/view?mode=grid";
    await settle();
    expect(el.querySelector<HTMLInputElement>(".vw-search input")!.value).toBe(TYPED_ID);
    expect([...el.querySelectorAll(".vw-card .vw-card-name")].map((x) => x.textContent)).toEqual(["sub-b2"]);
    // kept: the subjects found, by id
    act(() => button(el, "Save as a selection")!.click());
    await settle();
    const document = asked("/api/ask/diagnose")[0].body!.document as { sets: Record<string, { where: unknown[] }> };
    expect(document.sets.subjects.where).toContainEqual(["in", {}, ["field", {}, "id"], [2]]);
    expect(values().filters).toBe("found by the search, 1 subject");
    act(() => button(dialog()!, "Save")!.click());
    await settle();
    // the typed text went into no request body, no address and no storage
    expect(e.calls.filter((c) => c.method !== "GET").map((c) => JSON.stringify(c.body)).join(" ")).not.toContain(TYPED_ID);
    expect(asked("/api/ask/selections/", "PUT")).toHaveLength(1);
    expect(location.hash).not.toContain(TYPED_ID);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TYPED_ID);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TYPED_ID);
  });

  it("names a filter no question asks, and leaves it out only on the person's word", async () => {
    found = { rows: 3, subjects: 3 };
    await open("#data/datasets/ms-a/view?mode=grid&filter=look");
    act(() => button(el, "Save as a selection")!.click());
    await settle();
    const note = dialog()!.querySelector(".note.caution")!;
    expect(note.querySelector(".note-lead")?.textContent).toBe("Cannot be asked: with scans to look at?");
    expect(note.querySelector(".hint")?.getAttribute("title")).toBe("No question asks whether a scan needs a look.");
    expect(note.querySelector("label")?.textContent).toBe("Leave it out: 3 subjects");
    // nothing about looking was written into the question
    expect(JSON.stringify(asked("/api/ask/diagnose")[0].body)).not.toContain("look");
    expect(button(dialog()!, "Save")!.disabled).toBe(true);
    act(() => note.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    expect(button(dialog()!, "Save")!.disabled).toBe(false);
  });

  it("says when the question finds another count than the page shows, and goes on only on the person's word", async () => {
    found = { rows: 2, subjects: 2 };
    await open("#data/datasets/ms-a/view?mode=grid&filter=maker:GE");
    act(() => button(el, "Make a cohort")!.click());
    await settle();
    const note = dialog()!.querySelector(".note.caution")!;
    expect(note.querySelector(".note-lead")?.textContent).toBe("The page shows 3; the question finds 2.?");
    expect(button(dialog()!, "Make the cohort")!.disabled).toBe(true);
    act(() => note.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    expect(button(dialog()!, "Make the cohort")!.disabled).toBe(false);
  });

  it("makes a new cohort of the visits a filter leaves: the question kept and run, its handle promoted, the line following the job", async () => {
    found = { rows: 1, subjects: 1 };
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&vfilter=symri");
    act(() => button(el, "Make a cohort")!.click());
    await settle();
    const document = asked("/api/ask/diagnose")[0].body!.document as { sets: Record<string, { where?: unknown[] }>; out: { set: string } };
    expect(document.out.set).toBe("visits");
    expect(document.sets.subject.where).toEqual([["=", {}, ["field", {}, "id"], 1]]);
    expect(values()).toEqual({ from: "ms-a · sub-a1", filters: "with SyMRI", "who joins": "1 subject, from 1 visit" });
    expect(dialog()!.querySelector<HTMLInputElement>("#keep-cohort")!.value).toBe("ms-a-subject-1-symri");
    typeInto(dialog()!.querySelector<HTMLInputElement>("#keep-why")!, "the SyMRI visits");
    act(() => button(dialog()!, "Make the cohort")!.click());
    await settle();
    expect(asked("/api/ask/run")[0].body).toEqual({ document_id: 41 });
    expect(asked("/api/ask/handles/77/promote")[0].body).toEqual({ cohort: "ms-a-subject-1-symri", create: true, reason: "the SyMRI visits" });
    expect(dialog()).toBeNull();
    const said = () => el.querySelector(".vw-said")!;
    expect(said().textContent).toBe("1 subject is joining ms-a-subject-1-symri. Open ms-a-subject-1-symri");
    expect(said().querySelector("a")?.getAttribute("href")).toBe("#data/cohorts/ms-a-subject-1-symri");
    // the promotion's job, followed to its end
    await act(async () => {
      await new Promise((r) => setTimeout(r, 650));
    });
    await settle();
    expect(asked("/api/jobs/9", "GET")).toHaveLength(1);
    expect(said().textContent).toBe("1 subject joined ms-a-subject-1-symri. Open ms-a-subject-1-symri");
  });

  it("adds them to an existing cohort, and refuses an answer the run cut off", async () => {
    await open("#data/datasets/ms-a/view");
    act(() => button(el, "Make a cohort")!.click());
    await settle();
    act(() => radio(dialog()!, "Add them to a cohort").click());
    const select = dialog()!.querySelector<HTMLSelectElement>("#keep-existing")!;
    expect([...select.options].map((o) => o.textContent)).toEqual(["choose a cohort", "ms · 8 subjects"]);
    expect(button(dialog()!, "Add them")!.disabled).toBe(true);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "ms");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    truncated = true;
    act(() => button(dialog()!, "Add them")!.click());
    await settle();
    expect(asked("/api/ask/handles/")).toHaveLength(0);
    expect(dialog()!.querySelector("p.warn")?.textContent).toBe("The answer is cut off at the run's limit; a cohort needs all of it.");
    truncated = false;
    act(() => button(dialog()!, "Add them")!.click());
    await settle();
    expect(asked("/api/ask/handles/77/promote")[0].body).toEqual({ cohort: "ms", create: false });
  });

  it("says a refusal as one plain line, the engine's words behind a ?, and a question the engine cannot ask keeps nothing", async () => {
    await open("#data/datasets/ms-a/view");
    act(() => button(el, "Save as a selection")!.click());
    await settle();
    typeInto(dialog()!.querySelector<HTMLInputElement>("#keep-name")!, "ms");
    act(() => button(dialog()!, "Save")!.click());
    await settle();
    const warn = dialog()!.querySelector("p.warn")!;
    expect(warn.textContent).toBe("That name is a cohort's. Choose another.?");
    expect(warn.querySelector(".hint")?.getAttribute("title")).toMatch(/^ms is a cohort/);
    act(() => button(dialog()!, "Cancel")!.click());
    valid = false;
    act(() => button(el, "Save as a selection")!.click());
    await settle();
    expect(dialog()!.querySelector("p.warn")?.textContent).toBe("NILS cannot ask this.?");
    expect(button(dialog()!, "Save")!.disabled).toBe(true);
  });

  it("keeps the dialog's keys from the page: Esc closes it where the page stays, and g moves nothing", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=1");
    const before = location.hash;
    act(() => button(el, "Make a cohort")!.click());
    await settle();
    const inside = radio(dialog()!, "As a new cohort");
    act(() => {
      inside.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
      inside.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      inside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(location.hash).toBe(before);
    act(() => {
      dialog()!.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(dialog()).toBeNull();
    expect(location.hash).toBe(before);
  });

  it("keeps one visit's scans by its studies, and the scans the browser's words leave one by one", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34");
    act(() => button(el, "Save as a selection")!.click());
    await settle();
    let document = asked("/api/ask/diagnose").at(-1)!.body!.document as { sets: Record<string, { where?: unknown[] }> };
    expect(document.sets.scans.where).toEqual([["in", {}, ["field", {}, "study.id"], [5]], ["=", {}, ["field", {}, "dataset"], "ms-a"]]);
    expect(values().from).toBe("ms-a · sub-a1 · ses-20190914");
    act(() => button(dialog()!, "Cancel")!.click());
    await open("#data/datasets/ms-a/view?mode=browser");
    const filter = el.querySelector<HTMLInputElement>(".dview-filter input")!;
    typeInto(filter, "flair");
    await settle();
    expect(el.querySelector(".dview-keep .meta")?.textContent).toBe("1 of 3");
    act(() => button(el, "Save as a selection")!.click());
    await settle();
    document = asked("/api/ask/diagnose").at(-1)!.body!.document as { sets: Record<string, { where?: unknown[] }> };
    expect(document.sets.scans.where).toEqual([["in", {}, ["field", {}, "id"], [12]], ["=", {}, ["field", {}, "dataset"], "ms-a"]]);
    expect(values()).toEqual({ from: "ms-a", filters: "matching flair", "it keeps": "3 scans of 3 subjects" });
  });
});
