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
