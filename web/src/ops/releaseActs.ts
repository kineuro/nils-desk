// SPDX-License-Identifier: AGPL-3.0-only
// Hand over and withdraw a release from the Release page (record 55 H2,
// round 5), over the doors the engine has: `POST /api/handovers` packs a
// release's newest version into encrypted archives in an exchange place, and
// a withdrawal is `nils release --withdraw` queued through `POST /api/jobs`.
// A release is never removed, only withdrawn, with a reason.

import type { Release } from "../data/cohorts";
import type { Place } from "../objects/client";

/** The rows a hand over is offered on: each name's newest version that is not withdrawn, which is the one a handover packs. */
export function handoverRows(list: readonly Release[]): Set<number> {
  const newest = new Map<string, Release>();
  for (const r of list) {
    if (r.withdrawn_at) continue;
    const was = newest.get(r.name);
    if (!was || r.id > was.id) newest.set(r.name, r);
  }
  return new Set([...newest.values()].map((r) => r.id));
}

/** The exchange places a handover may write into, as Settings, Places keeps them. */
export function exchangePlaces(places: readonly Place[] | null): Place[] {
  return (places ?? []).filter((p) => p.role === "exchange" && p.retired_at === null);
}

/** Where a handover's archives go: a folder named for the release and its version, inside the exchange place. */
export function handoverOut(place: Pick<Place, "path">, r: Pick<Release, "name" | "version">): string {
  return `${place.path.replace(/\/+$/u, "")}/${r.name}-v${r.version}`;
}

/** A key's name as the engine's key store takes it: letters, digits, dots, dashes and underscores. */
export function keyRefusal(key: string): string | null {
  const k = key.trim();
  if (!k) return "the name of the key the password is made from";
  if (!/^[A-Za-z0-9._-]+$/u.test(k)) return "a key's name: letters, digits, dots, dashes and underscores";
  return null;
}

/** The command that gives the person receiving a handover its password, run where the registry's keys are. */
export function passwordCommand(key: string): string {
  return `nils handover password --key ${key.trim()}`;
}

/** The withdrawal of one version, as the jobs door queues it. */
export function withdrawCommand(r: Pick<Release, "name" | "version">, why: string): string[] {
  return ["release", "--name", r.name, "--withdraw", r.version, "--why", why.trim()];
}

/** Why a withdrawal cannot be sent yet, or null. */
export function withdrawRefusal(why: string): string | null {
  return why.trim().length < 4 ? "a reason, which stays on the release for everyone to read" : null;
}
