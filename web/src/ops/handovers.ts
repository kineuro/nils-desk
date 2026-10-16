// SPDX-License-Identifier: AGPL-3.0-only
// A handover's password (record 55, ruling 35 (c), Nima 2026-10-16). A
// release stays a plain folder and a handover an optional step; inside it the
// archives are encrypted by default, and turning that off needs a reason the
// engine keeps. Each handover has a password of its own, made by NILS or
// typed by the person handing over; who may show it, or type one, is a grant
// (handover-password:see, :work) or the release's maker. A typed password
// goes only in the body of the one call that queues the handover; a shown one
// lives in its dialog alone.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Release } from "../data/cohorts";
import { door as served } from "../deployment";
import { may } from "../grants";

export type Kept = "made" | "typed" | "none" | "key";

export interface Handover {
  id: number;
  release: string;
  version: string;
  maker: string;
  root: string;
  started_at: string;
  finished_at: string | null;
  archives: number;
  encrypted: boolean;
  password: Kept;
  password_words: string;
  key: string | null;
  unencrypted_why: string | null;
  may_show: boolean;
}

/** How the archives are kept closed, as the form sends it. */
export type Closing = { encrypt: true; password: "made" } | { encrypt: true; password: "typed"; typed: string } | { encrypt: false; why: string };

export const handovers = {
  list: (release: string) => door<{ count: number; handovers: Handover[] }>("GET", `/api/handovers?release=${encodeURIComponent(release)}`),
  queue: (release: string, out: string, closing: Closing) => door<{ job: number; state: string; command?: string[] }>("POST", "/api/handovers", { release, out, ...closing }),
  /** One handover's password: shown once, never kept. */
  password: (id: number) => door<{ handover: number; password: string; kind: Kept }>("POST", `/api/handovers/${id}/password`, {}),
};

/** Whether the engine gives each handover its own password, with the doors that go with it. */
export function ownPasswords(caps: Capabilities): boolean {
  return served(caps, "GET /api/handovers") && served(caps, "POST /api/handovers/{id}/password");
}

/** Whether this person made the release, by the principal the engine knows them by. */
export function madeIt(caps: Capabilities, r: Pick<Release, "actor">): boolean {
  const me = caps.engine?.principal;
  return Boolean(me && r.actor && me === r.actor);
}

/** Why this person may not type a handover's password for this release, or null. */
export function typeRefusal(caps: Capabilities, r: Pick<Release, "actor">): string | null {
  return may(caps, "handover-password:work") || madeIt(caps, r) ? null : "the release's maker, or work on handover passwords";
}

export const TYPED_SHORTEST = 8;
export const TYPED_LONGEST = 256;

/** Why a typed password cannot be sent yet, or null. Never quotes it. */
export function typedRefusal(typed: string, again: string): string | null {
  const n = [...typed].length;
  if (n < TYPED_SHORTEST) return `a password of at least ${TYPED_SHORTEST} characters`;
  if (n > TYPED_LONGEST) return `a password of at most ${TYPED_LONGEST} characters`;
  if (/\p{Cc}/u.test(typed)) return "a password without line breaks";
  if (typed !== again) return "the same password twice";
  return null;
}

/** Why handing over unencrypted cannot be sent yet, or null. */
export function plainRefusal(why: string): string | null {
  return why.trim().length < 4 ? "why it goes unencrypted, a few words; it is kept" : null;
}

/** How a handover is kept closed, in a few words. */
export function closedWords(h: Pick<Handover, "password" | "unencrypted_why">): string {
  switch (h.password) {
    case "made":
      return "its own password, made by NILS";
    case "typed":
      return "a password typed when handed over";
    case "key":
      return "its key's password (made before each had its own)";
    case "none":
      return `not encrypted: ${h.unencrypted_why ?? "no reason kept"}`;
  }
}
