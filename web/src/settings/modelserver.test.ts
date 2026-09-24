// SPDX-License-Identifier: AGPL-3.0-only
// A model server on the Kvasir page (record 47), against what a throwaway
// Kvasir answered for a server listing two models, one loaded and one cold:
// the specs in a line, loaded or cold, what a cold tick costs, each ticked
// model's result as Kvasir reports it, the stations one model answers, what
// removing one lets go, and the doors the dialog and the card call. The key is
// sealed under a name the dialog makes up and never sent anywhere else.

import { afterEach, describe, expect, it, vi } from "vitest";
import admitted from "../../test/fixtures/kvasir_servers_admit.json";
import held from "../../test/fixtures/kvasir_backends_server.json";
import offered from "../../test/fixtures/kvasir_servers_models.json";
import { stationModel, targets } from "./gateway";
import { admittedOf, type Backend, KvasirError, kvasir, type Offer, type PurposeRow, type ServerAdmitted } from "./kvasir";
import { admittedWords, coldWords, listRefusal, modelRemovalWords, resultTag, specWords, stageName, stationsOf, statusTag, tickable } from "./modelserver";

const offer = offered as unknown as Offer;
const done = admitted as unknown as ServerAdmitted;
const server = held.backends[0] as unknown as Backend;
const [flash, dense] = offer.models;
const purpose = (over: Partial<PurposeRow>): PurposeRow => ({
  purpose: "assistant.title",
  app: "nils-assistant",
  content: "catalog",
  kind: "background",
  backend: server.id,
  model: null,
  locality: "local",
  default: false,
  acknowledged: null,
  may_open_remote: "",
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a model server's list", () => {
  it("says each model's specs in a line, and whether it is loaded", () => {
    expect(specWords(flash)).toBe("262,144 context · 65,536 out · 4 at once · reasoning · tools · vision");
    expect(specWords(dense)).toBe("262,144 context · 65,536 out · 8 at once · reasoning · tools");
    expect(specWords({ ...dense, context_length: null, max_output_tokens: null, max_concurrent_requests: null, reasoning: false, tools: false, vision: false })).toBe("");
    expect(statusTag(dense.status)).toEqual({ tone: "ok", words: "loaded" });
    expect(statusTag(flash.status)).toEqual({ tone: "neutral", words: "cold" });
    expect(statusTag("loading")).toEqual({ tone: "caution", words: "loading" });
    expect(statusTag("unknown")).toBeNull();
    expect(tickable(dense)).toBe(true);
    expect(tickable({ ...dense, held_by: "127-0-0-1" })).toBe(false);
  });

  it("says before Admit that a cold model loads on the server and pauses the loaded one", () => {
    expect(coldWords(offer, [dense.id])).toBeNull();
    expect(coldWords(offer, [flash.id])).toBe("qwen3.8-flash-next is cold: asking loads it on the server (about 1 min) and pauses qwen38-27b.");
    expect(coldWords(offer, [flash.id, dense.id])).toBe("qwen3.8-flash-next is cold: asking loads it on the server (about 1 min).");
  });

  it("wants an address before it lists, and makes a fresh name for the key each time", () => {
    expect(listRefusal("")).toBe("a server has an address");
    expect(listRefusal("kvasir.example.org/v1")).toBe("an address starts with http:// or https://");
    expect(listRefusal(" https://kvasir.example.org/v1/ ")).toBeNull();
    expect(stageName(() => 0)).toBe("adding-00000000");
    expect(stageName()).toMatch(/^adding-[0-9a-z]{8}$/u);
  });
});

describe("admitting the ticked models", () => {
  it("shows each model's result as Kvasir reports it", () => {
    expect(done.results).toHaveLength(1);
    expect(resultTag(done.results[0])).toMatchObject({ tone: "ok", words: "admitted" });
    expect(resultTag({ id: "x", answered: true, admitted: false, record: 3, error: null })).toEqual({ tone: "blocked", words: "refused by admission", title: "admission record 3" });
    expect(resultTag({ id: "x", answered: true, admitted: null, record: null, error: null })).toEqual({ tone: "ok", words: "held", title: null });
    expect(resultTag({ id: "x", answered: false, admitted: null, record: null, error: { kind: "key_refused", message: "401" } })).toEqual({ tone: "blocked", words: "key refused", title: "401" });
    expect(resultTag({ id: "x", answered: false, admitted: null, record: null, error: { kind: "other", message: "x is served by y already" } })).toEqual({ tone: "blocked", words: "did not answer", title: "x is served by y already" });
    expect(admittedWords(done.backend?.id ?? null, done.results)).toBe(`qwen38-27b is on ${done.backend?.id}.`);
    expect(admittedWords(null, [])).toBe("No model was added.");
  });

  it("keeps each result where Kvasir held none of the ticked models", () => {
    const results = [{ id: "qwen38-27b", answered: false, admitted: null, record: null, error: { kind: "unreachable", message: "fetch failed" } }];
    expect(admittedOf(new KvasirError(422, "no", { backend: null, results }))).toEqual({ backend: null, results });
    expect(admittedOf(new KvasirError(401, "the key was refused", { error: { message: "the key was refused" } }))).toBeNull();
  });
});

