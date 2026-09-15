// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page's words: the pages as levels in a few words each, what
// groups and a person's own grants add up to, the groups the provider's
// groups reach counted as groups and never sent back, the levels a group
// locks, the marks and when they collapse, the one sentence under the form,
// the short records tags, a refusal and a failed read in a few plain words,
// sign-in and sessions as values, when a person last signed in, where the
// desk answers, and a person added.

import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import {
  PAGE_LINES,
  RECORD_WORDS,
  SIGN_IN,
  accessStats,
  addRefusal,
  addUp,
  andWords,
  detailGivenBy,
  detailLocked,
  followedOnly,
  followsOf,
  givenBy,
  grantsOf,
  groupRefusal,
  groupsGiving,
  hostOf,
  lastSeenWords,
  levelOf,
  levelsOf,
  lineWords,
  locked,
  marksOf,
  memberCount,
  ownAbove,
  ownDetailAbove,
  ownPages,
  personBody,
  reachWords,
  readWords,
  refusalWords,
  seenWords,
  sessionWords,
  summaryWords,
  yourWords,
  type Access,
  type Group,
  type PageId,
  type PageLine,
  type Person,
} from "./identity";

const line = (id: PageId): PageLine => PAGE_LINES.find((l) => l.id === id) as PageLine;

const reviewers: Group = { id: 1, name: "Reviewers", grants: ["assistant:use", "data:see", "query:work", "review:work"], detail: "quasi", follows: [], members: [] };
const dataTeam: Group = { id: 2, name: "Data team", grants: ["query:see", "data:work", "release:work", "pipelines:work", "places:work"], detail: "plain", follows: [], members: [] };
const everything: Grant[] = [...SETS.admin.grants, "assistant:use"];

const person = (over: Partial<Person>): Person => ({ subject: "someone", display: "", groups: [], followed: [], grants: [], detail: null, access: { grants: [], detail: "plain" }, last_seen_at: null, sessions_open: 0, ...over });

describe("the pages as levels", () => {
  it("reads how far grants go on a page, work holding see", () => {
    expect(levelOf(["query:see", "query:work"], line("query"))).toBe("work");
    expect(levelOf(["data:see"], line("data"))).toBe("see");
    expect(levelOf(["assistant:use"], line("assistant"))).toBe("use");
    expect(levelOf(["assistant-settings:work"], line("assistant"))).toBe("hidden");
    expect(levelOf(["audit:see"], line("audit"))).toBe("see");
    expect(levelOf([], line("release"))).toBe("hidden");
  });

  it("turns a choice page by page into one grant a page, in the vocabulary's order", () => {
    expect(grantsOf(levelsOf(SETS.reviewer.grants))).toEqual(["data:see", "pipelines:see", "query:work", "review:work"]);
    expect(grantsOf({ assistant: "use", audit: "see", kvasir: "hidden" })).toEqual(["assistant:use", "audit:see"]);
    expect(grantsOf(levelsOf(everything))).toHaveLength(PAGE_LINES.length);
  });

  it("words a page in a few words, in the form and on a person's profile", () => {
    expect(lineWords(line("query"))).toBe("Ask, run and chart questions · work: keep cards, queue ask jobs");
    expect(lineWords(line("audit"))).toBe("Who did what, when");
    expect(yourWords(line("query"), "see")).toBe("Ask, run and chart questions");
    expect(yourWords(line("review"), "work")).toBe("What waits for a person · decide, tune rules");
    expect(yourWords(line("assistant"), "use")).toBe("Chat with the assistant");
    for (const l of PAGE_LINES) {
      expect(l.see.split(" ").length).toBeLessThanOrEqual(5);
      expect((l.work ?? "").split(" ").length).toBeLessThanOrEqual(5);
    }
  });
});

