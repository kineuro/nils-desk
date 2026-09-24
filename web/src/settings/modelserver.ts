// SPDX-License-Identifier: AGPL-3.0-only
// A model server on the Kvasir page (record 47, D1): a Kvasir serving a card,
// or any OpenAI compatible server, added by its address and key. The key goes
// once to Kvasir's credential door under a name the dialog makes up, and is
// named by that reference after (R4); the desk keeps nothing of it. Kvasir
// lists the server's models with their specs and loaded or cold state, the
// admin ticks some, and Kvasir admits them one by one on the server's one
// backend. The page shows the server as one card, each model removable, and a
// station's drawer picks a backend and a model.

import { listWords, stationModel, stationOf, type Tone } from "./gateway";
import { plainAddress } from "./adding";
import { type Backend, KvasirError, type Offer, type Offered, type PurposeRow, type ServedStatus, type Ticked } from "./kvasir";

const count = (n: number) => n.toLocaleString("en-GB");

/** A name for a key sealed only for this add, which Kvasir takes as a key reference by its prefix: Kvasir moves it under the backend's own id once a model is held, and the dialog forgets it otherwise. */
export function stageName(random: () => number = Math.random): string {
  return `server-staging:${Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0")}`;
}

/** Why the dialog cannot list the server's models yet, or null when it can. */
export function listRefusal(address: string): string | null {
  const a = plainAddress(address);
  if (!a) return "a server has an address";
  if (!/^https?:\/\/\S+$/u.test(a)) return "an address starts with http:// or https://";
  return null;
}

/** Whether a listing's refusal means the server lists nothing Kvasir can read (an older OpenAI compatible server, or a Kvasir before record 47), so the admin types the model. */
export function listsNothing(e: unknown): boolean {
  if (!(e instanceof KvasirError)) return false;
  const code = (e.body.error as { code?: unknown } | undefined)?.code;
  if (e.status === 404 && code === "no_such_door") return true;
  return e.status === 502 && code === "backend" && !/did not answer:/u.test(e.message);
}

/** A model's specs in one line, each only where the server says it. */
export function specWords(o: Offered): string {
  return [
    o.context_length ? `${count(o.context_length)} context` : null,
    o.max_output_tokens ? `${count(o.max_output_tokens)} out` : null,
    o.max_concurrent_requests ? `${count(o.max_concurrent_requests)} at once` : null,
    o.reasoning ? "reasoning" : null,
    o.tools ? "tools" : null,
    o.vision ? "vision" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Where a model stands on its server, as a tag; null where the server does not say. */
export function statusTag(status: ServedStatus | null | undefined): { tone: Tone; words: string } | null {
  if (status === "loaded") return { tone: "ok", words: "loaded" };
  if (status === "loading") return { tone: "caution", words: "loading" };
  if (status === "cold") return { tone: "neutral", words: "cold" };
  return null;
}

/** Whether a model may be ticked: one a backend here holds already is not offered again. */
export function tickable(o: Offered): boolean {
  return o.held_by === null;
}

/** What the server says of its card: the model loaded now, and how long its last swap took. */
function loadedOf(offer: Offer): { loaded: string | null; swap: number | null } {
  const s = offer.server ?? {};
  const loaded = typeof s.loaded === "string" ? s.loaded : (offer.models.find((m) => m.status === "loaded")?.id ?? null);
  const swap = typeof s.last_swap_seconds === "number" ? s.last_swap_seconds : null;
  return { loaded, swap };
}

/** Said before Admit where a ticked model is cold: asking it loads it on the server, which takes minutes and pauses the model loaded now. */
export function coldWords(offer: Offer, ticked: string[]): string | null {
  const cold = offer.models.filter((m) => ticked.includes(m.id) && (m.status === "cold" || m.status === "loading"));
  if (cold.length === 0) return null;
  const { loaded, swap } = loadedOf(offer);
  const seconds = Math.max(...cold.map((m) => m.swap_in_seconds ?? swap ?? 0));
  const took = seconds > 0 ? ` (about ${Math.max(1, Math.round(seconds / 60))} min)` : "";
  const pauses = loaded && !ticked.includes(loaded) ? ` and pauses ${loaded}` : "";
  return `${listWords(cold.map((m) => m.id))} ${cold.length === 1 ? "is" : "are"} cold: asking loads it on the server${took}${pauses}.`;
}

const TRIED: Record<string, string> = {
  unreachable: "nothing answered",
  key_refused: "key refused",
  no_model: "no such model",
  refused_for_now: "refuses for now",
};

/** One ticked model's result as Kvasir reports it, as a tag with the detail as its hover title. */
export function resultTag(t: Ticked): { tone: Tone; words: string; title: string | null } {
  if (!t.answered) return { tone: "blocked", words: TRIED[t.error?.kind ?? ""] ?? "did not answer", title: t.error?.message ?? null };
  if (t.admitted === true) return { tone: "ok", words: "admitted", title: t.record !== null ? `admission record ${t.record}` : null };
  if (t.admitted === false) return { tone: "blocked", words: "refused by admission", title: t.record !== null ? `admission record ${t.record}` : null };
  return { tone: "ok", words: "held", title: null };
}

/** What an admission did, said once the dialog closes. */
export function admittedWords(backend: string | null, results: Ticked[]): string {
  const ok = results.filter((t) => t.answered).map((t) => t.id);
  if (!backend || ok.length === 0) return "No model was added.";
  const refused = results.filter((t) => t.admitted === false).map((t) => t.id);
  const out = [`${listWords(ok)} ${ok.length === 1 ? "is" : "are"} on ${backend}.`];
  if (refused.length > 0) out.push(`Admission refused ${listWords(refused)}.`);
  return out.join(" ");
}

/** The stations one model of a server answers. */
export function stationsOf(b: Backend, model: string, purposes: PurposeRow[]): PurposeRow[] {
  return purposes.filter((p) => p.backend === b.id && stationModel(p, b) === model);
}

/** What removing one model of a server lets go, said before it goes. */
export function modelRemovalWords(b: Backend, model: string, purposes: PurposeRow[] | null): string[] {
  const last = b.models.length <= 1;
  const out = [`Kvasir lets go of ${model} on ${b.id}.`];
  if (last) out.push(`It is the last model there, so ${b.id} goes with its key.`);
  const stations = stationsOf(b, model, purposes ?? []).map((p) => stationOf(p.purpose));
  if (stations.length > 0) {
    const next = b.models.find((m) => m !== model);
    out.push(next && !last ? `${listWords(stations)} ${stations.length === 1 ? "goes" : "go"} to ${next} instead.` : `${listWords(stations)} ${stations.length === 1 ? "goes" : "go"} to the default instead.`);
  }
  return out;
}
