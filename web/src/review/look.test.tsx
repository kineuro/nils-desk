// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Record 55 H5 on the Review queue: an item looked at shows why the rules
// decided beside the picture, read from the engine's GET
// /api/stacks/{stack}/why where it serves the door and the person may read
// the queue; a sealed stack shows no line of it, and an engine without the
// door shows the item's own evidence as before.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import why from "../../test/fixtures/campaigns/reader_why.json";
import { forgetReadings, STACK_WHY } from "../campaigns/readerDoors";
import type { ReviewItem } from "../ops/client";
import { capsFor } from "../campaigns/caps.fixture";
import { LookDialog } from "./Queue";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item: ReviewItem = { id: 7, kind: "base:conflict", scope: "stack", status: "open", created_at: "2026-10-01T10:00:00Z", ref: { stack_id: 1207 }, evidence: { axis: "base", value: "T1w", other: "T2w" } };

let host: HTMLDivElement;
let root: Root;
const asked: string[] = [];

function serve(body: unknown, status = 200) {
  window.fetch = vi.fn(async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

async function draw(doors: string[], grants = ["review:see", "review:work"]) {
  const caps = capsFor({ doors, grants: grants as never });
  await act(async () => {
    root.render(<LookDialog caps={caps} item={item} stack={1207} onClose={() => undefined} onExplain={() => undefined} onDecide={null} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  forgetReadings();
  asked.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("a queue item looked at", () => {
  it("shows why the rules decided beside the picture, from the stack's why door", async () => {
    serve(why);
    await draw([STACK_WHY]);
    expect(asked.some((u) => u.endsWith("/api/stacks/1207/why"))).toBe(true);
    const side = host.ownerDocument.querySelector(".look-side")!;
    const lines = side.querySelector('[aria-label="why the rules decided"]')!;
    expect(lines).not.toBeNull();
    expect(lines.textContent).toContain("base");
    expect(lines.textContent).toContain("T1w");
    // the words the rule matched, at detail quasi
    expect(lines.textContent).toContain("t1_mprage");
    expect(lines.textContent).toContain("mri 0.4.0");
    // the item's own evidence stays under it
    expect(side.textContent).toContain("other");
  });

  it("a sealed stack shows no line of the rules' answer", async () => {
    serve({ stack: 1207, blind: true, detail: "quasi", header: { repetition_time: 2300 } });
    await draw([STACK_WHY]);
    const side = host.ownerDocument.querySelector(".look-side")!;
    expect(side.querySelector(".evidence-lines")).toBeNull();
    expect(side.textContent).toContain("Sealed: read blind");
  });

  it("an engine without the door, or a person without review:see, asks nothing", async () => {
    serve(why);
    await draw([]);
    await draw([STACK_WHY], ["campaigns:see"]);
    expect(asked.length).toBe(0);
    expect(host.ownerDocument.querySelector(".evidence-lines")).toBeNull();
  });
});
