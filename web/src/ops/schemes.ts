// SPDX-License-Identifier: AGPL-3.0-only
// Session schemes (record 55 H2, round 3 and 4: session schemes made in the
// release form), at the engine's doors of 2026-10-14: the kept schemes,
// `GET /api/session-schemes`, and a new one, `POST /api/session-schemes`, as
// `nils session scheme add` keeps it; a kept name is never replaced there.
// A scheme says how a subject's studies become sessions and what each is
// called: by its date, by months from the first session snapped to a
// cadence, or in order.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export type Naming = "date" | "ordinal" | { months: { cadence: number[]; tolerance: number } };

export interface Scheme {
  window_days?: number;
  anchor?: string;
  naming?: Naming;
  collision?: string;
  unmatched?: string;
  event?: string;
}

export interface KeptScheme {
  name: string;
  scheme: Scheme;
  added_at: string | null;
  note: string | null;
  digest?: string;
}

/** What a release, a pick or a question uses where it names no scheme: the engine sends the scheme's definition; one that sent its name is read as a name. */
export type OwnScheme = Scheme | string | null;

export const schemes = {
  list: () => door<{ schemes: KeptScheme[]; default: OwnScheme }>("GET", "/api/session-schemes"),
  add: (name: string, scheme: Scheme, note?: string) => door<KeptScheme>("POST", "/api/session-schemes", note ? { name, scheme, note } : { name, scheme }),
};

/** Whether the person sees the kept schemes, and may keep a new one. */
export function schemeActs(caps: Capabilities): { see: boolean; add: boolean } {
  const see = may(caps, "release:see") && served(caps, "GET /api/session-schemes");
  return { see, add: see && may(caps, "release:work") && served(caps, "POST /api/session-schemes") };
}

/** Why the person may not rebuild the visits, in words, or null when they may: the engine queues the rebuild for work on Pipelines (gate T31, step 22.7). */
export function rebuildRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/sessions/rebuild")) return "This engine has no door for rebuilding visits.";
  return may(caps, "pipelines:work") ? null : "Rebuilding visits needs work on the Pipelines page.";
}

/** What a rebuild does, on hover: a pick follows a visit that moves, and one on a visit that goes is withdrawn and asked about. */
export const REBUILD_HINT = "A pick on a visit that moves follows it. A pick on a visit that goes is withdrawn, and Review is asked about it.";

/** What a rebuild will do, before it runs: under which scheme, for whom. */
export function rebuildWords(scheme: KeptScheme | null): string {
  return `Builds the visits again under ${scheme ? scheme.name : "the registry's own scheme"}, for every subject whose studies changed.`;
}

/** The registry's own scheme as a choice reads it: "the registry's own: named by date; studies within the same day are one session". */
export function ownLabel(own: OwnScheme): string {
  const words = typeof own === "string" ? own : own && typeof own === "object" ? schemeWords(own) : "";
  return words ? `the registry's own: ${words}` : "the registry's own";
}

/** The kept scheme the registry's own is, where the engine names one. */
export function ownName(own: OwnScheme): string | null {
  return typeof own === "string" ? own : null;
}

/** A scheme in a few words: how sessions are named, and the window that joins studies into one. */
export function schemeWords(s: Scheme): string {
  const n = s.naming ?? "date";
  const naming = n === "date" ? "named by date" : n === "ordinal" ? "numbered in order" : `months from the first session, on ${n.months.cadence.join(", ")}`;
  const w = s.window_days ?? 0;
  return `${naming}; studies within ${w === 0 ? "the same day" : `${w} ${w === 1 ? "day" : "days"}`} are one session`;
}

export interface SchemeForm {
  name: string;
  naming: "date" | "months" | "ordinal";
  cadence: string;
  tolerance: string;
  window: string;
}

/** A form's scheme, or what is wrong with it in words. */
export function schemeOf(f: SchemeForm): { name: string; scheme: Scheme } | string {
  const name = f.name.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(name)) return "A name is letters, digits, dot, dash and underscore";
  const window = Number(f.window.trim() || "0");
  if (!Number.isInteger(window) || window < 0) return "The window is a whole number of days";
  let naming: Naming = f.naming === "months" ? { months: { cadence: [], tolerance: 0 } } : f.naming;
  if (f.naming === "months") {
    const cadence = f.cadence
      .split(/[,\s]+/u)
      .filter(Boolean)
      .map(Number);
    if (cadence.length === 0 || cadence.some((m) => !Number.isInteger(m) || m < 0)) return "The visit months are whole numbers, such as 0, 6, 12, 24";
    const sorted = [...cadence].sort((a, b) => a - b);
    const tolerance = Number(f.tolerance.trim() || "1.5");
    if (!Number.isFinite(tolerance) || tolerance < 0) return "How far a session may sit is a number of months";
    naming = { months: { cadence: sorted, tolerance } };
  }
  return { name, scheme: { window_days: window, anchor: "first_session", naming } };
}
