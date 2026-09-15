// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's models (record 25): the choices Add a model offers by what
// a person may do and what Kvasir serves, each choice's words, and the cards
// of the models Kvasir holds, in their order and with their words.

import { describe, expect, it } from "vitest";
import type { Viewer } from "./gateway";
import type { AdmissionRecord, Backend, LocalStatus, PurposeRow, Subscription } from "./kvasir";
import { addChoices, backendCards, choiceWords } from "./models";

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  provider: "chatgpt",
  name: "ChatGPT",
  for: "person",
  state: "signed_out",
  user_code: null,
  verification_uri: null,
  expires_at: null,
  since: null,
  model: null,
  models: [],
  error: null,
  ...over,
});
const local: LocalStatus = { location: "/srv/models", free_bytes: null, token: false, models: [], runtime: null };

const admin: Viewer = { work: true, subscribes: true, system: false };
const worker: Viewer = { work: true, subscribes: false, system: false };
const person: Viewer = { work: false, subscribes: true, system: false };
const seer: Viewer = { work: false, subscribes: false, system: false };
const alone: Viewer = { work: true, subscribes: true, system: true };

describe("Add a model's choices", () => {
  it("offers a person with Kvasir: Work a download where Kvasir serves its local models, a server and a provider, and a subscription of their own with the assistant", () => {
    expect(addChoices(admin, { local, subscription: sub() })).toEqual(["download", "server", "provider", "subscription"]);
    expect(addChoices(worker, { local, subscription: sub() })).toEqual(["download", "server", "provider"]);
    expect(addChoices(admin, { local: null, subscription: null })).toEqual(["server", "provider"]);
    expect(addChoices(admin, { local: undefined, subscription: sub() })).toEqual(["server", "provider", "subscription"]);
  });

  it("offers a person who may use the assistant and see Kvasir only a subscription of their own, and anyone else nothing", () => {
    expect(addChoices(person, { local: undefined, subscription: sub() })).toEqual(["subscription"]);
    expect(addChoices(person, { local: undefined, subscription: null })).toEqual([]);
    expect(addChoices(seer, { local: undefined, subscription: sub() })).toEqual([]);
  });

  it("offers the install's subscription where nobody signs in", () => {
    expect(addChoices(alone, { local, subscription: sub({ for: "system" }) })).toEqual(["download", "server", "provider", "subscription"]);
  });

  it("says each choice as the dialog draws it", () => {
    const runtime = { build: "b10964", variant: "ubuntu-vulkan-x64", reachable: true, serving: null };
    expect(choiceWords("download", { local: { ...local, runtime }, subscription: null })).toEqual({
      mark: { icon: "update", tone: "brand" },
      title: "Download it to this machine",
      words: "A GGUF model from the Hugging Face Hub, started by Kvasir on llama.cpp here. Prompts stay in your systems.",
    });
    expect(choiceWords("server", { local, subscription: null })).toMatchObject({ mark: { icon: "engine", tone: "neutral" }, title: "A model server of yours" });
    expect(choiceWords("provider", { local, subscription: null }).words).toBe("A company that serves models, with your key. Prompts leave your systems.");
    expect(choiceWords("subscription", { local, subscription: sub() })).toEqual({
      mark: { icon: "key", tone: "caution" },
      title: "Your own ChatGPT subscription",
      words: "Sign in with your ChatGPT plan. It answers only your conversations, for the stations someone with Kvasir: Work sends to ChatGPT.",
    });
    expect(choiceWords("subscription", { local, subscription: sub({ for: "system" }) }).title).toBe("The install's ChatGPT subscription");
  });
});

describe("the cards of the models Kvasir holds", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const runtime: Backend = { id: "llama-cpp", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["Qwen3.6-27B-Q4_K_M"], health: { warming: false }, added_at: now - 7_200_000 };
  const server: Backend = { id: "sglang", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["fast", "small"], health: {} };
  const minimax: Backend = { id: "minimax", kind: "openai-completions", locality: "remote", provider: "minimax", credential: false, models: ["MiniMax-M3"], health: {} };
  const chatgpt: Backend = { id: "chatgpt", kind: "openai-codex-responses", locality: "remote", provider: "chatgpt", credential: null, models: [], health: {}, builtin: true };
  const passed: AdmissionRecord = { id: 1, backend: "llama-cpp", model: "Qwen3.6-27B-Q4_K_M", runtime: { name: "llama.cpp", version: "b10964", build: "" }, at: now - 3_600_000, passed: true };
  const purposes: PurposeRow[] = [{ purpose: "assistant.ask-help", app: "nils-assistant", content: "rows", kind: "foreground", backend: "llama-cpp", locality: "local", default: false, acknowledged: null, may_open_remote: "" }];
  const at = (viewer: Viewer, over: { drawn?: string[]; admissions?: AdmissionRecord[] } = {}) => ({ viewer, catalogue: [], admissions: over.admissions ?? [passed], purposes, now, checking: null, drawn: over.drawn ?? [] });

  it("puts this machine's llama.cpp first, then servers of yours, then providers, and leaves ChatGPT to its own card", () => {
    const cards = backendCards([minimax, chatgpt, server, runtime], at(admin));
    expect(cards.map((c) => [c.kind, c.name, c.first])).toEqual([
      ["runtime", "Qwen3.6-27B-Q4_K_M", true],
      ["server", "fast", true],
      ["server", "small", false],
      ["provider", "MiniMax-M3", true],
    ]);
    expect(cards[0]).toMatchObject({ meta: "This machine · llama.cpp", tags: [{ tone: "ok", words: "serving", dot: true }], answers: "answers ask-help" });
    expect(cards[0].aside).toMatch(/^admitted 15 Sept?$/u);
    expect(cards[1]).toMatchObject({ meta: "Your server", tags: [{ tone: "caution", words: "not admitted yet", dot: true }], answers: "answers no station yet" });
    expect(cards[3]).toMatchObject({ meta: "MiniMax, a provider · no key kept", tags: [{ tone: "caution", words: "leaves your systems", dot: false }] });
  });

  it("leaves out a model on llama.cpp that the card of a downloaded model draws", () => {
    expect(backendCards([runtime, server], at(admin, { drawn: ["Qwen3.6-27B-Q4_K_M"] })).map((c) => c.name)).toEqual(["fast", "small"]);
  });

  it("tags a model on llama.cpp that warms, or that Kvasir refused", () => {
    const [warming] = backendCards([{ ...runtime, health: { warming: true } }], at(person));
    expect(warming.tags[0]).toEqual({ tone: "caution", words: "warming", dot: true });
    const refused = { ...passed, passed: false, checks: [{ name: "tool_calls", passed: false }] };
    const [card] = backendCards([runtime], at(person, { admissions: [refused] }));
    expect(card.tags.map((t) => t.tone)).toEqual(["ok", "blocked"]);
    expect(card.detail).toBe("failed tool calls");
    expect(card.address).toBeNull();
  });
});
