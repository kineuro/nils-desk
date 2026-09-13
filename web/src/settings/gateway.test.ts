// SPDX-License-Identifier: AGPL-3.0-only
// The Gateway and models page's words: the gateway's health, the machine's
// card, each model's line and admission, and what may leave by purpose.

import { describe, expect, it } from "vitest";
import { admissionWords, gatewayHealth, machineWords, modelMeta, purposeLines, stationOf, targets, usedFor, whereWords } from "./gateway";
import type { AdmissionRecord, Backend, PurposeRow } from "./kvasir";
import type { Install } from "./supervise";

const local: Backend = { id: "local", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["qwen38-27b"], health: { warming: false, running: 1, concurrency: 8 } };
const minimax: Backend = { id: "minimax", kind: "anthropic-messages", locality: "remote", provider: "minimax", credential: true, models: ["MiniMax-M3"], health: { warming: false, running: 0, concurrency: 4 } };

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

describe("the gateway", () => {
  it("says whether it is warm and how busy its streams are", () => {
    expect(gatewayHealth([local, minimax])).toEqual({ tone: "ok", words: "warm", streams: "1 of 12 streams busy" });
    expect(gatewayHealth([{ ...local, health: { warming: true } }])).toEqual({ tone: "caution", words: "warming", streams: null });
    expect(gatewayHealth([])).toEqual({ tone: "caution", words: "no backend", streams: null });
  });

  it("says the machine's card and what it can serve", () => {
    const install = { machine: { card: { name: "NVIDIA GeForce RTX 4090", memory_gb: 23.99 }, advice: ["A 27B model at 4 bit fits with room for the context."] } } as Install;
    expect(machineWords(install)).toEqual({ card: "NVIDIA GeForce RTX 4090, 24 GB", advice: ["A 27B model at 4 bit fits with room for the context."] });
    expect(machineWords(null)).toEqual({ card: null, advice: [] });
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

  it("says its admission from the gateway's records", () => {
    const day = new Date(Date.parse("2026-09-15T10:00:00Z")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    expect(admissionWords("qwen38-27b", local, { id: "qwen38-27b", admitted: true }, [record({})])).toEqual({ tone: "ok", words: `admitted ${day}` });
    expect(admissionWords("qwen38-27b", local, undefined, [record({ passed: false })])).toEqual({ tone: "blocked", words: `did not pass on ${day}` });
    expect(admissionWords("qwen38-27b", local, undefined, [])).toEqual({ tone: "caution", words: "not admitted yet" });
    expect(admissionWords("MiniMax-M3", minimax, undefined, null)).toEqual({ tone: "neutral", words: "not needed for a provider" });
  });

  it("says which stations use its backend", () => {
    const purposes = [purpose({}), purpose({ purpose: "assistant.ask-help" }), purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote" })];
    expect(usedFor(local, purposes)).toBe("concierge, ask-help");
    expect(usedFor(minimax, purposes)).toBe("operator");
    expect(usedFor({ ...local, id: "spare" }, purposes)).toBe("nothing yet");
    expect(stationOf("desk.search")).toBe("desk.search");
  });
});

describe("what may leave", () => {
  it("is said purpose by purpose, with who allowed a move and whether another backend may take it", () => {
    const operator = purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote", default: false, acknowledged: { by: "admin", at: Date.parse("2026-09-16T09:00:00Z"), text: null } });
    const identifiers = purpose({ purpose: "desk.identity", content: "identifiers" });
    const lines = purposeLines([purpose({}), operator, identifiers], [local, minimax]);
    expect(lines[0]).toMatchObject({ station: "concierge", carries: "rows", goesTo: "qwen38-27b, in your systems", locality: "local", allowed: null, movable: true });
    expect(lines[1]).toMatchObject({ station: "operator", carries: "catalogue", goesTo: "MiniMax-M3, a provider", locality: "remote", movable: true });
    expect(lines[1].allowed).toMatch(/^allowed by admin on /);
    expect(lines[2]).toMatchObject({ carries: "identifiers", movable: false });
  });

  it("offers a purpose only the backends it may move to, and says what a move needs", () => {
    expect(targets(purpose({}), [local, minimax])).toEqual([{ backend: minimax, needs: "an acknowledgement" }]);
    expect(targets(purpose({ content: "catalog" }), [local, minimax])).toEqual([{ backend: minimax, needs: "nothing" }]);
    expect(targets(purpose({ content: "identifiers" }), [local, minimax])).toEqual([]);
    expect(targets(purpose({ backend: "minimax", content: "rows" }), [local, minimax])).toEqual([{ backend: local, needs: "nothing" }]);
  });
});