describe("groups and a person's own grants", () => {
  it("add up to every grant any of them gives and the highest detail", () => {
    const total = addUp([reviewers, dataTeam], { grants: ["kvasir:see"], detail: null });
    expect(total.detail).toBe("quasi");
    expect(levelsOf(total.grants)).toMatchObject({ assistant: "use", query: "work", data: "work", review: "work", release: "work", kvasir: "see", audit: "hidden" });
    expect(addUp([dataTeam], { grants: [], detail: "sensitive" }).detail).toBe("sensitive");
    expect(addUp([], { grants: [], detail: null })).toEqual({ grants: [], detail: "plain" });
  });

  it("say which groups give a page's level and the detail", () => {
    expect(givenBy([reviewers, dataTeam], line("data"))).toEqual({ level: "work", from: ["Data team"] });
    expect(givenBy([reviewers, dataTeam], line("query"))).toEqual({ level: "work", from: ["Reviewers"] });
    expect(givenBy([reviewers, { ...dataTeam, grants: ["query:work"] }], line("query"))).toEqual({ level: "work", from: ["Reviewers", "Data team"] });
    expect(givenBy([reviewers], line("kvasir"))).toEqual({ level: "hidden", from: [] });
    expect(detailGivenBy([reviewers, dataTeam])).toEqual({ detail: "quasi", from: ["Reviewers"] });
    expect(detailGivenBy([])).toEqual({ detail: "plain", from: [] });
  });

  it("lock the levels below what a group gives", () => {
    expect(locked(line("query"), "hidden", "work")).toBe(true);
    expect(locked(line("query"), "see", "work")).toBe(true);
    expect(locked(line("query"), "work", "work")).toBe(false);
    expect(locked(line("kvasir"), "hidden", "hidden")).toBe(false);
    expect(detailLocked("plain", "quasi")).toBe(true);
    expect(detailLocked("sensitive", "quasi")).toBe(false);
  });

  it("keep as a person's own only what goes above their groups", () => {
    expect(ownAbove([reviewers], { query: "work", data: "hidden", kvasir: "see" }, "quasi")).toEqual({ grants: ["kvasir:see"], detail: null });
    expect(ownAbove([reviewers], { data: "work" }, "sensitive")).toEqual({ grants: ["data:work"], detail: "sensitive" });
    expect(ownAbove([], { audit: "see" }, "plain")).toEqual({ grants: ["audit:see"], detail: null });
    expect([...ownPages(["kvasir:see", "query:work"], [reviewers])]).toEqual(["kvasir"]);
    expect(ownDetailAbove("quasi", [reviewers])).toBe(false);
    expect(ownDetailAbove("sensitive", [reviewers])).toBe(true);
    expect(ownDetailAbove(null, [])).toBe(false);
  });

  it("count the groups the provider's groups reach as groups, and send back only the groups a person was put in", () => {
    const sam = { groups: [2], followed: [1, 2] };
    expect(groupsGiving(sam, [reviewers, dataTeam]).map((g) => g.name)).toEqual(["Reviewers", "Data team"]);
    expect(followedOnly(sam, [reviewers, dataTeam]).map((g) => g.name)).toEqual(["Reviewers"]);
    expect(followedOnly({ groups: [1] }, [reviewers, dataTeam])).toEqual([]);
    expect(personBody([2], [1], [reviewers, dataTeam], { query: "work", data: "work", kvasir: "see" }, "quasi")).toEqual({ groups: [2], grants: ["kvasir:see"], detail: null });
    expect(personBody(["2", 9], [], [reviewers, dataTeam], { review: "work" }, "sensitive")).toEqual({ groups: [2], grants: ["review:work"], detail: "sensitive" });
    expect(personBody([], [1], [reviewers, dataTeam], { assistant: "use" }, null)).toEqual({ groups: [], grants: [], detail: null });
  });

  it("count a group's people: those put in it and those the provider's groups reach", () => {
    const people = [person({ subject: "bo", groups: ["1"] }), person({ subject: "cy", groups: [2] }), person({ subject: "dee", followed: [2] })];
    expect(memberCount({ ...reviewers, members: ["bo", "eli"] }, people)).toBe(2);
    expect(memberCount(reviewers, people)).toBe(1);
    expect(memberCount(dataTeam, people)).toBe(2);
    expect(memberCount({ ...dataTeam, members: ["cy"] }, null)).toBe(1);
  });
});

