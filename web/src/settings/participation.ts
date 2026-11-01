// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Participation (Wave 7b step 5, the site participation design of
// 2026-11-01): the one place the desk names the engine's participation doors,
// the audit doors the sealed read drives, and the assistant's rater doors. A
// site takes part by sharing a file it reads before it leaves: tier 1 is
// counts, tier 3 a sealed read; nothing leaves that was not previewed. Every
// shape the other two parts answer is written here once, so a field renamed
// on their side is one edit here. The words a page draws from the shapes live
// here too, so the page holds no sentence of its own.

import { door, DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { principalOf } from "../campaigns/client";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";

export const DOORS = {
  status: "GET /api/participation",
  change: "POST /api/participation",
  preview: "GET /api/participation/preview",
  send: "POST /api/participation/send",
  sends: "GET /api/participation/sends",
  draw: "POST /api/audit/draws",
  settle: "POST /api/audit/draws/{id}/settle",
} as const;

/** The tiers built now: counts, and a sealed read. Tier 2 waits for the agreement text. */
export type Tier = 1 | 3;
export const TIERS: Tier[] = [1, 3];

/** The share of the agreements the site's people settle on the model-first path, and of the items two people read on the people path: the protocol's 20 %. */
export const SHARE = 0.2;
/** The sealed read's draw, by count: 1,000 stacks. */
export const DRAW_COUNT = 1000;

/** One send, as the engine records it. */
export interface Send {
  id: number;
  tier: number;
  digest: string;
  bytes: number;
  sent_at: string;
  sent_by: string | null;
  receiver: string;
  receipt: string | null;
  error: string | null;
  previewed_at: string | null;
  draw?: number | null;
  ok?: boolean;
  stored_as?: string | null;
}

/** What GET /api/participation answers: off ({enabled: false, tiers: []}), or the site, the tiers, the receiver, the key file's path (never the key), the signing key's fingerprint, auto, who enabled it when, the last send that went through per tier, and whether the receiver and the assistant's rater door answer. */
export interface Status {
  enabled: boolean;
  tiers: number[];
  note?: string;
  site?: string | null;
  receiver?: string | null;
  key_file?: string | null;
  key_fingerprint?: string | null;
  public_key?: string | null;
  auto?: boolean;
  enabled_at?: string | null;
  enabled_by?: string | null;
  /** The newest preview per tier, by the tier's number as a key. */
  previewed?: Partial<Record<string, unknown>> | null;
  /** The last send per tier, by the tier's number as a key. */
  last_send?: Partial<Record<string, Send | null>>;
  receiver_reachable?: boolean | null;
  /** The assistant's rater door (`POST /raters/runs`), as the engine probed it: null where there is no assistant or it was not probed. */
  assistant_rater_door?: boolean | null;
}

/** What POST /api/participation takes: `tiers` replaces the set shared, `disable` true turns participation off whole, and the site's words; a field left out is kept as it is. */
export interface Change {
  tiers?: Tier[];
  disable?: true | Tier[];
  site?: string;
  receiver?: string;
  key_file?: string;
  auto?: boolean;
}

/** A participation document as the preview door writes it: one `kind`, sorted keys, counts only. */
export type Document = Record<string, unknown> & { kind: string };

export interface Preview {
  document: Document;
  /** The sha256 the send names; null where the preview door gave the document alone. */
  digest: string | null;
  previewed_at: string | null;
}

/** An audit draw as the audit doors answer it, the fields the sealed read reads. */
export interface Draw {
  id: number;
  round_id: number;
  seed: string;
  share: number | null;
  count?: number | null;
  frame: { stacks: number; digest: string };
  drawn: number;
  campaign_id: number | null;
  campaigns?: { raters: number | null; settle: number | null; rule_review: number | null };
  settle?: { seed: string; share: number } | null;
  grade: unknown | null;
  created_by?: string;
  created_at?: string;
}

export interface Settled {
  draw: number;
  settle: {
    campaign: { id: number; name: string } | null;
    items: number;
    differences: number;
    agreements: number;
    agreements_settled: number;
    seed: string;
    share: number;
    note?: string;
    again?: boolean;
  };
}

/** What the assistant's rater doors answer: the run, its conversation (the desk keeps a fresh token on it), who it reads as, its state and counts, and nothing of the items. */
export interface RaterRun {
  run: string;
  conversation: string;
  principal: string;
  state: "queued" | "running" | "done" | "refused" | "failed" | string;
  done: boolean;
  /** Why the run refused or failed: a reason, never an item. */
  error?: string | null;
  claimed: number;
  answered: number;
  refused: number;
  cant_tell: number;
  errors: number;
  /** Whether the run still holds a token of the person's; the desk pushes a fresh one as it does for a conversation. */
  token?: "held" | "missing";
}

interface CampaignCounts {
  id: number;
  status: string;
  counts?: { items?: Partial<Record<string, number>>; answers?: number };
}

const H = { "content-type": "application/json", "X-Nils-Desk": "1" };

/** The assistant's doors, through the desk's proxy, in the stations' way: the person's own bearer goes with the call. */
async function assistant<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/assistant${path}`, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  if (!r.ok) throw new Error(typeof json.error === "string" ? json.error : `the assistant answered ${r.status}`);
  return json as T;
}

/** The preview as the page reads it, from a door that wraps the document or gives it bare. */
export function previewOf(raw: Record<string, unknown>): Preview {
  const wrapped = raw.document !== undefined && typeof raw.document === "object" && raw.document !== null;
  const document = (wrapped ? raw.document : raw) as Document;
  return { document, digest: typeof raw.digest === "string" ? raw.digest : null, previewed_at: typeof raw.previewed_at === "string" ? raw.previewed_at : null };
}

export const participation = {
  status: () => door<Status>("GET", "/api/participation"),
  change: (c: Change) => door<Status>("POST", "/api/participation", c),
  preview: (tier: Tier, draw?: number | null) => door<Record<string, unknown>>("GET", `/api/participation/preview?tier=${tier}${draw ? `&draw=${draw}` : ""}`).then(previewOf),
  send: (tier: Tier, draw?: number | null) => door<Send>("POST", "/api/participation/send", draw ? { tier, draw } : { tier }),
  sends: () => door<{ sends: Send[] }>("GET", "/api/participation/sends").then((r) => r.sends ?? []),
  /** The sealed read's draw, by count, never with localizers in the frame (the dated change of 2026-11-01). With `raters` (the model-first path) the engine makes the blind raters' campaign; with `readers` (the people path, an empty list for anyone with work on campaigns) it makes the verify campaign at once, a seeded share of the items read by two. */
  draw: (body: { count: number; seed: string; raters?: string[]; readers?: string[]; double_read_share?: number; name?: string }) => door<{ draw: Draw; campaign: { id: number; name: string; purpose?: string } }>("POST", "/api/audit/draws", { ...body, localizers: false }),
  draws: () => door<{ draws: Draw[] }>("GET", "/api/audit/draws").then((r) => r.draws ?? []),
  settle: (draw: number, body: { share: number; settlers?: string[] }) => door<Settled>("POST", `/api/audit/draws/${draw}/settle`, body),
  campaign: (id: number) => door<CampaignCounts>("GET", `/api/campaigns/${id}`),
  close: (id: number) => door<{ campaign: number }>("POST", `/api/campaigns/${id}/close`, {}),
  startRater: (campaign: number) => assistant<RaterRun>("POST", "/raters/runs", { campaign, thinking: true }),
  rater: (id: string) => assistant<RaterRun>("GET", `/raters/runs/${encodeURIComponent(id)}`),
  /** A fresh token of the person's, pushed to the run's conversation, as the desk does for a conversation's turn (every five minutes while the page is open). */
  freshen: (conversation: string) => fetch(`/desk/assistant/conversations/${encodeURIComponent(conversation)}/token`, { method: "POST", headers: H }).then(() => undefined),
};

/** How often the rater run's conversation gets a fresh token while the page is open: the conversation page's cadence. */
export const TOKEN_PUSH_MS = 5 * 60_000;

/** Whether the page is offered: the engine serves the status door, to a person who may see the database (the grant the engine guards it with, as the settings doors). */
export function participates(caps: Capabilities): boolean {
  return may(caps, "database:see") && served(caps, DOORS.status);
}

/** Whether this person changes what the site shares, previews and sends: database work, as the engine guards those doors. */
export function mayChange(caps: Capabilities): boolean {
  return may(caps, "database:work");
}

/** Whether the sealed read's steps may be driven from here: the draw and the settle are review and campaign work. */
export function mayDrive(caps: Capabilities): boolean {
  return may(caps, "review:work") && may(caps, "campaigns:work") && served(caps, DOORS.draw);
}

/** Whether a tier is on. */
export function on(s: Status | null, tier: Tier): boolean {
  return (s?.tiers ?? []).some((t) => Number(t) === tier);
}

/** Whether the site takes part at all. */
export function takesPart(s: Status | null): boolean {
  return s !== null && s.enabled && (s.tiers ?? []).length > 0;
}

export const TIER_WORDS: Record<Tier, { name: string; shares: string; line: string }> = {
  1: { name: "Counts", shares: "counts", line: "Stacks, answers, corrections and releases as counts; cells under 5 held back." },
  3: { name: "A sealed read", shares: "a sealed read", line: "A draw of 1,000 stacks read blind, settled by your people; the error and its bound as counts." },
};

export const PATHS = {
  "model-first": { words: "Model first", line: `The model server reads every stack; your people settle every difference and a seeded ${pct(SHARE)} of the agreements.` },
  people: { words: "People", line: `Your people read every stack; a seeded ${pct(SHARE)} of the stacks is read by two.` },
} as const;
export type Path = keyof typeof PATHS;

/** A share as the page says it: 20 %. */
export function pct(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** The seed the protocol gives a draw: the site's name and the date, which a person may edit. */
export function defaultSeed(site: string | null, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${(site ?? "site").trim().replace(/\s+/g, "-") || "site"}-${day}`;
}

