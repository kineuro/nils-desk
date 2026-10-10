// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A turn of several steps on the Assistant page (2026-10-09): a step ends
// where it calls a tool, and the answer stays open while the tool runs and
// the next steps follow. The live line says what the running tool does, and
// the answer's ratings and Ask again wait until the turn settles. Against a
// fake assistant whose stream answers when the test writes to it
// (stream.fixture.ts).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { AssistantPage } from "./AssistantPage";
import { chatsKept } from "./chats";
import { fakeAssistant } from "./stream.fixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  chatsKept.put({ conversations: [], next: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const caps = (): Capabilities => ({
  ...caps7a([]),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
});

const ASKED = { id: "u1", role: "user", display: "visible", submissionId: "sub_1", parts: [{ type: "text", text: "Which datasets have a FLAIR?" }] };
const line = () => host.querySelector(".status-line")?.textContent?.trim() ?? null;

describe("a turn of several steps", () => {
  it("says what a step's tool does while it runs, and offers the ratings and Ask again once the turn settles", async () => {
    const a = fakeAssistant({ chat: { id: "c7", station: "nils", title: "FLAIR in the datasets", title_by: "model" } });
    a.write({ type: "message-appended", message: ASKED }, { type: "message-started", messageId: "a1", submissionId: "sub_1" });
    a.keep([ASKED, { id: "a1", role: "assistant", display: "visible", submissionId: "sub_1", parts: [] }]);
    act(() => root.render(<AssistantPage caps={caps()} conversation="c7" />));
    await settle(12);
    expect(a.open()).toBe(1);

    // the first step ends where it calls a tool, which then runs
    a.write({ type: "tool-input", messageId: "a1", toolCallId: "t1", toolName: "activate_skill", input: { name: "find-data" } }, { type: "message-completed", messageId: "a1" });
    await settle(10);
    expect(line()).toBe("Finding the data");
    expect(button(host, "A good answer")).toBeNull();
    expect(button(host, "Ask for this answer again")).toBeNull();

    // the next step writes the answer; the turn has not settled yet
    a.write(
      { type: "tool-output", toolCallId: "t1", output: "ok" },
      { type: "message-started", messageId: "a1", submissionId: "sub_1" },
      { type: "message-delta", messageId: "a1", kind: "text", delta: "Two of them have a FLAIR: ds-a and ds-b." },
      { type: "message-completed", messageId: "a1" },
    );
    await settle(10);
    expect(host.querySelector(".said:not(.you) > .md")?.textContent).toBe("Two of them have a FLAIR: ds-a and ds-b.");
    expect(button(host, "A good answer")).toBeNull();
    expect(button(host, "Stop")).not.toBeNull();

    a.write({ type: "submission-settled", submissionId: "sub_1", outcome: "completed" });
    await settle(10);
    expect(button(host, "A good answer")).not.toBeNull();
    expect(button(host, "Ask for this answer again")).not.toBeNull();
    expect(button(host, "Send")).not.toBeNull();
    expect(line()).toBeNull();
  });
});
