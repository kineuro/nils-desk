// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's models (record 25): the choices Add a model offers a
// person, by what they may do there and what Kvasir serves, and the card of
// each model Kvasir holds, which says little: where it runs in a few words
// with the rest as a hover title, one tag, and how many stations it answers.
// The models Kvasir downloads have cards of their own, and the subscription
// its own card.

import {
  admissionTitle,
  admissionWords,
  answersWords,
  countedStations,
  MARKS,
  modelOf,
  onRuntime,
  providerName,
  runtimeOfBackend,
  shownBackends,
  stationOf,
  tokensWords,
  type CatalogueModel,
  type Mark,
  type Tone,
  type Viewer,
} from "./gateway";
import type { AdmissionRecord, Backend, LocalStatus, PurposeRow, Subscription } from "./kvasir";
import { downloadChoiceWords } from "./local";
import { stationsOf, statusTag } from "./modelserver";

/** Where a model comes from, as Add a model asks it first; a model server lists what it serves (record 47). */
export type Choice = "download" | "server" | "provider" | "subscription";

/**
 * The choices Add a model offers, in order: downloading to this machine where
 * Kvasir serves its local models, a model server of yours and a provider, each
 * for Kvasir: Work; and a ChatGPT subscription of one's own, for the assistant
 * with Kvasir: See, where Kvasir offers one (the install's where nobody signs in).
 */
export function addChoices(viewer: Viewer, at: { local: LocalStatus | null | undefined; subscription: Subscription | null }): Choice[] {
  const out: Choice[] = [];
  if (viewer.work && at.local) out.push("download");
  if (viewer.work) out.push("server", "provider");
  if (at.subscription && (at.subscription.for === "system" ? viewer.work || viewer.subscribes : viewer.subscribes)) out.push("subscription");
  return out;
}

/** A choice as the dialog draws it: the mark of where the model runs, its title and what it means for the prompts. */
export function choiceWords(c: Choice, at: { local: LocalStatus | null | undefined; subscription: Subscription | null }): { mark: Mark; title: string; words: string } {
  if (c === "download") return { mark: { icon: "update", tone: "brand" }, title: "Download it to this machine", words: downloadChoiceWords(at.local?.runtime) };
  if (c === "server") return { mark: MARKS.server, title: "A model server", words: "Kvasir, SGLang, vLLM or Ollama · stays in your systems" };
  if (c === "provider") return { mark: MARKS.provider, title: "A provider", words: "With your key · leaves your systems" };
  const name = at.subscription?.name ?? "ChatGPT";
  const mark: Mark = { icon: "key", tone: "caution" };
  return at.subscription?.for === "system"
    ? { mark, title: `The install's ${name} subscription`, words: `A ${name} plan · every conversation here` }
    : { mark, title: `Your own ${name} subscription`, words: `Your ${name} plan · only your conversations` };
}

/** A card's one tag: a state carries a dot, where prompts go carries none, and the detail behind it is its hover title. */
export interface CardTag {
  tone: Tone;
  words: string;
  dot: boolean;
  title: string | null;
}

/** The card of one model Kvasir holds. */
export interface ModelCard {
  key: string;
  kind: "runtime" | "server" | "provider";
  backend: Backend;
  model: string;
  /** Whether it is its backend's first model, where the backend's check, key and removal sit. */
  first: boolean;
  mark: Mark;
  name: string;
  /** Where it runs, in a few words. */
  where: string;
  /** The rest of what is known of it, as the hover title of where it runs. */
  facts: string | null;
  tag: CardTag;
  answers: { words: string; title: string | null } | null;
}

const KINDS = { runtime: 0, server: 1, provider: 2 } as const;

const facts = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;

/**
 * Every model Kvasir holds, as cards: this machine's llama.cpp first, then the
 * servers of yours, then the providers. A model on llama.cpp that one of the
 * models Kvasir downloads is serving has that model's card, and is not drawn
 * twice. Where a server answers, which runtime runs it and a provider's key
 * are said to Kvasir: Work alone.
 */
