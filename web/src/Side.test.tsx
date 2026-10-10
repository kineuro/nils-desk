// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The side as the 2026-10-09 design draws it: the section the address names
// open with its pages under it and every section after it at the foot, the
// open one's row folding it in place, another's opening its first page,
// Settings rising under the last section once it opens, the panel over the
// page unfolding a section without leaving the page, and the Assistant's
// recent conversations drawn as threads under a small word.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assistantPages, type Section, type SidePage } from "./sections";
import { Side } from "./Side";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (id: string, title: string, more: Partial<SidePage> = {}): SidePage => ({ id, title, depth: 1, ...more });
const TOP: Section[] = [
  { id: "home", title: "Home", icon: "home" },
  {
    id: "assistant",
    title: "Assistant",
    icon: "assistant",
    rest: "none",
    pages: assistantPages([page("c-1", "T1 with contrast in study-big"), page("c-2", "Sort the new files tonight")]),
  },
  { id: "query", title: "Query", icon: "search", pages: [page("cards", "Cards", { to: "#query" }), page("selections", "Selections")] },
  { id: "review", title: "Review", icon: "review", pages: [page("questions", "Questions", { to: "#review" }), page("picks", "Main scans"), page("identifiers", "Subjects"), page("rules", "Rules")] },
  { id: "pipelines", title: "Pipelines", icon: "branch", pages: [page("now", "Running now", { to: "#pipelines" }), page("catalog", "Catalog", { also: ["runs", "plan"] })] },
];
const FOOT: Section[] = [{ id: "settings", title: "Settings", icon: "settings", pages: [page("overview", "Overview"), page("parts", "Parts"), page("engine", "Engine", { depth: 2 }), page("identity", "Identity")] }];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  history.replaceState(null, "", "/");
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function draw(section: string | null, at: string | null = null, open = false) {
  act(() => root.render(<Side top={TOP} foot={FOOT} section={section} page={at} open={open} onClose={() => undefined} />));
}

/** Each section by its title, with how it stands: open, cut (the free height under it) or down at the foot. */
function stands(): string[] {
  return [...host.querySelectorAll<HTMLElement>(".side-group")].map((g) => {
    const title = g.querySelector(".side-link .grow")!.textContent;
    const marks = ["on", "cut", "down"].filter((c) => g.classList.contains(c));
    return marks.length > 0 ? `${title} ${marks.join(" ")}` : `${title}`;
  });
}

const rowOf = (title: string) => [...host.querySelectorAll<HTMLAnchorElement>("a.side-link")].find((a) => a.querySelector(".grow")!.textContent === title)!;
const marked = () => [...host.querySelectorAll<HTMLAnchorElement>('.side-pages a[aria-current="page"]')].map((a) => a.textContent);

