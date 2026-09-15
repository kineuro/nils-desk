// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's words (Wave 4c sections 8.3 to 8.6, records 23 to 25), as
// the chosen design draws them: Kvasir's health, the machine's card, which
// backends show where, each model with where its prompts go and whether a
// local one passed its admission, what a check found, what goes when a
// backend is removed, and where each station goes, as a line from the station
// to the box of where it runs. Every word is read from Kvasir's doors, the
// supervisor's install or what the person may do there.

import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import type { AdmissionRecord, Backend, PurposeRow, Subscription } from "./kvasir";
import { grantRefusalOf, opening, RUNTIME_BACKEND } from "./kvasir";
import { runtimeName } from "./parts";
import type { Install } from "./supervise";

export type Tone = "ok" | "caution" | "blocked" | "neutral";

/** A model as Kvasir's catalogue lists it; a local model is listed once admitted. */
export interface CatalogueModel {
  id: string;
  reasoning?: boolean;
  contextWindow?: number;
  backend?: string;
  locality?: string;
  admitted?: boolean | null;
}

const onDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const onDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const count = (n: number) => n.toLocaleString("en-GB");

/** How long a local model reads as being checked after its backend is added: its warm-up and the suite take minutes. */
export const CHECKING_MS = 3_600_000;

/** Items in a sentence: a, a and b, a, b and c. */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Who looks at the page, as far as its words and its acts go (record 25). */
export interface Viewer {
  /** Kvasir: Work: moves stations, adds, checks and removes models, and sees where a server answers. */
  work: boolean;
  /** The assistant with Kvasir: See: may sign in a ChatGPT subscription of their own. */
  subscribes: boolean;
  /** Nobody signs in, so the ChatGPT subscription is the install's. */
  system: boolean;
}

/** The page's viewer: what the person may do there, and whether the subscription Kvasir answered with is the install's. */
export function viewerOf(caps: Capabilities, subscription: Subscription | null): Viewer {
  return {
    work: may(caps, "kvasir:work"),
    subscribes: may(caps, "assistant:use") && may(caps, "kvasir:see"),
    system: subscription ? subscription.for === "system" : caps.desk.mode === "off",
  };
}

/** A grant as the Identity page names it: the page and how far a person goes there, and the assistant as itself. */
export function grantWords(grant: string): string {
  if (grant === "assistant:use") return "the assistant";
  const [page, level = ""] = grant.split(":");
  const name = page === "assistant-settings" ? "Assistant settings" : page.charAt(0).toUpperCase() + page.slice(1);
  return level ? `${name}: ${level.charAt(0).toUpperCase()}${level.slice(1)}` : name;
}

/** A refusal for want of a grant in words a person can act on; any other refusal as it came. */
export function plainly(e: unknown): unknown {
  const r = grantRefusalOf(e);
  if (!r) return e;
  if (r.code === "not_a_person") return new Error("Kvasir keeps a subscription for a person, and this call named nobody. Sign in to the desk, then try again.");
  const needs = listWords(r.needs.map(grantWords));
  const them = r.needs.length > 1 ? "them" : "it";
  if (r.needs.includes("assistant:use")) return new Error(`A subscription of your own needs ${needs}. Someone with Identity: Work gives ${them} on the Identity page.`);
  return new Error(needs ? `This needs ${needs}, which you do not hold. Someone with Identity: Work gives ${them} on the Identity page.` : "This needs a grant you do not hold. Someone with Identity: Work gives it on the Identity page.");
}

/** Which backends show where: those Kvasir holds as models, and the one it has itself, ChatGPT through subscriptions, as the subscription's card. */
export function shownBackends(backends: Backend[]): { held: Backend[]; subscriptions: Backend[] } {
  return { held: backends.filter((b) => b.builtin !== true), subscriptions: backends.filter((b) => b.builtin === true) };
}

/** Kvasir's health for the head of the page: warm or warming, and how busy its streams are. */
export function gatewayHealth(backends: Backend[]): { tone: Tone; words: string; streams: string | null } {
  const number = (v: unknown) => (typeof v === "number" ? v : 0);
  const running = backends.reduce((n, b) => n + number(b.health.running), 0);
  const of = backends.reduce((n, b) => n + number(b.health.concurrency), 0);
  const streams = of > 0 ? `${running} of ${of} streams busy` : null;
  if (shownBackends(backends).held.length === 0) return { tone: "caution", words: "no model yet", streams };
  const warming = backends.some((b) => b.health.warming === true);
  return { tone: warming ? "caution" : "ok", words: warming ? "warming" : "warm", streams };
}

