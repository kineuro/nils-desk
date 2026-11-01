// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Participation's module against a fake engine and a fake
// assistant: the doors it calls and the bodies it sends (the draw always
// without localizers, the people path's double read, the settle's 20 %), the
// preview read wrapped or bare, the document as tables of its sections, the
// status card's words off and on, what a change sends and refuses, the
// sealed read's steps enabling in order on both paths, the rater's principal
// in both cases, and the seed from the site and the date.

import { afterEach, describe, expect, it, vi } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { changeOf, changeRefusal, defaultSeed, done, DOORS, DRAW_COUNT, mayChange, mayDrive, nextStep, participates, participation, pathOf, PATHS, pct, previewOf, printWords, raterOf, readDoneOf, runWords, sealedDraw, sections, sendWords, settleRefusal, SHARE, statusWords, stepsFor, TIER_WORDS, type Draw, type SealedState, type Send, type Status } from "./participation";

const OFF: Status = { site: null, tiers: [], receiver: null, key_file: null, key_fingerprint: null, auto: false, last_send: {}, receiver_reachable: null, rater_door_reachable: null };
const ON: Status = { ...OFF, site: "ki", tiers: [1, 3], receiver: "https://participation.example.org", key_file: "/etc/nils/participation.key", key_fingerprint: "0123456789abcdef0123", auto: true, receiver_reachable: true, rater_door_reachable: true };
const SENT: Send = { id: 1, tier: 1, digest: "ab".repeat(32), bytes: 2048, sent_at: "2026-11-01T10:00:00Z", by: "astrid", receiver: ON.receiver!, receipt: "cd".repeat(32), error: null, previewed_at: "2026-11-01T09:59:00Z" };
const DRAW: Draw = { id: 7, round_id: 2, seed: "ki-2026-11-01", share: null, count: 1000, frame: { stacks: 12_480, digest: "ef".repeat(32) }, drawn: 1000, campaign_id: 31, campaigns: { raters: 31, settle: null, rule_review: null }, settle: null, grade: null };

const COUNTS = { kind: "nils participation counts", site: "ki", registry_id: "0123abcd", made_at: "2026-11-01T10:00:00Z", trains: false, versions: { engine: "1.0.0-beta.5", pack: { name: "mri", version: "1.0.3" } }, archive: { stacks_by_modality: { MR: 12_480 }, subjects: 1205 }, signature: "sig", signed_by: "0123456789abcdef" };

/** A fake engine and assistant: what was asked, and an answer per `METHOD path`. */
function fake(answers: Record<string, unknown>) {
  const asked: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://desk.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      asked.push({ method, path: url.pathname + url.search, body });
      const a = answers[`${method} ${url.pathname}`];
      return new Response(JSON.stringify(a ?? { error: `no ${method} ${url.pathname}` }), { status: a === undefined ? 404 : 200, headers: { "content-type": "application/json" } });
    }),
  );
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

