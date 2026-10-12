// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Install a missing tool from where its absence is said (2026-10-12): an
// admin presses Install dcm2niix beside a failed run's reason, the engine
// installs its pinned build, the version is said and Run again takes the run
// up again; anyone else reads a sentence asking an admin; an install that
// fails says the engine's reason and the way by hand; a refused pre-flight
// asks again once it is installed; Settings, Parts lists the tool with its
// version, or missing with Install. Against a fake engine, by SLICE's names.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { capsWith } from "../review/caps.fixture";
import { CatalogBody, RunDialog } from "./Catalog";
import type { Pipeline, Run } from "./catalog";
import { SLICE } from "./failure";
import { withSlice } from "./failure.fixture";
import { forgetInstalled, ToolsSection } from "./Install";
import { RunView } from "./RunPage";
import { installDoor, mayInstall, toolStatus } from "./tools";
import type { RunDetail } from "./runs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOOR = installDoor("dcm2niix");
const PATH = DOOR.split(" ")[1];
const ERROR = "the release of the input failed: dcm2niix is not runnable (No such file or directory (os error 2)). dcm2niix is a prerequisite of a deployment.";
const TODO = "Install dcm2niix where the engine runs.";
const RUN: Run = withSlice({ id: 12, pipeline_id: 3, pipeline: "n4-bias-correction@1", job_id: 40, selection: "selection:3d-t1-siemens@1", status: "failed", started_at: null, finished_at: null, summary: { units: { total: 0 } }, error: ERROR }, { kind: "dependency", todo: TODO });
const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "POST /api/jobs", "POST /api/pipelines/{name}/preflight", DOOR];
const ADMIN: Grant[] = ["pipelines:see", "pipelines:work", "install:work"];

