// SPDX-License-Identifier: AGPL-3.0-only
// People by name on a campaign's page (UX round 5, finding 7). A rater's
// principal in the engine is the sign-in subject at the provider's host, a
// hash where people sign in through a provider; a person reads a name. The
// desk knows the names through GET /desk/people, read once a session and
// mapped to the engine's principals; the person's own name comes with the
// capabilities. A principal the desk cannot name keeps its username where it
// has one, and is "a rater" where it is a hash: the whole hash is never shown,
// not even on hover.

import type { Capabilities } from "../capabilities";
import { keeper } from "../ui/kept";
import { principalOf } from "./client";
import { principalFor } from "./NewCheck";

/** A person as a page names them: the name, and what the hover says, or nothing. */
export interface Named {
  name: string;
  title: string | null;
}

/** Whether a principal's local part reads as a provider's subject hash rather than a username. */
export function hashLike(principal: string): boolean {
  const local = principal.split("@")[0];
  return local.length >= 16 && /^[0-9a-f-]+$/iu.test(local);
}

/** A principal fit for a hover: a username whole, a hash cut to its first 8 characters. */
export function shortPrincipal(principal: string): string {
  if (!hashLike(principal)) return principal;
  const at = principal.indexOf("@");
  const local = at < 0 ? principal : principal.slice(0, at);
  return `${local.slice(0, 8)}…${at < 0 ? "" : principal.slice(at)}`;
}

/**
 * A person by name: the desk's display name where the map has one, with the
 * principal (a hash cut short) on hover; else the username before the @ with
 * the principal on hover; else, for a hash the desk cannot name, "a rater"
 * with the hash's first 8 characters on hover.
 */
export function nameOf(names: ReadonlyMap<string, string>, principal: string | null | undefined, unnamed = "a rater"): Named {
  if (!principal) return { name: unnamed, title: null };
  const known = names.get(principal)?.trim();
  if (known) return { name: known, title: shortPrincipal(principal) };
  if (hashLike(principal)) return { name: unnamed, title: principal.split("@")[0].slice(0, 8) };
  return { name: principal.split("@")[0], title: principal };
}

/** Several people in one phrase: "Rune", "Rune and Bo", "Rune, Bo and Cy", or how many past three. */
export function namesWords(names: ReadonlyMap<string, string>, principals: readonly string[], noun = "rater"): string {
  if (principals.length === 0) return "";
  if (principals.length > 3) return `${principals.length} ${noun}s`;
  const list = principals.map((p) => nameOf(names, p).name);
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The desk's people, each by the principal the engine knows them as. */
export interface Person {
  principal: string;
  display: string;
}

const refusedOnce = new Set<string>();

/** The desk's people as `GET /desk/people` lists them, mapped to the engine's principals; empty where the desk refuses (a grant most people lack) or keeps no people. */
export async function readPeople(caps: Capabilities): Promise<Person[]> {
  if (caps.desk?.mode === "off") return [];
  const r = await fetch("/desk/people");
  if (!r.ok) {
    if (r.status === 403 || r.status === 404) refusedOnce.add("people");
    return [];
  }
  const body = (await r.json()) as { people?: { subject?: unknown; display?: unknown }[] };
  return (body.people ?? []).flatMap((p) => (typeof p.subject === "string" ? [{ principal: principalFor(caps, p.subject), display: typeof p.display === "string" && p.display.trim() ? p.display.trim() : p.subject }] : []));
}

/** The people read once a session, kept between pages. */
export const peopleKept = keeper<Person[]>(() => Promise.reject(new Error("read with the capabilities")));

/** Reads the people once; a refusal is remembered and the door is not asked again. */
export function ensurePeople(caps: Capabilities): void {
  if (refusedOnce.has("people") || peopleKept.get().value !== null || peopleKept.get().reading) return;
  peopleKept.refresh(() => readPeople(caps)).catch(() => undefined);
}

/** For the tests: a session afresh. */
export function forgetPeople(): void {
  refusedOnce.clear();
  peopleKept.reset();
}

/**
 * The names a page maps principals to: the person's own display name first,
 * then the desk's people, then any names other doors gave (the pace door's).
 */
export function namesMap(caps: Capabilities, people: readonly Person[] | null, more: ReadonlyMap<string, string> = new Map()): Map<string, string> {
  const out = new Map<string, string>(more);
  for (const p of people ?? []) if (p.display) out.set(p.principal, p.display);
  const me = principalOf(caps);
  const own = caps.person?.display_name?.trim();
  if (own) out.set(me, own);
  return out;
}
