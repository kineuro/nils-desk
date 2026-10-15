// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A rule change the assistant proposed, in the one chat (record 56, 6.4): the
// turn draws the Rules page's own approval card, read from the engine's
// proposal, with its effect and any answer it breaks; Change it hands the
// words back to the person; Adopt is the person's, on the engine's decide
// door, never the assistant's; and a rule change that names no proposal
// draws nothing to decide.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { PROPOSAL_FULL, PROPOSAL_SCOPED } from "../review/rules.fixture";
import { AssistantPage } from "./AssistantPage";
import { fakeDoors, text } from "./onechat.fixture";
import { reads } from "./reads";

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
  vi.unstubAllGlobals();
});

const caps = (): Capabilities => ({
  ...caps7a(["PUT /api/ask/selections/{name}", "POST /api/ask/profile", "GET /api/packs/{name}/proposals/{id}", "POST /api/packs/{name}/proposals/{id}/decide", "POST /api/packs/{name}/proposals/{id}/rehearse", "GET /api/instances/{stack}/thumb"]),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
});

const turn = (ref: Record<string, unknown>) => [
  { type: "message-appended", message: { id: "u5", role: "user", parts: [text("ward-c writes mdc for contrast. Fix the rules.")] } },
  { type: "message-started", messageId: "a5" },
  { type: "message-delta", messageId: "a5", kind: "text", delta: "I proposed one change, for ward-c alone." },
  { type: "data-part", messageId: "a5", data: { kind: "approval", id: "r5", change: "rule_change", sentence: "Add mdc to post_contrast given for ward-c", ref } },
  { type: "message-completed", messageId: "a5" },
  { type: "submission-settled", outcome: "completed" },
];

async function mount(ref: Record<string, unknown>) {
  const doors = fakeDoors(turn(ref));
  const e = engine((c, nth) => {
    const u = new URL(c.url, "http://x");
    if (u.pathname === "/api/packs/mri/proposals/13" && c.method === "GET") return { status: 200, body: PROPOSAL_SCOPED };
    if (u.pathname === "/api/packs/mri/proposals/12" && c.method === "GET") return { status: 200, body: PROPOSAL_FULL };
    if (u.pathname === "/api/packs/mri/proposals/13/decide") return { status: 202, body: { proposal: 13, status: "adopted", job: 900, version: null, scopes: ["dataset:ward-c"] } };
    return doors(c, nth);
  });
  act(() => root.render(<AssistantPage caps={caps()} conversation="c1" />));
  await settle(12);
  // the stream answers the turn once a message is sent
  const box = host.querySelector<HTMLTextAreaElement>("textarea")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "ward-c writes mdc for contrast. Fix the rules.");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => button(host, "Send")!.click());
  await settle(16);
  return e;
}

describe("a rule change in the one chat", () => {
  it("is the Rules page's own approval card, read from the engine's proposal", async () => {
    await mount({ proposal: 13, pack: "mri" });
    const card = host.querySelector<HTMLElement>(".rule-card")!;
    expect(card).not.toBeNull();
    expect(card.querySelector(".approval-kind")?.textContent).toBe("Rule changewaits for you");
    expect(card.querySelector(".approval-title")?.textContent).toBe('Add "mdc" to post_contrast given, for dataset ward-c');
    expect(card.querySelector(".rule-line")?.textContent).toBe("Moves 12 scans · post_contrast not_given → given, 12 · fixes 4, breaks 0");
    expect([...card.querySelectorAll(".approval-foot button")].map((b) => b.textContent)).toEqual(["Adopt", "Change it", "Reject", "Details"]);
    // the generic card is not drawn beside it
    expect(host.querySelectorAll('.approval-card[data-change="rule_change"]')).toHaveLength(0);
  });

  it("says the answers it breaks with their scans, before any button", async () => {
    await mount({ proposal: 12 });
    const card = host.querySelector<HTMLElement>(".rule-card")!;
    expect(card.querySelector(".rx-breaks-head")?.textContent).toBe("Breaks 3 answers people settled");
    expect(card.querySelectorAll(".rx-breaks .rx-scan img")).toHaveLength(3);
  });

  it("hands Change it back to the person's words, and Adopt to the engine's decide door, never the assistant's", async () => {
    const e = await mount({ proposal: 13, pack: "mri" });
    const card = host.querySelector<HTMLElement>(".rule-card")!;
    act(() => button(card, "Change it")!.click());
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    act(() => button(card, "Adopt")!.click());
    await settle(6);
    expect(e.of("POST", "/api/packs/mri/proposals/13/decide")[0].body).toEqual({ decision: "adopt" });
    expect(e.calls.filter((c) => c.url.startsWith("/assistant/changes/"))).toHaveLength(0);
    expect(host.querySelector(".rule-card .approval-kind .tag")?.textContent).toBe("adopted");
  });

  it("draws nothing to decide where the part names no proposal", async () => {
    await mount({});
    expect(host.querySelector(".rule-card")).toBeNull();
    expect(host.querySelectorAll('.approval-card[data-change="rule_change"]')).toHaveLength(0);
    expect(host.textContent).toContain("I proposed one change, for ward-c alone.");
  });
});
