// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The gallery (record 50 R3): the page read into one shape, each item set to
// its suggestion until the person changes it, the least certain first or
// grouped by suggestion, the keys, and the accept that sends each item's
// own value; then the grid drawn in jsdom against a fake engine, a number
// key correcting the focused item and Ctrl+Enter accepting the page.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { Gallery } from "./Gallery";
import { acceptBody, changed, choose, chooseAll, galleryOffered, groups, initial, keyAct, keyOfValue, moved, ordered, pageOf, pageWords, prefetch, reset, shown, singleAxis, tally, tone, topClasses, valueOfKey } from "./gallery";
import { importWords, summaryOf } from "./Suggestions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VALUES = ["neck", "spine", "brain", "brain-neck", "chest", "other"];

function item(n: number, suggested: string | null, confidence: number | null, extra: Record<string, unknown> = {}) {
  return {
    item: n,
    stack: 100 + n,
    position: n,
    suggested,
    by: suggested ? "v0-model" : null,
    confidence,
    confidences: suggested && confidence !== null ? { [suggested]: confidence, other: 1 - confidence } : null,
    others: [],
    disagree: false,
    thumb: `/api/instances/${100 + n}/thumb`,
    ...extra,
  };
}

const RAW = {
  campaign: 7,
  axis: "body_part",
  values: VALUES,
  order: "uncertain",
  open: 9,
  sealed: 1,
  held_back: 1,
  hold_back: 0.1,
  left: 7,
  count: 7,
  items: [
    item(1, "brain", 0.97),
    item(2, "brain", 0.61),
    item(3, "brain-neck", 0.55),
    item(4, null, null),
    item(5, "spine", 0.9, { disagree: true, others: [{ by: "v0-person", value: "neck", confidence: null }] }),
    item(6, "brain", null, { by: "v0-person" }),
    { stack: 1 },
  ],
};

describe("the gallery's state", () => {
  it("reads the engine's page whatever it left out", () => {
    const p = pageOf(RAW);
    expect(p.items).toHaveLength(6);
    expect(p.values).toEqual(VALUES);
    expect(p.items[3].confidences).toBeNull();
    expect(p.items[4].others[0]).toEqual({ by: "v0-person", value: "neck", confidence: null });
    expect(pageOf({}).items).toEqual([]);
    expect(pageWords(p, 6)).toBe("6 of 7 to check · 1 after these · 1 held back to read alone · 1 sealed, read blind one by one");
  });

  it("orders the least certain first: disagreement, then no suggestion, then the lowest confidence", () => {
    const p = pageOf(RAW);
    expect(ordered(p.items, "uncertain").map((i) => i.item)).toEqual([5, 4, 3, 2, 1, 6]);
    expect(ordered(p.items, "position").map((i) => i.item)).toEqual([1, 2, 3, 4, 5, 6]);
    // grouped by the value suggested, the least certain first in each, no suggestion last
    expect(ordered(p.items, "suggested").map((i) => i.item)).toEqual([2, 1, 6, 3, 5, 4]);
    const s = { ...initial(p), order: "suggested" as const };
    expect(groups(s).map((g) => [g.value, g.items.length])).toEqual([
      ["brain", 3],
      ["brain-neck", 1],
      ["spine", 1],
      [null, 1],
    ]);
  });

  it("sets each item to its suggestion, and counts what the person changed", () => {
    const p = pageOf(RAW);
    let s = initial(p);
    expect(s.focus).toBe(5);
    expect(tally(s)).toEqual({ total: 6, set: 5, changed: 0, unset: 1 });
    s = choose(s, 2, "other");
    s = choose(s, 4, "neck");
    expect(changed(s, p.items[1])).toBe(true);
    expect(tally(s)).toEqual({ total: 6, set: 6, changed: 2, unset: 0 });
    s = reset(s, 2);
    expect(s.chosen[2]).toBe("brain");
    // an item not on the page is never set
    expect(choose(s, 99, "brain")).toBe(s);
    // a whole group the suggester read wrong, in one move
    const all = chooseAll(s, "brain", "brain-neck");
    expect([all.chosen[1], all.chosen[2], all.chosen[6], all.chosen[3]]).toEqual(["brain-neck", "brain-neck", "brain-neck", "brain-neck"]);
  });

  it("accepts each item with its own value, in the order shown, and leaves one without a value for later", () => {
    const p = pageOf(RAW);
    const s = choose(initial(p), 3, "brain");
    expect(acceptBody(s)).toEqual({
      answers: [
        { item: 5, value: "spine" },
        { item: 3, value: "brain" },
        { item: 2, value: "brain" },
        { item: 1, value: "brain" },
        { item: 6, value: "brain" },
      ],
    });
  });

  it("shows a page of a hundred at most", () => {
    const many = { ...RAW, items: Array.from({ length: 150 }, (_, n) => item(n + 1, "brain", 0.9)) };
    expect(initial(pageOf(many)).page.items).toHaveLength(100);
    const seen: string[] = [];
    expect(prefetch(pageOf(many).items.slice(100), () => ({ set src(v: string) { seen.push(v); } }) as { src: string })).toBe(50);
    expect(seen[0]).toBe("/api/instances/201/thumb");
  });

  it("maps the number keys to the values, the arrows to the grid and Ctrl+Enter to the accept", () => {
    expect(valueOfKey(VALUES, "1")).toBe("neck");
    expect(valueOfKey(VALUES, "4")).toBe("brain-neck");
    expect(valueOfKey(VALUES, "7")).toBeNull();
    expect(valueOfKey([...VALUES, "a", "b", "c", "d"], "0")).toBe("d");
    expect(keyOfValue(VALUES, "other")).toBe("6");
    expect(keyAct("3", VALUES)).toEqual({ kind: "set", value: "brain" });
    expect(keyAct("ArrowDown", VALUES, { columns: 4 })).toEqual({ kind: "move", by: 4 });
    expect(keyAct("Enter", VALUES, { ctrl: true })).toEqual({ kind: "accept" });
    expect(keyAct("Enter", VALUES)).toEqual({ kind: "none" });
    expect(keyAct("Backspace", VALUES)).toEqual({ kind: "reset" });
    const s = initial(pageOf(RAW));
    expect(moved(s, 1).focus).toBe(4);
    expect(moved(s, -5).focus).toBe(5);
    expect(moved(s, 50).focus).toBe(6);
    expect(shown(s)[0].item).toBe(5);
  });

  it("says how sure an item is and its likeliest classes", () => {
    const p = pageOf(RAW);
    expect(p.items.map(tone)).toEqual(["high", "mid", "low", "none", "low", "high"]);
    expect(topClasses({ a: 0.2, b: 0.7, c: 0.1 }, 2)).toEqual([
      { value: "b", p: 0.7 },
      { value: "a", p: 0.2 },
    ]);
  });

  it("is offered for a question that asks one axis, where the engine serves it", () => {
    const caps = { engine: { doors: ["GET /api/campaigns/{id}/gallery", "POST /api/campaigns/{id}/gallery/accept"] } } as unknown as Capabilities;
    expect(singleAxis({ kind: "axis", axis: "body_part" })).toBe("body_part");
    expect(singleAxis({ kind: "axes", axes: ["body_part"] })).toBe("body_part");
    expect(singleAxis({ kind: "axes", axes: ["base", "body_part"] })).toBeNull();
    expect(galleryOffered(caps, { kind: "axis", axis: "body_part" })).toBe(true);
    expect(galleryOffered({ engine: { doors: [] } } as unknown as Capabilities, { kind: "axis", axis: "body_part" })).toBe(false);
  });

  it("reads a campaign's suggestions and says what an import brought", () => {
    expect(summaryOf({ count: 3, items: 3, authors: [{ author: "v0-model", count: 3, values: { brain: 3 } }] }).authors[0].author).toBe("v0-model");
    expect(importWords({ suggestions: 3, sealed: 1, refused_values: 1 })).toBe("brought 3 suggestions · 1 of a sealed sample, left out · 1 with a value the axis does not take");
  });
});

