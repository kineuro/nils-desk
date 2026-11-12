// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The grid's subjects while the engine reads them again (2026-11-12): the
// subjects door answers the facts it kept at once and says `counting`; the
// grid shows them, asks the first page again a little later and shows the
// new ones, and asks nothing more once the engine has read. An engine that
// says nothing of counting is asked once, as before.

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { parse } from "../routes";

vi.mock("./ScanViewer", () => ({ markOpen: () => undefined, ScanViewer: () => <div data-testid="viewer" /> }));

const { Viewer } = await import("./Viewer");
const { COUNTING_AGAIN_MS, forgetHeld } = await import("./viewer");
const { forgetOrigins } = await import("./origins");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/datasets/{name}/scans", "GET /api/datasets/{name}/subjects", "GET /api/datasets/{name}/subjects/{subject}/visits"];
const caps = {
  engine: { engine: { name: "nils", version: "1" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid", display_name: "Astrid", grants: ["data:see"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

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

const subject = (id: number, code: string) => ({ id, code, label: code, visits: 1, scans: 5, look: 0, regions: ["brain"], makers: ["GE"], main: ["t1w"] });
const AT = "/api/datasets/ms-a/subjects";

describe("the grid's subjects while the engine reads them again", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: string[];
  /** What the engine says of its facts, answer by answer: `true` is the kept ones while it reads, `false` the ones it read, `null` an engine that says nothing. */
  let says: (boolean | null)[];

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    says = [];
    forgetHeld();
    forgetOrigins();
    localStorage.clear();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url, "http://desk");
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
      if (u.pathname !== AT) return json({}, 404);
      calls.push(url);
      const counting = says.length > 1 ? says.shift()! : (says[0] ?? null);
      // the kept facts hold two subjects; the ones read again hold three
      const subjects = counting === true ? [subject(1, "sub-a1"), subject(2, "sub-b2")] : [subject(1, "sub-a1"), subject(2, "sub-b2"), subject(3, "sub-c3")];
      const doc: Record<string, unknown> = { scope: { kind: "dataset", name: "ms-a", id: 7 }, detail: "quasi", show: "code", order: "id", totals: { subjects: subjects.length, visits: subjects.length, scans: 5 * subjects.length, look: 0 }, matched: subjects.length, count: subjects.length, subjects, next: null, facets: { makers: [], regions: [], roles: [], id_types: [] } };
      if (counting !== null) Object.assign(doc, { counting, counts_as_of: "2026-11-12T10:00:00Z" });
      return json(doc);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const pass = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const open = async () => {
    location.hash = "#data/datasets/ms-a/view";
    await pass(0);
    act(() => root.render(<Harness />));
    await pass(1);
  };
  const names = () => [...el.querySelectorAll(".vw-card .vw-card-name")].map((x) => x.textContent);

  it("shows the kept subjects at once, asks again after a moment and shows what the engine read", async () => {
    says = [true, false];
    await open();
    expect(calls.length).toBe(1);
    expect(names()).toEqual(["sub-a1", "sub-b2"]);
    await pass(COUNTING_AGAIN_MS[0] - 100);
    expect(calls.length).toBe(1);
    await pass(200);
    expect(calls.length).toBe(2);
    expect(names()).toEqual(["sub-a1", "sub-b2", "sub-c3"]);
    // the engine has read: nothing more is asked
    await pass(120_000 - COUNTING_AGAIN_MS[0]);
    expect(calls.length).toBe(2);
  });

  it("asks less and less often while the engine goes on reading", async () => {
    says = [true];
    await open();
    const [a, b, c, d] = COUNTING_AGAIN_MS;
    await pass(a + 50);
    expect(calls.length).toBe(2);
    await pass(b + 50);
    expect(calls.length).toBe(3);
    await pass(c + 50);
    expect(calls.length).toBe(4);
    await pass(d + 50);
    expect(calls.length).toBe(5);
    await pass(d + 50);
    expect(calls.length).toBe(6);
  });

  it("asks an engine that says nothing of counting once", async () => {
    says = [null];
    await open();
    expect(names()).toEqual(["sub-a1", "sub-b2", "sub-c3"]);
    await pass(120_000);
    expect(calls.length).toBe(1);
  });
});
