// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The source has no way in of its own (Wave 7a, H2 round 1): on the Places
// page the source role leads to Add a dataset with the folder typed so far,
// and adds no place itself; an undeclared source shows as not read, with the
// button that declares it in that dialog. Setup's DICOM step opens the same
// dialog, and shows an undeclared source the same way.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOOSE, button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { NOT_READ } from "../data/layout";
import { SourcesBody } from "../home/Setup";
import type { Place } from "../objects/client";
import { placesKept } from "../objects/kept";
import { PlacesPage } from "./PlacesPage";

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

const DOORS = ["GET /api/places", "POST /api/places", "PUT /api/places/{id}", "POST /api/ingest/look", "GET /api/linkage/types"];

const ward: Place = {
  id: 9,
  name: "ward-a",
  role: "source",
  path: "/srv/in/ward-a",
  guarantees: { snapshots: true },
  probed: null,
  probed_at: null,
  retired_at: null,
  dataset: { arrives: "undeclared" },
  layout: LOOSE,
};
const registry: Place = { id: 1, name: "registry", role: "registry", path: "/srv/nils/registry", guarantees: {}, probed: null, probed_at: null, retired_at: null, dataset: null };

describe("the Places page", () => {
  it("shows an undeclared source as not read, and declares it in Add a dataset, never adding a place of its own", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [ward, registry], enforced: true } };
      if (c.url === "/api/linkage/types") return { status: 200, body: { types: [] } };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    const row = [...host.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes("ward-a"))!;
    expect(row.textContent).toContain(NOT_READ);
    expect(row.querySelector(".tag.caution")?.textContent).toBe(NOT_READ);
    expect(row.textContent).toContain("undeclared");
    expect(row.textContent).not.toContain("the engine reads it");
    act(() => button(row, "Say how its files arrive")!.click());
    await settle();
    // the dialog is Add a dataset on the place itself, with what the folder holds from the places door
    expect(host.querySelector("dialog h2")?.textContent).toBe("How the files of ward-a arrive");
    expect(host.textContent).toContain("3 loose entries");
    expect(e.of("POST", "/api/places")).toHaveLength(0);
  });

  it("leads the source role to Add a dataset with the folder typed, and adds no source itself", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [registry], enforced: true } };
      if (c.url === "/api/linkage/types") return { status: 200, body: { types: [] } };
      if (c.url === "/api/ingest/look") return { status: 200, body: { layout: LOOSE, exists: true, directory: true, readable: true, here: null, folders: [] } };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    act(() => button(host, "Add a place")!.click());
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a source");
    expect(host.textContent).toContain("A source is a dataset");
    // no way to add the source here: the button goes on to the one dialog
    expect(button(host, "Add the place")).toBeNull();
    expect(button(host, /restart the engine/)).toBeNull();
    const path = host.querySelector<HTMLInputElement>("#place-path")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(path, "/srv/in/ward-b");
      path.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(host, "Go on in Add a dataset")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a dataset");
    expect(host.querySelector<HTMLInputElement>("#dataset-path")?.value).toBe("/srv/in/ward-b");
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
  it("opens Add a dataset, the one way in, and shows an undeclared source as not read", async () => {
    engine((c) => (c.url === "/api/linkage/types" ? { status: 200, body: { types: [] } } : undefined));
    act(() => root.render(<SourcesBody caps={caps7a(DOORS)} install={null} places={[]} met={false} onDone={() => undefined} />));
    expect(button(host, /Bring in|Digest|Add as a source|Add only/)).toBeNull();
    act(() => button(host, "Add a dataset")!.click());
    await settle();
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a dataset");
    expect(host.textContent).toContain("How the files arrive");

    act(() => root.render(<SourcesBody caps={caps7a(DOORS)} install={null} places={[ward, registry]} met={true} onDone={() => undefined} />));
    await settle();
    const item = [...host.querySelectorAll(".source-list li")].find((l) => l.textContent?.includes("ward-a"))!;
    expect(item.textContent).toContain(NOT_READ);
    expect(button(host, "Add another dataset")).not.toBeNull();
  });

  it("says which work it needs, and offers no dialog, to a person who may not add a dataset", () => {
    act(() => root.render(<SourcesBody caps={caps7a(DOORS, ["places:work", "data:see"])} install={null} places={[ward]} met={true} onDone={() => undefined} />));
    expect(host.textContent).toContain("this account has no work on the Data page.");
    expect(button(host, /Add/)).toBeNull();
    expect(button(host, "Say how its files arrive")).toBeNull();
  });
});
