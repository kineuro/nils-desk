// SPDX-License-Identifier: AGPL-3.0-only
// The doors the Rules page reads (record 56, sections 6.4 and 6.5), each
// through the desk's proxy and only where the engine serves it: the pack
// with what the forms offer to choose from; its quality report (or, from an
// engine before it, its equal-rank disagreements alone); a change's effect
// rehearsed over the registry, writing nothing; and the proposals, made,
// listed, read, rehearsed again and decided.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, mayAny } from "../grants";
import { effectOf, type Effect } from "./effect";
import { packDoc, type PackDoc } from "./client";
import { proposalOf, proposalsOf, type Proposal, type Status } from "./proposals";
import { qualityOf, tiesOf, type Quality } from "./quality";

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export const DOORS = {
  pack: "GET /api/packs/{name}",
  ties: "GET /api/packs/{name}/disagreements",
  quality: "GET /api/packs/{name}/quality",
  rehearse: "POST /api/packs/{name}/rehearse",
  proposals: "GET /api/packs/{name}/proposals",
  propose: "POST /api/packs/{name}/proposals",
  proposal: "GET /api/packs/{name}/proposals/{id}",
  again: "POST /api/packs/{name}/proposals/{id}/rehearse",
  decide: "POST /api/packs/{name}/proposals/{id}/decide",
  thumb: "GET /api/instances/{stack}/thumb",
} as const;

/** What the forms offer to choose from, beside the pack's axes and values: its rule sets, the fields a rule reads, its roles and picks. */
export interface PackChoices {
  sets: string[];
  fields: string[];
  roles: string[];
  picks: string[];
}

/** The border kinds a pick raises, as the patch contract names them (remove_border). */
export const BORDERS = ["rare", "retake", "unknown_dim", "slice_count_outlier", "pre_post_twin", "epimix_fallback", "dixon_vs_plain"];

/** The fields of the fingerprint a person names in a condition, beside the pack's own. */
const PHYSICS = ["te", "tr", "ti", "flip"];

export function choicesOf(raw: Json): PackChoices {
  const sets = Array.isArray(raw.rule_sets) ? raw.rule_sets.flatMap((r) => (isObj(r) && typeof r.rule_set === "string" ? [r.rule_set] : typeof r === "string" ? [r] : [])) : [];
  const fields = isObj(raw.fields) ? Object.keys(raw.fields) : [];
  const picks = Array.isArray(raw.picks) ? raw.picks.filter(isObj) : [];
  return {
    sets,
    fields: [...new Set([...PHYSICS, "series_description", "protocol_name", "sequence_name", ...fields])],
    roles: [...new Set(picks.flatMap((p) => (Array.isArray(p.roles) ? p.roles.map(String) : [])))],
    picks: picks.flatMap((p) => (typeof p.name === "string" ? [p.name] : [])),
  };
}

const q = (params: Record<string, string | number | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

const base = (pack: string) => `/api/packs/${encodeURIComponent(pack)}`;

export const rulesDoors = {
  /** The pack, as the words page reads it, and what the forms offer from it. */
  pack: (name: string) =>
    door<Json>("GET", `/api/packs/${encodeURIComponent(name)}`).then((raw) => ({ pack: packDoc(raw), choices: choicesOf(raw) }) as { pack: PackDoc; choices: PackChoices }),
  ties: (pack: string) => door<Json>("GET", `${base(pack)}/disagreements`).then(tiesOf),
  /** The quality report: the ties, the overrides by rule pair, System 1's disagreements; one dataset's where it is named. */
  quality: (pack: string, dataset?: string | null): Promise<Quality> => door<Json>("GET", `${base(pack)}/quality${q({ dataset, examples: 10 })}`).then(qualityOf),
  /** A change's effect over the registry, writing nothing: its operations with their scopes, reasons and evidence. */
  rehearse: (pack: string, operations: Json[], examples = 5): Promise<Effect> => door<Json>("POST", `${base(pack)}/rehearse`, { operations, examples }).then(effectOf),
  proposals: (pack: string, f: { status?: Status; dataset?: string | null; limit?: number } = {}) =>
    door<Json>("GET", `${base(pack)}/proposals${q({ status: f.status, dataset: f.dataset, limit: f.limit ?? 100 })}`).then(proposalsOf),
  /** A change proposed: rehearsed and kept with its effect report; nothing about the sorting changes until a person adopts it. */
  propose: (pack: string, operations: Json[], title?: string): Promise<Proposal> => door<Json>("POST", `${base(pack)}/proposals`, { operations, examples: 5, ...(title ? { title } : {}) }).then(proposalOf),
  proposal: (pack: string, id: number): Promise<Proposal> => door<Json>("GET", `${base(pack)}/proposals/${id}`).then(proposalOf),
  /** A proposal rehearsed again against the pack and the registry as they are now. */
  again: (pack: string, id: number): Promise<Proposal> => door<Json>("POST", `${base(pack)}/proposals/${id}/rehearse`, {}).then(proposalOf),
  /** A person adopts or rejects it; adopting answers the re-sort's job and the rules version written. */
  decide: (pack: string, id: number, decision: "adopt" | "reject", why?: string) =>
    door<{ proposal: number; status: Status; job?: number | { id: number; state?: string } | null; version?: unknown; scopes?: string[] }>("POST", `${base(pack)}/proposals/${id}/decide`, { decision, ...(why ? { why } : {}) }),
};

/** Whether the engine keeps proposals and the person reads them. */
export function readsProposals(caps: Capabilities): boolean {
  return served(caps, DOORS.proposals) && may(caps, "review:see");
}

/** Whether the person may propose a change: the door, and the grant that proposes. */
export function mayPropose(caps: Capabilities): boolean {
  return served(caps, DOORS.propose) && mayAny(caps, "review:work", "pipelines:work");
}

/** Whether the person may adopt or reject a proposal: a person holding review:work and data:work (record 25: a reviewer proposes, an operator adopts). */
export function mayDecide(caps: Capabilities): boolean {
  return served(caps, DOORS.decide) && may(caps, "review:work") && may(caps, "data:work");
}

/** Whether the person may rehearse a change: the door, and the grant that proposes one. */
export function mayRehearse(caps: Capabilities): boolean {
  return served(caps, DOORS.rehearse) && mayAny(caps, "review:work", "pipelines:work");
}

/** Whether the person reads the pack's quality: the report, or the ties alone from an engine before it. */
export function readsQuality(caps: Capabilities): boolean {
  return (served(caps, DOORS.quality) || served(caps, DOORS.ties)) && may(caps, "review:see");
}

/** A stack's picture, where the engine draws them. */
export function thumbOf(caps: Capabilities, stack: number): string | null {
  return served(caps, DOORS.thumb) ? `/api/instances/${stack}/thumb` : null;
}
