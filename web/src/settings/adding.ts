// SPDX-License-Identifier: AGPL-3.0-only
// Adding a model on the Kvasir page (record 23): where the model is and the
// addresses offered, what the dialog needs before it finds a server's models,
// tests one or adds it, and the words for each way a model did not answer. A
// model is added only after a test that answered for exactly what the dialog
// shows; anything changed asks for the test again.

import type { BackendDescription, BackendKind, Locality, TriedModel } from "./kvasir";

export type Where = "here" | "elsewhere" | "provider";

export const WHERE: { id: Where; title: string; words: string }[] = [
  { id: "here", title: "A model server on this machine", words: "Such as SGLang, vLLM or Ollama. Prompts stay in your systems." },
  { id: "elsewhere", title: "A model server on another machine of yours", words: "Reached at its address on your network. Prompts stay in your systems." },
  { id: "provider", title: "A provider", words: "A company that serves models, with your key. Prompts leave your systems." },
];

/** Where a model server on this machine most often answers: SGLang's own port. */
export const HERE = "http://127.0.0.1:30000/v1";

export const CONTEXT_WINDOW = 32_768;
export const MAX_TOKENS = 4_096;

export interface Preset {
  id: string;
  name: string;
  baseUrl: string;
  kind: BackendKind;
}

/** The providers offered by name, then another address, typed. */
export const PRESETS: Preset[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", kind: "openai-completions" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", kind: "openai-completions" },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.io/v1", kind: "openai-completions" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com", kind: "anthropic-messages" },
  { id: "other", name: "Another OpenAI compatible address", baseUrl: "", kind: "openai-completions" },
];

/** What the dialog holds, as typed. */
export interface Draft {
  where: Where;
  /** The provider chosen, by its preset's id. */
  preset: string;
  baseUrl: string;
  /** A model server that takes a key. */
  keyed: boolean;
  key: string;
  model: string;
  contextWindow: string;
  maxTokens: string;
}

/** A fresh draft for where the model is: this machine's address, another machine's typed, or the first provider's. */
export function draft(where: Where): Draft {
  return {
    where,
    preset: PRESETS[0].id,
    baseUrl: where === "here" ? HERE : where === "provider" ? PRESETS[0].baseUrl : "",
    keyed: false,
    key: "",
    model: "",
    contextWindow: String(CONTEXT_WINDOW),
    maxTokens: String(MAX_TOKENS),
  };
}

/** A provider picked: its address, and neither another provider's key nor its model name. */
export function withPreset(d: Draft, id: string): Draft {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[PRESETS.length - 1];
  return { ...d, preset: p.id, baseUrl: p.baseUrl, key: "", model: "" };
}

export function localityOf(where: Where): Locality {
  return where === "provider" ? "remote" : "local";
}

/** How Kvasir speaks to it: Anthropic's own messages, or the OpenAI compatible shape every other offered server speaks. */
export function kindFor(d: Draft): BackendKind {
  return d.where === "provider" ? (PRESETS.find((p) => p.id === d.preset)?.kind ?? "openai-completions") : "openai-completions";
}

/** Whether the dialog asks for a key: always for a provider, and for a server that needs one. */
export function asksKey(d: Draft): boolean {
  return d.where === "provider" || d.keyed;
}

/** The address as Kvasir holds it: trimmed, and without a slash at its end. */
export function plainAddress(address: string): string {
  return address.trim().replace(/\/+$/u, "");
}

/** What the dialog says under the address. */
export function addressHint(d: Draft): string {
  if (d.where === "here") return "Where the model server on this machine answers; change the port if it listens on another.";
  if (d.where === "elsewhere") return "The server's address as Kvasir reaches it, most often ending in /v1.";
  if (d.preset === "other") return "The provider's OpenAI compatible address, most often ending in /v1.";
  return "The provider's address. Change it only if the provider gave you another.";
}

