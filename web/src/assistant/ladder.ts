// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant's plans waiting and standing grants (spec 13.1 round 5 and
// 14; Wave 5 sections 9.1 to 9.4), over the assistant's own routes: a plan
// the assistant restated waits for its person to confirm it once; a step it
// could not take says why; a rung-three proposal waits for a person's
// decision; a standing grant lets the assistant take one rung-two door for
// the person again and again, until it is revoked.

import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import type { Grant, Grants, Inbox, Plan, Step } from "./client";

/** Whether the assistant serves a route, as its capabilities list them; an assistant that lists none is taken to serve none of these. */
export function serves(caps: Capabilities, route: string): boolean {
  const doors = (caps.assistant?.["doors"] as unknown[] | undefined) ?? [];
  return doors.includes(route);
}

/** The two pages, each where the person uses the assistant and it serves the route the page reads. */
export function ladderPages(caps: Capabilities): { plans: boolean; grants: boolean } {
  const using = caps.assistant !== null && may(caps, "assistant:use");
  return { plans: using && serves(caps, "GET /inbox"), grants: using && serves(caps, "GET /grants") };
}

/** A plan restated and not yet confirmed: the person's to confirm. */
export function waitingPlans(inbox: Inbox | null): Plan[] {
  return (inbox?.plans ?? []).filter((p) => p.state === "proposed");
}

/** A plan confirmed and still going: its steps are being taken. */
export function goingPlans(inbox: Inbox | null): Plan[] {
  return (inbox?.plans ?? []).filter((p) => p.state === "confirmed");
}

/** How many things wait on the person: plans to confirm, steps held with a reason, proposals to decide. */
export function waitingCount(inbox: Inbox | null): number {
  if (!inbox) return 0;
  return waitingPlans(inbox).length + inbox.waiting.length + inbox.proposals.length;
}

/** A step in a few words: what it does and where it stands. */
export function stepWords(s: Pick<Step, "words" | "state" | "rung" | "reason">): string {
  const where = s.state === "waiting" && s.reason ? `waits: ${s.reason}` : s.state;
  return `${s.words} (${s.rung === 3 ? "asks you" : "the assistant may"}; ${where})`;
}

/** The rung-two doors a person could still give a standing grant for: those the ladder names that no grant of theirs holds. */
export function grantable(g: Grants | null): { door: string; role: string }[] {
  if (!g) return [];
  const held = new Set(g.grants.filter((x) => !x.revoked_at && x.subject === g.subject).map((x) => x.door));
  return g.ladder.filter((r) => r.rung === 2 && !held.has(r.door)).map((r) => ({ door: r.door, role: r.role }));
}

/** The grants standing now, and those revoked, each newest first. */
export function standing(list: readonly Grant[]): { now: Grant[]; revoked: Grant[] } {
  const by = (a: Grant, b: Grant) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id);
  return { now: list.filter((g) => !g.revoked_at).sort(by), revoked: list.filter((g) => Boolean(g.revoked_at)).sort(by) };
}
