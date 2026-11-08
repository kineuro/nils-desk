// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A label that says where it came from (UX round 2), as the browser's footer
// shows it: the rules' label neutral, a model's and a decision's framed, and
// a decision the sort has not applied yet saying what was decided, its press
// opening the details with the campaign's item and the re-sort.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OriginFact } from "./OriginFact";
import type { AxisOrigin } from "./origins";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SORTED = { pack: "mri", version: "1.4.0", overlay: null, job: 3, at: "2026-11-01T08:00:00Z" };
const FACT = { what: "Body part", value: "spine", axis: "body_part" };

const rules: AxisOrigin = {
  axis: "body_part",
  values: ["spine"],
  confidence: 0.9,
  tier: "keyword",
  origin: "rules",
  line: "",
  state: "current",
  words: null,
  rules: [{ rule_set: "body_part", rule: "spine_words", source: "series_description", matched: "spine" }],
  decided: null,
};

let root: Root | null = null;
let host: HTMLElement | null = null;

function show(origin: AxisOrigin | null, resort: (() => Promise<void>) | null = null, fact = FACT) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<OriginFact fact={fact} origin={origin} sorted={SORTED} resort={resort} />));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const press = (el: Element | null) => act(() => (el as HTMLElement).click());

describe("a label's origin", () => {
  it("leaves a label with no origin read as it was", () => {
    const h = show(null);
    expect(h.querySelector("button")).toBeNull();
    expect(h.textContent).toBe("spine");
  });

  it("keeps the rules' label neutral and names the pack, the rule and what it read", () => {
    const h = show(rules);
    const b = h.querySelector("button.origin")!;
    expect(b.getAttribute("data-tone")).toBe("rules");
    expect(b.getAttribute("title")).toBe("Body part: spine · from the header (rules 1.4.0)");
    press(b);
    const pop = h.querySelector(".origin-pop")!;
    expect(pop.textContent).toContain("Rules mri@1.4.0 · body_part/spine_words");
    expect(pop.textContent).toContain("read “spine” in the series description");
    expect(pop.querySelector("button")).toBeNull();
  });

  it("frames a model's label and names the model, the run and the probability", () => {
    const h = show({
      ...rules,
      values: ["brain"],
      tier: "decision",
      origin: "model",
      rules: [],
      from: { kind: "model", model: { label: "bodypart@2.1" } },
      decided: { id: 80, kind: "model", value: "brain", values: ["brain"], model: { label: "bodypart@2.1", p: 0.97, run: 12 } },
    }, null, { ...FACT, value: "brain" });
    const b = h.querySelector("button.origin")!;
    expect(b.getAttribute("data-tone")).toBe("model");
    press(b);
    expect(h.querySelector(".origin-pop")!.textContent).toContain("Model bodypart@2.1 · run 12 · p 0.97");
    expect(h.querySelector<HTMLAnchorElement>(".origin-pop a")!.getAttribute("href")).toBe("#pipelines/runs/12");
  });

  it("frames a person's decision and links the campaign's item", () => {
    const h = show(
      {
        ...rules,
        values: ["neck"],
        tier: "decision",
        origin: "decision",
        rules: [],
        from: { kind: "person", by: "anna@lab" },
        decided: { id: 77, kind: "person", value: "neck", values: ["neck"], by: "anna@lab", at: "2026-11-05T14:02:00Z", campaign: { id: 6, name: "curate", item: 412 } },
      },
      null,
      { ...FACT, value: "neck" },
    );
    const b = h.querySelector("button.origin")!;
    expect(b.getAttribute("data-tone")).toBe("decision");
    press(b);
    const a = h.querySelector<HTMLAnchorElement>(".origin-pop a")!;
    expect(a.textContent).toBe("Campaign curate, item 412");
    expect(a.getAttribute("href")).toBe("#review/campaigns/6");
    expect(h.querySelector(".origin-pop")!.textContent).toContain("Decided by anna@lab");
  });

  it("says a decision the sort has not applied, and sorts the scan again on a press", async () => {
    let sorted = 0;
    const resort = vi.fn(() => {
      sorted += 1;
      return Promise.resolve();
    });
    const h = show(
      {
        ...rules,
        state: "unsorted",
        words: "decided neck; sorted before the decision",
        decided: { id: 77, kind: "person", value: "neck", values: ["neck"], by: "anna@lab", campaign: { id: 6, name: "curate", item: 412 } },
      },
      resort,
    );
    const b = h.querySelector("button.origin")!;
    expect(b.getAttribute("data-tone")).toBe("stale");
    expect(b.textContent).toBe("spinedecided neck");
    expect(b.querySelector(".origin-tail")!.textContent).toBe("decided neck");
    expect(b.getAttribute("title")).toContain("Decided neck; sorted before the decision");
    press(b);
    const pop = h.querySelector(".origin-pop")!;
    expect(pop.textContent).toContain("Decided neck; sorted before the decision");
    expect(pop.querySelector("a")!.textContent).toBe("Campaign curate, item 412");
    const again = [...pop.querySelectorAll("button")].find((x) => x.textContent === "Sort this scan again")!;
    await act(async () => {
      again.click();
      await Promise.resolve();
    });
    expect(sorted).toBe(1);
    // done: the details close
    expect(h.querySelector(".origin-pop")).toBeNull();
  });

  it("offers no re-sort to who may not run a sort, and Esc closes the details", () => {
    const h = show({ ...rules, state: "unsorted", decided: { id: 77, kind: "person", value: "neck", values: ["neck"], by: "anna@lab" } }, null);
    press(h.querySelector("button.origin"));
    expect([...h.querySelectorAll(".origin-pop button")].some((x) => x.textContent === "Sort this scan again")).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(h.querySelector(".origin-pop")).toBeNull();
  });
});
