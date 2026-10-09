// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One safe way in for data, as an app (Wave 7a, the tries of 2026-10-08): the
// Data page lists datasets only; "Add a dataset" is a finder that searches a
// root's folders fifty at a time, looks inside the one picked once, and asks
// before adding a folder with no DICOM; each dataset card shows one state word and one button for its next
// step, so how to start is always on screen; "Sort the files" shows the
// engine's 409 as the question it is and moves only once confirmed; "Set the
// IDs" never offers the personnummer; no engine word is on the page; and a
// queue worker a restart ended is never a failure on Data.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import { ANONYMISED, ASKED, UNKNOWN, WARD_B, WARD_C, button, caps7a, dialogs, engine, radio, settle } from "../../test/safeWayIn";
import type { ChainedJob } from "../ask/client";
import { DoorError } from "../ask/client";
import { placesKept } from "../objects/kept";
import { DataPage } from "./DataPage";
import type { Dataset, SourcesAnswer } from "./datasets";
import { SetIdsDialog, SortFilesDialog } from "./FinishDataset";
import { moveAskedOf } from "./layout";
import { jobCards, ofPeople } from "./now";
import { nextStep, stepCommand } from "./steps";

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
});

const TYPES = { types: [{ name: "personnummer", description: null }, { name: "study-id", description: "the study's own number" }] };
const base = (answer as SourcesAnswer).sources[0];

/** A dataset as the sources door lists it. */
function ds(name: string, id: number, over: Partial<Dataset>): Dataset {
  return {
    ...base,
    id,
    name,
    path: `/srv/in/${name}`,
    kind: "dataset",
    root: "incoming",
    held: null,
    trees: { originals: null, anon: { path: `/srv/in/${name}/derivatives/dcm-anon`, files: 0, last_written: null } },
    digests: { count: 0, first: null, last: null, recent: [] },
    totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
    ...over,
  } as Dataset;
}

const unknown = ds("ward-c", 4, { state: "unknown", arrives: "undeclared", trees: { originals: null, anon: null } });
const noIds = ds("ward-b", 3, { state: "anonymised", arrives: "deidentified", patient_id: null, subjects: null });
const identified = ds("ward-a", 2, {
  state: "identified",
  arrives: "identified",
  trees: { originals: { path: "/srv/in/ward-a/derivatives/dcm-original", files: 40, bytes: null }, anon: { path: "/srv/in/ward-a/derivatives/dcm-anon", files: 0, last_written: null } },
});
const toRead = ds("ward-d", 5, { state: "anonymised", arrives: "deidentified", patient_id: "subject-code", subjects: "generated", trees: { originals: null, anon: { path: "/x", files: 12, last_written: null } } });
const readOnce = { ...base.digests.recent[0], state: "done", classified: 0, to_sort: 7 };
const toSort = ds("ward-e", 6, { ...toRead, id: 6, name: "ward-e", digests: { count: 1, first: null, last: null, recent: [readOnce] }, totals: { ...toRead.totals, stacks: 30, to_sort: 7 } } as Partial<Dataset>);
const done = ds("ward-f", 7, { ...toRead, id: 7, name: "ward-f", digests: { count: 1, first: null, last: null, recent: [{ ...readOnce, classified: 30, to_sort: 0 }] }, totals: { ...toRead.totals, stacks: 30 } } as Partial<Dataset>);

describe("a dataset's one next step", () => {
  it("is always there, by what the dataset still needs", () => {
    expect(nextStep(unknown)).toMatchObject({ word: "Unknown", label: "Sort the files" });
    expect(nextStep(noIds)).toMatchObject({ word: "Anonymised", label: "Set the IDs" });
    expect(nextStep(identified)).toMatchObject({ word: "Identified", label: "Pseudonymise" });
    expect(nextStep(toRead)).toMatchObject({ word: "Ready", label: "Read" });
    expect(nextStep(toSort)).toMatchObject({ word: "Ready", label: "Sort" });
    expect(nextStep(done)).toMatchObject({ word: "Ready", label: "Read new files" });
    // a dataset with a job running says so and takes no second press
    const running = { ...toSort, digests: { ...toSort.digests, recent: [{ ...readOnce, state: "running" }] } } as Dataset;
    expect(nextStep(running)).toMatchObject({ label: "Running", busy: true });
  });

  it("queues the engine's own commands", () => {
    const day = new Date("2026-10-08T12:00:00Z");
    expect(stepCommand(identified, "pseudonymise", "mri", day)).toEqual({ command: ["pseudonymize", "@ward-a", "--name", "ward-a-2026-10-08"], name: "ward-a-2026-10-08" });
    expect(stepCommand(toRead, "read", "mri", day)?.command).toEqual(["digest", "@ward-d", "--name", "ward-d-2026-10-08"]);
    expect(stepCommand(toSort, "sort", "mri", day)).toMatchObject({ command: ["fingerprint"], then: [["classify", "--pack", "mri"]] });
    expect(stepCommand(unknown, "sort-files", "mri", day)).toBeNull();
  });
});

