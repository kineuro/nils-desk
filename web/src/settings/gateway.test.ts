// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's words: Kvasir's health, the machine's card, which
// backends show where, each model's line and admission, what a check found,
// what goes when a backend is removed, and where each station goes.

import { describe, expect, it } from "vitest";
import {
  admissionWords,
  checkWords,
  destinationWords,
  gatewayHealth,
  listWords,
  machineWords,
  modelMeta,
  modelOf,
  purposeLines,
  removalWords,
  shownBackends,
  stationOf,
  targets,
  usedFor,
  whereWords,
} from "./gateway";
import type { AdmissionRecord, Backend, PurposeRow } from "./kvasir";
import type { Install } from "./supervise";

const local: Backend = { id: "local", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["qwen38-27b"], health: { warming: false, running: 1, concurrency: 8 } };
const minimax: Backend = { id: "minimax", kind: "anthropic-messages", locality: "remote", provider: "minimax", credential: true, models: ["MiniMax-M3"], health: { warming: false, running: 0, concurrency: 4 } };
const chatgpt: Backend = { id: "chatgpt", kind: "openai-codex-responses", locality: "remote", provider: "chatgpt", credential: null, models: [], health: {}, builtin: true };

const purpose = (over: Partial<PurposeRow>): PurposeRow => ({
  purpose: "assistant.concierge",
  app: "assistant",
  content: "rows",
  kind: "foreground",
  backend: "local",
  locality: "local",
  default: true,
  acknowledged: null,
  may_open_remote: "with an acknowledgement that rows of the archive will leave the site",
  ...over,
});

const record = (over: Partial<AdmissionRecord>): AdmissionRecord => ({ id: 1, backend: "local", model: "qwen38-27b", runtime: { name: "sglang", version: "0.5.2", build: "" }, at: Date.parse("2026-09-15T10:00:00Z"), passed: true, ...over });

describe("Kvasir", () => {
  it("says whether it is warm and how busy its streams are", () => {
    expect(gatewayHealth([local, minimax])).toEqual({ tone: "ok", words: "warm", streams: "1 of 12 streams busy" });
    expect(gatewayHealth([{ ...local, health: { warming: true } }])).toEqual({ tone: "caution", words: "warming", streams: null });
    expect(gatewayHealth([])).toEqual({ tone: "caution", words: "no model yet", streams: null });
    expect(gatewayHealth([chatgpt])).toEqual({ tone: "caution", words: "no model yet", streams: null });
  });

  it("says the machine's card and what it can serve", () => {
    const install = { machine: { card: { name: "NVIDIA GeForce RTX 4090", memory_gb: 23.99 }, advice: ["A 27B model at 4 bit fits with room for the context."] } } as Install;
    expect(machineWords(install)).toEqual({ card: "NVIDIA GeForce RTX 4090, 24 GB", advice: ["A 27B model at 4 bit fits with room for the context."] });
    expect(machineWords(null)).toEqual({ card: null, advice: [] });
  });

  it("shows the models it holds in the table, and ChatGPT through subscriptions under Subscriptions", () => {
    expect(shownBackends([local, chatgpt, minimax])).toEqual({ held: [local, minimax], subscriptions: [chatgpt] });
    expect(shownBackends([])).toEqual({ held: [], subscriptions: [] });
  });
});