/** The key's fingerprint as shown: the first 16 of its sha256, as the document's signed_by names it. */
export function printWords(fingerprint: string | null): string {
  return fingerprint ? fingerprint.slice(0, 16) : "no key yet";
}

/** The status card's first line. */
export function statusWords(s: Status | null): string {
  if (!takesPart(s)) return "Nothing leaves this install.";
  const tiers = TIERS.filter((t) => on(s, t)).map((t) => TIER_WORDS[t].shares);
  return `${s!.site ?? "This site"} shares ${tiers.join(" and ")}.`;
}

/** A send in one line: its receipt, or its error's words. */
export function sendWords(x: Send | null | undefined): string {
  if (!x) return "never sent";
  if (x.receipt) return `receipt ${x.receipt.slice(0, 16)}`;
  return x.error ? `failed: ${x.error}` : "sent";
}

/** A digest, short, for a line a person compares. */
export function shortDigest(d: string | null): string {
  return d ? `${d.slice(0, 16)}…` : "the digest the preview records";
}

/** Why a change cannot be sent yet, or null when it can. */
export function changeRefusal(d: { site: string; receiver: string; keyFile: string; tiers: Tier[] }): string | null {
  if (d.tiers.length === 0) return null;
  if (!d.receiver.trim()) return "a receiver has an address";
  if (!/^https?:\/\/\S+$/u.test(d.receiver.trim())) return "an address starts with http:// or https://";
  if (!d.keyFile.trim()) return "the key file is a path on the engine's machine";
  if (!d.keyFile.trim().startsWith("/")) return "the key file's path starts with /";
  return null;
}

