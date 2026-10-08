// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One safe way in for data (Wave 7a, H2 round 1), as a person goes through it
// against an engine that reads a dataset from its structure: Add a source
// sends the folder alone, and lists the datasets the engine found under it
// with what their structure says; an unknown dataset asks only which tree its
// entries with DICOM go into, shows the engine's 409 as the question it is,
// and moves only once the person confirms; an anonymised dataset asks what
// PatientID holds, how its subjects are found and what names each copy's
// folder; and on Data a dataset not read yet shows so with the engine's
// reason, offers no bring-in, and its button finishes it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import { ANONYMISED, ASKED, EXPLORED, IDENTIFIED, WARD_B, WARD_C, button, caps7a, dialogs, engine, radio, settle } from "../../test/safeWayIn";
import { DoorError } from "../ask/client";
import { AddSource } from "./AddSource";
import { DataPage } from "./DataPage";
import type { Dataset, SourcesAnswer } from "./datasets";
import { moveAskedOf, NOT_READ } from "./layout";

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

const DOORS = ["GET /api/sources", "POST /api/ingest/look", "GET /api/linkage/types", "GET /api/places", "POST /api/places", "PUT /api/places/{id}"];
const TYPES = { types: [{ name: "personnummer", description: null }, { name: "study-id", description: "the study's own number" }] };

/** The rows of the list, by name, with what each says. */
const rows = () => Object.fromEntries([...host.querySelectorAll(".found-row")].map((r) => [r.querySelector("b")?.textContent ?? "", r.textContent ?? ""]));

async function explored(route: Parameters<typeof engine>[0] = () => undefined) {
  const onDone = vi.fn();
  const e = engine((c, nth) => {
    if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
    if (c.method === "POST" && c.url === "/api/places") return { status: 201, body: EXPLORED };
    return route(c, nth);
  });
  act(() => root.render(<AddSource caps={caps7a(DOORS)} install={null} places={[]} initial={{ path: "/srv/in" }} onClose={() => undefined} onDone={onDone} />));
  act(() => button(host, "Add and explore")!.click());
  await settle();
  return { e, onDone };
}

