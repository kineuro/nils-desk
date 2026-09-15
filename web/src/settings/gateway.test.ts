// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page's words: Kvasir's health, the machine's card, which
// backends show where, each model's facts and admission, what a check found,
// what goes when a backend is removed, who looks at the page and a refusal
// for want of a grant, and where each station goes as its line draws it.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import {
  admissionTitle,
  admissionWords,
  answersWords,
  cardsOf,
  carriesWords,
  checkWords,
  closedLead,
  closedTo,
  countedStations,
  defaultModel,
  destinationWords,
  gatewayHealth,
  goesToWords,
  grantWords,
  listWords,
  machineWords,
  modelOf,
  onRuntime,
  plainly,
  providerName,
  removalWords,
  routes,
  runtimeOfBackend,
  shownBackends,
  stationOf,
  subscribedStations,
  targets,
  tokensWords,
  usedFor,
  viewerOf,
  whereWords,
  type Viewer,
} from "./gateway";
import { type AdmissionRecord, type Backend, KvasirError, type PurposeRow, type Subscription } from "./kvasir";
import type { Install } from "./supervise";

const local: Backend = { id: "local", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["qwen38-27b"], health: { warming: false, running: 1, concurrency: 8 } };
const minimax: Backend = { id: "minimax", kind: "anthropic-messages", locality: "remote", provider: "minimax", credential: true, models: ["MiniMax-M3"], health: { warming: false, running: 0, concurrency: 4 } };
const chatgpt: Backend = { id: "chatgpt", kind: "openai-codex-responses", locality: "remote", provider: "chatgpt", credential: null, models: [], health: {}, builtin: true };
const runtime: Backend = { id: "llama-cpp", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["Qwen3.6-27B-Q4_K_M"], health: {} };

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

const caps = (grants: Grant[], mode: "off" | "local" | "oidc" = "local") => ({ person: { subject: "someone", display_name: "Someone", grants, detail: "plain", groups: [] }, desk: { mode } }) as unknown as Capabilities;

const admin: Viewer = { work: true, subscribes: true, system: false };
const person: Viewer = { work: false, subscribes: true, system: false };
const seer: Viewer = { work: false, subscribes: false, system: false };
const alone: Viewer = { work: true, subscribes: true, system: true };

describe("Kvasir", () => {
  it("says whether it is warm and how busy its streams are", () => {
    expect(gatewayHealth([local, minimax])).toEqual({ tone: "ok", words: "warm", streams: "1 of 12 streams busy" });
    expect(gatewayHealth([{ ...local, health: { warming: true } }])).toEqual({ tone: "caution", words: "warming", streams: null });
    expect(gatewayHealth([])).toEqual({ tone: "caution", words: "no model yet", streams: null });
    expect(gatewayHealth([chatgpt])).toEqual({ tone: "caution", words: "no model yet", streams: null });
  });

  it("says every card the machine has, with their memory, and what it can serve", () => {
    const machine = (over: Partial<Install["machine"]>) => ({ machine: { card: null, advice: [], ...over } }) as unknown as Install;
    const pro = { name: "NVIDIA RTX PRO 6000", memory_gb: 95.59 };
    const one = machine({ card: { name: "NVIDIA GeForce RTX 4090", memory_gb: 23.99 }, advice: ["A 27B model at 4 bit fits with room for the context."] });
    expect(machineWords(one)).toEqual({ cards: "NVIDIA GeForce RTX 4090, 24 GB", advice: ["A 27B model at 4 bit fits with room for the context."] });
    expect(machineWords(machine({ card: pro, cards: [pro, pro] })).cards).toBe("2 × NVIDIA RTX PRO 6000, 191 GB");
    expect(machineWords(machine({ cards: [{ name: "NVIDIA RTX 4090 Laptop GPU", memory_gb: 15.99 }, { name: "Intel UHD Graphics", memory_gb: 0 }] })).cards).toBe("NVIDIA RTX 4090 Laptop GPU, 16 GB · Intel UHD Graphics");
    expect(machineWords(machine({ cards: [{ name: "NVIDIA GeForce RTX 4090", memory_gb: 24 }, { name: "NVIDIA GeForce RTX 3090", memory_gb: 24 }] })).cards).toBe("NVIDIA GeForce RTX 4090, 24 GB · NVIDIA GeForce RTX 3090, 24 GB · 48 GB in all");
    // an empty list reads as the one card setup found, and no card at all says nothing
    expect(cardsOf(machine({ card: pro, cards: [] }))).toEqual([pro]);
    expect(machineWords(machine({}))).toEqual({ cards: null, advice: [] });
    expect(machineWords(null)).toEqual({ cards: null, advice: [] });
  });

  it("shows the models it holds as cards, and ChatGPT through subscriptions as the subscription's card", () => {
    expect(shownBackends([local, chatgpt, minimax])).toEqual({ held: [local, minimax], subscriptions: [chatgpt] });
    expect(shownBackends([])).toEqual({ held: [], subscriptions: [] });
  });
});