describe("a server Kvasir holds", () => {
  it("sends a station to the model the table names, else the backend's first", () => {
    expect(server.server).toBe(true);
    expect(server.models).toEqual(["qwen38-27b", "qwen3.8-flash-next"]);
    expect(stationModel(purpose({}), server)).toBe("qwen38-27b");
    expect(stationModel(purpose({ model: "qwen3.8-flash-next" }), server)).toBe("qwen3.8-flash-next");
    expect(stationModel(purpose({ model: "gone" }), server)).toBe("qwen38-27b");
    expect(stationsOf(server, "qwen3.8-flash-next", [purpose({ model: "qwen3.8-flash-next" }), purpose({ purpose: "assistant.ask-help" })]).map((p) => p.purpose)).toEqual(["assistant.title"]);
  });

  it("offers a station each of the server's models but the one it goes to", () => {
    expect(targets(purpose({}), [server]).map((t) => [t.backend.id, t.model])).toEqual([[server.id, "qwen3.8-flash-next"]]);
    expect(targets(purpose({ backend: "elsewhere" }), [server]).map((t) => t.model)).toEqual(["qwen38-27b", "qwen3.8-flash-next"]);
  });

  it("says what removing one model lets go, and that the last takes the server with its key", () => {
    expect(modelRemovalWords(server, "qwen3.8-flash-next", [purpose({ model: "qwen3.8-flash-next" })])).toEqual([
      `Kvasir lets go of qwen3.8-flash-next on ${server.id}.`,
      "title goes to qwen38-27b instead.",
    ]);
    const one = { ...server, models: ["qwen38-27b"] };
    expect(modelRemovalWords(one, "qwen38-27b", [])).toEqual([`Kvasir lets go of qwen38-27b on ${server.id}.`, `It is the last model there, so ${server.id} goes with its key.`]);
  });
});

describe("the doors", () => {
  it("seal the key by name, list and admit by that name, map a station to a model, and let one model go", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    });
    await kvasir.credential("adding-00000001", "the-server-key");
    await kvasir.offered("https://kvasir.example.org/v1", "adding-00000001");
    await kvasir.offered("http://127.0.0.1:30000/v1", null);
    await kvasir.admitServer({ url: "https://kvasir.example.org/v1", key_ref: "adding-00000001", models: ["qwen38-27b"] });
    await kvasir.setPolicy("assistant.title", "card0", null, "flash-next");
    await kvasir.setPolicy("assistant.title", "card0", null);
    await kvasir.removeModel("card0", "qwen3.8-flash-next");
    expect(calls).toEqual([
      { method: "PUT", url: "/kvasir/v1/credentials/adding-00000001", body: { secret: "the-server-key" } },
      { method: "GET", url: "/kvasir/v1/servers/models?url=https%3A%2F%2Fkvasir.example.org%2Fv1&key_ref=adding-00000001", body: undefined },
      { method: "GET", url: "/kvasir/v1/servers/models?url=http%3A%2F%2F127.0.0.1%3A30000%2Fv1", body: undefined },
      { method: "POST", url: "/kvasir/v1/servers", body: { url: "https://kvasir.example.org/v1", key_ref: "adding-00000001", models: ["qwen38-27b"] } },
      { method: "PUT", url: "/kvasir/v1/purposes/assistant.title/policy", body: { backend: "card0", model: "flash-next" } },
      { method: "PUT", url: "/kvasir/v1/purposes/assistant.title/policy", body: { backend: "card0" } },
      { method: "DELETE", url: "/kvasir/v1/backends/card0/models/qwen3.8-flash-next", body: undefined },
    ]);
    // the key went to the credential door alone
    expect(calls.filter((c) => JSON.stringify(c).includes("the-server-key")).map((c) => c.url)).toEqual(["/kvasir/v1/credentials/adding-00000001"]);
  });

  it("answer each result where Kvasir held none, and refuse any other way", async () => {
    const results = [{ id: "qwen38-27b", answered: false, admitted: null, record: null, error: { kind: "no_model", message: "no" } }];
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ backend: null, results }), { status: 422 }));
    await expect(kvasir.admitServer({ url: "http://x/v1", models: ["qwen38-27b"] })).resolves.toEqual({ backend: null, results });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "http://x/v1/models answered 401: the key was refused" } }), { status: 401 }));
    await expect(kvasir.admitServer({ url: "http://x/v1", models: ["qwen38-27b"] })).rejects.toThrow("the key was refused");
  });
});