/** A graphics card the supervisor found, with its memory. */
export interface Card {
  name: string;
  memory_gb: number;
}

/** Every card the machine has: the supervisor's list where it gives one, else the one card setup found, and none where no supervisor answers. */
export function cardsOf(install: Install | null): Card[] {
  const machine = install?.machine;
  if (!machine) return [];
  if (Array.isArray(machine.cards) && machine.cards.length > 0) return machine.cards;
  return machine.card ? [machine.card] : [];
}

/**
 * The machine's cards in one line, each kind once with how many there are and
 * their memory together, and the memory of all where more than one kind holds
 * some; null where no card is known. And what setup says the machine can serve.
 */
export function machineWords(install: Install | null): { cards: string | null; advice: string[] } {
  const kinds: { name: string; count: number; memory: number }[] = [];
  for (const c of cardsOf(install)) {
    const memory = c.memory_gb > 0 ? c.memory_gb : 0;
    const kind = kinds.find((k) => k.name === c.name);
    if (kind) {
      kind.count += 1;
      kind.memory += memory;
    } else kinds.push({ name: c.name, count: 1, memory });
  }
  const parts = kinds.map((k) => `${k.count > 1 ? `${k.count} × ` : ""}${k.name}${k.memory > 0 ? `, ${Math.round(k.memory)} GB` : ""}`);
  const holding = kinds.filter((k) => k.memory > 0);
  if (holding.length > 1) parts.push(`${Math.round(holding.reduce((n, k) => n + k.memory, 0))} GB in all`);
  return { cards: parts.length > 0 ? parts.join(" · ") : null, advice: install?.machine.advice ?? [] };
}

/** A model's facts: what Kvasir holds of it, or its catalogue's line where Kvasir says nothing more. */
export function modelOf(b: Backend, model: string, catalogue: CatalogueModel[]): CatalogueModel | undefined {
  const entry = b.entries?.find((e) => e.id === model);
  if (entry) return { id: entry.id, reasoning: entry.reasoning, contextWindow: entry.context_window, backend: b.id, locality: b.locality, admitted: entry.admitted };
  return catalogue.find((c) => c.id === model && (c.backend === undefined || c.backend === b.id));
}

/** The context a model takes, as a card says it; null where Kvasir does not say. */
export function tokensWords(m: CatalogueModel | undefined): string | null {
  return m?.contextWindow ? `${count(m.contextWindow)} tokens` : null;
}

/** Where a backend's prompts go. A local backend is one of yours, which is not always this machine. */
export function whereWords(locality: Backend["locality"]): { tone: Tone; words: string } {
  return locality === "local" ? { tone: "ok", words: "stays in your systems" } : { tone: "caution", words: "leaves your systems" };
}

const CHECKS: Record<string, string> = {
  tool_calls: "tool calls",
  chat_template: "its chat template",
  enforced_schema: "enforced schemas",
  overflow: "context overflow",
  stream_integrity: "stream integrity",
};

/** The checks of the admission suite a record failed, in words. */
export function failedChecks(r: AdmissionRecord): string[] {
  return (r.checks ?? []).filter((c) => c.passed === false).map((c) => CHECKS[c.name] ?? c.name.replace(/_/gu, " "));
}

export interface Admission {
  tone: Tone;
  words: string;
  /** The day of the record it was admitted or refused on, for the tag's hover title. */
  on: string | null;
  /** The checks a refused model failed, for the tag's hover title. */
  detail: string | null;
}

/** An admission's hover title: when it was admitted or refused, and the checks a refused model failed. */
export function admissionTitle(a: Admission): string | null {
  return [a.on ? `${a.words} on ${a.on}` : null, a.detail].filter(Boolean).join(": ") || null;
}

/**
 * A model's admission: a local model is offered only once it passes the suite
 * for the runtime serving it; a provider's needs none. A local model is being
 * checked while a check runs from the page, and for the first hour after its
 * backend was added unless a check since refused it.
 */
