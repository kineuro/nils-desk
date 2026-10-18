// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The verify screen (record 58 P1, spec 12.2), drawn in jsdom against a fake
// engine: one stack, the header text as the reader shows it, every asked
// axis filled in with its proposal before any key, Enter accepts the whole
// item through a visible Accept key and the next item is claimed, a changed
// axis turns the key to Answer and Backspace brings the proposal back, one
// line says planted values exist and never where; where two sources differ
// the axis is open and A and B are offered unlabelled, z and x take a side;
// a measuring campaign's item shows nothing first (record 55 D6), as today.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ID, doorsOf, fakeEngine, PROPOSAL, type Asked } from "../../test/layout/reader.fixture";
import type { Capabilities } from "../capabilities";
import { PLANTED_WORDS } from "./reader";
import { forgetReadings } from "./readerDoors";
import { Workspace } from "./Workspace";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-beta.2" }, contracts: { openapi: "7" }, doors: doorsOf(), policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.3.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

let host: HTMLDivElement;
let root: Root;
let log: Asked[];

beforeEach(() => {
  forgetReadings();
  log = [];
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
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

async function open(opts: { verify?: boolean | "ab"; purpose?: string } = {}) {
  vi.stubGlobal("fetch", fakeEngine({ ...opts, log }));
  root = createRoot(host);
  await act(async () => root.render(<Workspace caps={caps} id={String(CAMPAIGN_ID)} role="rater" />));
  await until(() => host.querySelector("[data-reader-panel]"));
}

async function press(key: string, target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const text = (sel: string) => host.querySelector(sel)?.textContent ?? null;
const pending = () => text(".pending");
const accept = () => host.querySelector<HTMLButtonElement>(".act-answer");
const chosenOn = (axis: string) => host.querySelector(`.axis-row[aria-label="${axis}"] .opt.on`)?.textContent ?? null;

describe("the verify screen", () => {
  it("fills in every asked axis with the proposal before any key, keeps the file's text, and says planted values exist", async () => {
    await open({ verify: true });
    await until(() => text(".suggest-words")?.includes("Filled in"));
    expect(text(".suggest-words")).toBe("filled in Filled in: Enter accepts, or change an axis.");
    for (const [axis, v] of Object.entries(PROPOSAL)) expect(chosenOn(axis), axis).toContain(Array.isArray(v) ? "none" : v);
    expect(pending()).toBe("Sends: provenance RawRecon · technique MPRAGE · modifier none · construct none · base T1w · body_part brain · post_contrast not_given");
    // the header text as the reader shows it today, never hidden by verify
    expect(host.querySelector(".header-block, .header-lines, .rate-side")?.textContent).toContain("t1_mprage_sag");
    // the one line on planted values: that they exist, not where or how many
    expect(text(".verify-note")).toBe(PLANTED_WORDS);
    expect(host.querySelectorAll(".verify-note")).toHaveLength(1);
    expect(host.textContent).not.toContain("25 planted");
    // one key accepts the whole item, and the button says the key
    expect(accept()?.textContent).toBe("Accept Enter");
  });

  it("Enter accepts the whole item as filled in and the next item is claimed; a change says Answer, Backspace brings the proposal back", async () => {
    await open({ verify: true });
    await until(() => accept()?.textContent === "Accept Enter");
    // a changed axis is an answer, not an acceptance
    const neck = [...host.querySelectorAll<HTMLButtonElement>('.axis-row[aria-label="body_part"] .opt')].find((b) => b.textContent?.includes("neck"))!;
    await act(async () => neck.click());
    expect(pending()).toContain("body_part neck");
    expect(accept()?.textContent).toBe("Answer Enter");
    await press("Backspace");
    expect(pending()).toContain("body_part brain");
    expect(accept()?.textContent).toBe("Accept Enter");
    const claims = log.filter((a) => a.path.endsWith("/claim")).length;
    await press("Enter");
    const sent = await until(() => log.find((a) => a.method === "POST" && a.path.endsWith("/answer")));
    expect((sent.body as { value: unknown }).value).toEqual({ provenance: "RawRecon", technique: "MPRAGE", modifier: null, construct: null, base: "T1w", body_part: "brain", post_contrast: "not_given" });
    // no modal, no paragraph: the next item is claimed at once
    await until(() => log.filter((a) => a.path.endsWith("/claim")).length > claims);
    expect(host.querySelector("dialog")).toBeNull();
  });

  it("where two sources differ, the axis is open and A and B are offered unlabelled; z and x take a side", async () => {
    await open({ verify: "ab" });
    await until(() => host.querySelector(".ab-bar"));
    expect(text(".ab-bar .suggest-words")).toBe("A or B A and B differ on technique: pick one, or choose below.");
    const sides = [...host.querySelectorAll(".ab-side")];
    expect(sides.map((s) => s.textContent)).toEqual(["zAtechnique MPRAGE", "xBtechnique MEMPRAGE"]);
    // nothing says whose side is which
    expect(text(".ab-bar")).not.toMatch(/rules|System 1|imported|v0|suggested by/iu);
    expect(pending()).toContain("technique –");
    expect(pending()).toContain("base T1w");
    expect(accept()?.textContent).toBe("Answer Enter");
    await press("x");
    expect(pending()).toContain("technique MEMPRAGE");
    expect(host.querySelector('.ab-side[aria-pressed="true"]')?.textContent).toContain("B");
    await press("z");
    expect(pending()).toContain("technique MPRAGE");
    expect(host.querySelector('.ab-side[aria-pressed="true"]')?.textContent).toContain("A");
    // the rest of the answer stands as filled in
    expect(pending()).toContain("body_part brain");
  });

  it("a measuring campaign's item shows nothing first, as record 55 D6 says, and no Accept key", async () => {
    await open({ purpose: "measure" });
    await until(() => pending());
    expect(pending()).toBe("Sends: provenance – · technique – · modifier – · construct – · base – · body_part – · post_contrast –");
    expect(host.querySelector(".suggest")).toBeNull();
    expect(host.querySelector(".verify-note")).toBeNull();
    expect(accept()?.textContent).toBe("Answer Enter");
  });
});
