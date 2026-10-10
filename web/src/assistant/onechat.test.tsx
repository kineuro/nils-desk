// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant as Nima confirmed it on the canvas (2026-10-09): messages
// first with one menu in the head; a query answer as one quiet card; Open
// puts it on a panel beside the chat that follows the conversation, where
// bars and conditions change the question by the engine's moves and Keep
// records the version; a plan waits for Approve, Change it or Not now; a
// question's choices are outlined buttons. Against a fake assistant and
// engine that answer by door and keep every call.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
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
  ...caps7a(["PUT /api/ask/selections/{name}", "POST /api/ask/profile"]),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
});

/** The fake assistant and engine, keeping every call; `turn` is what the stream answers after a message is sent. */
const doors = (turn: unknown[] = []) => engine(fakeDoors(turn));

async function mount(turn: unknown[] = []) {
  const e = doors(turn);
  act(() => root.render(<AssistantPage caps={caps()} conversation="c1" />));
  await settle(12);
  return e;
}

const cards = () => [...host.querySelectorAll<HTMLElement>(".qcard")];
const panel = () => host.querySelector<HTMLElement>("aside.qpanel");
/** An element's words, a space between the words of each part. */
const words = (el: Element | null): string => {
  if (!el) return "";
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out.join(" ");
};

