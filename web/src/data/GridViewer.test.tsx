// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The grid's own viewer (2026-11-12): a scan's card opens it in the light
// viewer over its visit, by a click or Enter, the address still the grid's
// and the scan in it; next and previous walk the visit in the grid's order,
// a folded folder's scans too; Esc and the viewer's close come back to the
// cards with the cursor on the scan shown last; an address with a scan opens
// the viewer over the grid; the grid's keys are dead while it is open; and
// the browser stays one explicit turn away, by g from the cards or by
// Grid | Browser.

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { parse } from "../routes";
import type { Bitmap } from "./pictures";
import { framesBody, previewBody } from "./pictures.fixture";
import type { ScanRow } from "./scans";

vi.mock("../campaigns/StackView", () => ({
  StackView: ({ stack }: { stack: number }) => <div data-testid="three" data-stack={stack} />,
}));

// the shared picture store, with a reader and a decoder a test can answer
const shared = vi.hoisted(() => ({ store: null as unknown }));
vi.mock("./pictures", async (original) => {
  const real = await original<typeof import("./pictures")>();
  return { ...real, pictures: () => shared.store as InstanceType<typeof real.Pictures> };
});

const { Pictures } = await import("./pictures");
const { Viewer } = await import("./Viewer");
const { forgetHeld, lastAt, lastScanKey } = await import("./viewer");
const { forgetOrigins } = await import("./origins");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/datasets/{name}/scans", "GET /api/datasets/{name}/subjects", "GET /api/datasets/{name}/subjects/{subject}/visits"];
const caps = {
  engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors: DOORS, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid", display_name: "Astrid", grants: ["data:see"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

/** The shell's part: the viewer the address names, drawn again as the address moves. */
function Harness() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  if (route.sub !== "view" || !route.arg) return <div data-testid="away" />;
  return <Viewer key={route.arg} caps={caps} scope={{ kind: "dataset", name: route.arg }} query={route.query} onSections={() => undefined} />;
}

const row = (stack: number, name: string, over: Partial<ScanRow> = {}): ScanRow => ({
  stack,
  subject: { id: 1, code: "sub-a1" },
  session: { id: 34, label: "20190913" },
  study: 5,
  series_description: `desc ${stack}`,
  orientation: "AXIAL",
  images: 9,
  day: "2019-09-13",
  name,
  bids: `acq-${stack}_T1w`,
  datatype: "anat",
  folder: "anat",
  axes: { base: "T1w" },
  series_number: stack,
  questions: [],
  family: "plain",
  te: 2.26,
  tr: 2300,
  ti: 900,
  fa: 8,
  main: [],
  picture: null,
  ...over,
});
// one visit: four scans under anat in three families, one under dwi, and a localizer under other, which opens folded
const VISIT = [
  row(11, "Sag_T1w_3D_MPRAGE", { main: ["t1w"] }),
  row(12, "Ax_T1w_3D_MPRAGE_ce", { axes: { base: "T1w", post_contrast: "1" } }),
  row(13, "Ax_T2w_2D_MDME_Synthetic", { family: "symri", axes: { base: "T2w", provenance: "SyMRI" } }),
  row(14, "SC_Sag_T2w_2D_STIR", { family: "body", axes: { base: "T2w", body_part: "spine" } }),
  row(15, "Ax_DWI_2D_EPI_b1000", { datatype: "dwi", folder: "dwi", axes: { base: "DWI" } }),
  row(16, "Localizer", { datatype: "other", folder: "localizer", axes: { disposition: "scout" } }),
];
const SUBJECTS = {
  scope: { kind: "dataset", name: "ms-a", id: 7 },
  detail: "quasi",
  show: "code",
  order: "code",
  totals: { subjects: 1, visits: 2, scans: 7, look: 0 },
  matched: 1,
  count: 1,
  subjects: [{ id: 1, code: "sub-a1", label: "sub-a1", visits: 2, scans: 7, look: 0, regions: ["brain"], makers: ["GE"], main: ["t1w"] }],
  next: null,
  facets: { makers: [], regions: [], roles: [], id_types: [] },
};
const visit = (session: number, label: string, number: number) => ({ session, studies: [session], label, first: "2019-09-13", day: "0", number, scans: 6, look: 0, regions: ["brain"], kinds: [{ kind: "T1w", scans: 2 }], contrast: false, symri: 0, main: [] });
const VISITS = {
  scope: { kind: "dataset", name: "ms-a", id: 7 },
  detail: "quasi",
  name: "date",
  subject: { id: 1, code: "sub-a1", label: "sub-a1" },
  totals: { visits: 2, scans: 7, look: 0, span: "30" },
  matched: 2,
  visits: [visit(34, "ses-20190913", 1), visit(35, "ses-20191013", 2)],
};

