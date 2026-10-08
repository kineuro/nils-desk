// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One safe way in for data (Wave 7a, H2 round 1), as a person goes through it
// against an engine that asks first: Add a dataset shows what the folder holds
// and asks how the files arrive with nothing chosen; the engine's 409 is shown
// as the question it is, with the entries and the tree, and the move is sent
// only once the person confirms; "Not yet" adds the folder undeclared and
// moves nothing; identified data says what PatientID holds; and on Data an
// undeclared dataset shows plainly as not read, with no bring-in, and its
// button opens the same dialog on the place itself.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import { ASKED, LOOSE, button, caps7a, dialogs, engine, radio, settle } from "../../test/safeWayIn";
import { AddDataset } from "./AddDataset";
import { DataPage } from "./DataPage";
import type { Dataset, SourcesAnswer } from "./datasets";
import { moveAskedOf, NOT_READ } from "./layout";
import { DoorError } from "../ask/client";

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

const DOORS = ["GET /api/sources", "POST /api/ingest/look", "GET /api/linkage/types", "POST /api/linkage/imports", "GET /api/places", "POST /api/places", "PUT /api/places/{id}"];
const TYPES = { types: [{ name: "personnummer", description: null }, { name: "study-id", description: "the study's own number" }] };

const placed = (extra: Record<string, unknown>) => ({ id: 9, name: "ward-a", role: "source", path: "/srv/in/ward-a", guarantees: {}, probed: null, probed_at: null, retired_at: null, ...extra });

function open(onDone = vi.fn()) {
  act(() => root.render(<AddDataset caps={caps7a(DOORS)} install={null} places={[]} cohorts={[]} initial={{ path: "/srv/in/ward-a", layout: LOOSE }} onClose={() => undefined} onDone={onDone} />));
  return onDone;
}

