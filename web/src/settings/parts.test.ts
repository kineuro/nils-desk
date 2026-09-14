// SPDX-License-Identifier: AGPL-3.0-only
// The Parts page's words: the rows from the capabilities, the install and the
// admission records; what an update changes; how the install is kept running.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { AdmissionRecord } from "./kvasir";
import { checkedWords, contractWords, keptByWords, partRows, restartByHand, runtimeName, updateWords, uptimeWords } from "./parts";
import type { Install } from "./supervise";

function caps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.14" },
      contracts: { openapi: "3", suite: "1", pack: "4" },
      doors: [],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 0 },
      packs: [],
      uptime_seconds: 3 * 86_400 + 5,
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "admin", display_name: "admin", entitlements: ["admin"], roles: ["admin"] },
    desk: { version: "1.0.0-alpha.14", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    ...over,
  };
}

function install(over: Partial<Install> = {}): Install {
  return {
    record: "/home/ada/.config/nils/setup.toml",
    dir: "/home/ada/nils",
    runtime: "docker",
    service: "a compose file",
    reach: "loopback",
    backend: "postgres:nils",
    mode: "local",
    at: "2026-09-13T10:00:00Z",
    ports: { engine: 8437, desk: 7200 },
    parts: {
      engine: { version: "1.0.0-alpha.14", kind: "docker", path: "nils:1.0.0-alpha.14" },
      desk: { version: "1.0.0-alpha.14", kind: "docker", path: "nils-desk:1.0.0-alpha.14" },
      kvasir: { version: "1.0.0-alpha.2", kind: "node", path: "/home/ada/nils/kvasir" },
      postgres: { version: "17", kind: "docker", path: "postgres:17" },
    },
    places: [],
    oidc: null,
    addresses: [],
    services: [
      { part: "postgres", unit: "nils-postgres", watcher: "docker", running: true },
      { part: "engine", unit: "nils-engine", watcher: "docker", running: true },
      { part: "desk", unit: "nils-desk", watcher: "docker", running: true },
      { part: "gateway", unit: "nils-kvasir", watcher: "docker", running: true },
    ],
    unfinished: false,
    release: { installed: "1.0.0-alpha.14", newest: "1.0.0-alpha.15", newer: "1.0.0-alpha.15", error: null, command: "nils update --all" },
    machine: { card: { name: "NVIDIA GeForce RTX 3060", memory_gb: 6 }, advice: [] },
    ...over,
  };
}

const gateway = (warming = false) => ({
  kvasir: { version: "1.0.0-alpha.2" },
  backends: [{ id: "local", locality: "local", health: { warming, running: 1, concurrency: 8 } }],
  models: [{ id: "qwen38-27b", backend: "local", locality: "local", admitted: true }],
  health: { warming },
});

const admitted = (at: number, version: string): AdmissionRecord => ({ id: at, backend: "local", model: "qwen38-27b", runtime: { name: "sglang", version, build: "" }, at, passed: true });

