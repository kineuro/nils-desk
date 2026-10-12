// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One chat's analysis workspace: the charts and files a turn wrote under /out
// arrive as the turn's whole list on each write, are kept by turn, live and
// after a reload alike, the latest write replacing the list before it; a chart
// is drawn as an image from a data URL, never inlined, and a file is offered
// as a download. Everything here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asOneChatPart, FILE_MOST, SVG_MOST } from "./events";
import { chartSrc, fileWords, sizeWords } from "./Outputs";
import { type Chunk, empty, fromHistory, reduce } from "./parts";
import { TurnView } from "./TurnView";

const saved = vi.hoisted(() => ({ text: vi.fn(), base64: vi.fn() }));
vi.mock("./download", async (importOriginal) => ({ ...(await importOriginal<typeof import("./download")>()), saveText: saved.text, saveBase64: saved.base64 }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="white"/><rect id="bar-t1w" x="4" y="6" width="8" height="14" fill="gray"/><text x="4" y="5">T1w</text></svg>';
/** A PNG of one pixel. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const CSV = "base,median_slices\nT1w,176\nT2w,30\nFLAIR,40\n";

const svgChart = { call: "t1", name: "slices-by-base.svg", title: "Slices by base", media: "image/svg+xml", encoding: "utf8", data: SVG, bytes: SVG.length };
const pngChart = { call: "t2", name: "ages.png", title: "Ages", media: "image/png", encoding: "base64", data: PNG, bytes: 68 };
const csvFile = { call: "t1", name: "medians.csv", media: "text/csv", encoding: "utf8", data: CSV, bytes: 1234, rows: 3 };

describe("the guard of a turn's charts and files", () => {
  it("admits a chart as an SVG in utf8 or a PNG in base64, and a file of the five kinds", () => {
    expect(asOneChatPart({ kind: "chart", items: [svgChart, pngChart] })).toEqual({ kind: "chart", items: [svgChart, pngChart] });
    expect(asOneChatPart({ kind: "file", items: [csvFile] })).toEqual({ kind: "file", items: [csvFile] });
    for (const media of ["text/tab-separated-values", "text/plain", "application/json", "text/markdown"])
      expect(asOneChatPart({ kind: "file", items: [{ ...csvFile, name: "notes", media, rows: null }] })).toMatchObject({ items: [{ media, rows: null }] });
    // an SVG may come in base64 as well; base64 wrapped in lines is taken whole
    const wrapped = `${PNG.slice(0, 40)}\n${PNG.slice(40)}`;
    expect(asOneChatPart({ kind: "chart", items: [{ ...pngChart, data: wrapped }] })).toMatchObject({ items: [{ data: PNG }] });
    expect(asOneChatPart({ kind: "chart", items: [{ ...svgChart, encoding: "base64", data: btoa(SVG) }] })).toMatchObject({ items: [{ media: "image/svg+xml", encoding: "base64" }] });
  });

  it("reads what an item leaves out: no caption is its name, no size is its data's, rows that are no count are none", () => {
    const said = { call: 7, name: "slices-by-base.svg", media: "image/svg+xml", encoding: "utf8", data: SVG };
    expect(asOneChatPart({ kind: "chart", items: [said] })).toEqual({ kind: "chart", items: [{ ...svgChart, call: null, title: "slices-by-base.svg", bytes: SVG.length }] });
    expect(asOneChatPart({ kind: "file", items: [{ ...csvFile, bytes: undefined, rows: 2.5 }] })).toMatchObject({ items: [{ bytes: CSV.length, rows: null }] });
    expect(asOneChatPart({ kind: "chart", items: [{ ...pngChart, bytes: null }] })).toMatchObject({ items: [{ bytes: 68 }] });
  });

  it("drops what is malformed: unknown media, data that is no text, a name with a folder or a way up, a PNG not in base64, an SVG or a file too long", () => {
    const charts = (...items: unknown[]) => (asOneChatPart({ kind: "chart", items }) as { items: unknown[] }).items;
    const files = (...items: unknown[]) => (asOneChatPart({ kind: "file", items }) as { items: unknown[] }).items;
    expect(charts({ ...svgChart, media: "image/gif" }, { ...svgChart, media: "text/html" }, { ...pngChart, media: "image/jpeg" })).toEqual([]);
    expect(files({ ...csvFile, media: "application/zip" }, { ...csvFile, media: "text/html" })).toEqual([]);
    expect(charts({ ...svgChart, data: 12 }, { ...svgChart, data: null })).toEqual([]);
    expect(files({ ...csvFile, data: ["base"] })).toEqual([]);
    expect(charts(...["out/a.svg", "../a.svg", "a..svg", "..", "a\\b.svg", "", " ", "a\nb.svg", 3].map((name) => ({ ...svgChart, name })))).toEqual([]);
    expect(files(...["out/medians.csv", "medians..csv"].map((name) => ({ ...csvFile, name })))).toEqual([]);
    expect(charts({ ...pngChart, encoding: "utf8" }, { ...pngChart, data: "not base64 at all!" }, { ...pngChart, data: btoa("GIF89a") })).toEqual([]);
    expect(charts({ ...svgChart, data: `<svg>${"x".repeat(SVG_MOST)}</svg>` }, { ...svgChart, data: "no picture" })).toEqual([]);
    expect(files({ ...csvFile, data: "x".repeat(FILE_MOST + 1) }, { ...csvFile, encoding: "base64" })).toEqual([]);
    expect(files({ ...csvFile, data: "x".repeat(FILE_MOST) })).toHaveLength(1);
    // the good ones beside them stay
    expect(charts(svgChart, { ...svgChart, name: "../x.svg" }, pngChart)).toEqual([svgChart, pngChart]);
    expect(asOneChatPart({ kind: "chart", items: "slices.svg" })).toBeNull();
    expect(asOneChatPart({ kind: "file" })).toBeNull();
  });

  it("keeps eight of each at most", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...csvFile, name: `part-${i}.csv` }));
    const kept = (asOneChatPart({ kind: "file", items: many }) as { items: { name: string }[] }).items;
    expect(kept.map((f) => f.name)).toEqual(many.slice(0, 8).map((f) => f.name));
  });
});

describe("a turn's charts and files in the pane", () => {
  const chart = (...items: unknown[]) => ({ kind: "chart", items });
  const file = (...items: unknown[]) => ({ kind: "file", items });
  const live: Chunk[] = [
    { type: "message-started", messageId: "a1" },
    { type: "message-delta", messageId: "a1", kind: "text", delta: "The medians by base." },
    { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "workspace_run", input: {} },
    { type: "data-part", messageId: "a1", name: "chart", data: chart(svgChart) },
    { type: "data-part", messageId: "a1", name: "file", data: file(csvFile) },
    { type: "tool-output", toolCallId: "t1", output: "done" },
    { type: "data-part", messageId: "a1", name: "chart", data: chart(svgChart, pngChart) },
    { type: "message-completed", messageId: "a1" },
    { type: "submission-settled", submissionId: "s1", outcome: "completed" },
  ];

  it("are the same live and from a history, by the turn that wrote them", () => {
    const s = live.reduce(reduce, empty());
    expect(s.charts).toEqual({ a1: [svgChart, pngChart] });
    expect(s.files).toEqual({ a1: [csvFile] });
    // the history keeps one part per name per response: the latest write of each
    const read = fromHistory({
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Chart the medians." }] },
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "text", text: "The medians by base." },
            { type: "dynamic-tool", toolCallId: "t1", toolName: "workspace_run", state: "output-available" },
            { type: "data-chart", data: chart(svgChart, pngChart) },
            { type: "data-file", data: file(csvFile) },
          ],
        },
      ],
      settlements: [{ submissionId: "s1", outcome: "completed" }],
    });
    expect(read.charts).toEqual(s.charts);
    expect(read.files).toEqual(s.files);
  });

  it("take the latest write in place of the list before it, and leave other turns' lists alone", () => {
    let s = live.reduce(reduce, empty());
    s = reduce(s, { type: "message-started", messageId: "a2" });
    s = reduce(s, { type: "data-part", messageId: "a2", name: "file", data: file({ ...csvFile, name: "counts.csv" }) });
    s = reduce(s, { type: "data-part", messageId: "a2", name: "file", data: file({ ...csvFile, name: "counts.csv", rows: 4 }, { ...csvFile, name: "notes.md", media: "text/markdown", rows: null }) });
    expect(s.files.a2.map((f) => [f.name, f.rows])).toEqual([
      ["counts.csv", 4],
      ["notes.md", null],
    ]);
    expect(s.files.a1).toEqual([csvFile]);
    // a rewrite that leaves a chart out takes it away, and a malformed write is dropped whole
    s = reduce(s, { type: "data-part", messageId: "a1", name: "chart", data: chart(pngChart) });
    expect(s.charts.a1).toEqual([pngChart]);
    s = reduce(s, { type: "data-part", messageId: "a1", name: "chart", data: { kind: "chart", items: null } });
    expect(s.charts.a1).toEqual([pngChart]);
    // and the history reads a part written twice the same way
    const twice = fromHistory({ messages: [{ id: "a1", role: "assistant", parts: [{ type: "data-chart", data: chart(svgChart) }, { type: "data-chart", data: chart(pngChart) }] }] });
    expect(twice.charts).toEqual({ a1: [pngChart] });
  });
});

describe("a turn's charts and files in the thread", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    saved.text.mockClear();
    saved.base64.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const draw = () => {
    const s = fromHistory({ messages: [{ id: "a1", role: "assistant", parts: [{ type: "text", text: "The medians by base." }, { type: "data-chart", data: { kind: "chart", items: [svgChart, pngChart] } }, { type: "data-file", data: { kind: "file", items: [csvFile] } }] }] });
    act(() =>
      root.render(
        <TurnView
          turn={s.turns[0]}
          open={false}
          onToggle={() => undefined}
          proposals={[]}
          changes={[{ id: "w", change: "sorting_words", title: null, sentence: "Add FLAIR3D", lines: [], turn: "a1", decided: null }]}
          onChange={() => undefined}
          charts={s.charts.a1}
          files={s.files.a1}
          choice={null}
          onChoose={() => undefined}
        />,
      ),
    );
  };

  it("draws each chart as an image from a data URL, captioned by its title, after the words and before the card that waits", () => {
    draw();
    const [svg, png] = [...host.querySelectorAll("img")];
    expect(svg.getAttribute("src")).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`);
    expect(decodeURIComponent(svg.getAttribute("src")!.split(",").slice(1).join(","))).toBe(SVG);
    expect(svg.getAttribute("alt")).toBe("Slices by base");
    expect(png.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    expect([...host.querySelectorAll("figcaption")].map((c) => c.textContent)).toEqual(["Slices by base", "Ages"]);
    // the chart's own drawing never enters the page: the only drawings are the desk's icons
    expect(host.querySelector("#bar-t1w")).toBeNull();
    expect(host.querySelectorAll("svg:not(.i)")).toHaveLength(0);
    const order = [".md", ".turn-outputs", ".approval-card"].map((s) => host.querySelector(s)!);
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("saves a chart under its own name, and offers a file as a download of its text with its type", () => {
    draw();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Save slices-by-base.svg"]')!.click());
    expect(saved.text).toHaveBeenLastCalledWith("slices-by-base.svg", SVG, "image/svg+xml");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Save ages.png"]')!.click());
    expect(saved.base64).toHaveBeenLastCalledWith("ages.png", PNG, "image/png");
    const row = host.querySelector(".out-file")!;
    expect(row.textContent).toBe("medians.csv1.2 kB · 3 rowsDownload");
    act(() => row.querySelector<HTMLButtonElement>('button[aria-label="Download medians.csv"]')!.click());
    expect(saved.text).toHaveBeenLastCalledWith("medians.csv", CSV, "text/csv");
  });

  it("draws nothing for a turn that wrote nothing", () => {
    act(() => root.render(<TurnView turn={{ id: "a1", role: "assistant", text: "Two.", done: true, tools: [] }} open={false} onToggle={() => undefined} proposals={[]} choice={null} onChoose={() => undefined} />));
    expect(host.querySelector(".turn-outputs")).toBeNull();
  });
});

describe("what a chart and a file say of themselves", () => {
  it("names a size in plain units, and a file's rows where it counts them", () => {
    expect([0, 1, 999, 1000, 1234, 9960, 34_567, 999_600, 1_500_000].map(sizeWords)).toEqual(["0 bytes", "1 byte", "999 bytes", "1 kB", "1.2 kB", "10 kB", "35 kB", "1 MB", "1.5 MB"]);
    expect(fileWords({ ...csvFile, media: "text/csv", encoding: "utf8", rows: 1 })).toBe("1.2 kB · 1 row");
    expect(fileWords({ ...csvFile, media: "text/csv", encoding: "utf8", rows: 12_000, bytes: 512 })).toBe("512 bytes · 12,000 rows");
    expect(fileWords({ ...csvFile, media: "text/plain", encoding: "utf8", rows: null, bytes: 2_400_000 })).toBe("2.4 MB");
  });

  it("is drawn from a data URL of its own type", () => {
    expect(chartSrc({ ...svgChart, media: "image/svg+xml", encoding: "base64", data: btoa(SVG) })).toBe(`data:image/svg+xml;base64,${btoa(SVG)}`);
  });

  it("saves a PNG as its bytes, not as their letters", async () => {
    const { saveBase64 } = await vi.importActual<typeof import("./download")>("./download");
    let blob: Blob | null = null;
    const revoked: string[] = [];
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: (u: string) => revoked.push(u) });
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    vi.useFakeTimers();
    saveBase64("ages.png", PNG, "image/png");
    vi.runAllTimers();
    vi.useRealTimers();
    click.mockRestore();
    vi.unstubAllGlobals();
    expect(revoked).toEqual(["blob:x"]);
    expect(clicked).toEqual(["ages.png"]);
    const b = blob as Blob | null;
    expect(b?.type).toBe("image/png");
    expect(b?.size).toBe(atob(PNG).length);
    expect([...new Uint8Array(await b!.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
