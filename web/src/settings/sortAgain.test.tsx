// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Sort again, on the Parts page's rules row (gate T31, walkthrough step 9.5):
// a rules release changes what the engine sorts from now on, and the scans
// already sorted keep their answers until they are sorted again. The row
// offers the sort to a person with work on Pipelines; the dialog says what it
// will judge before it runs, and nothing is queued until it is pressed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import { Settings } from "./Settings";
import type { Install, PartRelease } from "./supervise";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  // nothing else on the page is asked a door it does not serve
  engine(() => undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};

function caps(over: { grants?: readonly Grant[]; doors?: string[]; packs?: { name: string; version: string }[] } = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.86" },
      contracts: { openapi: "7", suite: "3" },
      doors: over.doors ?? ["POST /api/jobs", "GET /api/summary", "GET /api/jobs"],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 0 },
      packs: over.packs ?? [{ name: "mri", version: "1.2.3" }],
      uptime_seconds: 3_600,
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "admin", display_name: "admin", grants: [...(over.grants ?? SETS.admin.grants)], detail: "sensitive", groups: ["Admins"] },
    desk: { version: "1.0.0-alpha.65", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

const mri: PartRelease = { part: "rules", pack: "mri", installed: "1.2.3", newest: "1.2.3", newer: null, held: null, follows: null, error: null, command: "nils update --part rules", waits: null, edited: false, pinned: null };
const engineRelease: PartRelease = { part: "engine", installed: "1.0.0-alpha.86", newest: "1.0.0-alpha.86", newer: null, held: null, follows: null, error: null, command: "nils update --part engine" };

function install(rules: PartRelease[] = [mri]): Install {
  return {
    record: "/home/ada/.config/nils/setup.toml",
    dir: "/home/ada/nils",
    runtime: "machine",
    service: "systemd user units",
    reach: "loopback",
    backend: "sqlite",
    mode: "local",
    at: "2026-10-16T01:00:00Z",
    ports: { engine: 8437, desk: 7200 },
    parts: { engine: { version: "1.0.0-alpha.86", kind: "binary", path: "/home/ada/.local/bin/nils" } },
    places: [],
    oidc: null,
    addresses: [],
    services: [{ part: "engine", unit: "nils-engine", watcher: "systemd", running: true }],
    unfinished: false,
    release: { installed: "1.0.0-alpha.86", newest: "1.0.0-alpha.86", newer: null, error: null, command: "nils update --all", behind: [], parts: [engineRelease, ...rules], rules },
    machine: { card: null, advice: [] },
  };
}

const SUMMARY = {
  epoch: 9,
  synthetic: null,
  cohorts: 2,
  subjects: { total: 8000, by_cohort: {} },
  sessions: { total: 12000, by_cohort: {}, window_days: 30 },
  stacks: { total: 37059, by_cohort: {}, by_pack_version: { "1.2.2": 36100, "1.2.3": 959 } },
  since: null,
};

const draw = async (c: Capabilities, i: Install = install()) => {
  await act(async () => root.render(<Settings caps={c} install={i} checkedAt={Date.now()} page="parts" onChanged={() => undefined} />));
  await settle();
};
const opener = () => host.querySelectorAll<HTMLButtonElement>('button[aria-label^="Sort again under"]');
const dialog = () => host.querySelector("dialog[open]")!;

describe("Sort again, on the rules row", () => {
  it("is offered on a rules row, and on no other, to a person with work on Pipelines", async () => {
    await draw(caps());
    expect([...opener()].map((b) => b.getAttribute("aria-label"))).toEqual(["Sort again under MRI rules"]);
    // beside the rules' own version, in its own row
    const row = opener()[0].closest("tr")!;
    expect(row.textContent).toContain("mri 1.2.3");
    expect(row.textContent).toContain("MRI rules");
    expect(host.querySelectorAll("tr").length).toBeGreaterThan(1);
  });

  it("is not offered to a person without work on Pipelines, nor where the engine queues no jobs, nor on an engine without rules rows", async () => {
    await draw(caps({ grants: ["install:see", "install:work", "pipelines:see"] }));
    expect(opener()).toHaveLength(0);
    await draw(caps({ doors: ["GET /api/summary"] }));
    expect(opener()).toHaveLength(0);
    await draw(caps(), install([]));
    expect(opener()).toHaveLength(0);
  });

  it("says what it will sort before it runs, and queues nothing until it is pressed", async () => {
    const e = engine((c) => (c.url === "/api/summary" ? { status: 200, body: SUMMARY } : undefined));
    await draw(caps());
    click(opener()[0]);
    await settle();
    expect(e.of("GET", "/api/summary")).toHaveLength(1);
    expect(dialog().textContent).toContain("Sorts all 37,059 scans again under MRI rules 1.2.3.");
    expect(dialog().textContent).toContain("36,100 were sorted under other rules.");
    // the one explanation lives on a hover, and says what stays
    expect(dialog().querySelector('[role="note"]')?.getAttribute("aria-label")).toContain("What people decided stays");
    expect(e.of("POST", "/api/jobs")).toHaveLength(0);
    click(button(dialog(), "Cancel"));
    await settle();
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(e.of("POST", "/api/jobs")).toHaveLength(0);
  });

  it("queues the engine's classify over every scan under the pack, named for it, and says the job", async () => {
    const e = engine((c) => {
      if (c.url === "/api/summary") return { status: 200, body: SUMMARY };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 202, body: { job: 301, state: "queued" } };
      return undefined;
    });
    await draw(caps());
    click(opener()[0]);
    await settle();
    click(button(dialog(), "Sort again"));
    await settle();
    expect(e.of("POST", "/api/jobs").map((c) => c.body)).toEqual([{ command: ["classify", "--pack", "mri", "--name", "pack-mri-1.2.3"], name: "pack-mri-1.2.3" }]);
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(host.textContent).toContain("Sorting every scan again under MRI rules 1.2.3 is queued as job 301.");
  });

  it("says every scan, without a count, where the engine gives no summary, and still sorts", async () => {
    const e = engine((c) => (c.method === "POST" && c.url === "/api/jobs" ? { status: 202, body: { job: 7, state: "queued" } } : undefined));
    await draw(caps({ doors: ["POST /api/jobs"] }));
    click(opener()[0]);
    await settle();
    expect(e.of("GET", "/api/summary")).toHaveLength(0);
    expect(dialog().textContent).toContain("Sorts every scan again under MRI rules 1.2.3.");
    click(button(dialog(), "Sort again"));
    await settle();
    expect(e.of("POST", "/api/jobs")).toHaveLength(1);
  });

  it("says the engine's refusal in place, and keeps the dialog to try again", async () => {
    engine((c) => {
      if (c.url === "/api/summary") return { status: 200, body: SUMMARY };
      if (c.method === "POST" && c.url === "/api/jobs") return { status: 403, body: { error: "no grant: classify needs pipelines:work" } };
      return undefined;
    });
    await draw(caps());
    click(opener()[0]);
    await settle();
    click(button(dialog(), "Sort again"));
    await settle();
    expect(dialog().textContent).toContain("no grant: classify needs pipelines:work");
    expect(button(dialog(), "Sort again")!.disabled).toBe(false);
  });
});
