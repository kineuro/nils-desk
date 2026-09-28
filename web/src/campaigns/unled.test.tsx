// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A campaign made to suggest nothing: the reader shows no answer, fills
// nothing in, shows none of the rules' evidence and offers no batches, even
// where a door still sends the rules' lines; the tag says why the item is
// read blind. A campaign made to show the rules keeps all of it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ID, doorsOf, fakeEngine } from "../../test/layout/reader.fixture";
import type { Capabilities } from "../capabilities";
import { forgetReadings } from "./readerDoors";
import { Workspace } from "./Workspace";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BATCHES = "GET /api/campaigns/{id}/batches";

function caps(): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.59" }, contracts: { openapi: "7" }, doors: [...doorsOf(), BATCHES], policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.9.0" }] },
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

async function open(suggest: string) {
  // the items as a campaign that is not sealed has them, and a why door that still sends the rules' lines
  vi.stubGlobal("fetch", fakeEngine({ seen: true, suggest }));
  root = createRoot(host);
  await act(async () => root.render(<Workspace caps={caps()} id={String(CAMPAIGN_ID)} role="rater" />));
  await until(() => host.querySelector("[data-reader-panel]"));
  // the reading has come when the header's text is drawn
  await until(() => host.textContent?.includes("t1_mprage_sag"));
}

// the values the rules' lines would fill in, pressed where they are
const preselected = () => [...host.querySelectorAll("button[aria-pressed=true]")].filter((b) => ["T1w", "brain", "MPRAGE", "RawRecon"].includes(b.textContent?.trim() ?? ""));
const batchButton = () => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Like stacks in batches")) ?? null;

describe("a campaign made to suggest nothing", () => {
  it("shows no answer, no evidence and no batches, and says why the item is read blind", async () => {
    await open("none");
    expect(host.querySelector(".suggest-words")).toBeNull();
    expect(preselected()).toEqual([]);
    expect(batchButton()).toBeNull();
    const tag = [...host.querySelectorAll(".tag.gated")].find((t) => t.textContent === "blind");
    expect(tag?.getAttribute("title")).toContain("shows no suggestion");
    // none of the rules' words: no rule name, no System 1
    expect(host.textContent).not.toContain("first");
  });

  it("keeps the suggestion and the batches where the campaign shows the rules", async () => {
    await open("rules");
    await until(() => host.querySelector(".suggest-words"));
    expect(preselected().length).toBeGreaterThan(0);
    expect(batchButton()).not.toBeNull();
  });
});
