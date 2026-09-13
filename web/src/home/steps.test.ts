// SPDX-License-Identifier: AGPL-3.0-only
// Home's first band worked out from the parts, and the rows of a look inside
// a folder with their rules and their digests.

import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import type { Install, Look } from "../settings/supervise";
import { digests, placeName, rows } from "./look";
import { headline, lede, next, steps, type Facts } from "./steps";

function caps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.14" },
      contracts: {},
      doors: ["GET /api/places"],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 0, schema_version: 37 },
      packs: [],
    },
    kvasir: { models: [{ id: "MiniMax-M3", locality: "remote" }] },
    assistant: { stations: [{ id: "concierge" }] },
    apps: [],
    person: { subject: "operator", display_name: "the operator", entitlements: ["admin"], roles: ["admin"] },
    desk: {
      version: "1.0.0-alpha.14",
      mode: "off",
      contracts: {},
      engine_reachable: true,
      contract_mismatch: null,
      login: null,
      signed_in: true,
      settings: { origin: "http://127.0.0.1:7200", engine_url: "", kvasir_url: null, assistant_url: null, session_hours: 12, token_minutes: 10, cli_token_hours: 12, export: "admin", store: "", retention: "", engine_flags: null },
    },
    ...over,
  };
}

function install(over: Partial<Install> = {}): Install {
  return {
    record: "~/.config/nils/setup.toml",
    dir: "~/nils",
    runtime: "docker",
    service: "a compose file",
    reach: "loopback",
    backend: "postgres:nils",
    mode: "off",
    at: "",
    ports: {},
    parts: { engine: { version: "1.0.0-alpha.14", kind: "docker", path: "" }, postgres: { version: "17", kind: "docker", path: "" } },
    places: [],
    oidc: null,
    addresses: [],
    services: [],
    unfinished: false,
    release: { installed: "1.0.0-alpha.14", newest: null, newer: null, error: null, command: "nils update --all" },
    machine: { card: { name: "NVIDIA GeForce RTX 4090", memory_gb: 24 }, advice: [] },
    ...over,
  };
}

function place(name: string, role: Place["role"], path: string, mount: string, backup?: string): Place {
  return { id: 1, name, role, path, guarantees: backup ? { backup } : {}, probed: { mount }, probed_at: null, retired_at: null };
}

const fresh: Facts = {
  caps: caps(),
  install: install(),
  places: [place("backups", "backup", "~/nils/backups", "/"), place("registry", "registry", "~/nils/registry", "/", "backups")],
  batches: 0,
  backups: [],
  purposes: [
    { purpose: "assistant.concierge", content: "rows", backend: null },
    { purpose: "assistant.ask-help", content: "rows", backend: null },
    { purpose: "assistant.operator", content: "catalog", backend: "model" },
  ],
};

describe("the band of a fresh docker install", () => {
  const all = steps(fresh, Date.parse("2026-09-13T12:00:00Z"));
  const by = (id: string) => all.find((s) => s.id === id)!;
  it("says how it is installed", () => {
    expect(by("installed")).toMatchObject({ state: "done", words: "In docker on this machine, and back after a restart. Everything lives under ~/nils." });
  });
  it("asks for a local model where only a provider answers, and says the card can serve one", () => {
    expect(by("model").state).toBe("attention");
    expect(by("model").words).toBe(
      "MiniMax-M3 at a provider answers what reads no rows. The 2 stations that read rows of the archive need a local model. This machine's NVIDIA GeForce RTX 4090 (24 GB) can serve a local model.",
    );
  });
  it("opens on bringing DICOM in", () => {
    expect(by("dicom")).toMatchObject({ state: "now", words: "Add each folder NILS reads. It is mounted read only; nothing is ever written to it." });
    expect(next(all)?.id).toBe("dicom");
    expect(headline(all)).toBe("NILS is installed. Next, give it something to read.");
  });
  it("says the backups share the registry's disk and none has run", () => {
    expect(by("safe").words).toBe("Postgres 17 keeps the registry in ~/nils/registry. Backups go to ~/nils/backups, on the same disk, and none has run.");
    expect(by("safe").tags.map((t) => t.text)).toEqual(["same disk as the registry", "no schedule", "key not in any backup"]);
    expect(by("safe").state).toBe("todo");
  });
  it("says nobody signs in on this machine", () => {
    expect(by("signin").state).toBe("todo");
  });
  it("counts what is done", () => {
    expect(lede(all)).toBe("Five steps make this install ready for real work. One is done.");
  });
});

