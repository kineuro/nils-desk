// SPDX-License-Identifier: AGPL-3.0-only
// Settings' overview: each card's state and facts, worked out from what the
// pages read, and what needs a person, the worst first.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import type { Backups } from "./database";
import { attention, auditCard, backupsCard, gatewayCard, partsCard, placesCard, registryCard, signinCard } from "./overview";
import type { Install } from "./supervise";

function caps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.16" },
      contracts: {},
      doors: [],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 1234, schema_version: 37 },
      packs: [],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "operator", display_name: "the operator", entitlements: ["admin"], roles: ["admin"] },
    desk: { version: "1.0.0-alpha.16", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    ...over,
  };
}

function place(over: Partial<Place>): Place {
  return { id: 1, name: "p", role: "source", path: "/srv/p", guarantees: {}, probed: { exists: true, directory: true }, probed_at: null, retired_at: null, ...over };
}

const install = { runtime: "machine", service: "systemd user units", backend: "sqlite", parts: {}, release: { installed: "1.0.0-alpha.15", newest: "1.0.0-alpha.16", newer: "1.0.0-alpha.16", error: null, command: "nils update --all" } } as unknown as Install;

describe("the parts card", () => {
  it("says every part answers, a newer release, a part that does not answer, and a warming gateway", () => {
    expect(partsCard(caps(), null).state).toEqual({ tone: "ok", words: "all answer" });
    expect(partsCard(caps(), null).value).toBe("NILS 1.0.0-alpha.16");
    expect(partsCard(caps(), install).state).toEqual({ tone: "brand", words: "1.0.0-alpha.16 is out" });
    expect(partsCard(caps(), install).facts).toEqual(["2 parts: engine, desk", "on this machine, kept running"]);
    expect(partsCard(caps({ engine: null }), null).state).toEqual({ tone: "blocked", words: "the engine does not answer" });
    expect(partsCard(caps({ kvasir: { health: { warming: true } } }), null).state).toEqual({ tone: "caution", words: "Kvasir is warming" });
    const kvasirDown = { ...install, parts: { kvasir: { version: "1.0.0-alpha.3", kind: "node", path: "" } } } as unknown as Install;
    expect(partsCard(caps(), kvasirDown).state).toEqual({ tone: "blocked", words: "Kvasir does not answer" });
    expect(partsCard(caps({ kvasir: {} }), null).facts).toEqual(["3 parts: engine, desk, Kvasir"]);
  });
});

describe("the places card", () => {
  const registry = place({ id: 2, name: "registry", role: "registry", path: "/srv/nils/registry", guarantees: { backup: "backups" }, probed: { exists: true, directory: true, free_bytes: 9e9, mount: "/srv" } });
  const backups = place({ id: 3, name: "backups", role: "backup", path: "/data/backups", guarantees: { protected: true }, probed: { exists: true, directory: true, free_bytes: 2e9, mount: "/data" } });
  it("says none is declared", () => {
    expect(placesCard([], false).state).toEqual({ tone: "caution", words: "none declared" });
  });
  it("names the one place that needs attention, and counts several", () => {
    const scans = place({ name: "scans", role: "source" });
    expect(placesCard([registry, backups, scans], false).state).toEqual({ tone: "caution", words: "scans: needs snapshots" });
    const gone = place({ id: 4, name: "old", role: "export", probed: { exists: false } });
    expect(placesCard([registry, backups, scans, gone], false).state).toEqual({ tone: "blocked", words: "2 need attention" });
  });
  it("passes, with the roles and the place with least room", () => {
    const card = placesCard([registry, backups, place({ id: 5, name: "scans", guarantees: { snapshots: true } })], false);
    expect(card.state).toEqual({ tone: "ok", words: "all pass" });
    expect(card.value).toBe("3 places");
    expect(card.facts).toEqual(["1 source · 1 registry · 1 backup", "least room: backups, 2.0 GB free"]);
  });
});

describe("the backups card", () => {
  const now = new Date("2026-09-13T12:00:00Z");
  const b = (over: Partial<Backups> = {}): Backups => ({
    dir: "/data/backups",
    place: null,
    count: 0,
    archives: [],
    schedule: { every: "day", at: "02:00", day: null, keep: 14, timezone: "Europe/Stockholm", next: null, next_local: "2026-09-14T02:00", last: null },
    ...over,
  });
  it("says none is written yet, with the schedule", () => {
    const card = backupsCard(b(), now);
    expect(card.value).toBe("none yet");
    expect(card.state).toEqual({ tone: "caution", words: "no backup yet" });
    expect(card.facts).toEqual(["Every day at 02:00, keeps 14", "next tomorrow at 02:00"]);
  });
  it("says when the newest archive was written and what is kept", () => {
    const archive = { name: "a", created_at: "2026-09-13T09:00:00Z", seconds: 3, bytes: 1_500_000, files: 4, epoch: 1, schema_version: 37, backend: "sqlite", ours: true, checked: { at: "2026-09-13T09:00:05Z", ok: true, rehearsed: true } };
    const card = backupsCard(b({ archives: [archive, { ...archive, name: "b" }], schedule: { ...b().schedule, every: "off" } }), now);
    expect(card.value).toBe("last 3 hours ago");
    expect(card.state).toEqual({ tone: "ok", words: "last one rehearsed" });
    expect(card.facts).toEqual(["no schedule", "2 archives, 3.0 MB"]);
  });
});