export function admissionWords(model: string, backend: Backend, listed: CatalogueModel | undefined, records: AdmissionRecord[] | null, at: { now: number; checking: boolean }): Admission {
  if (backend.locality === "remote") return { tone: "neutral", words: "not needed for a provider", on: null, detail: null };
  if (at.checking) return { tone: "caution", words: "being checked", on: null, detail: null };
  // a record from before the backend was added again is another backend's
  const since = backend.added_at ?? 0;
  const mine = (records ?? []).filter((r) => r.backend === backend.id && r.model === model && r.at >= since).sort((a, b) => b.at - a.at);
  const flag = listed?.admitted;
  if (flag === true || (typeof flag !== "boolean" && mine[0]?.passed === true)) {
    const passed = mine.find((r) => r.passed);
    return { tone: "ok", words: "admitted", on: passed ? onDay(passed.at) : null, detail: null };
  }
  if (mine[0] && !mine[0].passed) {
    const failed = failedChecks(mine[0]);
    return { tone: "blocked", words: "refused", on: onDay(mine[0].at), detail: failed.length > 0 ? `failed ${listWords(failed)}` : null };
  }
  if (backend.added_at !== undefined && at.now - backend.added_at < CHECKING_MS) return { tone: "caution", words: "being checked", on: null, detail: null };
  return { tone: "caution", words: "not admitted yet", on: null, detail: null };
}

/** What a check found, model by model. */
export function checkWords(records: AdmissionRecord[]): { passed: boolean; words: string } {
  if (records.length === 0) return { passed: false, words: "Kvasir checked no model." };
  const words = records.map((r) => {
    if (r.passed) return `${r.model} passed the admission suite, and the assistant may use it.`;
    const failed = failedChecks(r);
    return `${r.model} did not pass the admission suite${failed.length > 0 ? `: it failed ${listWords(failed)}` : ""}.`;
  });
  return { passed: records.every((r) => r.passed), words: words.join(" ") };
}

/** The station a purpose is, by the name the assistant gives its purposes. */
export function stationOf(purpose: string): string {
  return purpose.startsWith("assistant.") ? purpose.slice("assistant.".length) : purpose;
}

/** The stations whose purposes a backend answers. */
export function usedFor(backend: Backend, purposes: PurposeRow[]): string {
  const stations = purposes.filter((p) => p.backend === backend.id).map((p) => stationOf(p.purpose));
  return stations.length === 0 ? "nothing yet" : stations.join(", ");
}

/** The stations a backend answers, counted as a card says them, with their names for a hover title; null before the stations are read. */
export function answersWords(backendId: string, purposes: PurposeRow[] | null): { words: string; title: string | null } | null {
  if (purposes === null) return null;
  return countedStations(purposes.filter((p) => p.backend === backendId).map((p) => stationOf(p.purpose)));
}

/** Stations counted, as a card says them, with their names for a hover title. */
export function countedStations(stations: string[]): { words: string; title: string | null } {
  if (stations.length === 0) return { words: "answers no station", title: null };
  return { words: stations.length === 1 ? "answers 1 station" : `answers ${stations.length} stations`, title: stations.join(", ") };
}

/** The stations that go to ChatGPT through the subscription. */
export function subscribedStations(purposes: PurposeRow[] | null, backends: Backend[] | null): string[] {
  const builtin = new Set((backends ?? []).filter((b) => b.builtin === true).map((b) => b.id));
  return (purposes ?? []).filter((p) => p.backend !== null && builtin.has(p.backend)).map((p) => stationOf(p.purpose));
}

/** A backend where a station goes: its first model, or ChatGPT through the subscription it uses. */
export function destinationWords(b: Backend, system = false): string {
  if (b.builtin === true) return system ? "The install's ChatGPT subscription" : "Each person's own ChatGPT subscription";
  return b.models[0] ?? b.id;
}

/** Whether a backend is the one Kvasir holds the models it started on this machine's llama.cpp under. */
export function onRuntime(b: Backend): boolean {
  return b.id === RUNTIME_BACKEND && b.locality === "local" && b.builtin !== true;
}

/** The runtime a backend's newest admission record names, such as SGLang; null where none does. */
export function runtimeOfBackend(b: Backend, records: AdmissionRecord[] | null): string | null {
  const newest = (records ?? []).filter((r) => r.backend === b.id).sort((x, y) => y.at - x.at)[0];
  const name = newest?.runtime.name ?? "";
  return name && name !== "unknown" ? runtimeName(name) : null;
}

