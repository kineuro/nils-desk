// SPDX-License-Identifier: AGPL-3.0-only
// Kvasir's doors as the desk calls them: a refusal in Kvasir's words with its
// status, what each model said when an add was refused, a door not served
// yet, and where a purpose may go.

import { afterEach, describe, expect, it, vi } from "vitest";
import { type Backend, grantRefusalOf, KvasirError, kvasir, localRefusalOf, opening, type PurposeRow, triedOf } from "./kvasir";

const local: Backend = { id: "sglang", kind: "openai", locality: "local", provider: null, credential: null, models: ["qwen"], health: {} };
const remote: Backend = { id: "minimax", kind: "anthropic", locality: "remote", provider: "minimax", credential: true, models: ["m"], health: {} };
const row = (content: PurposeRow["content"]): PurposeRow => ({ purpose: `a.${content}`, app: "a", content, kind: "background", backend: "sglang", locality: "local", default: true, acknowledged: null, may_open_remote: "" });

/** Kvasir answering every call with one status and body; the calls it was asked are kept. */
function answering(status: number, body: unknown) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ method: String(init.method), url, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the models table", () => {
  it("opens a catalog purpose to a remote backend, a rows purpose only with an acknowledgement, an identifiers purpose never", () => {
    expect(opening(row("catalog"), remote)).toBe("yes");
    expect(opening(row("rows"), remote)).toBe("acknowledge");
    expect(opening(row("identifiers"), remote)).toBe("never");
    expect(opening(row("identifiers"), local)).toBe("yes");
  });
});