const AT_34 = "#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34";

describe("the grid's own viewer", () => {
  let root: Root;
  let el: HTMLDivElement;
  let scrolled: Element[];
  const scrollWas = Element.prototype.scrollIntoView;

  beforeEach(() => {
    forgetHeld();
    forgetOrigins();
    try {
      localStorage.clear();
    } catch {
      // none
    }
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    scrolled = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    const json = (v: unknown) => new Response(JSON.stringify(v));
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url, "http://desk");
      if (u.pathname === "/api/datasets/ms-a/subjects") return json(SUBJECTS);
      if (u.pathname === "/api/datasets/ms-a/subjects/1/visits") return json(VISITS);
      if (u.pathname === "/api/datasets/ms-a/scans") {
        if (u.searchParams.get("session") === "35") return json({ total: 1, scans: [row(21, "Ax_T2w_2D_TSE", { session: { id: 35, label: "20191013" } })], next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
        return json({ total: VISIT.length, scans: VISIT, next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
      }
      return new Response("{}", { status: 404 });
    });
    const fetcher = async (url: string) => {
      const pv = /^\/api\/instances\/(\d+)\/preview$/.exec(url);
      if (pv) return new Response(JSON.stringify(previewBody(9, { axial: `data:preview-${pv[1]}` }, { spacing: [2, 1, 1] })));
      const pl = /^\/api\/instances\/(\d+)\/preview\/planes\?from=(\d+)&to=(\d+)$/.exec(url);
      if (pl) {
        const frames = [];
        for (let z = Number(pl[2]); z < Number(pl[3]); z++) frames.push({ plane: z, bytes: new Uint8Array([Number(pl[1]), z]) });
        return new Response(framesBody(frames));
      }
      return new Response("{}", { status: 404 });
    };
    shared.store = new Pictures(fetcher, async () => ({ width: 64, height: 64 }) as Bitmap);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          fillRect: () => undefined,
          clearRect: () => undefined,
          drawImage: () => undefined,
          set fillStyle(_: string) {},
          set imageSmoothingEnabled(_: boolean) {},
        }) as unknown as CanvasRenderingContext2D,
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    Element.prototype.scrollIntoView = scrollWas;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const settle = async () => {
    for (let k = 0; k < 4; k++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
  };
  const open = async (hash: string) => {
    location.hash = hash;
    await settle();
    act(() => root.render(<Harness />));
    await settle();
  };
  const key = async (k: string, more: KeyboardEventInit = {}) => {
    act(() => {
      (document.activeElement ?? window).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...more }));
    });
    await settle();
  };
  const blur = () => act(() => (document.activeElement as HTMLElement | null)?.blur());
  const cardOf = (name: string) => [...el.querySelectorAll<HTMLAnchorElement>(".vw-card.vw-scan")].find((c) => c.querySelector(".vw-scan-name")?.textContent === name)!;
  const click = async (target: Element) => {
    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle();
  };
  const shown = () => el.querySelector(".scan-view")?.getAttribute("data-stack") ?? null;
  const cards = () => el.querySelectorAll(".vw-card.vw-scan").length;

  it("opens a scan's card in the light viewer by a click, the address still the grid's with the scan in it", async () => {
    await open(AT_34);
    const steps = history.length;
    expect(cardOf("Ax_T1w_3D_MPRAGE_ce").getAttribute("href")).toBe(`${AT_34}&scan=12`);
    await click(cardOf("Ax_T1w_3D_MPRAGE_ce"));
    expect(location.hash).toBe(`${AT_34}&scan=12`);
    expect(history.length).toBe(steps + 1);
    // the light viewer with its own head, over the visit: no cards, and not the browser
    expect(shown()).toBe("12");
    expect(el.querySelector(".scan-view.bare")).toBeNull();
    expect(el.querySelector(".scan-view-name")?.textContent).toContain("Ax_T1w_3D_MPRAGE_ce");
    expect(cards()).toBe(0);
    expect(el.querySelector(".dview")).toBeNull();
    expect(el.querySelector(".vw-switch [aria-pressed='true']")?.textContent).toBe("Grid");
    // the visit in the crumbs leads back to its cards
    expect([...el.querySelectorAll(".vw-crumbs a")].pop()?.getAttribute("href")).toBe(AT_34);
    expect(el.querySelector(".vw-foot")?.textContent).toBe("↑ ↓ images · ← → scans · 3 three planes · Esc back to the scans");
    // the open is marked, so the viewer times its pictures from the click
    expect(el.querySelector(".scan-view")?.getAttribute("data-first-ms")).not.toBeNull();
  });

  it("opens the scan at the cursor on Enter", async () => {
    await open(AT_34);
    expect(el.querySelector(".vw-foot")?.textContent).toBe("Arrows move · Enter opens · g Browser · Alt ← → visits · Esc back to the visits");
    await key("ArrowRight");
    blur();
    await key("Enter");
    expect(location.hash).toBe(`${AT_34}&scan=12`);
    expect(shown()).toBe("12");
    expect(el.querySelector(".dview")).toBeNull();
  });

  it("walks the visit in the grid's order by next and previous, a folded folder's scans too, with no step of history", async () => {
    await open(AT_34);
    // the order the grid shows: anat by family, then dwi; the localizer's folder is folded
    expect([...el.querySelectorAll(".vw-scan-name")].map((x) => x.textContent)).toEqual(["Sag_T1w_3D_MPRAGE", "Ax_T1w_3D_MPRAGE_ce", "Ax_T2w_2D_MDME_Synthetic", "SC_Sag_T2w_2D_STIR", "Ax_DWI_2D_EPI_b1000"]);
    await click(cardOf("Ax_T2w_2D_MDME_Synthetic"));
    const steps = history.length;
    const seen = [shown()];
    for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"]) {
      await key(k);
      seen.push(shown());
    }
    // past the last scan there is none: the walk stops on the folded folder's localizer
    expect(seen).toEqual(["13", "14", "15", "16", "16"]);
    expect(location.hash).toBe(`${AT_34}&scan=16`);
    expect(el.querySelector<HTMLButtonElement>("[aria-label='Next scan']")!.disabled).toBe(true);
    await click(el.querySelector("[aria-label='Previous scan']")!);
    expect(shown()).toBe("15");
    await key("ArrowLeft");
    await key("ArrowLeft");
    await key("ArrowLeft");
    await key("ArrowLeft");
    await key("ArrowLeft");
    expect(shown()).toBe("11");
    expect(location.hash).toBe(`${AT_34}&scan=11`);
    expect(el.querySelector<HTMLButtonElement>("[aria-label='Previous scan']")!.disabled).toBe(true);
    expect(history.length).toBe(steps);
  });

  it("comes back to the cards on Esc with the cursor on the scan shown last, its folder unfolded and its card in view", async () => {
    await open(AT_34);
    await click(cardOf("Ax_DWI_2D_EPI_b1000"));
    const steps = history.length;
    await key("ArrowRight");
    expect(shown()).toBe("16");
    scrolled = [];
    await key("Escape");
    await settle();
    expect(location.hash).toBe(AT_34);
    // back, not forward: closing adds no step
    expect(history.length).toBe(steps);
    expect(shown()).toBeNull();
    expect([...el.querySelectorAll(".vw-folder-head")].map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "true", "true"]);
    const at = el.querySelector(".vw-scan.at");
    expect(at?.querySelector(".vw-scan-name")?.textContent).toBe("Localizer");
    expect(document.activeElement).toBe(at);
    expect(scrolled).toContain(at);
    expect(lastAt(lastScanKey({ kind: "dataset", name: "ms-a" }, "s34"))).toBe("16");
  });

  it("comes back the same way by the viewer's close", async () => {
    await open(AT_34);
    await click(cardOf("Sag_T1w_3D_MPRAGE"));
    await key("ArrowRight");
    await click(el.querySelector("[aria-label='Close the scan']")!);
    await settle();
    expect(location.hash).toBe(AT_34);
    expect(el.querySelector(".vw-scan.at .vw-scan-name")?.textContent).toBe("Ax_T1w_3D_MPRAGE_ce");
  });

  it("opens the viewer over the grid at an address with a scan, as a reload or a link does, and Esc leads to the cards", async () => {
    await open(`${AT_34}&scan=14`);
    expect(shown()).toBe("14");
    expect(cards()).toBe(0);
    expect(el.querySelector(".dview")).toBeNull();
    await key("Escape");
    await settle();
    expect(location.hash).toBe(AT_34);
    expect(el.querySelector(".vw-scan.at .vw-scan-name")?.textContent).toBe("SC_Sag_T2w_2D_STIR");
  });

  it("shows the visit's cards where the address names a scan the visit does not hold", async () => {
    await open(`${AT_34}&scan=999`);
    expect(location.hash).toBe(AT_34);
    expect(shown()).toBeNull();
    expect(cards()).toBe(5);
  });

  it("keeps the grid's keys dead while the viewer is open", async () => {
    await open(AT_34);
    await click(cardOf("Ax_T1w_3D_MPRAGE_ce"));
    const here = `${AT_34}&scan=12`;
    for (const [k, more] of [["g", {}], ["/", {}], ["n", {}], ["Enter", {}], ["ArrowRight", { altKey: true }], ["ArrowLeft", { altKey: true }]] as [string, KeyboardEventInit][]) {
      blur();
      await key(k, more);
      expect(location.hash).toBe(here);
      expect(shown()).toBe("12");
    }
    // and the viewer's own keys reach it alone: one scan on, not a cursor moved beneath it
    blur();
    await key("ArrowRight");
    expect(location.hash).toBe(`${AT_34}&scan=13`);
    await key("3");
    expect(el.querySelector("[data-testid=three]")?.getAttribute("data-stack")).toBe("13");
  });

  it("turns to the browser by g from the cards, and by Grid | Browser from the open viewer at the scan shown", async () => {
    await open(AT_34);
    await key("ArrowRight");
    blur();
    await key("g");
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s34&scan=12");
    expect(el.querySelector(".dview")).not.toBeNull();
    // from the open viewer: the switch, at the scan it shows
    await open(AT_34);
    await click(cardOf("Ax_DWI_2D_EPI_b1000"));
    await key("ArrowLeft");
    expect(shown()).toBe("14");
    await click([...el.querySelectorAll<HTMLButtonElement>(".vw-switch button")].find((b) => b.textContent === "Browser")!);
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s34&scan=14");
    expect(el.querySelector(".dview")).not.toBeNull();
    // and the browser's way back is the visit's cards, the cursor on that scan, never the grid's viewer
    await key("g");
    await settle();
    expect(location.hash).toBe(AT_34);
    expect(shown()).toBeNull();
    expect(el.querySelector(".vw-scan.at .vw-scan-name")?.textContent).toBe("SC_Sag_T2w_2D_STIR");
  });
});