/** A whole number of tokens as typed, or null. */
export function wholeTokens(typed: string): number | null {
  const t = typed.trim();
  if (!/^\d+$/u.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Why the dialog cannot ask the server for its models yet, or null when it can. */
export function findRefusal(d: Draft): string | null {
  const address = plainAddress(d.baseUrl);
  if (!address) return d.where === "provider" ? "a provider has an address" : "a server has an address";
  if (!/^https?:\/\/\S+$/u.test(address)) return "an address starts with http:// or https://";
  if (asksKey(d) && !d.key.trim()) return d.where === "provider" ? "a provider takes its key" : "the key is empty; untick It needs a key if the server takes none";
  return null;
}

/** Why the dialog cannot test the model yet, or null when it can. */
export function testRefusal(d: Draft): string | null {
  const find = findRefusal(d);
  if (find) return find;
  if (!d.model.trim()) return "a model has the name the server knows it by";
  if (wholeTokens(d.contextWindow) === null) return "the context window is a whole number of tokens";
  if (wholeTokens(d.maxTokens) === null) return "the longest answer is a whole number of tokens";
  return null;
}

/** What Kvasir is asked: the server, its key where the dialog asks one, and the model with its numbers where one is named. */
export function description(d: Draft, withModel: boolean): BackendDescription {
  const out: BackendDescription = { kind: kindFor(d), baseUrl: plainAddress(d.baseUrl), locality: localityOf(d.where) };
  if (asksKey(d) && d.key.trim()) out.key = d.key.trim();
  if (withModel) out.models = [{ id: d.model.trim(), contextWindow: wholeTokens(d.contextWindow) ?? CONTEXT_WINDOW, maxTokens: wholeTokens(d.maxTokens) ?? MAX_TOKENS }];
  return out;
}

/** Exactly what a test asked Kvasir, to compare with what the dialog shows now. */
export function fingerprint(d: Draft): string {
  return JSON.stringify(description(d, true));
}

/** A test that ran: what it asked, and what the model did. */
export interface Tested {
  print: string;
  model: TriedModel;
}

/** Whether Add is offered: a test answered for exactly the inputs shown. */
export function addable(d: Draft, tested: Tested | null): boolean {
  return tested !== null && tested.model.answered && tested.print === fingerprint(d) && testRefusal(d) === null;
}

/** Whether something changed since the last test, which then asks to be run again. */
export function stale(d: Draft, tested: Tested | null): boolean {
  return tested !== null && tested.print !== fingerprint(d);
}

/** The words a person reads for what the server lists. */
export function listedWords(listed: string[] | null): string {
  if (listed === null) return "It does not list its models, so type the name it knows the model by.";
  if (listed.length === 0) return "It lists no model, so type the name it knows the model by.";
  return listed.length === 1 ? "It lists one model." : `It lists ${listed.length.toLocaleString("en-GB")} models.`;
}

/** The model the picker opens on: the one typed, where the server lists it, else the first it lists. */
export function pickFrom(listed: string[], current: string): string {
  return listed.includes(current.trim()) ? current.trim() : (listed[0] ?? "");
}

const TRIED: Record<string, string> = {
  unreachable: "Nothing answered at that address.",
  key_refused: "The key was refused.",
  no_model: "It has no model by that name.",
  refused_for_now: "It refuses for now: too many requests, or no credit left.",
};

/** What a test found for one model: each way it did not answer in words a person can act on, any other way in the server's own. */
export function triedWords(m: TriedModel): { answered: boolean; words: string; detail: string | null } {
  if (m.answered) return { answered: true, words: `${m.id} answered.`, detail: null };
  const said = TRIED[m.error?.kind ?? ""];
  if (said) return { answered: false, words: said, detail: m.error?.message || null };
  return { answered: false, words: m.error?.message || `${m.id} did not answer.`, detail: null };
}

/** What each model said, where Kvasir refused an add because one did not answer. */
export function refusedWords(models: TriedModel[]): string[] {
  return models.map((m) => (m.answered ? `${m.id} answered.` : `${m.id} did not answer. ${triedWords(m).words}`));
}

/** What an add did, said once the dialog closes. */
export function addedWords(model: string, backend: string, locality: Locality): string {
  const as = backend === model ? `${model} is added.` : `${model} is added as ${backend}.`;
  return locality === "local"
    ? `${as} Kvasir checks it with its admission suite before the assistant uses it, which takes a few minutes.`
    : `${as} A station goes to it once you move one there, under Where each station goes.`;
}

/** Said in the dialog for a model in your systems, before it is added. */
export const CHECKED_FIRST = "Kvasir checks a model in your systems with its admission suite before the assistant uses it, which takes a few minutes after it is added.";
