// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// No command line inside a flow (Wave 7a, H2 round 3), the selections and the
// pick runs: a query card saves its version as a selection with an optional
// note; the Selections list is found by part of a name, fifty at a time, with
// each one's size; and "Pick main scans" on a cohort's page and in a
// dataset's menu queues the engine's pick run and says its job.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { PickRun } from "../data/PickRun";
import { mayPick } from "../data/pickRun";
import { SaveSelection } from "./SaveSelection";
import { Selections } from "./Selections";
import { maySave, selectionName, sizeWords } from "./selections";

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

const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

const row = (i: number, size: unknown = { rows: 1204, grain: "stack", version: 2, handle: 9, at: "2026-10-08T10:00:00Z", truncated: false }) => ({
  id: i,
  name: `t1-${String(i).padStart(3, "0")}`,
  spec: `selection:t1-${i}@2`,
  description: null,
  versions: 2,
  grain: "stack",
  owner: "astrid",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-08T10:00:00Z",
  updated_by: "astrid",
  note: i === 1 ? "for the segmentation run" : null,
  cohort: null,
  size,
});

describe("Save as a selection", () => {
  it("saves the card's version under a name with its note, and says the version", async () => {
    const onSaved = vi.fn();
    const e = engine((c) => (c.method === "PUT" ? { status: 200, body: { id: 3, name: "t1-brain", version: 4, hash: "h" } } : undefined));
    act(() => root.render(<SaveSelection documentId={77} title="T1 brain" onClose={() => undefined} onSaved={onSaved} />));
    expect(host.querySelector<HTMLInputElement>("#selection-name")!.value).toBe("t1-brain");
    typeInto(host.querySelector<HTMLInputElement>("#selection-note")!, "for the run");
    act(() => button(host, "Save")!.click());
    await settle();
    expect(e.of("PUT", "/api/ask/selections/t1-brain")[0].body).toEqual({ document_id: 77, note: "for the run" });
    expect(onSaved).toHaveBeenCalledWith("Saved as t1-brain, version 4.");
  });

  it("takes a name the engine keeps whole, and is offered at quasi with query work only", () => {
    expect(selectionName("  My T1 / brain@v2 ")).toBe("my-t1-brain-v2");
    expect(selectionName("   ")).toBeNull();
    expect(maySave(caps7a(["PUT /api/ask/selections/{name}"]))).toBe(true);
    expect(maySave(caps7a(["PUT /api/ask/selections/{name}"], ["query:see"]))).toBe(false);
    expect(maySave(caps7a([]))).toBe(false);
  });
});

describe("the Selections list", () => {
  it("reads fifty at a time with each one's size, finds by part of a name, and asks for more", async () => {
    const e = engine((c) => {
      if (!c.url.startsWith("/api/ask/selections?")) return undefined;
      const p = new URL(c.url, "http://x").searchParams;
      if (p.get("q") === "seg") return { status: 200, body: { count: 1, total: 51, matching: 1, selections: [row(1)], next: null } };
      if (p.get("after")) return { status: 200, body: { count: 1, total: 51, matching: 51, selections: [row(51, null)], next: null } };
      return { status: 200, body: { count: 50, total: 51, matching: 51, selections: Array.from({ length: 50 }, (_, i) => row(i + 1)), next: "t1-050" } };
    });
    act(() => root.render(<Selections />));
    await settle();
    expect(new URL(e.calls[0].url, "http://x").searchParams.get("limit")).toBe("50");
    expect(host.querySelectorAll("tbody tr")).toHaveLength(50);
    const first = host.querySelector("tbody tr")!;
    expect(first.textContent).toContain("t1-001");
    expect(first.textContent).toContain("for the segmentation run");
    expect(first.textContent).toContain("1,204 stacks");
    expect(first.textContent).toContain("v2");
    act(() => button(host, "More")!.click());
    await settle();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(51);
    expect(host.querySelectorAll("tbody tr")[50].textContent).toContain("not run yet");
    expect(new URL(e.calls[1].url, "http://x").searchParams.get("after")).toBe("t1-050");
    typeInto(host.querySelector<HTMLInputElement>('input[aria-label="Find a selection"]')!, "seg");
    await act(async () => {
      await new Promise((done) => setTimeout(done, 350));
    });
    await settle();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(button(host, "More")).toBeNull();
  });

  it("says a size in words", () => {
    expect(sizeWords({ rows: 1, grain: "subject", version: 1, handle: 1, at: "", truncated: false })).toBe("1 subject");
    expect(sizeWords({ rows: 5000, grain: "stack", version: 1, handle: 1, at: "", truncated: true })).toBe("at least 5,000 stacks");
    expect(sizeWords(null)).toBe("not run yet");
  });
});

describe("Pick main scans", () => {
  it("queues the pick run for a cohort and says its job", async () => {
    const e = engine((c) => (c.method === "POST" && c.url === "/api/picks/run" ? { status: 202, body: { job: 88, state: "queued", for: "cohort:ms", command: ["pick", "run", "--cohort", "ms"] } } : undefined));
    act(() => root.render(<PickRun caps={caps7a(["POST /api/picks/run"])} of={{ cohort: "ms" }} />));
    act(() => button(host, "Pick main scans")!.click());
    await settle();
    expect(e.of("POST", "/api/picks/run")[0].body).toEqual({ cohort: "ms" });
    expect(host.textContent).toContain("Picking main scans (job 88).");
    expect(host.textContent).not.toMatch(/pick run --/);
  });

  it("says the engine's refusal in its words, and is not offered without work on Pipelines", async () => {
    engine(() => ({ status: 409, body: { error: "no pack of that name declares picks", disclosure: "safe" } }));
    act(() => root.render(<PickRun caps={caps7a(["POST /api/picks/run"])} of={{ dataset: "ward-a" }} />));
    act(() => button(host, "Pick main scans")!.click());
    await settle();
    expect(host.querySelector(".warn")?.textContent).toBe("no pack of that name declares picks");
    expect(mayPick(caps7a(["POST /api/picks/run"], ["data:work"]))).toBe(false);
    expect(mayPick(caps7a([]))).toBe(false);
  });
});
