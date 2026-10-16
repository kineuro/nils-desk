// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Record 55, ruling 35 (c), gate T31 step 8.7: one subject's IDs on
// Pseudonyms, an admin's. Shown by type first; the values only with a why;
// a value the engine withheld as a personnummer shown as its shape and
// never as itself; a link with its evidence; a linkage reversed; a purge
// counted first and sent only with the code typed. Nothing of it reaches an
// address or the browser's storage. Every name and number here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { Identifiers } from "./Identifiers";
import { valueWords, type Shown } from "./identifiers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let stored: { mock: { calls: unknown[][] } };
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  stored = vi.spyOn(Storage.prototype, "setItem");
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};
const input = (label: string) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  expect(l, label).toBeDefined();
  return document.getElementById(l!.htmlFor) as HTMLInputElement;
};

const DOORS = ["POST /api/linkage/show", "POST /api/linkage/links", "POST /api/linkage/links/{id}/unlink", "POST /api/linkage/purge"];
const ADMIN = ["data:see", "data:work", "install:see", "install:work"];
const CODE = "S-7Q2K";

const SHOWN = (values: boolean): Shown => ({
  subject: CODE,
  merged_into: null,
  values,
  identifiers: [
    { identity: 1, id_type: "patient-id", label: "patient-id", source: "csv", kept: true, ...(values ? { shape: "999999999999", withheld: "it reads as a personnummer, which is never shown on a page" } : {}) },
    { identity: 2, id_type: "study-id", label: "study-id", source: "csv", kept: true, ...(values ? { value: "STUDY-0042" } : {}) },
    { identity: 3, id_type: "personnummer", label: "ID that is the same everywhere", source: "dicom", kept: false },
  ],
  by_type: [],
  shown: values ? 1 : 0,
  withheld: values ? 1 : 0,
  linkages: [{ id: 5, role: "canonical", other: "S-9X1M", evidence: "one person", by: "chief@lab", at: "2026-10-16T10:00:00Z", reversed_at: null, reversed_by: null }],
});