describe("the marks", () => {
  it("draw a page seen as an outline, a page worked filled, and a person's own dashed", () => {
    expect(marksOf(reviewers.grants)).toEqual([
      { key: "assistant", label: "Assistant", work: true, own: false },
      { key: "query", label: "Query", work: true, own: false },
      { key: "data", label: "Data", work: false, own: false },
      { key: "review", label: "Review", work: true, own: false },
    ]);
    expect(marksOf([...reviewers.grants, "kvasir:see"], new Set<PageId>(["kvasir"])).at(-1)).toEqual({ key: "kvasir", label: "Kvasir", work: false, own: true });
    expect(marksOf(["audit:see"])).toEqual([{ key: "audit", label: "Audit", work: false, own: false }]);
    expect(marksOf([])).toEqual([]);
  });

  it("collapse to Every page and Every setting when all of them are held at their top", () => {
    expect(marksOf(everything).map((m) => m.label)).toEqual(["Every page", "Every setting"]);
    expect(marksOf(SETS.admin.grants).map((m) => m.label)).toEqual(["Query", "Data", "Review", "Release", "Pipelines", "Every setting"]);
    expect(marksOf(everything.filter((g) => g !== "places:work")).map((m) => m.label)).toEqual(["Every page", "Install", "Kvasir", "Assistant settings", "Places", "Database", "Identity", "Audit"]);
    expect(marksOf(everything, new Set<PageId>(["query"])).map((m) => m.label)).toContain("Query");
  });
});

describe("the sentence under the form", () => {
  it("says in one sentence what a person sees, where they work, and how much of a record", () => {
    const grants = [...reviewers.grants, "kvasir:see"];
    expect(summaryWords({ kind: "person", name: "Erik", grants, detail: "quasi" })).toBe("Erik sees Assistant, Query, Data, Review and Kvasir, works in Query and Review, with identifying details.");
    expect(summaryWords({ kind: "person", name: " ", grants: [], detail: "plain" })).toBe("This person sees no page yet.");
    const sara = addUp([reviewers, dataTeam], { grants: [], detail: null }).grants;
    expect(summaryWords({ kind: "person", name: "Sara", grants: sara, detail: "sensitive" })).toBe(
      "Sara sees Assistant, Query, Data, Review, Release, Pipelines and Places, works in Query, Data, Review, Release, Pipelines and Places, with every detail.",
    );
  });

  it("says it for a group's people", () => {
    expect(summaryWords({ kind: "group", name: "Guests", grants: ["query:see", "data:see"], detail: "plain" })).toBe("People in Guests see Query and Data, without identifying details.");
    expect(summaryWords({ kind: "group", name: "", grants: [], detail: "sensitive" })).toBe("People in this group see no page yet.");
  });
});