describe("Add a source", () => {
  it("sends the folder alone, never how its files arrive, and lists each dataset found with what its structure says", async () => {
    // before anything is sent, nothing is asked of the person but the folder
    engine(() => undefined);
    act(() => root.render(<AddSource caps={caps7a(DOORS)} install={null} places={[]} initial={{ path: "/srv/in" }} onClose={() => undefined} onDone={() => undefined} />));
    expect(host.querySelector('input[type="radio"]')).toBeNull();
    expect(host.textContent).toContain("NILS explores the folder");
    act(() => root.unmount());
    root = createRoot(host);

    const { e, onDone } = await explored();
    const sent = e.of("POST", "/api/places");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ name: "in", role: "source", path: "/srv/in", guarantees: { backup: null, snapshots: false, protected: false, fast: false } });
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a source: incoming");
    const r = rows();
    expect(r["ward-a"]).toContain("identified: will be pseudonymised");
    expect(r["ward-a"]).toContain("read");
    expect(r["ward-a"]).not.toContain(NOT_READ);
    expect(r["ward-b"]).toContain("anonymised: needs its PatientID and how subjects are found");
    expect(r["ward-b"]).toContain(NOT_READ);
    expect(r["ward-c"]).toContain("unknown: tell us where its loose entries go");
    expect(r["broken"]).toContain("holds both derivatives/dcm-raw and derivatives/dcm-anon");
    expect(host.textContent).toContain("1 file lies at the top of incoming; they belong to no dataset and are not read.");
    act(() => button(host, "Done")!.click());
    expect(onDone.mock.calls[0][0]).toBe("incoming is a source with 3 datasets; 2 are not read until finished.");
  });

  it("asks an unknown dataset only where its entries go, shows the engine's 409 as the question, and moves only once confirmed", async () => {
    const { e } = await explored((c, nth) => {
      if (c.method === "PUT" && c.url === "/api/places/4")
        return nth === 1
          ? { status: 409, body: ASKED }
          : { status: 200, body: { ...WARD_C, dataset: { ...WARD_C.dataset, state: "identified", arrives: "identified", patient_id: "subject-code" }, layout: { ...IDENTIFIED, moved: { into: "derivatives/dcm-original", entries: 2 } } } };
      return undefined;
    });
    act(() => button(host, "Finish it: ward-c")!.click());
    const text = host.textContent ?? "";
    expect(text).toContain("NILS does not know what these entries hold.");
    expect(text).toContain("3 entries, 2 with DICOM");
    expect([...host.querySelectorAll("details li")].map((l) => l.textContent)).toEqual(["sub-1", "sub-2"]);
    // the one question: which tree; nothing is chosen for the person, and nothing else is asked
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => r.checked)).toEqual([false, false]);
    expect(text).not.toContain("What PatientID holds");
    const moving = button(host, "Move the 2 entries")!;
    expect(moving.disabled).toBe(true);
    act(() => radio(host, "Into dcm-original: identified").click());
    act(() => button(host, "Move the 2 entries")!.click());
    await settle();
    const put = e.of("PUT", "/api/places/4");
    expect(put).toHaveLength(1);
    expect(put[0].body).toEqual({ move_into: "originals" });
    // the 409 is a question: no failure is said, nothing moved, the entries and the tree are named
    expect(host.querySelector("p.warn")).toBeNull();
    const asked = host.querySelector('[aria-label="Confirm the move"]')!;
    expect(asked.textContent).toContain("Move 2 entries into derivatives/dcm-original?");
    expect(asked.textContent).toContain("Nothing was written yet.");
    expect([...asked.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["sub-1", "sub-2"]);
    act(() => button(asked, "Move them")!.click());
    await settle();
    expect(e.of("PUT", "/api/places/4")[1].body).toEqual({ move_into: "originals", confirm_move: true });
    // settled, it is identified now, and the list says so
    expect(host.textContent).toContain("identified: will be pseudonymised");
    act(() => button(host, "Back")!.click());
    expect(rows()["ward-c"]).toContain("identified: will be pseudonymised");
    expect(rows()["ward-c"]).not.toContain(NOT_READ);
  });

  it("goes back from the question without a word to the engine", async () => {
    const { e } = await explored((c) => (c.method === "PUT" && c.url === "/api/places/4" ? { status: 409, body: ASKED } : undefined));
    act(() => button(host, "Finish it: ward-c")!.click());
    act(() => radio(host, "Into dcm-anon: already anonymised").click());
    act(() => button(host, "Move the 2 entries")!.click());
    await settle();
    act(() => button(host.querySelector('[aria-label="Confirm the move"]')!, "Back")!.click());
    expect(host.querySelector('[aria-label="Confirm the move"]')).toBeNull();
    expect(e.of("PUT", "/api/places/4")).toHaveLength(1);
    expect(e.of("PUT", "/api/places/4")[0].body).toEqual({ move_into: "anon" });
  });

  it("asks an anonymised dataset what PatientID holds, how its subjects are found and what names each copy's folder, never offering the personnummer", async () => {
    const { e } = await explored((c) =>
      c.method === "PUT" && c.url === "/api/places/3"
        ? { status: 200, body: { ...WARD_B, dataset: { ...WARD_B.dataset, patient_id: "id-type:study-id", subjects: "generated", folder: "id-type" }, layout: ANONYMISED } }
        : undefined,
    );
    act(() => button(host, "Finish it: ward-b")!.click());
    await settle();
    const text = host.textContent ?? "";
    expect(text).toContain("What PatientID holds");
    expect(text).toContain("How its subjects are found");
    expect(text).toContain("What names each copy's folder");
    expect(text).toContain("the subject code generator makes each code from the id");
    // nothing can be saved before how subjects are found is said
    expect(button(host, "Save")!.disabled).toBe(true);
    expect(radio(host, "The ID type's value").disabled).toBe(true);
    act(() => radio(host, "A value of an ID type").click());
    const pick = host.querySelector<HTMLSelectElement>('select[aria-label="The ID type PatientID holds"]')!;
    expect([...pick.options].map((o) => o.value)).toEqual(["study-id"]);
    act(() => radio(host, "The ID type's value").click());
    act(() => radio(host, "Generated from the ID").click());
    act(() => button(host, "Save")!.click());
    await settle();
    expect(e.of("PUT", "/api/places/3")[0].body).toEqual({ patient_id: "id-type:study-id", subjects: "generated", folder: "id-type" });
    expect(host.textContent).toContain("anonymised: read as it is");
    act(() => button(host, "Back")!.click());
    expect(rows()["ward-b"]).not.toContain(NOT_READ);
  });

  it("reads the engine's question only from a 409 that names the confirmation and carries the layout", () => {
    expect(moveAskedOf(new DoorError(409, ASKED))?.layout.move_into?.entries).toBe(2);
    expect(moveAskedOf(new DoorError(409, { error: "a place is already named incoming", disclosure: "safe" }))).toBeNull();
    expect(moveAskedOf(new DoorError(400, ASKED))).toBeNull();
    expect(moveAskedOf(new Error("x"))).toBeNull();
  });
});

