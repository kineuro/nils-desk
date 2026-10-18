// SPDX-License-Identifier: AGPL-3.0-only
// Clinical, under Data (gate T31, walkthrough step 22.8; record 55, ruling
// 35 (c)): the clinical vocabulary the registry holds, loaded from the
// pack's own file or one a person picks (`/api/clinical/vocabulary`, as
// `nils clinical vocabulary load`), and clinical rows imported from a CSV
// under a mapping, previewed first and then applied (`POST
// /api/clinical/import`, as `nils clinical import`). The engine checks each
// door's grant: data:see to read, data:work to change, and every detail for
// a mapping that names its subjects by an ID.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import { csvLabels, hideNumbers, parseCsv } from "./pseudonyms";

export interface Disease {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  types: { name: string; description: string | null }[];
}

export interface Kind {
  id: number;
  name: string;
  category: string;
  value_type: string | null;
  unit: string | null;
  primary: boolean;
  sensitive: boolean;
}

export interface Vocabulary {
  diseases: Disease[];
  observation_types: Kind[];
}

type Counted = { added: number; updated: number };

export interface Loaded {
  diseases: Counted;
  disease_types: Counted;
  observation_types: Counted;
  from: string;
  changed: number;
}

export interface ImportReport {
  target: string;
  applied: boolean;
  rows: number;
  added: number;
  skipped: number;
  updated: number;
  superseded: number;
  reviewed: number;
  /** Rows refused, by reason, each reason in words that carry nothing of the file (`refusalWords`). */
  refused: Record<string, number>;
  changes: number;
}

export const clinical = {
  vocabulary: () => door<Vocabulary>("GET", "/api/clinical/vocabulary"),
  /** A vocabulary's text, or with none the pack's own. */
  load: (text?: string, name?: string) => door<Loaded>("POST", "/api/clinical/vocabulary", text ? { text, ...(name ? { name } : {}) } : {}),
  /** The report as the desk keeps it: counts, and the refusals in words that carry nothing of the file. The engine's first rows (`samples`) and its own words for a refusal are let go here. */
  import: (mapping: string, csv: string, apply: boolean) => door<unknown>("POST", "/api/clinical/import", { mapping, csv, apply }).then(importReportOf),
};

/** What this person may do on Clinical: see the vocabulary, load one, import rows. */
export function clinicalActs(caps: Capabilities): { see: boolean; load: boolean; import: boolean } {
  const works = may(caps, "data:work");
  return {
    see: may(caps, "data:see") && served(caps, "GET /api/clinical/vocabulary"),
    load: works && served(caps, "POST /api/clinical/vocabulary"),
    import: works && served(caps, "POST /api/clinical/import"),
  };
}

/** Whether a mapping names its subjects by an ID, which the engine reads only for a person who sees every detail. */
export function byIdentifier(mapping: string): boolean {
  return /^\s*subject:.*\bby:\s*identifier\b/mu.test(mapping) || /^\s+by:\s*identifier\b/mu.test(mapping);
}

