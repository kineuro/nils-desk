// SPDX-License-Identifier: AGPL-3.0-only
// The shell is a pure function of the deployment capabilities document and
// the person's entitlements (Wave 4c section 7.2). Each section and each
// control is a predicate: a missing part, a wrong document shape and a
// missing entitlement each remove it, never disable it.

import type { Capabilities, Entitlement } from "./capabilities";

export interface Section {
  id: string;
  title: string;
  /** An app section proxies to /apps/{id}/. */
  app?: string;
}

const LADDER: Entitlement[] = ["reader", "reviewer", "operator", "admin"];

/** Whether the person holds an entitlement: the ladder implies the ones below. */
export function holds(caps: Capabilities, e: Entitlement): boolean {
  const have = caps.person.entitlements;
  if (e === "assist") return have.includes("assist");
  const rank = LADDER.indexOf(e);
  return have.some((h) => h !== "assist" && LADDER.indexOf(h) >= rank);
}

/** The engine serves a door, by its `METHOD /path` name. */
export function door(caps: Capabilities, name: string): boolean {
  return Array.isArray(caps.engine?.doors) && caps.engine!.doors.includes(name);
}

/** The three named states of section 7.2, and the fourth the desk adds. */
export type State =
  | { kind: "unbound" }
  | { kind: "warming" }
  | { kind: "contract_mismatch"; found: Record<string, string>; speaks: Record<string, string> }
  | { kind: "no_engine" }
  | { kind: "ready" };

export function state(caps: Capabilities): State {
  if (caps.desk.contract_mismatch?.major) {
    return { kind: "contract_mismatch", found: caps.desk.contract_mismatch.found, speaks: caps.desk.contract_mismatch.speaks };
  }
  if (!caps.desk.engine_reachable || !caps.engine) return { kind: "no_engine" };
  if (caps.person.entitlements.length === 0) return { kind: "unbound" };
  const health = caps.kvasir?.["health"] as { warming?: boolean } | undefined;
  if (caps.kvasir && health?.warming === true) return { kind: "warming" };
  return { kind: "ready" };
}

/** The sections the shell renders, in order, for this document and person. */
export function sections(caps: Capabilities): Section[] {
  const out: Section[] = [];
  if (state(caps).kind !== "ready") return out;
  if (holds(caps, "reader") && door(caps, "POST /api/ask/run")) out.push({ id: "ask", title: "Ask" });
  if (holds(caps, "reader") && door(caps, "GET /api/ask/handles")) out.push({ id: "results", title: "Results" });
  if (holds(caps, "reviewer") && door(caps, "GET /api/jobs")) out.push({ id: "operations", title: "Operations" });
  if (holds(caps, "reader") && door(caps, "GET /api/packs")) out.push({ id: "data", title: "Data" });
  if (holds(caps, "reader")) out.push({ id: "settings", title: "Settings" });
  // present only when the assistant answered and the person holds assist
  if (caps.assistant !== null && holds(caps, "assist")) out.push({ id: "assistant", title: "Assistant" });
  for (const app of caps.apps) {
    if (app.capabilities === null) continue;
    if (app.entitlement && !holds(caps, app.entitlement)) continue;
    out.push({ id: `app:${app.id}`, title: app.title ?? app.id, app: app.id });
  }
  return out;
}

/** The controls of the Operations section, each a door the engine serves. */
export function operationsControls(caps: Capabilities): string[] {
  const table: [string, string][] = [
    ["jobs", "GET /api/jobs"],
    ["review", "GET /api/review"],
    ["releases", "GET /api/releases"],
    ["handovers", "POST /api/handovers"],
    ["custody", "GET /api/custody"],
    ["audit", "GET /api/audit"],
    ["sessions", "POST /api/jobs"],
  ];
  const needs: Record<string, Entitlement> = {
    jobs: "reviewer", review: "reviewer", releases: "operator", handovers: "operator",
    custody: "admin", audit: "admin", sessions: "operator",
  };
  return table.filter(([id, d]) => door(caps, d) && holds(caps, needs[id])).map(([id]) => id);
}