describe("the Data page", () => {
  const ROOT = { id: 1, name: "incoming", role: "source", path: "/srv/in", guarantees: {}, probed: null, probed_at: null, retired_at: null, dataset: { kind: "root", state: "unknown", root: null }, layout: { root: true, datasets: 2 }, not_read: null, datasets: ["ward-a", "ward-b"] };
  const DOORS = ["GET /api/sources", "GET /api/places", "POST /api/places", "PUT /api/places/{id}", "POST /api/jobs", "POST /api/ingest/look", "GET /api/linkage/types"];

  async function page(datasets: Dataset[], route: Parameters<typeof engine>[0] = () => undefined) {
    let list = datasets;
    const e = engine((c, nth) => {
      if (c.url.startsWith("/api/sources")) return { status: 200, body: { count: list.length, window_days: 30, sources: list, rates: null } };
      if (c.method === "GET" && /^\/api\/places(\?|$)/.test(c.url)) return { status: 200, body: { places: [ROOT], enforced: true } };
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      const r = route(c, nth);
      if (r && c.method === "POST" && c.url === "/api/places") list = [...list, unknown];
      return r;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root.render(<DataPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle(8);
    return e;
  }

  it("lists no folder, and adds a dataset through the finder: search, fifty at a time, one look, one Add", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ name: `ward-${i}`, path: `/srv/in/ward-${i}`, added: i === 0, dataset_id: i === 0 ? 2 : null, dataset: i === 0 ? "ward-0" : null, has_derivatives: false }));
    const e = await page([identified], (c) => {
      if (c.method === "GET" && c.url.startsWith("/api/places/1/folders?")) {
        const after = new URL(c.url, "http://x").searchParams.get("after");
        return { status: 200, body: { root: "incoming", root_id: 1, path: "/srv/in", count: 51, folders: after ? [{ name: "ward-c", path: "/srv/in/ward-c", added: false, dataset_id: null, dataset: null, has_derivatives: false }] : page1, next: after ? null : "ward-49" } };
      }
      if (c.method === "GET" && c.url === "/api/places/1/folders/ward-c") return { status: 200, body: { name: "ward-c", path: "/srv/in/ward-c", added: false, dataset_id: null, holds_dicom: "no", has_derivatives: false, layout: UNKNOWN } };
      if (c.method === "POST" && c.url === "/api/places") return { status: 201, body: { ...WARD_C, layout: UNKNOWN, not_read: "its structure is unknown" } };
      return undefined;
    });
    // the page lists datasets only, never a root's folders
    expect(host.querySelector(".root-folders, .folder-results")).toBeNull();
    expect(e.calls.some((c) => c.url.includes("/folders"))).toBe(false);
    act(() => button(host, "Add a dataset")!.click());
    // one root: no root to pick; nothing listed until asked
    expect(host.querySelector("#dataset-root")).toBeNull();
    expect(host.querySelector(".folder-results")).toBeNull();
    act(() => button(host, "Browse")!.click());
    await settle();
    expect(new URL(e.calls.find((c) => c.url.includes("/folders?"))!.url, "http://x").searchParams.get("limit")).toBe("50");
    expect(host.querySelectorAll(".folder-results li")).toHaveLength(50);
    act(() => button(host, /^More/)!.click());
    await settle();
    expect(host.querySelectorAll(".folder-results li")).toHaveLength(51);
    act(() => button(host, "ward-c")!.click());
    await settle();
    // one look: what NILS sees, and one Add
    expect(host.textContent).toContain("DICOM");
    expect(host.textContent).toContain("would be");
    expect(host.textContent).toContain("No DICOM found here.");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
    act(() => button(host, "Add")!.click());
    // no DICOM: it asks before it adds
    expect(host.textContent).toContain("No DICOM found here. Add anyway?");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
    act(() => button(host, "Add anyway")!.click());
    await settle(8);
    expect(e.of("POST", "/api/places")[0].body).toEqual({ role: "source", root: "incoming", folder: "ward-c" });
    expect(host.textContent).toContain("ward-c is a dataset.");
  });

  it("asks an anonymised folder's IDs on the way in, one select each set to the subject code and made from the ID, and sends them with the Add", async () => {
    const e = await page([], (c) => {
      if (c.method === "GET" && c.url.startsWith("/api/places/1/folders?")) return { status: 200, body: { root: "incoming", root_id: 1, path: "/srv/in", count: 1, folders: [{ name: "study-big", path: "/srv/in/study-big", added: false, dataset_id: null, dataset: null, has_derivatives: true }], next: null } };
      if (c.method === "GET" && c.url === "/api/places/1/folders/study-big") return { status: 200, body: { name: "study-big", path: "/srv/in/study-big", added: false, dataset_id: null, holds_dicom: "yes", has_derivatives: true, layout: ANONYMISED } };
      if (c.method === "POST" && c.url === "/api/places") return { status: 201, body: { ...WARD_B, name: "study-big", layout: ANONYMISED, not_read: null } };
      return undefined;
    });
    act(() => button(host, "Add a dataset")!.click());
    act(() => button(host, "Browse")!.click());
    await settle();
    act(() => button(host, "study-big")!.click());
    await settle();
    expect(host.textContent).not.toContain("No DICOM");
    const pid = host.querySelector<HTMLSelectElement>("#dataset-patient-id")!;
    const subjects = host.querySelector<HTMLSelectElement>("#dataset-subjects")!;
    expect(pid.value).toBe("subject-code");
    expect(subjects.value).toBe("generated");
    // never the personnummer: it is no PatientID a file may hold
    expect([...pid.options].map((o) => o.value)).toEqual(["subject-code", "id-type:study-id"]);
    act(() => button(host, "Add")!.click());
    await settle(8);
    expect(e.of("POST", "/api/places")[0].body).toEqual({ role: "source", root: "incoming", folder: "study-big", patient_id: "subject-code", subjects: "generated" });
    expect(host.textContent).toContain("study-big is a dataset.");
  });

  it("says a refused Read in one plain line, the engine's words behind a \"?\"", async () => {
    const engineWords = "@ward-d is not a registered ingest location; those are data, data-test";
    await page([toRead], (c) => (c.method === "POST" && c.url === "/api/jobs" ? { status: 400, body: { error: engineWords } } : undefined));
    act(() => button(host.querySelector(".scard")!, /^Read/)!.click());
    await settle();
    const said = host.querySelector("section.data > p.warn")!;
    expect(said.textContent).toContain("This dataset is not ready to read yet.");
    expect(said.querySelector(".hint")?.getAttribute("title")).toBe(engineWords);
    expect(host.querySelector("section.data")!.textContent).not.toContain("ingest location");
  });

  it("searches by part of a name as it is typed", async () => {
    const e = await page([], (c) =>
      c.method === "GET" && c.url.startsWith("/api/places/1/folders?") ? { status: 200, body: { root: "incoming", root_id: 1, path: "/srv/in", count: 1, folders: [{ name: "ms-2019", path: "/srv/in/ms-2019", added: false, dataset_id: null, dataset: null, has_derivatives: true }], next: null } } : undefined,
    );
    act(() => button(host, "Add a dataset")!.click());
    const find = host.querySelector<HTMLInputElement>("#dataset-find")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(find, "ms-");
      find.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 350));
    });
    await settle();
    const asked = e.calls.filter((c) => c.url.includes("/folders?"));
    expect(new URL(asked[0].url, "http://x").searchParams.get("q")).toBe("ms-");
    expect(button(host, "ms-2019")).not.toBeNull();
    expect(button(host, /^More/)).toBeNull();
  });

  it("says how sure the sort is, and Review is the one next step where scans need a look; Pick main scans is not in Data (record 55 H2)", async () => {
    const looked = ds("ward-g", 8, {
      ...toRead,
      id: 8,
      name: "ward-g",
      digests: { count: 1, first: null, last: null, recent: [{ ...readOnce, classified: 120, to_sort: 8 }] },
      totals: { ...toRead.totals, stacks: 120, to_sort: 8, sure: 112, need_a_look: { "body_part:low_confidence": 5, "orientation:missing": 3 } },
    } as Partial<Dataset>);
    await page([looked]);
    const card = host.querySelector(".scard")!;
    expect(card.querySelector(".sure-line")?.textContent).toBe("120 scans · 112 sure · 8 need a look");
    expect(card.querySelector(".sure-line")?.getAttribute("title")).toBe("body part, low confidence: 5; orientation, missing: 3");
    const next = card.querySelector<HTMLAnchorElement>(".next a.button");
    expect(next?.textContent).toBe("Review 8");
    expect(next?.getAttribute("href")).toBe("#review?dataset=ward-g");
    // the one next step: no second button beside it
    expect(card.querySelectorAll(".next .button")).toHaveLength(1);
    expect(card.textContent).not.toContain("Pick main scans");
  });

  it("shows each card's state word and one button, starts the next step from it, and carries no engine word", async () => {
    const e = await page([identified, noIds, unknown, toRead], (c) => (c.method === "POST" && c.url === "/api/jobs" ? { status: 202, body: { job: 41, state: "queued" } } : undefined));
    const cards = Object.fromEntries([...host.querySelectorAll(".scard")].map((c) => [c.querySelector(".scard-pick")?.textContent, c]));
    const said = (name: string) => [cards[name].querySelector(".name .tag")?.textContent, cards[name].querySelector(".next button")?.textContent];
    expect(said("ward-a")).toEqual(["Identified", "Pseudonymise"]);
    expect(said("ward-b")).toEqual(["Anonymised", "Set the IDs"]);
    expect(said("ward-c")).toEqual(["Unknown", "Sort the files"]);
    expect(said("ward-d")).toEqual(["Ready", "Read"]);
    act(() => button(cards["ward-a"], "Pseudonymise: ward-a")!.click());
    await settle();
    expect(e.of("POST", "/api/jobs")[0].body).toMatchObject({ command: ["pseudonymize", "@ward-a", "--name", expect.stringMatching(/^ward-a-\d{4}-\d\d-\d\d$/)] });
    const text = host.querySelector("section.data")!.textContent ?? "";
    expect(text).not.toMatch(/digest|\bsource\b|\bbatch|dcm-anon|de-identified|why two trees|one person is one subject|\bplace\b|arriv/i);
  });
});

