// SPDX-License-Identifier: AGPL-3.0-only
// Adding a model: where it is and the addresses offered, what the dialog needs
// before it finds, tests or adds, and the words for each way a model did not
// answer.

import { describe, expect, it } from "vitest";
import {
  addable,
  addedWords,
  addressHint,
  asksKey,
  description,
  draft,
  findRefusal,
  fingerprint,
  HERE,
  kindFor,
  listedWords,
  pickFrom,
  PRESETS,
  refusedWords,
  stale,
  testRefusal,
  triedWords,
  wholeTokens,
  withPreset,
} from "./adding";
import type { TryKind } from "./kvasir";

describe("where a model is", () => {
  it("starts a server on this machine at the address setup gives it, another machine's typed, and a provider at the first one offered", () => {
    expect(HERE).toBe("http://127.0.0.1:30000/v1");
    expect(draft("here")).toEqual({ where: "here", preset: "openai", baseUrl: HERE, keyed: false, key: "", model: "", contextWindow: "32768", maxTokens: "4096" });
    expect(draft("elsewhere").baseUrl).toBe("");
    expect(draft("provider")).toMatchObject({ preset: "openai", baseUrl: "https://api.openai.com/v1" });
  });

  it("offers the providers by name, Anthropic by its own kind, and another address typed", () => {
    expect(PRESETS.map((p) => [p.name, p.baseUrl, p.kind])).toEqual([
      ["OpenAI", "https://api.openai.com/v1", "openai-completions"],
      ["OpenRouter", "https://openrouter.ai/api/v1", "openai-completions"],
      ["MiniMax", "https://api.minimax.io/v1", "openai-completions"],
      ["Anthropic", "https://api.anthropic.com", "anthropic-messages"],
      ["Another OpenAI compatible address", "", "openai-completions"],
    ]);
    const anthropic = withPreset({ ...draft("provider"), model: "gpt-5", key: "a key for another" }, "anthropic");
    expect(anthropic).toMatchObject({ preset: "anthropic", baseUrl: "https://api.anthropic.com", model: "", key: "" });
    expect(kindFor(anthropic)).toBe("anthropic-messages");
    expect(kindFor({ ...draft("here"), preset: "anthropic" })).toBe("openai-completions");
    expect(withPreset(draft("provider"), "nowhere")).toMatchObject({ preset: "other", baseUrl: "" });
  });

  it("asks a provider for its key, and a server only when it needs one", () => {
    expect(asksKey(draft("provider"))).toBe(true);
    expect(asksKey(draft("here"))).toBe(false);
    expect(asksKey({ ...draft("elsewhere"), keyed: true })).toBe(true);
  });

  it("says what each address is", () => {
    expect(addressHint(draft("here"))).toBe("Where the model server on this machine answers; change the port if it listens on another.");
    expect(addressHint(draft("elsewhere"))).toBe("The server's address as Kvasir reaches it, most often ending in /v1.");
    expect(addressHint(draft("provider"))).toBe("The provider's address. Change it only if the provider gave you another.");
    expect(addressHint(withPreset(draft("provider"), "other"))).toBe("The provider's OpenAI compatible address, most often ending in /v1.");
  });
});

