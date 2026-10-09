// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Leaving the Assistant page never stops or hides a turn (2026-10-09): the
// first message of a new conversation, the page left while the model starts,
// and the conversation opened again by its address, which the side's list and
// the browser's Back open too. The turn is followed to its answer, and while
// nothing has come back for five seconds its line says the model is starting.
// Against a fake assistant whose stream answers when the test writes to it
// (stream.fixture.ts).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { AssistantPage } from "./AssistantPage";
import { chatsKept } from "./chats";
import type { Chunk } from "./parts";
import { STARTING } from "./steps";
import { fakeAssistant } from "./stream.fixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  chatsKept.put({ conversations: [], next: null });
  location.hash = "";
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
  ...caps7a([]),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
});

/** The conversation made on the page. */
const CHAT = { id: "c9", station: "nils", title: "Which datasets have a FLAIR?", title_by: "words" } as const;

/** The conversation as the runtime writes it, chunk by chunk: the person's words, then the answer's steps and words. */
const ASKED = { id: "u1", role: "user", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Which datasets have a FLAIR?" }] };
const BEGUN: Chunk[] = [
  { type: "conversation-reset", snapshot: { offset: "0", messages: [], settlements: [] } },
  { type: "message-appended", message: ASKED },
  { type: "message-started", messageId: "a1", submissionId: "sub_1" },
];
const STEP: Chunk[] = [
  { type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "activate_skill", input: { name: "find-data" } },
  { type: "tool-output", toolCallId: "t1", output: "ok" },
];
const ANSWERED: Chunk[] = [
  { type: "message-delta", messageId: "a1", kind: "text", delta: "Two of them have a FLAIR: ds-a and ds-b." },
  { type: "message-completed", messageId: "a1" },
  { type: "submission-settled", submissionId: "sub_1", outcome: "completed" },
];

/** The first message of a new conversation, typed and sent. */
async function ask(words: string, flush: () => Promise<void>) {
  act(() => root.render(<AssistantPage caps={caps()} conversation={null} />));
  await flush();
  const box = host.querySelector<HTMLTextAreaElement>("textarea")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, words);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => button(host, "Send")!.click());
  await flush();
}

const said = () => [...host.querySelectorAll(".said:not(.you) > .md")].map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "");
const line = () => host.querySelector(".status-line")?.textContent?.trim() ?? null;

describe("a turn the person left", () => {
  it("is followed to its answer when its conversation, made on the page moments before, is opened again by its address", async () => {
    const a = fakeAssistant({ chat: CHAT });
    await ask("Which datasets have a FLAIR?", () => settle(10));
    expect(location.hash).toBe("#assistant/c9");
    a.write(...BEGUN);
    await settle(10);
    expect([...host.querySelectorAll(".said.you")].map((el) => el.textContent)).toEqual(["Which datasets have a FLAIR?"]);
    expect(button(host, "Stop")).not.toBeNull();
    expect(line()).toBe("Thinking");

    // the person goes to another page while the model starts; the turn goes on without the page
    act(() => root.render(<p>Data</p>));
    await settle(4);
    expect(a.open()).toBe(0);
    expect(a.calls.filter((c) => c.url.endsWith("/abort"))).toEqual([]);
    a.write(...STEP);
    a.keep([ASKED, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [{ type: "dynamic-tool", toolCallId: "t1", toolName: "activate_skill", state: "output-available" }] }]);

    // and comes back to it: the turn shows as running, with nothing to ask again yet
    act(() => root.render(<AssistantPage caps={caps()} conversation="c9" />));
    await settle(12);
    expect([...host.querySelectorAll(".said.you")].map((el) => el.textContent)).toEqual(["Which datasets have a FLAIR?"]);
    expect(button(host, "Stop")).not.toBeNull();
    expect(button(host, "Ask for this answer again")).toBeNull();
    expect(line()).toBe("Thinking");
    expect(a.open()).toBe(1);

    // the answer arrives where the page follows it
    a.write(...ANSWERED);
    await settle(12);
    expect(said()).toContain("Two of them have a FLAIR: ds-a and ds-b.");
    expect(button(host, "Stop")).toBeNull();
    expect(button(host, "Send")).not.toBeNull();
    expect(button(host, "Ask for this answer again")).not.toBeNull();
    expect(line()).toBeNull();
    expect(a.open()).toBe(0);
    // and the question was sent once
    expect(a.calls.filter((c) => c.method === "POST" && c.url === "/assistant/agents/nils/c9")).toHaveLength(1);
  });

  it("shows the answer that settled while the person was away", async () => {
    const a = fakeAssistant({ chat: CHAT });
    await ask("Which datasets have a FLAIR?", () => settle(10));
    a.write(...BEGUN);
    await settle(10);
    act(() => root.render(<p>Data</p>));
    await settle(4);
    a.write(...STEP, ...ANSWERED);
    a.keep([ASKED, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Two of them have a FLAIR: ds-a and ds-b." }] }], [{ submissionId: "sub_1", outcome: "completed" }]);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c9" />));
    await settle(12);
    expect(said()).toContain("Two of them have a FLAIR: ds-a and ds-b.");
    expect(button(host, "Send")).not.toBeNull();
    expect(line()).toBeNull();
    expect(a.open()).toBe(0);
  });
});