describe("the band as the install moves on", () => {
  it("is halfway once a source is named and nothing is digested", () => {
    const f = { ...fresh, places: [...fresh.places!, place("incoming", "source", "/srv/imaging/incoming", "/srv")] };
    const all = steps(f);
    expect(all.find((s) => s.id === "dicom")).toMatchObject({ state: "now", halfway: true });
    expect(lede(all)).toBe("Five steps make this install ready for real work. One is done, and one is halfway.");
  });
  it("is done when every step is, and then has no headline", () => {
    const backup: JobRow = { id: 9, kind: "backup", name: null, state: "done", started_at: "", heartbeat_at: null, finished_at: "2026-09-13T02:00:00Z", progress: null, error: null, args: {}, result: null };
    const f: Facts = {
      caps: caps({ kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] }, desk: { ...caps().desk, mode: "local" } }),
      install: install(),
      places: [place("disk", "backup", "/srv/backup", "/srv/backup"), place("registry", "registry", "~/nils/registry", "/", "disk"), place("incoming", "source", "/srv/in", "/srv")],
      batches: 3,
      backups: [backup],
      purposes: [],
    };
    const all = steps(f, Date.parse("2026-09-13T12:00:00Z"));
    expect(all.every((s) => s.state === "done")).toBe(true);
    expect(headline(all)).toBeNull();
  });
  it("leaves out what this person cannot read, and a warning for a desk open with no sign in", () => {
    const f: Facts = { ...fresh, install: null, places: null, caps: caps({ assistant: null, desk: { ...caps().desk, settings: { ...caps().desk.settings!, origin: "http://192.168.1.40:7200" } } }) };
    const all = steps(f);
    expect(all.map((s) => s.id)).toEqual(["installed", "signin"]);
    expect(all[1]).toMatchObject({ state: "attention", tags: [{ text: "open to the network", tone: "caution" }] });
  });
});

describe("a look inside a folder", () => {
  const look: Look = {
    path: "/srv/imaging/incoming",
    exists: true,
    directory: true,
    readable: true,
    partial: false,
    here: { name: "", files: 1, capped: false, sampled: 1, dicom: 0, modalities: {}, scanners: 0 },
    folders: [
      { name: "mri-3t", files: 18420, capped: false, sampled: 16, dicom: 16, modalities: { MR: 16 }, scanners: 3 },
      { name: "pcct", files: 6112, capped: false, sampled: 16, dicom: 16, modalities: { CT: 16 }, scanners: 1 },
      { name: "tmp", files: 12, capped: false, sampled: 12, dicom: 0, modalities: {}, scanners: 0 },
    ],
  };
  const packs = [
    { name: "mri", version: "0.1.1", modality: "MR" },
    { name: "clinical", version: "0.1.0", modality: "clinical" },
  ];
  it("says what each folder looks like and which rules read it", () => {
    expect(rows(look, packs).map((r) => [r.name, r.looksLike, r.rules.text])).toEqual([
      ["mri-3t", "MR, 3 scanners", "mri 0.1.1"],
      ["pcct", "CT, 1 scanner", "no CT pack: digest only"],
      ["tmp", "not DICOM", "left out"],
    ]);
  });
  it("names the place after the folder, and a batch after each folder inside", () => {
    expect(placeName("/srv/imaging/Incoming/", [])).toBe("incoming");
    expect(placeName("/srv/imaging/incoming", ["incoming", "incoming-2"])).toBe("incoming-3");
    expect(digests("incoming", rows(look, packs))).toEqual([
      { name: "incoming-mri-3t", command: ["digest", "--name", "incoming-mri-3t", "@incoming/mri-3t"] },
      { name: "incoming-pcct", command: ["digest", "--name", "incoming-pcct", "@incoming/pcct"] },
    ]);
  });
});
