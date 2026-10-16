// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Catalog's runtime and starters, and a run's seeds (gate T31,
// walkthrough step 15.8): read by whoever sees pipelines, changed by a
// person with install work at the engine's doors, and a run's suggested
// scans saved as a selection at the ask's own door, as `nils pipeline seeds
// --save` saves them.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { RunSeeds, RuntimePanel, StartersPanel } from "./PipelineRuntime";
import { seedsAsk, seedsSuggested, seedsWords, startersWords } from "./pipelineSetup";

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

const DOORS = ["GET /api/pipelines/runtime", "PUT /api/pipelines/runtime", "GET /api/pipelines/starters", "PUT /api/pipelines/starters", "POST /api/pipelines/starters/seed", "GET /api/pipeline-runs/{id}/seeds", "PUT /api/ask/selections/{name}"];
const RT = { choice: "auto", choices: ["auto", "apptainer-first", "podman", "apptainer", "docker", "off"], apptainer_image: "sif", apptainer_images: ["sif", "sandbox"], capability: { enabled: true, runtime: { name: "podman", version: "5.4.0", gpu: null } } };
const STARTERS = (seeding: string, held: number) => ({ seeding, starters: ["mriqc", "synthseg", "synthstrip"].map((name, i) => ({ name, digest: "d", image: "i", state: i < held ? `in the catalog as ${name}@1` : "absent" })) });
const SEEDS = { run: 7, seeds: [{ stack_id: 3, axis: "body_part", value: "brain" }, { stack_id: 4, axis: "body_part", value: "brain" }, { stack_id: 5, axis: "body_part", value: "spine" }], per_value: { "body_part=brain": 2, "body_part=spine": 1 }, selection: { stacks: [3, 5] }, withheld: 0 };

const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

describe("the words", () => {
  it("say the starters, the seeds and whether a run suggested any", () => {
    expect(startersWords(STARTERS("on", 2) as never)).toBe("seeded at start: on · 2 of 3 in the catalog");
    expect(seedsWords(SEEDS)).toBe("3 values suggested (body_part brain 2, body_part spine 1) over 2 scans");
    expect(seedsSuggested({ seeds: { seeds: 0, outside: 0, selection: 2 } })).toBe(true);
    expect(seedsSuggested({ seeds: null })).toBe(false);
    expect(seedsAsk([3, 5])).toEqual({ ast_version: 1, sets: { seeded: { grain: "stack", where: [["in", {}, ["field", {}, "id"], [3, 5]]] } }, out: { set: "seeded", level: "record" } });
  });
});

describe("the runtime", () => {
  it("is read by whoever sees pipelines, with no Change without install work", async () => {
    engine((c) => (c.url === "/api/pipelines/runtime" ? { status: 200, body: RT } : undefined));
    act(() => root.render(<RuntimePanel caps={caps7a(DOORS, ["pipelines:see"])} />));
    await settle();
    expect(host.textContent).toContain("podman 5.4.0 · chosen: auto · images as sif");
    expect(button(host, /^Change$/u)).toBeFalsy();
  });

  it("is chosen by an admin, sending only what changed", async () => {
    const e = engine((c) => (c.url === "/api/pipelines/runtime" ? { status: 200, body: c.method === "PUT" ? { ...RT, choice: "off", capability: { enabled: false, reason: "pipelines are off" } } : RT } : undefined));
    act(() => root.render(<RuntimePanel caps={caps7a(DOORS)} />));
    await settle();
    act(() => button(host, /^Change$/u)!.click());
    await settle();
    const dialog = host.querySelector("dialog[open]")!;
    expect(button(dialog, /^Save$/u)!.disabled).toBe(true);
    await choose(dialog.querySelectorAll("select")[0] as HTMLSelectElement, "off");
    act(() => button(dialog, /^Save$/u)!.click());
    await settle();
    expect(e.of("PUT", "/api/pipelines/runtime").map((c) => c.body)).toEqual([{ choice: "off" }]);
    expect(host.textContent).toContain("pipelines are off · chosen: off");
  });
});

describe("the starters", () => {
  it("are seeded now and turned off at start by an admin", async () => {
    const e = engine((c) => {
      if (c.url === "/api/pipelines/starters" && c.method === "GET") return { status: 200, body: STARTERS("on", 1) };
      if (c.url === "/api/pipelines/starters/seed") return { status: 200, body: { ...STARTERS("on", 3), added: [{ id: 1, label: "synthseg@1", image: "i" }, { id: 2, label: "synthstrip@1", image: "i" }] } };
      if (c.url === "/api/pipelines/starters" && c.method === "PUT") return { status: 200, body: STARTERS("off", 3) };
      return undefined;
    });
    act(() => root.render(<StartersPanel caps={caps7a(DOORS)} />));
    await settle();
    expect(host.textContent).toContain("seeded at start: on · 1 of 3 in the catalog");
    act(() => button(host, /^Seed now$/u)!.click());
    await settle();
    expect(host.textContent).toContain("Added synthseg@1, synthstrip@1.");
    expect(button(host, /^Seed now$/u)).toBeFalsy();
    act(() => button(host, /^Stop seeding at start$/u)!.click());
    await settle();
    expect(e.of("PUT", "/api/pipelines/starters").map((c) => c.body)).toEqual([{ seeding: "off" }]);
    expect(button(host, /^Seed at start$/u)).toBeTruthy();
  });

  it("offer no change to a person who only sees pipelines", async () => {
    engine((c) => (c.url === "/api/pipelines/starters" ? { status: 200, body: STARTERS("on", 1) } : undefined));
    act(() => root.render(<StartersPanel caps={caps7a(DOORS, ["pipelines:see"])} />));
    await settle();
    expect(button(host, /^Seed now$/u)).toBeFalsy();
    expect(button(host, /seeding at start/u)).toBeFalsy();
  });
});

describe("a run's seeds", () => {
  it("are saved as a selection of the suggested scans", async () => {
    const e = engine((c) => {
      if (c.url === "/api/pipeline-runs/7/seeds") return { status: 200, body: SEEDS };
      if (c.method === "PUT" && c.url === "/api/ask/selections/run-7-to-curate") return { status: 200, body: { id: 1, name: "run-7-to-curate", version: 1, hash: "h" } };
      return undefined;
    });
    act(() => root.render(<RunSeeds caps={caps7a(DOORS)} run={7} suggested />));
    await settle();
    expect(host.textContent).toContain("3 values suggested");
    act(() => button(host, /^Save as a selection$/u)!.click());
    await settle();
    act(() => button(host.querySelector("dialog[open]")!, /^Save$/u)!.click());
    await settle();
    const [put] = e.of("PUT", "/api/ask/selections/run-7-to-curate");
    expect(put.body).toEqual({ document: seedsAsk([3, 5]), note: "the stacks pipeline run 7 suggests curating" });
    expect(host.textContent).toContain("Saved as selection run-7-to-curate, version 1");
  });

  it("are not read for a run that suggested none", async () => {
    const e = engine(() => undefined);
    act(() => root.render(<RunSeeds caps={caps7a(DOORS)} run={7} suggested={false} />));
    await settle();
    expect(e.calls).toHaveLength(0);
    expect(host.textContent).toBe("");
  });
});
