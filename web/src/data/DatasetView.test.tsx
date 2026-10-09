// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's browser: the tree read page after page and the scan
// the address names opened at once (read first from its visit), next and
// previous in the tree's order with the address following; the arrows
// walking the tree and opening what they land on; the names switched to
// BIDS's and back; a filter; what NILS says the scan is, in the bar below;
// g and Esc back to the grid at the scan's visit; the side's button; and a
// cohort's scans from the cohort's door.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanRow } from "./scans";

vi.mock("./ScanViewer", () => ({
  markOpen: () => undefined,
  ScanViewer: ({ scans, at, onClose, onAt, bare }: { scans: { id: number; name: string }[]; at: number; onClose: () => void; onAt: (i: number) => void; bare?: boolean }) => (
    <div data-testid="viewer" data-bare={bare ? "1" : "0"} data-stack={scans[at].id} data-name={scans[at].name} data-order={scans.map((s) => s.id).join(",")}>
      <button type="button" aria-label="Close the scan" onClick={onClose} />
      <button type="button" aria-label="Next scan" onClick={() => onAt(at + 1)} />
    </div>
  ),
}));

const { Browser } = await import("./DatasetView");
const { forgetHeld, parseView, viewHref } = await import("./viewer");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (stack: number, subject: number, code: string, session: number, day: string, name: string, over: Partial<ScanRow> = {}): ScanRow => ({
  stack,
  subject: { id: subject, code },
  session: { id: session, label: day.replaceAll("-", "") },
  study: session * 10,
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
  te: 87,
  tr: 3500,
  fa: 160,
  ...over,
});
const PAGE1 = [
  row(11, 1, "a1", 7, "2026-01-02", "Sag_T1w_3D_MPRAGE"),
  row(12, 1, "a1", 7, "2026-01-02", "Ax_T2w_2D_FLAIR_TSE", { questions: ["body_part:low_confidence"], bids: null }),
];
const PAGE2 = [row(13, 2, "b2", 9, "2026-02-03", "Ax_DWI_2D_DWI-EPI_b1000", { datatype: "dwi", folder: "dwi", axes: { base: "DWI" } })];

