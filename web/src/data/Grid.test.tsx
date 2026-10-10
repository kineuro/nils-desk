// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's grid: the subjects as folders with no pictures, found
// by a search held in memory and filter toggles that the address keeps; one subject's visits
// with their kinds, main scans and a line in time, and the subjects around;
// one visit's scans in folders by datatype that fold, each family outlined in
// its colour, coloured by contrast on a choice; the keyboard (arrows, Enter,
// Esc up a level, / and g); a cohort over its members; and the browser alone
// where the engine has no subjects door.

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { parse } from "../routes";
import type { ScanRow } from "./scans";

vi.mock("./ScanViewer", () => ({
  markOpen: () => undefined,
  ScanViewer: ({ scans, at }: { scans: { id: number }[]; at: number }) => <div data-testid="viewer" data-stack={scans[at].id} />,
}));

const { Viewer } = await import("./Viewer");
const { forgetHeld } = await import("./viewer");
const { PICTURE_POLL } = await import("./Grid");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALL_DOORS = [
  "GET /api/datasets/{name}/scans",
  "GET /api/datasets/{name}/subjects",
  "GET /api/datasets/{name}/subjects/{subject}/visits",
  "GET /api/cohorts/{name}/scans",
  "GET /api/cohorts/{name}/subjects",
  "GET /api/cohorts/{name}/subjects/{subject}/visits",
];
const caps = (doors: string[] = ALL_DOORS) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: ["data:see"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

/** The shell's part: the viewer the address names, drawn again as the address moves. */
function Harness({ caps }: { caps: Capabilities }) {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  if (route.sub !== "view" || !route.arg) return <div data-testid="away" />;
  const scope = { kind: route.page === "cohorts" ? ("cohort" as const) : ("dataset" as const), name: route.arg };
  return <Viewer key={`${scope.kind}/${scope.name}`} caps={caps} scope={scope} query={route.query} onSections={() => undefined} />;
}

const subject = (id: number, code: string, over: Record<string, unknown> = {}) => ({ id, code, label: code, visits: 1, scans: 5, look: 0, regions: ["brain"], makers: ["GE"], main: ["t1w", "flair"], ...over });
const SUBJECTS = [
  subject(1, "sub-a1", { visits: 2, scans: 19, look: 3, regions: ["brain", "spine"], makers: ["Siemens"], main: ["t1w"] }),
  subject(2, "sub-b2"),
  subject(3, "sub-c3", { scans: 6 }),
];
const page = (subjects: unknown[], over: Record<string, unknown> = {}) => ({
  scope: { kind: "dataset", name: "ms-a", id: 7 },
  detail: "quasi",
  show: "code",
  order: "look",
  totals: { subjects: 3, visits: 4, scans: 30, look: 3 },
  matched: subjects.length,
  count: subjects.length,
  subjects,
  next: null,
  facets: { makers: [{ name: "Siemens", subjects: 1 }, { name: "GE", subjects: 2 }], regions: [{ name: "brain", subjects: 3 }], roles: [{ name: "t1w", subjects: 3 }, { name: "flair", subjects: 2 }], id_types: [{ name: "study-id", subjects: 3 }] },
  ...over,
});
const VISITS = {
  scope: { kind: "dataset", name: "ms-a", id: 7 },
  detail: "quasi",
  name: "date",
  subject: { id: 1, code: "sub-a1", label: "sub-a1" },
  totals: { visits: 2, scans: 19, look: 3, span: "418" },
  matched: 2,
  visits: [
    { session: 34, studies: [5], label: "ses-20190913", first: "2019-09-13", day: "0", number: 1, scans: 13, look: 3, regions: ["brain", "spine"], kinds: [{ kind: "T1w", scans: 3 }, { kind: "FLAIR", scans: 2 }], contrast: true, symri: 4, main: [{ role: "t1w", stack: 11, name: "Sag_T1w_3D_MPRAGE" }] },
    { session: null, studies: [7, 8], label: "ses-20201104", first: "2020-11-04", day: "418", number: 2, scans: 6, look: 0, regions: ["brain"], kinds: [{ kind: "T2w", scans: 1 }], contrast: false, symri: 0, main: [] },
  ],
};
const row = (stack: number, name: string, over: Partial<ScanRow> = {}): ScanRow => ({
  stack,
  subject: { id: 1, code: "sub-a1" },
  session: { id: 34, label: "20190913" },
  study: 5,
  series_description: `desc ${stack}`,
  orientation: "AXIAL",
  images: 176,
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
const VISIT_SCANS = [
  row(11, "Sag_T1w_3D_MPRAGE", { main: ["t1w"], picture: { data: "data:image/jpeg;base64,AAAA", width: 256, height: 256, digest: null, held: false } }),
  row(12, "Ax_T1w_3D_MPRAGE_ce", { axes: { base: "T1w", post_contrast: "1" }, series_number: 12 }),
  row(13, "Ax_T2w_2D_MDME_Synthetic", { family: "symri", axes: { base: "T2w", provenance: "SyMRI" }, bids: null, te: null, tr: null, ti: null, fa: null }),
  row(14, "SC_Sag_T2w_2D_STIR", { family: "body", axes: { base: "T2w", body_part: "spine" }, questions: ["base:missing"], images: 13 }),
  row(15, "Ax_DWI_2D_EPI_b1000", { datatype: "dwi", folder: "dwi", axes: { base: "DWI" } }),
  row(16, "Localizer", { datatype: "other", folder: "localizer", axes: { disposition: "scout" } }),
];

const SUBJECT2_SCAN = row(31, "Ax_FLAIR_2D_TSE", { subject: { id: 2, code: "sub-b2" }, session: { id: 40, label: "20210101" }, study: 9 });

describe("the dataset viewer's grid", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: string[];
  let detail: string;
  beforeEach(() => {
    calls = [];
    detail = "quasi";
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
      const u = new URL(url, "http://desk");
      const q = u.searchParams;
      const json = (v: unknown) => new Response(JSON.stringify(v));
      if (u.pathname === "/api/datasets/ms-a/subjects" || u.pathname === "/api/cohorts/ms/subjects") {
        let list = SUBJECTS;
        if ((q.get("filter") ?? "").includes("look")) list = list.filter((s) => (s.look as number) > 0);
        const text = q.get("q");
        if (text) list = list.filter((s) => (s.code as string).includes(text));
        return json(page(list, { detail }));
      }
      if (/^\/api\/(datasets\/ms-a|cohorts\/ms)\/subjects\/\d+\/visits$/.test(u.pathname)) {
        const id = Number(u.pathname.split("/")[5]);
        if (id === 2) return json({ ...VISITS, detail, subject: { id: 2, code: "sub-b2", label: "sub-b2" }, totals: { visits: 1, scans: 1, look: 0, span: "0" }, matched: 1, visits: [{ ...VISITS.visits[0], session: 40, studies: [9], label: "ses-20210101", look: 0, main: [] }] });
        const v = (q.get("filter") ?? "").includes("contrast") ? { ...VISITS, matched: 1, visits: VISITS.visits.slice(0, 1) } : VISITS;
        return json({ ...v, detail, subject: { id, code: `sub-${id}`, label: id === 1 ? "sub-a1" : `sub-${id}` }, totals: { ...v.totals, span: detail === "plain" ? "999" : "418" } });
      }
      if (u.pathname === "/api/datasets/ms-a/scans") {
        if (q.get("session") === "34") return json({ total: VISIT_SCANS.length, scans: VISIT_SCANS, next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
        if (q.get("session") === "60") return json({ total: 2, scans: [row(31, "Ax_T2w_2D", { session: { id: 60, label: "20200202" } }), row(32, "Ax_FLAIR_2D", { session: { id: 60, label: "20200202" } })], next: null, pictures: { shown: true, why: null, missing: 2, partial: 0 } });
        if (q.get("session") === "50") {
          // a visit of 250 scans, one image a stack: two pages
          const all = Array.from({ length: 250 }, (_, i) => row(1000 + i, `Sag_CSF_flow_frame_${i}`, { session: { id: 50, label: "20200101" }, images: 1 }));
          const after = Number(q.get("after") ?? 0);
          const from = after === 0 ? 0 : all.findIndex((r) => r.stack === after) + 1;
          const part = all.slice(from, from + 200);
          return json({ total: 250, scans: part, next: from + 200 < 250 ? part[part.length - 1].stack : null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
        }
        if (q.get("session") === "40") return json({ total: 1, scans: [SUBJECT2_SCAN], next: null });
        if (q.get("studies") === "7,8") return json({ total: 1, scans: [row(21, "Ax_T2w_2D_TSE", { session: null, study: 7 })], next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
        return json({ total: VISIT_SCANS.length + 1, scans: [...VISIT_SCANS, SUBJECT2_SCAN], next: null });
      }
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const settle = async () => {
    for (let k = 0; k < 4; k++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
  };
  const open = async (hash: string, c: Capabilities = caps()) => {
    location.hash = hash;
    await settle();
    act(() => root.render(<Harness caps={c} />));
    await settle();
  };
  const key = (k: string, more: KeyboardEventInit = {}) =>
    act(() => {
      (document.activeElement ?? window).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...more }));
    });
  const text = (sel: string) => [...el.querySelectorAll(sel)].map((x) => x.textContent);
  const asked = (path: string) => calls.filter((c) => c.startsWith(path));

  it("shows the subjects as folders with their counts, their facts and what to look at, and no pictures", async () => {
    await open("#data/datasets/ms-a/view");
    expect(asked("/api/datasets/ms-a/subjects")).toEqual(["/api/datasets/ms-a/subjects?limit=60&order=look&show=code"]);
    expect(el.querySelector(".vw-title h1")?.textContent).toBe("ms-a");
    expect(el.querySelector(".vw-title .vw-sum")?.textContent).toBe("3 subjects · 4 visits · 30 scans · 3 need a look");
    expect(text(".vw-card .vw-card-name")).toEqual(["sub-a1", "sub-b2", "sub-c3"]);
    expect(text(".vw-card .vw-tag.look")).toEqual(["3"]);
    expect(text(".vw-card .vw-card-meta")[0]).toBe("2 visits · 19 scans");
    expect(text(".vw-card .vw-card-facts")).toEqual(["brain, spine · Siemens · no FLAIR main", "brain · GE", "brain · GE"]);
    expect(el.querySelectorAll("img").length).toBe(0);
    // the filters offered: the ones with words, then the makers present
    expect(text(".vw-filters .vw-chip")).toEqual(["with scans to look at", "more than one visit", "with a main T1w", "with a main FLAIR", "brain", "spine", "Siemens", "GE"]);
    expect(text("#vw-show option")).toEqual(["Subject code", "Study ID"]);
    expect(el.querySelector(".vw-foot")?.textContent).toBe("3 of 3 subjects · Enter opens · / searches");
    // where: the datasets, then this one; Grid is the view shown
    expect(text(".vw-crumbs a")).toEqual(["Datasets"]);
    expect(el.querySelector(".vw-switch [aria-pressed='true']")?.textContent).toBe("Grid");
  });

  it("asks again for a filter or a search, the address keeping the filter and never the search, and Clear lets them go", async () => {
    await open("#data/datasets/ms-a/view");
    const chip = [...el.querySelectorAll<HTMLButtonElement>(".vw-chip")].find((b) => b.textContent === "with scans to look at")!;
    act(() => chip.click());
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&filter=look");
    expect(asked("/api/datasets/ms-a/subjects").pop()).toBe("/api/datasets/ms-a/subjects?limit=60&order=look&show=code&filter=look");
    expect(text(".vw-card .vw-card-name")).toEqual(["sub-a1"]);
    expect(el.querySelector(".vw-foot")?.textContent).toBe("1 of the 1 subject with scans to look at · Enter opens · / searches");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    act(() => el.querySelector<HTMLButtonElement>(".vw-clear")!.click());
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid");
    // / searches, and the search asks after a pause
    key("/");
    const box = el.querySelector<HTMLInputElement>(".vw-search input")!;
    expect(document.activeElement).toBe(box);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, "b2");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await settle();
    // the search is held in memory, never in the address: what is typed can be an identifier
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid");
    expect(asked("/api/datasets/ms-a/subjects").pop()).toBe("/api/datasets/ms-a/subjects?limit=60&order=look&show=code&q=b2");
    expect(text(".vw-card .vw-card-name")).toEqual(["sub-b2"]);
    // Esc in the search clears it first
    key("Escape");
    expect(box.value).toBe("");
  });

  it("moves the cursor with the arrows, opens a subject on Enter and goes back up on Esc to where it was", async () => {
    await open("#data/datasets/ms-a/view");
    const cards = () => [...el.querySelectorAll(".vw-card")];
    expect(cards().map((c) => c.classList.contains("at"))).toEqual([true, false, false]);
    key("ArrowRight");
    expect(cards().map((c) => c.classList.contains("at"))).toEqual([false, true, false]);
    expect(document.activeElement).toBe(cards()[1]);
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    key("Enter");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=2");
    expect(asked("/api/datasets/ms-a/subjects/2/visits")).toEqual(["/api/datasets/ms-a/subjects/2/visits?name=date&show=code"]);
    // up a level: the step down is taken back, the subjects shown at once with the cursor where it was
    const before = asked("/api/datasets/ms-a/subjects?").length;
    key("Escape");
    await settle();
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view");
    expect(asked("/api/datasets/ms-a/subjects?").length).toBe(before);
    expect(cards().map((c) => c.classList.contains("at"))).toEqual([false, true, false]);
    // and from the subjects to the dataset itself
    key("Escape");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a");
  });

  it("shows one subject's visits with their kinds, main scans and days, a line in time, and the subjects around", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=1");
    expect(el.querySelector(".vw-title h1")?.textContent).toBe("sub-a1");
    expect(el.querySelector(".vw-title .vw-sum")?.textContent).toBe("2 visits over 14 months · 19 scans · 3 need a look");
    expect(text(".vw-crumbs a")).toEqual(["Datasets", "ms-a"]);
    expect(text(".vw-card .vw-card-name")).toEqual(["ses-20190913", "ses-20201104"]);
    expect(text(".vw-card .vw-tag.look")).toEqual(["3 to look at"]);
    expect(text(".vw-card .vw-visit-line")[0]).toBe("day 0·13 scansbrainspine");
    expect(text(".vw-card .vw-card-meta")).toEqual(["T1w 3 · FLAIR 2 · with contrast", "T2w 1"]);
    expect(text(".vw-card .vw-card-facts")).toEqual(["Main: T1w 3D", "Main: none picked"]);
    expect(el.querySelectorAll("img").length).toBe(0);
    // the visits in time: a dot each, as far apart as their days
    const dots = [...el.querySelectorAll<HTMLElement>(".vw-dot")];
    expect(dots.map((d) => d.style.left)).toEqual(["0%", "100%"]);
    expect(text(".vw-time-day")).toEqual(["day 0", "day 418"]);
    // the cards open their visit; the visit without a session by its studies
    expect([...el.querySelectorAll(".vw-card")].map((a) => a.getAttribute("href"))).toEqual([
      "#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34",
      "#data/datasets/ms-a/view?mode=grid&subject=1&visit=t7.8",
    ]);
    // the subjects around, in the order of the subjects page
    expect(text(".vw-near a")).toEqual(["Next subject"]);
    key("ArrowRight");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=2");
    // a filter of the visits, kept in the address
    const chip = [...el.querySelectorAll<HTMLButtonElement>(".vw-chip")].find((b) => b.textContent === "with contrast")!;
    act(() => chip.click());
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=2&vfilter=contrast");
    expect(asked("/api/datasets/ms-a/subjects/2/visits").pop()).toBe("/api/datasets/ms-a/subjects/2/visits?name=date&show=code&filter=contrast");
  });

  it("says no day and no span where the engine answers them as shapes", async () => {
    detail = "plain";
    await open("#data/datasets/ms-a/view?mode=grid&subject=1");
    expect(el.querySelector(".vw-title .vw-sum")?.textContent).toBe("2 visits · 19 scans · 3 need a look");
    expect(text(".vw-card .vw-visit-line")[0]).toBe("13 scansbrainspine");
    expect(text(".vw-time-day")).toEqual([]);
  });

  it("shows one visit's scans in folders by datatype that fold, each family outlined in its colour, with pictures, main and look", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34");
    expect(asked("/api/datasets/ms-a/scans")).toEqual(["/api/datasets/ms-a/scans?session=34&limit=200&pictures=1"]);
    expect(el.querySelector(".vw-title h1")?.textContent).toBe("ses-20190913");
    expect(el.querySelector(".vw-title .vw-sum")?.textContent).toBe("day 0 · 6 scans · 1 need a look");
    expect(text(".vw-crumbs a")).toEqual(["Datasets", "ms-a", "sub-a1"]);
    // the folders, the scouts folded
    expect(text(".vw-folder-name")).toEqual(["anat", "dwi", "scouts and other"]);
    expect([...el.querySelectorAll(".vw-folder-head")].map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "true", "false"]);
    expect(text(".vw-folder-head .vw-sum")).toEqual(["1 main · 1 to look at", "", "folded"]);
    // the plain scans first, then each family outlined in its colour
    expect(text(".vw-family-name")).toEqual(["SyMRI", "Spine and neck"]);
    expect([...el.querySelectorAll(".vw-family")].map((f) => f.getAttribute("data-slot"))).toEqual(["7", "3"]);
    expect(text(".vw-scan .vw-scan-name")).toEqual(["Sag_T1w_3D_MPRAGE", "Ax_T1w_3D_MPRAGE_ce", "Ax_T2w_2D_MDME_Synthetic", "SC_Sag_T2w_2D_STIR", "Ax_DWI_2D_EPI_b1000"]);
    const first = el.querySelector(".vw-scan")!;
    expect(first.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(first.querySelector(".vw-tag.main")?.textContent).toBe("main");
    expect(first.querySelector(".vw-slices")?.textContent).toBe("176");
    expect(first.querySelector(".vw-scan-params")?.textContent).toBe("TE 2.3 TR 2300 TI 900 FA 8");
    expect(text(".vw-scan .vw-tag.look")).toEqual(["look"]);
    // a card opens the browser at that scan
    expect(first.getAttribute("href")).toBe("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s34&scan=11");
    // the scouts unfold
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".vw-folder-head")][2].click());
    expect(text(".vw-scan .vw-scan-name")).toContain("Localizer");
    // coloured by contrast: no family frame, a frame on each card whose contrast is known, and the legend
    const colour = el.querySelector<HTMLSelectElement>("#vw-colour")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(colour, "contrast");
      colour.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect([...el.querySelectorAll(".vw-family")].map((f) => f.getAttribute("data-slot"))).toEqual([null, null]);
    expect([...el.querySelectorAll(".vw-scan")].map((c) => c.getAttribute("data-slot"))[1]).toBe("2");
    expect(text(".vw-legend span")).toEqual(["contrast"]);
    expect(localStorage.getItem("nils.viewer.colour")).toBe("contrast");
    // the names by BIDS where a scan has one
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".vw-switch.names button")].find((b) => b.textContent === "BIDS")!.click());
    expect(text(".vw-scan .vw-scan-name").slice(0, 3)).toEqual(["acq-11_T1w", "acq-12_T1w", "Ax_T2w_2D_MDME_Synthetic"]);
  });

  it("stops saying a picture is being made once it stops asking for it", async () => {
    const was = [...PICTURE_POLL];
    PICTURE_POLL.splice(0, PICTURE_POLL.length, 5, 5);
    try {
      await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s60");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      await settle();
      expect(el.querySelectorAll(".vw-blank").length).toBe(2);
      expect(el.querySelectorAll(".vw-blank.making").length).toBe(0);
    } finally {
      PICTURE_POLL.splice(0, PICTURE_POLL.length, ...was);
    }
  });

  it("reads every page of a visit, not its first two hundred scans alone", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s50");
    expect(asked("/api/datasets/ms-a/scans")).toEqual(["/api/datasets/ms-a/scans?session=50&limit=200&pictures=1", "/api/datasets/ms-a/scans?session=50&limit=200&pictures=1&after=1199"]);
    expect(el.querySelectorAll(".vw-card.vw-scan").length).toBe(250);
    expect(el.textContent).not.toContain("The first");
  });

  it("opens the scan at the cursor in the browser on Enter, and moves between visits with Alt and the arrows", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34");
    key("ArrowRight");
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    key("Enter");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=1&visit=s34&scan=12");
    expect(el.querySelector(".dview")).not.toBeNull();
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34");
    key("ArrowRight", { altKey: true });
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=1&visit=t7.8");
    expect(asked("/api/datasets/ms-a/scans?studies")).toEqual(["/api/datasets/ms-a/scans?studies=7%2C8&limit=200&pictures=1"]);
    expect(el.querySelector(".vw-title h1")?.textContent).toBe("ses-20201104");
  });

  it("goes back up every level it came down by Esc, through the history, and / leads to the subjects' search", async () => {
    await open("#data/datasets/ms-a/view");
    const start = history.length;
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    key("Enter");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=1");
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    key("Enter");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34");
    expect(history.length).toBe(start + 2);
    key("Escape");
    await settle();
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid&subject=1");
    key("Escape");
    await settle();
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view");
    // back, not forward: no step was added on the way up
    expect(history.length).toBe(start + 2);
    // / from a subject's visits opens the subjects with the search ready
    await open("#data/datasets/ms-a/view?mode=grid&subject=1");
    key("/");
    await settle();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=grid");
    expect(document.activeElement).toBe(el.querySelector(".vw-search input"));
  });

  it("opens a visit with the cursor on the scan seen last, its folder unfolded where it was folded", async () => {
    const { setLastAt, lastScanKey } = await import("./viewer");
    setLastAt(lastScanKey({ kind: "dataset", name: "ms-a" }, "s34"), "16");
    await open("#data/datasets/ms-a/view?mode=grid&subject=1&visit=s34");
    expect([...el.querySelectorAll(".vw-folder-head")].map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "true", "true"]);
    expect(el.querySelector(".vw-scan.at .vw-scan-name")?.textContent).toBe("Localizer");
  });

  it("turns to the browser with g at the subject the cursor is on", async () => {
    await open("#data/datasets/ms-a/view");
    key("ArrowRight");
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    key("g");
    await settle();
    await settle();
    // the browser opens on that subject's first visit, its first scan, and the address follows
    expect(el.querySelector(".dview")).not.toBeNull();
    expect(location.hash).toBe("#data/datasets/ms-a/view?mode=browser&subject=2&visit=s40&scan=31");
    expect(el.querySelector("[data-testid=viewer]")?.getAttribute("data-stack")).toBe("31");
  });

  it("opens a cohort's members the same way", async () => {
    await open("#data/cohorts/ms/view");
    expect(asked("/api/cohorts/ms/subjects")).toEqual(["/api/cohorts/ms/subjects?limit=60&order=look&show=code"]);
    expect(text(".vw-crumbs a")).toEqual(["Cohorts"]);
    expect(el.querySelector(".vw-card")?.getAttribute("href")).toBe("#data/cohorts/ms/view?mode=grid&subject=1");
  });

  it("shows the browser alone where the engine lists scans but has no subjects door", async () => {
    await open("#data/datasets/ms-a/view", caps(["GET /api/datasets/{name}/scans"]));
    expect(el.querySelector(".vw")).toBeNull();
    expect(el.querySelector(".dview")).not.toBeNull();
    expect(el.querySelector(".vw-switch:not(.names)")).toBeNull();
    expect(asked("/api/datasets/ms-a/subjects")).toEqual([]);
  });
});
