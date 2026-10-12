// SPDX-License-Identifier: AGPL-3.0-only
// A count the engine held back (record 55 K7, small counts at plain, the
// ruling of 2026-10-12). Below detail quasi a count of rows a
// quasi-identifying field chose or grouped is null for 1 to 4 subjects, and
// one more beside it so that it is not found by subtraction: the count level's
// rows and subjects, a group's counts, the funnel's stages and the start and
// profile doors' counts. A held count is not always under 5 itself, and a
// label that told the two apart would say which cell is the small one, so
// every held count reads the same true words, "held back", with the engine's
// why on hover; it is never shown as 0, "null" or NaN, and never summed.

/** A count as the engine answers it: a number, or null where it held it back. */
export type Count = number | null;

/** How a held count reads. */
export const HELD = "held back";

/** The engine's why, where an answer holds a count back without naming it. */
export const HELD_WHY = "fewer than 5, or held beside a count of fewer than 5 so that it is not found by subtraction";

/** A count read from anything the engine sent: a finite number, else held (null). */
export const countIn = (v: unknown): Count => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A count in figures, or the held words. */
export const countText = (c: Count): string => (c === null ? HELD : c.toLocaleString("en-US"));

/** A count with its unit: 1 subject, 1,497 stacks, subjects held back. */
export function countUnit(c: Count, unit: string): string {
  if (c === null) return `${unit} ${HELD}`;
  return `${c.toLocaleString("en-US")} ${c === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit}`;
}

/** The sum of counts; held if any is, so a held count never hides in a total. */
export function sumCounts(cs: readonly Count[]): Count {
  let total = 0;
  for (const c of cs) {
    if (c === null) return null;
    total += c;
  }
  return total;
}

/** The columns an answer names as held back, with why: `held_back` as [{column, why}]; empty where it names none. */
export function heldColumns(body: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const listed = (body as { held_back?: unknown } | null | undefined)?.held_back;
  if (!Array.isArray(listed)) return out;
  for (const h of listed) {
    const x = (h ?? {}) as { column?: unknown; why?: unknown };
    if (typeof x.column === "string" && !out.has(x.column)) out.set(x.column, typeof x.why === "string" && x.why.trim() ? x.why.trim() : HELD_WHY);
  }
  return out;
}

/** What an empty cell of a held column reads, a count or a group's mean alike: held back. */
export function heldCell(_why: string): string {
  return HELD;
}
