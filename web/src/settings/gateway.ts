// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's words (Wave 4c sections 8.3 to 8.6, record 23), as the
// chosen design draws them: Kvasir's health, the machine's card and what it
// can serve, which backends show where, each model with where its prompts go
// and whether a local one passed its admission, what a check found, what goes
// when a backend is removed, and where each station goes. Every word is read
// from Kvasir's doors or the supervisor's install.

import type { AdmissionRecord, Backend, PurposeRow } from "./kvasir";
import { opening } from "./kvasir";
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
const count = (n: number) => n.toLocaleString("en-GB");

/** How long a local model reads as being checked after its backend is added: its warm-up and the suite take minutes. */
export const CHECKING_MS = 3_600_000;

/** Items in a sentence: a, a and b, a, b and c. */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Which backends show where: those Kvasir holds in the models table, and the one it has itself, ChatGPT through subscriptions, under Subscriptions. */
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

/** The card this machine has and what it can serve, in the words setup uses. */
export function machineWords(install: Install | null): { card: string | null; advice: string[] } {
  const card = install?.machine.card ?? null;
  return { card: card ? `${card.name}, ${Math.round(card.memory_gb)} GB` : null, advice: install?.machine.advice ?? [] };
}

/** A model's facts: what Kvasir holds of it, or its catalogue's line where Kvasir says nothing more. */
export function modelOf(b: Backend, model: string, catalogue: CatalogueModel[]): CatalogueModel | undefined {
  const entry = b.entries?.find((e) => e.id === model);
  if (entry) return { id: entry.id, reasoning: entry.reasoning, contextWindow: entry.context_window, backend: b.id, locality: b.locality, admitted: entry.admitted };
  return catalogue.find((c) => c.id === model && (c.backend === undefined || c.backend === b.id));
}

/** A model's line under its name: the context it takes and whether it reasons. */
export function modelMeta(m: CatalogueModel | undefined, locality: Backend["locality"]): string {
  const parts = [m?.contextWindow ? `${count(m.contextWindow)} tokens` : null, m?.reasoning ? "reasoning" : null].filter(Boolean);
  if (parts.length === 0) return locality === "remote" ? "a provider's model" : "";
  return parts.join(" · ");
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
  /** The checks a refused model failed, said under its tag. */
  detail: string | null;
}

/**
 * A model's admission: a local model is offered only once it passes the suite
 * for the runtime serving it; a provider's needs none. A local model is being
 * checked while a check runs from the page, and for the first hour after its
 * backend was added unless a check since refused it.
 */
export function admissionWords(model: string, backend: Backend, listed: CatalogueModel | undefined, records: AdmissionRecord[] | null, at: { now: number; checking: boolean }): Admission {
  if (backend.locality === "remote") return { tone: "neutral", words: "not needed for a provider", detail: null };
  if (at.checking) return { tone: "caution", words: "being checked", detail: null };
  // a record from before the backend was added again is another backend's
  const since = backend.added_at ?? 0;
  const mine = (records ?? []).filter((r) => r.backend === backend.id && r.model === model && r.at >= since).sort((a, b) => b.at - a.at);
  const flag = listed?.admitted;
  if (flag === true || (typeof flag !== "boolean" && mine[0]?.passed === true)) {
    const passed = mine.find((r) => r.passed);
    return { tone: "ok", words: passed ? `admitted ${onDay(passed.at)}` : "admitted", detail: null };
  }
  if (mine[0] && !mine[0].passed) {
    const failed = failedChecks(mine[0]);
    return { tone: "blocked", words: `refused on ${onDay(mine[0].at)}`, detail: failed.length > 0 ? `failed ${listWords(failed)}` : null };
  }
  if (backend.added_at !== undefined && at.now - backend.added_at < CHECKING_MS) return { tone: "caution", words: "being checked", detail: null };
  return { tone: "caution", words: "not admitted yet", detail: null };
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

/** A backend where a station goes: its first model, or ChatGPT through the subscription it uses. */
export function destinationWords(b: Backend, system = false): string {
  if (b.builtin === true) return system ? "The install's ChatGPT subscription" : "Each person's own ChatGPT subscription";
  return b.models[0] ?? b.id;
}

export interface PurposeLine {
  purpose: string;
  station: string;
  carries: string;
  goesTo: string;
  locality: Backend["locality"] | null;
  allowed: string | null;
  /** Whether another backend may take it, with or without an acknowledgement. */
  movable: boolean;
}

/** Where each station goes; `system` says the ChatGPT backend is the install's subscription, on a desk that signs nobody in. */
export function purposeLines(purposes: PurposeRow[], backends: Backend[], system = false): PurposeLine[] {
  return purposes.map((p) => {
    const b = backends.find((x) => x.id === p.backend);
    const allowed = p.acknowledged ? `allowed by ${p.acknowledged.by}${p.acknowledged.at ? ` on ${onDay(p.acknowledged.at)}` : ""}` : null;
    return {
      purpose: p.purpose,
      station: stationOf(p.purpose),
      carries: p.content === "catalog" ? "catalogue" : p.content,
      goesTo: !b ? "nowhere yet" : b.builtin === true ? destinationWords(b, system) : `${destinationWords(b)}, ${b.locality === "local" ? "in your systems" : "a provider"}`,
      locality: b?.locality ?? null,
      allowed,
      movable: targets(p, backends).length > 0,
    };
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
    const next = backends.find((x) => x.id !== b.id && x.builtin !== true && x.locality === "local" && x.models.length > 0);
    out.push(
      next
        ? `The ${one ? "station it answered goes to its" : "stations it answered go to their"} default instead, ${next.models[0]} in your systems: ${listWords(stations)}.`
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