describe("a dataset not read yet, on Data", () => {
  const sources = (answer as SourcesAnswer).sources;
  const waiting: Dataset = {
    ...sources[0],
    id: 3,
    name: "ward-b",
    path: "/srv/in/ward-b",
    kind: "dataset",
    state: "anonymised",
    arrives: "deidentified",
    root: "incoming",
    patient_id: null,
    subjects: null,
    trees: { originals: null, anon: { path: "/srv/in/ward-b/derivatives/dcm-anon", files: null, last_written: null } },
    identity: null,
    held: null,
    digests: { count: 0, first: null, last: null, recent: [] },
    totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
  } as Dataset;
  const rootRow = { ...waiting, id: 1, name: "incoming", path: "/srv/in", kind: "root", state: "unknown", arrives: "undeclared", root: null, trees: { originals: null, anon: null } } as Dataset;

  it("shows the engine's reason, offers no bring-in, leaves the root out, and its button finishes it", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/sources")) return { status: 200, body: { count: 2, window_days: 30, sources: [rootRow, waiting], rates: null } };
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.url === "/api/ingest/look") return { status: 200, body: { layout: ANONYMISED, exists: true, directory: true, readable: true, here: null, folders: [] } };
      if (c.method === "PUT" && c.url === "/api/places/3") return { status: 200, body: { ...WARD_B, dataset: { ...WARD_B.dataset, patient_id: "subject-code", subjects: "map" }, layout: ANONYMISED } };
      return undefined;
    });
    act(() => root.render(<DataPage caps={caps7a(["GET /api/sources", "POST /api/ingest/look", "GET /api/linkage/types"])} install={null} onChanged={() => undefined} />));
    await settle();
    const cards = [...host.querySelectorAll(".scard")];
    expect(cards.map((c) => c.querySelector(".scard-pick")?.textContent)).toEqual(["ward-b"]);
    expect(cards[0].textContent).toContain(NOT_READ);
    expect(cards[0].textContent).toContain("it is anonymised and does not say what PatientID holds, nor how its subjects are found");
    expect(button(host, "Bring in what is new")).toBeNull();
    act(() => button(cards[0], "Finish it: ward-b")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Finish ward-b");
    act(() => radio(host, "A map").click());
    act(() => button(host, "Save")!.click());
    await settle();
    expect(e.of("PUT", "/api/places/3")[0].body).toEqual({ patient_id: "subject-code", subjects: "map", folder: "subject-code" });
    expect(e.of("POST", "/api/places")).toHaveLength(0);
    expect(host.textContent).toContain("ward-b is complete, and is read.");
  });
});
