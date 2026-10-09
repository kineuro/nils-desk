// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's scans: the scans door read with pictures a page at a time by its
// cursor, the pictures grouped by subject and session ids (codes may be
// shapes below detail quasi), a border only on a scan with open questions, a
// click opening the light viewer on that scan, the pick result as a line a
// role (record 55 H2: no Pick main scans in Data), and the one line where the
// dataset has no scans yet.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Dataset } from "./datasets";
import { groupScans, mayListScans, scanFacts, scansOf, type ScanRow } from "./scans";

vi.mock("./ScanViewer", () => ({
  markOpen: () => undefined,
  ScanViewer: ({ scans, at, onClose }: { scans: { id: number }[]; at: number; onClose: () => void }) => (
    <div data-testid="viewer" data-stack={scans[at].id} data-order={scans.map((s) => s.id).join(",")}>
      <button type="button" aria-label="Close the scan" onClick={onClose} />
    </div>
  ),
}));

const { Scans } = await import("./Scans");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/datasets/{name}/scans", "POST /api/picks/run", "GET /api/picks/summary"];
const caps = (grants: string[] = ["data:see", "data:work", "query:see", "query:work", "pipelines:work"], doors: string[] = DOORS) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants, detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const dataset = (stacks = 3) => ({ id: 3, name: "ms-a", cohort: null, totals: { subjects: 2, stacks }, digests: { count: 1, recent: [] } }) as unknown as Dataset;

const row = (stack: number, subject: number, code: string, session: number | null, name: string, orientation: string, images: number, day: string, questions: string[] = []): ScanRow => ({
  stack,
  picture: `data:image/webp;base64,${stack}`,
  questions,
  subject: { id: subject, code },
  session: session === null ? null : { id: session, label: day.replaceAll("-", "") },
  series_description: name,
  orientation,
  images,
  day,
});
const ROWS = [row(11, 1, "sub-a", 7, "T1 MPRAGE", "SAG", 176, "2026-01-02"), row(12, 1, "sub-a", 7, "FLAIR", "AX", 40, "2026-01-02", ["body_part:low_confidence"]), row(13, 2, "sub-b", 9, "DWI", "AX", 1, "2026-02-03")];

describe("the scans of a dataset, read", () => {
  it("reads the door's rows and groups them by subject, then session", () => {
    const scans = scansOf(ROWS);
    expect(scans.map((s) => s.id)).toEqual([11, 12, 13]);
    expect(scans[0]).toEqual({ id: 11, subjectId: 1, subject: "sub-a", session: 7, label: "20260102", day: "2026-01-02", name: "T1 MPRAGE", orientation: "SAG", images: 176, picture: "data:image/webp;base64,11", questions: [] });
    expect(scans[1].questions).toEqual(["body_part:low_confidence"]);
    // an older engine without pictures: none, and sure
    const { picture: _p, questions: _q, ...bare } = ROWS[0];
    expect(scansOf([bare as ScanRow])[0]).toMatchObject({ picture: null, questions: [] });
    const g = groupScans(scans);
    expect(g.map((x) => x.subject)).toEqual(["sub-a", "sub-b"]);
    expect(g[0].sessions).toHaveLength(1);
    expect(g[0].sessions[0].scans.map((s) => s.name)).toEqual(["T1 MPRAGE", "FLAIR"]);
    expect(scanFacts(scans[0])).toBe("sag · 176 images");
    expect(scanFacts(scans[2])).toBe("ax · 1 image");
  });

  it("keeps two subjects apart whose codes come back as the same shape", () => {
    const shaped = [row(11, 1, "aaa-a", 7, "T1", "SAG", 1, "9999-99-99"), row(13, 2, "aaa-a", 9, "DWI", "AX", 1, "9999-99-99")];
    expect(groupScans(scansOf(shaped)).map((g) => g.key)).toEqual([1, 2]);
  });

  it("is offered only with Data reading and the scans door", () => {
    expect(mayListScans(caps())).toBe(true);
    expect(mayListScans(caps(["query:see", "query:work"]))).toBe(false);
    expect(mayListScans(caps(undefined, ["POST /api/picks/run"]))).toBe(false);
  });
});