describe("the gallery drawn", () => {
  let host: HTMLDivElement;
  let root: Root;
  let posted: unknown[];

  beforeEach(() => {
    posted = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, "http://desk").pathname;
      if (path === "/api/campaigns/7") return json({ id: 7, name: "parts", owner: "cleo", status: "open", question: { kind: "axis", axis: "body_part" }, grain: "stack", counts: { items: { open: 9 }, answers: 0 } });
      if (path === "/api/campaigns/7/gallery") return json(posted.length > 0 ? { ...RAW, items: [], left: 0 } : RAW);
      if (path === "/api/campaigns/7/gallery/accept") {
        posted.push(JSON.parse(String(init?.body)));
        return json({ accepted: [{ item: 5, answer: 1, state: "agreed", changed: true }], refused: [], held_back: 0 });
      }
      return Promise.resolve(new Response("{}", { status: 404 }));
    });
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function until<T>(what: () => T | null | undefined | false): Promise<T> {
    const end = Date.now() + 3000;
    for (;;) {
      const v = what();
      if (v) return v;
      if (Date.now() > end) throw new Error("waited in vain");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
  }

  const press = async (key: string, ctrl = false) =>
    act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: ctrl, bubbles: true, cancelable: true }));
    });

  it("corrects the focused item by its key and accepts the page in one move", async () => {
    const caps = { engine: { doors: ["GET /api/campaigns/{id}/gallery", "POST /api/campaigns/{id}/gallery/accept"] }, person: { subject: "anna" } } as unknown as Capabilities;
    root = createRoot(host);
    await act(async () => root.render(<Gallery caps={caps} id="7" />));
    await until(() => host.querySelectorAll(".g-cell").length === 6);
    const cells = [...host.querySelectorAll<HTMLElement>(".g-cell")];
    // the least certain first, and the focus on it
    expect(cells[0].dataset.item).toBe("5");
    expect(cells[0].getAttribute("aria-current")).toBe("true");
    expect(cells[0].querySelector("img")?.getAttribute("src")).toBe("/api/instances/105/thumb");
    expect(host.querySelector(".g-tally")?.textContent).toContain("5 as suggested");
    // 1 is neck: the suggester's spine is corrected
    await press("1");
    expect(host.querySelector('[data-item="5"]')?.classList.contains("changed")).toBe(true);
    expect(host.querySelector(".g-tally")?.textContent).toContain("1 corrected");
    // the item without a suggestion takes one by its key
    await press("ArrowRight");
    await press("6");
    await press("Enter", true);
    await until(() => posted.length === 1);
    const body = posted[0] as { answers: { item: number; value: string }[] };
    expect(body.answers).toHaveLength(6);
    expect(body.answers[0]).toEqual({ item: 5, value: "neck" });
    expect(body.answers[1]).toEqual({ item: 4, value: "other" });
    await until(() => host.querySelector(".g-said")?.textContent?.includes("1 answer kept · 1 corrected"));
    await until(() => host.textContent?.includes("Nothing is left to check here"));
  });
});