describe("Kvasir's doors", () => {
  const server = { baseUrl: "http://127.0.0.1:30000/v1", locality: "local" as const, models: ["qwen38-27b"] };

  it("say a refusal in Kvasir's words, with its status", async () => {
    answering(409, { error: { code: "backend", message: "qwen38-27b is served by local already" } });
    const e = await kvasir.add(server).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(KvasirError);
    expect((e as KvasirError).status).toBe(409);
    expect((e as KvasirError).message).toBe("qwen38-27b is served by local already");
  });

  it("keep what each model said when an add is refused", async () => {
    const models = [{ id: "qwen38-27b", answered: false, error: { kind: "unreachable", message: "fetch failed" } }];
    answering(422, { error: { code: "backend", message: "qwen38-27b did not answer: fetch failed", models } });
    const e = await kvasir.add(server).catch((x: unknown) => x);
    expect(triedOf(e)).toEqual(models);
    expect(triedOf(new Error("no body"))).toBeNull();
  });

  it("answer null for the subscriptions where Kvasir does not serve their door, and refuse any other way", async () => {
    answering(404, { error: { code: "not_found", message: "no door" } });
    await expect(kvasir.subscriptions()).resolves.toBeNull();
    answering(502, { error: "kvasir did not answer" });
    await expect(kvasir.subscriptions()).rejects.toThrow("kvasir did not answer");
  });

  it("send a sign-in, a model chosen, a sign-out, a check and a removal to their doors", async () => {
    const calls = answering(200, {});
    await kvasir.signIn("chatgpt");
    await kvasir.chooseModel("chatgpt", "gpt-5");
    await kvasir.signOut("chatgpt");
    await kvasir.admit("local");
    await kvasir.remove("gpt 5");
    expect(calls).toEqual([
      { method: "POST", url: "/kvasir/v1/subscriptions/chatgpt/sign-in", body: {} },
      { method: "PUT", url: "/kvasir/v1/subscriptions/chatgpt", body: { model: "gpt-5" } },
      { method: "DELETE", url: "/kvasir/v1/subscriptions/chatgpt", body: undefined },
      { method: "POST", url: "/kvasir/v1/admission/run", body: { backend: "local" } },
      { method: "DELETE", url: "/kvasir/v1/backends/gpt%205", body: undefined },
    ]);
  });

  it("send the local models' doors, answer null where Kvasir serves none, and keep the sizes of a refusal for room", async () => {
    const calls = answering(200, {});
    await kvasir.local.setLocation("/srv/models");
    await kvasir.local.lookup({ repo: "owner/name", revision: "main", include: ["*Q4_K_M.gguf"] });
    await kvasir.local.download({ repo: "owner/name", revision: "main" });
    await kvasir.local.pause(3);
    await kvasir.local.resume(3);
    await kvasir.local.remove(3);
    await kvasir.local.setToken("hf_a-token");
    await kvasir.local.clearToken();
    expect(calls).toEqual([
      { method: "PUT", url: "/kvasir/v1/local/location", body: { path: "/srv/models" } },
      { method: "POST", url: "/kvasir/v1/local/lookup", body: { repo: "owner/name", revision: "main", include: ["*Q4_K_M.gguf"] } },
      { method: "POST", url: "/kvasir/v1/local/models", body: { repo: "owner/name", revision: "main" } },
      { method: "POST", url: "/kvasir/v1/local/models/3/pause", body: {} },
      { method: "POST", url: "/kvasir/v1/local/models/3/resume", body: {} },
      { method: "DELETE", url: "/kvasir/v1/local/models/3", body: undefined },
      { method: "PUT", url: "/kvasir/v1/local/token", body: { token: "hf_a-token" } },
      { method: "DELETE", url: "/kvasir/v1/local/token", body: undefined },
    ]);
    answering(404, { error: { code: "no_such_door", message: "GET /v1/local is not a door Kvasir has" } });
    await expect(kvasir.local.status()).resolves.toBeNull();
    answering(403, { error: { code: "no_grant", message: "local models need kvasir:work", needs: ["kvasir:work"] } });
    await expect(kvasir.local.status()).rejects.toThrow("local models need kvasir:work");
    const room = { code: "no_space", message: "/srv/models has 10.0 GiB free, and this download needs 17.0 GiB", free_bytes: 10 * 2 ** 30, needed_bytes: 17 * 2 ** 30 };
    answering(507, { error: room });
    const e = await kvasir.local.download({ repo: "owner/name" }).catch((x: unknown) => x);
    expect(localRefusalOf(e)).toEqual({ status: 507, code: "no_space", message: room.message, free_bytes: room.free_bytes, needed_bytes: room.needed_bytes });
    answering(422, { error: { code: "needs_token", message: "the Hugging Face Hub refused owner/name" } });
    const gated = await kvasir.local.lookup({ repo: "owner/name" }).catch((x: unknown) => x);
    expect(localRefusalOf(gated)).toMatchObject({ status: 422, code: "needs_token", free_bytes: null, needed_bytes: null });
    expect(localRefusalOf(new Error("no body"))).toBeNull();
  });

  it("keep the grants a door refused for want of names, and a subscription asked for with nobody behind the call (record 25)", async () => {
    answering(403, { error: { code: "no_grant", message: "a subscription of your own needs assistant:use and kvasir:see", needs: ["assistant:use", "kvasir:see"] } });
    const e = await kvasir.signIn("chatgpt").catch((x: unknown) => x);
    expect(grantRefusalOf(e)).toEqual({ code: "no_grant", needs: ["assistant:use", "kvasir:see"] });
    answering(403, { error: { code: "no_grant", message: "local models need kvasir:work", needs: ["kvasir:work"] } });
    expect(grantRefusalOf(await kvasir.local.lookup({ repo: "owner/name" }).catch((x: unknown) => x))).toEqual({ code: "no_grant", needs: ["kvasir:work"] });
    answering(403, { error: { code: "no_grant", message: "no grant" } });
    expect(grantRefusalOf(await kvasir.backends().catch((x: unknown) => x))).toEqual({ code: "no_grant", needs: [] });
    answering(401, { error: { code: "unauthenticated", message: "no token" } });
    expect(grantRefusalOf(await kvasir.backends().catch((x: unknown) => x))).toBeNull();
    answering(403, { error: { code: "not_a_person", message: "a subscription is a person's" } });
    expect(grantRefusalOf(await kvasir.signIn("chatgpt").catch((x: unknown) => x))).toEqual({ code: "not_a_person", needs: [] });
    answering(409, { error: { code: "conflict", message: "in the list already" } });
    expect(grantRefusalOf(await kvasir.local.download({ repo: "owner/name" }).catch((x: unknown) => x))).toBeNull();
    expect(grantRefusalOf(new Error("no body"))).toBeNull();
  });

  it("send a start and a stop to their doors, and keep the code of a refusal to start (record 24)", async () => {
    const calls = answering(202, {});
    await kvasir.local.start(3);
    await kvasir.local.stop(3);
    expect(calls).toEqual([
      { method: "POST", url: "/kvasir/v1/local/models/3/start", body: {} },
      { method: "POST", url: "/kvasir/v1/local/models/3/stop", body: {} },
    ]);
    answering(409, { error: { code: "runtime_unreachable", message: "the runtime did not answer" } });
    const e = await kvasir.local.start(3).catch((x: unknown) => x);
    expect(localRefusalOf(e)).toMatchObject({ status: 409, code: "runtime_unreachable", message: "the runtime did not answer" });
  });
});
