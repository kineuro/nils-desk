// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A query card's discussion while its turn says nothing (2026-10-09): as on
// the Assistant page, after five seconds without a step or a word the live
// line says the model is starting, and the first step takes its place.
// Against the fake engine of the Assistant's checks and a fake assistant
// whose stream answers when the test writes to it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { caps7a, dialogs } from "../../test/safeWayIn";
import { chatsKept } from "../assistant/chats";
import { fakeDoors } from "../assistant/onechat.fixture";
import { reads } from "../assistant/reads";
import { STARTING } from "../assistant/steps";
import { type FakeChat, fakeAssistant, listed } from "../assistant/stream.fixture";
import type { Capabilities } from "../capabilities";
import { QueryPage } from "./QueryPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  reads.forget();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const caps = (): Capabilities => ({
  ...caps7a(["PUT /api/ask/selections/{name}", "POST /api/ask/profile"]),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "ask-help" }] },
});

/** Every promise the last act started, settled, after the clock moved on by `ms`. */
const tick = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 12; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
};

const ASKED = { id: "u1", role: "user", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Only women." }] };
const line = () => host.querySelector(".card-talk .status-line")?.textContent?.trim() ?? null;

describe("a query card's discussion", () => {
  it("says the model is starting after five seconds without a step or a word, until the first step", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const chat: FakeChat = { id: "q1", station: "ask-help", title: "Only women", title_by: "model", document: 102 };
    const a = fakeAssistant({ chat, engine: fakeDoors() });
    // the person's conversations, as the side read them: the card's discussion among them
    chatsKept.put({ conversations: [listed(chat)], next: null });
    a.write({ type: "message-appended", message: ASKED }, { type: "message-started", messageId: "a1", submissionId: "sub_1" });
    a.keep([ASKED, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [] }]);
    act(() => root.render(<QueryPage caps={caps()} open="102" />));
    await tick();
    expect(a.open()).toBe(1);
    expect(line()).toBe("Thinking");
    await tick(4_000);
    expect(line()).toBe("Thinking");
    await tick(1_000);
    expect(line()).toBe(STARTING);
    a.write({ type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "query_draft", input: {} });
    await tick();
    expect(line()).toBe("Writing the query");
  });
});
