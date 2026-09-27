// SPDX-License-Identifier: AGPL-3.0-only
// The Parts page's words: the rows from the capabilities, the install and the
// admission records; what an update changes; how the install is kept running.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { SETS } from "../grants";
import type { AdmissionRecord } from "./kvasir";
import { behindParts, checkedWords, contractWords, keptByWords, newerWords, partRows, restartByHand, runtimeName, updateWords, uptimeWords } from "./parts";
import type { Install, PartRelease, Release } from "./supervise";

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
    person: { subject: "admin", display_name: "admin", grants: SETS.admin.grants, detail: "sensitive", groups: ["Admins"] },
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

const own = (part: string, installed: string, newest: string, newer: string | null, held: string | null = null): PartRelease => ({
  part,
  installed,
  newest,
  newer,
  held,
  follows: null,
  error: null,
  command: `nils update --part ${part}`,
});

/** A release as an engine that lists each part beside its own newest says it. */
function listed(parts: PartRelease[]): Release {
  const engine = parts.find((p) => p.part === "engine") ?? null;
  const behind = parts.filter((p) => p.newer !== null && p.held === null);
  return {
    installed: engine?.installed ?? null,
    newest: engine?.newest ?? null,
    newer: engine?.newer ?? (behind[0] ? `${behind[0].part} ${behind[0].newer}` : null),
    error: null,
    command: "nils update --all",
    behind: behind.map((p) => p.part),
    parts,
  };
}

