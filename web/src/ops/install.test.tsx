// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Install a missing tool from where its absence is said (2026-10-12): an
// admin presses Install dcm2niix beside a failed run's reason where its
// failure's fix names the engine's install; the engine fetches its pinned
// build, the version is said and Run again takes the run up again; anyone
// else reads a sentence asking an admin; an install that fails says the
// engine's reason whole, which says the way by hand; a refused pre-flight
// asks again once it is installed; a run the jobs door refused says why with
// its checks; Settings, Parts lists the tools as GET /api/tools answers them.
// Against a fake engine, in the engine's shapes.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { capsWith } from "../review/caps.fixture";
import { CatalogBody, RunDialog } from "./Catalog";
import type { Pipeline, Run } from "./catalog";
import { ADVICE, DCM2NIIX_FIX, failed, NO_CONVERTER, RUNTIME_OK } from "./failure.fixture";
import { forgetInstalled, ToolsSection } from "./Install";
import { RunView } from "./RunPage";
import { mayInstall, toolStatus } from "./tools";
import type { RunDetail } from "./runs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOOR = DCM2NIIX_FIX.door;
const PATH = DOOR.split(" ")[1];
const ERROR = "the release of the input failed: dcm2niix is not runnable (No such file or directory (os error 2)). dcm2niix is a prerequisite of a deployment.";
const RUN: Run = failed({ id: 12, pipeline_id: 3, pipeline: "n4-bias-correction@1", job_id: 40, selection: "selection:3d-t1-siemens@1", status: "failed", started_at: null, finished_at: null, summary: { units: { total: 0 } }, error: ERROR }, "dependency", "dcm2niix", ADVICE, DCM2NIIX_FIX);
const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "POST /api/jobs", "POST /api/pipelines/{name}/preflight", DOOR];
const ADMIN: Grant[] = ["pipelines:see", "pipelines:work", "install:work"];

/** dcm2niix as GET /api/tools answers it: here, or missing with the pinned build offered. */
const tool = (present: boolean, more: Record<string, unknown> = {}) => ({
  name: "dcm2niix",
  present,
  path: present ? "/srv/registry/tools/dcm2niix" : null,
  found_by: present ? "tools" : null,
  version: present ? "v1.0.20260724" : null,
  pinned: "v1.0.20260724",
  current: present ? true : null,
  problem: null,
  install: { door: DOOR, command: DCM2NIIX_FIX.command, grant: "install:work", available: true, into: "/srv/registry/tools", source: "https://github.com/rordenlab/dcm2niix/releases", sha256: "ab".repeat(32), why: null },
  ...more,
});

function capsOf(doors: string[], grants: Grant[], entry: unknown = undefined): Capabilities {
  const c = capsWith(doors, grants);
  return entry === undefined ? c : { ...c, engine: { ...c.engine!, tools: { dcm2niix: entry } } };
}