describe("one subject's IDs", () => {
  it("shows types first, values only with a why, and a personnummer never", async () => {
    const e = engine((c) => {
      if (c.url !== "/api/linkage/show") return undefined;
      return { status: 200, body: SHOWN(c.body?.values === true) };
    });
    act(() => root.render(<Identifiers caps={caps7a(DOORS, ADMIN)} />));
    await typeInto(input("Subject code"), CODE);
    click(button(host, "Show"));
    await settle();
    expect(e.of("POST", "/api/linkage/show")[0].body).toEqual({ subject: CODE });
    expect(host.textContent).toContain("never kept");
    expect(host.textContent).not.toContain("STUDY-0042");
    click(button(host, "Show the values"));
    const go = [...host.querySelectorAll("button")].filter((b) => b.textContent === "Show").at(-1)!;
    expect(go.disabled).toBe(true);
    await typeInto(input("Why"), "checking the study's own ID");
    click(go);
    await settle();
    expect(e.of("POST", "/api/linkage/show")[1].body).toEqual({ subject: CODE, values: true, why: "checking the study's own ID" });
    expect(host.textContent).toContain("STUDY-0042");
    expect(host.textContent).toContain("999999999999 · not shown, reads as a personnummer");
    // the values go when the subject changes
    await typeInto(input("Subject code"), "S-OTHER");
    expect(host.textContent).not.toContain("STUDY-0042");
    for (const c of e.calls) expect(c.url).toBe("/api/linkage/show");
    expect(stored.mock.calls).toHaveLength(0);
  });

  it("links another subject with its evidence, and reverses a linkage", async () => {
    const e = engine((c) => {
      if (c.url === "/api/linkage/show") return { status: 200, body: SHOWN(false) };
      if (c.url === "/api/linkage/links") return { status: 202, body: { linkage: 6, job: 40, state: "queued" } };
      if (c.url === "/api/linkage/links/5/unlink") return { status: 200, body: { linkage: 5, reversed: true } };
      return undefined;
    });
    act(() => root.render(<Identifiers caps={caps7a(DOORS, ADMIN)} />));
    await typeInto(input("Subject code"), CODE);
    click(button(host, "Show"));
    await settle();
    click(button(host, "Unlink 5"));
    await settle();
    expect(e.of("POST", "/api/linkage/links/5/unlink")).toHaveLength(1);
    expect(host.textContent).toContain("Linkage 5 reversed.");
    click(button(host, "Link a subject"));
    const d = document.querySelector("dialog[open]")!;
    await typeInto(input("Other subject"), CODE);
    expect(button(d, "Link")!.disabled).toBe(true);
    await typeInto(input("Other subject"), "S-9X1M");
    await typeInto(input("Evidence"), "the clinic's letter");
    click(button(d, "Link"));
    await settle();
    expect(e.of("POST", "/api/linkage/links")[0].body).toEqual({ a: CODE, b: "S-9X1M", evidence: "the clinic's letter" });
    expect(host.textContent).toContain("Linkage 6 made; S-9X1M merges into S-7Q2K as job 40.");
  });

  it("purges only with the code typed, after saying what goes", async () => {
    const e = engine((c) => {
      if (c.url === "/api/linkage/show") return { status: 200, body: SHOWN(false) };
      if (c.url === "/api/linkage/purge" && c.body?.dry_run) return { status: 200, body: { subject: CODE, all: false, identities: 3, linkages: 1, dry_run: true, confirm: CODE } };
      if (c.url === "/api/linkage/purge") return { status: 200, body: { subject: CODE, all: false, identities: 3, linkages: 1, job: 41 } };
      return undefined;
    });
    act(() => root.render(<Identifiers caps={caps7a(DOORS, ADMIN)} />));
    await typeInto(input("Subject code"), CODE);
    click(button(host, "Show"));
    await settle();
    click(button(host, "Purge"));
    await settle();
    const d = document.querySelector("dialog[open]")!;
    expect(d.textContent).toContain("3 IDs and 1 linkage.");
    expect(button(d, "Purge")!.disabled).toBe(true);
    await typeInto(input("Type the code"), "yes");
    expect(button(d, "Purge")!.disabled).toBe(true);
    await typeInto(input("Type the code"), CODE);
    click(button(d, "Purge"));
    await settle();
    expect(e.of("POST", "/api/linkage/purge").map((c) => c.body)).toEqual([
      { subject: CODE, dry_run: true },
      { subject: CODE, confirm: CODE },
    ]);
    expect(host.textContent).toContain("Purged 3 IDs and 1 linkage.");
  });

  it("purges every subject only with those words typed", async () => {
    const e = engine((c) => {
      if (c.url === "/api/linkage/purge" && c.body?.dry_run) return { status: 200, body: { subject: null, all: true, identities: 9, linkages: 0, dry_run: true, confirm: "every subject" } };
      if (c.url === "/api/linkage/purge") return { status: 200, body: { subject: null, all: true, identities: 9, linkages: 0, job: 42 } };
      return undefined;
    });
    act(() => root.render(<Identifiers caps={caps7a(DOORS, ADMIN)} />));
    click(button(host, "Purge every subject"));
    await settle();
    await typeInto(input("Type every subject"), "every subject");
    click(button(document.querySelector("dialog[open]")!, "Purge"));
    await settle();
    expect(e.of("POST", "/api/linkage/purge").map((c) => c.body)).toEqual([
      { all: true, dry_run: true },
      { all: true, confirm: "every subject" },
    ]);
  });

  it("is not there for anyone but an admin at every detail, nor for an engine without the doors", () => {
    engine(() => undefined);
    act(() => root.render(<Identifiers caps={caps7a(DOORS, ["data:see", "data:work"])} />));
    expect(host.textContent).toBe("");
    const quasi = caps7a(DOORS, ADMIN);
    quasi.person.detail = "quasi";
    act(() => root.render(<Identifiers caps={quasi} />));
    expect(host.textContent).toBe("");
    act(() => root.render(<Identifiers caps={caps7a([], ADMIN)} />));
    expect(host.textContent).toBe("");
  });

  it("words a value by what the engine said of it", () => {
    expect(valueWords({ identity: 1, id_type: "personnummer", label: "", source: "", kept: false }, true)).toBe("never kept");
    expect(valueWords({ identity: 1, id_type: "patient-id", label: "", source: "", kept: true }, false)).toBe("kept");
    expect(valueWords({ identity: 1, id_type: "patient-id", label: "", source: "", kept: true, shape: "999999999999", withheld: "x" }, true)).toBe("999999999999 · not shown, reads as a personnummer");
  });
});
