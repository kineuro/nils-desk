// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild visits, on Release's Session schemes page (gate T31, walkthrough
// step 22.7): the visits are built again under a scheme as a job, by a person
// with work on Pipelines. The dialog says what it will do before it runs, and
// nothing is queued until it is pressed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Grant } from "../grants";
import { SchemePicker, SchemesPage } from "./Schemes";
import { ownLabel, ownName, rebuildRefusal, rebuildWords, type KeptScheme, type OwnScheme } from "./schemes";

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

const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

const DOORS = ["GET /api/session-schemes", "POST /api/session-schemes", "POST /api/sessions/rebuild"];
/** The kept schemes as the engine lists them: `default` is the definition of the scheme a release or a pick uses where it names none, not a name. */
const KEPT: { schemes: KeptScheme[]; default: OwnScheme } = {
  schemes: [
    { name: "baseline-months", scheme: { window_days: 0, anchor: "first_session", naming: { months: { cadence: [0, 6, 12], tolerance: 1.5 } } }, added_at: "2026-10-14T09:00:00Z", note: null },
    { name: "by-day", scheme: { window_days: 3, anchor: "first_session", naming: "date" }, added_at: "2026-10-15T09:00:00Z", note: null },
  ],
  default: { window_days: 0, anchor: "first_session", naming: "date", collision: "merge", unmatched: "keep_date" },
};

async function open(doors = DOORS, grants?: readonly Grant[], route: Parameters<typeof engine>[0] = () => undefined) {
  const e = engine((c, nth) => route(c, nth) ?? (c.method === "GET" && c.url === "/api/session-schemes" ? { status: 200, body: KEPT } : undefined));
  act(() => root.render(<SchemesPage caps={caps7a(doors, grants)} />));
  await settle();
  return e;
}
const dialog = () => host.querySelector("dialog[open]")!;

describe("Rebuild visits", () => {
  it("is offered by the Session schemes page to a person with work on Pipelines, where the engine has the door", async () => {
    await open();
    expect(button(host, "Rebuild visits")).not.toBeNull();
    await open(DOORS, ["release:see", "release:work", "pipelines:see"]);
    expect(button(host, "Rebuild visits")).toBeNull();
    expect(button(host, "New scheme")).not.toBeNull();
    await open(DOORS.filter((d) => !d.includes("rebuild")));
    expect(button(host, "Rebuild visits")).toBeNull();
  });

  it("says in words why a person may not", () => {
    expect(rebuildRefusal(caps7a(DOORS))).toBeNull();
    expect(rebuildRefusal(caps7a(DOORS, ["release:see", "pipelines:see"]))).toBe("Rebuilding visits needs work on the Pipelines page.");
    expect(rebuildRefusal(caps7a([]))).toBe("This engine has no door for rebuilding visits.");
  });

  it("says what it will do under the scheme chosen, and queues nothing until it is pressed", async () => {
    const e = await open();
    click(button(host, "Rebuild visits"));
    const select = dialog().querySelector<HTMLSelectElement>("#rebuild-scheme")!;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "the registry's own: named by date; studies within the same day are one session",
      "baseline-months: months from the first session, on 0, 6, 12; studies within the same day are one session",
      "by-day: named by date; studies within 3 days are one session",
    ]);
    expect(dialog().querySelector(".lede")?.textContent).toContain("Builds the visits again under the registry's own scheme, for every subject whose studies changed.");
    await choose(select, "by-day");
    expect(dialog().querySelector(".lede")?.textContent).toContain("Builds the visits again under by-day, for every subject whose studies changed.");
    expect(dialog().querySelector('[role="note"]')?.getAttribute("aria-label")).toBe("A pick on a visit that moves follows it. A pick on a visit that goes is withdrawn, and Review is asked about it.");
    expect(e.of("POST", "/api/sessions/rebuild")).toHaveLength(0);
    click(button(dialog(), "Cancel"));
    expect(e.of("POST", "/api/sessions/rebuild")).toHaveLength(0);
  });

  it("rebuilds under the registry's own scheme by naming none, and says the job", async () => {
    const e = await open(DOORS, undefined, (c) => (c.method === "POST" && c.url === "/api/sessions/rebuild" ? { status: 202, body: { job: 55, state: "queued" } } : undefined));
    click(button(host, "Rebuild visits"));
    click(button(dialog(), "Rebuild visits"));
    await settle();
    expect(e.of("POST", "/api/sessions/rebuild").map((c) => c.body)).toEqual([{}]);
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(host.textContent).toContain("Rebuilding the visits under the registry's own scheme is queued as job 55.");
  });

  it("rebuilds under a kept scheme by its name", async () => {
    const e = await open(DOORS, undefined, (c) => (c.method === "POST" && c.url === "/api/sessions/rebuild" ? { status: 202, body: { job: 56, state: "queued" } } : undefined));
    click(button(host, "Rebuild visits"));
    await choose(dialog().querySelector<HTMLSelectElement>("#rebuild-scheme")!, "by-day");
    click(button(dialog(), "Rebuild visits"));
    await settle();
    expect(e.of("POST", "/api/sessions/rebuild").map((c) => c.body)).toEqual([{ scheme_name: "by-day" }]);
    expect(host.textContent).toContain("Rebuilding the visits under by-day is queued as job 56.");
  });

  it("says the engine's refusal in place and keeps the dialog", async () => {
    await open(DOORS, undefined, (c) => (c.method === "POST" && c.url === "/api/sessions/rebuild" ? { status: 403, body: { error: "no grant: pipelines:work" } } : undefined));
    click(button(host, "Rebuild visits"));
    click(button(dialog(), "Rebuild visits"));
    await settle();
    expect(dialog().textContent).toContain("no grant: pipelines:work");
    expect(button(dialog(), "Rebuild visits")!.disabled).toBe(false);
  });
});

