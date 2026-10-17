// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Gate T31 (record 55 ruling 35 (c)): the setup steps the desk printed are
// buttons where the supervisor makes them. On Backups, a restore is one
// button and an archive is put back only once the dialog is pressed; the
// engine is given a folder; and with no supervisor, or one older than the
// buttons, the command stays under one line that says why. On Parts and the
// Engine page the by-hand twins are gone where a supervisor does the work,
// and stay where the install runs no services (step 19.3). A person who may
// not work on the install reads who makes a step, never a command or "at the
// machine", supervisor or none; and Backups prints back up and rehearse only
// where the engine queues no jobs, so no button can (G2).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import { Settings } from "./Settings";
import type { Backups } from "./database";
import type { Change, Install } from "./supervise";

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

const DOORS = ["GET /api/backups", "GET /api/status", "POST /api/jobs", "GET /api/jobs"];

/** A person with these grants; `supervisor` names the one the desk is configured with, `assistant` an assistant that answers while Kvasir does not. */
function caps(grants: readonly Grant[] = SETS.admin.grants, more: { doors?: string[]; supervisor?: string; assistant?: boolean } = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.88" },
      contracts: { openapi: "7", suite: "3" },
      doors: more.doors ?? DOORS,
      policy: [],
      auth: "oidc",
      principal: "astrid@desk",
      roles: [],
      registry: { epoch: 4 },
      packs: [{ name: "mri", version: "1.3.0" }],
      uptime_seconds: 3_600,
      backup_dir: true,
      ingest_roots: [],
    },
    kvasir: null,
    assistant: more.assistant ? { stations: [{ id: "concierge" }] } : null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: [...grants], detail: "sensitive", groups: ["Admins"] },
    desk: {
      version: "1.0.0-alpha.69",
      mode: "local",
      contracts: {},
      engine_reachable: true,
      contract_mismatch: null,
      login: null,
      signed_in: true,
      ...(more.supervisor ? { settings: { origin: "http://127.0.0.1:7200", supervisor_url: more.supervisor } } : {}),
    },
  } as unknown as Capabilities;
}

function install(over: Partial<Install> = {}, served: Change[] = ["signin", "backups", "model", "restore"], wait: string | null = null): Install {
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
    parts: { engine: { version: "1.0.0-alpha.88", kind: "binary", path: "/home/ada/.local/bin/nils" } },
    places: [],
    oidc: null,
    addresses: [],
    services: [
      { part: "engine", unit: "nils-engine", watcher: "systemd", running: true },
      { part: "desk", unit: "nils-desk", watcher: "systemd", running: true },
    ],
    unfinished: false,
    release: { installed: "1.0.0-alpha.87", newest: "1.0.0-alpha.88", newer: "1.0.0-alpha.88", error: null, command: "nils update --all", behind: ["engine"] },
    machine: { card: null, advice: [] },
    changes: { served, wait },
    ...over,
  };
}

const ARCHIVE = "0a1b2c3d-20261016020000";

function backups(dir: string | null = "/home/ada/nils/backups"): Backups {
  return {
    dir,
    place: dir ? { id: 3, name: "backups", guarantees: {} } : null,
    count: dir ? 1 : 0,
    archives: dir
      ? [
          {
            name: ARCHIVE,
            created_at: "2026-10-16T02:00:00Z",
            seconds: 4,
            bytes: 1_000_000,
            files: 3,
            epoch: 4,
            schema_version: 104,
            backend: "sqlite",
            ours: true,
            checked: { at: "2026-10-16T02:00:05Z", ok: true, rehearsed: true, files: 3, opened: ["registry", "linkage"] },
          } as unknown as Backups["archives"][number],
        ]
      : [],
    schedule: { every: "day", at: "02:00", day: null, keep: 14, timezone: "Europe/Stockholm", next: null, next_local: null, last: null },
  };
}

const STATUS = {
  registry: { home: "/home/ada/nils/registry", backend: "sqlite", schema: null, registry_id: "0a1b2c3d", schema_version: 104, epoch: 4, created_at: "2026-10-01T00:00:00Z", pseudonym_scheme: "blake2b-8", pseudonym_key: "nils", display_length: 8 },
};

