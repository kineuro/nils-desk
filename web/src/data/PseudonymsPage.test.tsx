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
    // record 55, ruling 24: a site's number leads to a person anywhere, and the type says so
    act(() => button(host.querySelector("dialog")!, "A person, anywhere")!.click());
    await act(async () => {
      button(host.querySelector("dialog")!, "Add")!.click();
    });
    await settle();
    expect(e.of("POST", "/api/linkage/types")[0].body).toEqual({ name: "site-id", description: "the site's own number", identifying: true });
    expect(host.textContent).toContain("site-id is an ID type.");
  });

  it("sends whether an ID type leads to a person only when the person chose it, so naming one again changes nothing", async () => {
    const e = engine((c) => {
      if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: TYPES };
      if (c.method === "POST" && c.url === "/api/linkage/types") return { status: 200, body: { ...TYPES[0], created: false } };
      return undefined;
    });
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, "Add an ID type")!.click());
    const set = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    act(() => set(host.querySelector<HTMLInputElement>("#type-name")!, "patient-id"));
    act(() => set(host.querySelector<HTMLInputElement>("#type-description")!, "what PatientID held"));
    // the study's choice is shown as chosen, and clicking it is no choice made
    act(() => button(host.querySelector("dialog")!, "A study's subject")!.click());
    await act(async () => {
      button(host.querySelector("dialog")!, "Add")!.click();
    });
    await settle();
    expect(e.of("POST", "/api/linkage/types")[0].body).toEqual({ name: "patient-id", description: "what PatientID held" });
  });

  it("shows a never-kept type's count as lookups, with a tag and the reason, and a kept type's count as it was", async () => {
    engine((c) =>
      c.url === "/api/linkage/types"
        ? {
            status: 200,
            body: [
              { id: 1, name: "personnummer", label: "ID that is the same everywhere", description: "the national number", identifying: true, identifiers: 4836, subjects: 4836 },
              { id: 2, name: "reserve-number", description: "a hospital's reserve number", identifying: true, identifiers: 1, subjects: 1 },
              ...TYPES,
            ],
          }
        : undefined,
    );
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    const rows = [...host.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(rows[0][0]).toContain("never kept");
    expect(rows[0][0]).toContain("Leads to a person");
    expect(rows[0][2]).toBe("4,836 lookups");
    expect(rows[1][2]).toBe("1 lookup");
    expect(rows[2]).toEqual(["patient-id", "what PatientID holds", "120", "118"]);
    expect(rows[3][2]).toBe("8");
    const why = "No number is stored, only a keyed one-way lookup that recognises it when it arrives again.";
    expect(host.querySelectorAll("tbody tr")[0].querySelectorAll("td")[2].getAttribute("title")).toBe(why);
    expect(host.querySelectorAll("tbody tr")[0].querySelector('[title="' + why + '"]')).not.toBeNull();
    expect(host.querySelectorAll("tbody tr")[2].querySelector("[title]")).toBeNull();
  });

  it("never shows a cell of the map in the dialog, not under a header, in the rehearsal, nor in a conflict", async () => {
    const PN = ["199001019999", "199002029999", "199003039999"];
    const csv = `personnummer,code,19900101-9999\n${PN.map((p, i) => `${p},S-000${i},x${i}`).join("\n")}\n`;
    const e = engine((c) => {
      if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: [{ id: 9, name: "personnummer", description: "the national number", identifiers: 3, subjects: 3 }, ...TYPES] };
      if (c.method === "POST" && c.url === "/api/linkage/imports")
        return {
          status: 200,
          body: {
            rows: 3,
            subjects: { named: 3, known: 0, new: 3 },
            identifiers: { filed: 3, known: 0, new: 3, types_new: [] },
            conflicts: [{ row: 3, why: "199002029999 appeared on line 2 with another code" }],
          },
        };
      return undefined;
    });
    act(() => root.render(<PseudonymsPage caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, "Give a map")!.click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([csv], "map.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    const dialog = host.querySelector("dialog")!;
    // the columns are listed, by header and shape; the third has a number for a header and is named by its place
    const describe = dialog.querySelector<HTMLInputElement>('input[aria-label="Describe the type identifier"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(describe, "a made-up type");
    await act(async () => {
      describe.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dialog.textContent).toContain("12 digits, 3 rows");
    expect(dialog.textContent).toContain("column 3");
    await act(async () => {
      button(dialog, "See what it will do")!.click();
    });
    await settle();
    expect(e.of("POST", "/api/linkage/imports")).toHaveLength(1);
    expect(dialog.textContent).toContain("Conflict");
    // row numbers stay; no value does, in any form
    expect(dialog.textContent).toContain("appeared on line 2");
    expect(dialog.textContent).not.toMatch(/\d{6,}/);
    for (const p of PN) expect(dialog.textContent).not.toContain(p);
    expect(dialog.innerHTML).not.toMatch(/\d{6,}/);
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
