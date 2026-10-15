// SPDX-License-Identifier: AGPL-3.0-only
// Record 55 H2, round 5: the words and rules behind the missing controls.
// A handover is offered on each name's newest version not withdrawn, into an
// exchange place, under a key; a withdrawal is the release verb queued with
// its reason; a log's pieces join as it is followed and read back; restore
// is three printed steps for the install's own engine; the Assistant's
// ladder offers only rung-two doors not yet standing; a password is long
// enough and typed the same twice; Settings names the language models so,
// under Parts, and the Assistant lists its two new pages where it serves
// them.

import { describe, expect, it } from "vitest";
import { ladderPages, grantPages, grantWords, offerOfLadder, plainReason, standing, waitingCount, waitingPlans } from "../assistant/ladder";
import type { Capabilities } from "../capabilities";
import type { Release } from "../data/cohorts";
import type { Place } from "../objects/client";
import { earlierFrom, joined, prepended, refusedWords, runOf, LogRefused, type LogPiece } from "../ops/logs";
import { exchangePlaces, handoverOut, handoverRows, keyRefusal, passwordCommand, withdrawCommand, withdrawRefusal } from "../ops/releaseActs";
import { assistantPages } from "../sections";
import { restoreSteps } from "../settings/database";
import { passwordRefusal, removedWords } from "../settings/identity";
import { settingsPages } from "../settings/pages";
import { caps7a } from "../../test/safeWayIn";

const rel = (id: number, name: string, version: string, withdrawn = false) => ({ id, name, version, withdrawn_at: withdrawn ? "2026-10-02T00:00:00Z" : null }) as unknown as Release;

describe("hand over and withdraw", () => {
  it("offers a handover on each name's newest version that is not withdrawn", () => {
    expect([...handoverRows([rel(1, "a", "1"), rel(2, "a", "2"), rel(3, "b", "1", true), rel(4, "c", "1"), rel(5, "c", "2", true)])].sort()).toEqual([2, 4]);
  });
  it("writes into an exchange place, in a folder named for the release and its version", () => {
    const places = [{ id: 1, role: "export", retired_at: null }, { id: 2, role: "exchange", retired_at: null, path: "/x/out/" }, { id: 3, role: "exchange", retired_at: "2026-01-01" }] as unknown as Place[];
    expect(exchangePlaces(places).map((p) => p.id)).toEqual([2]);
    expect(handoverOut({ path: "/x/out/" }, { name: "ms", version: "3" })).toBe("/x/out/ms-v3");
  });
  it("takes a key by its name, and prints the command that gives its password", () => {
    expect(keyRefusal("")).not.toBeNull();
    expect(keyRefusal("bad key")).not.toBeNull();
    expect(keyRefusal("partner-2026")).toBeNull();
    expect(passwordCommand(" partner-2026 ")).toBe("nils handover password --key partner-2026");
  });
  it("queues a withdrawal as the release verb with its reason, and wants one", () => {
    expect(withdrawCommand({ name: "ms", version: "2" }, " consent withdrawn ")).toEqual(["release", "--name", "ms", "--withdraw", "2", "--why", "consent withdrawn"]);
    expect(withdrawRefusal(" ")).not.toBeNull();
    expect(withdrawRefusal("consent withdrawn")).toBeNull();
  });
});

const piece = (from: number, to: number, text: string, more: Partial<LogPiece> = {}): LogPiece => ({ size: to, from, to, text, earlier: from > 0, over: false, ...more });

describe("a log's pieces", () => {
  it("joins a piece that follows on, and starts again from one that does not", () => {
    expect(joined(null, piece(10, 20, "b"))).toEqual(piece(10, 20, "b"));
    expect(joined(piece(10, 20, "b"), piece(20, 30, "c", { over: true }))).toEqual({ ...piece(20, 30, "c", { over: true }), from: 10, earlier: true, text: "bc" });
    expect(joined(piece(10, 20, "b"), piece(25, 30, "x")).text).toBe("x");
  });
  it("reads back 64 KB at a time, and puts it before what is shown where it ends there", () => {
    expect(earlierFrom({ from: 70000 })).toBe(70000 - 65536);
    expect(earlierFrom({ from: 100 })).toBe(0);
    const shown = piece(100, 200, "late", { over: true });
    expect(prepended(piece(0, 100, "early"), shown)).toEqual({ ...shown, from: 0, earlier: false, text: "earlylate" });
    expect(prepended(piece(0, 90, "early"), shown)).toBe(shown);
  });
  it("finds a job's run, and says a refusal in the engine's words where it names a sealed sample", () => {
    expect(runOf({ result: { run: 9 } })).toBe(9);
    expect(runOf({ args: { run: 7 }, result: null })).toBe(7);
    expect(runOf({ args: {}, result: null })).toBeNull();
    expect(refusedWords(new LogRefused(404, "job 3 ran before logs were kept"))).toBe("Job 3 ran before logs were kept.");
    expect(refusedWords(new LogRefused(403, "pipelines:see at detail quasi"))).toBe("You may not read this log: it needs the work of the page the job belongs to.");
    expect(refusedWords(new LogRefused(403, "unit u1 holds a stack of a sealed sample"))).toBe("Unit u1 holds a stack of a sealed sample.");
  });
});

