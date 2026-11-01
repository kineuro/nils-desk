// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Participation as a person uses it, against a fake engine and a
// fake assistant: off by default with nothing leaving; on, the site's facts;
// Preview draws the file's sections as tables with the raw JSON under a
// fold and says this is the file; Send shows the digest and the receiver
// before anything is posted, then the receipt; the sealed read's steps
// enable in order, Draw first, the rater's run through the assistant, then
// Settle (never for the person who read as the rater), Close, Preview and
// Send of tier 3 for the draw.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { capsWith } from "../review/caps.fixture";
import { ParticipationPage, ParticipationView } from "./ParticipationPage";
import { DOORS, type Draw, type Send, type Status } from "./participation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN: Grant[] = ["database:see", "database:work", "review:work", "campaigns:work"];
const OFF: Status = { enabled: false, tiers: [], note: "Nothing leaves this install.", assistant_rater_door: null };
const ON: Status = { enabled: true, site: "ki", tiers: [1, 3], receiver: "https://participation.example.org", key_file: "/etc/nils/participation.key", key_fingerprint: "0123456789abcdef0123", public_key: "cHVi", auto: false, enabled_at: "2026-11-01T09:00:00Z", enabled_by: "astrid", previewed: {}, last_send: {}, receiver_reachable: true, assistant_rater_door: true };
const DIGEST = "ab".repeat(32);
const RECEIPT = "cd".repeat(32);
const COUNTS = { kind: "nils participation counts", site: "ki", registry_id: "0123abcd", made_at: "2026-11-01T10:00:00Z", versions: { engine: "1.0.0-beta.5" }, archive: { stacks_by_modality: { MR: 12_480 } }, trains: false };
const SENT: Send = { id: 1, tier: 1, digest: DIGEST, bytes: 2048, sent_at: "2026-10-30T10:00:00Z", sent_by: "astrid", receiver: ON.receiver!, receipt: RECEIPT, error: null, previewed_at: "2026-11-01T09:59:00Z", draw: null, ok: true };
const DRAW: Draw = { id: 7, round_id: 2, seed: "ki-2026-11-01", share: null, count: 1000, frame: { stacks: 12_480, digest: "ef".repeat(32) }, drawn: 1000, campaign_id: 31, campaigns: { raters: 31, settle: null, rule_review: null }, settle: null, grade: null };
const PEOPLE: Draw = { ...DRAW, id: 8, campaign_id: 41, campaigns: { raters: null, settle: 41, rule_review: null }, settle: { seed: "ki-2026-11-01", share: 1 } };
// the engine's name for the person, as the raters' campaign and the assistant's run name them
const ME = "someone";
const RUN = { run: "r1", conversation: "rater-c1", principal: ME, state: "running", done: false, claimed: 0, answered: 0, refused: 0, cant_tell: 0, errors: 0, token: "held" };

let asked: { method: string; path: string; body: unknown }[] = [];
let answers: Record<string, (body: unknown) => unknown> = {};
let root: Root;
let el: HTMLDivElement;

