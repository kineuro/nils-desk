// SPDX-License-Identifier: AGPL-3.0-only
// The engine's picker, apart from the page: a folder named as @root/relative
// and the way back up, pages merged, the folders a look is asked about, what a
// look found, the chosen folders and the digest each becomes.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import type { FolderEntry, FolderPage, LookedFolder } from "./browse";
import {
  atOf,
  childAt,
  chosenNote,
  crumbsOf,
  digestName,
  digestPlan,
  digestWords,
  filesWords,
  folderNote,
  heldBy,
  insideOf,
  isInside,
  listWords,
  lookNames,
  lookWords,
  mergePage,
  newFolderRefusal,
  parentAt,
  parseAt,
  pathInside,
  queuedWords,
  rootWords,
  toggleChosen,
  type Chosen,
} from "./picker";

const entry = (name: string, readable: boolean | null = true): FolderEntry => ({ name, readable, place: null });

describe("adding a new folder as a source", () => {
  const holding = (grants: Grant[]) => ({ person: { subject: "p", display_name: "p", grants, detail: "plain", groups: [] } }) as unknown as Capabilities;
  it("is offered with work on the Data and the Places pages, and said in words without either", () => {
    expect(newFolderRefusal(holding(["data:work", "places:work"]))).toBeNull();
    expect(newFolderRefusal(holding(["data:work"]))).toBe(
      "Bringing DICOM in from a new folder needs work on the Data page and on the Places page; this account has no work on the Places page.",
    );
    expect(newFolderRefusal(holding(["places:work", "data:see"]))).toMatch(/this account has no work on the Data page\.$/);
  });
});

describe("a folder named as @root/relative", () => {
  it("has its parts, the folder above it and the way back up", () => {
    expect(parseAt("@scans/sub-001//ses-1/")).toEqual({ root: "scans", rel: ["sub-001", "ses-1"] });
    expect(parseAt("/srv/scans")).toBeNull();
    expect(parseAt("@scans/../etc")).toBeNull();
    expect(parseAt("@")).toBeNull();
    expect(atOf("scans", [])).toBe("@scans");
    expect(childAt("@scans", "sub-001")).toBe("@scans/sub-001");
    expect(parentAt("@scans/sub-001/ses-1")).toBe("@scans/sub-001");
    expect(parentAt("@scans/sub-001")).toBe("@scans");
    expect(parentAt("@scans")).toBeNull();
    expect(crumbsOf("@scans/sub-001/ses-1")).toEqual([
      { name: "scans", at: "@scans" },
      { name: "sub-001", at: "@scans/sub-001" },
      { name: "ses-1", at: "@scans/sub-001/ses-1" },
    ]);
    expect(pathInside("/srv/scans", "a")).toBe("/srv/scans/a");
    expect(pathInside("/", "srv")).toBe("/srv");
  });
  it("is inside another only below it", () => {
    expect(isInside("@scans/a/b", "@scans/a")).toBe(true);
    expect(isInside("@scans/ab", "@scans/a")).toBe(false);
    expect(isInside("@scans/a", "@scans/a")).toBe(false);
    expect(isInside("@scans2/a", "@scans")).toBe(false);
  });
});

describe("the pages of a folder", () => {
  it("are merged without listing a folder twice", () => {
    expect(mergePage([entry("a"), entry("b")], [entry("b"), entry("c")]).map((e) => e.name)).toEqual(["a", "b", "c"]);
  });
  it("ask a look about the folders on screen not looked inside yet, 64 at a time", () => {
    const rows = [entry("a"), entry("b"), entry("locked", false), entry("c"), entry("d", null), entry("off")];
    const looks: Record<string, LookedFolder> = { "@scans/a": { name: "a", looked: true }, "@scans/c": { name: "c", looked: false } };
    expect(lookNames("@scans", rows, ["a", "b", "locked", "c", "d"], looks)).toEqual(["b", "c", "d"]);
    expect(lookNames("@scans", rows, ["b"], looks)).toEqual(["b"]);
    expect(lookNames("@other", rows, ["a"], looks)).toEqual(["a"]);
    const many = Array.from({ length: 100 }, (_, i) => entry(`f${i}`));
    expect(lookNames("@scans", many, many.map((e) => e.name), {})).toHaveLength(64);
  });
  it("say how much is listed, and the files beside the folders", () => {
    const page = (over: Partial<FolderPage>): FolderPage => ({
      at: "@scans/sub-001",
      root: "scans",
      rel: "sub-001",
      path: "/srv/scans/sub-001",
      parent: "@scans",
      exists: true,
      directory: true,
      readable: true,
      place: null,
      folders: [],
      next: null,
      total: 0,
      files: { count: 0, more: false },
      partial: false,
      timed_out: false,
      ...over,
    });
    expect(listWords(page({ total: 20000 }), 200, "")).toBe("200 of 20,000 folders.");
    expect(listWords(page({ total: 3, files: { count: 2, more: false } }), 3, "")).toBe("2 files here too.");
    expect(listWords(page({ total: 0 }), 0, "sub")).toBe('No folder here has "sub" in its name.');
    expect(listWords(page({ total: null, partial: true }), 1000, "")).toBe("This folder holds more than can be listed; filter by name to find a folder.");
    expect(folderNote(page({ place: { name: "incoming", role: "source" } }))).toEqual({ tone: "neutral", words: "In the source incoming." });
    expect(folderNote(page({})).tone).toBe("caution");
    expect(folderNote(page({ place: { name: "out", role: "export" } })).words).toContain("It is in the export place out.");
    expect(folderNote(page({ exists: false })).words).toBe("Nothing is there any more.");
    expect(folderNote(page({ readable: false })).tone).toBe("blocked");
    expect(rootWords({ name: "scans", path: "/srv/scans", place: { name: "incoming", role: "source" } })).toBe("the source incoming");
    expect(rootWords({ name: "archive", path: "/srv/archive", place: null })).toBe("no place holds it");
  });
});