describe("restore, printed", () => {
  it("stops the engine as the install runs it, puts the archive back, and starts it again", () => {
    const install = { services: [{ part: "engine", unit: "nils-engine.service", watcher: "systemd", running: true }, { part: "desk", unit: "nils-desk.service", watcher: "systemd", running: true }] };
    expect(restoreSteps(install, "/srv/nils/registry", "/srv/backups/", "nils-2026-10-12T020000Z").map((s) => s.command)).toEqual([
      "systemctl --user stop nils-engine.service",
      "nils restore /srv/backups/nils-2026-10-12T020000Z --yes --registry /srv/nils/registry",
      "systemctl --user start nils-engine.service",
    ]);
    expect(restoreSteps({ services: [{ part: "engine", unit: "nils-engine", watcher: "docker", running: true }] }, null, null, "a").map((s) => s.command)).toEqual(["docker stop nils-engine", "nils restore a --yes", "docker start nils-engine"]);
    expect(restoreSteps(null, null, null, "a").map((s) => s.command)).toEqual([null, "nils restore a --yes", null]);
  });
});

describe("the Assistant's ladder", () => {
  const caps = (doors: string[] | null, grants?: string[]) => ({ ...caps7a([], grants), assistant: doors === null ? null : { doors } }) as Capabilities;
  it("offers each page where the assistant serves its route and the person uses it", () => {
    expect(ladderPages(caps(["GET /inbox", "GET /grants"]))).toEqual({ plans: true, grants: true });
    expect(ladderPages(caps(["GET /inbox"]))).toEqual({ plans: true, grants: false });
    expect(ladderPages(caps(null))).toEqual({ plans: false, grants: false });
    expect(ladderPages(caps(["GET /inbox", "GET /grants"], ["query:see"]))).toEqual({ plans: false, grants: false });
    expect(assistantPages([], { plans: true, grants: true }).map((p) => p.title)).toEqual(["New conversation", "All conversations", "Shared", "Memory", "Plans waiting", "Standing grants"]);
    expect(assistantPages([]).map((p) => p.id)).toEqual(["new", "all", "shared", "memory"]);
  });
  it("counts what waits, and shows standing grants and what may be given in words, by page, never a door", () => {
    const inbox = { subject: "a", jobs: { queued: [], running: [], finished: [], failed: [] }, waiting: [{}], plans: [{ state: "proposed" }, { state: "confirmed" }], proposals: [{}, {}], grants: [] } as never;
    expect(waitingPlans(inbox)).toHaveLength(1);
    expect(waitingCount(inbox)).toBe(4);
    const g = {
      subject: "a",
      grants: [
        { id: 1, subject: "a", door: "POST /api/jobs", page: "data", words: "Read, sort, pseudonymise and bring in data", created_at: "2026-10-01", revoked_at: null },
        { id: 2, subject: "a", door: "POST /api/ask/run", page: "query", words: "Run questions", created_at: "2026-10-02", revoked_at: "2026-10-03" },
        { id: 3, subject: "b", door: "POST /api/select", created_at: "2026-10-04", revoked_at: null },
        { id: 5, subject: "a", door: "page:campaigns", page: "campaigns", words: "Everything on Campaigns", created_at: "2026-10-05", revoked_at: null },
        // an older assistant's grant, kept by its door alone
        { id: 6, subject: "a", door: "PUT /api/places/{id}", created_at: "2026-09-30", revoked_at: null },
      ],
      ladder: [],
      offer: [
        { page: "campaigns", title: "Campaigns", actions: [{ door: "POST /api/campaigns/{id}/raters", words: "Change a campaign's raters" }] },
        { page: "data", title: "Data", actions: [{ door: "POST /api/jobs", words: "Read, sort, pseudonymise and bring in data" }, { door: "POST /api/linkage/imports", words: "Bring in identifier maps" }] },
      ],
    };
    const { everything, pages } = grantPages(g);
    expect(everything).toBeNull();
    // in the desk's order: Data before Campaigns, and an older grant under Other
    expect(pages.map((p) => p.title)).toEqual(["Data", "Campaigns", "Other"]);
    const data = pages[0];
    expect(data.rows.map((r) => [r.words, r.grant?.id ?? null])).toEqual([
      ["Read, sort, pseudonymise and bring in data", 1],
      ["Bring in identifier maps", null],
    ]);
    // a page given whole stands for each of its actions
    expect(pages[1].whole?.id).toBe(5);
    expect(pages[1].rows[0].covered).toBe(true);
    expect(pages[2].rows[0].words).toBe("An earlier grant");
    expect(JSON.stringify(pages.map((p) => [p.title, p.rows.map((r) => r.words)]))).not.toMatch(/\/api\//u);
    expect(grantWords({ door: "*" })).toBe("Everything the assistant may do for you");
    expect(grantWords({ door: "page:data" })).toBe("Everything on Data");
    expect(plainReason("no standing grant for POST /api/jobs; give one")).toBe("no standing grant for this step; give one");
    expect(standing(g.grants).now.map((x) => x.id)).toEqual([5, 3, 1, 6]);
    expect(standing(g.grants).revoked.map((x) => x.id)).toEqual([2]);
  });

  it("against an assistant that sends no offer, offers its ladder's rung-two doors in words, never a door", () => {
    const older = {
      subject: "a",
      grants: [{ id: 1, subject: "a", door: "POST /api/jobs", created_at: "2026-10-01", revoked_at: null }],
      ladder: [
        { door: "POST /api/jobs", rung: 2 as const, role: "operator" },
        { door: "POST /api/ask/run", rung: 2 as const, role: "reader" },
        { door: "POST /api/select", rung: 2 as const, role: "reader" },
        { door: "POST /api/linkage/merge", rung: 3 as const, role: "admin" },
      ],
    };
    // offered only what the person's own grants open: an operator's step to an operator, a reader's to a reader
    const operator = ["data:work", "data:see", "pipelines:work", "query:work", "query:see", "review:work", "review:see", "models:see", "pipelines:see", "release:work", "release:see", "places:work", "places:see", "install:see", "kvasir:see", "models:work", "assistant-settings:see"];
    expect(offerOfLadder(older, operator).map((o) => [o.title, o.actions.map((a) => a.words)])).toEqual([
      ["Data", ["Read, sort, pseudonymise and bring in data"]],
      ["Query", ["Run questions"]],
      ["Other", ["Another step 1"]],
    ]);
    expect(offerOfLadder(older, ["data:see", "query:see", "query:work"]).map((o) => o.title)).toEqual(["Query", "Other"]);
    expect(offerOfLadder({ ...older, ladder: [{ door: "POST /api/jobs", rung: 2 as const, grant: "data:work" }] }, ["query:see"])).toEqual([]);
    const { pages, scopes } = grantPages(older, operator);
    // an older assistant takes no page or everything at once
    expect(scopes).toBe(false);
    expect(grantPages({ ...older, offer: [] }, operator).scopes).toBe(true);
    // the standing one stands by its door, and the others can be given
    expect(pages.find((p) => p.page === "data")?.rows[0].grant?.id).toBe(1);
    expect(pages.find((p) => p.page === "query")?.rows[0]).toMatchObject({ door: "POST /api/ask/run", grant: null });
    expect(JSON.stringify(pages)).not.toMatch(/"words":"[^"]*\/api/u);
  });
});