describe("the Assistant, messages first", () => {
  it("shows the person's words in boxes, the answers as text, and one menu in the head instead of a row of buttons", async () => {
    await mount();
    const head = host.querySelector(".one-chat-head")!;
    expect(words(head.querySelector("h1"))).toBe("T1 with contrast in study-big");
    expect(words(head.querySelector(".tag"))).toBe("qwen38-27b · this machine");
    expect([...head.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Share, rename, pin, archive, export, delete"]);
    expect(button(host, "Share")).toBeNull();
    expect(button(host, "Delete")).toBeNull();
    const asked = [...host.querySelectorAll(".said.you")].map(words);
    expect(asked).toHaveLength(4);
    expect(asked[0]).toBe("How many T1 scans with contrast are in study-big?");
    expect(words(host.querySelector(".one-chat-foot"))).toBe("6% of 256k It reads what you may read, and proposes; you decide.");
    act(() => button(head, "Share, rename, pin, archive, export, delete")!.click());
    expect([...host.querySelectorAll('[role="menuitem"]')].map(words)).toEqual(["Share", "Rename", "Pin", "Archive", "Export", "Delete"]);
  });

  it("renames in the head from the menu", async () => {
    const e = await mount();
    act(() => button(host, "Share, rename, pin, archive, export, delete")!.click());
    act(() => button(host, "Rename")!.click());
    const name = host.querySelector<HTMLInputElement>('input[aria-label="The conversation\'s name"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "T1 in study-big");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(host, "Save")!.click());
    await settle();
    expect(e.of("PATCH", "/assistant/conversations/c1")[0].body).toEqual({ title: "T1 in study-big" });
  });
});

describe("a query answer", () => {
  it("is one quiet card: Query and its version, its title, Open, the funnel as subjects, visits and scans, and three bars; nothing to accept on it", async () => {
    await mount();
    expect(cards()).toHaveLength(2);
    const first = cards()[0];
    expect(words(first.querySelector(".eyebrow"))).toBe("Query · v1");
    expect(words(first.querySelector(".qcard-title"))).toBe("T1 with contrast in study-big");
    expect([...first.querySelectorAll(".qstep")].map(words)).toEqual(["subjects 48", "visits session 61", "scans stack 212"]);
    expect(words(first.querySelector(".qstep.on"))).toBe("scans stack 212");
    expect([...first.querySelectorAll(".qbar")].map(words)).toEqual(["T1w 174 scans 44 subjects", "T2w 30 scans 12 subjects", "FLAIR 8 scans 5 subjects"]);
    expect(words(cards()[1].querySelector(".eyebrow"))).toBe("Query · v2");
    for (const w of ["Accept", "Disregard", "Keep v1", "Keep v2"]) expect(button(host.querySelector(".one-chat-thread")!, w)).toBeNull();
    expect(host.querySelector(".one-chat-thread")!.textContent).not.toMatch(/\bpeople\b/);
  });
});

describe("the query panel", () => {
  it("opens beside the chat, which narrows to one line per version, with the conditions, the funnel against the version before, the charts and the versions", async () => {
    await mount();
    act(() => button(cards()[1], "Open")!.click());
    await settle(10);
    const p = panel()!;
    expect(p).not.toBeNull();
    expect(host.querySelector(".one-chat")!.classList.contains("with-panel")).toBe(true);
    expect(words(p.querySelector(".qpanel-title"))).toBe("3D T1 with contrast, with FLAIR");
    expect([...p.querySelectorAll(".qversion")].map((b) => [words(b), b.getAttribute("aria-pressed")])).toEqual([
      ["v1", "false"],
      ["v2", "true"],
    ]);
    expect(button(p, "Save as a selection")).not.toBeNull();
    expect(button(p, "Keep v2")).not.toBeNull();
    expect([...p.querySelectorAll(".qcond")].map(words)).toEqual(["in study-big", "T1w", "with contrast", "3D"]);
    expect(button(p, "Add a condition")).not.toBeNull();
    expect([...p.querySelectorAll(".qfunnel .qstep")].map(words)).toEqual(["subjects 41 of 48", "visits session 52 of 61", "scans stack 139 of 212"]);
    expect([...p.querySelectorAll('[role="tab"]')].map(words)).toEqual(["Scan kinds", "By a field", "Subjects", "Clinical", "Pictures"]);
    expect([...p.querySelectorAll("button.qbar")].map(words)).toEqual(["T1w 96 scans 30 subjects", "T2w 31 scans 12 subjects", "FLAIR 12 scans 6 subjects"]);
    // the chat keeps a line per version, the one open marked
    expect([...host.querySelectorAll(".qcard-row")].map(words)).toEqual(["T1 with contrast in study-big v1", "3D T1 with contrast, with FLAIR v2 · open"]);
    expect(host.querySelector<HTMLTextAreaElement>("textarea")!.placeholder).toBe("Change this query, or ask anything");
    // another version from the line, and back to the chat
    act(() => button(p, "v1")!.click());
    await settle(8);
    expect(words(panel()!.querySelector(".qpanel-title"))).toBe("T1 with contrast in study-big");
    act(() => button(panel()!, "Close the query")!.click());
    expect(panel()).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it("keeps a proposed version as the next of the one it was made from, through the assistant's feedback", async () => {
    const e = await mount();
    act(() => button(cards()[1], "Open")!.click());
    await settle(10);
    act(() => button(panel()!, "Keep v2")!.click());
    await settle();
    expect(e.of("POST", "/assistant/conversations/c1/feedback")[0].body).toEqual({ accepted: [{ document: 102, sentence: "Only 3D, with a FLAIR in the visit.", current: 101 }], rejected: [] });
    expect(e.of("POST", "/api/ask/documents")[0].body).toEqual({ document_id: 102, parent: 101 });
    expect(words(panel()!.querySelector(".tag.ok"))).toBe("kept");
    expect(button(panel()!, "Keep v2")).toBeNull();
  });

  it("narrows the question when a bar is clicked and takes a condition away with its x, each the next version, shown at once", async () => {
    const e = await mount();
    act(() => button(cards()[1], "Open")!.click());
    await settle(10);
    act(() => button(panel()!, /^\s*T2w/)!.click());
    await settle(12);
    const narrowed = e.of("POST", "/api/ask/apply")[0].body!;
    expect(narrowed).toMatchObject({ document_id: 102, set: "scans", token: "tok-scans", moves: [{ move_id: 7, args: { axis: "base", value: "T2w" } }] });
    // building on a proposal keeps it first
    expect(e.of("POST", "/assistant/conversations/c1/feedback")).toHaveLength(1);
    expect([...panel()!.querySelectorAll(".qversion")].map((b) => [words(b), b.getAttribute("aria-pressed")])).toEqual([
      ["v1", "false"],
      ["v2", "false"],
      ["v3", "true"],
    ]);
    expect([...panel()!.querySelectorAll(".qcond")].map(words)).toContain("T2w");
    act(() => button(panel()!, "Take away with contrast")!.click());
    await settle(12);
    expect(e.of("POST", "/api/ask/apply")[1].body).toMatchObject({ document_id: 103, set: "scans", moves: [{ move_id: 4, args: { index: 1 } }] });
  });

  it("follows the conversation: a version the assistant proposes while it is open comes onto the panel", async () => {
    const turn = [
      { type: "message-appended", message: { id: "u5", role: "user", parts: [text("Only women.")] } },
      { type: "message-started", messageId: "a5" },
      { type: "message-delta", messageId: "a5", kind: "text", delta: "80 of them are women's." },
      { type: "data-part", messageId: "a5", data: { kind: "approval", id: "q5", change: "query_version", sentence: "Only women.", ref: { document: 105, parent: 102 } } },
      { type: "message-completed", messageId: "a5" },
      { type: "submission-settled", outcome: "completed" },
    ];
    const e = await mount(turn);
    act(() => button(cards()[0], "Open")!.click());
    await settle(10);
    expect(words(panel()!.querySelector(".qversion.on"))).toBe("v1");
    const box = host.querySelector<HTMLTextAreaElement>("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Only women.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button(host, "Send")!.click());
    await settle(16);
    // the prompt carried the version on the panel
    expect(e.of("POST", "/assistant/agents/nils/c1")[0].body).toMatchObject({ body: "Only women.", document: 101, context: { document_id: 101 } });
    expect(words(panel()!.querySelector(".qpanel-title"))).toBe("3D T1 with contrast in women");
    expect(words(panel()!.querySelector(".qversion.on"))).toBe("v3");
    expect(words(host.querySelector(".qcard-row.on"))).toBe("3D T1 with contrast in women v3 · open");
  });

  it("offers to list the scans where the answer only counts them", async () => {
    await mount();
    act(() => button(cards()[1], "Open")!.click());
    await settle(10);
    act(() => button(panel()!, "Pictures")!.click());
    await settle(6);
    expect(words(panel()!.querySelector(".qpictures-none"))).toBe("The pictures show once the answer lists its scans. List the scans");
  });
});

describe("what waits for the person", () => {
  it("is a plan card: its kind, waits for you, its steps, and Approve, Change it and Not now", async () => {
    const e = await mount();
    const plan = host.querySelector<HTMLElement>('.approval-card[data-change="job_plan"]')!;
    expect(words(plan.querySelector(".approval-kind"))).toBe("Plan waits for you");
    expect(words(plan.querySelector(".approval-title"))).toBe("Sort study-big's new files, tonight at 22:00");
    expect([...plan.querySelectorAll("ol li")].map(words)).toEqual(["Read the new files, about 1,200", "Sort them, then pick the main scans", "Make their pictures"]);
    expect([...plan.querySelectorAll(".approval-foot button")].map(words)).toEqual(["Approve", "Change it", "Not now"]);
    act(() => button(plan, "Change it")!.click());
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    act(() => button(plan, "Approve")!.click());
    await settle();
    expect(e.of("POST", "/assistant/changes/ch1/decide")[0].body).toEqual({ verdict: "approved" });
    expect(words(plan.querySelector(".approval-kind"))).toBe("Plan approved");
    expect(plan.querySelector(".approval-foot")).toBeNull();
  });

  it("is a question with its choices as outlined buttons, a click answering it", async () => {
    const e = await mount([{ type: "submission-settled", outcome: "completed" }]);
    const q = host.querySelector(".ask-choice")!;
    expect(words(q.querySelector("p"))).toBe("There is no ALS cohort yet. Which did you mean?");
    expect([...q.querySelectorAll(".ask-option")].map(words)).toEqual(["Make an ALS cohort", "nmosd 17", "All cohorts"]);
    act(() => button(q, /^nmosd/)!.click());
    await settle(8);
    expect(e.of("POST", "/assistant/agents/nils/c1")[0].body).toMatchObject({ kind: "user", body: "nmosd" });
  });
});
