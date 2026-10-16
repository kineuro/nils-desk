// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The decisions in force on an axis, written as a label set (record 42 S7;
// gate T31, walkthrough step 21.3): Review's Label sets page offers New label
// set to a person who may read the decisions, the dialog takes the axis from
// the pack, the name and the export place, and the engine's door is told only
// what the person chose. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { placesKept } from "../objects/kept";
import type { Grant } from "../grants";
import { LabelSetsBody, LabelSetsPage } from "./LabelSets";
import { decisionSetBody, decisionSetRefusal, decisionSetWords } from "./decisionSet";

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

const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("who may write a label set of decisions", () => {
  const DOORS = ["POST /api/label-sets"];
  it("is a person who may read every decision and works on Campaigns or Review", () => {
    expect(decisionSetRefusal(caps7a(DOORS))).toBeNull();
    expect(decisionSetRefusal(caps7a(DOORS, ["review:work"]))).toBeNull();
    expect(decisionSetRefusal(caps7a(DOORS, ["campaigns:work", "review:see"]))).toBeNull();
  });
  it("says in words why a person may not", () => {
    expect(decisionSetRefusal(caps7a([]))).toBe("This engine has no door for writing a label set.");
    expect(decisionSetRefusal(caps7a(DOORS, ["campaigns:see", "review:see"]))).toBe("Writing a label set needs work on the Campaigns page or on the Review page.");
    // a rater exports a campaign's labels through the campaign, and reads no decision of every scan
    expect(decisionSetRefusal(caps7a(DOORS, ["campaigns:work"]))).toBe("A label set of decisions reads the decisions of every scan, so it needs the Review page.");
  });
});

describe("what the door is told", () => {
  it("is the axis, and the name and the place only where the person chose them", () => {
    expect(decisionSetBody({ axis: "body_part", name: "", place: "" })).toEqual({ ok: true, body: { axis: "body_part" } });
    expect(decisionSetBody({ axis: " body_part ", name: "body_part", place: "" })).toEqual({ ok: true, body: { axis: "body_part" } });
    expect(decisionSetBody({ axis: "body_part", name: "gold-body-part", place: "exports" })).toEqual({ ok: true, body: { axis: "body_part", name: "gold-body-part", place: "exports" } });
    expect(decisionSetBody({ axis: " ", name: "x", place: "" })).toEqual({ ok: false, why: "an axis" });
  });
  it("says what was written, and what a sealed sample kept out", () => {
    expect(decisionSetWords({ name: "body_part", version: 2, rows: 1204 })).toBe("Wrote body_part v2: 1,204 rows.");
    expect(decisionSetWords({ name: "orient", version: 1, rows: 1 })).toBe("Wrote orient v1: 1 row.");
    expect(decisionSetWords({ name: "body_part", version: 1, rows: 900, left_out_sealed: 40 })).toBe("Wrote body_part v1: 900 rows. 40 labels were left out: their sample is sealed.");
    expect(decisionSetWords({ name: "body_part", version: 1, rows: 900, left_out_sealed: 1 })).toBe("Wrote body_part v1: 900 rows. 1 label was left out: their sample is sealed.");
    expect(decisionSetWords({ name: "body_part", version: 1, rows: 900, left_out_sealed: 0 })).toBe("Wrote body_part v1: 900 rows.");
  });
});

describe("the Label sets page", () => {
  it("offers New label set where the person may write one, and says the same in its empty state", () => {
    const body = (onMake?: () => void) => renderToStaticMarkup(<LabelSetsBody sets={[]} why={null} since={0} onMake={onMake} />);
    expect(body(() => undefined)).toContain(">New label set</button>");
    expect(body(() => undefined)).toContain("No label set yet. A campaign&#x27;s Export writes one, and New label set writes the decisions in force.");
    expect(body()).not.toContain("New label set</button>");
    expect(body()).toContain("No label set yet. A campaign&#x27;s Export writes one.");
  });
});

const DOORS = ["GET /api/label-sets", "POST /api/label-sets", "GET /api/places", "GET /api/packs/{name}"];
const PACK = { pack: "mri", version: "1.2.3", contract: 11, modality: "MR", flags: 3, axes: [{ axis: "body_part", values: [] }, { axis: "orientation", values: [] }] };
const place = (id: number, name: string, role = "export") => ({ id, name, role, path: `/exports/${name}`, guarantees: {}, probed: null, probed_at: null, retired_at: null });
const SET = { id: 9, name: "body_part", version: 1, kind: "decisions", what: "body_part", source: {}, campaign_id: null, handle_id: null, epoch: 4, pack_version: "1.2.3", scheme_digest: null, sealed: false, training: "no", rows: 1204, digest: "d", place_id: 1, path: "/exports/labels/body_part", created_by: "astrid", created_at: "2026-10-16T09:00:00Z" };