export function backendCards(
  backends: Backend[],
  at: { viewer: Viewer; catalogue: CatalogueModel[]; admissions: AdmissionRecord[] | null; purposes: PurposeRow[] | null; now: number; checking: string | null; drawn: string[] },
): ModelCard[] {
  const work = at.viewer.work;
  const cards = shownBackends(backends).held.filter((b) => b.server !== true).flatMap((b) =>
    b.models
      .map((model, i) => ({ model, first: i === 0 }))
      .filter(({ model }) => !(onRuntime(b) && at.drawn.includes(model)))
      .map(({ model, first }): ModelCard => {
        const listed = modelOf(b, model, at.catalogue);
        const tokens = tokensWords(listed);
        const admission = admissionWords(model, b, listed, at.admissions, { now: at.now, checking: at.checking === b.id });
        const admitted: CardTag = { tone: admission.tone, words: admission.words, dot: true, title: admissionTitle(admission) };
        const address = work ? (b.base_url ?? null) : null;
        const base = { key: `${b.id}/${model}`, backend: b, model, first, name: model, answers: answersWords(b.id, at.purposes) };
        if (onRuntime(b)) {
          const tag: CardTag =
            b.health.warming === true ? { tone: "caution", words: "warming", dot: true, title: null } : admission.tone !== "ok" ? admitted : { ...admitted, words: "serving" };
          return { ...base, kind: "runtime", mark: MARKS.runtime, where: "This machine", facts: facts(["llama.cpp", tokens]), tag };
        }
        if (b.locality === "local") {
          return { ...base, kind: "server", mark: MARKS.server, where: "Your server", facts: facts(work ? [runtimeOfBackend(b, at.admissions), tokens, address] : [tokens]), tag: admitted };
        }
        const key = b.credential === true ? "key kept by Kvasir" : b.credential === false ? "no key kept" : null;
        const tag: CardTag = b.credential === false ? { tone: "blocked", words: "no key", dot: true, title: null } : { tone: "caution", words: "leaves your systems", dot: false, title: null };
        return { ...base, kind: "provider", mark: MARKS.provider, where: providerName(b), facts: facts(work ? [key, address] : []), tag };
      }),
  );
  return cards.sort((x, y) => KINDS[x.kind] - KINDS[y.kind]);
}

/** Record 47: one model of a server's card, with where it stands on the server, its admission and the stations it answers. */
export interface ServerModel {
  id: string;
  aliases: string[];
  status: { tone: Tone; words: string } | null;
  tag: CardTag;
  answers: { words: string; title: string | null } | null;
}

/** Record 47: a model server Kvasir holds as one backend, drawn as one card listing its models. */
export interface ServerCard {
  key: string;
  backend: Backend;
  name: string;
  mark: Mark;
  where: string;
  facts: string | null;
  models: ServerModel[];
}

/** Record 47: every model server Kvasir holds, one card each; where it answers and its streams are said to Kvasir: Work alone. */
export function serverCards(backends: Backend[], at: { viewer: Viewer; catalogue: CatalogueModel[]; admissions: AdmissionRecord[] | null; purposes: PurposeRow[] | null; now: number; checking: string | null }): ServerCard[] {
  return shownBackends(backends)
    .held.filter((b) => b.server === true)
    .map((b) => ({
      key: `server/${b.id}`,
      backend: b,
      name: b.id,
      mark: MARKS.server,
      where: "Model server",
      facts: facts(at.viewer.work ? [b.base_url ?? null, b.concurrency ? `${b.concurrency} streams` : null] : []),
      models: b.models.map((model): ServerModel => {
        const entry = b.entries?.find((e) => e.id === model);
        const admission = admissionWords(model, b, modelOf(b, model, at.catalogue), at.admissions, { now: at.now, checking: at.checking === b.id });
        const tokens = tokensWords(modelOf(b, model, at.catalogue));
        return {
          id: model,
          aliases: entry?.aliases ?? [],
          status: statusTag(entry?.status),
          tag: { tone: admission.tone, words: admission.words, dot: true, title: facts([admissionTitle(admission), tokens]) },
          answers: at.purposes === null ? null : countedStations(stationsOf(b, model, at.purposes).map((p) => stationOf(p.purpose))),
        };
      }),
    }));
}
