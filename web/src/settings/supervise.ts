// SPDX-License-Identifier: AGPL-3.0-only
// The supervisor through the desk's proxy (Wave 5 section 10.4), admin only:
// the install nils setup made and how it runs, the work that restarts or
// updates it, which goes on apart from the call, and a look inside a folder
// before it is added. A button stands alone where the supervisor does the
// work; the command is printed only where there is no supervisor to do it.

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
  release: Release;
  /** The card setup found and what the machine can serve; `cards` lists every card, where the supervisor names them all. */
  machine: { card: { name: string; memory_gb: number } | null; cards?: { name: string; memory_gb: number }[]; advice: string[] };
  /**
   * The setup steps this supervisor makes at its doors (record 55 ruling 35 (c)): `signin`, `backups`, `model`, `restore`.
   * `wait` says why none is made where the helper on the machine is older than them. A supervisor older than this sends none.
   */
  changes?: Changes;
}

export type Change = "signin" | "backups" | "model" | "restore";

export interface Changes {
  served: Change[];
  wait: string | null;
}

/** How people sign in, as the supervisor's door takes it. */
export interface SigninBody {
  mode: "local" | "oidc";
  first?: { name: string; password: string };
  oidc?: { issuer: string; client_id: string; client_secret: string; roles_claim?: string };
}

/** The stations' model server, as the supervisor's door takes it. */
export interface ModelBody {
  server: string;
  key: string;
  model?: string;
}

/**
 * Each part beside its own newest release: the engine, the desk, the
 * assistant and Kvasir release on their own. `newer` is the version the part
 * may move to, `held` why a newer desk waits for the engine, `follows` a ref
 * a lab named in place of its releases.
 */
export interface PartRelease {
  part: string;
  installed: string | null;
  newest: string | null;
  newer: string | null;
  held: string | null;
  follows: string | null;
  error: string | null;
  command: string;
  /** A rules row's pack (part `rules`, record 55 B5): one row per first-party pack with releases of its own. */
  pack?: string;
  /** Why a newer release of the pack waits: it needs a pack contract the engine lacks, or names other engines. */
  waits?: string | null;
  /** The pack was changed on this machine after an update put it there, and is kept. */
  edited?: boolean;
  /** The version the install pins the pack to, or none (2026-10-10). */
  pinned?: string | null;
  /** What of the engine's contracts the version offered needs that the installed engine lacks (`HTTP contract 8`): the engine's update goes first. */
  needs?: string | null;
  /** The part that goes first where `needs` says (`engine`). */
  after?: string | null;
  /** A version tagged and newer than the newest release, whose release is being built. */
  coming?: string | null;
}

/** One part Update everything moves, in its place in the order, and why it is there where that matters. */
export interface OrderStep {
  part: string;
  pack?: string | null;
  from: string | null;
  to: string;
  why: string | null;
}

/** A newer release Update everything leaves out, and why. */
export interface Stay {
  part: string;
  pack?: string | null;
  version: string;
  why: string;
}

/**
 * The newest releases. `installed`, `newest` and `error` are the engine's;
 * `newer` is the engine's newer version, or the first part behind named. An
 * engine older than the list sends neither `parts` nor `behind`.
 */
export interface Release {
  installed: string | null;
  newest: string | null;
  newer: string | null;
  error: string | null;
  command: string;
  /** When the supervisor last looked for releases (UTC, to the second): its listing, or its watch of each part's tags while this page is open; an engine older than this says nothing. */
  looked_at?: string | null;
  /** The last full listing, which it keeps for a quarter of an hour, and the last watch of the tags. */
  listed_at?: string | null;
  watched_at?: string | null;
  /** Why the last watch failed, where it did. */
  watch_error?: string | null;
  /** Where a look waits for GitHub's requests an hour, until when (UTC) and why. */
  next_look?: string | null;
  allowance?: string | null;
  /** The order Update everything takes the parts in, and the newer releases it leaves out; an engine older than this sends neither. */
  order?: OrderStep[];
  stays?: Stay[];
  behind?: string[];
  parts?: PartRelease[];
  /** The rule packs where the engine reads them, beside the ones its release carries; an engine older than this, or one in a container, sends none. */
  packs?: Packs;
  /** The rules rows, one per first-party pack beside its own releases (record 55 B5); the same rows are in `parts`. */
  rules?: PartRelease[];
}

