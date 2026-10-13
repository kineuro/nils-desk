// SPDX-License-Identifier: AGPL-3.0-only
// Settings, Parts with rules releases of their own (record 55 B5): the real
// desk, its top bar and side, against a fake engine and supervisor whose
// install has the MRI rules at 1.0.3 with 1.1.0 out as a release of their
// own, the clinical rules with a newer release that waits for a newer
// engine, and the site's own pack beside them. ?pinned pins the MRI rules at
// 1.0.0, as an install that reproduces the paper's rules does. Every name
// and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const PINNED = new URLSearchParams(location.search).has("pinned");
const ENGINE = "1.0.0-alpha.80";

const engine = {
  engine: { name: "nils", version: ENGINE },
  contracts: { openapi: "7", pack: "10" },
  doors: ["GET /api/capabilities", "GET /api/jobs"],
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4 },
  packs: [{ name: "mri", version: PINNED ? "1.0.0" : "1.0.3" }],
  uptime_seconds: 2 * 86_400 + 600,
};

const caps = {
  engine,
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: {
    version: ENGINE,
    mode: "local",
    contracts: {},
    engine_reachable: true,
    contract_mismatch: null,
    login: null,
    signed_in: true,
    settings: {
      origin: "http://127.0.0.1:7200",
      engine_url: "http://127.0.0.1:8437",
      kvasir_url: null,
      assistant_url: null,
      session_hours: 12,
      token_minutes: 15,
      cli_token_hours: 24,
      export: "export",
      store: "/home/astrid/nils/desk",
      retention: "90 days",
      engine_flags: null,
      supervisor_url: "http://127.0.0.1:8470",
    },
  },
};

const own = (part: string, installed: string, newest: string) => ({ part, installed, newest, newer: null, held: null, follows: null, error: null, command: `nils update --part ${part}` });
const rules = (pack: string, installed: string, newest: string, newer: string | null, over: Record<string, unknown> = {}) => ({
  part: "rules",
  pack,
  installed,
  newest,
  newer,
  held: null,
  follows: null,
  error: null,
  command: "nils update --part rules",
  waits: null,
  edited: false,
  pinned: null,
  ...over,
});
const mri = PINNED ? rules("mri", "1.0.0", "1.1.0", null, { pinned: "1.0.0" }) : rules("mri", "1.0.3", "1.1.0", "1.1.0");
const clinical = rules("clinical", "0.3.0", "0.4.0", null, { waits: "clinical 0.4.0 works with engines >=1.0.0-alpha.82, <2.0.0, and this engine is 1.0.0-alpha.80" });
const parts = [own("engine", ENGINE, ENGINE), own("desk", ENGINE, ENGINE), mri, clinical];

const install = {
  record: "/home/astrid/.config/nils/setup.toml",
  dir: "/home/astrid/nils",
  runtime: "systemd",
  service: "user units",
  reach: "loopback",
  backend: "sqlite",
  mode: "local",
  at: "2026-10-13T08:00:00Z",
  ports: { engine: 8437, desk: 7200 },
  parts: {
    engine: { version: ENGINE, kind: "binary", path: "/home/astrid/.local/bin/nils" },
    desk: { version: ENGINE, kind: "binary", path: "/home/astrid/.local/bin/nils-desk" },
  },
  places: [{ name: "registry", role: "registry", path: "/home/astrid/nils/registry" }],
  oidc: null,
  addresses: [],
  services: [
    { part: "engine", unit: "nils-engine", watcher: "systemd", running: true },
    { part: "desk", unit: "nils-desk", watcher: "systemd", running: true },
  ],
  unfinished: false,
  release: {
    installed: ENGINE,
    newest: ENGINE,
    newer: PINNED ? null : "rules mri 1.1.0",
    error: null,
    command: "nils update --all",
    behind: PINNED ? [] : ["rules"],
    parts,
    rules: [mri, clinical],
    packs: {
      dir: "/home/astrid/.local/share/nils/packs",
      release: ENGINE,
      installed: [
        { name: "clinical", version: "0.3.0", digest: "c1" },
        { name: "mri", version: PINNED ? "1.0.0" : "1.0.3", digest: "m1" },
        { name: "site-ct", version: "2.0.0", digest: "s1" },
      ],
      bundled: [
        { name: "clinical", version: "0.3.0", digest: "c1" },
        { name: "mri", version: "1.0.3", digest: "m1" },
      ],
      stale: [],
      edited: [],
      own: ["site-ct"],
      pinned: PINNED ? ["mri"] : [],
      behind: false,
      command: "nils update --all",
    },
  },
  machine: { card: null, advice: [] },
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
/** What the page asked the supervisor to update, for the check to read. */
const updates: unknown[] = [];
(window as unknown as { updates: unknown[] }).updates = updates;

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/supervise/api/supervise/update-all") {
    updates.push(init?.body ? JSON.parse(String(init.body)) : {});
    return json(200, { id: "r1", what: "update", command: ["update", "--part", "rules"], state: "running", pid: 1, started_at: "2026-10-13T08:00:00Z", finished_at: null, exit: null });
  }
  if (path === "/supervise/api/supervise/runs/r1") return json(200, { id: "r1", what: "update", command: ["update", "--part", "rules"], state: "running", pid: 1, started_at: "2026-10-13T08:00:00Z", finished_at: null, exit: null });
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/capabilities") return json(200, engine);
  if (path === "/supervise/api/supervise/install") return json(200, install);
  if (path === "/api/jobs") return json(200, { jobs: [] });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