describe("the participation doors", () => {
  it("reads the status, the sends and the preview, wrapped or bare", async () => {
    const asked = fake({ "GET /api/participation": ON, "GET /api/participation/sends": { sends: [SENT] }, "GET /api/participation/preview": { document: COUNTS, digest: "ab".repeat(32), previewed_at: "now" } });
    expect(await participation.status()).toEqual(ON);
    expect(await participation.sends()).toEqual([SENT]);
    const p = await participation.preview(1);
    expect(p.document.kind).toBe("nils participation counts");
    expect(p.digest).toBe("ab".repeat(32));
    expect(asked.map((a) => a.path)).toEqual(["/api/participation", "/api/participation/sends", "/api/participation/preview?tier=1"]);
    await participation.preview(3, 7);
    expect(asked[3].path).toBe("/api/participation/preview?tier=3&draw=7");
    expect(previewOf(COUNTS)).toEqual({ document: COUNTS, digest: null, previewed_at: null });
  });

  it("sends the change, the send and the sealed read's draw and settle with the protocol's bodies", async () => {
    const asked = fake({
      "POST /api/participation": ON,
      "POST /api/participation/send": SENT,
      "POST /api/audit/draws": { draw: DRAW, campaign: { id: 31, name: "sealed read" } },
      "POST /api/audit/draws/7/settle": { draw: 7, settle: { campaign: { id: 32, name: "settle" }, items: 40, differences: 30, agreements: 970, agreements_settled: 194, seed: "ki-2026-11-01", share: 0.2, planted: 4, proposals: 40 } },
      "POST /api/campaigns/32/close": { campaign: 32 },
      "GET /api/campaigns/31": { id: 31, status: "open", counts: { items: { open: 0, settled: 1000 } } },
    });
    await participation.change({ enable: [1], site: "ki" });
    await participation.send(1);
    await participation.send(3, 7);
    await participation.draw({ count: DRAW_COUNT, seed: "ki-2026-11-01", raters: ["nils-assistant"] });
    await participation.draw({ count: DRAW_COUNT, seed: "ki-2026-11-01", double_read_share: SHARE });
    await participation.settle(7, { share: SHARE });
    await participation.close(32);
    await participation.campaign(31);
    expect(asked.map((a) => [a.method, a.path, a.body])).toEqual([
      ["POST", "/api/participation", { enable: [1], site: "ki" }],
      ["POST", "/api/participation/send", { tier: 1 }],
      ["POST", "/api/participation/send", { tier: 3, draw: 7 }],
      ["POST", "/api/audit/draws", { count: 1000, seed: "ki-2026-11-01", raters: ["nils-assistant"], localizers: false }],
      ["POST", "/api/audit/draws", { count: 1000, seed: "ki-2026-11-01", double_read_share: 0.2, localizers: false }],
      ["POST", "/api/audit/draws/7/settle", { share: 0.2 }],
      ["POST", "/api/campaigns/32/close", {}],
      ["GET", "/api/campaigns/31", null],
    ]);
    expect(SHARE).toBe(0.2);
    expect(pct(SHARE)).toBe("20 %");
  });

  it("reaches the assistant's rater doors through the desk's proxy and says its refusal", async () => {
    const asked = fake({ "POST /assistant/raters/runs": { id: "r1", claimed: 0, answered: 0, refused: 0, cant_tell: 0, errors: 0, done: false }, "GET /assistant/raters/runs/r1": { id: "r1", claimed: 10, answered: 9, refused: 1, cant_tell: 0, errors: 0, done: false } });
    const r = await participation.startRater(31);
    expect(r.id).toBe("r1");
    expect(asked[0]).toEqual({ method: "POST", path: "/assistant/raters/runs", body: { campaign: 31, thinking: true } });
    expect(runWords(await participation.rater("r1"))).toBe("9 answered, 1 refused");
    await expect(participation.rater("r2")).rejects.toThrow("no GET /assistant/raters/runs/r2");
  });
});

