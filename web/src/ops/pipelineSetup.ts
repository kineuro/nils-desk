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
