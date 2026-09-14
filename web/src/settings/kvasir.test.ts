// SPDX-License-Identifier: AGPL-3.0-only
// Kvasir's doors as the desk calls them: a refusal in Kvasir's words with its
// status, what each model said when an add was refused, a door not served
// yet, and where a purpose may go.

import { afterEach, describe, expect, it, vi } from "vitest";
import { type Backend, KvasirError, kvasir, opening, type PurposeRow, triedOf } from "./kvasir";

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
});