describe("the installed parts", () => {
  it("say each part's version, what runs it, its health and what is newer", () => {
    const rows = partRows(caps({ kvasir: gateway() }), install(), [admitted(1, "0.4.0"), admitted(2, "0.5.2")], ["engine", "desk"]);
    expect(rows.map((r) => r.id)).toEqual(["engine", "desk", "gateway", "runtime", "postgres"]);
    expect(rows[0]).toMatchObject({
      version: "nils 1.0.0-alpha.14",
      meta: "openapi 3 · suite 1 · pack 4",
      runsAs: { text: "nils-engine", mono: true },
      health: { tone: "ok", words: "running 3 days" },
      newer: { text: "1.0.0-alpha.15", tag: true },
      page: "engine",
    });
    expect(rows[1]).toMatchObject({ meta: "local sign-in", runsAs: { text: "nils-desk", mono: true }, page: "desk" });
    expect(rows[2]).toMatchObject({ title: "Kvasir", version: "1.0.0-alpha.2", mono: true, meta: "from source", health: { tone: "ok", words: "warm · 1 of 8 streams busy" }, newer: { text: "fetched with the update", tag: false }, page: null });
    expect(rows[3]).toMatchObject({ version: "SGLang 0.5.2", meta: "NVIDIA GeForce RTX 3060, 6 GB", health: { tone: "ok", words: "serving qwen38-27b" }, newer: { text: "yours to update", tag: false } });
    expect(rows[4]).toMatchObject({ version: "17", meta: "set up here", runsAs: { text: "nils-postgres", mono: true }, health: { tone: "ok", words: "running" }, newer: { text: "stays at 17", tag: false } });
  });
  it("show a person without the install the versions and the health, and nothing of how the parts run", () => {
    const rows = partRows(caps(), null, null, []);
    expect(rows.map((r) => r.id)).toEqual(["engine", "desk"]);
    expect(rows[0]).toMatchObject({ runsAs: null, newer: null, page: null });
  });
  it("say a part that stopped, a gateway still warming, and a registry in SQLite", () => {
    const stopped = install({
      runtime: "machine",
      service: "systemd user units",
      backend: "sqlite",
      parts: { engine: { version: "1.0.0-alpha.14", kind: "binary", path: "/home/ada/.local/bin/nils" }, kvasir: { version: "1.0.0-alpha.2", kind: "node", path: "/home/ada/nils/kvasir" } },
      services: [
        { part: "engine", unit: "nils-engine", watcher: "systemd", running: false },
        { part: "gateway", unit: "kvasir", watcher: "systemd", running: true },
      ],
      release: { installed: "1.0.0-alpha.14", newest: "1.0.0-alpha.14", newer: null, error: null, command: "nils update --all" },
    });
    const rows = partRows(caps({ engine: null, kvasir: gateway(true) }), stopped, null, []);
    expect(rows.map((r) => r.id)).toEqual(["engine", "desk", "gateway", "runtime", "sqlite"]);
    expect(rows[0]).toMatchObject({ version: "1.0.0-alpha.14", health: { tone: "blocked", words: "stopped" }, newer: { text: "the newest", tag: false } });
    expect(rows[1].runsAs).toEqual({ text: "started by hand", mono: false });
    expect(rows[2].health).toEqual({ tone: "caution", words: "warming" });
    expect(rows[3]).toMatchObject({ version: "a model server", health: { tone: "caution", words: "warming" } });
    expect(rows[4]).toMatchObject({ version: "SQLite", runsAs: { text: "inside the engine", mono: false }, health: { tone: "blocked", words: "not known" } });
  });
});

describe("the words", () => {
  it("say how long a part has run, the contracts and a runtime's name", () => {
    expect(uptimeWords(30)).toBe("just started");
    expect(uptimeWords(60 * 7)).toBe("running 7 minutes");
    expect(uptimeWords(3_600 * 5)).toBe("running 5 hours");
    expect(uptimeWords(86_400)).toBe("running 1 day");
    expect(contractWords({})).toBe("");
    expect(runtimeName("vllm")).toBe("vLLM");
    expect(runtimeName("a-runtime")).toBe("a-runtime");
  });
  it("say when the install was read", () => {
    expect(checkedWords(null, 0)).toBeNull();
    expect(checkedWords(1_000, 31_000)).toBe("checked just now");
    expect(checkedWords(0, 150_000)).toBe("checked 2 minutes ago");
  });
  it("say what an update changes, and nothing when nothing is newer", () => {
    expect(updateWords(install())).toEqual([
      "The engine and the desk move to 1.0.0-alpha.15 together.",
      "Kvasir fetches its newest source, and is built again where it moved.",
      "Postgres stays at 17, and its data is not touched.",
      "Every part starts again, in order, once it is replaced.",
    ]);
    const both = install({ parts: { ...install().parts, assistant: { version: "0.1.0", kind: "node", path: "/home/ada/nils/assistant" } }, service: "none" });
    expect(updateWords(both)[1]).toBe("Kvasir and the assistant fetch their newest source, and are built again where it moved.");
    expect(updateWords(both).at(-1)).toBe("This install runs no services, so start each part again yourself once it is replaced.");
    expect(updateWords(install({ release: { installed: "1.0.0-alpha.15", newest: "1.0.0-alpha.15", newer: null, error: null, command: "nils update --all" } }))).toEqual([]);
  });
  it("say what keeps the install running, and the commands that restart it by hand", () => {
    expect(keptByWords(install())).toBe("compose.yaml in /home/ada/nils, kept by docker");
    expect(keptByWords(install({ service: "none" }))).toBe("nothing: this install runs no services");
    expect(restartByHand(install(), "engine")).toBe("docker restart nils-engine");
    expect(restartByHand(install(), "all")).toBe("cd /home/ada/nils && docker compose restart");
    const systemd = install({ runtime: "podman", service: "podman quadlets", services: [{ part: "engine", unit: "nils-engine", watcher: "systemd", running: true }, { part: "desk", unit: "nils-desk", watcher: "systemd", running: true }] });
    expect(restartByHand(systemd, "all")).toBe("systemctl --user restart nils-engine nils-desk");
    expect(restartByHand(install({ services: [] }), "engine")).toBe("nils setup");
  });
});
