// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// When the supervisor last looked at the releases, and the way to have it look
// again (2026-10-16: the Parts page named the release before the newest one
// minute after the newest was published, from a look the supervisor keeps for
// a quarter of an hour, under "checked just now"): the look's age is said
// beside the table, Look again asks the door for a fresh look and reads the
// page once more, and an engine that does not say when it looked changes
// nothing.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { SETS } from "../grants";
import { ReleasesLook } from "./ReleasesLook";
import { Settings } from "./Settings";
import { supervise, type Install } from "./supervise";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

describe("the look at the releases, beside the table", () => {
  it("says how old the look is, with Look again where the person may act, disabled while it is made", () => {
    const html = renderToStaticMarkup(<ReleasesLook looked={minutesAgo(20)} now={Date.now()} working={false} onLook={() => undefined} />);
    expect(html).toContain('<span class="meta" role="status">looked for releases 20 min ago</span>');
    expect(html).toContain(">Look again</button>");
    expect(html).not.toContain("disabled");
    const busy = renderToStaticMarkup(<ReleasesLook looked={minutesAgo(1)} now={Date.now()} working={true} onLook={() => undefined} />);
    expect(busy).toContain("disabled");
    const others = renderToStaticMarkup(<ReleasesLook looked={minutesAgo(3)} now={Date.now()} working={false} onLook={null} />);
    expect(others).toContain("looked for releases 3 min ago");
    expect(others).not.toContain("<button");
  });

  it("says when the next full look is where GitHub's requests an hour are spent, and why the last look failed", () => {
    const html = renderToStaticMarkup(
      <ReleasesLook looked={minutesAgo(1)} now={Date.now()} working={false} onLook={() => undefined} waits="next full look at 14:05: the 30 requests an hour this install spends at GitHub are spent" failed="git: not found" />,
    );
    expect(html).toContain("looked for releases 1 min ago");
    expect(html).toContain("next full look at 14:05: the 30 requests an hour this install spends at GitHub are spent");
    expect(html).toContain("the last look failed: git: not found");
  });

  it("says nothing from an engine that does not say when it looked", () => {
    expect(renderToStaticMarkup(<ReleasesLook looked={undefined} now={Date.now()} working={false} onLook={() => undefined} />)).toBe("");
    expect(renderToStaticMarkup(<ReleasesLook looked={null} now={Date.now()} working={false} onLook={() => undefined} />)).toBe("");
    expect(renderToStaticMarkup(<ReleasesLook looked="not a time" now={Date.now()} working={false} onLook={() => undefined} />)).toBe("");
  });
});