describe("people", () => {
  it("wants a password of eight characters at least, typed the same twice", () => {
    expect(passwordRefusal("short", "short")).toBe("At least 8 characters.");
    expect(passwordRefusal("long-enough", "long-enouhg")).toBe("The two do not match.");
    expect(passwordRefusal("long-enough", "long-enough")).toBeNull();
  });
  it("says what a removal handed over, and nothing of it where nothing went", () => {
    expect(removedWords("Erik", { removed: "erik", sessions_ended: 0, handed: { results: 1, lineage: 4 }, to: "maja" }, "Maja")).toBe("Removed: Erik; 1 kept result handed to Maja");
    expect(removedWords("Erik", { removed: "erik", sessions_ended: 0, handed: { results: 0, lineage: 0 }, to: "maja" }, "Maja")).toBe("Removed: Erik");
    expect(removedWords("Erik", { removed: "erik", sessions_ended: 0, handed: { results: 0, lineage: 0 }, to: null }, null)).toBe("Removed: Erik");
  });
});

describe("Settings' map (spec 18)", () => {
  it("lands on Overview, and sets Engine, Desk, Language models and the Assistant under Parts", () => {
    const caps = { ...caps7a(["GET /api/places", "GET /api/backups", "GET /api/audit"]), kvasir: {}, assistant: {} } as Capabilities;
    const pages = settingsPages(caps);
    expect(pages[0].id).toBe("overview");
    expect(pages.filter((p) => p.sub).map((p) => p.title)).toEqual(["Engine", "Desk", "Language models", "Assistant"]);
    const parts = pages.findIndex((p) => p.id === "parts");
    expect(pages.slice(parts + 1, parts + 5).every((p) => p.sub)).toBe(true);
    expect(pages.at(-1)?.id).toBe("setup");
  });
});