describe("each part beside its own newest release", () => {
  it("offers a desk released alone while the engine is at its newest, and the desk alone", () => {
    const i = install({
      release: listed([own("engine", "1.0.0-alpha.49", "1.0.0-alpha.49", null), own("desk", "1.0.0-alpha.49", "1.0.0-alpha.51", "1.0.0-alpha.51"), own("kvasir", "1.0.0-alpha.2", "1.0.0-alpha.2", null)]),
    });
    expect(newerWords(i)).toBe("Desk 1.0.0-alpha.51 is out");
    expect(behindParts(i).map((p) => p.part)).toEqual(["desk"]);
    const rows = partRows(caps(), i, null, []);
    expect(rows[0]).toMatchObject({ id: "engine", newer: { text: "the newest", tag: false }, update: null });
    expect(rows[1]).toMatchObject({ id: "desk", newer: { text: "1.0.0-alpha.51", tag: true }, update: "desk" });
    expect(rows[2]).toMatchObject({ id: "gateway", newer: { text: "the newest", tag: false }, update: null });
    expect(updateWords(i)).toEqual([
      "The desk moves from 1.0.0-alpha.49 to 1.0.0-alpha.51.",
      "Postgres stays at 17, and its data is not touched.",
      "Every part starts again, in order, once it is replaced.",
    ]);
  });
  it("offers nothing where every part is at its newest", () => {
    const i = install({ release: listed([own("engine", "1.0.0-alpha.49", "1.0.0-alpha.49", null), own("desk", "1.0.0-alpha.51", "1.0.0-alpha.51", null)]) });
    expect(newerWords(i)).toBeNull();
    expect(updateWords(i)).toEqual([]);
    expect(partRows(caps(), i, null, []).every((r) => r.update === null)).toBe(true);
  });
  it("counts several parts behind, a Node part built again, and a development build", () => {
    const i = install({
      release: listed([
        own("engine", "1.0.0-alpha.49.dev.2", "1.0.0-alpha.49.dev.3", "1.0.0-alpha.49.dev.3"),
        own("desk", "1.0.0-alpha.49.dev.2", "1.0.0-alpha.49.dev.2", null),
        own("kvasir", "1.0.0-alpha.2", "1.0.0-alpha.3", "1.0.0-alpha.3"),
      ]),
    });
    expect(newerWords(i)).toBe("2 updates are out");
    expect(updateWords(i).slice(0, 2)).toEqual(["The engine moves from 1.0.0-alpha.49.dev.2 to 1.0.0-alpha.49.dev.3.", "Kvasir moves from 1.0.0-alpha.2 to 1.0.0-alpha.3, fetched and built again."]);
    expect(partRows(caps({ kvasir: gateway() }), i, null, []).find((r) => r.id === "gateway")?.update).toBe("kvasir");
  });
  it("says a desk that waits for the engine's contracts, and does not offer it", () => {
    const held = "desk 1.0.0-alpha.52 needs HTTP contract 8 (the engine speaks 7); it waits for an engine release that speaks it";
    const i = install({ release: listed([own("engine", "1.0.0-alpha.49", "1.0.0-alpha.49", null), own("desk", "1.0.0-alpha.49", "1.0.0-alpha.52", "1.0.0-alpha.52", held)]) });
    expect(newerWords(i)).toBeNull();
    expect(partRows(caps(), i, null, [])[1]).toMatchObject({ newer: { text: "1.0.0-alpha.52 waits for the engine", tag: false }, update: null });
    const both = install({ release: listed([own("engine", "1.0.0-alpha.48", "1.0.0-alpha.49", "1.0.0-alpha.49"), own("desk", "1.0.0-alpha.49", "1.0.0-alpha.52", "1.0.0-alpha.52", held)]) });
    expect(updateWords(both)).toContain("Desk 1.0.0-alpha.52 needs HTTP contract 8 (the engine speaks 7); it waits for an engine release that speaks it.");
  });
  it("says the rule packs beside the engine's release, and offers the update where only they are behind", () => {
    const mri = (version: string, digest: string) => ({ name: "mri", version, digest });
    const clinical = { name: "clinical", version: null, digest: "c1" };
    const packs = { dir: "/srv/nils/engine/packs", release: "1.0.0-alpha.53", installed: [clinical, mri("0.7.0", "m1")], bundled: [clinical, mri("0.8.0", "m2")], stale: ["mri"], edited: [], own: [], behind: true, command: "nils update --all" };
    const release = { ...listed([own("engine", "1.0.0-alpha.53", "1.0.0-alpha.53", null), own("desk", "1.0.0-alpha.53", "1.0.0-alpha.53", null)]), newer: "packs of 1.0.0-alpha.53", behind: ["packs"], packs };
    const i = install({ release });
    const rows = partRows(caps(), i, null, []);
    expect(rows.map((r) => r.id)).toEqual(["engine", "packs", "desk", "gateway", "postgres"]);
    expect(rows[1]).toMatchObject({ title: "Rule packs", version: "clinical · mri 0.7.0", meta: "/srv/nils/engine/packs", health: { tone: "caution", words: "older than engine 1.0.0-alpha.53's" }, newer: { text: "mri 0.8.0", tag: true }, update: null });
    expect(behindParts(i).map((p) => p.part)).toEqual(["packs"]);
    expect(newerWords(i)).toBe("Rule packs mri 0.8.0 is out");
    expect(updateWords(i)[0]).toBe("The rule packs move from mri 0.7.0 to mri 0.8.0, the ones engine 1.0.0-alpha.53 was released with; the ones before are kept beside them.");

    // at the release's, with one changed on this machine and kept
    const current = install({ release: { ...release, newer: null, behind: [], packs: { ...packs, installed: [clinical, mri("0.8.0", "m3")], stale: [], edited: ["mri"], behind: false } } });
    expect(newerWords(current)).toBeNull();
    expect(partRows(caps(), current, null, [])[1]).toMatchObject({ health: { tone: "caution", words: "mri changed on this machine, kept" }, newer: { text: "moves with the engine", tag: false } });
    const read = install({ release: { ...release, newer: null, behind: [], packs: { dir: "/p", release: "1.0.0-alpha.53", error: "no packs.tar.gz", command: "nils update --all" } } });
    expect(partRows(caps(), read, null, [])[1]).toMatchObject({ version: "none", newer: { text: "not checked", tag: false } });
  });
  it("reads an engine older than the list as it always did", () => {
    expect(newerWords(install())).toBe("1.0.0-alpha.15 is out");
    expect(partRows(caps(), install(), null, [])[1]).toMatchObject({ newer: { text: "1.0.0-alpha.15", tag: true }, update: null });
  });
});
