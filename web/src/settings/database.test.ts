// SPDX-License-Identifier: AGPL-3.0-only
// The Database page's words: an archive, the backups and their schedule, and
// where the registry lives.

import { describe, expect, it } from "vitest";
import type { Place } from "../objects/client";
import {
  backupByHand,
  backupsTag,
  checkedTag,
  draftBody,
  draftChanged,
  draftOf,
  draftRule,
  keepWords,
  keptBy,
  livesNote,
  nextWords,
  registryRule,
  rehearseByHand,
  scheduleWords,
  sizeWords,
  tookWords,
  type Archive,
  type Backups,
  type BackupSchedule,
  type RegistryStatus,
} from "./database";
import type { Install } from "./supervise";

const archive = (over: Partial<Archive> = {}): Archive => ({
  name: "78195d1d-20260913013736",
  created_at: "2026-09-13T01:37:36Z",
  seconds: 240,
  bytes: 1_200_000_000,
  files: 3,
  epoch: 1412,
  schema_version: 37,
  backend: "postgres",
  ours: true,
  checked: null,
  ...over,
});

const schedule = (over: Partial<BackupSchedule> = {}): BackupSchedule => ({
  every: "day",
  at: "02:00",
  day: null,
  keep: 14,
  timezone: "Europe/Stockholm",
  next: "2026-09-14T00:00:00Z",
  next_local: "2026-09-14T02:00",
  last: null,
  ...over,
});

const backups = (archives: Archive[], over: Partial<Backups> = {}): Backups => ({
  dir: "/srv/backup/nils",
  place: { id: 2, name: "backup-disk", guarantees: {} },
  count: archives.length,
  archives,
  schedule: schedule(),
  ...over,
});

describe("an archive", () => {
  it("says its size, how long it took and its last check", () => {
    expect(sizeWords(512)).toBe("512 B");
    expect(sizeWords(729_141)).toBe("729 KB");
    expect(sizeWords(1_200_000_000)).toBe("1.2 GB");
    expect(sizeWords(16_800_000_000)).toBe("17 GB");
    expect(tookWords(null)).toBe("");
    expect(tookWords(0)).toBe("under a second");
    expect(tookWords(42)).toBe("42 s");
    expect(tookWords(240)).toBe("4 min");
    expect(checkedTag(archive())).toEqual({ tone: "neutral", words: "not checked" });
    expect(checkedTag(archive({ checked: { at: "t", ok: true, rehearsed: true } }))).toEqual({ tone: "ok", words: "rehearsed" });
    expect(checkedTag(archive({ checked: { at: "t", ok: true, rehearsed: false } }))).toEqual({ tone: "ok", words: "verified" });
    expect(checkedTag(archive({ checked: { at: "t", ok: false, rehearsed: false, files: [{ name: "registry.dump", state: "differs" }] } })).words).toBe("differs from its manifest");
    const opens = { at: "t", ok: false, rehearsed: true, files: [{ name: "registry.dump", state: "ok" }], opened: [{ name: "registry.dump", state: "pg_restore cannot read it" }] };
    expect(checkedTag(archive({ checked: opens })).words).toBe("a store does not open");
  });
});

