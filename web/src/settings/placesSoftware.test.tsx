// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The software place on the Places page (record 57 P5, Wave 7b spec 6.8):
// the role in the add dialog with its words, the place added through the
// door with that role, the chip that counts it, and a second one refused on
// the form naming the first. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
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
const registry: Place = { id: 1, name: "registry", role: "registry", path: "/srv/nils/registry", guarantees: {}, probed: null, probed_at: null, retired_at: null, dataset: null };
const tools: Place = { id: 2, name: "tools", role: "software", path: "/srv/shared/software", guarantees: {}, probed: { exists: true, directory: true, writable: false }, probed_at: null, retired_at: null, dataset: null };

const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const choose = (value: string) => {
  const role = host.querySelector<HTMLSelectElement>("#place-role")!;
  act(() => {
    role.value = value;
    role.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("the software place on the Places page", () => {
  it("offers the software role with its words and adds the place through the door with that role", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [registry], enforced: true } };
      if (c.method === "POST" && c.url === "/api/places") return { status: 201, body: tools };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    act(() => button(host, "Add a place")!.click());
    expect([...host.querySelectorAll<HTMLOptionElement>("#place-role option")].map((o) => o.value)).toContain("software");
    choose("software");
    expect(host.querySelector("dialog h2")?.textContent).toBe("Add a software place");
    const words = host.querySelector("dialog .field .meta")?.textContent ?? "";
    expect(words).toContain("Holds the tools the engine installs and runs, and the site's own installs, found there");
    expect(words).toContain("must have one place of this role; a shared folder gets the engine's own subfolder");
    type(host.querySelector<HTMLInputElement>("#place-path")!, "/srv/shared/software");
    expect(button(host, "Add the place")!.disabled).toBe(false);
    act(() => button(host, "Add the place")!.click());
    await settle();
    const posted = e.of("POST", "/api/places");
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toMatchObject({ role: "software", path: "/srv/shared/software", name: "software" });
  });

  it("counts the software place in the chips and refuses a second one on the form, naming the first", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/places") && c.method === "GET") return { status: 200, body: { places: [registry, tools], enforced: true } };
      return undefined;
    });
    await act(async () => {
      await placesKept.refresh();
    });
    act(() => root.render(<PlacesPage caps={caps7a(DOORS)} install={null} onChanged={() => undefined} />));
    await settle();
    expect(button(host, "software 1")).not.toBeNull();
    act(() => button(host, "Add a place")!.click());
    choose("software");
    type(host.querySelector<HTMLInputElement>("#place-path")!, "/srv/more-tools");
    expect(host.querySelector("dialog .warn")?.textContent).toBe("one place of the software role: tools is it; retire it first, or move it");
    expect(button(host, "Add the place")!.disabled).toBe(true);
    expect(e.of("POST", "/api/places")).toHaveLength(0);
  });
});
