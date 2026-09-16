// SPDX-License-Identifier: AGPL-3.0-only
// An address with a question mark: the page narrows itself (record 26),
// and an address without one reads as it did.

import { describe, expect, it } from "vitest";
import { href, narrow, parse } from "./routes";

describe("an address that narrows a page", () => {
  it("reads the batch a queue is reached from", () => {
    expect(parse("#review?batch=12")).toEqual({ section: "review", page: null, arg: null, sub: null, query: { batch: "12" } });
    expect(parse("#review/queue?batch=12&cohort=ms")).toEqual({ section: "review", page: "queue", arg: null, sub: null, query: { batch: "12", cohort: "ms" } });
    expect(parse("#review/rules")).toEqual({ section: "review", page: "rules", arg: null, sub: null });
  });
  it("keeps an address without one as it was, and an empty question mark names nothing", () => {
    expect(parse("#review?")).toEqual({ section: "review", page: null, arg: null, sub: null });
    expect(parse("#settings/places/backup%20disk")).toEqual({ section: "settings", page: "places", arg: "backup disk", sub: null });
    expect(href("review", "identifiers")).toBe("#review/identifiers");
  });
  it("is written from a hash and what narrows it, and reads back", () => {
    expect(narrow(href("review"), { batch: 12 })).toBe("#review?batch=12");
    expect(narrow(href("review"), { cohort: "spring scans" })).toBe("#review?cohort=spring%20scans");
    expect(parse(narrow(href("review"), { cohort: "spring scans" })).query).toEqual({ cohort: "spring scans" });
    expect(narrow(href("review"), { batch: null, cohort: "" })).toBe("#review");
  });
});
