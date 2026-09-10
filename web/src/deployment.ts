// SPDX-License-Identifier: AGPL-3.0-only
// What the desk knows about the deployment it serves: the person's
// entitlements, the doors the engine serves, and the state the whole desk is
// in. Everything the shell shows is a predicate over the capabilities
// document and nothing else (Wave 4c section 7.2).

import type { Capabilities, Entitlement } from "./capabilities";

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

/** The named states of section 7.2, and the ones the desk adds. */
export type State =
  | { kind: "login"; how: "password" | "redirect"; url: string }
  | { kind: "unbound" }
  | { kind: "warming" }
  | { kind: "contract_mismatch"; found: Record<string, string>; speaks: Record<string, string> }
  | { kind: "no_engine" }
  | { kind: "ready" };

export function state(caps: Capabilities): State {
  if (caps.desk.contract_mismatch?.major) {
    return { kind: "contract_mismatch", found: caps.desk.contract_mismatch.found, speaks: caps.desk.contract_mismatch.speaks };
  }
  // the login comes before the engine: a person without a session has no bearer, so the engine's 401 says nothing about the engine
  if (!caps.desk.signed_in && caps.desk.login) return { kind: "login", how: caps.desk.login.kind, url: caps.desk.login.url };
  if (!caps.desk.engine_reachable || !caps.engine) return { kind: "no_engine" };
  if (caps.person.entitlements.length === 0) return { kind: "unbound" };
  const health = caps.kvasir?.["health"] as { warming?: boolean } | undefined;
  if (caps.kvasir && health?.warming === true) return { kind: "warming" };
  return { kind: "ready" };
}
