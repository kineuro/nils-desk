// SPDX-License-Identifier: AGPL-3.0-only
// A model Kvasir holds, as its card draws (record 25): where it runs, its
// admission or where its prompts go and the stations it answers; its check,
// its key and its removal for a person with Kvasir: Work, and nothing to act
// on for anyone else.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BackendCard } from "./cards";
import type { Viewer } from "./gateway";
import type { AdmissionRecord, Backend, PurposeRow } from "./kvasir";
import { backendCards } from "./models";

const now = Date.parse("2026-09-15T12:00:00Z");
const server: Backend = {
  id: "sglang",
  kind: "openai-completions",
  locality: "local",
  provider: null,
  credential: null,
  models: ["qwen36-27b-fast"],
  entries: [{ id: "qwen36-27b-fast", name: "qwen", reasoning: true, context_window: 131072, max_tokens: 8192, admitted: true }],
  base_url: "http://127.0.0.1:30000/v1",
  health: {},
};
const minimax: Backend = { id: "minimax", kind: "openai-completions", locality: "remote", provider: "minimax", credential: true, models: ["MiniMax-M3"], health: {} };
const record: AdmissionRecord = { id: 1, backend: "sglang", model: "qwen36-27b-fast", runtime: { name: "sglang", version: "0.5.2", build: "" }, at: now - 3_600_000, passed: true };
const purposes: PurposeRow[] = [
  { purpose: "assistant.keyword-tune", app: "nils-assistant", content: "rows", kind: "background", backend: "sglang", locality: "local", default: false, acknowledged: null, may_open_remote: "" },
  { purpose: "assistant.operator", app: "nils-assistant", content: "catalog", kind: "foreground", backend: "minimax", locality: "remote", default: false, acknowledged: null, may_open_remote: "" },
];

const admin: Viewer = { work: true, subscribes: true, system: false };
const person: Viewer = { work: false, subscribes: true, system: false };
const drawn = (viewer: Viewer) =>
  backendCards([server, minimax], { viewer, catalogue: [], admissions: [record], purposes, now, checking: null, drawn: [] }).map((card) => renderToStaticMarkup(<BackendCard card={card} work={viewer.work} />));

describe("a model Kvasir holds", () => {
  it("offers a person with Kvasir: Work a server's check and its removal, and says where it runs", () => {
    const [html] = drawn(admin);
    expect(html).toContain('<span class="sq">');
    expect(html).toContain('title="http://127.0.0.1:30000/v1">qwen36-27b-fast</span>');
    expect(html).toContain("Your server · SGLang · 131,072 tokens");
    expect(html).toMatch(/<span class="tag ok"><span class="dot ok"><\/span>admitted 15 Sept?<\/span>/u);
    expect(html).toContain("answers keyword-tune");
    expect(html).toContain(">Check</button>");
    expect(html).toContain('<summary class="button quiet small" aria-label="More for qwen36-27b-fast">');
    expect(html).toContain(">Remove</button>");
  });

  it("offers a provider's key and its removal, and says it leaves your systems", () => {
    const [, html] = drawn(admin);
    expect(html).toContain('<span class="sq caution">');
    expect(html).toContain("MiniMax, a provider · key kept by Kvasir");
    expect(html).toContain('<span class="tag caution">leaves your systems</span>');
    expect(html).toContain(">Replace key</button>");
    expect(html).toContain(">Forget the key</button>");
    expect(html).toContain(">Remove</button>");
  });

  it("shows anyone else the model, where it runs in your systems and what it answers, with nothing to act on", () => {
    const [server, provider] = drawn(person);
    expect(server).toContain("A server in your systems · 131,072 tokens");
    expect(server).not.toContain("SGLang");
    expect(server).not.toContain("127.0.0.1");
    expect(server).not.toContain("<button");
    expect(server).not.toContain("<summary");
    expect(provider).toContain("MiniMax, a provider</span>");
    expect(provider).not.toContain("key kept");
    expect(provider).not.toContain("<button");
  });
});