const PROVIDERS: Record<string, string> = { openai: "OpenAI", openrouter: "OpenRouter", minimax: "MiniMax", anthropic: "Anthropic" };

/** A provider's name as a person knows it. */
export function providerName(b: Backend): string {
  const id = b.provider ?? b.id;
  return PROVIDERS[id.toLowerCase()] ?? id;
}

/** The model a station gets in your systems where its backend does not answer it: the first model a server of yours serves. */
export function defaultModel(backends: Backend[]): string | null {
  return backends.find((x) => x.builtin !== true && x.locality === "local" && x.models.length > 0)?.models[0] ?? null;
}

/** Where a model runs, as the square beside it shows it. */
export interface Mark {
  icon: "chip" | "engine" | "cloud" | "key" | "update" | "alert";
  tone: "brand" | "neutral" | "caution";
}

export const MARKS = {
  runtime: { icon: "chip", tone: "brand" },
  server: { icon: "engine", tone: "neutral" },
  provider: { icon: "cloud", tone: "caution" },
  subscription: { icon: "cloud", tone: "caution" },
  nowhere: { icon: "alert", tone: "caution" },
} satisfies Record<string, Mark>;

/** Where a station goes, as its box draws it: where it runs, the model or the subscription, what runs it, and whether its prompts leave. */
export interface Destination {
  mark: Mark;
  title: string;
  meta: string | null;
  where: { tone: Tone; words: string } | null;
}

/** The model a signed-in subscription answers with, by its name. */
export function subscribedModel(s: Subscription): string | null {
  if (!s.model) return null;
  return s.models.find((m) => m.id === s.model)?.name.trim() || s.model;
}

/** The box a station's line ends in, for this viewer: the subscription reads as theirs, each person's, or the install's. */
export function destinationOf(p: PurposeRow, backends: Backend[], at: { viewer: Viewer; admissions: AdmissionRecord[] | null; subscription: Subscription | null }): Destination {
  const b = backends.find((x) => x.id === p.backend);
  if (!b) {
    const stopped = p.backend === RUNTIME_BACKEND;
    return { mark: MARKS.nowhere, title: "nowhere yet", meta: stopped ? "its model on this machine is stopped" : "no model in your systems answers it yet", where: null };
  }
  const where = whereWords(b.locality);
  if (b.builtin === true) {
    const { viewer, subscription: s } = at;
    const name = s?.name ?? "ChatGPT";
    const until = defaultModel(backends) ?? "the default model in your systems";
    const signed = s?.state === "signed_in" ? `${subscribedModel(s) ?? name}, signed in` : null;
    if (viewer.system) return { mark: MARKS.subscription, title: `The install's ${name} subscription`, meta: signed ?? `${until} until it is signed in`, where };
    if (viewer.subscribes && !viewer.work) return { mark: MARKS.subscription, title: `Your own ${name} subscription`, meta: signed ?? `${until} until you sign in`, where };
    return { mark: MARKS.subscription, title: `Each person's own ${name} subscription`, meta: "the default model in your systems for anyone without one", where };
  }
  const model = b.models[0] ?? b.id;
  if (onRuntime(b)) return { mark: MARKS.runtime, title: model, meta: "this machine, llama.cpp", where };
  if (b.locality === "local") {
    const runtime = runtimeOfBackend(b, at.admissions);
    return { mark: MARKS.server, title: model, meta: at.viewer.work ? (runtime ? `your server, ${runtime}` : "your server") : "a server in your systems", where };
  }
  return { mark: MARKS.provider, title: model, meta: `${providerName(b)}, a provider`, where };
}

/** Where a station goes now, in one line. */
export function goesToWords(d: Destination): string {
  return d.meta ? `${d.title}, ${d.meta}` : d.title;
}

/** What a station carries to the model, beside its name. */
export function carriesWords(content: PurposeRow["content"]): string {
  if (content === "catalog") return "carries the catalogue";
  return content === "rows" ? "carries rows" : "carries identifiers";
}

