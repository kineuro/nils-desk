// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Query page card at detail plain where a quasi-identifying field chose
// the answer and it holds 1 to 4 subjects (record 55 K7, small counts, the
// ruling of 2026-10-12): the engine answers those counts as null and names
// them in held_back. Every place on the card says each as held back, why
// on hover, never null, 0 or NaN, and the assistant is handed it as held.
// Against the fake engine of the Assistant's checks.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, settle } from "../../test/safeWayIn";
import { chatsKept } from "../assistant/chats";
import { fakeDoors } from "../assistant/onechat.fixture";
import { reads } from "../assistant/reads";
import { type FakeChat, fakeAssistant, listed } from "../assistant/stream.fixture";
import type { Capabilities } from "../capabilities";
import { QueryPage } from "./QueryPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WHY = "fewer than 5, or held beside a count of fewer than 5 so that it is not found by subtraction";

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
  assistant: { stations: [{ id: "ask-help" }] },
});

const group = (set: string, grain: string, name: string, kept: number | null, subjects: number | null, lost: number | null) => ({ set, grain, group: name, clauses: 1, kept, subjects, lost });
/** The diagnosis by clause: the cohort and its people counted, the scans a where on the sex chose held back. */
const DIAGNOSIS = {
  valid: true,
  issues: [],
  repairs: [],
  warnings: [],
  zero_rows: null,
  drops: [],
  ties: [],
  unresolved: [],
  coarse: [],
  cost: { sets: 4, class: "small" },
  funnel: [{ set: "scans", grain: "stack", stage: "where", rows: null, subjects: null, on_path: true, held_back: WHY }],
  next: [],
  by: "clause",
  groups: [group("people", "subject", "source", 48, 48, 0), group("scans", "stack", "source", 212, 48, 0), group("scans", "stack", "where", null, null, null)],
};

function open() {
  const doors = fakeDoors([], { held: [102] });
  const chat: FakeChat = { id: "q1", station: "ask-help", title: "Only women", title_by: "model", document: 102 };
  const a = fakeAssistant({
    chat,
    engine: (c, nth) => {
      const u = new URL(c.url, "http://x");
      if (u.pathname === "/api/ask/diagnose") return { status: 200, body: DIAGNOSIS };
      if (u.pathname === "/api/ask/preview") return { status: 200, body: { level: "count", columns: ["rows", "subjects"], rows: [[null, null]], truncated: false, shaped: [], held_back: [{ column: "rows", why: WHY }, { column: "subjects", why: WHY }] } };
      return doors(c, nth);
    },
  });
  chatsKept.put({ conversations: [listed(chat)], next: null });
  act(() => root.render(<QueryPage caps={caps()} open="102" />));
  return a;
}

/** An element's words, a space between the words of each part. */
const words = (el: Element | null | undefined): string => {
  if (!el) return "";
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) out.push(n.textContent.trim());
  return out.join(" ");
};
const panelOf = (title: RegExp) => [...host.querySelectorAll<HTMLElement>(".panel.card")].find((p) => title.test(p.querySelector("h2")?.textContent ?? ""))!;

describe("the Query page card, its counts held back at plain (record 55 K7)", () => {
  it("says every held count as held back with why on hover, draws no bar for it, and sums none", async () => {
    open();
    await settle(20);
    // the profile's headline numbers
    expect([...host.querySelectorAll(".profile-count")].map(words)).toEqual(["held back subjects", "held back sessions", "held back stacks"]);
    for (const el of host.querySelectorAll(".profile-count .held")) expect(el.getAttribute("title")).toBe(WHY);
    // the stack types, each bar held and drawn with no length
    expect([...host.querySelectorAll(".bar-row")].map(words)).toEqual(["T1w stacks held back subjects held back", "T2w stacks held back subjects held back", "FLAIR stacks held back subjects held back"]);
    for (const i of host.querySelectorAll<HTMLElement>(".bar-row .bar-track i")) expect(i.style.width).toBe("0px");
    // the funnel of the answer's step: the source counted, the held where neither counted nor said to lose anything
    const funnel = panelOf(/^Where the rows go/u);
    expect([...funnel.querySelectorAll(".count-bar")].map(words)).toEqual(["source 212 rows 48 subjects", "where rows held back subjects held back"]);
    expect(funnel.querySelectorAll(".count-bar .held")).toHaveLength(2);
    expect(funnel.querySelector(".warn")).toBeNull();
    // the timeline's count of the step
    const step = [...host.querySelectorAll(".timeline-step")].find((s) => s.querySelector("b")?.textContent === "scans")!;
    const count = step.querySelector(".timeline-count")!;
    expect(count.textContent).toBe("held back");
    expect(count.getAttribute("title")).toBe(WHY);
    expect(words([...host.querySelectorAll(".timeline-step")].find((s) => s.querySelector("b")?.textContent === "people")?.querySelector(".timeline-count"))).toBe("48");
    // the preview's count, each cell named by held_back
    act(() => button(panelOf(/^Rows$/u), "Preview 10 rows")!.click());
    await settle(10);
    const cells = [...panelOf(/^Rows$/u).querySelectorAll("td")];
    expect(cells.map(words)).toEqual(["held back", "held back"]);
    for (const td of cells) expect(td.getAttribute("title")).toBe(WHY);
    expect(host.textContent).not.toMatch(/null|NaN|fewer than 5/u);
  });

  it("hands the assistant a held step as held, rows null, never dropped or 0", async () => {
    const a = open();
    await settle(20);
    const box = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Talk to the assistant about this card']")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "How many are there?");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => box.form!.requestSubmit());
    await settle(10);
    const sent = a.calls.find((c) => c.method === "POST" && c.url.startsWith("/assistant/agents/ask-help/q1"));
    expect((sent?.body?.context as { funnel?: unknown }).funnel).toEqual([
      { set: "people", rows: 48 },
      { set: "scans", rows: null },
    ]);
  });
});