describe("a turn that has said nothing yet", () => {
  /** Every promise the last act started, settled, after the clock moved on by `ms`. */
  const tick = async (ms = 0) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    for (let i = 0; i < 10; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
  };

  it("says the model is starting after five seconds, until its first step, and again when the page is opened during the wait", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const a = fakeAssistant({ chat: CHAT });
    await ask("Which datasets have a FLAIR?", () => tick());
    a.write(...BEGUN);
    await tick();
    expect(line()).toBe("Thinking");
    await tick(4_000);
    expect(line()).toBe("Thinking");
    await tick(1_000);
    expect(line()).toBe(STARTING);

    // left and opened again while the model still says nothing: the same five seconds, then the same line
    act(() => root.render(<p>Data</p>));
    await tick();
    a.keep([ASKED, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [] }]);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c9" />));
    await tick();
    expect(line()).toBe("Thinking");
    await tick(5_000);
    expect(line()).toBe(STARTING);

    // the first step: the line says what it does
    a.write(...STEP.slice(0, 1));
    await tick();
    expect(line()).toBe("Finding the data");
    a.write(...STEP.slice(1), ...ANSWERED);
    await tick();
    expect(line()).toBeNull();
    expect(said()).toContain("Two of them have a FLAIR: ds-a and ds-b.");
  });
});

describe("a conversation still named by its first words", () => {
  const settledAway = (a: ReturnType<typeof fakeAssistant>) =>
    a.keep([ASKED, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Two of them have a FLAIR: ds-a and ds-b." }] }], [{ submissionId: "sub_1", outcome: "completed" }]);

  it("is named by the model when it opens and finds its first turn settled while the page was away", async () => {
    const a = fakeAssistant({ chat: { id: "c11", station: "nils", title: "Which datasets have a FLAIR?", title_by: "words" }, named: "FLAIR in the datasets" });
    settledAway(a);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c11" />));
    await settle(16);
    expect(a.of("POST", "/assistant/conversations/c11/title")).toHaveLength(1);
    expect(host.querySelector(".one-chat-head h1")?.textContent).toBe("FLAIR in the datasets");
  });

  it("asks for the name once, not on every open, when the name does not come", async () => {
    const a = fakeAssistant({ chat: { id: "c12", station: "nils", title: "Which datasets have a FLAIR?", title_by: "words" } });
    settledAway(a);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c12" />));
    await settle(16);
    act(() => root.render(<p>Data</p>));
    await settle(4);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c12" />));
    await settle(16);
    expect(a.of("POST", "/assistant/conversations/c12/title")).toHaveLength(1);
    expect(host.querySelector(".one-chat-head h1")?.textContent).toBe("Which datasets have a FLAIR?");
  });

  it("is not asked for a name while its turn still runs", async () => {
    const a = fakeAssistant({ chat: { id: "c13", station: "nils", title: "Which datasets have a FLAIR?", title_by: "words" }, named: "FLAIR in the datasets" });
    a.write({ type: "message-appended", message: ASKED });
    a.keep([ASKED]);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c13" />));
    await settle(16);
    expect(a.of("POST", "/assistant/conversations/c13/title")).toHaveLength(0);
  });
});
