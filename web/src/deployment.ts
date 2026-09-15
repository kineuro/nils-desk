// SPDX-License-Identifier: AGPL-3.0-only
// What the desk knows about the deployment it serves: what the person may
// open, the doors the engine serves, and the state the whole desk is in.
// Everything the shell shows is a predicate over the capabilities document
// and nothing else (Wave 4c section 7.2).

import type { Capabilities } from "./capabilities";

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
  if (!caps.desk.engine_reachable) return { kind: "no_engine" };
  // an engine that answered and refused a person who holds no grant has nothing for them: say that, not that it did not answer
  if (caps.person.grants.length === 0) return { kind: "unbound" };
  if (!caps.engine) return { kind: "no_engine" };
  const health = caps.kvasir?.["health"] as { warming?: boolean } | undefined;
  if (caps.kvasir && health?.warming === true) return { kind: "warming" };
  return { kind: "ready" };
}
