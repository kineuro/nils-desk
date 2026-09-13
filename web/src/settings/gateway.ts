// SPDX-License-Identifier: AGPL-3.0-only
// The Gateway and models page's words (Wave 4c sections 8.3 to 8.6), as the
// chosen design draws them: the gateway's health, the machine's card and
// what it can serve, each model with where its prompts go and whether a
// local one passed its admission, and what may leave, purpose by purpose.
// Every word is read from the gateway's doors or the supervisor's install.

import type { AdmissionRecord, Backend, PurposeRow } from "./kvasir";
import { opening } from "./kvasir";
import type { Install } from "./supervise";

export type Tone = "ok" | "caution" | "blocked" | "neutral";

/** A model as the gateway's catalogue lists it; a local model is listed once admitted. */
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

/** The gateway's health for the head of the page: warm or warming, and how busy its streams are. */
export function gatewayHealth(backends: Backend[]): { tone: Tone; words: string; streams: string | null } {
  if (backends.length === 0) return { tone: "caution", words: "no backend", streams: null };
  const warming = backends.some((b) => b.health.warming === true);
  const number = (v: unknown) => (typeof v === "number" ? v : 0);
  const running = backends.reduce((n, b) => n + number(b.health["running"]), 0);
  const of = backends.reduce((n, b) => n + number(b.health["concurrency"]), 0);
  return { tone: warming ? "caution" : "ok", words: warming ? "warming" : "warm", streams: of > 0 ? `${running} of ${of} streams busy` : null };
}

/** The card this machine has and what it can serve, in the words setup uses. */
export function machineWords(install: Install | null): { card: string | null; advice: string[] } {
  const card = install?.machine.card ?? null;
  return { card: card ? `${card.name}, ${Math.round(card.memory_gb)} GB` : null, advice: install?.machine.advice ?? [] };
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

/** A model's admission: a local model is offered only once it passes the suite for the runtime serving it; a provider's needs none. */
export function admissionWords(model: string, backend: Backend, listed: CatalogueModel | undefined, records: AdmissionRecord[] | null): { tone: Tone; words: string } {
  if (backend.locality === "remote") return { tone: "neutral", words: "not needed for a provider" };
  const mine = (records ?? []).filter((r) => r.backend === backend.id && r.model === model).sort((a, b) => b.at - a.at);
  if (listed?.admitted === true || (listed === undefined && mine[0]?.passed === true)) {
    const passed = mine.find((r) => r.passed);
    return { tone: "ok", words: passed ? `admitted ${onDay(passed.at)}` : "admitted" };
  }
  if (mine[0] && !mine[0].passed) return { tone: "blocked", words: `did not pass on ${onDay(mine[0].at)}` };
  return { tone: "caution", words: "not admitted yet" };
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

/** What may leave, purpose by purpose. */
export function purposeLines(purposes: PurposeRow[], backends: Backend[]): PurposeLine[] {
  return purposes.map((p) => {
    const b = backends.find((x) => x.id === p.backend);
    const allowed = p.acknowledged ? `allowed by ${p.acknowledged.by}${p.acknowledged.at ? ` on ${onDay(p.acknowledged.at)}` : ""}` : null;
    return {
      purpose: p.purpose,
      station: stationOf(p.purpose),
      carries: p.content === "catalog" ? "catalogue" : p.content,
      goesTo: b ? `${b.models[0] ?? b.id}, ${b.locality === "local" ? "in your systems" : "a provider"}` : "nowhere yet",
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
