// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The source has no way in of its own (Wave 7a, H2 round 1): on the Places
// page the source role leads to Add a source with the folder typed so far,
// and adds no place itself; a root lists its datasets, and a dataset not read
// yet shows so with the engine's reason and the button that finishes it.
// Setup's DICOM step opens the same dialog, and shows a dataset not read the
// same way.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANONYMISED, button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { NOT_READ } from "../data/layout";
import { SourcesBody } from "../home/Setup";
import type { Place } from "../objects/client";
import { placesKept } from "../objects/kept";
import { PlacesPage } from "./PlacesPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root2: Root;
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root2 = createRoot(host);
});
afterEach(() => {
  act(() => root2.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const DOORS = ["GET /api/places", "POST /api/places", "PUT /api/places/{id}", "POST /api/ingest/look", "GET /api/linkage/types"];

const root: Place = {
  id: 1,
  name: "incoming",
  role: "source",
  path: "/srv/in",
  guarantees: { snapshots: true },
  probed: null,
  probed_at: null,
  retired_at: null,
  dataset: { kind: "root", state: "unknown", root: null },
  layout: { root: true, datasets: 2 },
  not_read: null,
  datasets: ["ward-a", "ward-b"],
};
const ward: Place = {
  id: 3,
  name: "ward-b",
  role: "source",
  path: "/srv/in/ward-b",
  guarantees: { snapshots: true },
  probed: null,
  probed_at: null,
  retired_at: null,
  dataset: { kind: "dataset", state: "anonymised", root: "incoming", patient_id: null, subjects: null },
  layout: ANONYMISED,
  not_read: "it arrives deidentified and does not say what PatientID holds (patient_id: subject-code or id-type:<name>), nor how its subjects are found (subjects: map or generated)",
};
const registry: Place = { id: 1, name: "registry", role: "registry", path: "/srv/nils/registry", guarantees: {}, probed: null, probed_at: null, retired_at: null, dataset: null };

describe("the Places page", () => {
  it("lists a root's datasets, shows a dataset not read with the engine's reason, and finishes it in its own dialog", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [root, ward, registry], enforced: true } };
      if (c.url === "/api/linkage/types") return { status: 200, body: { types: [] } };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root2.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    const row = (name: string) => [...host.querySelectorAll("tbody tr")].find((r) => r.querySelector("b")?.textContent === name)!;
    expect(row("incoming").textContent).toContain("root, 2 datasets");
    expect(row("incoming").textContent).toContain("holds ward-a, ward-b");
    expect(row("incoming").textContent).not.toContain(NOT_READ);
    expect(row("ward-b").querySelector(".tag.caution")?.textContent).toBe(NOT_READ);
    expect(row("ward-b").textContent).toContain("does not say what PatientID holds");
    expect(row("ward-b").textContent).not.toContain("the engine reads it");
    act(() => button(row("ward-b"), "Finish it: ward-b")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Finish ward-b");
    expect(host.textContent).toContain("How its subjects are found");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
  });

  it("leads the source role to Add a source with the folder typed, and adds no source itself", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [registry], enforced: true } };
      if (c.url === "/api/linkage/types") return { status: 200, body: { types: [] } };
      if (c.url === "/api/ingest/look") return { status: 200, body: { layout: ANONYMISED, exists: true, directory: true, readable: true, here: null, folders: [] } };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root2.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    act(() => button(host, "Add a place")!.click());
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a source");
    expect(host.textContent).toContain("A source is added in Add a source");
    // no way to add the source here: the button goes on to the one dialog
    expect(button(host, "Add the place")).toBeNull();
    expect(button(host, /restart the engine/)).toBeNull();
    const path = host.querySelector<HTMLInputElement>("#place-path")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(path, "/srv/in/ward-b");
      path.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(host, "Go on in Add a source")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a source");
    expect(host.querySelector<HTMLInputElement>("#source-path")?.value).toBe("/srv/in/ward-b");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
    // another role is still a place of its own
    act(() => button(host, "Cancel")!.click());
    act(() => button(host, "Add a place")!.click());
    const role = host.querySelector<HTMLSelectElement>("#place-role")!;
    act(() => {
      role.value = "export";
      role.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button(host, "Add the place")).not.toBeNull();
  });
});

describe("Setup's DICOM step", () => {
  it("opens Add a source, the one way in, and shows a dataset not read with its reason", async () => {
    engine((c) => (c.url === "/api/linkage/types" ? { status: 200, body: { types: [] } } : undefined));
    act(() => root2.render(<SourcesBody caps={caps7a(DOORS)} install={null} places={[]} met={false} onDone={() => undefined} />));
    expect(button(host, /Bring in|Digest|Add as a source|Add only|Add a dataset/)).toBeNull();
    act(() => button(host, "Add a source")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a source");
    expect(host.textContent).toContain("NILS explores the folder");
    expect(host.querySelector('input[name="arrives"]')).toBeNull();

    act(() => root2.render(<SourcesBody caps={caps7a(DOORS)} install={null} places={[root, ward, registry]} met={true} onDone={() => undefined} />));
    await settle();
    const item = (name: string) => [...host.querySelectorAll(".source-list li")].find((l) => l.querySelector("b")?.textContent === name)!;
    expect(item("incoming").textContent).toContain("a source of 2 datasets");
    expect(item("ward-b").textContent).toContain(NOT_READ);
    expect(button(host, "Add another source")).not.toBeNull();
    act(() => button(item("ward-b"), "Finish it: ward-b")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Finish ward-b");
  });

  it("says which work it needs, and offers no dialog, to a person who may not add a source", () => {
    act(() => root2.render(<SourcesBody caps={caps7a(DOORS, ["places:work", "data:see"])} install={null} places={[ward]} met={true} onDone={() => undefined} />));
    expect(host.textContent).toContain("this account has no work on the Data page.");
    expect(button(host, /Add/)).toBeNull();
    expect(button(host, /Finish it/)).toBeNull();
  });
});
