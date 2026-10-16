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
    expect(html).toContain('<span class="meta">releases looked up 20 minutes ago</span>');
    expect(html).toContain(">Look again</button>");
    expect(html).not.toContain("disabled");
    const busy = renderToStaticMarkup(<ReleasesLook looked={minutesAgo(1)} now={Date.now()} working={true} onLook={() => undefined} />);
    expect(busy).toContain("disabled");
    const others = renderToStaticMarkup(<ReleasesLook looked={minutesAgo(3)} now={Date.now()} working={false} onLook={null} />);
    expect(others).toContain("releases looked up 3 minutes ago");
    expect(others).not.toContain("<button");
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
  it("is read as it was, and with ?fresh=1 where the look is asked for again", async () => {
    await supervise.install();
    await supervise.install(true);
    expect(asked).toEqual(["/supervise/api/supervise/install", "/supervise/api/supervise/install?fresh=1"]);
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
    expect(host.textContent).toContain("checked just now");
    expect(host.textContent).toContain("releases looked up 14 minutes ago");
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
    expect(host.textContent).not.toContain("releases looked up");
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
