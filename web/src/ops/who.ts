// SPDX-License-Identifier: AGPL-3.0-only
// Who did something, by the name a person knows them by (Wave 7b): the
// engine records a principal (an account, or `person:<account>` on a knob),
// and the desk says the account's display name from its own directory, the
// person's own name for themselves, and never a sign-in code: where neither
// knows the principal and it reads as a code, it says "a person", with the
// code a hover away.

import { namesOf, peopleKept, ShareRefused } from "../assistant/shares";
import type { Capabilities } from "../capabilities";

/** A principal that reads as a sign-in code rather than an account: a long run of hex, or a UUID. */
export function isSignInCode(principal: string): boolean {
  return /^[0-9a-f]{16,}$/iu.test(principal) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(principal);
}

/** The principal of a `person:<user>` choice, or the principal itself. */
export function principalOf(by: string): string {
  return by.startsWith("person:") ? by.slice("person:".length) : by;
}

/** The namer for this page: a principal's display name as the desk knows it. */
export function namer(caps: Pick<Capabilities, "person">, people: { subject: string; display: string }[] | null | undefined): (principal: string) => string {
  const nameOf = namesOf(people);
  const me = caps.person;
  return (raw) => {
    const p = principalOf(raw);
    if (me && p === me.subject && me.display_name) return me.display_name;
    const known = nameOf(p);
    if (known !== p) return known;
    return isSignInCode(p) ? "a person" : p;
  };
}

let refused = false;

/**
 * The desk's directory of people, asked for once a session. Its door needs a
 * grant most people lack, so a refusal (403 or 404) is remembered and the door
 * is not asked again: names fall back to the principal, or "a person".
 */
export function ensurePeople(): void {
  if (refused || peopleKept.get().value !== null) return;
  peopleKept.refresh().catch((e: unknown) => {
    if (e instanceof ShareRefused && (e.status === 403 || e.status === 404)) refused = true;
  });
}

/** For the tests: a session afresh. */
export function forgetRefusal(): void {
  refused = false;
}
