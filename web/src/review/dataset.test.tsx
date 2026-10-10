// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review opened from a dataset's card (record 55 H2): #review?dataset=NAME
// narrows the queue and its summary to that dataset's scans, says which, and
// takes the narrowing off in one click; the picks page narrows the same way.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { queueHref } from "./filter";
import { ReviewPage } from "./ReviewPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Review narrowed to a dataset", () => {
  let root: Root;
  let el: HTMLDivElement;
  let urls: string[];
  beforeEach(() => {
    urls = [];
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.startsWith("/api/review/summary")) return new Response(JSON.stringify({ by_kind: {}, cohorts: [], none: 0 }));
      if (url.startsWith("/api/review")) return new Response(JSON.stringify({ count: 0, items: [] }));
      return new Response("{}");
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
  });
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
  };
  const caps = capsWith(["GET /api/review/summary"], [...GRANTS] as Grant[]);

  it("asks the queue and its summary for that dataset only, and says which", async () => {
    act(() => root.render(<ReviewPage caps={caps} page={null} query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls.some((u) => u.startsWith("/api/review?") && u.includes("dataset=ms-a"))).toBe(true);
    expect(urls.some((u) => u.startsWith("/api/review/summary") && u.includes("dataset=ms-a"))).toBe(true);
    expect(el.querySelector(".review-dataset .tag")?.textContent).toBe("ms-a");
    expect(el.querySelector(".review-dataset a")?.getAttribute("href")).toBe("#review");
  });

  it("narrows the picks page the same way", async () => {
    act(() => root.render(<ReviewPage caps={caps} page="picks" query={{ dataset: "ms-a" }} />));
    await settle();
    expect(urls.some((u) => u.startsWith("/api/review?") && u.includes("kind=pick.border") && u.includes("dataset=ms-a"))).toBe(true);
    expect(el.querySelector(".review-dataset a")?.getAttribute("href")).toBe("#review/picks");
  });

  it("keeps the dataset through a filter and through the page chips", async () => {
    act(() => root.render(<ReviewPage caps={caps} page={null} query={{ dataset: "ms-a" }} />));
    await settle();
    const chips = [...el.querySelectorAll<HTMLAnchorElement>(".chips.pages a")].map((a) => a.getAttribute("href"));
    expect(chips.length).toBeGreaterThan(1);
    for (const c of chips) expect(c).toContain("dataset=ms-a");
    expect(queueHref({ axis: "base", reason: null, border: null }, "", "ms-a")).toBe("#review?dataset=ms-a&axis=base");
  });

  it("asks for every dataset without one", async () => {
    act(() => root.render(<ReviewPage caps={caps} page={null} />));
    await settle();
    expect(urls.some((u) => u.includes("dataset="))).toBe(false);
    expect(el.querySelector(".review-dataset")).toBeNull();
  });
});