async function open(places: unknown[], route: Parameters<typeof engine>[0] = () => undefined, grants?: readonly Grant[]) {
  const e = engine((c, nth) => {
    const own = route(c, nth);
    if (own) return own;
    if (c.method === "GET" && c.url === "/api/label-sets") return { status: 200, body: { count: 0, label_sets: [] } };
    if (c.method === "GET" && c.url === "/api/places") return { status: 200, body: { places } };
    if (c.method === "GET" && c.url === "/api/packs/mri") return { status: 200, body: PACK };
    return undefined;
  });
  await placesKept.refresh().catch(() => undefined);
  act(() => root.render(<LabelSetsPage caps={caps7a(DOORS, grants)} />));
  await settle();
  click(button(host, "New label set"));
  await settle();
  return e;
}
const dialog = () => host.querySelector("dialog[open]")!;

describe("New label set", () => {
  it("takes the axis from the pack and writes the decisions in force on it, naming nothing else, then reads the list again", async () => {
    const e = await open([place(1, "exports")], (c) => (c.method === "POST" && c.url === "/api/label-sets" ? { status: 201, body: SET } : undefined));
    const axis = dialog().querySelector<HTMLSelectElement>('select[aria-label="The axis"]')!;
    expect([...axis.options].map((o) => o.textContent)).toEqual(["choose an axis", "body_part", "orientation"]);
    expect(button(dialog(), "Write the label set")!.disabled).toBe(true);
    expect(dialog().querySelector(".dialog-foot .meta")?.textContent).toBe("Needs an axis.");
    // one export place: the engine's one, so none is chosen or sent
    expect(dialog().querySelector('select[aria-label="Export place"]')).toBeNull();
    await choose(axis, "body_part");
    click(button(dialog(), "Write the label set"));
    await settle();
    expect(e.of("POST", "/api/label-sets").map((c) => c.body)).toEqual([{ axis: "body_part" }]);
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(host.textContent).toContain("Wrote body_part v1: 1,204 rows.");
    expect(e.of("GET", "/api/label-sets")).toHaveLength(2);
  });

  it("sends the name chosen, and the export place where there are several", async () => {
    const e = await open([place(1, "exports"), place(2, "partner-outbox"), place(3, "source-a", "source")], (c) => (c.method === "POST" && c.url === "/api/label-sets" ? { status: 201, body: SET } : undefined));
    const where = dialog().querySelector<HTMLSelectElement>('select[aria-label="Export place"]')!;
    expect([...where.options].map((o) => o.textContent)).toEqual(["exports", "partner-outbox"]);
    await choose(dialog().querySelector<HTMLSelectElement>('select[aria-label="The axis"]')!, "orientation");
    await typeInto(dialog().querySelector<HTMLInputElement>('input[aria-label="The label set\'s name"]')!, "gold-orientation");
    await choose(where, "2");
    click(button(dialog(), "Write the label set"));
    await settle();
    expect(e.of("POST", "/api/label-sets").map((c) => c.body)).toEqual([{ axis: "orientation", name: "gold-orientation", place: "partner-outbox" }]);
  });

  it("names the first export place when there are several and none is chosen, since the engine asks which", async () => {
    const e = await open([place(1, "exports"), place(2, "partner-outbox")], (c) => (c.method === "POST" && c.url === "/api/label-sets" ? { status: 201, body: SET } : undefined));
    await choose(dialog().querySelector<HTMLSelectElement>('select[aria-label="The axis"]')!, "body_part");
    click(button(dialog(), "Write the label set"));
    await settle();
    expect(e.of("POST", "/api/label-sets")[0].body).toEqual({ axis: "body_part", place: "exports" });
  });

  it("says what a sealed sample kept out, and the engine's refusal in place", async () => {
    let n = 0;
    await open([place(1, "exports")], (c) => {
      if (c.method !== "POST" || c.url !== "/api/label-sets") return undefined;
      return ++n === 1 ? { status: 409, body: { error: "no export place is declared, so labels have nowhere to go" } } : { status: 201, body: { ...SET, left_out_sealed: 12 } };
    });
    await choose(dialog().querySelector<HTMLSelectElement>('select[aria-label="The axis"]')!, "body_part");
    click(button(dialog(), "Write the label set"));
    await settle();
    expect(dialog().textContent).toContain("Refused: no export place is declared, so labels have nowhere to go.");
    expect(button(dialog(), "Write the label set")!.disabled).toBe(false);
    click(button(dialog(), "Write the label set"));
    await settle();
    expect(host.textContent).toContain("Wrote body_part v1: 1,204 rows. 12 labels were left out: their sample is sealed.");
  });

  it("asks for the axis to be typed where the pack cannot be read", async () => {
    const e = await open([place(1, "exports")], (c) => (c.url === "/api/packs/mri" ? { status: 403, body: { error: "no data:see" } } : c.method === "POST" && c.url === "/api/label-sets" ? { status: 201, body: SET } : undefined));
    expect(dialog().querySelector('select[aria-label="The axis"]')).toBeNull();
    await typeInto(dialog().querySelector<HTMLInputElement>('input[aria-label="The axis"]')!, "body_part");
    click(button(dialog(), "Write the label set"));
    await settle();
    expect(e.of("POST", "/api/label-sets")[0].body).toEqual({ axis: "body_part" });
  });
});
