// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The run page when its run changes (review fix 3): the next run starts from
// nothing, a late answer for the last run is ignored, and the table is asked
// once for a run at a status. Against a fake engine; every name is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { NUMBERS_TWO, PACK_DOC, RUN_PACK, SAMSEG_PIPELINE } from "./pack.fixture";
import { RunPage } from "./RunPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/pipelines", "GET /api/pipelines/{id}/pack", "GET /api/pipeline-runs/{id}", "GET /api/pipeline-runs/{id}/numbers", "POST /api/ask/run", "GET /api/jobs/{id}"];
const CAPS = capsWith(DOORS, ["pipelines:see", "query:see", "query:work"]);

let asked: { method: string; path: string; body: unknown }[] = [];
let held: Record<string, (r: Response) => void> = {};
let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  asked = [];
  held = {};
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://desk.test");
    const method = init?.method ?? "GET";
    asked.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    const run = /^\/api\/pipeline-runs\/(\d+)$/u.exec(url.pathname);
    if (run) return Promise.resolve(json({ ...RUN_PACK, id: Number(run[1]), job_id: null }));
    if (url.pathname === "/api/pipelines") return Promise.resolve(json({ pipelines: [SAMSEG_PIPELINE], capability: { enabled: true } }));
    if (url.pathname === "/api/pipelines/5/pack") return Promise.resolve(json(PACK_DOC));
    // the first run's numbers are slow: held until the test lets them go
    if (url.pathname === "/api/pipeline-runs/41/numbers") return new Promise<Response>((r) => (held["41"] = r));
    if (url.pathname === "/api/pipeline-runs/42/numbers") return Promise.resolve(json({ ...NUMBERS_TWO, run: 42 }));
    if (url.pathname === "/api/ask/run") return Promise.resolve(json({ columns: [], rows: [], truncated: false }));
    return Promise.resolve(json({ error: `no ${url.pathname}` }, 404));
  }) as typeof fetch;
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
});
const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

describe("the run page when the run changes", () => {
  it("ignores a late answer for the last run and asks the table once for the new one", async () => {
    await act(async () => root.render(<RunPage caps={CAPS} id={41} />));
    await settle();
    await act(async () => root.render(<RunPage caps={CAPS} id={42} />));
    await settle();
    // the last run's numbers arrive late
    await act(async () => held["41"](new Response(JSON.stringify({ ...NUMBERS_TWO, run: 41 }), { status: 200 })));
    await settle();
    const tables = asked.filter((a) => a.path === "/api/ask/run");
    // one table question for run 42, none made from run 41's numbers
    expect(tables.filter((t) => JSON.stringify(t.body).includes("42"))).toHaveLength(1);
    expect(tables.filter((t) => JSON.stringify(t.body).includes("41"))).toHaveLength(0);
  });
});
