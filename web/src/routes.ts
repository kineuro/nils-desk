// SPDX-License-Identifier: AGPL-3.0-only
// Addresses (Wave 5 section 6.3): a section, a section's tab, or an object's
// page. An object's address is stable, so a link in an email opens it:
// #cohort/3, #document/9, #handle/71. A section's tab and what it opens sit
// past the slash: #release/releases/77, #ask/12.

export const OBJECT_KINDS = [
  "cohort", "subject", "session", "batch", "document", "handle", "release", "handover",
  "pack", "overlay", "rule", "job", "review", "conversation",
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export type Route =
  | { kind: "section"; section: string; tab: string | null; arg: string | null }
  | { kind: "object"; object: ObjectKind; id: string; tab: string | null };

const SECTION = /^#([a-z]+(?::[a-z0-9_-]+)?)(?:\/([^/]*))?(?:\/([^/]*))?/;

export function isObjectKind(s: string): s is ObjectKind {
  return (OBJECT_KINDS as readonly string[]).includes(s);
}

/** The route a hash names. An object is a kind followed by a number; a word after a kind is a section's tab. */
export function parse(hash: string = location.hash): Route {
  const m = SECTION.exec(hash);
  if (!m) return { kind: "section", section: "home", tab: null, arg: null };
  const [, first, second, third] = m;
  if (isObjectKind(first) && second !== undefined && /^\d+$/.test(second)) {
    return { kind: "object", object: first, id: second, tab: third ?? null };
  }
  return { kind: "section", section: first, tab: second || null, arg: third || null };
}

/** The address of an object's page. */
export function hrefOf(kind: ObjectKind, id: number | string): string {
  return `#${kind}/${id}`;
}

/** The section a hash names, or "object" for an object's page. */
export function sectionOfHash(hash: string = location.hash): string {
  const r = parse(hash);
  return r.kind === "object" ? "object" : r.section;
}

/** Where the previous shell's addresses now live. */
export function legacy(hash: string): string | null {
  const r = /^#results(?:\/(\d+))?$/.exec(hash);
  if (r) return r[1] ? `#ask/results/${r[1]}` : "#ask/results";
  const m = /^#operations(?:\/([a-z]+))?(?:\/([^/]+))?$/.exec(hash);
  if (!m) return null;
  const tab = m[1] ?? "jobs";
  const arg = m[2] ? `/${m[2]}` : "";
  if (tab === "jobs") return "#pipelines";
  if (tab === "review" || tab === "keyword") return `#review/${tab}${arg}`;
  if (tab === "releases" || tab === "handovers" || tab === "custody") return `#release/${tab}${arg}`;
  if (tab === "audit" || tab === "sessions") return `#settings/${tab}`;
  return "#home";
}
