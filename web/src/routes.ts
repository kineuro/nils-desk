// SPDX-License-Identifier: AGPL-3.0-only
// Addresses (Wave 5 section 6.3): a section and, past the slash, the page it
// opens, then what that page opens, and past that one more word for a page
// of the thing opened (record 26): #home, #settings/places,
// #data/datasets/incoming/pseudonymisation. After a question mark a page
// narrows itself: #review?batch=12. A hash that names nothing this desk has
// opens Home, so an old link never strands a person.

export interface Route {
  section: string;
  page: string | null;
  arg: string | null;
  /** A page of what the page opened, named in one word: #data/datasets/<name>/pseudonymisation. */
  sub: string | null;
  /** What follows a question mark, as a page narrows itself: #review?batch=12. Absent when there is none. */
  query?: Record<string, string>;
}

const HASH = /^#([a-z]+)(?:\/([a-z0-9_-]*))?(?:\/([^/?]*))?(?:\/([a-z0-9_-]+))?(?:\?([^#]*))?$/;

/** The route a hash names. */
export function parse(hash: string): Route {
  const m = HASH.exec(hash);
  if (!m) return { section: "home", page: null, arg: null, sub: null };
  let arg: string | null = null;
  if (m[3]) {
    try {
      arg = decodeURIComponent(m[3]);
    } catch {
      arg = null;
    }
  }
  const route: Route = { section: m[1], page: m[2] || null, arg, sub: arg !== null && m[4] ? m[4] : null };
  if (m[5]) {
    const query: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(m[5])) if (k) query[k] = v;
    if (Object.keys(query).length > 0) route.query = query;
  }
  return route;
}

/** The hash of a section, its page, what the page opens and a page of that. */
export function href(section: string, page?: string | null, arg?: string | null, sub?: string | null): string {
  if (!page) return `#${section}`;
  if (!arg) return `#${section}/${page}`;
  const opened = `#${section}/${page}/${encodeURIComponent(arg)}`;
  return sub ? `${opened}/${sub}` : opened;
}

/** A hash narrowed after a question mark: #review?batch=12. An empty value is left out, and a hash with nothing to narrow is answered as it is. */
export function narrow(hash: string, query: Record<string, string | number | null | undefined>): string {
  const q = Object.entries(query)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `${hash}?${q}` : hash;
}

/**
 * Where an address of the Campaigns section, which joined Review in Wave 7a
 * (record 55 H3, spec 13.1), opens now: #campaigns is Review's one list of
 * work, #campaigns/<id>[/<view>] is #review/campaigns/<id>[/<view>], and
 * #campaigns/label-sets[/<n>] is #review/label-sets[/<n>]; the query stays.
 * An old link never strands a person.
 */
export function fromCampaigns(route: Route): string {
  const to =
    route.page === "label-sets"
      ? href("review", "label-sets", route.arg)
      : route.page && /^\d+$/u.test(route.page)
        ? href("review", "campaigns", route.page, route.arg)
        : href("review", "campaigns");
  return narrow(to, route.query ?? {});
}

/** The Settings pages that took the words of the map (spec section 13.1): Database is Backups, Identity is People, and Kvasir's page is Language models. */
const SETTINGS_MOVED: Record<string, string> = { database: "backups", identity: "people", gateway: "language-models" };

/**
 * Where an address that moved now leads, or null where it did not move:
 * Models is a page of Pipelines since Wave 7a (spec section 13.1), so #models
 * opens #pipelines/models and #models/model/3 opens #pipelines/models/3; the
 * query section is Query, and #ask, the word round 4 gave it, opens #query; the Settings pages renamed by
 * the map keep their old addresses as links to the new ones; and since Wave 7b (section 8.1) #pipelines/catalog
 * and #pipelines/runs open the one Pipelines page, #pipelines.
 */
export function moved(r: Route): string | null {
  if (r.section === "models") {
    const id = r.page === "model" && r.arg !== null && /^\d+$/.test(r.arg) ? r.arg : null;
    return narrow(href("pipelines", "models", id), r.query ?? {});
  }
  if (r.section === "ask") return narrow(href("query", r.page, r.arg, r.sub), r.query ?? {});
  // Wave 7b section 8.1: Catalog and Runs are one Pipelines page, the section's own address; a run's page (#pipelines/runs/3) stays
  if (r.section === "pipelines" && (r.page === "catalog" || (r.page === "runs" && r.arg === null))) return narrow(href("pipelines"), r.query ?? {});
  if (r.section === "settings" && r.page !== null && r.page in SETTINGS_MOVED) return narrow(href("settings", SETTINGS_MOVED[r.page], r.arg, r.sub), r.query ?? {});
  return null;
}