describe("the backups", () => {
  it("say how the newest archive of this registry stands", () => {
    expect(backupsTag(backups([]))).toEqual({ tone: "caution", words: "no backup yet" });
    expect(backupsTag(backups([], { dir: null }))).toEqual({ tone: "caution", words: "no backup directory" });
    const another = archive({ ours: false, checked: { at: "t", ok: true, rehearsed: true } });
    expect(backupsTag(backups([another, archive()]))).toEqual({ tone: "caution", words: "last one not checked" });
    expect(backupsTag(backups([archive({ checked: { at: "t", ok: true, rehearsed: true } })]))).toEqual({ tone: "ok", words: "last one rehearsed" });
    expect(backupsTag(backups([archive({ checked: { at: "t", ok: false, rehearsed: true } })])).tone).toBe("blocked");
  });

  it("say the schedule, when it next comes round and what keeping costs", () => {
    expect(scheduleWords({ every: "off", at: "02:00", day: null })).toBe("Off");
    expect(scheduleWords({ every: "day", at: "02:00", day: null })).toBe("Every day at 02:00");
    expect(scheduleWords({ every: "week", at: "03:30", day: "sunday" })).toBe("Every Sunday at 03:30");
    // noon UTC is two in the afternoon in Stockholm, on the 13th
    const now = new Date("2026-09-13T12:00:00Z");
    expect(nextWords(schedule(), now)).toBe("next tomorrow at 02:00");
    expect(nextWords(schedule({ next_local: "2026-09-13T23:30" }), now)).toBe("next today at 23:30");
    expect(nextWords(schedule({ every: "off", next_local: null }), now)).toBeNull();
    expect(keepWords(14, backups([archive()]))).toEqual({ label: "The last 14", meta: "about 17 GB" });
    expect(keepWords(null, backups([archive()]))).toEqual({ label: "Every archive", meta: "until one is removed by hand" });
    expect(keepWords(7, backups([]))).toEqual({ label: "The last 7", meta: null });
    expect(backupByHand(14)).toBe("nils backup --rehearse --keep 14");
    expect(backupByHand(null)).toBe("nils backup --rehearse");
    expect(rehearseByHand("/srv/backup/nils", "78195d1d-20260913013736")).toBe("nils verify /srv/backup/nils/78195d1d-20260913013736 --rehearse");
  });

  it("check a schedule before the door does, and send only what the door takes", () => {
    const kept = schedule({ every: "week", day: "friday", at: "23:15", keep: null });
    const d = draftOf(kept);
    expect(d).toEqual({ every: "week", at: "23:15", day: "friday", keep: null });
    expect(draftOf(schedule()).day).toBe("sunday");
    expect(draftRule({ ...d, at: "2:00" })).toMatch(/HH:MM/);
    expect(draftRule({ ...d, at: "24:00" })).toMatch(/HH:MM/);
    expect(draftRule({ ...d, every: "off", at: "nonsense" })).toBeNull();
    expect(draftBody({ ...d, every: "day" })).toEqual({ every: "day", at: "23:15", day: null, keep: null });
    expect(draftChanged(d, kept)).toBe(false);
    expect(draftChanged({ ...d, keep: 7 }, kept)).toBe(true);
    expect(draftChanged({ ...d, day: "monday" }, kept)).toBe(true);
    expect(draftChanged({ every: "off", at: "09:00", day: "sunday", keep: null }, schedule({ every: "off", keep: null }))).toBe(false);
  });
});

describe("where the registry lives", () => {
  const place = (over: Partial<Place>): Place => ({ id: 1, name: "registry", role: "registry", path: "/srv/nils/registry", guarantees: {}, probed: null, probed_at: null, retired_at: null, ...over });
  const status = (over: Partial<RegistryStatus> = {}): RegistryStatus => ({
    home: "/srv/nils/registry",
    backend: "postgres",
    schema: "nils",
    registry_id: "78195d1d",
    schema_version: 37,
    epoch: 1412,
    created_at: "2026-09-12T10:00:00Z",
    pseudonym_scheme: "blake2b-32",
    pseudonym_key: "nils",
    display_length: 12,
    ...over,
  });
  const install = (over: Partial<Install> = {}): Install =>
    ({
      dir: "/home/ada/nils",
      runtime: "docker",
      parts: { postgres: { version: "17", kind: "docker", path: "postgres:17" } },
      services: [{ part: "postgres", unit: "nils-postgres", watcher: "docker", running: true }],
      ...over,
    }) as Install;

  it("passes the rule with a backup place elsewhere", () => {
    expect(registryRule([])).toEqual({ tone: "caution", words: "no registry place" });
    expect(registryRule([place({ guarantees: { backup: "backups" } })]).tone).toBe("blocked");
    const backup = place({ id: 2, name: "backups", role: "backup", path: "/srv/backup" });
    expect(registryRule([place({ guarantees: { backup: "backups" } }), backup])).toEqual({ tone: "ok", words: "passes the rule" });
    expect(registryRule([place({ guarantees: { backup: "backups" } }), { ...backup, retired_at: "2026-09-01T00:00:00Z" }]).tone).toBe("blocked");
  });

  it("says what keeps it, and whether an update keeps it", () => {
    expect(keptBy(status({ backend: "sqlite" }), null)).toBe("SQLite, in files of the registry place");
    expect(keptBy(status(), install())).toBe("Postgres 17, set up here, as nils-postgres");
    expect(keptBy(status(), install({ parts: {} }))).toBe("Postgres, a server of your own");
    expect(livesNote(install()).lead).toBe("Kept on this machine, outside every container");
    expect(livesNote(install({ runtime: "machine" })).detail).toBe("Updating replaces the programs and keeps the registry. Deleting /home/ada/nils deletes it.");
  });
});
