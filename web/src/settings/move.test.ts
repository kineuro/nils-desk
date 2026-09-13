// SPDX-License-Identifier: AGPL-3.0-only
// A place moved to another folder: the roles that may, the rule, and the words.

import { describe, expect, it } from "vitest";
import type { Place } from "../objects/client";
import { fixedWords, knownFolders, movable, moveRefusal, moveWords } from "./move";

function place(over: Partial<Place>): Place {
  return { id: 1, name: "scans", role: "source", path: "/srv/scans", guarantees: {}, probed: null, probed_at: null, retired_at: null, ...over };
}

describe("moving a place", () => {
  it("is offered for every role but the registry and the backup place", () => {
    expect(movable("source")).toBe(true);
    expect(movable("export")).toBe(true);
    expect(movable("registry")).toBe(false);
    expect(movable("backup")).toBe(false);
    expect(fixedWords("registry")).toMatch(/backup and a restore/);
    expect(fixedWords("source")).toBeNull();
  });

  it("takes a whole path that is not where it is, and not another place's folder", () => {
    const scans = place({});
    const exports = place({ id: 2, name: "exports", role: "export", path: "/srv/exports" });
    const old = place({ id: 3, name: "old", role: "export", path: "/srv/old", retired_at: "2026-09-01T00:00:00Z" });
    expect(moveRefusal("srv/new", scans, [scans, exports])).toBe("a folder is a whole path, from /");
    expect(moveRefusal("/srv/scans/", scans, [scans, exports])).toBe("that is the folder it is in now");
    expect(moveRefusal("/srv/exports", scans, [scans, exports])).toBe("exports is that folder already");
    expect(moveRefusal("/srv/old", scans, [scans, exports, old])).toBeNull();
    expect(moveRefusal("/data/scans", scans, [scans, exports])).toBeNull();
  });

  it("says what a move does for a source and for the rest", () => {
    expect(moveWords("source")).toMatch(/^The engine reads the new folder once it starts again/);
    expect(moveWords("export")).toMatch(/^What is written from now on goes to the new folder/);
  });

  it("offers the places in force, and where the install keeps its files, to start from", () => {
    const scans = place({});
    const old = place({ id: 3, name: "old", role: "export", path: "/srv/old", retired_at: "2026-09-01T00:00:00Z" });
    expect(knownFolders([scans, old], "/srv/nils")).toEqual([
      { path: "/srv/scans", label: "scans, the source place" },
      { path: "/srv/nils", label: "where this install keeps its files" },
    ]);
    expect(knownFolders([scans], "/srv/scans")).toEqual([{ path: "/srv/scans", label: "scans, the source place" }]);
  });
});
