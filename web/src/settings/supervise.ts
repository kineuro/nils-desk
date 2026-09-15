// SPDX-License-Identifier: AGPL-3.0-only
// The supervisor through the desk's proxy (Wave 5 section 10.4), admin only:
// the install nils setup made and how it runs, the work that restarts or
// updates it, which goes on apart from the call, and a look inside a folder
// before it is added. Beside every button the desk shows the command a
// person would run by hand.

import { door } from "../ask/client";
import type { Installed } from "./console";

export interface Install {
  record: string;
  dir: string;
  runtime: string;
  service: string;
  reach: string;
  backend: string;
  mode: string;
  at: string;
  ports: Record<string, number>;
  parts: Record<string, { version: string; kind: string; path: string }>;
  places: { name: string; role: string; path: string }[];
  oidc: { issuer: string; client_id: string } | null;
  addresses: { part: string; address: string; reach: string }[];
  services: { part: string; unit: string; watcher: string; running: boolean }[];
  unfinished: boolean;
  release: { installed: string | null; newest: string | null; newer: string | null; error: string | null; command: string };
  /** The card setup found and what the machine can serve; `cards` lists every card, where the supervisor names them all. */
  machine: { card: { name: string; memory_gb: number } | null; cards?: { name: string; memory_gb: number }[]; advice: string[] };
}

export interface Run {
  id: string;
  what: string;
  command: string[];
  state: "running" | "done" | "failed" | "ended";
  pid: number | null;
  started_at: string;
  finished_at: string | null;
  exit: number | null;
  tail?: string[];
  error?: string;
}

export interface LookFolder {
  name: string;
  files: number;
  capped: boolean;
  sampled: number;
  dicom: number;
  modalities: Record<string, number>;
  scanners: number;
}

export interface Look {
  path: string;
  exists: boolean;
  directory: boolean;
  readable: boolean;
  folders: LookFolder[];
  here: LookFolder | null;
  partial: boolean;
}

export interface Applied {
  at: string;
  part: string;
  from: string | null;
  to: string;
  digest: string;
  ok: boolean;
  why: string | null;
}

const BASE = "/supervise/api/supervise";

export const supervise = {
  capabilities: () => door<{ parts: Installed[]; channel?: string | null; trust?: string | null }>("GET", `${BASE}/capabilities`),
  update: (part: string, version: string) => door<{ applied: Applied; by: string }>("POST", `${BASE}/update`, { part, version }),
  log: () => door<{ rows: Applied[] }>("GET", `${BASE}/log`),
  install: () => door<Install>("GET", `${BASE}/install`),
  restart: (part: "engine" | "desk" | "gateway" | "assistant" | "postgres" | "all") => door<Run>("POST", `${BASE}/restart`, { part }),
  reapply: (part: "engine" | "all") => door<Run>("POST", `${BASE}/reapply`, part === "engine" ? { part } : {}),
  updateAll: () => door<Run>("POST", `${BASE}/update-all`, {}),
  run: (id: string) => door<Run>("GET", `${BASE}/runs/${encodeURIComponent(id)}`),
  look: (path: string) => door<Look>("POST", `${BASE}/look`, { path }),
};

/**
 * Follow a run until it ends. A call that fails is asked again, since the
 * part it restarts may be the desk itself; past `limitMs` the run is left
 * to be read later.
 */
export async function followRun(id: string, onState: (r: Run) => void, signal?: AbortSignal, everyMs = 1500, limitMs = 15 * 60_000): Promise<Run | null> {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    if (signal?.aborted) return null;
    try {
      const r = await supervise.run(id);
      onState(r);
      if (r.state !== "running") return r;
    } catch {
      // the desk or the supervisor may be starting again; ask again
    }
    await new Promise((done) => setTimeout(done, everyMs));
  }
  return null;
}

/** The command a person runs by hand, always beside the button. */
export function byHand(part: string, version: string, channel: string | null): string[] {
  const base = channel ?? "<channel>";
  return [
    `curl -fsSLO ${base}/${part}/${part}-${version}-$(uname -m)-linux.json`,
    `curl -fsSLO ${base}/${part}/${part}-${version}-$(uname -m)-linux.sig`,
    `curl -fsSLO ${base}/${part}/${part}-${version}-$(uname -m)-linux.tar.zst`,
    `nils supervise verify --trust /etc/nils/trust.pub ${part}-${version}-$(uname -m)-linux.json`,
    `nils supervise apply --install <where ${part} lives> ${part}-${version}-$(uname -m)-linux.json`,
  ];
}