function capsOf(doors: string[], grants: Grant[], status: unknown = undefined): Capabilities {
  const c = capsWith(doors, grants);
  if (status === undefined) return c;
  // the status sits at SLICE.status with the tool's name in it
  const path = SLICE.status.replace("{tool}", "dcm2niix").split(".");
  const engine = structuredClone(c.engine!) as Record<string, unknown>;
  let o = engine;
  for (const k of path.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[path[path.length - 1]] = status;
  return { ...c, engine: engine as Capabilities["engine"] };
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
    [`POST ${PATH}`]: () => ({ status: 200, body: withSlice({}, { present: true, path: "/usr/local/bin/dcm2niix", version: "v1.0.20250506" }) }),
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
const runs = (caps: Capabilities) => <CatalogBody caps={caps} pipelines={[]} capability={{ enabled: true }} runs={[RUN]} onRun={() => undefined} />;

describe("Install dcm2niix beside a failed run's reason", () => {
  it("installs it for an admin, says the version and takes the run up again", async () => {
    await act(async () => root.render(runs(capsOf(DOORS, ADMIN))));
    expect(el.querySelector(".fail-line")?.textContent).toContain(TODO);
    await press("Install dcm2niix");
    expect(asked.filter((a) => a.method === "POST" && a.path === PATH)).toHaveLength(1);
    expect(el.querySelector(".tool-said")?.textContent).toBe("dcm2niix v1.0.20250506 is installed at /usr/local/bin/dcm2niix.Run again");
    expect(button("Install dcm2niix")).toBeNull();
    await press("Run again");
    expect(asked.find((a) => a.path === "/api/jobs")?.body).toEqual({ command: ["run", "--resume", "12"] });
    expect(el.querySelector(".tool-said")?.textContent).toContain("Run 12 is queued again as job 41.");
    expect(button("Run again")).toBeNull();
  });
  it("says the tool is there on every failed run once one press installed it, and where the capabilities say it is present", async () => {
    const two = (caps: Capabilities) => <CatalogBody caps={caps} pipelines={[]} capability={{ enabled: true }} runs={[RUN, { ...RUN, id: 13 }]} onRun={() => undefined} />;
    await act(async () => root.render(two(capsOf(DOORS, ADMIN))));
    expect([...el.querySelectorAll("button")].filter((b) => b.textContent === "Install dcm2niix")).toHaveLength(2);
    await press("Install dcm2niix");
    expect(button("Install dcm2niix")).toBeNull();
    expect([...el.querySelectorAll(".tool-said")].map((e) => e.textContent)).toEqual(Array(2).fill("dcm2niix v1.0.20250506 is installed at /usr/local/bin/dcm2niix.Run again"));
    forgetInstalled();
    await act(async () => root.render(two(capsOf(DOORS, ["pipelines:see", "pipelines:work"], withSlice({}, { present: true, version: "v1.0.20250506" })))));
    expect(button("Install dcm2niix")).toBeNull();
    expect(el.querySelector(".tool-said")?.textContent).toBe("dcm2niix v1.0.20250506 is installed.Run again");
  });
  it("asks an admin, for anyone else; and offers nothing where the engine has no door", async () => {
    await act(async () => root.render(runs(capsOf(DOORS, ["pipelines:see", "pipelines:work"]))));
    expect(button("Install dcm2niix")).toBeNull();
    expect(el.querySelector(".tool-said")?.textContent).toBe("Ask an admin to install dcm2niix.");
    await act(async () => root.render(runs(capsOf(DOORS.filter((d) => d !== DOOR), ADMIN))));
    expect(el.querySelector(".tool-said")).toBeNull();
    expect(button("Install dcm2niix")).toBeNull();
  });
  it("is offered for a dependency the engine names in its words alone, and not for another kind", async () => {
    const plain: Run = { ...RUN, [SLICE.kind]: undefined, [SLICE.todo]: undefined } as Run;
    await act(async () => root.render(<CatalogBody caps={capsOf(DOORS, ADMIN)} pipelines={[]} capability={{ enabled: true }} runs={[plain, withSlice({ ...RUN, id: 13, error: "the container was killed: out of memory" }, { kind: "resource", todo: "Give the lane more memory." })]} onRun={() => undefined} />));
    expect(el.querySelectorAll(".fail-row")).toHaveLength(2);
    expect([...el.querySelectorAll("button")].filter((b) => b.textContent === "Install dcm2niix")).toHaveLength(1);
  });
  it("says the engine's reason and the way by hand when the install fails", async () => {
    answers[`POST ${PATH}`] = () => ({ status: 502, body: withSlice({ error: "the download of dcm2niix failed: no route to github.com. The engine is offline." }, { kind: "dependency" }) });
    await act(async () => root.render(runs(capsOf(DOORS, ADMIN))));
    await press("Install dcm2niix");
    const said = el.querySelector(".tool-said")!.textContent!;
    expect(said).toContain("dcm2niix was not installed: the download of dcm2niix failed: no route to github.com.");
    expect(said).toContain("By hand: install a current build from github.com/rordenlab/dcm2niix where the engine runs, on its path.");
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
    expect(el.querySelector(".fail-note .note-lead")?.textContent).toBe(`dependency${TODO}`);
    await press("Install dcm2niix");
    await press("Run again");
    expect(again).toBe(1);
    expect(el.querySelector(".fail-note .tool-said")?.textContent).toContain("again 1");
  });
});

const N4: Pipeline = { id: 3, name: "n4-bias-correction", version: "1", label: "n4-bias-correction@1", image: "x@sha256:00", layout: "bids", level: "session", state: "active", parameters: [] };

describe("a refused pre-flight", () => {
  it("offers Install and asks again once it is installed", async () => {
    let checks = 0;
    answers["GET /api/ask/selections/3d-t1-siemens%401"] = () => ({ status: 200, body: { name: "3d-t1-siemens", version: 1 } });
    answers["POST /api/pipelines/3/preflight"] = () =>
      ++checks === 1 ? { status: 400, body: withSlice({ error: ERROR }, { kind: "dependency", todo: TODO }) } : { status: 200, body: { pipeline: N4.label, units: { total: 6, ready: 6, missing: 0 }, ready: true } };
    await act(async () => root.render(<RunDialog caps={capsOf([...DOORS, "GET /api/ask/selections/{name}"], ADMIN)} pipeline={N4} onClose={() => undefined} onDone={() => undefined} />));
    await typeInto(el.querySelector<HTMLInputElement>('input[aria-label="The selection"]')!, "3d-t1-siemens@1");
    await press("Find");
    await act(async () => new Promise((r) => setTimeout(r, 350)));
    await settle();
    expect(el.querySelector(".fail-note")?.textContent).toContain(TODO);
    await press("Install dcm2niix");
    await act(async () => new Promise((r) => setTimeout(r, 350)));
    await settle();
    expect(checks).toBe(2);
    expect(el.querySelector(".fail-note")).toBeNull();
    expect(el.querySelector(".note.brand.preflight")?.textContent).toContain("6 of 6 ready");
  });
});

describe("Settings, Parts", () => {
  it("lists dcm2niix with its version and where it is, as the capabilities say", async () => {
    const caps = capsOf(DOORS, ADMIN, withSlice({}, { present: true, path: "/opt/dcm2niix/bin/dcm2niix", version: "v1.0.20250506" }));
    expect(toolStatus(caps, "dcm2niix")).toEqual({ tool: "dcm2niix", present: true, path: "/opt/dcm2niix/bin/dcm2niix", version: "v1.0.20250506" });
    await act(async () => root.render(<ToolsSection caps={caps} onChanged={() => undefined} />));
    expect(el.querySelector("table.tools tbody")?.textContent).toBe("dcm2niixv1.0.20250506/opt/dcm2niix/bin/dcm2niix");
    expect(button("Install dcm2niix")).toBeNull();
  });
  it("says it is missing, with Install for an admin, then its version", async () => {
    let read = 0;
    await act(async () => root.render(<ToolsSection caps={capsOf(DOORS, ADMIN, withSlice({}, { present: false }))} onChanged={() => read++} />));
    expect(el.querySelector("table.tools .tag.caution")?.textContent).toBe("missing");
    await press("Install dcm2niix");
    expect(read).toBe(1);
    expect(el.querySelector("table.tools tbody")?.textContent).toContain("v1.0.20250506");
  });
  it("offers Install only to a person who holds the door's grant", () => {
    expect(mayInstall(capsOf(DOORS, ADMIN), "dcm2niix")).toBe(true);
    expect(mayInstall(capsOf(DOORS, ["pipelines:work"]), "dcm2niix")).toBe(false);
    const ruled = capsOf(DOORS, ["pipelines:work"]);
    ruled.engine!.policy = [{ door: DOOR, grant: ["install:work", "pipelines:work"], writes: true, idempotent: false, cost: "job", result_cap: "", label: { present: "installing", past: "installed" } }];
    expect(mayInstall(ruled, "dcm2niix")).toBe(true);
    expect(mayInstall(capsOf(DOORS.filter((d) => d !== DOOR), ADMIN), "dcm2niix")).toBe(false);
  });
  it("draws nothing where the engine says nothing of the tool and has no door", async () => {
    await act(async () => root.render(<ToolsSection caps={capsOf(DOORS.filter((d) => d !== DOOR), ADMIN)} onChanged={() => undefined} />));
    expect(el.innerHTML).toBe("");
  });
});
