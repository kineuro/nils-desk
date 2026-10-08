// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A root folder is the only way in (Wave 7a, the tries of 2026-10-08): on
// the Places page the source role leads to Add a root folder with the folder
// typed so far, and adds no place itself; a root lists its datasets, and a
// dataset not read yet shows so, its reason behind a "?", with the way to its
// card on Data. Setup's step is the folder field and one button.

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
  it("lists a root's datasets, and shows a dataset not read with its reason behind a ? and the way to Data", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [root, ward, registry], enforced: true } };
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
    expect(row("ward-b").querySelector(".hint")?.getAttribute("title")).toContain("does not say what PatientID holds");
    expect(row("ward-b").querySelector("a")?.getAttribute("href")).toBe("#data/datasets/ward-b");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
  });

  it("leads the source role to Add a root folder with the folder typed, and adds nothing itself", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [registry], enforced: true } };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root2.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    act(() => button(host, "Add a place")!.click());
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a root folder");
    expect(button(host, "Add the place")).toBeNull();
    const path = host.querySelector<HTMLInputElement>("#place-path")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(path, "/srv/in");
      path.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(host, "Go on in Add a root folder")!.click());
    await settle();
    expect(host.querySelector<HTMLInputElement>("#root-path")?.value).toBe("/srv/in");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
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

describe("Setup's step", () => {
  it("is the root folders, one line each, and the folder field with one button", async () => {
    const e = engine((c) => (c.method === "POST" && c.url === "/api/places" ? { status: 201, body: root } : undefined));
    const onDone = vi.fn();
    act(() => root2.render(<SourcesBody caps={caps7a(DOORS)} install={null} places={[root, ward, registry]} met={true} onDone={onDone} />));
    expect([...host.querySelectorAll(".source-list li b")].map((b) => b.textContent)).toEqual(["incoming"]);
    expect(host.querySelectorAll("p").length).toBe(0);
    const path = host.querySelector<HTMLInputElement>("#root-path")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(path, "/srv/more");
      path.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(host, "Add")!.click());
    await settle();
    expect(e.of("POST", "/api/places")[0].body).toEqual({ name: "more", role: "source", path: "/srv/more", guarantees: { backup: null, snapshots: false, protected: false, fast: false } });
    expect(onDone).toHaveBeenCalled();
  });

  it("says which work it needs to a person who may not add a folder", () => {
    act(() => root2.render(<SourcesBody caps={caps7a(DOORS, ["places:work", "data:see"])} install={null} places={[ward]} met={true} onDone={() => undefined} />));
    expect(host.textContent).toContain("this account has no work on the Data page.");
    expect(button(host, /Add/)).toBeNull();
  });
});