/** A fake engine: what was asked, and an answer per `METHOD path`. */
let asked: { method: string; path: string; body: unknown }[] = [];
let answers: Record<string, (body: unknown) => { status: number; body: unknown }> = {};
let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  // jsdom draws no modal: a dialog opened is one with the attribute
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  asked = [];
  answers = {
    [`POST ${PATH}`]: () => ({ status: 200, body: { installed: true, source: "https://github.com/rordenlab/dcm2niix/releases", tool: tool(true) } }),
    "POST /api/jobs": () => ({ status: 200, body: { job: 41, state: "queued" } }),
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
  forgetInstalled();
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const button = (words: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === words) ?? null;
const press = async (words: string) => {
  const b = button(words);
  expect(b, `a button ${words}`).not.toBeNull();
  await act(async () => b!.click());
  await settle();
};
/** Text typed into a field React holds, as a person types it. */
async function typeInto(input: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const runs = (caps: Capabilities, list: Run[] = [RUN]) => <CatalogBody caps={caps} pipelines={[]} capability={{ enabled: true }} runs={list} onRun={() => undefined} />;

describe("Install dcm2niix beside a failed run's reason", () => {
  it("installs it for an admin, says the version and takes the run up again", async () => {
    await act(async () => root.render(runs(capsOf(DOORS, ADMIN))));
    expect(el.querySelector(".fail-line")?.textContent).toContain(ADVICE);
    await press("Install dcm2niix");
    expect(asked.filter((a) => a.method === "POST" && a.path === PATH)).toEqual([{ method: "POST", path: PATH, body: null }]);
    expect(el.querySelector(".tool-said")?.textContent).toBe("dcm2niix v1.0.20260724 is installed at /srv/registry/tools/dcm2niix.Run again");
    expect(button("Install dcm2niix")).toBeNull();
    await press("Run again");
    expect(asked.find((a) => a.path === "/api/jobs")?.body).toEqual({ command: ["run", "--resume", "12"] });
    expect(el.querySelector(".tool-said")?.textContent).toContain("Run 12 is queued again as job 41.");
    expect(button("Run again")).toBeNull();
  });
  it("says the tool is there where the engine found one already, and on every run once one press installed it", async () => {
    answers[`POST ${PATH}`] = () => ({ status: 200, body: { installed: false, why: "dcm2niix was found already on the engine's search path and left as it is", tool: tool(true, { path: "/usr/bin/dcm2niix", found_by: "path" }) } });
    await act(async () => root.render(runs(capsOf(DOORS, ADMIN), [RUN, { ...RUN, id: 13 }])));
    expect([...el.querySelectorAll("button")].filter((b) => b.textContent === "Install dcm2niix")).toHaveLength(2);
    await press("Install dcm2niix");
    expect(button("Install dcm2niix")).toBeNull();
    expect([...el.querySelectorAll(".tool-said")].map((e) => e.textContent)).toEqual(Array(2).fill("dcm2niix v1.0.20260724 is installed at /usr/bin/dcm2niix.Run again"));
    // the capabilities saying it present: Run again, never Install
    forgetInstalled();
    await act(async () => root.render(runs(capsOf(DOORS, ["pipelines:see", "pipelines:work"], tool(true)))));
    expect(button("Install dcm2niix")).toBeNull();
    expect(el.querySelector(".tool-said")?.textContent).toBe("dcm2niix v1.0.20260724 is installed at /srv/registry/tools/dcm2niix.Run again");
  });
  it("asks an admin, for anyone else; and offers nothing where the engine has no door, or names no fix", async () => {
    await act(async () => root.render(runs(capsOf(DOORS, ["pipelines:see", "pipelines:work"]))));
    expect(button("Install dcm2niix")).toBeNull();
    expect(el.querySelector(".tool-said")?.textContent).toBe("Ask an admin to install dcm2niix.");
    await act(async () => root.render(runs(capsOf(DOORS.filter((d) => d !== DOOR), ADMIN))));
    expect(el.querySelector(".tool-said")).toBeNull();
    // today's engine says no failure: the line, never an install; nor a failure of memory
    const today: Run = { ...RUN, failure: undefined } as Run;
    await act(async () => root.render(runs(capsOf(DOORS, ADMIN), [today, failed({ ...RUN, id: 13, error: "the container was killed: out of memory" }, "resource", "memory", "Give the lane more memory.")])));
    expect(el.querySelectorAll(".fail-row")).toHaveLength(2);
    expect(button("Install dcm2niix")).toBeNull();
  });
  it("says the engine's reason whole when the install fails offline, the way by hand in it, and the command", async () => {
    const offline = "The releases could not be reached (no route to host). By hand: fetch dcm2niix_lnx.zip from github.com/rordenlab/dcm2niix/releases/tag/v1.0.20260724, check its sha256 is abab, and put dcm2niix in /srv/registry/tools.";
    answers[`POST ${PATH}`] = () => ({ status: 502, body: { error: offline, offline: true, failure: { kind: "dependency", cause: "dcm2niix", advice: ADVICE, fix: DCM2NIIX_FIX } } });
    await act(async () => root.render(runs(capsOf(DOORS, ADMIN))));
    await press("Install dcm2niix");
    const said = el.querySelector(".tool-said")!.textContent!;
    expect(said).toContain(`dcm2niix was not installed: ${offline}`);
    expect(said).toContain("At the command line: nils tools install dcm2niix");
    expect(button("Try again")).not.toBeNull();
  });
  it("is beside the reason on the run's page, with Run again", async () => {
    const detail = { ...(RUN as unknown as RunDetail), units_run: [] };
    let again = 0;
    await act(async () =>
      root.render(
        <RunView caps={capsOf(DOORS, ADMIN)} run={detail} pipeline={null} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} onAgain={async () => `again ${++again}`} />,
      ),
    );
    expect(el.querySelector(".fail-note .note-lead")?.textContent).toBe(`dependency${ADVICE}`);
    await press("Install dcm2niix");
    await press("Run again");
    expect(again).toBe(1);
    expect(el.querySelector(".fail-note .tool-said")?.textContent).toContain("again 1");
  });
});

const N4: Pipeline = { id: 3, name: "n4-bias-correction", version: "1", label: "n4-bias-correction@1", image: "x@sha256:00", layout: "bids", level: "session", state: "active", parameters: [] };
const NOT_READY = { pipeline: N4.label, units: { total: 6, ready: 6, missing: 0 }, ready: false, blockers: [NO_CONVERTER.said], requirements: [NO_CONVERTER, RUNTIME_OK], failure: NO_CONVERTER.failure };
const READY = { pipeline: N4.label, units: { total: 6, ready: 6, missing: 0 }, ready: true, blockers: [], requirements: [{ ...NO_CONVERTER, ok: true, said: "v1.0.20260724 at /srv/registry/tools/dcm2niix (in the registry's tools folder)", failure: null }, RUNTIME_OK], failure: null };

describe("the run form", () => {
  const open = async () => {
    answers["GET /api/ask/selections/3d-t1-siemens%401"] = () => ({ status: 200, body: { name: "3d-t1-siemens", version: 1 } });
    await act(async () => root.render(<RunDialog caps={capsOf([...DOORS, "GET /api/ask/selections/{name}"], ADMIN)} pipeline={N4} onClose={() => undefined} onDone={() => undefined} />));
    const field = el.querySelector<HTMLInputElement>('input[aria-label="What the run goes over"]')!;
    await act(async () => field.focus());
    await typeInto(field, "3d-t1-siemens@1");
    await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await settle();
    await act(async () => new Promise((r) => setTimeout(r, 350)));
    await settle();
  };
  it("lists the pre-flight's checks, offers Install on the one that fails, and asks again once it is installed", async () => {
    let checks = 0;
    answers["POST /api/pipelines/3/preflight"] = () => ({ status: 200, body: ++checks === 1 ? NOT_READY : READY });
    await open();
    expect([...el.querySelectorAll(".requirements .req")].map((r) => `${r.className}: ${r.querySelector(".req-check")?.textContent}`)).toEqual(["req not: converter", "req ok: runtime"]);
    expect(el.querySelector(".preflight .fail-said")?.textContent).toBe(`dependency${ADVICE}`);
    expect(el.querySelector<HTMLButtonElement>(".dialog-foot .button:not(.secondary)")?.disabled).toBe(true);
    await press("Install dcm2niix");
    await act(async () => new Promise((r) => setTimeout(r, 350)));
    await settle();
    expect(checks).toBe(2);
    expect([...el.querySelectorAll(".requirements .req")].map((r) => r.className)).toEqual(["req ok", "req ok"]);
    expect(el.querySelector(".note.brand.preflight .note-lead")?.textContent).toBe("Pre-flight");
  });
  it("says why the jobs door refused a run, with its checks, and queues nothing", async () => {
    answers["POST /api/pipelines/3/preflight"] = () => ({ status: 200, body: READY });
    answers["POST /api/jobs"] = () => ({ status: 409, body: { error: `refused before it started: ${NO_CONVERTER.said}; ${ADVICE}`, failure: NO_CONVERTER.failure, requirements: [NO_CONVERTER, RUNTIME_OK] } });
    await open();
    await press("Run");
    const note = el.querySelector(".dialog-foot .fail-note")!;
    expect(note.querySelector(".note-lead")?.textContent).toBe("Not queued");
    expect(note.querySelector(".fail-said")?.textContent).toBe(`dependency${ADVICE}`);
    // only the checks that fail: the pre-flight listed them all
    expect([...note.querySelectorAll(".req")].map((r) => `${r.className}: ${r.querySelector(".req-check")?.textContent}`)).toEqual(["req not: converter"]);
    expect(note.querySelector("button")?.textContent).toBe("Install dcm2niix");
  });
});

describe("Settings, Parts", () => {
  it("lists the tools as GET /api/tools answers them: dcm2niix with its version and where it was found", async () => {
    answers["GET /api/tools"] = () => ({ status: 200, body: { tools: [tool(true)] } });
    await act(async () => root.render(<ToolsSection caps={capsOf([...DOORS, "GET /api/tools"], ADMIN)} onChanged={() => undefined} />));
    await settle();
    expect(el.querySelector("table.tools tbody")?.textContent).toBe("dcm2niixv1.0.20260724/srv/registry/tools/dcm2niixin the registry's tools folder");
    expect(button("Install dcm2niix")).toBeNull();
  });
  it("says it is missing, with Install for an admin, then its version; or why no build is offered here", async () => {
    let read = 0;
    let listed = 0;
    answers["GET /api/tools"] = () => ({ status: 200, body: { tools: [tool(++listed > 1)] } });
    await act(async () => root.render(<ToolsSection caps={capsOf([...DOORS, "GET /api/tools"], ADMIN)} onChanged={() => read++} />));
    await settle();
    expect(el.querySelector("table.tools .tag.caution")?.textContent).toBe("missing");
    await press("Install dcm2niix");
    expect(read).toBe(1);
    expect(el.querySelector("table.tools tbody")?.textContent).toContain("v1.0.20260724");
    expect(listed).toBe(2);
    // no build pinned for this machine: why, and no Install
    answers["GET /api/tools"] = () => ({ status: 200, body: { tools: [tool(false, { install: { ...tool(false).install, available: false, why: "no dcm2niix build is pinned for Linux on arm; install one by hand" } })] } });
    await act(async () => root.render(<ToolsSection key="arm" caps={capsOf([...DOORS, "GET /api/tools"], ADMIN)} onChanged={() => undefined} />));
    await settle();
    expect(button("Install dcm2niix")).toBeNull();
    expect(el.querySelector("table.tools .tool-said")?.textContent).toBe("no dcm2niix build is pinned for Linux on arm; install one by hand");
  });
  it("reads the capabilities' entry where the list is not served, and draws nothing where neither says a tool", async () => {
    const caps = capsOf(DOORS, ADMIN, tool(true, { current: false, version: "v1.0.20240202" }));
    expect(toolStatus(caps, "dcm2niix")).toMatchObject({ name: "dcm2niix", present: true, version: "v1.0.20240202", current: false });
    await act(async () => root.render(<ToolsSection caps={caps} onChanged={() => undefined} />));
    expect(el.querySelector("table.tools tbody")?.textContent).toContain("this engine pins v1.0.20260724");
    await act(async () => root.render(<ToolsSection caps={capsOf(DOORS, ADMIN)} onChanged={() => undefined} />));
    expect(el.innerHTML).toBe("");
  });
  it("offers Install only to a person who holds the grant the fix names, where its door is served", () => {
    expect(mayInstall(capsOf(DOORS, ADMIN), DCM2NIIX_FIX)).toBe(true);
    expect(mayInstall(capsOf(DOORS, ["pipelines:work"]), DCM2NIIX_FIX)).toBe(false);
    expect(mayInstall(capsOf(DOORS, ["pipelines:work"]), { ...DCM2NIIX_FIX, grant: "pipelines:work" })).toBe(true);
    expect(mayInstall(capsOf(DOORS.filter((d) => d !== DOOR), ADMIN), DCM2NIIX_FIX)).toBe(false);
    expect(mayInstall(capsOf(DOORS, ADMIN), null)).toBe(false);
  });
});
