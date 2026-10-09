// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Leaving the Assistant page never stops or hides a turn (2026-10-09): the
// first message of a new conversation, the page left while the model starts,
// and the conversation opened again by its address, which the side's list and
// the browser's Back open too. The turn is followed to its answer, and while
// nothing has come back for five seconds its line says the model is starting.
// Against a fake assistant whose stream answers when the test writes to it,
// and whose long poll waits, as the runtime's does, until it is let go.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { AssistantPage } from "./AssistantPage";
import { chatsKept } from "./chats";
import { INBOX } from "./onechat.fixture";
import type { Chunk, History } from "./parts";
import { STARTING } from "./steps";

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

const CHAT = {
  id: "c9",
  station: "nils",
  title: "Which datasets have a FLAIR?",
  title_by: "words",
  lineage: null,
  document: null,
  created_at: "2026-10-09T19:07:29Z",
  updated_at: "2026-10-09T19:07:29Z",
  pinned: false,
  archived: false,
  forked_from: null,
  shared: false,
};

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

/** The fake assistant, keeping every call: the stream grows when the test writes to it, and the history is what the test says the runtime keeps. */
function fakeAssistant() {
  const calls: { method: string; url: string }[] = [];
  const stream: Chunk[] = [];
  let history: History | null = null;
  const waiting = new Set<() => void>();
  const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  const aborted = () => new DOMException("The page let it go", "AbortError");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = new URL(String(input), "http://desk");
      calls.push({ method, url: String(input) });
      const at = (path: string) => u.pathname === path;
      if (at("/assistant/conversations")) return answer(method === "POST" ? CHAT : { conversations: [CHAT], next: null });
      if (at("/assistant/conversations/c9")) return answer({ ...CHAT, proposals: [] });
      if (at("/assistant/conversations/c9/title")) return answer({ ...CHAT, title_by: "model" });
      if (at("/desk/assistant/conversations/c9/token")) return answer({});
      if (at("/assistant/inbox")) return answer(INBOX);
      if (at("/assistant/agents/nils/c9") && method === "POST") return answer({ submissionId: "sub_1" }, 202, { "Stream-Next-Offset": String(stream.length - 1) });
      if (at("/assistant/agents/nils/c9") && u.searchParams.get("view") === "history") return history ? answer(history, 200, { "Stream-Next-Offset": history.offset ?? "-1" }) : answer({ error: "no stream" }, 404);
      if (at("/assistant/agents/nils/c9") && u.searchParams.get("live") === "long-poll") {
        const from = Number(u.searchParams.get("offset"));
        // the long poll waits for what comes after its offset, or until the page lets it go
        while (stream.length - 1 <= from) {
          if (init?.signal?.aborted) throw aborted();
          await new Promise<void>((wake, fail) => {
            const woken = () => {
              waiting.delete(woken);
              wake();
            };
            waiting.add(woken);
            init?.signal?.addEventListener(
              "abort",
              () => {
                waiting.delete(woken);
                fail(aborted());
              },
              { once: true },
            );
          });
        }
        return answer(stream.slice(from + 1), 200, { "Stream-Next-Offset": String(stream.length - 1) });
      }
      // the stream as server-sent events is not served here, so the page long-polls
      return answer({ error: `no door ${method} ${u.pathname}` }, 404);
    }),
  );
  return {
    calls,
    /** What the runtime writes next; every long poll waiting is answered. */
    write(...chunks: Chunk[]) {
      stream.push(...chunks);
      for (const wake of [...waiting]) wake();
    },
    /** The history the runtime serves from now on, at the stream's offset. */
    keep(messages: History["messages"], settlements: NonNullable<History["settlements"]> = []) {
      history = { offset: String(stream.length - 1), messages, settlements };
    },
    /** How many long polls are open now. */
    open: () => waiting.size,
  };
}

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
    const a = fakeAssistant();
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
    const a = fakeAssistant();
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
    const a = fakeAssistant();
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
