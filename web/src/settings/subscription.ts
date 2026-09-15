// SPDX-License-Identifier: AGPL-3.0-only
// The ChatGPT subscription's words (records 23 and 25). A person's own is a
// card among the Kvasir page's models, for a person who may use the assistant
// and see Kvasir; on a desk that signs nobody in, the card is the install's.
// Add a model signs one in too. Signing in shows a code to enter at a link,
// and the card or the dialog asks Kvasir again every few seconds until it is
// signed in or failed.

import { listWords, type Tone } from "./gateway";
import type { Subscription } from "./kvasir";

/** How often a waiting sign-in is asked after. */
export const POLL_MS = 3_000;

/** How long past its code's expiry a sign-in is still asked after, for the clocks of two machines. */
const GRACE_MS = 60_000;

/** A subscription not signed in, where Kvasir answered with none. */
export const SIGNED_OUT: Subscription = {
  provider: "chatgpt",
  name: "ChatGPT",
  for: "person",
  state: "signed_out",
  user_code: null,
  verification_uri: null,
  expires_at: null,
  since: null,
  model: null,
  models: [],
  error: null,
};

/** Whose the ChatGPT subscription Kvasir answered with is: the install's on a desk that signs nobody in, else the person's own. */
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

/** The tag on the card. */
export function stateTag(s: Subscription, now: number): { tone: Tone; words: string } {
  if (s.state === "signed_in") return { tone: "ok", words: "signed in" };
  if (s.state === "waiting") return expired(s.expires_at, now) ? { tone: "caution", words: "the code expired" } : { tone: "caution", words: "waiting for you" };
  if (s.state === "failed") return { tone: "blocked", words: "did not finish" };
  return { tone: "neutral", words: "not signed in" };
}

export function cardTitle(s: Subscription): string {
  return s.for === "system" ? `The install's ${s.name} subscription` : `Your ${s.name} subscription`;
}

const onDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const onShortDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** What the card, or the dialog signing it in, says first for its state. */
export function leadWords(s: Subscription, where: "card" | "dialog" = "card"): string {
  if (s.state === "waiting") return `Open the link, enter the code, and approve. This ${where} follows the sign-in and says when it is done.`;
  if (s.state === "signed_in") return s.since === null ? "Signed in." : `Signed in since ${onDay(s.since)}.`;
  if (s.state === "failed") {
    const why = (s.error ?? "").trim().replace(/[.\s]+$/u, "");
    return why ? `The sign-in did not finish: ${why}.` : "The sign-in did not finish.";
  }
  return s.for === "system"
    ? `Until it is signed in, the stations that go to ${s.name} answer with the default model in your systems.`
    : `Until you sign in, the stations that go to ${s.name} answer you with the default model in your systems.`;
}

/** A model the subscription offers, with the context it takes. */
export function modelWords(m: { id: string; name: string; context_window: number }): string {
  const name = m.name.trim() || m.id;
  return m.context_window > 0 ? `${name}, ${m.context_window.toLocaleString("en-GB")} tokens` : name;
}

/** The line under a signed-in card's title: whose it is, and the model it answers with. */
export function cardMeta(s: Subscription): string {
  const whose = s.for === "system" ? "The whole install's" : "Yours alone";
  if (!s.model) return `${whose} · no model chosen yet`;
  const m = s.models.find((x) => x.id === s.model);
  return `${whose} · ${m ? modelWords(m) : s.model}`;
}

/** Since when it is signed in, beside its tag. */
export function sinceWords(s: Subscription): string | null {
  return s.state === "signed_in" && s.since !== null ? `since ${onShortDay(s.since)}` : null;
}

/** The stations a signed-in subscription answers, on its card. */
export function answeredWords(s: Subscription, stations: string[]): string {
  if (stations.length === 0) return `answers no station until someone with Kvasir: Work sends one to ${s.name}`;
  return `answers ${listWords(stations)}${s.for === "person" ? ", in your conversations" : ""}`;
}

/** How signing in goes, said before it starts. */
export function howWords(s: Subscription): string {
  const done = s.for === "system" ? "the install is signed in" : "you are signed in";
  return `Kvasir asks OpenAI for a code. You open the link, enter the code and approve; this dialog follows along and says when ${done}. You choose the model it answers with afterwards.`;
}

/** What the subscription carries, said before signing in: the stations it answers today, and the rule for rows and identifiers. */
export function stationsNote(s: Subscription, stations: string[]): string {
  const today =
    stations.length > 0
      ? `It answers ${listWords(stations)}${s.for === "person" ? " for you" : ""} today.`
      : `No station goes to ${s.name} yet; someone with Kvasir: Work sends one there under Where each station goes.`;
  return `${today} Rows of the registry reach it only where someone with Kvasir: Work wrote down why, and identifiers never do.`;
}

/** Said once a sign-in from Add a model is done. */
export function signedInWords(s: Subscription): string {
  const who = s.for === "system" ? "The install is" : "You are";
  return `${who} signed in to ${s.name}. ${s.model ? "Its card under Models says the model it answers with." : "Choose the model it answers with on its card under Models."}`;
}