describe("what the dialog needs", () => {
  it("finds a server's models once it has an address, and a key where one is asked", () => {
    expect(findRefusal(draft("here"))).toBeNull();
    expect(findRefusal(draft("elsewhere"))).toBe("a server has an address");
    expect(findRefusal({ ...draft("elsewhere"), baseUrl: "127.0.0.1:8000/v1" })).toBe("an address starts with http:// or https://");
    expect(findRefusal(draft("provider"))).toBe("a provider takes its key");
    expect(findRefusal(withPreset(draft("provider"), "other"))).toBe("a provider has an address");
    expect(findRefusal({ ...draft("here"), keyed: true, key: "  " })).toBe("the key is empty; untick It needs a key if the server takes none");
  });

  it("tests a model once it has a name and whole numbers of tokens", () => {
    const d = { ...draft("here"), model: "qwen38-27b" };
    expect(testRefusal(d)).toBeNull();
    expect(testRefusal({ ...d, model: " " })).toBe("a model has the name the server knows it by");
    expect(testRefusal({ ...d, contextWindow: "32k" })).toBe("the context window is a whole number of tokens");
    expect(testRefusal({ ...d, maxTokens: "0" })).toBe("the longest answer is a whole number of tokens");
    expect(wholeTokens(" 65536 ")).toBe(65536);
    expect(wholeTokens("1.5")).toBeNull();
    expect(wholeTokens("-4")).toBeNull();
    expect(wholeTokens("")).toBeNull();
  });

  it("asks Kvasir with the address as it holds it, the key only where the dialog asks one, and the model's numbers", () => {
    const d = { ...draft("here"), baseUrl: " http://127.0.0.1:30000/v1/ ", key: "left over", model: "qwen38-27b ", contextWindow: "65536" };
    expect(description(d, false)).toEqual({ kind: "openai-completions", baseUrl: HERE, locality: "local" });
    expect(description({ ...d, keyed: true }, true)).toEqual({
      kind: "openai-completions",
      baseUrl: HERE,
      locality: "local",
      key: "left over",
      models: [{ id: "qwen38-27b", contextWindow: 65536, maxTokens: 4096 }],
    });
    expect(description({ ...draft("provider"), key: " a key ", model: "gpt-5" }, true)).toMatchObject({ locality: "remote", key: "a key" });
  });

  it("adds only after a test that answered for exactly the inputs shown", () => {
    const d = { ...draft("here"), model: "qwen38-27b" };
    const answered = { print: fingerprint(d), model: { id: "qwen38-27b", answered: true, error: null } };
    expect(addable(d, null)).toBe(false);
    expect(addable(d, answered)).toBe(true);
    expect(stale(d, answered)).toBe(false);
    expect(stale(d, null)).toBe(false);
    const changed = { ...d, maxTokens: "8192" };
    expect(addable(changed, answered)).toBe(false);
    expect(stale(changed, answered)).toBe(true);
    expect(addable({ ...d, keyed: true, key: "a key" }, answered)).toBe(false);
    expect(addable(d, { ...answered, model: { id: "qwen38-27b", answered: false, error: { kind: "unreachable", message: "fetch failed" } } })).toBe(false);
    // a slash at the end is the same address to Kvasir
    expect(addable({ ...d, baseUrl: `${d.baseUrl}/` }, answered)).toBe(true);
  });
});

describe("what a test found", () => {
  const failed = (kind: TryKind, message: string) => triedWords({ id: "qwen38-27b", answered: false, error: { kind, message } });

  it("says each way a model did not answer in words, and any other way in the server's own", () => {
    expect(failed("unreachable", "connect ECONNREFUSED 127.0.0.1:30000")).toEqual({ answered: false, words: "Nothing answered at that address.", detail: "connect ECONNREFUSED 127.0.0.1:30000" });
    expect(failed("key_refused", "401 Unauthorized").words).toBe("The key was refused.");
    expect(failed("no_model", "404 model not found").words).toBe("It has no model by that name.");
    expect(failed("refused_for_now", "429 rate limit reached").words).toBe("It refuses for now: too many requests, or no credit left.");
    expect(failed("other", "the server ended its answer without a word")).toEqual({ answered: false, words: "the server ended its answer without a word", detail: null });
    expect(triedWords({ id: "qwen38-27b", answered: false, error: null }).words).toBe("qwen38-27b did not answer.");
    expect(triedWords({ id: "qwen38-27b", answered: true, error: null })).toEqual({ answered: true, words: "qwen38-27b answered.", detail: null });
  });

  it("lists what the server lists, or asks for the name where it lists nothing", () => {
    expect(listedWords(["a", "b"])).toBe("It lists 2 models.");
    expect(listedWords(["a"])).toBe("It lists one model.");
    expect(listedWords([])).toBe("It lists no model, so type the name it knows the model by.");
    expect(listedWords(null)).toBe("It does not list its models, so type the name it knows the model by.");
    expect(pickFrom(["a", "b"], " b")).toBe("b");
    expect(pickFrom(["a", "b"], "c")).toBe("a");
  });

  it("says what each model said when Kvasir refused an add, and what an add did", () => {
    expect(refusedWords([{ id: "a", answered: true, error: null }, { id: "b", answered: false, error: { kind: "no_model", message: "404" } }])).toEqual([
      "a answered.",
      "b did not answer. It has no model by that name.",
    ]);
    expect(addedWords("qwen38-27b", "qwen38-27b", "local")).toBe("qwen38-27b is added. Kvasir checks it with its admission suite before the assistant uses it, which takes a few minutes.");
    expect(addedWords("MiniMax-M3", "minimax-m3", "remote")).toBe("MiniMax-M3 is added as minimax-m3. A station goes to it once you move one there, under Where each station goes.");
  });
});
