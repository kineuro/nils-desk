// SPDX-License-Identifier: AGPL-3.0-only
// The Places page's words: each place's state and guarantees, what the engine
// does with it, the chips of roles, and a draft said on the form.

import { describe, expect, it } from "vitest";
import { day } from "../home/tiles";
import type { Place } from "../objects/client";
import { EMPTY, ROLE_WORDS, ROLES, draftRefusal, freeWords, guaranteeLine, guaranteesOf, pathNote, placeState, roleCounts, wholeDigest } from "./places";

const place = (over: Partial<Place>): Place => ({
  id: 1,
  name: "incoming",
  role: "source",
  path: "/srv/imaging/incoming",
  guarantees: {},
  probed: { exists: true, directory: true, writable: false, free_bytes: 1_800_000_000_000, mount: "/srv", snapshots_seen: null },
  probed_at: null,
  retired_at: null,
  ...over,
});

const registry = place({ id: 2, name: "registry", role: "registry", path: "/home/ada/nils/registry", guarantees: { backup: "backup-disk" }, probed: { exists: true, directory: true, mount: "/" } });
const backupDisk = place({ id: 3, name: "backup-disk", role: "backup", path: "/srv/backup/nils", guarantees: { protected: true }, probed: { exists: true, directory: true, mount: "/srv/backup" } });
const tools = place({ id: 5, name: "tools", role: "software", path: "/srv/shared/software", guarantees: {}, probed: { exists: true, directory: true, mount: "/srv" } });

describe("a place", () => {
  it("says what was declared of it", () => {
    expect(guaranteeLine(place({}), [])).toBe("none declared");
    expect(guaranteeLine(place({ guarantees: { snapshots: true, protected: true } }), [])).toBe("snapshots · protected");
    expect(guaranteeLine(registry, [registry, backupDisk])).toBe("backed up to backup-disk");
    expect(guaranteeLine(backupDisk, [registry, backupDisk])).toBe("protected · another disk");
    expect(guaranteeLine(place({ role: "working", guarantees: { fast: true } }), [])).toBe("fast · may be lost");
  });

  it("stands up to what its role must have, or says what it needs", () => {
    const all = [registry, backupDisk];
    expect(placeState(place({ guarantees: { snapshots: true } }), all, true)).toEqual({ tone: "ok", words: "mounted read only" });
    expect(placeState(place({ guarantees: { protected: true } }), all, false)).toEqual({ tone: "ok", words: "passes" });
    expect(placeState(place({}), all, false)).toEqual({ tone: "caution", words: "needs snapshots" });
    expect(placeState(place({ role: "export" }), all, false)).toEqual({ tone: "caution", words: "needs snapshots" });
    expect(placeState(registry, all, false)).toEqual({ tone: "ok", words: "passes" });
    expect(placeState({ ...registry, guarantees: {} }, all, false)).toEqual({ tone: "caution", words: "needs a backup elsewhere" });
    expect(placeState(backupDisk, all, false)).toEqual({ tone: "ok", words: "passes" });
    const sameDisk = { ...backupDisk, probed: { exists: true, directory: true, mount: "/" } };
    expect(placeState(sameDisk, [registry, sameDisk], false)).toEqual({ tone: "caution", words: "on the registry's disk" });
    expect(placeState(place({ probed: { exists: false } }), all, false)).toEqual({ tone: "blocked", words: "not there" });
    expect(placeState(place({ guarantees: { snapshots: true }, probed: { exists: true, directory: true, snapshots_seen: false } }), all, false)).toEqual({ tone: "caution", words: "snapshots not seen" });
    const retired = place({ retired_at: "2026-09-14T10:00:00Z" });
    expect(placeState(retired, all, false)).toEqual({ tone: "neutral", words: `retired ${day("2026-09-14T10:00:00Z")}` });
  });

  it("says what the engine does with it, and how much room it has", () => {
    expect(pathNote(place({ bound: [{ verb: "serve --ingest-root", path: "/srv/imaging/incoming" }] }))).toBe("the engine reads it");
    expect(pathNote(place({}))).toBe("the engine reads it once it starts again");
    expect(pathNote({ ...backupDisk, bound: [{ verb: "serve --backup-dir", path: "/srv/backup/nils" }] })).toBe("the engine writes its backups here");
    expect(pathNote(place({ role: "export" }))).toBeNull();
    expect(freeWords(place({}))).toBe("1.8 TB");
    expect(freeWords(place({ probed: null }))).toBe("");
  });

  it("counts the places of each role, the software place with them", () => {
    expect(roleCounts([place({}), place({ id: 4, name: "legacy" }), registry, backupDisk, tools])).toEqual([
      { role: "source", count: 2 },
      { role: "registry", count: 1 },
      { role: "backup", count: 1 },
      { role: "software", count: 1 },
    ]);
  });
});

describe("a place being added", () => {
  it("is refused on the form in one sentence, before the door is asked", () => {
    const all = [registry, backupDisk];
    expect(draftRefusal({ ...EMPTY, name: "cohort2026", path: "srv/imaging" }, all)).toBe("a place is a whole path, from /");
    expect(draftRefusal({ ...EMPTY, name: "", path: "/srv/imaging" }, all)).toBe("a place has a name");
    expect(draftRefusal({ ...EMPTY, name: "registry", path: "/srv/x" }, all)).toBe("a place named registry exists");
    expect(draftRefusal({ ...EMPTY, role: "registry", name: "second", path: "/srv/second", backup: null }, all)).toBe("the registry role is refused on a place without a backup");
    expect(draftRefusal({ ...EMPTY, name: "cohort2026", path: "/srv/imaging/2026-cohort" }, all)).toBeNull();
    // one software place (record 57 P5): a second is refused naming the first; a retired one stands in nobody's way
    expect(draftRefusal({ ...EMPTY, role: "software", name: "more-tools", path: "/srv/more" }, [...all, tools])).toBe("one place of the software role: tools is it; retire it first, or move it");
    expect(draftRefusal({ ...EMPTY, role: "software", name: "more-tools", path: "/srv/more" }, [...all, { ...tools, retired_at: "2026-10-01T00:00:00Z" }])).toBeNull();
    expect(draftRefusal({ ...EMPTY, role: "software", name: "tools", path: "/srv/shared/software" }, all)).toBeNull();
  });

  it("says what a software place holds and must have, in the add dialog's words", () => {
    expect(ROLE_WORDS.software.holds).toBe("the tools the engine installs and runs, and the site's own installs, found there");
    expect(ROLE_WORDS.software.must).toBe("one place of this role; a shared folder gets the engine's own subfolder");
    expect(ROLES).toContain("software");
  });

  it("sends the guarantees the door takes, and names a whole folder's digest after it", () => {
    expect(guaranteesOf({ ...EMPTY, guarantees: { snapshots: true, protected: false, fast: false }, backup: "backup-disk" })).toEqual({ backup: null, snapshots: true, protected: false, fast: false });
    expect(guaranteesOf({ ...EMPTY, role: "registry", backup: "backup-disk" })["backup"]).toBe("backup-disk");
    expect(wholeDigest("cohort2026")).toEqual({ name: "cohort2026", command: ["digest", "--name", "cohort2026", "@cohort2026"] });
  });
});