describe("Sort the files", () => {
  const place = { id: 4, name: "ward-c", path: "/srv/in/ward-c", dataset: WARD_C.dataset as never };

  it("asks only what the files are, shows the engine's 409 as the question, and moves only once confirmed", async () => {
    const onDone = vi.fn();
    const e = engine((c, nth) => (c.method === "PUT" && c.url === "/api/places/4" ? (nth === 1 ? { status: 409, body: ASKED } : { status: 200, body: { ...WARD_C, layout: { ...UNKNOWN, moved: { into: "derivatives/dcm-original", entries: 2 } } } }) : undefined));
    act(() => root.render(<SortFilesDialog caps={caps7a(["PUT /api/places/{id}"])} place={place} layout={UNKNOWN} onClose={() => undefined} onDone={onDone} />));
    expect(host.textContent).toContain("2 entries with DICOM. What are they?");
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => r.checked)).toEqual([false, false]);
    expect(button(host, "Next")!.disabled).toBe(true);
    act(() => radio(host, "Identified").click());
    act(() => button(host, "Next")!.click());
    await settle();
    expect(e.of("PUT", "/api/places/4")[0].body).toEqual({ move_into: "originals" });
    expect(host.querySelector("p.warn")).toBeNull();
    const asked = host.querySelector('[aria-label="Confirm the move"]')!;
    expect(asked.textContent).toContain("Move 2 entries into the identified folder?");
    expect(asked.textContent).toContain("derivatives/dcm-original");
    expect([...asked.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["sub-1", "sub-2"]);
    expect(onDone).not.toHaveBeenCalled();
    act(() => button(host, "Move them")!.click());
    await settle();
    expect(e.of("PUT", "/api/places/4")[1].body).toEqual({ move_into: "originals", confirm_move: true });
    expect(onDone).toHaveBeenCalledWith("ward-c: 2 moved.");
  });

  it("goes back from the question without a word to the engine", async () => {
    const e = engine((c) => (c.method === "PUT" ? { status: 409, body: ASKED } : undefined));
    act(() => root.render(<SortFilesDialog caps={caps7a([])} place={place} layout={UNKNOWN} onClose={() => undefined} onDone={() => undefined} />));
    act(() => radio(host, "Already anonymised").click());
    act(() => button(host, "Next")!.click());
    await settle();
    act(() => button(host, "Back")!.click());
    expect(host.querySelector('[aria-label="Confirm the move"]')).toBeNull();
    expect(e.of("PUT", "/api/places/4")).toEqual([expect.objectContaining({ body: { move_into: "anon" } })]);
  });

  it("reads the engine's question only from a 409 that names the confirmation and carries the layout", () => {
    expect(moveAskedOf(new DoorError(409, ASKED))?.layout.move_into?.entries).toBe(2);
    expect(moveAskedOf(new DoorError(409, { error: "a place is already named incoming", disclosure: "safe" }))).toBeNull();
    expect(moveAskedOf(new DoorError(400, ASKED))).toBeNull();
  });
});

