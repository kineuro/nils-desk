// SPDX-License-Identifier: AGPL-3.0-only
// A model Kvasir holds, as its card draws (record 25): its name, where it runs
// in a few words with the rest as a hover title, one tag, and how many
// stations it answers with their names as a hover title; its check, its key
// and its removal along the bottom for a person with Kvasir: Work, and nothing
// to act on for anyone else.

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
  it("names the model, where it runs with the rest as a hover title, its tag and the stations it answers, with a server's check and removal along the bottom", () => {
    const [html] = drawn(admin);
    expect(html).toContain('<span class="card-name path" title="qwen36-27b-fast">qwen36-27b-fast</span>');
    expect(html).toContain('<div class="where"><span class="sq">');
    expect(html).toContain('<span class="meta" title="SGLang · 131,072 tokens · http://127.0.0.1:30000/v1">Your server</span>');
    expect(html).toMatch(/<span class="tag ok" title="admitted on 15 Sept?"><span class="dot ok"><\/span>admitted<\/span>/u);
    expect(html).toContain('<span class="meta" title="keyword-tune">answers 1 station</span>');
    expect(html).toMatch(/<div class="row acts"><button type="button" class="button secondary small">Check<\/button>/u);
    expect(html).toContain('<summary class="button quiet small" aria-label="More for qwen36-27b-fast">');
    expect(html).toContain(">Remove</button>");
  });

  it("offers a provider's key and its removal, and says it leaves your systems", () => {
    const [, html] = drawn(admin);
    expect(html).toContain('<span class="sq caution">');
    expect(html).toContain('<span class="meta" title="key kept by Kvasir">MiniMax</span>');
    expect(html).toContain('<span class="tag caution">leaves your systems</span>');
    expect(html).toContain(">Replace key</button>");
    expect(html).toContain(">Forget the key</button>");
    expect(html).toContain(">Remove</button>");
  });

  it("shows anyone else the model, where it runs and what it answers, with nothing to act on", () => {
    const [server, provider] = drawn(person);
    expect(server).toContain('<span class="meta" title="131,072 tokens">Your server</span>');
    expect(server).not.toContain("SGLang");
    expect(server).not.toContain("127.0.0.1");
    expect(server).not.toContain("<button");
    expect(server).not.toContain("<summary");
    expect(provider).toContain('<span class="meta">MiniMax</span>');
    expect(provider).not.toContain("key kept");
    expect(provider).not.toContain("<button");
  });
});