/** Clicks a row as a mouse does, and says whether the side kept the address where it was. */
function click(title: string): boolean {
  let kept = false;
  act(() => {
    kept = !rowOf(title).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
  return kept;
}

describe("the side", () => {
  it("opens the section the address names, its pages under it and every section after it at the foot", () => {
    draw("review", "rules");
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review on cut", "Pipelines down", "Settings down"]);
    expect(rowOf("Review").getAttribute("aria-expanded")).toBe("true");
    expect(rowOf("Review").className).toBe("side-link open");
    expect(marked()).toEqual(["Rules"]);
    // a folded section's pages are out of reach
    expect(host.querySelectorAll(".side-pages[inert]")).toHaveLength(4);
    expect(rowOf("Query").getAttribute("aria-expanded")).toBe("false");
  });

  it("holds Settings alone at the foot on Home, whose row is the page", () => {
    draw("home");
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review", "Pipelines cut", "Settings down"]);
    expect(rowOf("Home").className).toBe("side-link on");
    expect(rowOf("Home").getAttribute("aria-current")).toBe("page");
    expect(rowOf("Home").hasAttribute("aria-expanded")).toBe(false);
    expect(marked()).toEqual([]);
  });

  it("raises Settings under the last section once it opens, with nothing at the foot", () => {
    draw("settings", null);
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review", "Pipelines", "Settings on"]);
    expect(marked()).toEqual(["Overview"]);
    expect(host.querySelector('a[href="#settings/engine"]')!.className).toBe("deep");
  });

  it("folds the open section by its row and unfolds it again, the page staying where it is", () => {
    draw("review", "rules");
    expect(click("Review")).toBe(true);
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review", "Pipelines cut", "Settings down"]);
    expect(rowOf("Review").getAttribute("aria-expanded")).toBe("false");
    expect(click("Review")).toBe(true);
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review on cut", "Pipelines down", "Settings down"]);
    expect(marked()).toEqual(["Rules"]);
    expect(location.hash).toBe("");
  });

  it("opens another section by its address, and follows the address once it moves", () => {
    draw("review", "rules");
    // the row is a link to the section, which opens its first page
    expect(click("Pipelines")).toBe(false);
    expect(rowOf("Pipelines").getAttribute("href")).toBe("#pipelines");
    draw("pipelines", null);
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review", "Pipelines on cut", "Settings down"]);
    expect(marked()).toEqual(["Running now"]);
    // a run's own page keeps the catalog marked
    draw("pipelines", "runs");
    expect(marked()).toEqual(["Catalog"]);
    // a section folded by its row opens again when the address moves inside it
    click("Pipelines");
    expect(stands()).toContain("Pipelines cut");
    draw("pipelines", "catalog");
    expect(stands()).toContain("Pipelines on cut");
  });

  it("leaves a click that asks for a new tab to the browser", () => {
    draw("review", "rules");
    let kept = true;
    act(() => {
      kept = !rowOf("Review").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    });
    expect(kept).toBe(false);
    expect(stands()).toContain("Review on cut");
  });

  it("unfolds a section in the panel over the page without leaving the page, so one of its pages can be chosen", () => {
    draw("home", null, true);
    expect(host.querySelector("nav.side")!.className).toBe("side open");
    expect(click("Review")).toBe(true);
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review on cut", "Pipelines down", "Settings down"]);
    // the address is still Home's, so none of Review's pages is marked
    expect(marked()).toEqual([]);
    expect(host.querySelector('a[href="#review/identifiers"]')!.textContent).toBe("Subjects");
    // closed and opened again, the panel opens on the section the address names
    draw("home", null, false);
    draw("home", null, true);
    expect(stands()).toEqual(["Home", "Assistant", "Query", "Review", "Pipelines cut", "Settings down"]);
  });

  it("draws the Assistant's recent conversations as threads under a small word, the open one marked on its line", () => {
    draw("assistant", "c-1");
    expect(stands()).toEqual(["Home", "Assistant on cut", "Query down", "Review down", "Pipelines down", "Settings down"]);
    const pages = host.querySelector(".side-group.on .side-pages > div")!;
    expect([...pages.children].map((c) => `${c.tagName.toLowerCase()}.${c.className || "page"} ${c.textContent}`)).toEqual([
      "a.new New conversation",
      "a.page All conversations",
      "a.page Shared",
      "a.page Memory",
      "span.side-label Recent",
      "a.thread on T1 with contrast in study-big",
      "a.thread Sort the new files tonight",
    ]);
    expect(pages.querySelector("a.new svg")).not.toBeNull();
    expect(pages.querySelector("a.thread.on")!.getAttribute("href")).toBe("#assistant/c-1");
    expect(pages.querySelector("a.thread.on")!.getAttribute("title")).toBe("T1 with contrast in study-big");
    expect(marked()).toEqual(["T1 with contrast in study-big"]);
    // a new conversation marks the brand line; one the side does not list marks nothing
    draw("assistant", null);
    expect(marked()).toEqual(["New conversation"]);
    draw("assistant", "c-9");
    expect(marked()).toEqual([]);
  });
});