/** The engine and the supervisor the page asks, each run of the supervisor done at once. */
function doors(b: Backups) {
  return engine((call) => {
    if (call.url === "/api/backups") return { status: 200, body: b };
    if (call.url === "/api/status") return { status: 200, body: STATUS };
    if (call.method === "POST" && call.url.startsWith("/supervise/api/supervise/")) return { status: 202, body: { id: "r1", what: "x", command: [], state: "running", pid: 1, started_at: "", finished_at: null, exit: null } };
    if (call.url === "/supervise/api/supervise/runs/r1") return { status: 200, body: { id: "r1", what: "x", command: [], state: "done", pid: 1, started_at: "", finished_at: "", exit: 0, tail: [] } };
    return undefined;
  });
}

const draw = async (page: string, c: Capabilities, i: Install | null) => {
  await act(async () => root.render(<Settings caps={c} install={i} checkedAt={Date.now()} page={page} onChanged={() => undefined} />));
  await settle();
};
const codes = () => [...host.querySelectorAll("code")].map((c) => c.textContent ?? "");
/** The commands the setup steps, back up, rehearse and restore print; the keys panel's own is another step's. */
const commands = () => codes().filter((c) => /^(nils (setup|backup|verify|restore)|systemctl|docker|launchctl)\b/u.test(c));

describe("a restore, on Backups", () => {
  it("is one button where the supervisor puts an archive back, and puts it back only once the dialog is pressed", async () => {
    const asked = doors(backups());
    await draw("backups", caps(), install());
    expect(codes().some((c) => c.startsWith("nils restore"))).toBe(false);
    expect(codes().some((c) => c.startsWith("nils backup") || c.startsWith("nils verify"))).toBe(false);
    act(() => button(host, "Put it back")!.click());
    const dialog = host.querySelector("dialog[open]")!;
    expect(dialog.textContent).toContain(`Puts ${ARCHIVE} back over the registry.`);
    expect(dialog.textContent).toContain("archived first");
    expect(asked.of("POST", "/supervise/api/supervise/restore")).toHaveLength(0);
    await act(async () => button(dialog, "Put it back")!.click());
    await settle(10);
    expect(asked.of("POST", "/supervise/api/supervise/restore").map((c) => c.body)).toEqual([{ archive: ARCHIVE }]);
  });

  it("stays three printed steps under one line where no supervisor is reached, or the supervisor's helper is older", async () => {
    doors(backups());
    await draw("backups", caps(), null);
    expect(host.textContent).toContain("This desk reaches no supervisor, so at the machine:");
    expect(codes().some((c) => c.startsWith(`nils restore /home/ada/nils/backups/${ARCHIVE} --yes`))).toBe(true);
    // back up and rehearse are engine jobs, so their buttons stand with no supervisor and no twin is printed (G2)
    expect(button(host, "Back up now")).not.toBeNull();
    expect(codes().some((c) => c.startsWith("nils backup") || c.startsWith("nils verify"))).toBe(false);
    expect(button(host, "Put it back")).toBeNull();
    await draw("backups", caps(), install({}, [], "the helper on this machine was written before it could put an archive back: update this install"));
    expect(host.textContent).toContain("The helper on this machine was written before it could put an archive back: update this install. Until then, at the machine:");
    expect(button(host, "Put it back")).toBeNull();
  });

  it("is not offered to a person without work on the install, who reads who puts an archive back and nothing to copy (G2)", async () => {
    doors(backups());
    await draw("backups", caps(["install:see", "database:see", "database:work"]), install());
    expect(button(host, "Put it back")).toBeNull();
    expect(host.textContent).toContain("An administrator puts an archive back.");
    expect(host.querySelector("#restore-archive")).toBeNull();
    expect(host.textContent).not.toContain("at the machine");
    expect(commands()).toEqual([]);
  });
});

describe("a backup folder, on Backups", () => {
  it("is given to an engine that has none, by the supervisor, with the folder typed", async () => {
    const asked = doors(backups(null));
    await draw("backups", caps(), install());
    expect(codes()).not.toContain("nils setup");
    act(() => button(host, "Give the engine a folder")!.click());
    const dialog = host.querySelector("dialog[open]")!;
    const field = dialog.querySelector<HTMLInputElement>("input")!;
    const give = button(dialog, "Give the engine this folder")!;
    expect(give.disabled).toBe(true);
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(field, "/home/ada/nils/registry/inside");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dialog.textContent).toContain("A folder beside the registry, not inside it.");
    expect(give.disabled).toBe(true);
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(field, "/data/archives");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(give.disabled).toBe(false);
    await act(async () => give.click());
    await settle(10);
    expect(asked.of("POST", "/supervise/api/supervise/backups").map((c) => c.body)).toEqual([{ dir: "/data/archives" }]);
  });

  it("stays nils setup, said why, where the supervisor does not give one", async () => {
    doors(backups(null));
    await draw("backups", caps(), install({}, ["signin"]));
    expect(button(host, "Give the engine a folder")).toBeNull();
    expect(host.textContent).toContain("This supervisor is older than the button, so at the machine:");
    expect(codes()).toContain("nils setup");
  });
});