describe("what the page says", () => {
  it("is off by default, with nothing leaving, and names the site and the tiers once on", () => {
    expect(statusWords(null)).toBe("Nothing leaves this install.");
    expect(statusWords(OFF)).toBe("Nothing leaves this install.");
    expect(statusWords(ON)).toBe("ki shares counts and a sealed read.");
    expect(statusWords({ ...ON, tiers: [3] })).toBe("ki shares a sealed read.");
    expect(printWords(ON.key_fingerprint)).toBe("0123456789abcdef");
    expect(printWords(null)).toBe("no key yet");
    expect(sendWords(null)).toBe("never sent");
    expect(sendWords(SENT)).toBe(`receipt ${"cd".repeat(8)}`);
    expect(sendWords({ ...SENT, receipt: null, error: "the receiver answered 401" })).toBe("failed: the receiver answered 401");
    expect(TIER_WORDS[1].line).toContain("cells under 5 held back");
    expect(TIER_WORDS[3].line).toContain("1,000 stacks");
  });

  it("offers the page by the status door to a person who sees the install, and the change to one who works on it", () => {
    expect(participates(capsWith([DOORS.status], ["install:see"]))).toBe(true);
    expect(participates(capsWith([], ["install:see"]))).toBe(false);
    expect(participates(capsWith([DOORS.status], ["data:see"]))).toBe(false);
    expect(mayChange(capsWith([DOORS.status], ["install:see"]))).toBe(false);
    expect(mayChange(capsWith([DOORS.status], ["install:work"]))).toBe(true);
    expect(mayDrive(capsWith([DOORS.draw], ["review:work", "campaigns:work"]))).toBe(true);
    expect(mayDrive(capsWith([], ["review:work", "campaigns:work"]))).toBe(false);
  });

  it("refuses a change without a receiver or a key file, and sends only what changed", () => {
    const draft = { site: "ki", receiver: ON.receiver!, keyFile: ON.key_file!, tiers: [1] as (1 | 3)[], auto: false };
    expect(changeRefusal({ ...draft, tiers: [] })).toBeNull();
    expect(changeRefusal({ ...draft, receiver: "" })).toBe("a receiver has an address");
    expect(changeRefusal({ ...draft, receiver: "participation.example.org" })).toBe("an address starts with http:// or https://");
    expect(changeRefusal({ ...draft, keyFile: "" })).toBe("the key file is a path on the engine's machine");
    expect(changeRefusal({ ...draft, keyFile: "participation.key" })).toBe("the key file's path starts with /");
    expect(changeRefusal(draft)).toBeNull();
    expect(changeOf(OFF, draft)).toEqual({ enable: [1], site: "ki", receiver: ON.receiver, key_file: ON.key_file });
    expect(changeOf(ON, { ...draft, tiers: [1, 3], auto: true })).toBeNull();
    expect(changeOf(ON, { ...draft, tiers: [3], auto: true })).toEqual({ disable: [1] });
    expect(changeOf(ON, { ...draft, tiers: [1, 3], auto: false, site: "ki2" })).toEqual({ site: "ki2", auto: false });
  });

  it("lays the document out as tables of its sections, the signature apart, with counts under their path", () => {
    const s = sections(COUNTS);
    expect(s.map((x) => x.name)).toEqual(["about", "versions", "archive"]);
    expect(s[0].rows).toEqual([
      ["site", "ki"],
      ["registry id", "0123abcd"],
      ["made at", "2026-11-01T10:00:00Z"],
      ["trains", "false"],
    ]);
    expect(s[1].rows).toEqual([
      ["engine", "1.0.0-beta.5"],
      ["pack · name", "mri"],
      ["pack · version", "1.0.3"],
    ]);
    expect(s[2].rows).toEqual([
      ["stacks_by_modality · MR", "12,480"],
      ["subjects", "1,205"],
    ]);
    expect(sections({ kind: "x", held: null, empty: {}, list: [1, 2] })[0].rows).toEqual([
      ["held", "none"],
      ["list", "1, 2"],
    ]);
  });

  it("seeds the draw from the site's name and the date", () => {
    expect(defaultSeed("ki", new Date("2026-11-01T12:00:00Z"))).toBe("ki-2026-11-01");
    expect(defaultSeed("Karolinska MS", new Date("2026-11-01T12:00:00Z"))).toBe("Karolinska-MS-2026-11-01");
    expect(defaultSeed(null, new Date("2026-11-01T12:00:00Z"))).toBe("site-2026-11-01");
  });
});