beforeEach(() => {
  asked = [];
  answers = {};
  localStorage.clear();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://desk.test");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    asked.push({ method, path: url.pathname + url.search, body });
    const a = answers[`${method} ${url.pathname}`];
    if (!a) return new Response(JSON.stringify({ error: `no ${method} ${url.pathname}` }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(a(body)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

const caps = (grants: Grant[] = ADMIN): Capabilities => capsWith([DOORS.status, DOORS.change, DOORS.preview, DOORS.send, DOORS.sends, DOORS.draw, DOORS.settle], grants);
const text = () => el.textContent ?? "";
const button = (words: string): HTMLButtonElement | null => [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === words) ?? null;
const press = async (words: string) => {
  const b = button(words);
  expect(b, `a button ${words}`).not.toBeNull();
  expect(b!.disabled, `${words} enabled`).toBe(false);
  await act(async () => b!.click());
  await settle();
};
const view = async (status: Status, sends: Send[] = [], draws: Draw[] = [], grants: Grant[] = ADMIN) => {
  await act(async () => root.render(<ParticipationView caps={caps(grants)} status={status} sends={sends} draws={draws} onChanged={() => undefined} now={new Date("2026-11-01T12:00:00Z")} />));
  await settle();
};
const page = async (grants: Grant[] = ADMIN) => {
  await act(async () => root.render(<ParticipationPage caps={caps(grants)} />));
  await settle();
};

describe("the status card", () => {
  it("is off by default: nothing leaves this install, and Take part waits for a receiver and a key file", async () => {
    answers["GET /api/participation"] = () => OFF;
    answers["GET /api/participation/sends"] = () => ({ sends: [] });
    await page();
    expect(text()).toContain("Nothing leaves this install.");
    expect(text()).toContain("off");
    expect(el.querySelector("dl.facts")).toBeNull();
    expect(button("Take part")?.disabled).toBe(true);
    // the tiers are off, with one line each
    const boxes = [...el.querySelectorAll<HTMLInputElement>('.check-row input[type="checkbox"]')];
    expect(boxes.map((b) => b.checked)).toEqual([false, false]);
    expect(text()).toContain("cells under 5 held back");
    expect(text()).not.toContain("Send counts by itself");
    expect(asked.map((a) => a.path)).toEqual(["/api/participation", "/api/participation/sends"]);
  });

  it("once on, names the site, the tiers, the receiver, the key's fingerprint and the last send per tier", async () => {
    await view({ ...ON, last_send: { "1": SENT } });
    expect(text()).toContain("ki shares counts and a sealed read.");
    expect(text()).toContain("taking part");
    const facts = el.querySelector("dl.facts")!.textContent!;
    expect(facts).toContain("https://participation.example.org");
    expect(facts).toContain("answers");
    expect(facts).toContain("0123456789abcdef");
    expect(facts).not.toContain("0123456789abcdef0123");
    expect(facts).toContain(`last counts30 Oct: receipt ${"cd".repeat(8)}`);
    expect(facts).toContain("last a sealed readnever sent");
    expect(facts).toContain("the assistant answers");
    // the fields hold what is on; auto sits under counts; the model server note links to the stations' page
    expect(el.querySelector<HTMLInputElement>('input[placeholder="/etc/nils/participation.key"]')!.value).toBe("/etc/nils/participation.key");
    expect(text()).toContain("Send counts by itself");
    expect(el.querySelector('a[href="#settings/language-models"]')?.textContent).toBe("Settings > Stations");
    expect(button("Save")?.disabled).toBe(true);
  });

  it("sends the change that turns counts on, with the site, the receiver and the key file", async () => {
    answers["POST /api/participation"] = () => ({ ...ON, tiers: [1] });
    await view(OFF);
    const set = async (placeholder: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await set("the registry's first 8 characters", "ki");
    await set("https://participation.example.org", "https://participation.example.org");
    await set("/etc/nils/participation.key", "/etc/nils/participation.key");
    const counts = el.querySelector<HTMLInputElement>('.check-row input[type="checkbox"]')!;
    await act(async () => counts.click());
    await press("Take part");
    expect(asked.find((a) => a.method === "POST")).toEqual({ method: "POST", path: "/api/participation", body: { tiers: [1], site: "ki", receiver: "https://participation.example.org", key_file: "/etc/nils/participation.key" } });
    expect(text()).toContain("The site shares counts.");
  });

  it("offers a person who may only see the install no change", async () => {
    await view(ON, [], [], ["database:see"]);
    expect(button("Save")).toBeNull();
    expect(text()).toContain("An administrator decides what the site shares.");
    expect(el.querySelector<HTMLInputElement>('input[placeholder="/etc/nils/participation.key"]')!.disabled).toBe(true);
  });
});

describe("preview and send of the counts", () => {
  it("draws the file as tables of its sections with the raw JSON under a fold, and says this is the file", async () => {
    answers["GET /api/participation/preview"] = () => ({ document: COUNTS, digest: DIGEST, previewed_at: "now" });
    await view({ ...ON, tiers: [1] });
    expect(button("Send")?.disabled).toBe(true);
    await press("Preview");
    expect(asked.at(-1)?.path).toBe("/api/participation/preview?tier=1");
    expect(text()).toContain("This is the file. Nothing else leaves.");
    const headings = [...el.querySelectorAll(".preview h3")].map((h) => h.textContent);
    expect(headings).toEqual(["about", "versions", "archive"]);
    const rows = [...el.querySelectorAll(".preview table tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(rows).toContainEqual(["stacks_by_modality · MR", "12,480"]);
    expect(rows).toContainEqual(["engine", "1.0.0-beta.5"]);
    const fold = el.querySelector("details");
    expect(fold?.querySelector("summary")?.textContent).toBe("The raw JSON");
    expect(fold?.querySelector("pre")?.textContent).toContain('"kind": "nils participation counts"');
    expect(button("Send")?.disabled).toBe(false);
  });

  it("shows the digest and the receiver first, posts on Send it, and then the receipt", async () => {
    answers["GET /api/participation/preview"] = () => ({ document: COUNTS, digest: DIGEST, previewed_at: "now" });
    answers["POST /api/participation/send"] = () => SENT;
    await view({ ...ON, tiers: [1] });
    await press("Preview");
    await press("Send");
    expect(asked.some((a) => a.method === "POST")).toBe(false);
    const what = el.querySelector('[aria-label="what the send posts"]')!.textContent!;
    expect(what).toContain(`File ${"ab".repeat(8)}…`);
    expect(what).toContain("goes to https://participation.example.org");
    await press("Send it");
    expect(asked.at(-1)).toEqual({ method: "POST", path: "/api/participation/send", body: { tier: 1 } });
    expect(text()).toContain(`Sent. The receiver's receipt is ${RECEIPT}.`);
    expect(el.querySelector('[aria-label="what the send posts"]')).toBeNull();
  });

  it("says the error's words where the receiver refused, and lists the sends", async () => {
    answers["GET /api/participation/preview"] = () => ({ document: COUNTS, digest: DIGEST, previewed_at: "now" });
    answers["POST /api/participation/send"] = () => ({ ...SENT, id: 2, receipt: null, error: "the receiver answered 401" });
    await view({ ...ON, tiers: [1] }, [SENT]);
    const list = el.querySelector('[aria-label="counts: preview and send"] table')!.textContent!;
    expect(list).toContain("astrid");
    expect(list).toContain("2,048");
    expect(list).toContain(`receipt ${"cd".repeat(8)}`);
    await press("Preview");
    await press("Send");
    await press("Send it");
    expect(el.querySelector(".warn")?.textContent).toBe("the receiver answered 401");
  });
});

describe("the sealed read", () => {
  it("enables Draw alone, with 1,000, the seed from the site and the date, the path and the share of 20 %", async () => {
    await view({ ...ON, tiers: [3] });
    const card = el.querySelector('[aria-label="the sealed read"]')!;
    expect(card.textContent).toContain("share 20 %");
    expect(card.textContent).toContain("Model first");
    expect(card.textContent).toContain("your people settle every difference and a seeded 20 % of the agreements");
    expect(card.querySelector<HTMLInputElement>("input[inputmode=numeric]")!.value).toBe("1000");
    expect(card.querySelector<HTMLInputElement>("input.mono, .input.mono input")!.value).toBe("ki-2026-11-01");
    expect([...card.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Draw"]);
    expect(card.querySelector(".stepno.now")?.parentElement?.textContent).toContain("Draw");
    expect([...card.querySelectorAll(".step-body > b")].map((b) => b.textContent)).toEqual(["Draw", "Read", "Settle", "Close", "Preview", "Send"]);
  });

  it("draws by count with no localizers and the rater named, then offers the rater's run and nothing after it", async () => {
    answers["POST /api/audit/draws"] = () => ({ draw: DRAW, campaign: { id: 31, name: "sealed read ki-2026-11-01" } });
    answers["GET /api/campaigns/31"] = () => ({ id: 31, status: "open", counts: { items: { open: 1000 } } });
    answers["POST /assistant/raters/runs"] = () => RUN;
    answers["GET /assistant/raters/runs/r1"] = () => ({ ...RUN, claimed: 12, answered: 11 });
    answers["POST /desk/assistant/conversations/rater-c1/token"] = () => ({});
    await view({ ...ON, tiers: [3] });
    await press("Draw");
    expect(asked.find((a) => a.method === "POST")).toEqual({ method: "POST", path: "/api/audit/draws", body: { count: 1000, seed: "ki-2026-11-01", raters: [ME], localizers: false } });
    expect(text()).toContain("Drew 1,000 stacks; the blind campaign is sealed read ki-2026-11-01.");
    // the page reads again with the draw
    await view({ ...ON, tiers: [3] }, [], [DRAW]);
    const card = () => el.querySelector('[aria-label="the sealed read"]')!;
    expect(card().textContent).toContain("draw 7: 1,000 stacks, seed ki-2026-11-01");
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Start the rater"]);
    expect(card().querySelector('a[href="#review/campaigns/31"]')?.textContent).toBe("the blind campaign");
    const before = asked.length;
    await press("Start the rater");
    const since = asked.slice(before).map((a) => `${a.method} ${a.path}`);
    expect(since[0]).toBe("POST /assistant/raters/runs");
    expect(asked[before].body).toEqual({ campaign: 31, thinking: true });
    // the run is followed, and its conversation gets a fresh token of the person's
    expect(since).toContain("GET /assistant/raters/runs/r1");
    expect(since).toContain("POST /desk/assistant/conversations/rater-c1/token");
    expect(card().textContent).toContain(`rater ${ME}: 11 answered`);
    expect(card().querySelector("button")).toBeNull();
    expect(JSON.parse(localStorage.getItem("nils-participation-sealed:7")!)).toEqual({ path: "model-first", run: { id: "r1", conversation: "rater-c1", rater: ME } });
  });

  it("once the read is done offers Settle with 20 %, never to the person who read as the rater, then Close, Preview and Send of tier 3", async () => {
    localStorage.setItem("nils-participation-sealed:7", JSON.stringify({ path: "model-first", run: { id: "r1", conversation: "rater-c1", rater: "bo" } }));
    answers["GET /api/campaigns/31"] = () => ({ id: 31, status: "open", counts: { items: { open: 0, settled: 1000 } } });
    answers["GET /assistant/raters/runs/r1"] = () => ({ ...RUN, principal: "bo", answered: 1000, state: "done", done: true });
    answers["POST /api/audit/draws/7/settle"] = () => ({ draw: 7, settle: { campaign: { id: 32, name: "settle" }, items: 40, differences: 30, agreements: 970, agreements_settled: 194, seed: "ki-2026-11-01", share: 0.2, planted: 4, proposals: 40 } });
    answers["GET /api/campaigns/32"] = () => ({ id: 32, status: "open", counts: { items: { open: 0, settled: 40 } } });
    answers["POST /api/campaigns/32/close"] = () => ({ campaign: 32 });
    answers["GET /api/participation/preview"] = () => ({ document: { ...COUNTS, kind: "nils participation sealed read", protocol: { path: "model-first", share: 0.2 } }, digest: DIGEST, previewed_at: "now" });
    answers["POST /api/participation/send"] = () => ({ ...SENT, tier: 3, draw: 7 });
    await view({ ...ON, tiers: [3] }, [], [DRAW]);
    const card = () => el.querySelector('[aria-label="the sealed read"]')!;
    expect(card().textContent).toContain("rater bo: done: 1,000 answered");
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Settle"]);
    await press("Settle");
    // the one post to the engine is the settle; the run's conversation got its fresh token apart
    expect(asked.filter((a) => a.method === "POST" && a.path.startsWith("/api/"))).toEqual([{ method: "POST", path: "/api/audit/draws/7/settle", body: { share: 0.2 } }]);
    expect(asked.some((a) => a.path === "/desk/assistant/conversations/rater-c1/token")).toBe(true);
    // the verify campaign is read for its state once it exists
    expect(asked.at(-1)?.path).toBe("/api/campaigns/32");
    expect(text()).toContain("40 items to settle: 30 differences and 194 of the agreements.");
    expect(card().querySelector('a[href="#review/campaigns/32"]')?.textContent).toBe("the verify campaign");
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Close"]);
    await press("Close");
    expect(asked.at(-1)).toEqual({ method: "POST", path: "/api/campaigns/32/close", body: {} });
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Preview"]);
    await press("Preview");
    expect(asked.at(-1)?.path).toBe("/api/participation/preview?tier=3&draw=7");
    expect(card().textContent).toContain("This is the file. Nothing else leaves.");
    expect(card().textContent).toContain("model-first");
    await press("Send");
    expect(card().textContent).toContain(`File ${"ab".repeat(8)}… goes to https://participation.example.org.`);
    await press("Send it");
    expect(asked.at(-1)).toEqual({ method: "POST", path: "/api/participation/send", body: { tier: 3, draw: 7 } });
    expect(text()).toContain(`Sent. The receiver's receipt is ${RECEIPT}.`);
  });

  it("refuses the settle to the person who read as the rater", async () => {
    localStorage.setItem("nils-participation-sealed:7", JSON.stringify({ path: "model-first", run: { id: "r1", conversation: "rater-c1", rater: ME } }));
    answers["GET /api/campaigns/31"] = () => ({ id: 31, status: "open", counts: { items: { open: 0, settled: 1000 } } });
    answers["GET /assistant/raters/runs/r1"] = () => ({ ...RUN, answered: 1000, state: "done", done: true });
    await view({ ...ON, tiers: [3] }, [], [DRAW]);
    expect(button("Settle")?.disabled).toBe(true);
    expect(text()).toContain("You read as the rater, so another person settles.");
  });

  it("offers the rater again where the run failed, with its reason", async () => {
    localStorage.setItem("nils-participation-sealed:7", JSON.stringify({ path: "model-first", run: { id: "r1", conversation: "rater-c1", rater: ME } }));
    answers["GET /api/campaigns/31"] = () => ({ id: 31, status: "open", counts: { items: { open: 900, settled: 100 } } });
    answers["GET /assistant/raters/runs/r1"] = () => ({ ...RUN, answered: 100, state: "failed", done: true, error: "the model server did not answer" });
    await view({ ...ON, tiers: [3] }, [], [DRAW]);
    expect(text()).toContain(`rater ${ME}: failed: the model server did not answer`);
    expect(button("Start the rater")?.disabled).toBe(false);
    expect(button("Settle")).toBeNull();
  });

  it("on the people path draws with the double read and goes from Read to Close, with no settle", async () => {
    answers["POST /api/audit/draws"] = () => ({ draw: PEOPLE, campaign: { id: 41, name: "sealed read", purpose: "verify" } });
    await view({ ...ON, tiers: [3], assistant_rater_door: false });
    const card = () => el.querySelector('[aria-label="the sealed read"]')!;
    // the model server's door did not answer, so the path is people and model first cannot be picked
    expect(card().textContent).toContain("a seeded 20 % of the stacks is read by two");
    expect([...card().querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => [r.checked, r.disabled])).toEqual([
      [false, true],
      [true, false],
    ]);
    expect([...card().querySelectorAll(".step-body > b")].map((b) => b.textContent)).toEqual(["Draw", "Read", "Close", "Preview", "Send"]);
    await press("Draw");
    expect(asked.find((a) => a.method === "POST")).toEqual({ method: "POST", path: "/api/audit/draws", body: { count: 1000, seed: "ki-2026-11-01", readers: [], double_read_share: 0.2, localizers: false } });
    expect(JSON.parse(localStorage.getItem("nils-participation-sealed:8")!)).toEqual({ path: "people" });
    // the draw's campaigns tell the path on their own: the verify campaign made at the draw, no raters' campaign
    localStorage.clear();
    answers["GET /api/campaigns/41"] = () => ({ id: 41, status: "open", counts: { items: { open: 0, settled: 1000 } } });
    answers["POST /api/campaigns/41/close"] = () => ({ campaign: 41 });
    await view({ ...ON, tiers: [3], assistant_rater_door: true }, [], [PEOPLE]);
    expect(card().textContent).toContain("People");
    expect(card().textContent).toContain("by your people; 20 % of the stacks read by two");
    expect(card().querySelector('a[href="#review/campaigns/41"]')?.textContent).toBe("the verify campaign");
    expect([...card().querySelectorAll(".step-body > b")].map((b) => b.textContent)).toEqual(["Draw", "Read", "Close", "Preview", "Send"]);
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Close"]);
    await press("Close");
    expect(asked.at(-1)).toEqual({ method: "POST", path: "/api/campaigns/41/close", body: {} });
    expect([...card().querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual(["Preview"]);
  });
});
