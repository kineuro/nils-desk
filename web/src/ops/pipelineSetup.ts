// SPDX-License-Identifier: AGPL-3.0-only
// What a site sets up before its pipelines run (record 55 H2, round 4: no
// command line inside a flow), at the engine's doors of 2026-10-14: a
// pipeline added from its descriptor (`POST /api/pipelines`, as `nils
// pipeline add` adds it), the lane its units run within (`GET` and `PUT
// /api/pipelines/lane`, as `nils pipeline lane`), and the secret files a
// pipeline declares, such as a licence (`/api/pipelines/secrets`, as `nils
// pipeline secret`). A secret's contents never come back.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export interface Added {
  id: number;
  name: string;
  version: number | string;
  label: string;
  image: string;
  added: boolean;
  replaces: string[];
  replaces_why: string | null;
}

export interface Lane {
  cores: number;
  memory_gb: number;
  set?: { cores: number | null; memory_gb: number | null };
  why?: string | null;
  gpu_card: number | null;
  places: { output: string | null; scratch: string | null; output_set?: boolean; scratch_set?: boolean } | { error: string };
}

export interface LaneChange {
  cores?: number;
  memory_gb?: number;
  gpu_card?: string;
  output_place?: string;
  scratch_place?: string;
}

export interface Secret {
  id: string;
  declared_by: string[];
  optional: boolean;
  set: boolean;
  readable?: boolean;
}

export const setup = {
  add: (descriptor: string) => door<Added>("POST", "/api/pipelines", { descriptor }),
  lane: () => door<Lane>("GET", "/api/pipelines/lane"),
  setLane: (change: LaneChange) => door<Lane>("PUT", "/api/pipelines/lane", change),
  secrets: () => door<{ secrets: Secret[] }>("GET", "/api/pipelines/secrets"),
  setSecret: (id: string, content: string) => door<Secret>("PUT", `/api/pipelines/secrets/${encodeURIComponent(id)}`, { content }),
  unsetSecret: (id: string) => door<Secret>("DELETE", `/api/pipelines/secrets/${encodeURIComponent(id)}`),
};

/** What this person may do here: add a pipeline, change the lane, set a secret (each install work at its door), and see the lane and the secrets. */
export function setupActs(caps: Capabilities): { add: boolean; seeLane: boolean; lane: boolean; seeSecrets: boolean; secrets: boolean } {
  const install = may(caps, "install:work");
  const see = may(caps, "pipelines:see");
  return {
    add: install && served(caps, "POST /api/pipelines"),
    seeLane: see && served(caps, "GET /api/pipelines/lane"),
    lane: install && served(caps, "PUT /api/pipelines/lane"),
    seeSecrets: see && served(caps, "GET /api/pipelines/secrets"),
    secrets: install && served(caps, "PUT /api/pipelines/secrets/{id}"),
  };
}

/** What Add says once the engine answered: added, or held already, and what it replaces. */
export function addedWords(a: Added): string {
  const what = a.added ? `Added ${a.label}.` : `The catalog already holds ${a.label}.`;
  const replaces = a.replaces.length > 0 ? ` It replaces ${a.replaces.join(", ")}, which a new run no longer takes.` : "";
  return what + replaces;
}

/** The lane in a line: cores, memory, the card, and where outputs and scratch go. */
export function laneWords(l: Lane): string {
  const card = l.gpu_card === null ? "no card" : `card ${l.gpu_card}`;
  const places = "error" in l.places ? "no working place" : `outputs to ${l.places.output ?? "the first working place"}, scratch to ${l.places.scratch ?? "the first working place"}`;
  return `${l.cores} cores, ${l.memory_gb} GB, ${card}; ${places}`;
}

/** A lane change from what the form holds, only the fields that changed; an error in words where a field is not a value. */
export function laneChange(was: Lane, form: { cores: string; memory: string; card: string; output: string; scratch: string }): LaneChange | string {
  const out: LaneChange = {};
  const whole = (raw: string, what: string): number | string => {
    const n = Number(raw.trim());
    return Number.isInteger(n) && n > 0 ? n : `${what} is a whole number above 0`;
  };
  const cores = whole(form.cores, "Cores");
  if (typeof cores === "string") return cores;
  if (cores !== was.cores) out.cores = cores;
  const memory = whole(form.memory, "Memory");
  if (typeof memory === "string") return memory;
  if (memory !== was.memory_gb) out.memory_gb = memory;
  const card = form.card.trim() === "" ? "none" : form.card.trim();
  if (card !== "none" && !/^\d+$/u.test(card)) return "The card is its index, or none";
  if (card !== (was.gpu_card === null ? "none" : String(was.gpu_card))) out.gpu_card = card;
  const places = "error" in was.places ? { output: null, scratch: null } : was.places;
  const output = form.output.trim() || "default";
  if (output !== (places.output ?? "default")) out.output_place = output;
  const scratch = form.scratch.trim() || "default";
  if (scratch !== (places.scratch ?? "default")) out.scratch_place = scratch;
  return out;
}