describe("the sealed read's steps", () => {
  const base: SealedState = { draw: null, path: "model-first", ratersCampaign: null, readDone: false, settleCampaign: null, closed: false, previewed: false, sent: null };

  it("enable one after the other on the model-first path: draw, read, settle, close, preview, send", () => {
    expect(stepsFor("model-first").map((s) => s.id)).toEqual(["draw", "read", "settle", "close", "preview", "send"]);
    expect(nextStep(base)).toBe("draw");
    const drawn = { ...base, draw: DRAW, ratersCampaign: 31 };
    expect(nextStep(drawn)).toBe("read");
    // a settle recorded before the read is done does not count
    expect(nextStep({ ...drawn, settleCampaign: 32 })).toBe("read");
    const read = { ...drawn, readDone: true };
    expect(nextStep(read)).toBe("settle");
    const settled = { ...read, settleCampaign: 32 };
    expect(nextStep(settled)).toBe("close");
    const closed = { ...settled, closed: true };
    expect(nextStep(closed)).toBe("preview");
    const previewed = { ...closed, previewed: true };
    expect(nextStep(previewed)).toBe("send");
    expect(nextStep({ ...previewed, sent: { ...SENT, tier: 3, draw: 7 } })).toBeNull();
    expect(done(previewed)).toEqual({ draw: true, read: true, settle: true, close: true, preview: true, send: false });
  });

  it("have no settle on the people path, whose seeded share is the double read", () => {
    expect(stepsFor("people").map((s) => s.id)).toEqual(["draw", "read", "close", "preview", "send"]);
    const read = { ...base, path: "people" as const, draw: DRAW, ratersCampaign: 31, readDone: true };
    expect(nextStep(read)).toBe("close");
    expect(nextStep({ ...read, closed: true })).toBe("preview");
    expect(PATHS.people.line).toBe("Your people read every stack; a seeded 20 % of the stacks is read by two.");
    expect(PATHS["model-first"].line).toBe("The model server reads every stack; your people settle every difference and a seeded 20 % of the agreements.");
  });

  it("count a read done when the rater run says so or no item is open or claimed", () => {
    expect(readDoneOf(null, null)).toBe(false);
    expect(readDoneOf(null, { id: "r1", claimed: 0, answered: 1000, refused: 0, cant_tell: 0, errors: 0, done: true })).toBe(true);
    expect(readDoneOf({ id: 31, status: "open", counts: { items: { open: 3, settled: 997 } } }, null)).toBe(false);
    expect(readDoneOf({ id: 31, status: "open", counts: { items: { open: 0, claimed: 1, settled: 999 } } }, null)).toBe(false);
    expect(readDoneOf({ id: 31, status: "open", counts: { items: { open: 0, settled: 1000 } } }, null)).toBe(true);
    expect(readDoneOf({ id: 31, status: "open", counts: { items: {} } }, null)).toBe(false);
  });

  it("continue the newest draw by count and know its path from what the browser kept or the settle", () => {
    expect(sealedDraw([])).toBeNull();
    expect(sealedDraw([{ ...DRAW, id: 3, count: null, share: 0.01 }, DRAW, { ...DRAW, id: 9 }])?.id).toBe(9);
    expect(pathOf(DRAW, { path: "people" }, "model-first")).toBe("people");
    expect(pathOf({ ...DRAW, settle: { seed: "s", share: 0.2 } }, null, "people")).toBe("model-first");
    expect(pathOf(DRAW, null, "people")).toBe("people");
  });

  it("name the rater: the assistant's own identity where the engine names one, else the person, who then may not settle", () => {
    const caps = capsWith([], ["review:work"]);
    expect(raterOf({ ...ON, rater_principal: "nils-assistant" }, caps)).toEqual({ principal: "nils-assistant", own: true });
    expect(raterOf(ON, caps)).toEqual({ principal: "astrid", own: false });
    const s = { ...base, draw: DRAW, readDone: true };
    expect(settleRefusal(s, "astrid", "astrid")).toBe("You read as the rater, so another person settles.");
    expect(settleRefusal(s, "astrid", "bo")).toBeNull();
    expect(settleRefusal(s, "nils-assistant", "astrid")).toBeNull();
    expect(settleRefusal({ ...s, path: "people" }, "astrid", "astrid")).toBeNull();
  });
});
