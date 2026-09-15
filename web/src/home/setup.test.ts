// SPDX-License-Identifier: AGPL-3.0-only
// What makes an install ready to start: which steps the desk needs, when each
// holds, and whether the rest of the desk opens.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import type { Place } from "../objects/client";
import type { Backups } from "../settings/database";
import type { Install } from "../settings/supervise";
import { backupFolderRefusal, minimumMet, progressWords, ready, setupSteps } from "./setup";
import type { Facts } from "./steps";

function caps(over: Partial<Capabilities> = {}): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.16" }, contracts: {}, doors: ["GET /api/places"], policy: [], auth: "off", principal: "the operator", roles: [], registry: { epoch: 0, schema_version: 37 }, packs: [] },
    kvasir: { models: [{ id: "MiniMax-M3", locality: "remote" }] },
    assistant: { stations: [{ id: "concierge" }] },
    apps: [],
    person: { subject: "operator", display_name: "the operator", grants: SETS.admin.grants, detail: "sensitive", groups: ["Admins"] },
    desk: {
      version: "1.0.0-alpha.16",
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

const install = { runtime: "machine", service: "systemd user units", backend: "sqlite", dir: "/srv/nils", parts: {}, places: [], services: [], release: { newer: null }, machine: { card: null, advice: [] } } as unknown as Install;

function place(id: number, name: string, role: Place["role"], path: string, backup?: string): Place {
  return { id, name, role, path, guarantees: backup ? { backup } : {}, probed: { mount: "/srv" }, probed_at: null, retired_at: null };
}

const registryAndBackups = [place(1, "backups", "backup", "/data/backups"), place(2, "registry", "registry", "/srv/nils/registry", "backups")];

const archives = (every: "off" | "day", created: string | null): Backups => ({
  dir: "/data/backups",
  place: null,
  count: created ? 1 : 0,
  archives: created ? [{ name: "a", created_at: created, seconds: 1, bytes: 10, files: 3, epoch: 0, schema_version: 37, backend: "sqlite", ours: true, checked: { at: created, ok: true, rehearsed: true } }] : [],
  schedule: { every, at: "02:00", day: null, keep: 14, timezone: "UTC", next: null, next_local: null, last: null },
});

const facts = (over: Partial<Facts> = {}): Facts => ({ caps: caps(), install, places: registryAndBackups, batches: 0, backups: [], purposes: [], ...over });
const now = Date.parse("2026-09-13T12:00:00Z");
const by = (f: Facts, id: string) => setupSteps(f, now).find((s) => s.id === id)!;

describe("setup's steps", () => {
  it("are the install, bringing DICOM in, the backups and who signs in, which the desk needs, and a model worth doing", () => {
    const all = setupSteps(facts(), now);
    expect(all.map((s) => [s.id, s.required])).toEqual([
      ["installed", true],
      ["sources", true],
      ["backups", true],
      ["signin", true],
      ["model", false],
    ]);
    expect(all[0].met).toBe(true);
  });

  it("hold DICOM once a source is named, digested or not", () => {
    expect(by(facts(), "sources").met).toBe(false);
    expect(by(facts({ places: [...registryAndBackups, place(3, "incoming", "source", "/srv/incoming")] }), "sources").met).toBe(true);
  });

  it("hold the backups once the registry names a backup place and a backup is scheduled or recent, and not after a failed check", () => {
    expect(by(facts({ archives: archives("off", null) }), "backups").met).toBe(false);
    expect(by(facts({ archives: archives("day", null) }), "backups").met).toBe(true);
    expect(by(facts({ archives: archives("off", "2026-09-13T02:00:00Z") }), "backups").met).toBe(true);
    const failed = archives("day", "2026-09-13T02:00:00Z");
    failed.archives[0].checked = { at: "", ok: false, rehearsed: true };
    expect(by(facts({ archives: failed }), "backups")).toMatchObject({ met: false, tone: "caution" });
    expect(by(facts({ places: [place(2, "registry", "registry", "/srv/nils/registry")], archives: archives("day", null) }), "backups").met).toBe(false);
    // an operator who may not read the schedule is held back only by the backup place
    expect(by(facts({ archives: null }), "backups").met).toBe(true);
  });

  it("hold who signs in on one machine or with sign-in, and not a desk open to the network with nobody signing in", () => {
    expect(by(facts(), "signin").met).toBe(true);
    const open = caps({ desk: { ...caps().desk, settings: { ...caps().desk.settings!, origin: "https://desk.example.org" } } });
    expect(by(facts({ caps: open }), "signin")).toMatchObject({ met: false, tone: "caution" });
    expect(by(facts({ caps: { ...open, desk: { ...open.desk, mode: "local" } } }), "signin").met).toBe(true);
  });
});

describe("the rest of the desk", () => {
  it("opens once every needed step holds, whatever is worth doing later", () => {
    const set = facts({ places: [...registryAndBackups, place(3, "incoming", "source", "/srv/incoming")], archives: archives("day", null) });
    const all = setupSteps(set, now);
    expect(minimumMet(all)).toBe(true);
    expect(progressWords(all)).toBe("Every step the desk needs is done, and one more is worth doing.");
    expect(minimumMet(setupSteps(facts({ archives: archives("day", null) }), now))).toBe(false);
    expect(progressWords(setupSteps(facts({ archives: archives("day", null) }), now))).toBe("3 of the 4 steps the desk needs are done.");
  });

  it("is open to a person who may not see the install, and unknown until the places are read", () => {
    const reader = caps({ person: { subject: "r", display_name: "r", grants: SETS.reader.grants, detail: "plain", groups: ["Readers"] } });
    expect(ready(reader, null, null, null)).toBe(true);
    expect(ready(caps({ person: { subject: "i", display_name: "i", grants: ["install:see"], detail: "plain", groups: [] } }), install, null, null)).toBeNull();
    expect(ready(caps(), install, null, null)).toBeNull();
    expect(ready(caps(), install, registryAndBackups, archives("day", null))).toBe(false);
    expect(ready(caps(), install, [...registryAndBackups, place(3, "incoming", "source", "/srv/incoming")], archives("day", null))).toBe(true);
  });

  it("offers the engine's backup folder only with work on the Database and the Places pages, and says in words what is missing", () => {
    const holding = (grants: Grant[]) => caps({ person: { subject: "p", display_name: "p", grants, detail: "plain", groups: [] } });
    expect(backupFolderRefusal(caps())).toBeNull();
    expect(backupFolderRefusal(holding(["database:work", "places:work"]))).toBeNull();
    expect(backupFolderRefusal(holding(["database:work", "places:see"]))).toBe(
      "Backing up to the engine's backup folder needs work on the Database page and on the Places page; this account has no work on the Places page.",
    );
    expect(backupFolderRefusal(holding(["places:work", "database:see"]))).toMatch(/this account has no work on the Database page\.$/);
    expect(backupFolderRefusal(holding(["database:see"]))).toMatch(/this account has no work on the Database page or on the Places page\.$/);
    for (const g of [[], ["database:see"], ["places:work"]] as Grant[][]) expect(backupFolderRefusal(holding(g))).not.toMatch(/:(see|work|use)\b/);
  });
});
