// SPDX-License-Identifier: AGPL-3.0-only
// An address with a question mark: the page narrows itself (record 26),
// and an address without one reads as it did.

import { describe, expect, it } from "vitest";
import { href, moved, narrow, parse } from "./routes";

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

// record 55 H2, round 4: one word per thing, and an old address never strands a person
describe("addresses that took the map's words", () => {
  it("lead Query to Ask and the renamed Settings pages to their new names, keeping what they open and narrow", () => {
    expect(moved(parse("#query"))).toBe("#ask");
    expect(moved(parse("#query/12"))).toBe("#ask/12");
    expect(moved(parse("#query/selections"))).toBe("#ask/selections");
    expect(moved(parse("#settings/database"))).toBe("#settings/backups");
    expect(moved(parse("#settings/identity"))).toBe("#settings/people");
    expect(moved(parse("#settings/gateway?x=1"))).toBe("#settings/language-models?x=1");
    expect(moved(parse("#models/model/3"))).toBe("#pipelines/models/3");
    expect(moved(parse("#settings/places"))).toBeNull();
    expect(moved(parse("#ask/12"))).toBeNull();
  });
});