/** The change a draft makes against what is on now; null where it changes nothing. Every tier off turns participation off whole. */
export function changeOf(s: Status | null, d: { site: string; receiver: string; keyFile: string; tiers: Tier[]; auto: boolean }): Change | null {
  const c: Change = {};
  const was = TIERS.filter((t) => on(s, t));
  // every tier off: participation goes off whole, and nothing else is sent
  if (d.tiers.length === 0) return was.length > 0 ? { disable: true } : null;
  if (d.tiers.length !== was.length || d.tiers.some((t) => !was.includes(t))) c.tiers = [...d.tiers];
  if (d.site.trim() && d.site.trim() !== (s?.site ?? "")) c.site = d.site.trim();
  if (d.receiver.trim() && d.receiver.trim() !== (s?.receiver ?? "")) c.receiver = d.receiver.trim();
  if (d.keyFile.trim() && d.keyFile.trim() !== (s?.key_file ?? "")) c.key_file = d.keyFile.trim();
  if (d.auto !== (s?.auto ?? false)) c.auto = d.auto;
  return Object.keys(c).length === 0 ? null : c;
}

/** One section of a document as a table: a name, and rows of label and count; nested counts are flattened with their path as the label. */
export interface Section {
  name: string;
  rows: [string, string][];
}

const SKIP = new Set(["kind", "signature", "signed_by"]);

