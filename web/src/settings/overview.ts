// SPDX-License-Identifier: AGPL-3.0-only
// Settings' overview, a dashboard: a card for each page with its state, the
// one fact that matters most and a few beside it, and the list of what needs
// a person first. Every word is worked out from what the pages themselves
// read; nothing here is declared.

import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import type { AuditRow } from "../ops/client";
import type { IconName } from "../ui/Icon";
import { agoWords } from "../ui/kept";
import { backupsTag, nextWords, registryRule, scheduleWords, sizeWords, type Backups } from "./database";
import { gatewayHealth, shownBackends } from "./gateway";
import { reachWords, type Users } from "./identity";
import { keptRunning, where } from "./install";
import type { Backend } from "./kvasir";
import { placeState, roleCounts } from "./places";
import type { Install } from "./supervise";

export type Tone = "ok" | "caution" | "blocked" | "neutral" | "brand";

export interface Card {
  /** The settings page the card opens. */
  page: string;
  title: string;
  icon: IconName;
  state: { tone: Tone; words: string } | null;
  value: string;
  facts: string[];
}

export interface Attention {
  page: string;
  tone: "blocked" | "caution" | "brand";
  words: string;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

const ROLE_PLURAL: Record<Place["role"], string> = {
  source: "sources",
  registry: "registries",
  working: "working places",
  export: "exports",
  share: "shares",
  exchange: "exchanges",
  backup: "backups",
};

const ROLE_ONE: Record<Place["role"], string> = { ...ROLE_PLURAL, source: "source", registry: "registry", working: "working place", export: "export", share: "share", exchange: "exchange", backup: "backup" };

/** Every part and whether it answers, the newest release, and how the install runs. */
export function partsCard(caps: Capabilities, install: Install | null): Card {
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  // each part by its name in a list, and as it is called inside a sentence
  const parts: { name: string; called: string; answers: boolean }[] = [
    { name: "engine", called: "the engine", answers: caps.engine !== null },
    { name: "desk", called: "the desk", answers: true },
  ];
  if (caps.kvasir !== null || install?.parts["kvasir"]) parts.push({ name: "Kvasir", called: "Kvasir", answers: caps.kvasir !== null });
  if (caps.assistant !== null || install?.parts["assistant"]) parts.push({ name: "assistant", called: "the assistant", answers: caps.assistant !== null });
  const down = parts.filter((p) => !p.answers);
  const newer = install?.release.newer ?? null;
  const state: Card["state"] =
    down.length === 1
      ? { tone: "blocked", words: `${down[0].called} does not answer` }
      : down.length > 1
        ? { tone: "blocked", words: `${down.length} parts do not answer` }
        : warming
          ? { tone: "caution", words: "Kvasir is warming" }
          : newer
            ? { tone: "brand", words: `${newer} is out` }
            : { tone: "ok", words: "all answer" };
  const facts = [`${count(parts.length, "part", "parts")}: ${parts.map((p) => p.name).join(", ")}`];
  if (install) facts.push(`${where(install)}, ${keptRunning(install) ? "kept running" : "started by hand"}`);
  return { page: "parts", title: "Parts", icon: "layers", state, value: `NILS ${caps.engine?.engine.version ?? caps.desk.version}`, facts };
}

/** How many places, whether each stands up to its role, the roles, and the one with least room. */
export function placesCard(places: Place[], containers: boolean): Card {
  const live = places.filter((p) => p.retired_at === null);
  const judged = live.map((p) => ({ p, s: placeState(p, places, containers) }));
  const needing = [...judged.filter((j) => j.s.tone === "blocked"), ...judged.filter((j) => j.s.tone === "caution")];
  const worst = needing[0]?.s.tone === "blocked" ? "blocked" : "caution";
  const state: Card["state"] =
    live.length === 0
      ? { tone: "caution", words: "none declared" }
      : needing.length === 1
        ? { tone: worst, words: `${needing[0].p.name}: ${needing[0].s.words}` }
        : needing.length > 1
          ? { tone: worst, words: `${needing.length} need attention` }
          : { tone: "ok", words: "all pass" };
  const facts: string[] = [];
  const roles = roleCounts(live);
  if (roles.length > 0) facts.push(roles.map((r) => `${r.count} ${r.count === 1 ? ROLE_ONE[r.role] : ROLE_PLURAL[r.role]}`).join(" · "));
  const free = (p: Place) => p.probed?.["free_bytes"];
  const tightest = live.filter((p) => typeof free(p) === "number").sort((a, b) => (free(a) as number) - (free(b) as number))[0];
  if (tightest) facts.push(`least room: ${tightest.name}, ${sizeWords(free(tightest) as number)} free`);
  return { page: "places", title: "Places", icon: "folder", state, value: count(live.length, "place", "places"), facts };
}

/** When the newest archive was written and how it checked, the schedule, and what is kept. */
export function backupsCard(b: Backups, now: Date): Card {
  const ours = b.archives.filter((a) => a.ours);
  const at = ours[0]?.created_at ? Date.parse(ours[0].created_at) : Number.NaN;
  const s = b.schedule;
  const facts: string[] = [s.every === "off" ? "no schedule" : `${scheduleWords(s)}${s.keep !== null ? `, keeps ${s.keep}` : ""}`];
  const next = nextWords(s, now);
  if (next) facts.push(next);
  if (ours.length > 0) facts.push(`${count(ours.length, "archive", "archives")}, ${sizeWords(ours.reduce((n, a) => n + a.bytes, 0))}`);
  const value = !Number.isNaN(at) ? `last ${agoWords(at, now.getTime())}` : b.dir ? "none yet" : "no backup directory";
  return { page: "database", title: "Backups", icon: "shield", state: backupsTag(b), value, facts };
}

/** What keeps the registry, whether it has a backup place elsewhere, its epoch and its calendar. */
export function registryCard(caps: Capabilities, install: Install | null, backend: string | null, places: Place[] | null, timezone: string | null): Card {
  const kind = backend ?? install?.backend ?? null;
  const version = install?.parts["postgres"]?.version;
  const value = kind === null ? "kept by the engine" : kind.startsWith("postgres") ? `Postgres${version ? ` ${version}` : ""}` : "SQLite";
  const r = caps.engine?.registry;
  const facts: string[] = [];
  if (r) facts.push(`epoch ${r.epoch.toLocaleString("en-GB")}${r.schema_version !== undefined ? ` · schema ${r.schema_version}` : ""}`);
  if (timezone) facts.push(`dates read in ${timezone}`);
  return { page: "database", title: "Registry", icon: "data", state: places ? registryRule(places) : null, value, facts };
}

/** How people sign in, who they are, and where the desk answers. */
export function signinCard(caps: Capabilities, users: Users | null): Card {
  const mode = caps.desk.mode;
  const origin = caps.desk.settings?.origin ?? "";
  const local = origin === "" || reachWords(origin).local;
  const value = mode === "local" ? "Local accounts" : mode === "oidc" ? "Single sign-on" : "Nobody signs in";
  const state: Card["state"] = mode !== "off" ? { tone: "ok", words: "people sign in" } : local ? { tone: "neutral", words: "this machine only" } : { tone: "caution", words: "open to the network" };
  const facts: string[] = [];
  if (mode === "local" && users) {
    const open = typeof users.sessions_open === "number" ? count(users.sessions_open, "session open", "sessions open") : null;
    facts.push([count(users.users.length, "person", "people"), open].filter(Boolean).join(" · "));
  }
  const issuer = caps.desk.settings?.signing?.issuer;
  if (mode === "oidc" && issuer) facts.push(`at ${hostOf(issuer)}`);
  if (origin) facts.push(local ? "the desk answers on this machine" : `the desk answers at ${origin}`);
  return { page: "identity", title: "Sign-in", icon: "users", state, value, facts };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Whether Kvasir is warm, the model the assistant reaches first, and where prompts may go. */
export function gatewayCard(caps: Capabilities, backends: Backend[] | null): Card {
  const title = "Kvasir";
  if (caps.kvasir === null) return { page: "gateway", title, icon: "gateway", state: { tone: "blocked", words: "does not answer" }, value: "no model reached", facts: [] };
  const models = (caps.kvasir["models"] as { id?: unknown; locality?: unknown }[] | undefined) ?? [];
  const first = models.find((m) => m.locality === "local" && typeof m.id === "string") ?? models.find((m) => typeof m.id === "string");
  const facts: string[] = [];
  let state: Card["state"] = null;
  if (backends) {
    const h = gatewayHealth(backends);
    state = { tone: h.tone, words: h.words };
    // ChatGPT through people's own subscriptions is not a provider the install holds a key for
    const { held, subscriptions } = shownBackends(backends);
    const locals = held.filter((b) => b.locality === "local").length;
    const remotes = held.filter((b) => b.locality === "remote").length;
    const kinds = [locals > 0 ? count(locals, "local backend", "local backends") : null, remotes > 0 ? count(remotes, "provider", "providers") : null, subscriptions.length > 0 ? "ChatGPT subscriptions" : null];
    facts.push(kinds.filter(Boolean).join(" · ") || "no model yet");
    if (h.streams) facts.push(h.streams);
  }
  facts.push("identifiers never leave");
  return { page: "gateway", title, icon: "gateway", state, value: typeof first?.id === "string" ? first.id : "no model yet", facts };
}

/** The newest act, who did it and when, and how many acts this month. */
export function auditCard(rows: AuditRow[], now: Date): Card {
  const newest = rows[0] ?? null;
  const month = now.toISOString().slice(0, 7);
  const thisMonth = rows.filter((r) => (r.at ?? "").startsWith(month)).length;
  const facts: string[] = [];
  if (newest) {
    const at = newest.at ? Date.parse(newest.at) : Number.NaN;
    facts.push([`by ${newest.principal ?? "someone"}`, Number.isNaN(at) ? null : agoWords(at, now.getTime())].filter(Boolean).join(", "));
  }
  facts.push(thisMonth === 0 ? "no act this month" : `${thisMonth === rows.length && rows.length >= 200 ? "200 or more acts" : count(thisMonth, "act", "acts")} this month`);
  return { page: "audit", title: "Audit", icon: "file", state: null, value: newest?.action ?? "no act yet", facts };
}

const RANK: Record<Attention["tone"], number> = { blocked: 0, caution: 1, brand: 2 };

/** What needs a person, the worst first: every card whose state is not in order, and a newer release. */
export function attention(cards: Card[]): Attention[] {
  return cards
    .flatMap((c): Attention[] => {
      const t = c.state?.tone;
      return t === "blocked" || t === "caution" || t === "brand" ? [{ page: c.page, tone: t, words: `${c.title}: ${c.state!.words}` }] : [];
    })
    .sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}