describe("Add a dataset, against an engine that asks first", () => {
  it("shows what the folder holds and asks how the files arrive, with nothing chosen and nothing to add yet", async () => {
    engine((c) => (c.url === "/api/linkage/types" ? { status: 200, body: TYPES } : undefined));
    open();
    await settle();
    const text = host.textContent ?? "";
    expect(text).toContain("What the folder holds");
    expect(text).toContain("3 loose entries");
    expect(text).toContain("Neither tree is there, so nothing in this folder is read until you say how its files arrive.");
    expect([...host.querySelectorAll("details li")].map((l) => l.textContent)).toEqual(["notes.txt", "sub-1", "sub-2"]);
    expect([...host.querySelectorAll<HTMLInputElement>('input[name="arrives"]')].some((r) => r.checked)).toBe(false);
    expect(text).toContain("Not yet");
    expect(button(host, "Add")!.disabled).toBe(true);
    expect(button(host, "Add and bring in")!.disabled).toBe(true);
  });

  it("says what an arrival would move before it is asked, shows the engine's 409 as the question, and moves only once confirmed", async () => {
    const e = engine((c, nth) => {
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/places") return nth === 1 ? { status: 409, body: ASKED } : { status: 201, body: placed({ layout: { ...LOOSE, loose: 0, loose_entries: [], question: false, moved: { into: "derivatives/dcm-original", entries: 3 } } }) };
      return undefined;
    });
    const onDone = open();
    await settle();
    act(() => radio(host, "Identified, from the scanners").click());
    const text = host.textContent ?? "";
    expect(text).toContain("Reads derivatives/dcm-original only.");
    expect(text).toContain("Moves the 3 loose entries beside derivatives/ into derivatives/dcm-original, once you confirm.");
    // identified data says what PatientID holds once pseudonymised; the subject's code is the engine's own default
    expect(text).toContain("What PatientID holds once pseudonymised");
    expect(radio(host, "The subject's code").checked).toBe(true);

    act(() => button(host, "Add")!.click());
    await settle();
    const first = e.of("POST", "/api/places");
    expect(first).toHaveLength(1);
    expect(first[0].body).toMatchObject({ name: "ward-a", role: "source", path: "/srv/in/ward-a", arrives: "identified", patient_id: "subject-code" });
    expect(first[0].body).not.toHaveProperty("confirm_move");
    expect(first[0].body).not.toHaveProperty("move_into_anon");
    // the 409 is a question: no failure is said, nothing is done, and the entries and the tree are named
    expect(onDone).not.toHaveBeenCalled();
    expect(host.querySelector("p.warn")).toBeNull();
    const asked = host.querySelector('[aria-label="Confirm the move"]')!;
    expect(asked.textContent).toContain("Move 3 loose entries into derivatives/dcm-original?");
    expect(asked.textContent).toContain("Nothing was written yet.");
    expect([...asked.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["notes.txt", "sub-1", "sub-2"]);
    expect(button(host, "Leave it undeclared")).not.toBeNull();

    act(() => button(host, "Move them and add")!.click());
    await settle();
    const both = e.of("POST", "/api/places");
    expect(both).toHaveLength(2);
    expect(both[1].body).toMatchObject({ arrives: "identified", patient_id: "subject-code", confirm_move: true });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toContain("ward-a is a dataset, 3 loose entries moved into derivatives/dcm-original");
  });

  it("goes back from the question without a word to the engine, and can leave the folder undeclared instead", async () => {
    const e = engine((c) => {
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/places") return c.body?.arrives === "undeclared" ? { status: 201, body: placed({ dataset: { arrives: "undeclared" }, layout: LOOSE }) } : { status: 409, body: ASKED };
      return undefined;
    });
    const onDone = open();
    await settle();
    act(() => radio(host, "De-identified by someone else").click());
    act(() => button(host, "Add")!.click());
    await settle();
    act(() => button(host, "Back")!.click());
    expect(host.querySelector('[aria-label="Confirm the move"]')).toBeNull();
    expect(e.of("POST", "/api/places")).toHaveLength(1);
    act(() => button(host, "Add")!.click());
    await settle();
    act(() => button(host, "Leave it undeclared")!.click());
    expect(radio(host, "Not yet").checked).toBe(true);
    // undeclared, nothing is brought in
    expect(button(host, "Add and bring in")).toBeNull();
    act(() => button(host, "Add")!.click());
    await settle();
    const sent = e.of("POST", "/api/places");
    expect(sent).toHaveLength(3);
    expect(sent[2].body).toMatchObject({ arrives: "undeclared" });
    expect(sent.every((c) => !("confirm_move" in (c.body ?? {})))).toBe(true);
    expect(onDone.mock.calls[0][0]).toContain("ward-a is added and not read until you say how its files arrive");
  });

  it("writes an ID type's value into PatientID where the person says so, and never offers the personnummer there", async () => {
    const e = engine((c) => {
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/places") return { status: 201, body: placed({ layout: LOOSE }) };
      return undefined;
    });
    act(() =>
      root.render(
        <AddDataset caps={caps7a(DOORS)} install={null} places={[]} cohorts={[]} initial={{ path: "/srv/in/ward-a", layout: { ...LOOSE, originals: true, anon: true, question: false, loose: 0, loose_entries: [], declarations: {} } }} onClose={() => undefined} onDone={() => undefined} />,
      ),
    );
    await settle();
    act(() => radio(host, "Identified, from the scanners").click());
    act(() => radio(host, "The subject's value of an ID type").click());
    const pick = host.querySelector<HTMLSelectElement>('select[aria-label="The ID type PatientID holds"]')!;
    expect([...pick.options].map((o) => o.value)).toEqual(["study-id"]);
    act(() => button(host, "Add")!.click());
    await settle();
    expect(e.of("POST", "/api/places")[0].body).toMatchObject({ arrives: "identified", patient_id: "id-type:study-id" });
  });

  it("reads the engine's question only from a 409 that names the confirmation and carries the layout", () => {
    expect(moveAskedOf(new DoorError(409, ASKED))?.layout.loose).toBe(3);
    expect(moveAskedOf(new DoorError(409, { error: "a place is already named ward-a", disclosure: "safe" }))).toBeNull();
    expect(moveAskedOf(new DoorError(400, ASKED))).toBeNull();
    expect(moveAskedOf(new Error("x"))).toBeNull();
  });
});

describe("an undeclared dataset on Data", () => {
  const sources = (answer as SourcesAnswer).sources;
  const undeclared: Dataset = {
    ...sources[0],
    id: 9,
    name: "ward-a",
    path: "/srv/in/ward-a",
    arrives: "undeclared",
    trees: { originals: null, anon: null },
    identity: null,
    held: null,
    digests: { count: 0, first: null, last: null, recent: [] },
    totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
  } as Dataset;

  it("shows plainly as not read, offers no bring-in, and its button opens Add a dataset on the place itself", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/sources")) return { status: 200, body: { count: 1, window_days: 30, sources: [undeclared], rates: null } };
      if (c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.url === "/api/ingest/look") return { status: 200, body: { layout: LOOSE, exists: true, directory: true, readable: true, here: null, folders: [] } };
      if (c.method === "PUT" && c.url === "/api/places/9") return c.body?.confirm_move ? { status: 200, body: placed({ layout: { ...LOOSE, moved: { into: "derivatives/dcm-anon", entries: 3 } } }) } : { status: 409, body: { ...ASKED, error: ASKED.error.replace("identified", "coded") } };
      return undefined;
    });
    act(() => root.render(<DataPage caps={caps7a(["GET /api/sources", "POST /api/ingest/look", "GET /api/linkage/types"])} install={null} onChanged={() => undefined} />));
    await settle();
    const card = host.querySelector(".scard")!;
    expect(card.textContent).toContain("undeclared");
    expect(card.textContent).toContain(NOT_READ);
    expect(button(host, "Bring in what is new")).toBeNull();
    act(() => button(card, "Say how its files arrive")!.click());
    await settle(12);
    expect(host.querySelector("dialog h2")?.textContent).toBe("How the files of ward-a arrive");
    // the place is declared where it is: no name, no new place, and nothing chosen for the person
    expect(host.querySelector("#dataset-name")).toBeNull();
    expect(host.textContent).not.toContain("Not yet");
    act(() => radio(host, "Our own codes already in PatientID").click());
    act(() => button(host, "Save")!.click());
    await settle();
    expect(host.querySelector('[aria-label="Confirm the move"]')?.textContent).toContain("Move 3 loose entries into derivatives/dcm-anon?");
    act(() => button(host, "Move them and save")!.click());
    await settle();
    const put = e.of("PUT", "/api/places/9");
    expect(put).toHaveLength(2);
    expect(put[0].body).not.toHaveProperty("confirm_move");
    expect(put[1].body).toMatchObject({ arrives: "coded", confirm_move: true });
    expect(e.of("POST", "/api/places")).toHaveLength(0);
    expect(host.textContent).toContain("ward-a is declared, 3 loose entries moved into derivatives/dcm-anon");
  });
});
