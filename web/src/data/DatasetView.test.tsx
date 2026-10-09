// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One dataset, the whole page: the scans door read page after page for the
// tree, the first scan opened at once in the viewer with the tree's order
// for next and previous, the arrows walking the tree and opening what they
// land on, the names switched to BIDS's and back, a filter and the scans
// that need a look, the facts strip in words with Review, the pick result,
// and Esc back to Data.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import type { ScanRow } from "./scans";

vi.mock("./ScanViewer", () => ({
  markOpen: () => undefined,
  ScanViewer: ({ scans, at, onClose, bare }: { scans: { id: number; name: string }[]; at: number; onClose: () => void; bare?: boolean }) => (
    <div data-testid="viewer" data-bare={bare ? "1" : "0"} data-stack={scans[at].id} data-name={scans[at].name} data-order={scans.map((s) => s.id).join(",")}>
      <button type="button" aria-label="Close the scan" onClick={onClose} />
    </div>
  ),
}));

const { DatasetView } = await import("./DatasetView");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/datasets/{name}/scans", "GET /api/picks/summary"];
const caps = (grants: string[] = ["data:see"], doors: string[] = DOORS) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants, detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const row = (stack: number, subject: number, code: string, session: number, day: string, name: string, over: Partial<ScanRow> = {}): ScanRow => ({
  stack,
  subject: { id: subject, code },
  session: { id: session, label: day.replaceAll("-", "") },
  series_description: `desc ${stack}`,
  orientation: "AXIAL",
  images: 20,
  day,
  name,
  bids: `acq-${stack}_T1w`,
  datatype: "anat",
  folder: "anat",
  axes: { base: "T1w", technique: "MPRAGE" },
  series_number: stack,
  questions: [],
  ...over,
});
const PAGE1 = [
  row(11, 1, "a1", 7, "2026-01-02", "Sag_T1w_3D_MPRAGE"),
  row(12, 1, "a1", 7, "2026-01-02", "Ax_T2w_2D_FLAIR_TSE", { questions: ["body_part:low_confidence"], bids: null }),
];
const PAGE2 = [row(13, 2, "b2", 9, "2026-02-03", "Ax_DWI_2D_DWI-EPI_b1000", { datatype: "dwi", folder: "dwi", axes: { base: "DWI" } })];

