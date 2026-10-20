// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Run again (2026-10-12): a stopped run is taken up again only after its
// pre-flight, as a new run is started from the run form. The dialog asks the
// engine's pre-flight of the run taken up again, Start waits on it, a run no
// session of which could run is held with the sessions that cannot, one line
// a reason, and Start queues `run --resume <run>`; a refusal at the jobs door
// says why; an engine from before that does not check a run taken up again
// says so, and Start goes. Against a fake engine, in the engine's shapes;
// every name is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { capsWith } from "../review/caps.fixture";
import { overOfCommand } from "./catalog";
import { againOfRun, RunAgainDialog, type Again } from "./RunAgain";
import type { Preflight } from "./runs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "POST /api/jobs", "POST /api/pipelines/{name}/preflight"];
const SESSIONS = ["sub-7a8b9c0d_ses-1", "sub-1e2f3a4b_ses-1"];

/** An engine whose pipelines capability says it checks a run taken up again, or one from before that does not. */
function capsOf(checks: boolean): Capabilities {
  const c = capsWith(DOORS, ["pipelines:see", "pipelines:work"]);
  return checks ? { ...c, engine: { ...c.engine!, pipelines: { enabled: true, preflight: { door: "POST /api/pipelines/{name}/preflight", resume: true } } } } : c;
}

const PRE = (ready: boolean): Preflight => ({
  pipeline: "samseg-lesions@1",
  pipeline_id: 3,
  layout: "bids",
  level: "session",
  unit: "session",
  stacks: 4,
  units: ready ? { total: 2, ready: 2, missing: 0 } : { total: 2, ready: 0, missing: 2 },
  missing: ready ? [] : SESSIONS.map((unit) => ({ unit, why: ["no flair is picked for it among the selection's stacks"], lacks: ["no FLAIR picked"] })),
  cannot: ready ? [] : [{ why: "no FLAIR picked", units: 2, named: SESSIONS }],
  resume: { run: 14, status: "failed", job: 18, kept: 0, made: 0 },
  ready,
  blockers: ready ? [] : ["no session can run: 2 of 2 lack an input (no FLAIR picked)"],
});

let asked: { method: string; path: string; body: unknown }[] = [];
let answers: Record<string, (body: unknown) => { status: number; body: unknown }> = {};
let root: Root;
let el: HTMLDivElement;
let said: string[] = [];

beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  asked = [];
  said = [];
  answers = {
    "POST /api/pipelines/3/preflight": () => ({ status: 200, body: PRE(true) }),
    "POST /api/jobs": () => ({ status: 202, body: { job: 51, state: "queued" } }),
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://desk.test");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    asked.push({ method, path: url.pathname, body });
    const a = answers[`${method} ${url.pathname}`]?.(body) ?? { status: 404, body: { error: `no ${url.pathname}` } };
    return new Response(JSON.stringify(a.body), { status: a.status });
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
  for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const start = () => [...el.querySelectorAll("button")].find((b) => b.textContent === "Start") as HTMLButtonElement;
const again: Again = againOfRun({ id: 14, pipeline_id: 3, pipeline: "samseg-lesions@1" });
const draw = async (caps: Capabilities, a: Again = again) => {
  await act(async () => root.render(<RunAgainDialog caps={caps} again={a} onClose={() => undefined} onDone={(w) => said.push(w)} />));
  await settle();
};

describe("Run again", () => {
  it("asks the run's pre-flight first, and Start queues it up again once the engine says it can run", async () => {
    await draw(capsOf(true));
    expect(asked[0]).toEqual({ method: "POST", path: "/api/pipelines/3/preflight", body: { resume: 14 } });
    expect(el.querySelector(".preflight .note-lead")?.textContent).toBe("Pre-flight");
    expect(el.querySelector(".can-run")?.textContent).toBe("All 2 sessions can run.");
    expect(start().disabled).toBe(false);
    await act(async () => start().click());
    await settle();
    expect(asked.find((a) => a.path === "/api/jobs")?.body).toEqual({ command: ["run", "--resume", "14"] });
    expect(said).toEqual(["Run 14 is queued again as job 51."]);
  });
  it("a job's command taken again keeps the goal, the switches and let_run, at the pre-flight and in the queued command", async () => {
    const command = ["run", "samseg-lesions@1", "--select", "selection:study@3", "--goal", "research", "--switch", "lesions=off", "--let-run"];
    answers["POST /api/pipelines/samseg-lesions@1/preflight"] = () => ({ status: 200, body: PRE(true) });
    const parsed = overOfCommand(command)!;
    await draw(capsOf(true), { kind: "new", pipeline: parsed.pipeline, over: parsed.over, params: parsed.params, person: parsed.person, command });
    expect(asked[0].body).toMatchObject({ goal: "research", switches: { lesions: "off" }, let_run: true });
    await act(async () => start().click());
    await settle();
    expect(asked.find((a) => a.path === "/api/jobs")?.body).toEqual({ command });
  });
  it("holds Start where no session it still has to run could run, naming them by why", async () => {
    answers["POST /api/pipelines/3/preflight"] = () => ({ status: 200, body: PRE(false) });
    await draw(capsOf(true));
    expect(el.querySelector(".preflight .note-lead")?.textContent).toBe("Not ready");
    expect(el.querySelector(".preflight-cannot li")?.textContent).toBe(`2 sessions cannot run: no FLAIR picked${SESSIONS.join(", ")}`);
    expect(el.querySelector(".preflight .fail-said")?.textContent).toContain("no session can run: 2 of 2 lack an input (no FLAIR picked)");
    expect(start().disabled).toBe(true);
    expect(asked.some((a) => a.path === "/api/jobs")).toBe(false);
  });
  it("waits on the pre-flight's answer, and says the jobs door's refusal with the sessions that cannot run", async () => {
    let answer: (v: unknown) => void = () => undefined;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://desk.test");
      asked.push({ method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.pathname === "/api/jobs")
        return Promise.resolve(new Response(JSON.stringify({ error: "refused before it started: no session can run: 2 of 2 lack an input (no FLAIR picked); a unit's input is missing or was refused (failure: input)", failure: { kind: "input", cause: "input", advice: "a unit's input is missing or was refused: the pre-flight (nils run --preflight) names each unit and why", fix: null }, unit: "session", units: { total: 2, ready: 0, missing: 2 }, cannot: [{ why: "no FLAIR picked", units: 2, named: SESSIONS }], requirements: [] }), { status: 409 }));
      return new Promise<Response>((r) => (answer = (v) => r(new Response(JSON.stringify(v), { status: 200 }))));
    }) as typeof fetch;
    await draw(capsOf(true));
    expect(el.textContent).toContain("Checking what the run would do");
    expect(start().disabled).toBe(true);
    await act(async () => answer(PRE(true)));
    await settle();
    expect(start().disabled).toBe(false);
    // the machine changed between: the door refuses it, and says why
    await act(async () => start().click());
    await settle();
    expect(el.querySelector(".dialog-foot .fail-note .note-lead")?.textContent).toBe("Not queued");
    expect(el.querySelector(".dialog-foot .fail-note .kind-tag")?.textContent).toBe("input");
    expect(el.querySelector(".dialog-foot .preflight-cannot li")?.textContent).toBe(`2 sessions cannot run: no FLAIR picked${SESSIONS.join(", ")}`);
    expect(said).toEqual([]);
  });
  it("links a refusal the software place mends to Settings > Software, in the note and the checks (review fix 3)", async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://desk.test");
      asked.push({ method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.pathname === "/api/jobs")
        return Promise.resolve(new Response(JSON.stringify({ error: "refused before it started: the terms are not accepted", failure: { kind: "licence", cause: "licence", advice: "an admin accepts the terms", fix: null }, requirements: [{ check: "licence", ok: false, said: "terms not accepted" }] }), { status: 409 }));
      return Promise.resolve(new Response(JSON.stringify(PRE(true)), { status: 200 }));
    }) as typeof fetch;
    const c = capsOf(true);
    await draw({ ...c, engine: { ...c.engine!, doors: [...(c.engine!.doors ?? []), "GET /api/software"] } } as Capabilities);
    await act(async () => start().click());
    await settle();
    const links = el.querySelectorAll('.dialog-foot a[href="#settings/software"]');
    expect(links.length).toBeGreaterThan(0);
    expect(el.querySelector(".dialog-foot .requirements a.soft-link")).not.toBeNull();
  });
  it("says an engine from before does not check a run taken up again, and lets Start go", async () => {
    await draw(capsOf(false));
    expect(asked).toEqual([]);
    expect(el.textContent).toContain("This engine does not check a run taken up again before it goes.");
    expect(start().disabled).toBe(false);
  });
  it("runs a job's command again as a new run, checked by the run's own pre-flight", async () => {
    answers["POST /api/pipelines/samseg-lesions@1/preflight"] = () => ({ status: 200, body: { ...PRE(true), resume: null } });
    await draw(capsOf(false), { kind: "new", pipeline: "samseg-lesions@1", over: { selection: "t1-3d-stacks", version: 1 }, params: {}, command: ["run", "samseg-lesions@1", "--select", "selection:t1-3d-stacks@1"] });
    expect(asked[0]).toEqual({ method: "POST", path: "/api/pipelines/samseg-lesions@1/preflight", body: { select: "selection:t1-3d-stacks@1", params: {} } });
    await act(async () => start().click());
    await settle();
    expect(asked.find((a) => a.path === "/api/jobs")?.body).toEqual({ command: ["run", "samseg-lesions@1", "--select", "selection:t1-3d-stacks@1"] });
    expect(said).toEqual(["Queued again as job 51."]);
  });
});
