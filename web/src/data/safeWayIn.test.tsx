// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One safe way in for data, as an app (Wave 7a, the tries of 2026-10-08): the
// Data page lists each root's folders, compactly, with whether each holds
// DICOM and "Add as dataset"; a folder becomes a dataset only when the person
// adds it; each dataset card shows one state word and one button for its next
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
  const FOLDERS = [
    { name: "ward-a", path: "/srv/in/ward-a", added: true, dataset_id: 2, holds_dicom: "yes", has_derivatives: true },
    { name: "ward-c", path: "/srv/in/ward-c", added: false, dataset_id: null, holds_dicom: "yes", has_derivatives: false },
    { name: "notes", path: "/srv/in/notes", added: false, dataset_id: null, holds_dicom: "no", has_derivatives: false },
    { name: "big", path: "/srv/in/big", added: false, dataset_id: null, holds_dicom: "unknown", has_derivatives: false },
  ];
  const DOORS = ["GET /api/sources", "GET /api/places", "POST /api/places", "PUT /api/places/{id}", "POST /api/jobs", "POST /api/ingest/look", "GET /api/linkage/types"];

  async function page(datasets: Dataset[], route: Parameters<typeof engine>[0] = () => undefined) {
    let list = datasets;
    const e = engine((c, nth) => {
      if (c.url.startsWith("/api/sources")) return { status: 200, body: { count: list.length, window_days: 30, sources: list, rates: null } };
      if (c.method === "GET" && c.url.startsWith("/api/places/1/folders")) return { status: 200, body: { folders: FOLDERS } };
      if (c.method === "GET" && c.url.startsWith("/api/places")) return { status: 200, body: { places: [ROOT], enforced: true } };
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

  it("lists a root's folders compactly, and makes a folder a dataset only when the person adds it", async () => {
    const e = await page([identified], (c) => (c.method === "POST" && c.url === "/api/places" ? { status: 201, body: { ...WARD_C, layout: UNKNOWN } } : undefined));
    const rows = Object.fromEntries([...host.querySelectorAll(".root-folders tbody tr")].map((r) => [r.querySelector("b")?.textContent, [...r.querySelectorAll("td")].map((td) => td.textContent)]));
    expect(rows["ward-a"]).toEqual(["ward-a", "yes", "dataset"]);
    expect(rows["ward-c"]).toEqual(["ward-c", "yes", "Add as dataset"]);
    expect(rows["notes"]).toEqual(["notes", "no", "Add as dataset"]);
    expect(rows["big"]).toEqual(["big", "?", "Add as dataset"]);
    // nothing is a dataset until the person says so
    expect(e.of("POST", "/api/places")).toHaveLength(0);
    act(() => button(host, "Add as dataset: ward-c")!.click());
    await settle(8);
    expect(e.of("POST", "/api/places")[0].body).toEqual({ role: "source", root: "incoming", folder: "ward-c" });
    const card = [...host.querySelectorAll(".scard")].find((c) => c.textContent?.includes("ward-c"))!;
    expect(card.querySelector(".tag")?.textContent).toBe("Unknown");
    expect(button(card, "Sort the files: ward-c")).not.toBeNull();
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
    expect(e.of("PUT", "/api/places/3")[0].body).toEqual({ patient_id: "id-type:study-id", subjects: "generated", folder: "id-type" });
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