describe("a dataset on the whole page", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: string[];
  let summary: unknown;
  beforeEach(() => {
    calls = [];
    summary = {};
    location.hash = "#data/datasets/ms-a";
    try {
      localStorage.clear();
    } catch {
      // none
    }
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url === "/api/datasets/ms-a/scans?limit=200") return new Response(JSON.stringify({ total: 3, scans: PAGE1, next: 12 }));
      if (url === "/api/datasets/ms-a/scans?limit=200&after=12") return new Response(JSON.stringify({ total: 3, scans: PAGE2, next: null }));
      if (url === "/api/datasets/empty/scans?limit=200") return new Response(JSON.stringify({ total: 0, scans: [], next: null }));
      if (url === "/api/picks/summary?dataset=ms-a") return new Response(JSON.stringify(summary));
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  };
  const viewer = () => el.querySelector("[data-testid=viewer]");
  const rowLabels = () => [...el.querySelectorAll(".dview-row .dview-name")].map((r) => r.textContent);
  const key = (target: Element | Window, k: string) =>
    act(() => {
      (target as EventTarget).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    });

  it("reads every page for the tree and opens the first scan at once, bare, next and previous in the tree's order", async () => {
    act(() => root.render(<DatasetView caps={caps()} name="ms-a" />));
    await settle();
    expect(calls.filter((c) => c.startsWith("/api/datasets/"))).toEqual(["/api/datasets/ms-a/scans?limit=200", "/api/datasets/ms-a/scans?limit=200&after=12"]);
    expect(viewer()?.getAttribute("data-stack")).toBe("11");
    expect(viewer()?.getAttribute("data-bare")).toBe("1");
    expect(viewer()?.getAttribute("data-order")).toBe("11,12,13");
    // the first scan's branches are open, the other subject folded
    expect(rowLabels()).toEqual(["sub-a1", "ses-20260102", "anat", "Sag_T1w_3D_MPRAGE", "Ax_T2w_2D_FLAIR_TSE", "sub-b2"]);
    // where it sits, as a BIDS path, and its name
    expect([...el.querySelectorAll(".dview-where > *")].map((x) => x.textContent)).toEqual(["sub-a1", "ses-20260102", "anat", "Sag_T1w_3D_MPRAGE"]);
    // the chosen scan alone is framed; the one that needs a look is marked apart
    const scans = [...el.querySelectorAll(".dview-row.scan")];
    expect(scans.map((s) => s.classList.contains("on"))).toEqual([true, false]);
    expect(scans.map((s) => s.classList.contains("look"))).toEqual([false, true]);
    expect(scans[0].getAttribute("data-slot")).toBeNull();
    // counts on the branches, the ones to look at apart
    const sub = el.querySelector(".dview-row.subject");
    expect([...(sub?.querySelectorAll(".dview-n") ?? [])].map((x) => x.textContent)).toEqual(["1", "2"]);
    expect(el.querySelector(".dview-looks")?.textContent).toBe("1 need a look");
    expect(el.querySelector(".dview-count")?.textContent).toContain("3 scans");
  });

  it("walks the tree with the arrows, opening each scan it lands on, and folds and unfolds", async () => {
    act(() => root.render(<DatasetView caps={caps()} name="ms-a" />));
    await settle();
    const tree = el.querySelector(".dview-tree")!;
    key(tree, "ArrowDown");
    expect(viewer()?.getAttribute("data-stack")).toBe("12");
    // the facts strip: what NILS says, the scanner's name, and the question with Review
    expect(el.querySelector(".dview-values")?.textContent).toContain("T1w");
    expect(el.querySelector(".dview-scanner")?.textContent).toBe("desc 12");
    expect(el.querySelector(".dview-ask")?.textContent).toContain("Needs a look: body part, low confidence");
    expect(el.querySelector(".dview-ask a")?.getAttribute("href")).toBe("#review?dataset=ms-a");
    key(tree, "ArrowDown");
    // onto the folded subject: nothing opens, the viewer stays
    expect(viewer()?.getAttribute("data-stack")).toBe("12");
    key(tree, "ArrowRight");
    expect(rowLabels()).toContain("ses-20260203");
    key(tree, "ArrowRight");
    key(tree, "ArrowRight");
    key(tree, "ArrowRight");
    key(tree, "ArrowRight");
    key(tree, "ArrowDown");
    expect(viewer()?.getAttribute("data-stack")).toBe("13");
    expect([...el.querySelectorAll(".dview-where > *")].map((x) => x.textContent)).toEqual(["sub-b2", "ses-20260203", "dwi", "Ax_DWI_2D_DWI-EPI_b1000"]);
    // left goes to the parent, left again folds it
    key(tree, "ArrowLeft");
    key(tree, "ArrowLeft");
    expect(rowLabels()).not.toContain("Ax_DWI_2D_DWI-EPI_b1000");
  });

  it("switches the names to BIDS's and back, by the toggle and by n, and remembers", async () => {
    act(() => root.render(<DatasetView caps={caps()} name="ms-a" />));
    await settle();
    const bids = [...el.querySelectorAll<HTMLButtonElement>(".dview-names button")].find((b) => b.textContent === "BIDS")!;
    act(() => bids.click());
    // a scan BIDS has no name for keeps NILS's
    expect(rowLabels()).toEqual(["sub-a1", "ses-20260102", "anat", "acq-11_T1w", "Ax_T2w_2D_FLAIR_TSE", "sub-b2"]);
    expect(viewer()?.getAttribute("data-name")).toBe("acq-11_T1w");
    expect(localStorage.getItem("nils.dataset-view.names")).toBe("bids");
    key(window, "n");
    expect(rowLabels()[3]).toBe("Sag_T1w_3D_MPRAGE");
  });

  it("filters with every word and shows only the scans that need a look on a press", async () => {
    act(() => root.render(<DatasetView caps={caps()} name="ms-a" />));
    await settle();
    key(window, "/");
    const box = el.querySelector<HTMLInputElement>(".dview-filter")!;
    expect(document.activeElement).toBe(box);
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(box, "dwi");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rowLabels()).toEqual(["sub-b2", "ses-20260203", "dwi", "Ax_DWI_2D_DWI-EPI_b1000"]);
    expect(viewer()?.getAttribute("data-order")).toBe("13");
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(box, "");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => el.querySelector<HTMLButtonElement>(".dview-looks")!.click());
    expect(rowLabels()).toEqual(["sub-a1", "ses-20260102", "anat", "Ax_T2w_2D_FLAIR_TSE"]);
  });

  it("says the pick result a line a role", async () => {
    summary = { dataset: "ms-a", roles: { T1: { picked: 2, clear: 1, borders: { margin: 1 }, tied: 0, review_items: 1 } }, review_items: 1 };
    act(() => root.render(<DatasetView caps={caps()} name="ms-a" />));
    await settle();
    expect(el.querySelector(".pick-line span")?.textContent).toBe("T1: 2 picked · 1 clear · 1 border");
    expect(el.querySelector(".pick-line a")?.getAttribute("href")).toBe("#review/picks?dataset=ms-a");
  });

  it("goes back to Data on Esc, and from an empty dataset at once", async () => {
    act(() => root.render(<DatasetView caps={caps()} name="ms-a" />));
    await settle();
    act(() => el.querySelector<HTMLButtonElement>("[aria-label='Close the scan']")!.click());
    expect(location.hash).toBe("#data/datasets");
    expect(el.querySelector(".dview-back")?.getAttribute("href")).toBe("#data/datasets");
    act(() => root.render(<DatasetView caps={caps()} name="empty" />));
    location.hash = "#data/datasets/empty";
    await settle();
    expect(location.hash).toBe("#data/datasets");
  });

  it("is not drawn without Data reading or the scans door", async () => {
    act(() => root.render(<DatasetView caps={caps(["query:see"])} name="ms-a" />));
    await settle();
    expect(el.querySelector(".dview")).toBeNull();
    expect(calls).toEqual([]);
  });
});
