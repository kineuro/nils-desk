// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Expert options on the release form (gate T31, walkthrough step 13.8): the
// release door's other flags, folded under one line. Nothing is sent until a
// person changes a field, only what the engine says it reads is drawn, and a
// field the engine would refuse holds the Release button with the reason.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { placesKept } from "../objects/kept";
import { CATEGORIES, expertBody, expertOffered, releaseBody } from "./release";
import { ReleasePage } from "./ReleasePage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EVERY = ["localizers", "synthetic", "dicom", "converter", "compress", "authors", "categories", "uid_root", "picked", "roles"];

describe("the expert options' body", () => {
  it("names nothing that is the engine's own default", () => {
    const b = expertBody({ localizers: "sourcedata", synthetic: "folder", dicom: "all", converter: "dcm2niix", compress: true, authors: " ", categories: [...CATEGORIES], picked: false, roles: "" }, "bids", EVERY);
    expect(b).toEqual({ ok: true, body: {} });
  });

  it("names every changed option as the door reads it", () => {
    const b = expertBody(
      { localizers: "drop", synthetic: "anat", dicom: "none", converter: "/opt/tools/dcm2niix", compress: false, authors: "Ada Lovelace, Alan Turing", categories: ["ids", "patient"], uid_root: "1.2.826.0.1.3680043.10.543.", picked: true, roles: "t1\nflair" },
      "bids",
      EVERY,
    );
    expect(b).toEqual({
      ok: true,
      body: {
        localizers: "drop",
        synthetic: "anat",
        dicom: "none",
        converter: "/opt/tools/dcm2niix",
        compress: false,
        authors: ["Ada Lovelace", "Alan Turing"],
        categories: ["patient", "ids"],
        uid_root: "1.2.826.0.1.3680043.10.543",
        picked: true,
        roles: ["t1", "flair"],
      },
    });
  });

  it("leaves the BIDS placements out of a descriptive release, and what the engine does not read out of every release", () => {
    expect(expertBody({ localizers: "drop", converter: "/x/dcm2niix", compress: false, picked: true }, "descriptive", EVERY)).toEqual({ ok: true, body: { picked: true } });
    expect(expertBody({ localizers: "drop", picked: true }, "bids", ["picked"])).toEqual({ ok: true, body: { picked: true } });
    expect(expertOffered(null)).toEqual([]);
    expect(expertOffered({ releases: { expert: ["picked", 3] } })).toEqual(["picked"]);
  });

  it("refuses what the engine would, before the door", () => {
    expect(expertBody({ converter: "/bin/sh" }, "bids", EVERY)).toMatchObject({ ok: false });
    expect(expertBody({ converter: "tools/dcm2niix" }, "bids", EVERY)).toMatchObject({ ok: false });
    expect(expertBody({ categories: [] }, "bids", EVERY)).toMatchObject({ ok: false, why: "at least one category of element to remove" });
    expect(expertBody({ uid_root: "1.02.3" }, "bids", EVERY)).toMatchObject({ ok: false });
    expect(expertBody({ uid_root: "1.2.x" }, "bids", EVERY)).toMatchObject({ ok: false });
    const held = releaseBody({ kind: "hand", cohorts: ["north"] }, { name: "n", out: "/x", layout: "bids", expert: { uid_root: "nope" }, offered: EVERY }, []);
    expect(held).toMatchObject({ ok: false });
  });
});

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

const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

const DOORS = ["GET /api/releases", "POST /api/releases", "GET /api/places", "GET /api/cohorts"];
const EXPORTS = { places: [{ id: 9, name: "exports", role: "export", path: "/exports", guarantees: {}, probed: null, probed_at: null, retired_at: null }] };
const COHORTS = { cohorts: [{ name: "north", subjects: 40, sessions: 80, stacks: 900, waiting: 0, retired_at: null }] };

async function open(offered: string[] | null) {
  const e = engine((c) => {
    if (c.method === "GET" && c.url.startsWith("/api/releases")) return { status: 200, body: { count: 0, releases: [] } };
    if (c.method === "GET" && c.url === "/api/places") return { status: 200, body: EXPORTS };
    if (c.method === "GET" && c.url === "/api/cohorts") return { status: 200, body: COHORTS };
    if (c.method === "POST" && c.url === "/api/releases") return { status: 202, body: { job: 88, state: "queued" } };
    return undefined;
  });
  await placesKept.refresh().catch(() => undefined);
  const caps = caps7a(DOORS);
  if (offered && caps.engine) caps.engine.releases = { expert: offered };
  act(() => root.render(<ReleasePage caps={caps} page="new" arg="north" />));
  await settle();
  return e;
}

const dialog = () => host.querySelector("dialog[open]")!;
const fold = () => dialog().querySelector<HTMLDetailsElement>("details.release-expert");
const released = (e: Awaited<ReturnType<typeof open>>) => e.of("POST", "/api/releases").map((c) => c.body);
const field = (label: string) => [...fold()!.querySelectorAll("label.field")].find((l) => l.querySelector(".label")?.textContent === label)!;
const check = (words: string) => [...fold()!.querySelectorAll<HTMLLabelElement>("label.check-row")].find((l) => l.textContent?.includes(words))!.querySelector("input")!;

describe("the release form's expert options", () => {
  it("are not drawn for an engine that names none", async () => {
    await open(null);
    expect(fold()).toBeNull();
  });

  it("are folded, and change nothing until changed", async () => {
    const e = await open(EVERY);
    expect(fold()).not.toBeNull();
    expect(fold()!.open).toBe(false);
    expect(fold()!.querySelector("summary")!.textContent).toBe("Expert options");
    act(() => button(dialog(), /^Release$/u)!.click());
    await settle();
    expect(Object.keys(released(e)[0] as object).filter((k) => EVERY.includes(k))).toEqual([]);
  });

  it("send what was changed", async () => {
    const e = await open(EVERY);
    await choose(field("Localizers").querySelector("select")!, "drop");
    await type(field("UID root").querySelector("input")!, "1.2.826.0.1.3680043.10.543");
    await type(field("Only roles").querySelector("input")!, "t1, flair");
    act(() => check("Only the picked scans").click());
    act(() => check("ids").click());
    expect(fold()!.querySelector("summary")!.textContent).toBe("Expert options · 5 changed");
    act(() => button(dialog(), /^Release$/u)!.click());
    await settle();
    expect(released(e)[0]).toMatchObject({
      localizers: "drop",
      uid_root: "1.2.826.0.1.3680043.10.543",
      roles: ["t1", "flair"],
      picked: true,
      categories: ["patient", "trial", "provider", "institution", "times"],
    });
  });

  it("holds the release with the reason while a field is one the engine would refuse", async () => {
    const e = await open(EVERY);
    await type(field("UID root").querySelector("input")!, "1.2.x");
    expect(button(dialog(), /^Release$/u)!.disabled).toBe(true);
    expect(dialog().textContent).toContain("Needs a UID root of numbers joined by dots");
    expect(released(e)).toHaveLength(0);
  });
});