/** One rule pack: its folder's name, the version its pack.yml states, and a digest of its files. */
export interface Pack {
  name: string;
  version: string | null;
  digest: string;
}

/**
 * The rule packs in the directory the engine reads, beside the ones the
 * engine's release carries (`release`, the one an update takes or the one
 * installed). `stale` are the packs an update replaces, `edited` first-party
 * packs changed on the machine, which an update keeps, and `own` the site's
 * own, which it never touches. `error` alone where the release's could not be
 * read.
 */
export interface Packs {
  dir: string;
  release: string;
  installed?: Pack[];
  bundled?: Pack[];
  stale?: string[];
  edited?: string[];
  own?: string[];
  /** The packs the install pins to one version (2026-10-10). */
  pinned?: string[];
  behind?: boolean;
  error?: string;
  /** "not possible" where the release's packs could not be read, beside `installed`. */
  comparison?: string;
  command: string;
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
  /**
   * The install; with `fresh`, the releases are looked at again where the look the supervisor kept is a minute old;
   * with `watch`, as the Parts page asks while it is open, the supervisor looks for new tags at most once a minute.
   */
  install: (fresh = false, watch = false) => {
    const query = [fresh ? "fresh=1" : null, watch ? "watch=1" : null].filter(Boolean).join("&");
    return door<Install>("GET", `${BASE}/install${query ? `?${query}` : ""}`);
  },
  restart: (part: "engine" | "desk" | "gateway" | "assistant" | "postgres" | "all") => door<Run>("POST", `${BASE}/restart`, { part }),
  reapply: (part: "engine" | "all") => door<Run>("POST", `${BASE}/reapply`, part === "engine" ? { part } : {}),
  /** Every part, one part alone against its own releases, or several in order (a desk with the engine whose contract it needs). */
  updateAll: (part?: string | string[]) => door<Run>("POST", `${BASE}/update-all`, part === undefined ? {} : Array.isArray(part) ? { parts: part } : { part }),
  run: (id: string) => door<Run>("GET", `${BASE}/runs/${encodeURIComponent(id)}`),
  look: (path: string) => door<Look>("POST", `${BASE}/look`, { path }),
  /** How people sign in, changed by the supervisor: the desk and every part written again and started. */
  signin: (body: SigninBody) => door<Run>("POST", `${BASE}/signin`, body),
  /** Another folder for the engine's archives: its service written again and the engine started again. */
  backups: (dir: string) => door<Run>("POST", `${BASE}/backups`, { dir }),
  /** The model server the stations use: Kvasir started again with it. */
  model: (body: ModelBody) => door<Run>("POST", `${BASE}/model`, body),
  /** An archive of the backup folder put back: the engine stopped, restored, started again. */
  restore: (archive: string) => door<Run>("POST", `${BASE}/restore`, { archive }),
  /** What an uninstall would remove and keep, both ways (gate T31, step 1.9); a supervisor older than this answers 404. */
  uninstallPreview: () => door<UninstallPreview>("GET", `${BASE}/uninstall`),
  /** The uninstall, apart from the call: NILS alone (the data stays) or everything, behind the directory's name typed. */
  uninstall: (leave: "nils" | "everything", confirm: string) => door<Run>("POST", `${BASE}/uninstall`, { leave, confirm }),
};

/** What `nils uninstall --print` says each way, read from the record. */
export interface UninstallPreview {
  dir: string;
  /** The word to type: the name of the install's directory. */
  name: string;
  install: string;
  helper: boolean;
  keep_data: string[];
  everything: string[];
  /** Why a purge would be refused, or null. */
  everything_refused: string | null;
}

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
