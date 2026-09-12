// SPDX-License-Identifier: AGPL-3.0-only
// Addresses (Wave 5 section 6.3): a section and, past the slash, the page it
// opens, then what that page opens. #home, #settings/places. A hash that
// names nothing this desk has opens Home, so an old link never strands a
// person.

export interface Route {
  section: string;
  page: string | null;
  arg: string | null;
}

const HASH = /^#([a-z]+)(?:\/([a-z0-9_-]*))?(?:\/([^/]*))?$/;

/** The route a hash names. */
export function parse(hash: string): Route {
  const m = HASH.exec(hash);
  if (!m) return { section: "home", page: null, arg: null };
  let arg: string | null = null;
  if (m[3]) {
    try {
      arg = decodeURIComponent(m[3]);
    } catch {
      arg = null;
    }
  }
  return { section: m[1], page: m[2] || null, arg };
}

/** The hash of a section, its page and what the page opens. */
export function href(section: string, page?: string | null, arg?: string | null): string {
  if (!page) return `#${section}`;
  return arg ? `#${section}/${page}/${encodeURIComponent(arg)}` : `#${section}/${page}`;
}