describe("who looks at the page (record 25)", () => {
  it("works on Kvasir with Kvasir: Work, and signs a subscription of their own in with the assistant and Kvasir: See", () => {
    expect(viewerOf(caps(["kvasir:work", "kvasir:see"]), null)).toEqual({ work: true, subscribes: false, system: false });
    expect(viewerOf(caps(["kvasir:work", "assistant:use"]), sub())).toEqual({ work: true, subscribes: true, system: false });
    expect(viewerOf(caps(["kvasir:see", "assistant:use"]), sub())).toEqual({ work: false, subscribes: true, system: false });
    expect(viewerOf(caps(["kvasir:see"]), sub())).toEqual({ work: false, subscribes: false, system: false });
    expect(viewerOf(caps(["assistant:use"]), sub())).toEqual({ work: false, subscribes: false, system: false });
  });

  it("reads the subscription as the install's where Kvasir says so, or where nobody signs in", () => {
    expect(viewerOf(caps(["kvasir:work", "assistant:use"]), sub({ for: "system" })).system).toBe(true);
    expect(viewerOf(caps(["kvasir:work", "assistant:use"], "off"), null).system).toBe(true);
  });

  it("names a grant as the Identity page does", () => {
    expect(grantWords("kvasir:work")).toBe("Kvasir: Work");
    expect(grantWords("kvasir:see")).toBe("Kvasir: See");
    expect(grantWords("assistant:use")).toBe("the assistant");
    expect(grantWords("assistant-settings:see")).toBe("Assistant settings: See");
  });

  it("says a refusal for want of a grant in plain words, and leaves any other refusal as it came", () => {
    const refused = (body: unknown) => new KvasirError(403, "refused", body as KvasirError["body"]);
    expect((plainly(refused({ error: { code: "no_grant", needs: ["assistant:use", "kvasir:see"] } })) as Error).message).toBe(
      "A subscription of your own needs the assistant and Kvasir: See. Someone with Identity: Work gives them on the Identity page.",
    );
    expect((plainly(refused({ error: { code: "no_grant", needs: ["kvasir:work"] } })) as Error).message).toBe("This needs Kvasir: Work, which you do not hold. Someone with Identity: Work gives it on the Identity page.");
    expect((plainly(refused({ error: { code: "no_grant", message: "no grant" } })) as Error).message).toBe("This needs a grant you do not hold. Someone with Identity: Work gives it on the Identity page.");
    expect((plainly(refused({ error: { code: "not_a_person" } })) as Error).message).toMatch(/^Kvasir keeps a subscription for a person/u);
    const other = new KvasirError(409, "in the list already", {});
    expect(plainly(other)).toBe(other);
  });
});