describe("the dataset viewer's browser", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: string[];
  let sections: number;
  beforeEach(() => {
    calls = [];
    sections = 0;
    forgetHeld();
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
      const json = (v: unknown) => new Response(JSON.stringify(v));
      if (url === "/api/datasets/ms-a/scans?limit=200") return json({ total: 3, scans: PAGE1, next: 12 });
      if (url === "/api/datasets/ms-a/scans?limit=200&after=12") return json({ total: 3, scans: PAGE2, next: null });
      if (url === "/api/datasets/ms-a/scans?session=9&limit=200") return json({ total: 1, scans: PAGE2, next: null });
      if (url === "/api/cohorts/ms/scans?limit=200") return json({ total: 1, scans: PAGE2, next: null });
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    for (let k = 0; k < 3; k++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
  };
  /** The browser at an address, drawn again as the address moves. */
  const draw = async (hash: string, scope: { kind: "dataset" | "cohort"; name: string } = { kind: "dataset", name: "ms-a" }, grid = true) => {
    location.hash = hash;
    await settle();
    const render = () => {
      const view = parseView(Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] ?? "")));
      root.render(
        <Browser
          scope={scope}
          view={view}
          grid={grid}
          onSections={() => (sections += 1)}
          go={(v, replace) => {
            const to = viewHref(scope, { ...view, ...v });
            if (replace) location.replace(to);
            else location.hash = to;
          }}
        />,
      );
    };
    window.onhashchange = () => act(render);
    act(render);
    await settle();
  };
  const viewer = () => el.querySelector("[data-testid=viewer]");
  const rowLabels = () => [...el.querySelectorAll(".dview-row .dview-name")].map((r) => r.textContent);
  const key = (target: Element | Window, k: string) =>
    act(() => {
      (target as EventTarget).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    });

  it("reads every page for the tree and opens the first scan at once, bare, the address following, next in the tree's order", async () => {
    await draw("#data/datasets/ms-a/view?mode=browser");
    expect(calls).toEqual(["/api/datasets/ms-a/scans?limit=200", "/api/datasets/ms-a/scans?limit=200&after=12"]);
    expect(viewer()?.getAttribute("data-stack")).toBe("11");
    expect(viewer()?.getAttribute("data-bare")).toBe("1");
    expect(viewer()?.getAttribute("data-order")).toBe("11,12,13");
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s7&scan=11");
    // the first scan's branches are open, the other subject folded
    expect(rowLabels()).toEqual(["sub-a1", "ses-20260102", "anat", "Sag_T1w_3D_MPRAGE", "Ax_T2w_2D_FLAIR_TSE", "sub-b2"]);
    // where it sits: the datasets, the dataset, then its BIDS path and its name
    expect([...el.querySelectorAll(".dview-where a")].map((a) => a.textContent)).toEqual(["Datasets", "ms-a"]);
    expect(el.querySelector(".dview-path")?.textContent).toBe("sub-a1 / ses-20260102 / anat /");
    expect(el.querySelector(".dview-where b")?.textContent).toBe("Sag_T1w_3D_MPRAGE");
    // the chosen scan alone is marked; the one that needs a look apart
    const scans = [...el.querySelectorAll(".dview-row.scan")];
    expect(scans.map((s) => s.classList.contains("on"))).toEqual([true, false]);
    expect(scans.map((s) => s.classList.contains("look"))).toEqual([false, true]);
    // counts on the branches, the ones to look at apart
    const sub = el.querySelector(".dview-row.subject");
    expect([...(sub?.querySelectorAll(".dview-n") ?? [])].map((x) => x.textContent)).toEqual(["1", "2"]);
    // what NILS says it is, its timing and the keys
    expect([...el.querySelectorAll(".dview-fact")].map((f) => f.textContent)).toEqual(["T1w", "MPRAGE", "axial"]);
    expect(el.querySelector(".dview-timing")?.textContent).toBe("TE 87 TR 3500 FA 160 · 20 images");
    expect(el.querySelector(".dview-keys")?.textContent).toBe("↑↓ images · ←→ scans · 3 three planes · g grid · Esc back");
    // next: the tree's order, the address following without a step of history
    act(() => el.querySelector<HTMLButtonElement>("[aria-label='Next scan']")!.click());
    await settle();
    expect(viewer()?.getAttribute("data-stack")).toBe("12");
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s7&scan=12");
    expect(el.querySelector("a.dview-fact.look")?.getAttribute("href")).toBe("#review?dataset=ms-a");
  });

  it("opens the scan the address names at once, read first from its visit", async () => {
    await draw("#data/datasets/ms-a/view?mode=browser&subject=2&visit=s9&scan=13");
    expect(calls[0]).toBe("/api/datasets/ms-a/scans?session=9&limit=200");
    expect(viewer()?.getAttribute("data-stack")).toBe("13");
    expect(rowLabels()).toContain("Ax_DWI_2D_DWI-EPI_b1000");
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=2&visit=s9&scan=13");
  });

  it("walks the tree with the arrows, opening each scan it lands on, and folds and unfolds", async () => {
    await draw("#data/datasets/ms-a/view?mode=browser");
    const tree = el.querySelector(".dview-tree")!;
    key(tree, "ArrowDown");
    await settle();
    expect(viewer()?.getAttribute("data-stack")).toBe("12");
    key(tree, "ArrowDown");
    // onto the folded subject: nothing opens, the viewer stays
    expect(viewer()?.getAttribute("data-stack")).toBe("12");
    key(tree, "ArrowRight");
    expect(rowLabels()).toContain("ses-20260203");
    for (let i = 0; i < 4; i++) key(tree, "ArrowRight");
    key(tree, "ArrowDown");
    await settle();
    expect(viewer()?.getAttribute("data-stack")).toBe("13");
    expect(el.querySelector(".dview-path")?.textContent).toBe("sub-b2 / ses-20260203 / dwi /");
    // left goes to the parent, left again folds it, and a folded datatype says its count
    key(tree, "ArrowLeft");
    key(tree, "ArrowLeft");
    expect(rowLabels()).not.toContain("Ax_DWI_2D_DWI-EPI_b1000");
    expect(rowLabels()).toContain("dwi · 1");
  });

  it("switches the names to BIDS's and back, by the switch and by n, and remembers", async () => {
    await draw("#data/datasets/ms-a/view?mode=browser");
    const bids = [...el.querySelectorAll<HTMLButtonElement>(".vw-switch.names button")].find((b) => b.textContent === "BIDS")!;
    act(() => bids.click());
    // a scan BIDS has no name for keeps NILS's
    expect(rowLabels()).toEqual(["sub-a1", "ses-20260102", "anat", "acq-11_T1w", "Ax_T2w_2D_FLAIR_TSE", "sub-b2"]);
    expect(viewer()?.getAttribute("data-name")).toBe("acq-11_T1w");
    expect(localStorage.getItem("nils.dataset-view.names")).toBe("bids");
    key(window, "n");
    expect(rowLabels()[3]).toBe("Sag_T1w_3D_MPRAGE");
  });

  it("filters with every word", async () => {
    await draw("#data/datasets/ms-a/view?mode=browser");
    key(window, "/");
    const box = el.querySelector<HTMLInputElement>(".dview-filter input")!;
    expect(document.activeElement).toBe(box);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, "dwi");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(rowLabels()).toEqual(["sub-b2", "ses-20260203", "dwi", "Ax_DWI_2D_DWI-EPI_b1000"]);
    expect(viewer()?.getAttribute("data-order")).toBe("13");
  });

  it("turns to the grid at the scan's visit, the cursor on it, by g and by Esc; the side's button opens the sections", async () => {
    await draw("#data/datasets/ms-a/view?mode=browser");
    key(window, "g");
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s7&scan=11");
    await draw("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s7&scan=12");
    act(() => el.querySelector<HTMLButtonElement>("[aria-label='Close the scan']")!.click());
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s7&scan=12");
    act(() => el.querySelector<HTMLButtonElement>(".dview-sections")!.click());
    expect(sections).toBe(1);
    // with the side open over the page, its Esc closes it and the browser stays
    const side = document.createElement("nav");
    side.className = "side open";
    document.body.appendChild(side);
    const at = location.hash;
    act(() => el.querySelector<HTMLButtonElement>("[aria-label='Close the scan']")!.click());
    expect(location.hash).toBe(at);
    side.remove();
    expect([...el.querySelectorAll(".vw-switch:not(.names) button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Grid", "false"],
      ["Browser", "true"],
    ]);
  });

  it("reads a cohort's scans from the cohort's door and has no grid where none is offered", async () => {
    await draw("#data/cohorts/ms/view?mode=browser", { kind: "cohort", name: "ms" }, false);
    expect(calls).toEqual(["/api/cohorts/ms/scans?limit=200"]);
    expect(viewer()?.getAttribute("data-stack")).toBe("13");
    expect([...el.querySelectorAll(".dview-where a")].map((a) => a.textContent)).toEqual(["Cohorts", "ms"]);
    expect(el.querySelector(".vw-switch:not(.names)")).toBeNull();
    expect(el.querySelector(".dview-keys")?.textContent).toBe("↑↓ images · ←→ scans · 3 three planes · Esc back");
  });
});