describe("a model", () => {
  it("says the context it takes, whether it reasons, and where its prompts go", () => {
    expect(modelMeta({ id: "qwen38-27b", contextWindow: 32768, reasoning: true }, "local")).toBe("32,768 tokens · reasoning");
    expect(modelMeta(undefined, "remote")).toBe("a provider's model");
    expect(modelMeta(undefined, "local")).toBe("");
    expect(whereWords("local")).toEqual({ tone: "ok", words: "stays in your systems" });
    expect(whereWords("remote")).toEqual({ tone: "caution", words: "leaves your systems" });
  });

  it("reads its facts from what Kvasir holds, and from the catalogue where Kvasir says nothing more", () => {
    const held = { ...local, entries: [{ id: "qwen38-27b", name: "Qwen", reasoning: true, context_window: 65536, max_tokens: 8192, admitted: false }] };
    expect(modelOf(held, "qwen38-27b", [])).toEqual({ id: "qwen38-27b", reasoning: true, contextWindow: 65536, backend: "local", locality: "local", admitted: false });
    expect(modelOf(local, "qwen38-27b", [{ id: "qwen38-27b", backend: "local", contextWindow: 32768 }])).toEqual({ id: "qwen38-27b", backend: "local", contextWindow: 32768 });
    expect(modelOf(local, "qwen38-27b", [{ id: "qwen38-27b", backend: "spare" }])).toBeUndefined();
  });

  it("says its admission from Kvasir's records: admitted, being checked, refused with the checks it failed, or not yet", () => {
    const now = Date.parse("2026-09-15T12:00:00Z");
    const day = new Date(Date.parse("2026-09-15T10:00:00Z")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const idle = { now, checking: false };
    expect(admissionWords("qwen38-27b", local, { id: "qwen38-27b", admitted: true }, [record({})], idle)).toEqual({ tone: "ok", words: `admitted ${day}`, detail: null });
    const refused = record({
      passed: false,
      checks: [
        { name: "tool_calls", passed: false },
        { name: "chat_template", passed: true },
        { name: "overflow", passed: false },
        { name: "stream_integrity", passed: null },
      ],
    });
    expect(admissionWords("qwen38-27b", local, undefined, [refused], idle)).toEqual({ tone: "blocked", words: `refused on ${day}`, detail: "failed tool calls and context overflow" });
    expect(admissionWords("qwen38-27b", local, undefined, [record({ passed: false })], idle)).toEqual({ tone: "blocked", words: `refused on ${day}`, detail: null });
    expect(admissionWords("qwen38-27b", local, undefined, [], idle)).toEqual({ tone: "caution", words: "not admitted yet", detail: null });
    // a backend added within the hour is being checked, and so is any model while a check runs
    const waiting = { id: "qwen38-27b", admitted: false };
    expect(admissionWords("qwen38-27b", { ...local, added_at: now - 20 * 60_000 }, waiting, [], idle).words).toBe("being checked");
    expect(admissionWords("qwen38-27b", { ...local, added_at: now - 2 * 3_600_000 }, waiting, [], idle).words).toBe("not admitted yet");
    expect(admissionWords("qwen38-27b", local, { id: "qwen38-27b", admitted: true }, [record({})], { now, checking: true }).words).toBe("being checked");
    // a refusal from before the backend was added again is not this backend's
    expect(admissionWords("qwen38-27b", { ...local, added_at: Date.parse("2026-09-15T11:30:00Z") }, undefined, [refused], idle).words).toBe("being checked");
    expect(admissionWords("MiniMax-M3", minimax, undefined, null, idle)).toEqual({ tone: "neutral", words: "not needed for a provider", detail: null });
  });

  it("says what a check found, model by model", () => {
    expect(checkWords([record({})])).toEqual({ passed: true, words: "qwen38-27b passed the admission suite, and the assistant may use it." });
    expect(checkWords([record({ passed: false, checks: [{ name: "enforced_schema", passed: false }, { name: "a_new_check", passed: false }] })])).toEqual({
      passed: false,
      words: "qwen38-27b did not pass the admission suite: it failed enforced schemas and a new check.",
    });
    expect(checkWords([])).toEqual({ passed: false, words: "Kvasir checked no model." });
  });

  it("says which stations use its backend", () => {
    const purposes = [purpose({}), purpose({ purpose: "assistant.ask-help" }), purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote" })];
    expect(usedFor(local, purposes)).toBe("concierge, ask-help");
    expect(usedFor(minimax, purposes)).toBe("operator");
    expect(usedFor({ ...local, id: "spare" }, purposes)).toBe("nothing yet");
    expect(stationOf("desk.search")).toBe("desk.search");
  });
});

describe("removing a backend", () => {
  const purposes = [purpose({}), purpose({ purpose: "assistant.ask-help" }), purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote", default: false })];

  it("names what goes: its model, its key, and where the station it answered goes instead", () => {
    expect(removalWords(minimax, [local, minimax, chatgpt], purposes)).toEqual([
      "Kvasir lets go of MiniMax-M3: nothing reaches it through Kvasir any more, and answers already under way finish.",
      "Its key is forgotten.",
      "The station it answered goes to its default instead, qwen38-27b in your systems: operator.",
    ]);
  });

  it("sends the stations to the next model in your systems, or says they have nowhere to go", () => {
    const spare: Backend = { ...local, id: "spare", models: ["gemma4-12b", "gemma4-4b"] };
    expect(removalWords(local, [local, chatgpt, spare], purposes)).toEqual([
      "Kvasir lets go of qwen38-27b: nothing reaches it through Kvasir any more, and answers already under way finish.",
      "The stations it answered go to their default instead, gemma4-12b in your systems: concierge and ask-help.",
    ]);
    expect(removalWords(local, [local, minimax], purposes)[1]).toBe("The stations it answered have nowhere to go until a model in your systems is added: concierge and ask-help.");
    expect(removalWords(spare, [local, spare], null)).toEqual(["Kvasir lets go of gemma4-12b and gemma4-4b: nothing reaches them through Kvasir any more, and answers already under way finish."]);
  });

  it("lists in a sentence", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["a"])).toBe("a");
    expect(listWords(["a", "b"])).toBe("a and b");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("where each station goes", () => {
  it("is said station by station, with who allowed a move and whether another backend may take it", () => {
    const operator = purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote", default: false, acknowledged: { by: "admin", at: Date.parse("2026-09-16T09:00:00Z"), text: null } });
    const identifiers = purpose({ purpose: "desk.identity", content: "identifiers" });
    const lines = purposeLines([purpose({}), operator, identifiers], [local, minimax]);
    expect(lines[0]).toMatchObject({ station: "concierge", carries: "rows", goesTo: "qwen38-27b, in your systems", locality: "local", allowed: null, movable: true });
    expect(lines[1]).toMatchObject({ station: "operator", carries: "catalogue", goesTo: "MiniMax-M3, a provider", locality: "remote", movable: true });
    expect(lines[1].allowed).toMatch(/^allowed by admin on /);
    expect(lines[2]).toMatchObject({ carries: "identifiers", movable: false });
  });

  it("names ChatGPT as each person's own subscription, or the install's on a desk that signs nobody in", () => {
    const viaChatgpt = purpose({ purpose: "assistant.operator", content: "catalog", backend: "chatgpt", locality: "remote", default: false });
    expect(purposeLines([viaChatgpt], [local, chatgpt])[0].goesTo).toBe("Each person's own ChatGPT subscription");
    expect(purposeLines([viaChatgpt], [local, chatgpt], true)[0].goesTo).toBe("The install's ChatGPT subscription");
    expect(destinationWords(chatgpt)).toBe("Each person's own ChatGPT subscription");
    expect(destinationWords(local)).toBe("qwen38-27b");
  });

  it("offers a station only the backends it may move to, ChatGPT among them, and says what a move needs", () => {
    expect(targets(purpose({}), [local, minimax])).toEqual([{ backend: minimax, needs: "an acknowledgement" }]);
    expect(targets(purpose({ content: "catalog" }), [local, minimax])).toEqual([{ backend: minimax, needs: "nothing" }]);
    expect(targets(purpose({ content: "identifiers" }), [local, minimax, chatgpt])).toEqual([]);
    expect(targets(purpose({ backend: "minimax", content: "rows" }), [local, minimax])).toEqual([{ backend: local, needs: "nothing" }]);
    expect(targets(purpose({}), [local, minimax, chatgpt])).toEqual([
      { backend: minimax, needs: "an acknowledgement" },
      { backend: chatgpt, needs: "an acknowledgement" },
    ]);
  });
});