function caps(): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.83" },
      contracts: { openapi: "7", suite: "3" },
      doors: [],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: [],
      registry: { epoch: 0 },
      packs: [],
      uptime_seconds: 3_600,
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "admin", display_name: "admin", grants: SETS.admin.grants, detail: "sensitive", groups: ["Admins"] },
    desk: { version: "1.0.0-alpha.65", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

function install(over: Partial<Install["release"]> = {}): Install {
  return {
    record: "/home/ada/.config/nils/setup.toml",
    dir: "/home/ada/nils",
    runtime: "machine",
    service: "systemd user units",
    reach: "loopback",
    backend: "sqlite",
    mode: "local",
    at: "2026-10-16T01:00:00Z",
    ports: { engine: 8437, desk: 7200 },
    parts: { engine: { version: "1.0.0-alpha.83", kind: "binary", path: "/home/ada/.local/bin/nils" } },
    places: [],
    oidc: null,
    addresses: [],
    services: [{ part: "engine", unit: "nils-engine", watcher: "systemd", running: true }],
    unfinished: false,
    release: {
      installed: "1.0.0-alpha.83",
      newest: "1.0.0-alpha.84",
      newer: "1.0.0-alpha.84",
      error: null,
      command: "nils update --all",
      behind: ["engine"],
      parts: [{ part: "engine", installed: "1.0.0-alpha.83", newest: "1.0.0-alpha.84", newer: "1.0.0-alpha.84", held: null, follows: null, error: null, command: "nils update --part engine" }],
      ...over,
    },
    machine: { card: null, advice: [] },
  };
}

let host: HTMLDivElement;
let root: Root;
let asked: string[];

beforeEach(() => {
  asked = [];
  vi.stubGlobal("fetch", (url: string) => {
    asked.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(install()), { status: 200, headers: { "Content-Type": "application/json" } }));
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the supervisor's install door", () => {
  it("is read as it was, with ?fresh=1 where the look is asked for again, and with ?watch=1 while the Parts page is open", async () => {
    await supervise.install();
    await supervise.install(true);
    await supervise.install(false, true);
    await supervise.install(true, true);
    expect(asked).toEqual([
      "/supervise/api/supervise/install",
      "/supervise/api/supervise/install?fresh=1",
      "/supervise/api/supervise/install?watch=1",
      "/supervise/api/supervise/install?fresh=1&watch=1",
    ]);
  });
});

describe("the Parts page", () => {
  const draw = async (i: Install, onChanged: () => void) => {
    await act(async () => root.render(<Settings caps={caps()} install={i} checkedAt={Date.now()} page="parts" onChanged={onChanged} />));
  };
  const buttons = () => [...host.querySelectorAll("button")].filter((b) => b.textContent === "Look again");

  it("says when the releases were looked up beside the install's own read, and asks for a look again, then reads the page once more", async () => {
    const onChanged = vi.fn();
    await draw(install({ looked_at: minutesAgo(14) }), onChanged);
    // the look's own age stands alone: the page's read is not a look
    expect(host.textContent).not.toContain("checked just now");
    expect(host.textContent).toContain("looked for releases 14 min ago");
    expect(host.textContent).toContain("Engine 1.0.0-alpha.84 is out");
    expect(host.textContent).toContain("The engine moves from 1.0.0-alpha.83 to 1.0.0-alpha.84.");
    expect(buttons()).toHaveLength(1);
    await act(async () => buttons()[0].click());
    await act(async () => undefined);
    expect(asked).toEqual(["/supervise/api/supervise/install?fresh=1"]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Looked at the releases again.");
  });

  it("says nothing of a look, and offers none, for an engine that does not say when it looked", async () => {
    await draw(install(), vi.fn());
    expect(host.textContent).toContain("checked just now");
    expect(host.textContent).not.toContain("looked for releases");
    expect(buttons()).toHaveLength(0);
  });

  it("says why when the look could not be made", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "the release listing was refused" }), { status: 502, headers: { "Content-Type": "application/json" } })));
    const onChanged = vi.fn();
    await draw(install({ looked_at: minutesAgo(2) }), onChanged);
    await act(async () => buttons()[0].click());
    await act(async () => undefined);
    expect(host.textContent).toContain("the release listing was refused");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("Update everything's order (2026-11-06)", () => {
  const draw = async (i: Install) => {
    await act(async () => root.render(<Settings caps={caps()} install={i} checkedAt={Date.now()} page="parts" onChanged={vi.fn()} />));
  };
  const ordered = (): Install => {
    const i = install({
      looked_at: new Date(Date.now() - 40_000).toISOString(),
      newer: "1.0.0-alpha.84",
      behind: ["engine", "desk"],
      order: [
        { part: "engine", from: "1.0.0-alpha.83", to: "1.0.0-alpha.84", why: "first: desk 1.0.0-alpha.66 needs its HTTP contract 8" },
        { part: "desk", from: "1.0.0-alpha.65", to: "1.0.0-alpha.66", why: "after the engine: it needs HTTP contract 8" },
      ],
      stays: [{ part: "desk", version: "1.0.0-alpha.67", why: "desk 1.0.0-alpha.67 needs suite contract 4, which neither engine 1.0.0-alpha.83 nor 1.0.0-alpha.84 speaks; it waits for an engine release that speaks it" }],
    });
    i.parts["desk"] = { version: "1.0.0-alpha.65", kind: "binary", path: "/home/ada/.local/bin/nils-desk" };
    i.release.parts = [
      ...(i.release.parts ?? []),
      { part: "desk", installed: "1.0.0-alpha.65", newest: "1.0.0-alpha.67", newer: "1.0.0-alpha.66", held: null, follows: null, error: null, command: "nils update --part engine --part desk", needs: "HTTP contract 8", after: "engine" },
    ];
    return i;
  };

  it("numbers the steps with why each is in its place, says what stays out, and the look's age to the ten seconds", async () => {
    await draw(ordered());
    const steps = [...host.querySelectorAll("ol.update-order li")].map((li) => li.textContent);
    expect(steps).toEqual([
      "The engine moves from 1.0.0-alpha.83 to 1.0.0-alpha.84, first: desk 1.0.0-alpha.66 needs its HTTP contract 8.",
      "The desk moves from 1.0.0-alpha.65 to 1.0.0-alpha.66, after the engine: it needs HTTP contract 8.",
    ]);
    expect(host.textContent).toContain("Desk 1.0.0-alpha.67 needs suite contract 4, which neither engine 1.0.0-alpha.83 nor 1.0.0-alpha.84 speaks; it waits for an engine release that speaks it.");
    expect(host.textContent).toContain("in this order, one part at a time");
    expect(host.textContent).toMatch(/looked for releases [45]0 s ago/u);
  });

  it("takes a desk that needs the engine's next contract with the engine, first, from the desk's own Update", async () => {
    await draw(ordered());
    const own = [...host.querySelectorAll("button")].find((b) => b.textContent === "Update with the engine");
    expect(own?.getAttribute("title")).toBe("nils update --part engine --part desk");
    let body: unknown = null;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      const started = String(url).endsWith("/update-all");
      if (started) body = JSON.parse(String(init?.body ?? "null"));
      // the stand-in run ends at its first read, so nothing is followed past the test
      const run = { id: "r1", what: "update", command: [], state: started ? "running" : "failed", pid: 1, started_at: "", finished_at: null, exit: started ? null : 1, tail: ["a stand-in run"] };
      return Promise.resolve(new Response(JSON.stringify(run), { status: started ? 202 : 200, headers: { "Content-Type": "application/json" } }));
    });
    await act(async () => own?.click());
    await act(async () => undefined);
    expect(body).toEqual({ parts: ["engine", "desk"] });
  });
});
