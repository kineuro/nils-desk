// SPDX-License-Identifier: AGPL-3.0-only

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageBoundary, Stopped } from "./PageBoundary";

describe("a page that stops drawing", () => {
  it("keeps what went wrong in words and offers to draw the page again", () => {
    expect(PageBoundary.getDerivedStateFromError(new Error("Objects are not valid as a React child"))).toEqual({
      failed: "Objects are not valid as a React child",
    });
    expect(PageBoundary.getDerivedStateFromError("a thrown sentence")).toEqual({ failed: "a thrown sentence" });
    const html = renderToStaticMarkup(<Stopped why="it broke" onAgain={() => undefined} />);
    expect(html).toContain("This page stopped");
    expect(html).toContain("it broke");
    expect(html).toContain("Draw it again");
  });

  it("draws afresh at a new address, and leaves a page that draws alone", () => {
    const cleared: unknown[] = [];
    const stopped = new PageBoundary({ route: "assistant/c-2/", children: null });
    stopped.state = { failed: "it broke" };
    stopped.setState = ((s: unknown) => cleared.push(s)) as never;
    stopped.componentDidUpdate({ route: "assistant/c-1/", children: null });
    expect(cleared).toEqual([{ failed: null }]);

    const drawing = new PageBoundary({ route: "assistant/c-2/", children: null });
    drawing.setState = ((s: unknown) => cleared.push(s)) as never;
    drawing.componentDidUpdate({ route: "assistant/c-1/", children: null });
    stopped.componentDidUpdate({ route: "assistant/c-2/", children: null });
    expect(cleared).toHaveLength(1);
  });
});
