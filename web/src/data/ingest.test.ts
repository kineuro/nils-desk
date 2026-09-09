// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { command, locate, restoreProcedure } from "./ingest";

describe("every ingest verb runs against a pre-registered location", () => {
  it("names the location as @root/relative and refuses an absolute path or a parent step", () => {
    expect(locate({ root: "scratch", path: "ms/2026-09" })).toEqual({ ok: true, at: "@scratch/ms/2026-09" });
    expect(locate({ root: "scratch", path: "" })).toEqual({ ok: true, at: "@scratch" });
    expect(locate({ root: "scratch", path: "./a/b" })).toEqual({ ok: true, at: "@scratch/a/b" });
    expect(locate({ root: "scratch", path: "/mnt/x" })).toMatchObject({ ok: false });
    expect(locate({ root: "scratch", path: "a/../../etc" })).toMatchObject({ ok: false });
    expect(locate({ root: "", path: "a" })).toMatchObject({ ok: false, why: "pick a registered location" });
  });
  it("composes only the command line the job door accepts", () => {
    expect(command({ verb: "digest", location: { root: "scratch", path: "ms" }, name: "ms september", files: "dcm" })).toEqual({ ok: true, command: ["digest", "@scratch/ms", "--name", "ms september", "--files", "dcm"] });
    expect(command({ verb: "classify", location: { root: "", path: "" }, modality: "MR" })).toEqual({ ok: true, command: ["classify", "--modality", "MR"] });
    expect(command({ verb: "fingerprint", location: { root: "", path: "" }, force: true })).toEqual({ ok: true, command: ["fingerprint", "--force"] });
    expect(command({ verb: "linkage import", location: { root: "scratch", path: "codes.csv" }, id_type: "patient-id" })).toEqual({ ok: true, command: ["linkage", "import", "@scratch/codes.csv", "--id-type", "patient-id"] });
    expect(command({ verb: "linkage import", location: { root: "scratch", path: "" } })).toMatchObject({ ok: false });
    expect(command({ verb: "digest", location: { root: "scratch", path: "/abs" } })).toMatchObject({ ok: false });
  });
  it("the restore page prints the procedure with a pre-restore archive first, and runs nothing", () => {
    const lines = restoreProcedure("/srv/backups/2026-09-09", "/srv/nils");
    expect(lines.find((l) => l.startsWith("nils restore"))).toBe("nils restore --registry /srv/nils --yes /srv/backups/2026-09-09");
    expect(lines.findIndex((l) => l.startsWith("nils backup"))).toBeLessThan(lines.findIndex((l) => l.startsWith("nils restore")));
  });
});
