// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Gate T31 (record 55 ruling 35 (c)): the setup steps the desk printed are
// buttons where the supervisor makes them. On Backups, a restore is one
// button and an archive is put back only once the dialog is pressed; the
// engine is given a folder; and with no supervisor, or one older than the
// buttons, the command stays under one line that says why. On Parts and the
// Engine page the by-hand twins are gone where a supervisor does the work,
// and stay where the install runs no services (step 19.3).

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

function caps(grants: readonly Grant[] = SETS.admin.grants): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.88" },
      contracts: { openapi: "7", suite: "3" },
      doors: DOORS,
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
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: [...grants], detail: "sensitive", groups: ["Admins"] },
    desk: { version: "1.0.0-alpha.69", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
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
    // with no supervisor the backup's twin is printed, and said so
    expect(host.textContent).toContain("This desk reaches no supervisor; the same by hand:");
    expect(button(host, "Put it back")).toBeNull();
    await draw("backups", caps(), install({}, [], "the helper on this machine was written before it could put an archive back: update this install"));
    expect(host.textContent).toContain("The helper on this machine was written before it could put an archive back: update this install. Until then, at the machine:");
    expect(button(host, "Put it back")).toBeNull();
  });

  it("is not offered to a person without work on the install", async () => {
    doors(backups());
    await draw("backups", caps(["install:see", "database:see", "database:work"]), install());
    expect(button(host, "Put it back")).toBeNull();
    expect(host.textContent).toContain("Changed by an administrator, at the machine:");
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
