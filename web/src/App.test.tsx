// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The shell as a person saw it on 2026-10-11: the engine took longer than the
// desk waits on one read of the capabilities, and the whole page turned into
// "The engine did not answer" for a few seconds while a chat and a job went
// on. One read that misses keeps the page; reads that keep missing say the
// engine is slow above it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { Capabilities } from "./capabilities";
import { OUTAGE_AFTER, READ_EVERY_MS, RETRY_MS } from "./held";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function caps(reachable: boolean): Capabilities {
  return {
    engine: reachable
      ? {
          engine: { name: "nils", version: "1.0.0" },
          contracts: { openapi: "7", suite: "3" },
          doors: ["GET /api/capabilities"],
          policy: [],
          auth: "oidc",
          principal: "erik",
          roles: [],
          registry: { epoch: 5, schema_version: 40 },
          packs: [],
        }
      : null,
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "erik", display_name: "Erik Lund", grants: ["review:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: { openapi: "7", suite: "3" }, engine_reachable: reachable, contract_mismatch: null, login: null, signed_in: true },
  } as Capabilities;
}

let host: HTMLDivElement;
let root: Root;
// what each read of the capabilities answers, in turn
let reads: Array<Capabilities | "down">;
let asked: number;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  asked = 0;
  vi.stubGlobal("fetch", (url: string) => {
    if (String(url) === "/desk/capabilities") {
      const r = reads[Math.min(asked, reads.length - 1)];
      asked += 1;
      if (r === "down") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ error: "not here" }), { status: 404, headers: { "Content-Type": "application/json" } }));
  });
  history.replaceState(null, "", "/#review");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const text = () => host.textContent ?? "";

describe("the shell when a read of the capabilities misses", () => {
  it("keeps the page through one read that found the engine slow, and says nothing", async () => {
    reads = [caps(true), caps(false), caps(true)];
    await act(async () => root.render(<App />));
    await wait(0);
    expect(asked).toBe(1);
    expect(host.querySelector("main.page")).not.toBeNull();
    expect(text()).not.toContain("The engine did not answer");
    const before = host.querySelector("main.page")!.innerHTML;
    // the read that missed
    await wait(READ_EVERY_MS);
    expect(asked).toBe(2);
    expect(text()).not.toContain("The engine did not answer");
    expect(text()).not.toContain("slow to answer");
    expect(host.querySelector("main.page")!.innerHTML).toBe(before);
    // asked again sooner, and the engine answers
    await wait(RETRY_MS);
    expect(asked).toBe(3);
    expect(text()).not.toContain("slow to answer");
  });

  it("says the engine is slow once reads keep missing, above the page it keeps", async () => {
    reads = [caps(true), caps(false), "down", ...Array(OUTAGE_AFTER).fill(caps(false)), caps(true)];
    await act(async () => root.render(<App />));
    await wait(0);
    await wait(READ_EVERY_MS);
    for (let i = 1; i < OUTAGE_AFTER; i++) await wait(RETRY_MS);
    expect(text()).toContain("The engine is slow to answer");
    expect(text()).not.toContain("The engine did not answer");
    expect(text()).not.toContain("The desk did not answer");
    expect(host.querySelector("main.page")).not.toBeNull();
    // it answers again: the words go
    reads = [caps(true)];
    await wait(RETRY_MS);
    expect(text()).not.toContain("slow to answer");
  });

  it("still says the engine did not answer where no page was ever shown", async () => {
    reads = [caps(false)];
    await act(async () => root.render(<App />));
    await wait(0);
    expect(text()).toContain("The engine did not answer");
  });
});
