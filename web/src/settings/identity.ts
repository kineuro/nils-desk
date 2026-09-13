// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page's doors and words (Wave 4c section 5, Wave 5 section
// 10.5): how people sign in, the people the desk keeps in local mode and what
// each may do, when each last signed in, and where the desk answers.

import { door } from "../ask/client";
import type { Entitlement } from "../capabilities";

export interface DeskUser {
  username: string;
  display: string;
  entitlements: string[];
  admin: boolean;
  last_seen: string | null;
}

export interface Users {
  users: DeskUser[];
  entitlements: string[];
  sessions_open?: number;
}

export const identity = {
  users: () => door<Users>("GET", "/desk/users"),
  add: (body: { username: string; password: string; display?: string; entitlements: string[] }) => door<{ username: string }>("POST", "/desk/users", body),
  setEntitlements: (username: string, entitlements: string[]) =>
    door<{ username: string; entitlements: string[] }>("PUT", `/desk/users/${encodeURIComponent(username)}/entitlements`, { entitlements }),
};

/** The ladder of what a person may do; each step includes the ones before it. */
export const LADDER: Entitlement[] = ["reader", "reviewer", "operator", "admin"];

/** The highest step a person holds, or none. */
export function topStep(entitlements: string[]): Entitlement | null {
  for (const step of [...LADDER].reverse()) if (entitlements.includes(step)) return step;
  return null;
}

/** Whether a step is lit on a person's ladder. */
export function lit(entitlements: string[], step: Entitlement): boolean {
  const top = topStep(entitlements);
  return top !== null && LADDER.indexOf(step) <= LADDER.indexOf(top);
}

/** The step below one, or none below the first. */
export function stepBelow(step: Entitlement): Entitlement | null {
  const at = LADDER.indexOf(step);
  return at > 0 ? LADDER[at - 1] : null;
}

/** What a person holds once a step is chosen: that step, and assist as it was. */
export function withStep(entitlements: string[], step: Entitlement | null): string[] {
  return [...(step ? [step] : []), ...(entitlements.includes("assist") ? ["assist"] : [])];
}

/** What a person holds with assist given or taken. */
export function withAssist(entitlements: string[], on: boolean): string[] {
  const rest = entitlements.filter((e) => e !== "assist");
  return on ? [...rest, "assist"] : rest;
}

/** When a person last signed in, as a person says it. */
export function lastSeenWords(iso: string | null, now: number): string {
  if (!iso) return "never";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 5) return "now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** How people sign in, the three ways a desk can be set up. */
export const MODES: { id: "off" | "local" | "oidc"; title: string; words: string }[] = [
  { id: "off", title: "Nobody", words: "One person on this machine. Whoever opens the desk is the operator." },
  { id: "local", title: "The desk keeps the people", words: "Usernames and passwords held by the desk. The engine trusts what the desk signs." },
  { id: "oidc", title: "An identity provider", words: "Single sign-on through your provider, with entitlements from its groups." },
];

const LOOPBACK = /^[a-z]+:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

/** Where the desk answers: only this machine, or a network. */
export function reachWords(origin: string): { local: boolean; words: string } {
  const local = LOOPBACK.test(origin);
  return { local, words: local ? "Only this machine" : `This network, at ${origin}` };
}

/** A person added, checked before the door is asked; the desk checks the password's strength itself. */
export function addRefusal(d: { username: string; password: string }, users: DeskUser[]): string | null {
  const name = d.username.trim();
  if (!name) return "a person has a username";
  if (users.some((u) => u.username === name)) return `a person named ${name} exists`;
  if (!d.password) return "a person has a password";
  return null;
}
