// SPDX-License-Identifier: AGPL-3.0-only
// The ChatGPT subscription's words (record 23). A person signs in with their
// own on their profile; on a desk that signs nobody in, the install's is on
// the Kvasir page. Signing in shows a code to enter at a link, and the card
// asks Kvasir again every few seconds until it is signed in or failed.

import type { Tone } from "./gateway";
import type { Subscription } from "./kvasir";

/** How often a waiting sign-in is asked after. */
export const POLL_MS = 3_000;

/** How long past its code's expiry a sign-in is still asked after, for the clocks of two machines. */
const GRACE_MS = 60_000;

/** Where the ChatGPT card is drawn: the install's on the Kvasir page, a person's own on their profile. */
export function placeOf(subscriptions: Subscription[] | null): { kvasir: Subscription | null; profile: Subscription | null } {
  const row = subscriptions?.find((s) => s.provider === "chatgpt") ?? null;
  return { kvasir: row?.for === "system" ? row : null, profile: row?.for === "person" ? row : null };
}

/** Whole minutes left before a sign-in code expires, or null where Kvasir gave no time. */
export function minutesLeft(expiresAt: number | null, now: number): number | null {
  return expiresAt === null ? null : Math.max(0, Math.floor((expiresAt - now) / 60_000));
}

export function expired(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt <= now;
}

/** The minutes left, as a person says them. */
export function leftWords(expiresAt: number | null, now: number): string | null {
  const minutes = minutesLeft(expiresAt, now);
  if (minutes === null) return null;
  if (expired(expiresAt, now)) return "the code has expired";
  if (minutes < 1) return "less than a minute left";
  return minutes === 1 ? "a minute left" : `${minutes} minutes left`;
}

/** Whether the card asks Kvasir again: while a sign-in waits, until a minute after its code expired. */
export function polling(s: Subscription, now: number): boolean {
  return s.state === "waiting" && (s.expires_at === null || now < s.expires_at + GRACE_MS);
}

/** The link a person opens, without its scheme. */
export function linkText(uri: string): string {
  return uri.replace(/^https?:\/\//u, "");
}

/** The tag at the card's head. */
export function stateTag(s: Subscription, now: number): { tone: Tone; words: string } {
  if (s.state === "signed_in") return { tone: "ok", words: "signed in" };
  if (s.state === "waiting") return expired(s.expires_at, now) ? { tone: "caution", words: "the code expired" } : { tone: "caution", words: "waiting for you" };
  if (s.state === "failed") return { tone: "blocked", words: "not signed in" };
  return { tone: "neutral", words: "signed out" };
}

export function cardTitle(s: Subscription): string {
  return s.for === "system" ? `The install's ${s.name} subscription` : `Your ${s.name} subscription`;
}

const onDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** What the card says first, for its state. */
export function leadWords(s: Subscription): string {
  if (s.state === "waiting") return "Open the link, enter the code, and approve. This card follows the sign-in and says when it is done.";
  if (s.state === "signed_in") return s.since === null ? "Signed in." : `Signed in since ${onDay(s.since)}.`;
  if (s.state === "failed") {
    const why = (s.error ?? "").trim().replace(/[.\s]+$/u, "");
    return why ? `The sign-in did not finish: ${why}.` : "The sign-in did not finish.";
  }
  return s.for === "system"
    ? `Until it is signed in, the stations an admin lets go to ${s.name} answer with the default model in your systems.`
    : `Until you sign in, the stations an admin lets go to ${s.name} answer you with the default model in your systems.`;
}

/** What the subscription is used for, said under the card. */
export function servesWords(s: Subscription): string {
  const serves = s.for === "system" ? "The install's subscription serves every conversation on this desk" : "Your subscription serves only your conversations";
  return `${serves}, for the stations an admin lets go to ${s.name}. Rows of the registry go to it only where an admin wrote down why, and identifiers never do.`;
}

/** A model the subscription offers, with the context it takes. */
export function modelWords(m: { id: string; name: string; context_window: number }): string {
  const name = m.name.trim() || m.id;
  return m.context_window > 0 ? `${name}, ${m.context_window.toLocaleString("en-GB")} tokens` : name;
}