describe("the scans of a dataset, on the page", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: { method: string; url: string }[];
  let summary: unknown;
  beforeEach(() => {
    summary = {};
    calls = [];
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? "GET", url });
      if (url === "/api/datasets/ms-a/scans?pictures=1&limit=50") return new Response(JSON.stringify({ total: 51, scans: ROWS.slice(0, 2), next: 12 }));
      if (url === "/api/datasets/ms-a/scans?pictures=1&limit=50&after=12") return new Response(JSON.stringify({ total: 51, scans: ROWS.slice(2), next: null }));
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
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
  };
  const button = (label: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label) ?? null;

  it("shows fifty scans' pictures from one request, grouped by subject, a border only where a question is open, and no Pick main scans", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset()} />));
    await settle();
    expect(calls.filter((c) => c.url.startsWith("/api/datasets/"))).toEqual([{ method: "GET", url: "/api/datasets/ms-a/scans?pictures=1&limit=50" }]);
    expect(el.querySelector("h2")?.textContent).toBe("Scans of ms-a");
    expect([...el.querySelectorAll(".scan-subject > b")].map((b) => b.textContent)).toEqual(["sub-a"]);
    expect([...el.querySelectorAll(".scan-name")].map((b) => b.textContent)).toEqual(["T1 MPRAGE", "FLAIR"]);
    expect([...el.querySelectorAll(".scan-tile img")].map((i) => i.getAttribute("src"))).toEqual(["data:image/webp;base64,11", "data:image/webp;base64,12"]);
    const tiles = [...el.querySelectorAll(".scan-tile")];
    expect(tiles.map((t) => t.classList.contains("look"))).toEqual([false, true]);
    expect(tiles[1].getAttribute("title")).toBe("ax · 40 images · body part, low confidence");
    expect(button("Pick main scans")).toBeNull();
    expect(el.textContent).toContain("1 / 2");
  });

  it("says the pick result in one line a role, with Review where borders wait", async () => {
    summary = { roles: { T1: { picked: 112, clear: 104, borders: 8, tied: 0, review: 8 }, FLAIR: { picked: 40, clear: 40, borders: 0, tied: 0, review: 0 } } };
    act(() => root.render(<Scans caps={caps()} dataset={dataset()} />));
    await settle();
    const lines = [...el.querySelectorAll(".pick-line")];
    expect(lines.map((l) => l.querySelector("span")?.textContent)).toEqual(["T1: 112 picked · 104 clear · 8 borders", "FLAIR: 40 picked · 40 clear"]);
    const review = lines[0].querySelector("a");
    expect(review?.textContent).toBe("Review 8");
    expect(review?.getAttribute("href")).toBe("#review/picks?dataset=ms-a");
    expect(lines[1].querySelector("a")).toBeNull();
  });

  it("says nothing of picks where no summary exists or the door is not served", async () => {
    act(() => root.render(<Scans caps={caps(undefined, ["GET /api/datasets/{name}/scans"])} dataset={dataset()} />));
    await settle();
    expect(calls.some((c) => c.url.startsWith("/api/picks"))).toBe(false);
    expect(el.querySelector(".pick-line")).toBeNull();
  });

  it("opens the viewer on the scan clicked", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset()} />));
    await settle();
    expect(el.querySelector("[data-testid=viewer]")).toBeNull();
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".scan-tile")][1].click());
    expect(el.querySelector("[data-testid=viewer]")?.getAttribute("data-stack")).toBe("12");
    // next and previous follow the grid's order
    expect(el.querySelector("[data-testid=viewer]")?.getAttribute("data-order")).toBe("11,12");
    expect(el.querySelector(".scan-tile.on .scan-name")?.textContent).toBe("FLAIR");
    act(() => button("Close the scan")!.click());
    expect(el.querySelector("[data-testid=viewer]")).toBeNull();
  });

  it("turns to the next page after the cursor, and back", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset()} />));
    await settle();
    act(() => button("Next page")!.click());
    await settle();
    expect(calls.at(-1)).toMatchObject({ method: "GET", url: "/api/datasets/ms-a/scans?pictures=1&limit=50&after=12" });
    expect([...el.querySelectorAll(".scan-name")].map((b) => b.textContent)).toEqual(["DWI"]);
    expect(el.textContent).toContain("2 / 2");
    expect(button("Next page")!.disabled).toBe(true);
    act(() => button("Previous page")!.click());
    await settle();
    expect(calls.at(-1)).toMatchObject({ url: "/api/datasets/ms-a/scans?pictures=1&limit=50" });
    expect(el.textContent).toContain("1 / 2");
  });

  it("says No scans yet for a dataset nothing has sorted, and asks nothing", async () => {
    act(() => root.render(<Scans caps={caps()} dataset={dataset(0)} />));
    await settle();
    expect(calls).toHaveLength(0);
    expect(el.textContent).toContain("No scans yet");
    expect(el.textContent).not.toContain("No scan list");
    expect(button("Pick main scans")).toBeNull();
  });
});