/** Why an import by ID is not offered to this person, or null. */
export function identifierRefusal(caps: Capabilities, mapping: string): string | null {
  return byIdentifier(mapping) && !sees(caps, "sensitive") ? "This mapping names subjects by an ID; importing it needs every detail." : null;
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * A refused row's reason in words that carry nothing of the file. The engine
 * names the cell that did not read ("birth: <the cell> is not a day of the
 * calendar") and the name a row gave that the registry does not have ("no
 * cohort named <the name>"), so a column of the wrong kind put its values, a
 * personnummer among them, into the list. What the reason is about stays (the
 * field, the kind of fault); the cell and the name do not. A reason this does
 * not know is not printed: the engine may word a new one with a cell in it.
 */
export function refusalWords(reason: string): string {
  const why = reason.trim();
  const unread = /^([^:]+): .+ (is not an integer|is not a number|is not a yes or a no|is not a day of the calendar|is not a time of day)$/su.exec(why);
  if (unread) return `${unread[1]}: a cell ${unread[2]}`;
  const format = /^([^:]+): .+ does not read as (\S+)$/su.exec(why);
  if (format) return `${format[1]}: a cell does not read as ${format[2]}`;
  if (/^no observation kind named .+; load the vocabulary first$/su.test(why)) return "a kind of observation the vocabulary does not have; load the vocabulary first";
  if (/^no cohort named .+$/su.test(why)) return "a cohort the registry does not have";
  if (/^no disease named .+$/su.test(why)) return "a disease the registry does not have";
  if (/^no type .+ of .+$/su.test(why)) return "a type of disease the registry does not have";
  if (/^not a row: /u.test(why)) return "not a row";
  // the fixed words of the engine that name no cell: a row's missing field, the subject it does not know, a fault of the mapping's format
  const plain = [
    /^no subject$/u,
    /^a subject the registry does not know$/u,
    /^no [a-z_]+$/u,
    /^the row carries no demographic$/u,
    /^the kind is numeric and the value is not a number$/u,
    /^the kind carries an? [a-z_]+ value and the row has none$/u,
    /^[^:]+: (the format has no %[A-Za-z]|format \S+ ends in %)$/u,
  ];
  return plain.some((p) => p.test(why)) ? why : "another reason";
}

/** The refusals as the desk keeps them: each reason in words that carry nothing of the file, reasons that come to the same words one line, the most rows first. */
export function refusedOf(raw: unknown): Record<string, number> {
  const merged = new Map<string, number>();
  if (raw && typeof raw === "object") {
    for (const [reason, rows] of Object.entries(raw as Record<string, unknown>)) {
      const words = refusalWords(reason);
      merged.set(words, (merged.get(words) ?? 0) + count(rows));
    }
  }
  return Object.fromEntries([...merged].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

/** The engine's report as the desk reads it, whatever it left out: counts, and the refusals without the file's cells; never the engine's first rows. */
export function importReportOf(raw: unknown): ImportReport {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const added = count(r.added);
  const updated = count(r.updated);
  const superseded = count(r.superseded);
  const reviewed = count(r.reviewed);
  return {
    target: typeof r.target === "string" ? r.target : "",
    applied: r.applied === true,
    rows: count(r.rows),
    added,
    skipped: count(r.skipped),
    updated,
    superseded,
    reviewed,
    refused: refusedOf(r.refused),
    changes: typeof r.changes === "number" ? count(r.changes) : added + updated + superseded + reviewed,
  };
}

/**
 * The engine's refusal of an import, with nothing of the file in it. When the
 * mapping names a column the file lacks the engine lists the file's columns,
 * which for a file with no header line is a row of values, so the list is
 * redrawn here by the names the desk gives the columns; a stray number is
 * hidden from any other word.
 */
export function importFailure(message: string, csv: string): string {
  const at = message.indexOf("; its columns are ");
  if (at < 0) return hideNumbers(message);
  // the engine reads commas alone, so the list is redrawn as it read the file's first line
  return hideNumbers(`${message.slice(0, at)}; its columns are ${csvLabels(parseCsv(csv, ",")).join(", ")}`);
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The vocabulary in a line. */
export function vocabularyWords(v: Vocabulary): string {
  if (v.diseases.length === 0 && v.observation_types.length === 0) return "No vocabulary yet.";
  return `${plural(v.diseases.length, "disease", "diseases")} · ${plural(v.observation_types.length, "kind of observation", "kinds of observation")}`;
}

/** What a load did, in a sentence. */
export function loadedWords(l: Loaded): string {
  if (l.changed === 0) return `Loaded ${l.from}: nothing changed.`;
  const parts = (
    [
      ["disease", "diseases", l.diseases],
      ["disease type", "disease types", l.disease_types],
      ["kind of observation", "kinds of observation", l.observation_types],
    ] as const
  )
    .filter(([, , c]) => c.added + c.updated > 0)
    .map(([one, many, c]) => [c.added > 0 ? `${plural(c.added, one, many)} added` : null, c.updated > 0 ? `${plural(c.updated, one, many)} updated` : null].filter(Boolean).join(", "));
  return `Loaded ${l.from}: ${parts.join("; ")}.`;
}

/** What an import did or would do, in a sentence. */
export function reportWords(r: ImportReport): string {
  const refused = Object.values(r.refused).reduce((a, b) => a + b, 0);
  const counts = [
    `${r.added.toLocaleString("en-US")} added`,
    `${r.skipped.toLocaleString("en-US")} already there`,
    ...(r.updated > 0 ? [`${r.updated.toLocaleString("en-US")} updated`] : []),
    ...(r.superseded > 0 ? [`${r.superseded.toLocaleString("en-US")} superseded`] : []),
    ...(r.reviewed > 0 ? [`${r.reviewed.toLocaleString("en-US")} for review`] : []),
    `${refused.toLocaleString("en-US")} refused`,
  ].join(", ");
  const rows = plural(r.rows, "row", "rows");
  if (r.applied) return `Imported ${rows} as ${r.target}: ${counts}.${r.changes === 0 ? " Nothing changed." : ""}`;
  return `${rows} as ${r.target} would give: ${counts}.${r.changes === 0 ? " Nothing would change." : ""}`;
}
