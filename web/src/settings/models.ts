// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's models (record 25): the choices Add a model offers a
// person, by what they may do there and what Kvasir serves, and the card of
// each model Kvasir holds, with where it runs, its admission or where its
// prompts go, and the stations it answers. The models Kvasir downloads have
// cards of their own, and the subscription its own card.

import {
  admissionWords,
  answersWords,
  MARKS,
  modelOf,
  onRuntime,
  providerName,
  runtimeOfBackend,
  shownBackends,
  tokensWords,
  type CatalogueModel,
  type Mark,
  type Tone,
  type Viewer,
} from "./gateway";
import type { AdmissionRecord, Backend, LocalStatus, PurposeRow, Subscription } from "./kvasir";
import { downloadChoiceWords } from "./local";

/** Where a model comes from, as Add a model asks it first. */
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
  if (c === "server") return { mark: MARKS.server, title: "A model server of yours", words: "SGLang, vLLM or Ollama, on this machine or another of yours. Prompts stay in your systems." };
  if (c === "provider") return { mark: MARKS.provider, title: "A provider", words: "A company that serves models, with your key. Prompts leave your systems." };
  const name = at.subscription?.name ?? "ChatGPT";
  const mark: Mark = { icon: "key", tone: "caution" };
  return at.subscription?.for === "system"
    ? { mark, title: `The install's ${name} subscription`, words: `Sign in with a ${name} plan for this install. It answers every conversation on this desk, for the stations an admin lets go to ${name}.` }
    : { mark, title: `Your own ${name} subscription`, words: `Sign in with your ${name} plan. It answers only your conversations, for the stations an admin lets go to ${name}.` };
}

/** A tag on a card, with the dot of a state or without, as where its prompts go. */
export interface CardTag {
  tone: Tone;
  words: string;
  dot: boolean;
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
  meta: string;
  tags: CardTag[];
  /** Said beside the tags: when it was admitted. */
  aside: string | null;
  /** The checks a refused model failed. */
  detail: string | null;
  answers: string | null;
  /** Where the backend answers, for a person with Kvasir: Work. */
  address: string | null;
}

const KINDS = { runtime: 0, server: 1, provider: 2 } as const;

/**
 * Every model Kvasir holds, as cards: this machine's llama.cpp first, then the
 * servers of yours, then the providers. A model on llama.cpp that one of the
 * models Kvasir downloads is serving has that model's card, and is not drawn
 * twice. Where a server runs, and which runtime, is said to Kvasir: Work alone.
 */
export function backendCards(
  backends: Backend[],
  at: { viewer: Viewer; catalogue: CatalogueModel[]; admissions: AdmissionRecord[] | null; purposes: PurposeRow[] | null; now: number; checking: string | null; drawn: string[] },
): ModelCard[] {
  const cards = shownBackends(backends).held.flatMap((b) =>
    b.models
      .map((model, i) => ({ model, first: i === 0 }))
      .filter(({ model }) => !(onRuntime(b) && at.drawn.includes(model)))
      .map(({ model, first }): ModelCard => {
        const listed = modelOf(b, model, at.catalogue);
        const tokens = tokensWords(listed);
        const admission = admissionWords(model, b, listed, at.admissions, { now: at.now, checking: at.checking === b.id });
        const base = { key: `${b.id}/${model}`, backend: b, model, first, name: model, answers: answersWords(b.id, at.purposes), address: at.viewer.work ? (b.base_url ?? null) : null };
        const join = (parts: (string | null)[]) => parts.filter(Boolean).join(" · ");
        if (onRuntime(b)) {
          const warming = b.health.warming === true;
          const tags: CardTag[] = [{ tone: warming ? "caution" : "ok", words: warming ? "warming" : "serving", dot: true }];
          if (admission.tone !== "ok") tags.push({ tone: admission.tone, words: admission.words, dot: true });
          return { ...base, kind: "runtime", mark: MARKS.runtime, meta: join(["This machine", "llama.cpp", tokens]), tags, aside: admission.tone === "ok" ? admission.words : null, detail: admission.detail };
        }
        if (b.locality === "local") {
          const meta = at.viewer.work ? join(["Your server", runtimeOfBackend(b, at.admissions), tokens]) : join(["A server in your systems", tokens]);
          return { ...base, kind: "server", mark: MARKS.server, meta, tags: [{ tone: admission.tone, words: admission.words, dot: true }], aside: null, detail: admission.detail };
        }
        const key = !at.viewer.work ? null : b.credential === true ? "key kept by Kvasir" : b.credential === false ? "no key kept" : null;
        return { ...base, kind: "provider", mark: MARKS.provider, meta: join([`${providerName(b)}, a provider`, key]), tags: [{ tone: "caution", words: "leaves your systems", dot: false }], aside: null, detail: null };
      }),
  );
  return cards.sort((x, y) => KINDS[x.kind] - KINDS[y.kind]);
}