describe("what a rebuild says", () => {
  it("names the scheme, the registry's own where none is chosen", () => {
    expect(rebuildWords(null)).toBe("Builds the visits again under the registry's own scheme, for every subject whose studies changed.");
    expect(rebuildWords(KEPT.schemes[1])).toBe("Builds the visits again under by-day, for every subject whose studies changed.");
  });
});

describe("the registry's own scheme", () => {
  it("is read from its definition, which is what the engine sends, and from a name where an engine sent one", () => {
    expect(ownLabel(KEPT.default)).toBe("the registry's own: named by date; studies within the same day are one session");
    expect(ownLabel("baseline-months")).toBe("the registry's own: baseline-months");
    expect(ownLabel(null)).toBe("the registry's own");
    expect(ownName(KEPT.default)).toBeNull();
    expect(ownName("baseline-months")).toBe("baseline-months");
    expect(ownName(null)).toBeNull();
  });

  it("is never an object printed as text: not in the release form's choice, not on the Session schemes page", async () => {
    engine((c) => (c.method === "GET" && c.url === "/api/session-schemes" ? { status: 200, body: KEPT } : undefined));
    act(() => root.render(<SchemePicker caps={caps7a(DOORS)} value="" onChange={() => undefined} />));
    await settle();
    const options = [...host.querySelectorAll("select option")].map((o) => o.textContent);
    expect(options[0]).toBe("the registry's own: named by date; studies within the same day are one session");
    expect(host.textContent).not.toContain("[object Object]");
    act(() => root.render(<SchemesPage caps={caps7a(DOORS)} />));
    await settle();
    expect(host.textContent).not.toContain("[object Object]");
    expect(host.textContent).toContain("baseline-months");
    expect(host.textContent).not.toContain("the registry's own");
  });

  it("marks the kept scheme the registry's own where the engine names it", async () => {
    engine((c) => (c.method === "GET" && c.url === "/api/session-schemes" ? { status: 200, body: { ...KEPT, default: "baseline-months" } } : undefined));
    act(() => root.render(<SchemesPage caps={caps7a(DOORS)} />));
    await settle();
    expect(host.querySelector("td.mono .tag")?.textContent?.trim()).toBe("the registry's own");
  });
});
