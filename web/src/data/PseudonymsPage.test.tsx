// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Pseudonyms under Data (Wave 7a, the design of 2026-10-09): what spans
// datasets and nothing of one dataset alone. The ID types with how many IDs
// and subjects each holds, a map given for every dataset at once, a new ID
// type, and the subjects that may be one subject twice on Review. The types
// and counts here are made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { GRANTS } from "../grants";
import { PseudonymsPage } from "./PseudonymsPage";

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

const DOORS = ["GET /api/linkage/types", "POST /api/linkage/types", "POST /api/linkage/imports"];
const TYPES = [
  { id: 1, name: "patient-id", description: "what PatientID holds", identifiers: 120, subjects: 118 },
  { id: 4, name: "study-id", description: "the study's own number", identifiers: 8, subjects: 8 },
];

describe("Pseudonyms", () => {
  it("lists the ID types with their counts, and gives a map or a type for every dataset at once", async () => {
    const e = engine((c) => {
      if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/linkage/types") return { status: 201, body: { ...TYPES[1], id: 5, name: "site-id", created: true } };
      return undefined;
    });
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    expect(host.querySelector("h1")?.textContent).toBe("Pseudonyms");
    const rows = [...host.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(rows).toEqual([
      ["patient-id", "what PatientID holds", "120", "118"],
      ["study-id", "the study's own number", "8", "8"],
    ]);
    expect(host.querySelector('a[href="#review/identifiers"]')?.textContent).toContain("Subjects that may be one subject twice");
    // nothing of one dataset: no held files, no tags, no originals
    expect(host.textContent).not.toMatch(/held|originals|Tags/);
    act(() => button(host, "Give a map")!.click());
    expect(host.querySelector("dialog h2")?.textContent).toBe("Give a map");
    act(() => button(host.querySelector("dialog")!, "Cancel")!.click());
    act(() => button(host, "Add an ID type")!.click());
    const name = host.querySelector<HTMLInputElement>("#type-name")!;
    const what = host.querySelector<HTMLInputElement>("#type-description")!;
    const set = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    act(() => set(name, "Site ID"));
    act(() => set(what, "the site's own number"));
    await act(async () => {
      button(host.querySelector("dialog")!, "Add")!.click();
    });
    await settle();
    expect(e.of("POST", "/api/linkage/types")[0].body).toEqual({ name: "site-id", description: "the site's own number" });
    expect(host.textContent).toContain("site-id is an ID type.");
  });

  it("offers no act to a person who may only read Data", async () => {
    engine((c) => (c.url === "/api/linkage/types" ? { status: 200, body: TYPES } : undefined));
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS, GRANTS.filter((g) => g !== "data:work"))} />));
    await settle();
    expect(button(host, "Give a map")).toBeNull();
    expect(button(host, "Add an ID type")).toBeNull();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  });
});
