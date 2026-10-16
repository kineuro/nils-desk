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
  refused: Record<string, number>;
  changes: number;
  samples: { row: number; subject: string | null; verdict: string; detail: string | null }[];
}

export const clinical = {
  vocabulary: () => door<Vocabulary>("GET", "/api/clinical/vocabulary"),
  /** A vocabulary's text, or with none the pack's own. */
  load: (text?: string, name?: string) => door<Loaded>("POST", "/api/clinical/vocabulary", text ? { text, ...(name ? { name } : {}) } : {}),
  import: (mapping: string, csv: string, apply: boolean) => door<ImportReport>("POST", "/api/clinical/import", { mapping, csv, apply }),
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
