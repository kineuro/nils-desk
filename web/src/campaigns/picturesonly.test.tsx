// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A campaign made to show the pictures alone (hide_header): the single
// reader draws no text of the file's header beside the pictures, not the
// series name, the sequence or the physics, offers no whole-header door and
// never asks for one, even where a door still sends the text; a tag says so.
// The same campaign without it draws the header as before.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ID, doorsOf, fakeEngine, ITEM_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Capabilities } from "../capabilities";
import { forgetReadings } from "./readerDoors";
import { Workspace } from "./Workspace";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function caps(): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.61" }, contracts: { openapi: "7" }, doors: doorsOf(), policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.13.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  forgetReadings();
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

async function open(hideHeader: boolean): Promise<Asked[]> {
  const log: Asked[] = [];
  vi.stubGlobal("fetch", fakeEngine({ suggest: "none", hideHeader, log }));
  root = createRoot(host);
  await act(async () => root.render(<Workspace caps={caps()} id={String(CAMPAIGN_ID)} role="rater" />));
  await until(() => host.querySelector("[data-reader-panel]"));
  // the reading has come: its door was asked and answered
  await until(() => log.some((a) => a.path === `/api/campaigns/${CAMPAIGN_ID}/items/${ITEM_ID}/why`));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
  return log;
}

const press = async (key: string) =>
  act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
  });

describe("a campaign made to show the pictures alone", () => {
  it("draws no header text and no header door, never asks for the header, and says so", async () => {
    const log = await open(true);
    expect(host.querySelector(".header-block")).toBeNull();
    expect(host.textContent).not.toContain("t1_mprage_sag");
    expect(host.querySelector(".hb-doors")).toBeNull();
    await press("h");
    expect(host.querySelector(".header-drawer")).toBeNull();
    expect(log.some((a) => a.path.endsWith("/header"))).toBe(false);
    const tag = [...host.querySelectorAll(".tag.gated")].find((t) => t.textContent === "pictures only");
    expect(tag?.getAttribute("title")).toContain("pictures alone");
    // the pictures and the rows are there
    expect(host.querySelector(".rate-picture")).not.toBeNull();
  });

  it("draws the header as before where the campaign does not ask it", async () => {
    await open(false);
    await until(() => host.querySelector(".header-block"));
    expect(host.textContent).toContain("t1_mprage_sag");
    expect([...host.querySelectorAll(".tag.gated")].some((t) => t.textContent === "pictures only")).toBe(false);
  });
});
