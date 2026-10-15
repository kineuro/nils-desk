// SPDX-License-Identifier: AGPL-3.0-only
// The Assistant's plans waiting and standing grants (spec 13.1 round 5 and
// 14; Wave 5 sections 9.1 to 9.4), over the assistant's own routes: a plan
// the assistant restated waits for its person to confirm it once; a step it
// could not take says why; a rung-three proposal waits for a person's
// decision; a standing grant lets the assistant take one rung-two door for
// the person again and again, until it is revoked.

import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { PAGE_LINES } from "../settings/identity";
import type { Grant, Grants, Inbox, Offer, Plan, Step } from "./client";

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

/** A kept scope that is a whole page, `page:<id>`, or everything, `*` (record 55, ruling 24). */
export const EVERYTHING = "*";
export const pageOfScope = (door: string): string | null => (door.startsWith("page:") ? door.slice("page:".length) : null);

/** A page's name as the desk shows it. */
export function pageTitle(page: string | null | undefined, fallback?: string): string {
  return PAGE_LINES.find((l) => l.id === page)?.title ?? fallback ?? "Other";
}

/** What a standing grant lets the assistant do, in words: never its kept door. */
export function grantWords(g: Pick<Grant, "door" | "words" | "page">): string {
  if (g.words) return g.words;
  if (g.door === EVERYTHING) return "Everything the assistant may do for you";
  const page = pageOfScope(g.door);
  if (page) return `Everything on ${pageTitle(page)}`;
  return "An earlier grant";
}

/** One action of a page: what it lets the assistant do, and the grant that stands for it when one does. */
export interface ActionRow {
  key: string;
  words: string;
  /** The kept door to give it by; null for a grant whose action is no longer offered. */
  door: string | null;
  /** Its own standing grant. */
  grant: Grant | null;
  /** Standing through its page's grant or everything. */
  covered: boolean;
}

/** A page's actions, with the grant for the whole page when one stands. */
export interface PageGroup {
  page: string;
  title: string;
  whole: Grant | null;
  rows: ActionRow[];
}

/**
 * The person's standing grants and what they may give, in words, grouped by page in the desk's order (record 55,
 * ruling 24): everything when it stands, each page with its whole-page grant and its actions, each action standing on
 * its own, through its page or everything, or not yet. No kept door is shown.
 */
export function grantPages(g: Grants | null): { everything: Grant | null; pages: PageGroup[] } {
  if (!g) return { everything: null, pages: [] };
  const mine = g.grants.filter((x) => !x.revoked_at && x.subject === g.subject);
  const everything = mine.find((x) => x.door === EVERYTHING) ?? null;
  const byPage = new Map<string, PageGroup>();
  const group = (page: string, title?: string) => {
    let pg = byPage.get(page);
    if (!pg) {
      pg = { page, title: pageTitle(page, title), whole: mine.find((x) => pageOfScope(x.door) === page) ?? null, rows: [] };
      byPage.set(page, pg);
    }
    return pg;
  };
  for (const o of g.offer ?? offerOfLadder(g)) {
    const pg = group(o.page, o.title);
    for (const a of o.actions) {
      const own = mine.find((x) => x.door === a.door) ?? null;
      pg.rows.push({ key: a.door, words: a.words, door: a.door, grant: own, covered: own === null && (everything !== null || pg.whole !== null) });
    }
  }
  // a grant given before its action left the offer (or from an older assistant), kept under its page
  for (const x of mine) {
    if (x.door === EVERYTHING) continue;
    const page = pageOfScope(x.door);
    if (page) {
      group(page);
      continue;
    }
    const pg = group(x.page ?? "other");
    if (!pg.rows.some((r) => r.door === x.door)) pg.rows.push({ key: `g${x.id}`, words: grantWords(x), door: null, grant: x, covered: false });
  }
  const order = (p: string) => {
    const i = PAGE_LINES.findIndex((l) => l.id === p);
    return i < 0 ? PAGE_LINES.length : i;
  };
  return { everything, pages: [...byPage.values()].sort((a, b) => order(a.page) - order(b.page)) };
}

/** What the common doors let the assistant do, for an assistant that sends no words of its own. */
const OLDER_WORDS: Record<string, { page: string; words: string }> = {
  "POST /api/jobs": { page: "data", words: "Read, sort, pseudonymise and bring in data" },
  "POST /api/sessions/rebuild": { page: "data", words: "Rebuild the visits" },
  "POST /api/linkage/types": { page: "data", words: "Add ID types" },
  "POST /api/linkage/imports": { page: "data", words: "Bring in identifier maps" },
  "POST /api/linkage/held/code": { page: "data", words: "Code held files anyway" },
  "POST /api/linkage/merge": { page: "data", words: "Merge two subjects" },
  "POST /api/places/{id}/originals": { page: "data", words: "Act on a dataset's originals" },
  "POST /api/ask/run": { page: "query", words: "Run questions" },
  "POST /api/ask/jobs": { page: "query", words: "Queue questions" },
  "POST /api/ask/apply": { page: "query", words: "Apply a question's changes" },
  "POST /api/review/{id}/let-go": { page: "review", words: "Let go of review items" },
  "POST /api/jobs/{id}/cancel": { page: "pipelines", words: "Cancel jobs" },
  "POST /api/picks/run": { page: "pipelines", words: "Pick main scans" },
  "POST /api/datasets/{name}/steps/{step}/run": { page: "pipelines", words: "Run pipelines on datasets" },
  "POST /api/cohorts/{name}/steps/{step}/run": { page: "pipelines", words: "Run pipelines on cohorts" },
  "PUT /api/places/{id}": { page: "places", words: "Change places" },
  "POST /api/places/explore": { page: "places", words: "Explore the sources" },
  "PUT /api/backups/schedule": { page: "database", words: "Set the backup schedule" },
};

/**
 * What an assistant that sends no offer lets a person give (one before record 55's ruling 24): the rung-two doors of
 * its ladder, in words the desk knows or the ladder sent, never a door; one it has no words for is "Another step".
 */
export function offerOfLadder(g: Grants): Offer[] {
  const by = new Map<string, Offer>();
  let other = 0;
  for (const r of g.ladder) {
    if (r.rung !== 2) continue;
    const known = OLDER_WORDS[r.door];
    const page = r.page ?? known?.page ?? "other";
    const words = r.words ?? known?.words ?? `Another step ${++other}`;
    const o = by.get(page) ?? { page, title: pageTitle(page), actions: [] };
    o.actions.push({ door: r.door, words });
    by.set(page, o);
  }
  return [...by.values()];
}

/** A step's held reason in words: a door an older assistant named is not shown. */
export function plainReason(reason: string): string {
  return reason.replace(/\b(GET|POST|PUT|DELETE|PATCH) \/api\/[^\s:;,]+/gu, "this step");
}


/** The grants standing now, and those revoked, each newest first. */
export function standing(list: readonly Grant[]): { now: Grant[]; revoked: Grant[] } {
  const by = (a: Grant, b: Grant) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id);
  return { now: list.filter((g) => !g.revoked_at).sort(by), revoked: list.filter((g) => Boolean(g.revoked_at)).sort(by) };
}
