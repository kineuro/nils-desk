// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The reader's lookup on the page (record 48, the second real read): a row
// found by a vendor's name fills what it implies and greys what can no longer
// hold; `/` fills a whole answer; the picture's view is kept across items;
// the keys card names the new keys. Drawn in jsdom against the fake engine.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ID, doorsOf, fakeEngine, type Asked } from "../../test/layout/reader.fixture";
import type { Capabilities } from "../capabilities";
import { forgetReadings } from "./readerDoors";
import { Workspace } from "./Workspace";

// the viewer's props, as the workspace gives them
const viewers: { view?: string; onView?: (v: "stack" | "planes") => void }[] = [];
vi.mock("../viewer/Viewer", () => ({
  Viewer: (p: { view?: string; onView?: (v: "stack" | "planes") => void }) => {
    viewers.push(p);
    return null;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[]): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.44" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.9.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

let host: HTMLDivElement;
let root: Root | null;
let log: Asked[];

beforeEach(() => {
  forgetReadings();
  log = [];
  viewers.length = 0;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function until<T>(what: () => T | null | undefined | false, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = what();
    if (v) return v;
    if (Date.now() > end) throw new Error("waited in vain");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function open(opts: { combos?: boolean } = {}) {
  vi.stubGlobal("fetch", fakeEngine({ ...opts, log }));
  root = createRoot(host);
  await act(async () => root!.render(<Workspace caps={capsWith(doorsOf(opts))} id={String(CAMPAIGN_ID)} role="rater" />));
  await until(() => host.querySelector("[data-reader-panel]"));
}

async function press(key: string, target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const chip = (axis: string, value: string) => host.querySelector<HTMLButtonElement>(`.axis-row[aria-label="${axis}"] .opt[data-value="${value}"]`);
const pending = () => host.querySelector(".pending")?.textContent ?? "";

describe("a row found by a vendor's name", () => {
  it("takes MPRAGE for bravo, says why, fills the base it implies and greys the rest", async () => {
    await open();
    await press("2");
    const find = host.querySelector<HTMLInputElement>('[data-find="technique"]')!;
    expect(document.activeElement).toBe(find);
    await type(find, "bravo");
    expect(host.querySelector('.axis-row[aria-label="technique"] .find-why')?.textContent).toBe("BRAVO → MPRAGE");
    await press("Enter", find);
    expect(pending()).toContain("technique MPRAGE");
    // the base is filled in, marked implied, and held
    const t1 = chip("base", "T1w")!;
    expect(t1.className).toContain("implied");
    expect(t1.getAttribute("aria-pressed")).toBe("true");
    expect(t1.title).toContain("implied: technique is MPRAGE");
    expect(pending()).toContain("base T1w");
    await act(async () => t1.click());
    expect(pending()).toContain("base T1w");
    // the other bases cannot hold, and say why; can't tell stays open
    const t2 = chip("base", "T2w")!;
    expect(t2.className).toContain("out");
    expect(t2.title).toBe("not with this answer: technique is MPRAGE sets base T1w");
    await act(async () => t2.click());
    expect(pending()).toContain("base T1w");
    const cant = [...host.querySelectorAll<HTMLButtonElement>('.axis-row[aria-label="base"] .opt')].find((b) => b.textContent?.includes("can't tell"))!;
    expect(cant.className).not.toContain("out");
    // clearing the technique releases the base
    await press("2");
    const again = host.querySelector<HTMLInputElement>('[data-find="technique"]')!;
    await type(again, "mprage");
    await press("Enter", again);
    expect(pending()).toContain("technique – ");
    expect(pending()).toContain("base –");
    expect(chip("base", "T2w")!.className).not.toContain("out");
  });

  it("greys the rest of an exclusion group once one of it is chosen", async () => {
    await open();
    await act(async () => chip("modifier", "FLAIR")!.click());
    expect(chip("modifier", "STIR")!.className).toContain("out");
    expect(chip("modifier", "STIR")!.title).toContain("FLAIR and STIR exclude each other");
    expect(chip("modifier", "FatSat")!.className).not.toContain("out");
  });
});

describe("a whole answer at once", () => {
  it("opens on /, finds by bravo, and fills every row on Enter", async () => {
    await open();
    await until(() => log.some((a) => a.path.endsWith("/combinations")));
    await press("/");
    const box = host.querySelector<HTMLInputElement>(".combo-find")!;
    expect(document.activeElement).toBe(box);
    await type(box, "bravo");
    const offers = [...host.querySelectorAll(".combo-pop .combo")].map((li) => li.textContent);
    expect(offers[0]).toContain("RawRecon · MPRAGE · none · none · T1w · brain · not_given");
    expect(offers[0]).toContain("BRAVO → MPRAGE");
    expect(offers.at(-1)).toContain("the pack");
    await press("Enter", box);
    expect(pending()).toContain("provenance RawRecon · technique MPRAGE · modifier none · construct none · base T1w · body_part brain · post_contrast not_given");
    // the whole answer is legal and sent as it stands
    await act(async () => (document.activeElement as HTMLElement | null)?.blur());
    await press("Enter");
    const sent = await until(() => log.find((a) => a.path.endsWith("/answer")));
    expect((sent.body as { value: Record<string, unknown> }).value.base).toBe("T1w");
  });

  it("still offers what the pack's shape settles where the engine counts nothing", async () => {
    await open({ combos: false });
    await press("/");
    const box = host.querySelector<HTMLInputElement>(".combo-find")!;
    await type(box, "bravo");
    expect(host.querySelector(".combo-pop .combo")?.textContent).toContain("MPRAGE · T1w");
    expect(log.some((a) => a.path.endsWith("/combinations"))).toBe(false);
  });

  it("names the new keys on the keys card", async () => {
    await open();
    await press("?");
    const card = host.querySelector(".keys-drawer")!.textContent ?? "";
    expect(card).toContain("find a whole answer by any name");
    expect(card).toContain("BRAVO finds MPRAGE");
    expect(card).toContain("mark it unsure");
  });
});

describe("the picture's view", () => {
  it("is kept for the next item and the next visit, and survives a browser that keeps nothing", async () => {
    await open();
    expect(viewers.at(-1)?.view).toBe("planes");
    await act(async () => viewers.at(-1)!.onView!("stack"));
    expect(localStorage.getItem("nils.reader.view")).toBe("stack");
    await act(async () => root?.unmount());
    root = null;
    viewers.length = 0;
    forgetReadings();
    await open();
    expect(viewers.at(-1)?.view).toBe("stack");
    // a private window: storage throws, the reader opens on the planes and keeps working
    await act(async () => root?.unmount());
    root = null;
    viewers.length = 0;
    forgetReadings();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      await open();
      expect(viewers.at(-1)?.view).toBe("planes");
      await act(async () => viewers.at(-1)!.onView!("stack"));
      expect(viewers.at(-1)?.view).toBe("stack");
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