// ------------------------------------------------- the runtime and starters
// Gate T31, walkthrough step 15.8: the runtime pipelines run under (`GET`
// and `PUT /api/pipelines/runtime`, as `nils pipeline runtime --set` and
// `--apptainer-image`), whether the engine seeds its starter catalog at its
// start and seeding it now (`/api/pipelines/starters`, as `nils pipeline
// starter`), and a run's seeds (`GET /api/pipeline-runs/{id}/seeds`, as
// `nils pipeline seeds`), saved as a selection at the ask's own door.

export interface RuntimeChoice {
  choice: string;
  choices: string[];
  apptainer_image: string;
  apptainer_images: string[];
  capability: { enabled?: boolean; reason?: string | null; runtime?: { name?: string; version?: string; gpu?: string | null } | null };
}

export interface Starter {
  name: string;
  digest: string;
  image: string;
  state: string;
}

export interface Starters {
  seeding: "on" | "off";
  starters: Starter[];
  added?: { id: number; label: string; image: string }[];
}

export interface Seeds {
  run: number;
  seeds: { stack_id: number; axis: string; value: string }[];
  per_value: Record<string, number>;
  selection: { stacks: number[] };
  withheld: number;
}

export const runtime = {
  get: () => door<RuntimeChoice>("GET", "/api/pipelines/runtime"),
  set: (change: { choice?: string; apptainer_image?: string }) => door<RuntimeChoice>("PUT", "/api/pipelines/runtime", change),
  starters: () => door<Starters>("GET", "/api/pipelines/starters"),
  seeding: (on: boolean) => door<Starters>("PUT", "/api/pipelines/starters", { seeding: on ? "on" : "off" }),
  seed: () => door<Starters>("POST", "/api/pipelines/starters/seed"),
  seeds: (run: number) => door<Seeds>("GET", `/api/pipeline-runs/${run}/seeds`),
};

/** What this person may do with the runtime and the starters: see each (pipelines:see), change each (install work), each where its door is served. */
export function runtimeActs(caps: Capabilities): { seeRuntime: boolean; runtime: boolean; seeStarters: boolean; starters: boolean; seed: boolean; seeds: boolean } {
  const install = may(caps, "install:work");
  const see = may(caps, "pipelines:see");
  return {
    seeRuntime: see && served(caps, "GET /api/pipelines/runtime"),
    runtime: install && served(caps, "PUT /api/pipelines/runtime"),
    seeStarters: see && served(caps, "GET /api/pipelines/starters"),
    starters: install && served(caps, "PUT /api/pipelines/starters"),
    seed: install && served(caps, "POST /api/pipelines/starters/seed"),
    seeds: see && served(caps, "GET /api/pipeline-runs/{id}/seeds"),
  };
}

/** The words of a runtime choice, as the select shows them. */
export const CHOICE_WORDS: Record<string, string> = {
  auto: "Automatic: rootless podman, then apptainer",
  "apptainer-first": "Apptainer, then podman",
  podman: "Podman only",
  apptainer: "Apptainer only",
  docker: "Docker",
  off: "Off: no pipeline runs",
};

/** The runtime in a line: what runs pipelines now, or why nothing does, and the choice. */
export function runtimeWords(r: RuntimeChoice): string {
  const rt = r.capability.runtime;
  const now = rt?.name ? `${rt.name}${rt.version ? ` ${rt.version}` : ""}${rt.gpu ? `, GPU ${rt.gpu}` : ""}` : r.capability.reason || "none found";
  return `${now} · chosen: ${r.choice}${r.choice === "apptainer" || r.choice === "apptainer-first" || r.choice === "auto" ? ` · images as ${r.apptainer_image}` : ""}`;
}

/** The starters in a line: whether the engine seeds them at its start, and how many the catalog holds. */
export function startersWords(s: Starters): string {
  const held = s.starters.filter((x) => x.state.startsWith("in the catalog")).length;
  return `seeded at start: ${s.seeding} · ${held} of ${s.starters.length} in the catalog`;
}

/** The ask that saves a run's suggested stacks as a selection, as `nils pipeline seeds --save` writes it. */
export function seedsAsk(stacks: readonly number[]): Record<string, unknown> {
  return {
    ast_version: 1,
    sets: { seeded: { grain: "stack", where: [["in", {}, ["field", {}, "id"], [...stacks]]] } },
    out: { set: "seeded", level: "record" },
  };
}

/** A run's seeds in a line: the values suggested, by axis and value, most first. */
export function seedsWords(s: Seeds): string {
  const per = Object.entries(s.per_value).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const values = per.map(([k, n]) => `${k.replace("=", " ")} ${n}`).join(", ");
  const held = s.withheld > 0 ? `; ${s.withheld} of a sealed sample not shown` : "";
  return `${s.seeds.length} ${s.seeds.length === 1 ? "value" : "values"} suggested${values ? ` (${values})` : ""} over ${s.selection.stacks.length} ${s.selection.stacks.length === 1 ? "scan" : "scans"}${held}`;
}

/** Whether a run's summary says it suggested seeds or scans to curate. */
export function seedsSuggested(summary: Record<string, unknown> | null | undefined): boolean {
  const s = summary?.["seeds"] as { seeds?: unknown; selection?: unknown } | null | undefined;
  return Number(s?.seeds ?? 0) > 0 || Number(s?.selection ?? 0) > 0;
}