function flat(value: unknown, at: string[], out: [string, string][]) {
  if (value === null || value === undefined) return out.push([at.join(" · "), "none"]);
  if (Array.isArray(value)) return out.push([at.join(" · "), value.length === 0 ? "none" : value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")]);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return out.push([at.join(" · "), "none"]);
    for (const [k, v] of entries) flat(v, [...at, k], out);
    return;
  }
  if (typeof value === "number") return out.push([at.join(" · "), value.toLocaleString("en-GB")]);
  out.push([at.join(" · "), String(value)]);
}

/** The document's sections, each a table of its counts: a top-level object is a section, a top-level value a row of "About". */
export function sections(doc: Document): Section[] {
  const about: [string, string][] = [];
  const out: Section[] = [];
  for (const [k, v] of Object.entries(doc)) {
    if (SKIP.has(k)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const rows: [string, string][] = [];
      flat(v, [], rows);
      out.push({ name: k.replace(/_/g, " "), rows });
    } else flat(v, [k.replace(/_/g, " ")], about);
  }
  return about.length > 0 ? [{ name: "about", rows: about }, ...out] : out;
}

/** The sealed read's steps, in the order they are enabled. */
export type StepId = "draw" | "read" | "settle" | "close" | "preview" | "send";
export const STEPS: { id: StepId; title: string; does: string }[] = [
  { id: "draw", title: "Draw", does: `Draws ${DRAW_COUNT.toLocaleString("en-GB")} accepted stacks by the seed and makes the blind campaign.` },
  { id: "read", title: "Read", does: "Every drawn stack is read blind, through the model server or by your people." },
  { id: "settle", title: "Settle", does: `Opens the verify campaign your people settle: every difference and ${pct(SHARE)} of the agreements; some items carry a planted wrong value.` },
  { id: "close", title: "Close", does: "Closes the campaign once every item is answered." },
  { id: "preview", title: "Preview", does: "Writes the sealed read's file and records the preview." },
  { id: "send", title: "Send", does: "Posts the previewed file to the receiver." },
];

/** The steps of a path: the people path has no settle, its seeded share is the double read. */
export function stepsFor(path: Path): typeof STEPS {
  return path === "people" ? STEPS.filter((s) => s.id !== "settle") : STEPS;
}

/** What the sealed read holds for one draw, from the draw, the campaigns' counts and the rater run. */
export interface SealedState {
  draw: Draw | null;
  path: Path;
  ratersCampaign: number | null;
  readDone: boolean;
  settleCampaign: number | null;
  /** The campaign the close step closes is closed: the verify campaign on the model-first path, the blind campaign on the people path. */
  closed: boolean;
  previewed: boolean;
  sent: Send | null;
}

/** Which steps are done, from the state. */
export function done(s: SealedState): Record<StepId, boolean> {
  const drawn = s.draw !== null;
  const read = drawn && s.readDone;
  const settled = s.path === "people" ? read : read && s.settleCampaign !== null;
  const closed = settled && s.closed;
  return { draw: drawn, read, settle: settled, close: closed, preview: closed && s.previewed, send: s.sent !== null && s.sent.receipt !== null };
}

/** The one step enabled now: the first not done, once the one before it is. */
export function nextStep(s: SealedState): StepId | null {
  const d = done(s);
  for (const step of stepsFor(s.path)) if (!d[step.id]) return step.id;
  return null;
}

/** Whether a campaign's items are all read: the rater run ended well, or the campaign counts none open and none claimed (a run that refused or failed proves nothing). */
export function readDoneOf(c: CampaignCounts | null, run: RaterRun | null): boolean {
  if (run?.state === "done") return true;
  const items = c?.counts?.items;
  if (!items) return false;
  return (items.open ?? 0) + (items.claimed ?? 0) === 0 && Object.values(items).some((n) => (n ?? 0) > 0);
}

/** The draw the sealed read continues: the newest draw by count. */
export function sealedDraw(draws: Draw[]): Draw | null {
  const byCount = draws.filter((d) => typeof d.count === "number" && d.count > 0);
  return byCount.sort((a, b) => b.id - a.id)[0] ?? null;
}

/** A rater run's progress in a line; a run that refused or failed says its reason. */
export function runWords(r: RaterRun | null): string {
  if (!r) return "not started";
  if (r.state === "refused" || r.state === "failed") return `${r.state}: ${r.error ?? "no reason given"}`;
  const n = (x: number) => x.toLocaleString("en-GB");
  const parts = [`${n(r.answered)} answered`];
  if (r.refused > 0) parts.push(`${n(r.refused)} refused`);
  if (r.cant_tell > 0) parts.push(`${n(r.cant_tell)} cannot tell`);
  if (r.errors > 0) parts.push(`${n(r.errors)} errors`);
  return `${r.done ? "done: " : ""}${parts.join(", ")}`;
}

/** Whether a run may be started (again): none yet, or the last one refused or failed. */
export function startable(r: RaterRun | null): boolean {
  return r === null || r.state === "refused" || r.state === "failed";
}

/**
 * Who reads as the rater on the model-first path (the rater slice's decision
 * of 2026-11-01): the assistant holds no identity of its own against the
 * engine and reads with the token of the person who starts the run, so that
 * person is the draw's rater and may not settle. One place, should an own
 * identity come.
 */
export function raterOf(caps: Capabilities): string {
  return principalOf(caps);
}

/** Why this person may not settle this draw, or null: on the model-first path the person who read as the rater settles nothing. */
export function settleRefusal(s: SealedState, rater: string | null, me: string): string | null {
  if (s.path !== "model-first" || rater === null) return null;
  return rater === me ? "You read as the rater, so another person settles." : null;
}

/** The link to a campaign in Review. */
export function campaignHref(id: number): string {
  return href("review", "campaigns", String(id));
}

/** What this browser keeps of a draw between visits: its path, which the draw record does not say, and the rater run, which the assistant does not list. */
export interface KeptSealed {
  path: Path;
  run?: { id: string; conversation: string; rater: string };
}
const KEY = (draw: number) => `nils-participation-sealed:${draw}`;
export function keptSealed(draw: number): KeptSealed | null {
  try {
    const raw = localStorage.getItem(KEY(draw));
    return raw ? (JSON.parse(raw) as KeptSealed) : null;
  } catch {
    return null;
  }
}
export function keepSealed(draw: number, kept: KeptSealed) {
  try {
    localStorage.setItem(KEY(draw), JSON.stringify(kept));
  } catch {
    // a browser that keeps nothing: the run is still followed while the page stays open
  }
}

/** The path of a draw made before: a raters' campaign means model first; a settle campaign with no raters' campaign is the people path's verify campaign, made at the draw; else what this browser kept or the page's switch says. */
export function pathOf(draw: Draw | null, kept: KeptSealed | null, chosen: Path): Path {
  if (draw?.campaigns?.raters) return "model-first";
  if (draw?.campaigns && !draw.campaigns.raters && draw.campaigns.settle) return "people";
  return kept?.path ?? chosen;
}

/** The campaign the drawn stacks are read in: the raters' campaign on the model-first path, the verify campaign made at the draw on the people path. */
export function readCampaignOf(draw: Draw | null, path: Path): number | null {
  if (!draw) return null;
  if (path === "people") return draw.campaigns?.settle ?? draw.campaign_id ?? null;
  return draw.campaigns?.raters ?? draw.campaign_id ?? null;
}

/** The error's words for the page: the engine's, or the assistant's. */
export function why(e: unknown): string {
  if (e instanceof DoorError) return e.message;
  return e instanceof Error ? e.message : String(e);
}
