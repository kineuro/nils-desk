// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The walk of the side (test/layout/side-walk.pw.ts; gate T31, every section
// reachable from the side) held to the side without a browser: for the
// walk's person, who holds every grant, and its engine, which serves every
// door in walk.doors.json, the side lists the sections and pages of the
// walk's map in its order and nothing else, Data's Clinical among them; and
// Clinical draws its empty state from what the walk's engine answers. The
// walk's door list once predated the clinical doors, so the walk never
// opened Clinical.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { empty, WALK_CAPS, WALK_DOORS } from "../test/layout/walk.fixture";
import { MAP } from "../test/layout/walk.map";
import { settle } from "../test/safeWayIn";
import type { Capabilities } from "./capabilities";
import { ClinicalPage } from "./data/ClinicalPage";
import { foot, sections } from "./sections";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const caps = WALK_CAPS as unknown as Capabilities;

describe("the side the walk opens", () => {
  it("lists the walk's map, every section in its order with its pages, and nothing else", () => {
    // the walk's assistant answers nothing, so no conversation joins the Assistant's pages
    const side = [...sections(caps, true), ...foot(caps)];
    expect(side.map((s) => s.title)).toEqual(Object.keys(MAP));
    for (const s of side) expect((s.pages ?? []).map((p) => p.title), s.title).toEqual(MAP[s.title]);
  });

  it("opens Clinical under Data, where the walk's engine serves the clinical doors", () => {
    expect(WALK_DOORS).toEqual(expect.arrayContaining(["GET /api/clinical/vocabulary", "POST /api/clinical/vocabulary", "POST /api/clinical/import"]));
    expect(MAP["Data"]).toContain("Clinical");
    const data = sections(caps, true).find((s) => s.id === "data");
    expect(data?.pages?.find((p) => p.title === "Clinical")?.id).toBe("clinical");
  });
});

describe("Clinical, as the walk opens it", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("draws its heading and its empty vocabulary, and nothing that stopped", async () => {
    // the walk's engine: what an engine that holds nothing answers, and 404 at a door it does not know
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), "http://desk.test").pathname;
        const body = (init?.method ?? "GET") === "GET" ? empty(path) : null;
        return new Response(JSON.stringify(body ?? { error: `the walk's engine has no ${path}` }), { status: body === null ? 404 : 200 });
      }),
    );
    await act(async () => root.render(<ClinicalPage caps={caps} />));
    await settle();
    expect(host.querySelector("h1")?.textContent).toBe("Clinical");
    expect(host.querySelector(".warn")).toBeNull();
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("Load a vocabulary");
  });
});