describe("the words", () => {
  it("join lists and count", () => {
    expect(andWords([])).toBe("");
    expect(andWords(["A"])).toBe("A");
    expect(andWords(["A", "B", "C"])).toBe("A, B and C");
  });

  it("tag how much of a record in a word, with the whole of it kept for hover", () => {
    expect(RECORD_WORDS.plain.short).toBe("Non-identifying");
    expect(RECORD_WORDS.quasi.short).toBe("Identifying");
    expect(RECORD_WORDS.sensitive.short).toBe("Everything");
    expect(RECORD_WORDS.quasi.says).toBe("Dates, subject codes, sex and age, scanner names and series and protocol descriptions.");
  });

  it("read the provider's groups a group follows and refuse a group without a name or with one taken", () => {
    expect(followsOf("lab, lab\n  staff ,")).toEqual(["lab", "staff"]);
    expect(groupRefusal(" ", [reviewers], null)).toBe("a group has a name");
    expect(groupRefusal("reviewers", [reviewers], null)).toBe("a group named reviewers exists");
    expect(groupRefusal("Reviewers", [reviewers], 1)).toBeNull();
  });

  it("put a refusal in a few plain words, never naming a grant", () => {
    expect(refusalWords(new DoorError(409, { error: "no identity:work left" }), "group")).toBe("Refused: nobody would be left who may change people and groups.");
    expect(refusalWords(new DoorError(401, { error: "no session; log in at the desk" }), "person")).toBe("Session ended. Sign in again.");
    expect(refusalWords(new DoorError(403, { error: "changing people needs identity:work" }), "group")).toBe("You may not change people and groups.");
    expect(refusalWords(new DoorError(400, { error: "unknown group 7" }), "person")).toBe("Unknown group or page. Reload the page.");
    expect(refusalWords(new DoorError(400, { error: "data:admin is not a grant" }), "group")).toBe("Unknown group or page. Reload the page.");
    expect(refusalWords(new DoorError(400, { error: "a user named bo exists" }), "person")).toBe("A user named bo exists.");
    expect(refusalWords(new DoorError(404, {}), "person")).toBe("This person is gone. Reload the page.");
    expect(refusalWords(new DoorError(404, {}), "group")).toBe("This group is gone. Reload the page.");
    expect(refusalWords(new DoorError(500, {}), "group")).toBe("The desk answered 500.");
    expect(refusalWords(new DoorError(500, { error: "grant query:see is not held" }), "group")).toBe("The desk answered 500.");
    expect(refusalWords(new Error("offline"), "group")).toBe("offline");
  });

  it("say why the people and groups could not be read, never naming a grant", () => {
    expect(readWords(new DoorError(401, { error: "no session; log in at the desk" }))).toBe("Session ended. Sign in again.");
    expect(readWords(new DoorError(403, { error: "people need identity:see" }))).toBe("You may not see people and groups.");
    expect(readWords(new DoorError(404, { error: "not found" }))).toBe("No people or groups here. Reload the page.");
    expect(readWords(new DoorError(500, { error: "the store is locked" }))).toBe("The store is locked.");
    expect(readWords(new DoorError(502, {}))).toBe("Could not read people and groups: the desk answered 502.");
    expect(readWords(new Error("offline"))).toBe("offline");
  });

  it("say sign-in, sessions and when a person last signed in as values", () => {
    const now = Date.parse("2026-09-13T12:00:00Z");
    expect(lastSeenWords(null, now)).toBe("never");
    expect(lastSeenWords("2026-09-13T11:58:00Z", now)).toBe("now");
    expect(lastSeenWords("2026-09-13T11:20:00Z", now)).toBe("40 minutes ago");
    expect(lastSeenWords("2026-09-13T10:30:00Z", now)).toBe("an hour ago");
    expect(lastSeenWords("2026-09-13T09:00:00Z", now)).toBe("3 hours ago");
    expect(lastSeenWords("2026-09-12T09:00:00Z", now)).toBe("yesterday");
    expect(lastSeenWords("2026-09-10T09:00:00Z", now)).toBe("3 days ago");
    expect(seenWords({ last_seen_at: "2026-09-10T09:00:00Z", sessions_open: 2 }, now)).toBe("now");
    expect(sessionWords(12, 1)).toBe("12 h sessions, 1 open");
    expect(sessionWords(12, null)).toBe("12 h sessions");
    expect(SIGN_IN).toEqual({ off: "No sign-in", local: "Local accounts", oidc: "Single sign-on" });
    expect(hostOf("https://id.example.org/o/nils/")).toBe("id.example.org");
    expect(hostOf("not an address")).toBe("not an address");
  });

  it("say where the desk answers, and refuse a person added twice", () => {
    expect(reachWords("http://127.0.0.1:7200")).toEqual({ local: true, words: "Only this machine" });
    expect(reachWords("https://desk.example.org")).toEqual({ local: false, words: "This network, at https://desk.example.org" });
    expect(addRefusal({ username: " ", password: "x" }, ["anna"])).toBe("a person has a username");
    expect(addRefusal({ username: "anna", password: "a long password" }, ["anna"])).toBe("a person named anna exists");
    expect(addRefusal({ username: "bo", password: "" }, ["anna"])).toBe("a person has a password");
    expect(addRefusal({ username: "bo", password: "a long password" }, ["anna"])).toBeNull();
  });

  it("give the page's numbers for each way people sign in", () => {
    const caps = (mode: "off" | "local" | "oidc", origin = "http://127.0.0.1:7203") => ({ desk: { mode, settings: { origin } } }) as unknown as Capabilities;
    const access: Access = { mode: "local", sessions_open: 3, people: [person({ subject: "bo", display: "Bo", groups: [1], sessions_open: 2 })] };
    expect(accessStats(caps("local"), [reviewers, dataTeam], access)).toEqual([
      { label: "Sign-in", value: "Local accounts", tone: undefined },
      { label: "People", value: "1" },
      { label: "Groups", value: "2" },
      { label: "Signed in now", value: "1" },
      { label: "The desk answers", value: "This machine", tone: undefined },
    ]);
    expect(accessStats(caps("off", "https://desk.example.org"), null, null)).toEqual([
      { label: "Sign-in", value: "No sign-in", tone: "caution" },
      { label: "The desk answers", value: "The network", tone: "caution" },
    ]);
    expect(accessStats(caps("oidc"), null, null).map((s) => s.label)).toEqual(["Sign-in", "The desk answers"]);
  });
});