/** One station's line: its name and what it carries, where it goes, and who allowed it. */
export interface Route {
  purpose: PurposeRow;
  station: string;
  carries: string;
  to: Destination;
  /** Who allowed rows of the archive to leave for it, or why nothing needed allowing; null otherwise. */
  side: string | null;
  /** Whether this viewer may move it, to a backend it may go to. */
  movable: boolean;
}

/** Where each station goes (record 25): the page's first section. */
export function routes(purposes: PurposeRow[], backends: Backend[], at: { viewer: Viewer; admissions: AdmissionRecord[] | null; subscription: Subscription | null }): Route[] {
  return purposes.map((p) => {
    const b = backends.find((x) => x.id === p.backend);
    const side = p.acknowledged
      ? `allowed by ${p.acknowledged.by}${p.acknowledged.at ? ` on ${onDate(p.acknowledged.at)}` : ""}, for this station`
      : b?.locality === "remote" && p.content === "catalog"
        ? "no rows, so no reason needed"
        : null;
    return { purpose: p, station: stationOf(p.purpose), carries: carriesWords(p.content), to: destinationOf(p, backends, at), side, movable: at.viewer.work && targets(p, backends).length > 0 };
  });
}

/** The backends a purpose may move to, each saying whether the move needs an admin's written reason. */
export function targets(p: PurposeRow, backends: Backend[]): { backend: Backend; needs: "nothing" | "an acknowledgement" }[] {
  return backends
    .filter((b) => b.id !== p.backend)
    .map((b) => ({ backend: b, open: opening(p, b) }))
    .filter((t) => t.open !== "never")
    .map((t) => ({ backend: t.backend, needs: t.open === "acknowledge" ? ("an acknowledgement" as const) : ("nothing" as const) }));
}

/**
 * What removing a backend lets go, said before it goes: its models, its key,
 * and where the stations it answers go instead. Kvasir forgets the rows that
 * sent a station to it, and a station's default is the first backend in your
 * systems that serves a model.
 */
export function removalWords(b: Backend, backends: Backend[], purposes: PurposeRow[] | null): string[] {
  const it = b.models.length === 1 ? "it" : "them";
  const out = [`Kvasir lets go of ${listWords(b.models) || b.id}: nothing reaches ${it} through Kvasir any more, and answers already under way finish.`];
  if (b.credential === true) out.push("Its key is forgotten.");
  const stations = (purposes ?? []).filter((p) => p.backend === b.id).map((p) => stationOf(p.purpose));
  if (stations.length > 0) {
    const one = stations.length === 1;
    const next = defaultModel(backends.filter((x) => x.id !== b.id));
    out.push(
      next
        ? `The ${one ? "station it answered goes to its" : "stations it answered go to their"} default instead, ${next} in your systems: ${listWords(stations)}.`
        : `The ${one ? "station it answered has" : "stations it answered have"} nowhere to go until a model in your systems is added: ${listWords(stations)}.`,
    );
  }
  return out;
}

/** A station a provider does not answer, and what moving it there needs. */
export interface ClosedLine {
  purpose: PurposeRow;
  station: string;
  needs: "nothing" | "an acknowledgement" | "never";
  words: string;
}

/**
 * The stations a provider does not answer, said once it is added (record 24):
 * a station with no row in the table stays in your systems, so a provider
 * answers only the stations an admin moves to it; rows of the archive go only
 * with a written reason, and identifiers never.
 */
export function closedTo(provider: Backend, purposes: PurposeRow[]): ClosedLine[] {
  return purposes
    .filter((p) => p.backend !== provider.id)
    .map((p): ClosedLine => {
      const station = stationOf(p.purpose);
      const open = opening(p, provider);
      if (open === "never") return { purpose: p, station, needs: "never", words: `${station} carries identifiers, which never leave your systems.` };
      if (open === "acknowledge") return { purpose: p, station, needs: "an acknowledgement", words: `${station} carries rows of the archive, which go there only once you write down why.` };
      return { purpose: p, station, needs: "nothing", words: `${station} reads no rows, and goes there once you move it.` };
    });
}

/** What leads the stations a provider does not answer: none yet, or not these. */
export function closedLead(provider: Backend, purposes: PurposeRow[]): string {
  const named = destinationWords(provider);
  return purposes.some((p) => p.backend === provider.id) ? `${named} does not answer these stations yet` : `${named} answers no station yet`;
}