describe("the by-hand twins (step 19.3)", () => {
  it("are gone from Parts and the Engine page where the supervisor keeps the install running", async () => {
    engine(() => undefined);
    await draw("parts", caps(), install());
    expect(button(host, "Update everything")).not.toBeNull();
    expect(button(host, "Restart it")).not.toBeNull();
    expect(codes()).toEqual([]);
    await draw("engine", caps(), install());
    expect(button(host, "Start it again with the folders")).not.toBeNull();
    expect(button(host, "Restart the engine")).not.toBeNull();
    expect(codes()).toEqual([]);
  });

  it("stay where the install runs no services, which only the machine can change", async () => {
    engine(() => undefined);
    await draw("parts", caps(), install({ service: "none", services: [] }, []));
    expect(host.textContent).toContain("To have them kept running, run setup again at the machine:");
    expect(codes()).toEqual(["nils setup"]);
  });
});

describe("who reads what where a step's button does not stand (G2)", () => {
  // may see the install and do the pages' own work, but not work on the install
  const LOOKS: Grant[] = ["install:see", "database:see", "database:work", "identity:see", "identity:work", "assistant:use"];
  // may not see the install: the desk reads no install for this person, though a supervisor keeps it
  const BACKUPS: Grant[] = ["database:see", "database:work"];
  const SUPERVISOR = "http://127.0.0.1:7300";
  /** An install with Kvasir, kept running beside the engine, which the desk does not reach. */
  const withKvasir = (served?: Change[]) =>
    install(
      {
        parts: {
          engine: { version: "1.0.0-alpha.88", kind: "binary", path: "/home/ada/.local/bin/nils" },
          kvasir: { version: "1.0.0-alpha.8", kind: "binary", path: "/home/ada/.local/bin/kvasir" },
        },
        services: [
          { part: "engine", unit: "nils-engine", watcher: "systemd", running: true },
          { part: "gateway", unit: "kvasir", watcher: "systemd", running: true },
        ],
      },
      served,
    );
  const nowhere = () => {
    expect(host.textContent).not.toContain("at the machine");
    expect(host.textContent).not.toContain("reaches no supervisor");
    expect(commands()).toEqual([]);
  };
  /** Each case drawn afresh, so a page keeps nothing it read for the case before. */
  const fresh = async (page: string, c: Capabilities, i: Install | null) => {
    act(() => root.unmount());
    root = createRoot(host);
    await draw(page, c, i);
  };
  const opened = async (card: RegExp) => {
    act(() => button(host, card)!.click());
    await settle();
  };

  describe("where the supervisor serves the step", () => {
    it("is a button and no command, for a person with work on the install: a folder, a model, how people sign in", async () => {
      doors(backups(null));
      await fresh("backups", caps(), install());
      expect(button(host, "Give the engine a folder")).not.toBeNull();
      expect(commands()).toEqual([]);
      engine(() => undefined);
      await fresh("setup", caps(SETS.admin.grants, { assistant: true }), withKvasir());
      expect(button(host, "Start Kvasir again")).not.toBeNull();
      expect(button(host, "Use a model server")).not.toBeNull();
      await opened(/Decide who signs in/u);
      expect(button(host, "Change how people sign in")).not.toBeNull();
      expect(commands()).toEqual([]);
    });

    it("is one plain line saying who does it, for a person without that work: no button, no command, no machine", async () => {
      doors(backups(null));
      await fresh("backups", caps(LOOKS), install());
      expect(button(host, "Give the engine a folder")).toBeNull();
      expect(host.textContent).toContain("An administrator gives the engine a folder.");
      nowhere();
      engine(() => undefined);
      await fresh("setup", caps(LOOKS, { assistant: true }), withKvasir());
      expect(button(host, "Start Kvasir again")).toBeNull();
      expect(button(host, "Use a model server")).toBeNull();
      expect(host.textContent).toContain("An administrator starts Kvasir again or names a model server.");
      nowhere();
      await opened(/Decide who signs in/u);
      expect(button(host, "Change how people sign in")).toBeNull();
      expect(host.textContent).toContain("An administrator changes how people sign in.");
      nowhere();
    });

    it("is the same line for a person who may not see the install, and the desk never says it reaches no supervisor where one is named", async () => {
      doors(backups(null));
      await fresh("backups", caps(BACKUPS, { supervisor: SUPERVISOR }), null);
      expect(host.textContent).toContain("An administrator gives the engine a folder.");
      nowhere();
      doors(backups());
      await fresh("backups", caps(BACKUPS, { supervisor: SUPERVISOR }), null);
      expect(host.textContent).toContain("An administrator puts an archive back.");
      nowhere();
      // a person with work on the install whose supervisor did not answer: the command, and the line that says so
      doors(backups(null));
      await fresh("backups", caps(SETS.admin.grants, { supervisor: SUPERVISOR }), null);
      expect(host.textContent).toContain("The supervisor did not answer, so at the machine:");
      expect(host.textContent).not.toContain("reaches no supervisor");
      expect(commands()).toEqual(["nils setup"]);
    });
  });

  describe("where no supervisor serves the install", () => {
    it("keeps the command under the one line that says why, for a person with work on the install", async () => {
      doors(backups(null));
      await fresh("backups", caps(), null);
      expect(host.textContent).toContain("This desk reaches no supervisor, so at the machine:");
      expect(commands()).toEqual(["nils setup"]);
      doors(backups());
      await fresh("backups", caps(), install({ service: "none", services: [] }, []));
      expect(host.textContent).toContain("This install runs no services, so at the machine:");
      expect(commands()).toEqual([`nils restore /home/ada/nils/backups/${ARCHIVE} --yes --registry /home/ada/nils/registry`]);
      engine(() => undefined);
      await fresh("setup", caps(SETS.admin.grants, { assistant: true }), null);
      expect(host.textContent).toContain("This desk reaches no supervisor, so at the machine:");
      expect(commands()).toEqual(["nils setup"]);
      await opened(/Decide who signs in/u);
      expect(button(host, "Change how people sign in")).toBeNull();
      expect(commands()).toEqual(["nils setup"]);
    });

    it("says who does it, and no command, to a person without that work", async () => {
      doors(backups(null));
      await fresh("backups", caps(BACKUPS), null);
      expect(host.textContent).toContain("An administrator gives the engine a folder.");
      nowhere();
      doors(backups());
      await fresh("backups", caps(LOOKS), install({ service: "none", services: [] }, []));
      expect(host.textContent).toContain("An administrator puts an archive back.");
      nowhere();
      engine(() => undefined);
      await fresh("setup", caps(LOOKS, { assistant: true }), null);
      expect(host.textContent).toContain("An administrator starts Kvasir again or names a model server.");
      nowhere();
      await opened(/Decide who signs in/u);
      expect(host.textContent).toContain("An administrator changes how people sign in.");
      nowhere();
    });
  });

  describe("back up and rehearse, on Backups", () => {
    it("are buttons and never a printed command where the engine queues jobs, supervisor or none", async () => {
      const cases: [Capabilities, Install | null][] = [
        [caps(), null],
        [caps(), install()],
        [caps(SETS.admin.grants, { supervisor: SUPERVISOR }), null],
        [caps(BACKUPS), null],
      ];
      for (const [c, i] of cases) {
        doors(backups());
        await fresh("backups", c, i);
        expect(button(host, "Back up now")).not.toBeNull();
        expect(button(host, "Rehearse a restore")).not.toBeNull();
        expect(codes().some((x) => x.startsWith("nils backup") || x.startsWith("nils verify"))).toBe(false);
      }
    });

    it("are printed only where the engine queues no jobs, so no button can: for a person with work on the install, under the line that says why; for anyone else, who does it", async () => {
      const queueless = DOORS.filter((d) => d !== "POST /api/jobs");
      doors(backups());
      await fresh("backups", caps(SETS.admin.grants, { doors: queueless }), null);
      expect(button(host, "Back up now")).toBeNull();
      expect(button(host, "Rehearse a restore")).toBeNull();
      expect(host.textContent).toContain("This engine queues no jobs, so at the machine:");
      expect(codes()).toEqual(expect.arrayContaining(["nils backup --rehearse --keep 14", `nils verify /home/ada/nils/backups/${ARCHIVE} --rehearse`]));
      doors(backups());
      await fresh("backups", caps(BACKUPS, { doors: queueless }), null);
      expect(button(host, "Back up now")).toBeNull();
      expect(host.textContent).toContain("An administrator backs the registry up.");
      nowhere();
    });
  });
});
