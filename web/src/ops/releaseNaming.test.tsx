// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The release form's BIDS names (record 55 C4; gate T31, walkthrough step
// 13.7): the engine's release door takes `naming`, full or minimal, and the
// form never sent it. The choice is there beside the BIDS layout, full as
// the engine has it; the door is told only of minimal, and never beside the
// descriptive layout, which is v0's grammar whatever is asked and which the
// engine refuses minimal for.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { placesKept } from "../objects/kept";
import { ReleasePage } from "./ReleasePage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

const DOORS = ["GET /api/releases", "POST /api/releases", "GET /api/places", "GET /api/cohorts"];
const EXPORTS = { places: [{ id: 9, name: "exports", role: "export", path: "/exports", guarantees: {}, probed: null, probed_at: null, retired_at: null }] };
const COHORTS = { cohorts: [{ name: "north", subjects: 40, sessions: 80, stacks: 900, waiting: 0, retired_at: null }] };

async function open() {
  const e = engine((c) => {
    if (c.method === "GET" && c.url.startsWith("/api/releases")) return { status: 200, body: { count: 0, releases: [] } };
    if (c.method === "GET" && c.url === "/api/places") return { status: 200, body: EXPORTS };
    if (c.method === "GET" && c.url === "/api/cohorts") return { status: 200, body: COHORTS };
    if (c.method === "POST" && c.url === "/api/releases") return { status: 202, body: { job: 88, state: "queued" } };
    return undefined;
  });
  await placesKept.refresh().catch(() => undefined);
  act(() => root.render(<ReleasePage caps={caps7a(DOORS)} page="new" arg="north" />));
  await settle();
  return e;
}

const dialog = () => host.querySelector("dialog[open]")!;
const names = () => dialog().querySelector<HTMLSelectElement>('select[aria-label="BIDS names"]');
const layout = () => dialog().querySelector<HTMLSelectElement>('select option[value="descriptive"]')!.parentElement as HTMLSelectElement;
const released = (e: Awaited<ReturnType<typeof open>>) => e.of("POST", "/api/releases").map((c) => c.body);

describe("the release form's BIDS names", () => {
  it("is full unless asked, and a release made so does not name it: the engine's own stands", async () => {
    const e = await open();
    expect(names()?.value).toBe("full");
    expect([...names()!.options].map((o) => o.textContent)).toEqual(["Full names", "Minimal names"]);
    act(() => button(dialog(), /^Release$/u)!.click());
    await settle();
    const [body] = released(e);
    expect(body).toMatchObject({ layout: "bids", cohorts: ["north"] });
    expect(body).not.toHaveProperty("naming");
  });

  it("sends minimal when it is chosen, beside BIDS", async () => {
    const e = await open();
    await choose(names()!, "minimal");
    act(() => button(dialog(), /^Release$/u)!.click());
    await settle();
    expect(released(e)).toHaveLength(1);
    expect(released(e)[0]).toMatchObject({ layout: "bids", naming: "minimal", cohorts: ["north"] });
    expect(host.textContent).toContain("is queued as job 88");
  });

  it("is not offered beside the descriptive layout, and a minimal chosen before is not sent with it", async () => {
    const e = await open();
    await choose(names()!, "minimal");
    await choose(layout(), "descriptive");
    expect(names()).toBeNull();
    // back to BIDS, the choice made before is still there
    await choose(layout(), "bids");
    expect(names()?.value).toBe("minimal");
    await choose(layout(), "descriptive");
    act(() => button(dialog(), /^Release$/u)!.click());
    await settle();
    expect(released(e)[0]).toMatchObject({ layout: "descriptive" });
    expect(released(e)[0]).not.toHaveProperty("naming");
  });
});
