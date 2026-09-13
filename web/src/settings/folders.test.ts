// SPDX-License-Identifier: AGPL-3.0-only
// Choosing a folder by clicking: a path made plain, the way back up, a disk
// and a missing mount in words, and what a listing says of its folder.

import { describe, expect, it } from "vitest";
import { crumbs, entryNote, filesWords, inside, listingNote, mountWords, plainPath, rootWords, type Listing } from "./folders";

const listing = (over: Partial<Listing> = {}): Listing => ({
  path: "/srv/imaging",
  parent: "/srv",
  exists: true,
  directory: true,
  readable: true,
  mount: null,
  folders: [],
  files: 0,
  partial: false,
  timed_out: false,
  ...over,
});

describe("a path", () => {
  it("is made plain, and refused unless whole from /", () => {
    expect(plainPath(" /srv//imaging/./incoming/ ")).toBe("/srv/imaging/incoming");
    expect(plainPath("/srv/../data")).toBe("/data");
    expect(plainPath("/..")).toBe("/");
    expect(plainPath("/")).toBe("/");
    expect(plainPath("srv/imaging")).toBeNull();
  });
  it("has its folders from / down, and a folder inside it", () => {
    expect(crumbs("/srv/imaging")).toEqual([
      { name: "/", path: "/" },
      { name: "srv", path: "/srv" },
      { name: "imaging", path: "/srv/imaging" },
    ]);
    expect(crumbs("/")).toEqual([{ name: "/", path: "/" }]);
    expect(inside("/", "srv")).toBe("/srv");
    expect(inside("/srv", "imaging")).toBe("/srv/imaging");
  });
});

describe("a disk", () => {
  it("says its filesystem, where it comes from and its room", () => {
    expect(mountWords({ point: "/srv", fs: "zfs", source: "pool/srv", network: false, free_bytes: 1.2e12, total_bytes: 4e12 })).toBe("zfs · from pool/srv · 1.2 TB free of 4.0 TB");
    expect(mountWords({ point: "/archive", fs: "nfs4", source: "files:/export", network: true, free_bytes: null, total_bytes: null })).toBe("nfs4, a network disk · from files:/export");
  });
  it("names each place to start from", () => {
    expect(rootWords({ path: "/", kind: "root", mount: null, unmounted: null })).toBe("the whole machine");
    expect(rootWords({ path: "/data", kind: "mount", mount: { point: "/data", fs: "nfs4", source: "files:/export/data", network: true, free_bytes: 4.3e13, total_bytes: 6e13 }, unmounted: null })).toBe("nfs4, network, 43 TB free");
    expect(rootWords({ path: "/archive", kind: "fstab", mount: null, unmounted: { fs: "nfs4", source: "files:/export", network: true } })).toBe("not mounted: /etc/fstab names nfs4 from files:/export");
  });
});

describe("a folder in the list", () => {
  const entry = { name: "x", readable: true, hidden: false, link: false, mount: null, unmounted: null };
  it("says a disk that is not mounted before anything else, then no access, then the disk mounted there", () => {
    expect(entryNote(entry)).toBeNull();
    expect(entryNote({ ...entry, readable: false, unmounted: { fs: "nfs4", source: "", network: true } })).toEqual({ tone: "caution", words: "not mounted, nfs4" });
    expect(entryNote({ ...entry, readable: false })).toEqual({ tone: "blocked", words: "no access" });
    expect(entryNote({ ...entry, mount: { point: "/data", fs: "nfs4", source: "", network: true, free_bytes: null, total_bytes: null } })).toEqual({ tone: "neutral", words: "nfs4, network" });
  });
});

describe("a listing", () => {
  it("says a folder that did not answer, one with nothing mounted, and one that is not there", () => {
    expect(listingNote(listing(), null)).toBeNull();
    expect(listingNote(listing({ timed_out: true, exists: null }), null)?.tone).toBe("caution");
    expect(listingNote(listing(), { fs: "nfs4", source: "files:/export", network: true })?.words).toMatch(/^Nothing is mounted here\. \/etc\/fstab names nfs4 from files:\/export/);
    expect(listingNote(listing({ exists: false }), null)).toEqual({ tone: "blocked", words: "Nothing is there on this machine." });
  });
  it("says the files beside the folders, and an empty folder", () => {
    expect(filesWords(listing())).toBe("an empty folder");
    expect(filesWords(listing({ files: 1 }))).toBe("1 file here too");
    expect(filesWords(listing({ files: 10000, partial: true }))).toBe("10,000 or more files here too");
    expect(filesWords(listing({ folders: [{ name: "a", readable: true, hidden: false, link: false, mount: null, unmounted: null }] }))).toBeNull();
  });
});