describe("a model", () => {
  it("says the context it takes, and where its prompts go", () => {
    expect(tokensWords({ id: "qwen38-27b", contextWindow: 32768, reasoning: true })).toBe("32,768 tokens");
    expect(tokensWords(undefined)).toBeNull();
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
    expect(admissionWords("qwen38-27b", local, { id: "qwen38-27b", admitted: true }, [record({})], idle)).toEqual({ tone: "ok", words: "admitted", on: day, detail: null });
    const refused = record({
      passed: false,
      checks: [
        { name: "tool_calls", passed: false },
        { name: "chat_template", passed: true },
        { name: "overflow", passed: false },
        { name: "stream_integrity", passed: null },
      ],
    });
    expect(admissionWords("qwen38-27b", local, undefined, [refused], idle)).toEqual({ tone: "blocked", words: "refused", on: day, detail: "failed tool calls and context overflow" });
    expect(admissionTitle(admissionWords("qwen38-27b", local, undefined, [refused], idle))).toBe(`refused on ${day}: failed tool calls and context overflow`);
    expect(admissionWords("qwen38-27b", local, undefined, [record({ passed: false })], idle)).toEqual({ tone: "blocked", words: "refused", on: day, detail: null });
    expect(admissionWords("qwen38-27b", local, undefined, [], idle)).toEqual({ tone: "caution", words: "not admitted yet", on: null, detail: null });
    expect(admissionTitle(admissionWords("qwen38-27b", local, undefined, [], idle))).toBeNull();
    // a backend added within the hour is being checked, and so is any model while a check runs
    const waiting = { id: "qwen38-27b", admitted: false };
    expect(admissionWords("qwen38-27b", { ...local, added_at: now - 20 * 60_000 }, waiting, [], idle).words).toBe("being checked");
    expect(admissionWords("qwen38-27b", { ...local, added_at: now - 2 * 3_600_000 }, waiting, [], idle).words).toBe("not admitted yet");
    expect(admissionWords("qwen38-27b", local, { id: "qwen38-27b", admitted: true }, [record({})], { now, checking: true }).words).toBe("being checked");
    // a refusal from before the backend was added again is not this backend's
    expect(admissionWords("qwen38-27b", { ...local, added_at: Date.parse("2026-09-15T11:30:00Z") }, undefined, [refused], idle).words).toBe("being checked");
    expect(admissionWords("MiniMax-M3", minimax, undefined, null, idle)).toEqual({ tone: "neutral", words: "not needed for a provider", on: null, detail: null });
  });

  it("says what a check found, model by model", () => {
    expect(checkWords([record({})])).toEqual({ passed: true, words: "qwen38-27b passed the admission suite, and the assistant may use it." });
    expect(checkWords([record({ passed: false, checks: [{ name: "enforced_schema", passed: false }, { name: "a_new_check", passed: false }] })])).toEqual({
      passed: false,
      words: "qwen38-27b did not pass the admission suite: it failed enforced schemas and a new check.",
    });
    expect(checkWords([])).toEqual({ passed: false, words: "Kvasir checked no model." });
  });

  it("says which stations use its backend, and which go to ChatGPT", () => {
    const purposes = [purpose({}), purpose({ purpose: "assistant.ask-help" }), purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote" })];
    expect(usedFor(local, purposes)).toBe("concierge, ask-help");
    expect(usedFor(minimax, purposes)).toBe("operator");
    expect(usedFor({ ...local, id: "spare" }, purposes)).toBe("nothing yet");
    expect(answersWords("local", purposes)).toEqual({ words: "answers 2 stations", title: "concierge, ask-help" });
    expect(answersWords("spare", purposes)).toEqual({ words: "answers no station", title: null });
    expect(countedStations(["concierge"])).toEqual({ words: "answers 1 station", title: "concierge" });
    expect(answersWords("local", null)).toBeNull();
    expect(stationOf("desk.search")).toBe("desk.search");
    expect(subscribedStations([purpose({ backend: "chatgpt", locality: "remote" }), purpose({ purpose: "assistant.ask-help" })], [local, chatgpt])).toEqual(["concierge"]);
    expect(subscribedStations(null, null)).toEqual([]);
  });

  it("knows the runtime's backend, the runtime a server reported, a provider's name, and the default model in your systems", () => {
    expect(onRuntime(runtime)).toBe(true);
    expect(onRuntime(local)).toBe(false);
    expect(runtimeOfBackend(local, [record({}), record({ at: 0, runtime: { name: "vllm", version: "0.9", build: "" } })])).toBe("SGLang");
    expect(runtimeOfBackend(local, [record({ runtime: { name: "unknown", version: "", build: "" } })])).toBeNull();
    expect(runtimeOfBackend(local, null)).toBeNull();
    expect(providerName(minimax)).toBe("MiniMax");
    expect(providerName({ ...minimax, provider: "acme" })).toBe("acme");
    expect(defaultModel([chatgpt, minimax, local, runtime])).toBe("qwen38-27b");
    expect(defaultModel([minimax])).toBeNull();
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

describe("where each station goes (record 25)", () => {
  const at = (viewer: Viewer, subscription: Subscription | null = null) => ({ viewer, admissions: [record({})], subscription });

  it("draws a station's line: its name and what it carries, the box of where it goes, and who allowed it", () => {
    const operator = purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote", default: false });
    const keyword = purpose({ purpose: "assistant.keyword-tune", backend: "local" });
    const askHelp = purpose({ purpose: "assistant.ask-help", backend: "llama-cpp" });
    const concierge = purpose({ backend: "minimax", locality: "remote", default: false, acknowledged: { by: "admin", at: Date.parse("2026-09-14T09:00:00Z"), text: "why" } });
    const lines = routes([askHelp, keyword, operator, concierge], [runtime, local, minimax, chatgpt], at(admin));
    expect(lines[0]).toMatchObject({
      station: "ask-help",
      carries: "carries rows",
      to: { mark: { icon: "chip", tone: "brand" }, title: "Qwen3.6-27B-Q4_K_M", meta: "this machine, llama.cpp", where: { tone: "ok", words: "stays in your systems" } },
      side: null,
      movable: true,
    });
    expect(lines[1].to).toMatchObject({ mark: { icon: "engine", tone: "neutral" }, title: "qwen38-27b", meta: "your server, SGLang" });
    expect(lines[2]).toMatchObject({ carries: "carries the catalogue", side: "no rows, so no reason needed", to: { mark: { icon: "cloud", tone: "caution" }, title: "MiniMax-M3", meta: "MiniMax, a provider", where: { tone: "caution", words: "leaves your systems" } } });
    expect(lines[3].side).toMatch(/^allowed by admin on 14 Sept? 2026, for this station$/u);
    expect(carriesWords("identifiers")).toBe("carries identifiers");
  });

  it("says where a server is only to a person with Kvasir: Work, and lets only them move a station", () => {
    const lines = routes([purpose({})], [local, minimax], at(person));
    expect(lines[0].to.meta).toBe("a server in your systems");
    expect(lines[0].movable).toBe(false);
    expect(routes([purpose({ content: "identifiers" })], [local, minimax], at(admin))[0].movable).toBe(false);
  });

  it("names ChatGPT as each person's own subscription, the person's own, or the install's", () => {
    const viaChatgpt = purpose({ backend: "chatgpt", locality: "remote", default: false });
    const title = (viewer: Viewer, s: Subscription | null = null) => routes([viaChatgpt], [local, chatgpt], at(viewer, s))[0].to;
    expect(title(admin, sub({ state: "signed_in", model: "gpt-5.5" }))).toMatchObject({ title: "Each person's own ChatGPT subscription", meta: "the default model in your systems for anyone without one" });
    expect(title(seer)).toMatchObject({ title: "Each person's own ChatGPT subscription" });
    expect(title(person, sub())).toMatchObject({ title: "Your own ChatGPT subscription", meta: "qwen38-27b until you sign in" });
    expect(title(person, sub({ state: "signed_in", model: "gpt-5.5", models: [{ id: "gpt-5.5", name: "GPT-5.5", context_window: 272000 }] }))).toMatchObject({ meta: "GPT-5.5, signed in" });
    expect(title(alone, sub({ for: "system" }))).toMatchObject({ title: "The install's ChatGPT subscription", meta: "qwen38-27b until it is signed in" });
    expect(destinationWords(chatgpt)).toBe("Each person's own ChatGPT subscription");
    expect(destinationWords(chatgpt, true)).toBe("The install's ChatGPT subscription");
    expect(destinationWords(local)).toBe("qwen38-27b");
  });

  it("says a station goes nowhere where its backend is gone, and why where the model on this machine is stopped", () => {
    const [gone, stopped] = routes([purpose({ backend: "spare" }), purpose({ backend: "llama-cpp" })], [minimax], at(admin));
    expect(gone.to).toMatchObject({ title: "nowhere yet", meta: "no model in your systems answers it yet", where: null });
    expect(stopped.to.meta).toBe("its model on this machine is stopped");
    expect(goesToWords(gone.to)).toBe("nowhere yet, no model in your systems answers it yet");
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

describe("a provider just added", () => {
  it("names the stations it does not answer, each with what moving it there needs", () => {
    const concierge = purpose({});
    const operator = purpose({ purpose: "assistant.operator", content: "catalog" });
    const identity = purpose({ purpose: "desk.identity", content: "identifiers" });
    const askHelp = purpose({ purpose: "assistant.ask-help", backend: "minimax", locality: "remote", default: false });
    expect(closedTo(minimax, [concierge, operator, identity, askHelp]).map((l) => [l.station, l.needs, l.words])).toEqual([
      ["concierge", "an acknowledgement", "concierge carries rows of the archive, which go there only once you write down why."],
      ["operator", "nothing", "operator reads no rows, and goes there once you move it."],
      ["desk.identity", "never", "desk.identity carries identifiers, which never leave your systems."],
    ]);
    expect(closedLead(minimax, [concierge, askHelp])).toBe("MiniMax-M3 does not answer these stations yet");
    expect(closedLead(minimax, [concierge])).toBe("MiniMax-M3 answers no station yet");
  });
});