describe("what a look found", () => {
  const looked = (over: Partial<LookedFolder>): LookedFolder => ({ name: "x", looked: true, sampled: 0, dicom: 0, modalities: {}, scanners: 0, files: { count: 0, more: false }, ...over });
  it("says the modalities seen most first, the scanners and the files", () => {
    expect(lookWords(looked({ sampled: 16, dicom: 16, modalities: { CT: 4, MR: 12, unknown: 1 }, scanners: 2, files: { count: 800, more: true } }))).toEqual({
      tone: "dicom",
      words: "MR, CT, 2 scanners · 800 or more files",
    });
    expect(lookWords(looked({ sampled: 1, dicom: 1, modalities: { unknown: 1 }, files: { count: 1, more: false } }))).toEqual({ tone: "dicom", words: "DICOM · 1 file" });
    expect(lookWords(looked({ sampled: 3, files: { count: 3, more: false } }))).toEqual({ tone: "other", words: "no DICOM found · 3 files" });
    expect(lookWords(looked({}))).toEqual({ tone: "quiet", words: "no files" });
    expect(lookWords(looked({ files: { count: 0, more: true } })).words).toBe("no files reached yet");
    expect(lookWords({ name: "x", looked: false }).words).toBe("not looked inside yet");
    expect(lookWords(looked({ directory: false })).words).toBe("no longer a folder here");
    expect(lookWords(undefined).words).toBe("");
    expect(filesWords({ count: 12345, more: false })).toBe("12,345 files");
    expect(filesWords({ count: 1, more: true })).toBe("1 or more files");
  });
});

describe("the chosen folders", () => {
  const source = { name: "incoming", role: "source" };
  const a: Chosen = { at: "@scans/sub-001", path: "/srv/scans/sub-001", place: source };
  const b: Chosen = { at: "@scans/sub-001/ses-1", path: "/srv/scans/sub-001/ses-1", place: source };
  const c: Chosen = { at: "@archive/2019", path: "/srv/archive/2019", place: null };
  it("are ticked and unticked from anywhere, and an inner one is kept and said to be inside", () => {
    let list = toggleChosen([], a);
    list = toggleChosen(list, b);
    list = toggleChosen(list, c);
    expect(list.map((x) => x.at)).toEqual([a.at, b.at, c.at]);
    expect(insideOf(list, b.at)).toBe(a.at);
    expect(insideOf(list, a.at)).toBeNull();
    expect(chosenNote(b, insideOf(list, b.at))).toBe("in the source incoming; inside @scans/sub-001, which is chosen too");
    expect(chosenNote(c, null)).toBe("no source place holds it");
    expect(toggleChosen(list, a).map((x) => x.at)).toEqual([b.at, c.at]);
  });
  it("inside a folder added as a source are held by it", () => {
    const d: Chosen = { at: "@archive/2019/p1", path: "/srv/archive/2019/p1", place: null };
    const e: Chosen = { at: "@archive/2020", path: "/srv/archive/2020", place: null };
    const added = { name: "archive-2019", role: "source" };
    expect(heldBy([a, c, d, e], "@archive/2019", added).map((x) => x.place?.name ?? null)).toEqual(["incoming", "archive-2019", "archive-2019", null]);
  });
  it("become one digest each, named from their paths, readable and never twice", () => {
    expect(digestName("@scans/sub-001/ses-1", [])).toBe("scans-sub-001-ses-1");
    expect(digestName("@scans", [])).toBe("scans");
    expect(digestName("@scans/imaging-department-archive/2026 Cohort/sub-0001/ses-01", [])).toBe("2026-cohort-sub-0001-ses-01");
    expect(digestName("@scans/sub-001/ses-1", ["scans-sub-001-ses-1"])).toBe("scans-sub-001-ses-1-2");
    expect(digestPlan([a, { ...a, at: "@scans/sub_001" }])).toEqual([
      { at: "@scans/sub-001", name: "scans-sub-001", command: ["digest", "--name", "scans-sub-001", "@scans/sub-001"] },
      { at: "@scans/sub_001", name: "scans-sub-001-2", command: ["digest", "--name", "scans-sub-001-2", "@scans/sub_001"] },
    ]);
    expect(queuedWords([{ name: "scans-sub-001", job: 12 }])).toBe("One digest is queued: scans-sub-001 (job 12).");
    expect(queuedWords([{ name: "a", job: 1 }, { name: "b", job: 2 }, { name: "c", job: 3 }])).toBe("3 digests are queued: a (job 1), b (job 2) and c (job 3).");
    expect([0, 1, 2].map(digestWords)).toEqual(["Digest the chosen folders", "Digest 1 folder", "Digest 2 folders"]);
  });
});