describe("the registry card", () => {
  it("says what keeps it, its epoch and its calendar", () => {
    const card = registryCard(caps(), null, "sqlite", null, "Europe/Stockholm");
    expect(card.value).toBe("SQLite");
    expect(card.state).toBeNull();
    expect(card.facts).toEqual(["epoch 1,234 · schema 37", "dates read in Europe/Stockholm"]);
    expect(registryCard(caps(), null, null, null, null).value).toBe("kept by the engine");
  });
});

describe("the sign-in card", () => {
  const settings = (origin: string) => ({ origin, engine_url: "", kvasir_url: null, assistant_url: null, session_hours: 12, token_minutes: 15, cli_token_hours: 24, export: "off", store: "", retention: "", engine_flags: null });
  it("is in order on one machine, a caution on the network, and counts the people the desk keeps", () => {
    expect(signinCard(caps({ desk: { ...caps().desk, settings: settings("http://127.0.0.1:7200") } }), null).state).toEqual({ tone: "neutral", words: "this machine only" });
    expect(signinCard(caps({ desk: { ...caps().desk, settings: settings("https://desk.example.org") } }), null).state).toEqual({ tone: "caution", words: "open to the network" });
    const local = signinCard(caps({ desk: { ...caps().desk, mode: "local", settings: settings("https://desk.example.org") } }), { users: [{ username: "ada", display: "Ada", entitlements: ["admin"], admin: true, last_seen: null }], entitlements: [], sessions_open: 2 });
    expect(local.value).toBe("Local accounts");
    expect(local.facts).toEqual(["1 person · 2 sessions open", "the desk answers at https://desk.example.org"]);
  });
});

describe("the gateway card", () => {
  it("says a gateway that does not answer, and a warm one with its first local model", () => {
    expect(gatewayCard(caps(), null).state).toEqual({ tone: "blocked", words: "does not answer" });
    const kvasir = { models: [{ id: "remote-model", locality: "remote" }, { id: "local-model", locality: "local" }] };
    const card = gatewayCard(caps({ kvasir }), [{ id: "sgl", kind: "openai", locality: "local", provider: null, credential: null, models: ["local-model"], health: { running: 1, concurrency: 4 } }]);
    expect(card.value).toBe("local-model");
    expect(card.state).toEqual({ tone: "ok", words: "warm" });
    expect(card.facts).toEqual(["1 local backend", "1 of 4 streams busy", "identifiers never leave"]);
    expect(card.title).toBe("Kvasir");
  });

  it("counts ChatGPT through people's own subscriptions apart from the providers, and says when Kvasir holds no model", () => {
    const chatgpt = { id: "chatgpt", kind: "openai-codex-responses", locality: "remote" as const, provider: "chatgpt", credential: null, models: [], health: {}, builtin: true };
    const both = gatewayCard(caps({ kvasir: { models: [] } }), [{ id: "sgl", kind: "openai", locality: "local", provider: null, credential: null, models: ["local-model"], health: {} }, chatgpt]);
    expect(both.facts[0]).toBe("1 local backend · ChatGPT subscriptions");
    expect(gatewayCard(caps({ kvasir: { models: [] } }), [chatgpt]).state).toEqual({ tone: "caution", words: "no model yet" });
    expect(gatewayCard(caps(), null).value).toBe("no model reached");
  });
});

describe("the audit card", () => {
  it("says the newest act, by whom and when, and the acts this month", () => {
    const now = new Date("2026-09-13T12:00:00Z");
    const card = auditCard([{ action: "place.add", principal: "ada@lab", at: "2026-09-13T10:00:00Z" }, { action: "settings.set", principal: "ada@lab", at: "2026-08-30T10:00:00Z" }], now);
    expect(card.value).toBe("place.add");
    expect(card.facts).toEqual(["by ada@lab, 2 hours ago", "1 act this month"]);
    expect(auditCard([], now).value).toBe("no act yet");
  });
});

describe("what needs you", () => {
  it("lists every card not in order, the worst first, and a newer release last", () => {
    const cards = [partsCard(caps(), install), placesCard([], false), partsCard(caps({ engine: null }), null)];
    expect(attention(cards).map((a) => `${a.tone} ${a.words}`)).toEqual(["blocked Parts: the engine does not answer", "caution Places: none declared", "brand Parts: 1.0.0-alpha.16 is out"]);
    expect(attention([partsCard(caps(), null)])).toEqual([]);
  });
});
