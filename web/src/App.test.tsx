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
import { GRANTS } from "./grants";
import { summaryKept, placesKept } from "./objects/kept";
import { backupsKept } from "./settings/kept";
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

// the install of agenda 3.8: digested from the command line, so the registry holds stacks and no source place is named
describe("the shell of an install whose data came in from the command line", () => {
  const DOORS = ["GET /api/capabilities", "GET /api/places", "GET /api/backups", "GET /api/summary", "GET /api/sources", "GET /api/review", "GET /api/jobs", "GET /api/batches"];
  const engine = { engine: { name: "nils", version: "1.0.0" }, contracts: { openapi: "7", suite: "3" }, doors: DOORS, policy: [], auth: "token", principal: "astrid", roles: [], registry: { epoch: 1, schema_version: 40 }, packs: [] };
  const wide = (origin: string, mode: string) =>
    ({
      engine,
      kvasir: null,
      assistant: null,
      apps: [],
      person: { subject: "astrid", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
      desk: { version: "1.0.0", mode, contracts: { openapi: "7", suite: "3" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true, settings: { origin, engine_url: "http://127.0.0.1:8437", supervisor_url: null } },
    }) as unknown as Capabilities;
  const places = { places: [{ id: 1, name: "registry", role: "registry", path: "/s/registry", guarantees: {}, probed: { mount: "/s" }, probed_at: null, retired_at: null }] };
  const backups = { dir: "/s/backups", place: null, count: 0, archives: [], schedule: { every: "off", at: "02:00", day: null, keep: 14, timezone: "UTC", next: null, next_local: null, last: null } };
  const summary = (n: number) => ({ epoch: 1, synthetic: null, cohorts: 0, subjects: { total: 1, by_cohort: {} }, sessions: { total: 1, by_cohort: {} }, stacks: { total: n, by_cohort: {} }, since: null });
  let summaryReads: number;

  function serve(c: Capabilities, stacks: number, summaryNever = false, over: { places?: unknown; backups?: unknown } = {}) {
    summaryReads = 0;
    const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", (url: string) => {
      const path = new URL(String(url), "http://x").pathname;
      if (path === "/desk/capabilities") return json(c);
      if (path === "/api/places") return json(over.places ?? places);
      if (path === "/api/backups") return json(over.backups ?? backups);
      if (path === "/api/summary") {
        // the "since" read of Home's tile carries a query and is another read
        if (new URL(String(url), "http://x").search === "") summaryReads += 1;
        return summaryNever ? new Promise<Response>(() => undefined) : json(summary(stacks));
      }
      if (path === "/api/batches") return json({ count: 0, batches: [] });
      if (path === "/api/jobs") return json({ jobs: [] });
      return Promise.resolve(new Response(JSON.stringify({ error: "not here" }), { status: 404, headers: { "Content-Type": "application/json" } }));
    });
  }
  const resetKept = () => {
    for (const k of [summaryKept, placesKept, backupsKept]) k.put(null as never);
  };

  beforeEach(() => resetKept());

  it("opens Home from the side once data is in, keeps Settings > Setup, and says on every page that nobody signs in", async () => {
    serve(wide("https://desk.example.org", "off"), 5);
    history.replaceState(null, "", "/#home");
    await act(async () => root.render(<App />));
    await wait(0);
    // data is in: the side is the whole desk's and its Home opens Home, not the setup page
    expect(host.querySelector("#side")?.textContent).toContain("Review");
    expect(host.querySelector("#side")?.textContent).not.toContain("Get started");
    expect(host.querySelector("main.page h1")?.textContent).toBe("What NILS holds, and what needs you");
    expect(text()).toContain("Nobody signs in: anyone who reaches this address can do everything.");
    expect(host.querySelector('.banner a[href$="settings/people"]')).not.toBeNull();
    // the summary was read once for the shell, Home included
    expect(summaryReads).toBe(1);
    // Settings > Setup keeps the setup page, its line goes to Home, and the banner stays
    await act(async () => {
      history.replaceState(null, "", "/#settings/setup");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await wait(0);
    expect(host.querySelector("main.page h1")?.textContent).toBe("Set up NILS");
    expect(host.querySelector("a.setup-line")?.getAttribute("href")).toBe("#home");
    expect(text()).toContain("Nobody signs in");
    expect(summaryReads).toBe(1);
  });

  it("lands on the setup page only while the registry is empty, and has no banner on a desk reached from this machine", async () => {
    serve(wide("http://127.0.0.1:7200", "off"), 0);
    history.replaceState(null, "", "/#home");
    await act(async () => root.render(<App />));
    await wait(0);
    expect(host.querySelector("main.page h1")?.textContent).toBe("Set up NILS");
    expect(host.querySelector("#side")?.textContent).toContain("Get started");
    expect(host.querySelector(".banner")).toBeNull();
  });

  it("does not hold Home back for the summary once the steps say the install is set up", async () => {
    const at = { probed: { mount: "/s" }, probed_at: null, retired_at: null };
    const set = {
      places: [
        { id: 1, name: "registry", role: "registry", path: "/s/registry", guarantees: { backup: "backups" }, ...at },
        { id: 2, name: "backups", role: "backup", path: "/s/backups", guarantees: {}, ...at },
        { id: 3, name: "incoming", role: "source", path: "/s/incoming", guarantees: {}, ...at },
      ],
    };
    serve(wide("http://127.0.0.1:7200", "local"), 5, true, { places: set, backups: { ...backups, schedule: { ...backups.schedule, every: "day" } } });
    history.replaceState(null, "", "/#home");
    await act(async () => root.render(<App />));
    await wait(0);
    expect(host.querySelector("main.page h1")?.textContent).toBe("What NILS holds, and what needs you");
  });
});