describe("Set the IDs", () => {
  it("asks what PatientID holds, how subjects are found and the folder names, and never offers the personnummer", async () => {
    const onDone = vi.fn();
    const e = engine((c) => {
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "PUT" && c.url === "/api/places/3") return { status: 200, body: { ...WARD_B, layout: ANONYMISED } };
      return undefined;
    });
    act(() =>
      root.render(<SetIdsDialog caps={caps7a(["GET /api/linkage/types", "PUT /api/places/{id}"])} place={{ id: 3, name: "ward-b", path: "/srv/in/ward-b", dataset: WARD_B.dataset as never }} layout={ANONYMISED} onClose={() => undefined} onDone={onDone} />),
    );
    await settle();
    expect(button(host, "Save")!.disabled).toBe(true);
    expect(radio(host, "The ID").disabled).toBe(true);
    act(() => radio(host, "An ID").click());
    expect([...host.querySelector<HTMLSelectElement>('select[aria-label="Which ID"]')!.options].map((o) => o.value)).toEqual(["study-id"]);
    act(() => radio(host, "The ID").click());
    act(() => radio(host, "Made from the ID").click());
    act(() => button(host, "Save")!.click());
    await settle();
    expect(e.of("PUT", "/api/places/3")[0].body).toEqual({ patient_id: "id-type:study-id", subjects: "generated", copy_folder: "id-type" });
    expect(onDone).toHaveBeenCalledWith("ward-b: IDs set.");
    // its words sit behind a "?", never as paragraphs
    expect(host.querySelectorAll(".hint").length).toBeGreaterThan(0);
  });
});

describe("a restart's ended queue worker", () => {
  it("is never a failure on Data: Now leaves the worker rows out", () => {
    const at = "2026-10-08T10:00:00Z";
    const worker = { id: 9, kind: "pipeline-worker", name: "pipelines", state: "failed", started_at: at, heartbeat_at: null, finished_at: at, progress: null, error: "stopped", args: { argv: ["nils", "serve", "--worker", "--lane", "pipelines"] }, result: null } as unknown as ChainedJob;
    const mine = { ...worker, id: 10, kind: "digest", name: "ward-a", args: { argv: ["nils", "digest", "@ward-a"] } } as unknown as ChainedJob;
    expect(ofPeople([worker, mine]).map((j) => j.id)).toEqual([10]);
    expect(jobCards([], [worker, mine], caps7a([]), Date.parse(at)).map((c) => c.what)).toEqual(["Read of ward-a stopped"]);
  });
});
