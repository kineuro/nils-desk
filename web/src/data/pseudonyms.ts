// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's pseudonymisation: what its source row says about who each
// file is about, the two trees, what the pseudonymised tree keeps and what
// leaves; the linkage doors behind the map, the held files and the types;
// and the pure parts of the pages: a CSV read in the browser, its columns
// guessed, the import's report, the held files grouped by shape, and the
// words each fact takes. Identifiers never pass through here except in the
// rows of a map a person chose, posted once to the import door.

import { door } from "../ask/client";
import type { Detail } from "../grants";
import type { Access } from "../settings/identity";
import type { Dataset, DatasetFields, IdentityRule, OriginalsKept } from "./datasets";
import type { Handling } from "./sources";

// A dataset is the sources door's row as the Data page types it; the same shape is read from here.
export type { Arrives, Dataset, IdentityRule, IdentitySource, Trees } from "./datasets";

/** The fields a change to the dataset sends to its place: the dataset fields the places door takes, the originals and the handling. */
export type DatasetPatch = Partial<DatasetFields> & {
  originals_kept?: OriginalsKept;
  handling?: Handling;
};

export interface IdType {
  name: string;
  description: string | null;
  /** Counts, where the engine reports them. */
  identifiers?: number;
  subjects?: number;
}

export interface TypesDoc {
  types: IdType[];
  subjects?: number;
  identifiers?: number;
  /** Subjects carrying more than one type. */
  several?: number;
  /** When maps were filed, oldest first. */
  filed?: string[];
  merged?: { subjects: number; last: string | null } | null;
}

export type ColumnRole = "identifier" | "canonical" | "code" | "ignore";

export interface ImportColumn {
  header: string;
  role: ColumnRole;
  id_type?: string;
}

/** What an import will do, said before it writes; the same report is a filed import's result. The engine names the new types or counts them, and says the held files released as a count or as released of held. */
export interface ImportReport {
  subjects: { named: number; known: number; new: number };
  identifiers: { filed: number; known: number; new: number; types_new: number | string[] };
  held_released: number | { released: number; of: number };
  merges: { alias: string; canonical: string }[];
  conflicts: { row: number; why: string }[];
}

export interface HeldRow {
  shape: string;
  files: number;
  first_seen: string | null;
  batch: string | number | null;
}

export interface Revealed {
  identifier: string;
  shape?: string;
  files?: number;
  batch?: string | number | null;
}

const list = <T>(v: unknown, key: string): T[] => (Array.isArray(v) ? (v as T[]) : Array.isArray((v as Record<string, unknown>)?.[key]) ? ((v as Record<string, unknown>)[key] as T[]) : []);

export const linkage = {
  types: () => door<TypesDoc | IdType[]>("GET", "/api/linkage/types").then((r) => (Array.isArray(r) ? { types: r } : r)),
  addType: (name: string, description: string) => door<IdType>("POST", "/api/linkage/types", { name, description }),
  /** A map: rehearsed with `dry_run`, which answers the report; applied, which answers the job whose result is the same report. */
  import: (body: { place?: string; columns: ImportColumn[]; rows: string[][]; dry_run: boolean }) => door<ImportReport & { job?: number; state?: string }>("POST", "/api/linkage/imports", body),
  held: (place: string) => door<unknown>("GET", `/api/linkage/held?place=${encodeURIComponent(place)}`).then((r) => list<HeldRow>(r, "held")),
  codeHeld: (place: string) => door<{ job: number; state: string }>("POST", "/api/linkage/held/code", { place }),
  reveal: (place: string) => door<unknown>("POST", "/api/linkage/held/reveal", { place }).then((r) => list<Revealed>(r, "identifiers")),
};

export const datasets = {
  set: (id: number, patch: DatasetPatch) => door<Record<string, unknown>>("PUT", `/api/places/${id}`, patch),
};

/* ---------------------------------------------------------------- the words */

/** How the dataset arrives, in a sentence for its card and its page. */
export function arrivesWords(d: Dataset): string {
  const a = d.arrives ?? (d.handling?.arrives === "deidentified" ? "deidentified" : "identified");
  if (a === "identified") return "identified; pseudonymised into dcm-anon before anything reads it";
  if (a === "deidentified") return "de-identified; moved into dcm-anon as sent, identifiers mapped when read";
  return "coded; our codes already in PatientID, taken verbatim";
}

/** Where the codes come from. */
export function subjectsWords(d: Dataset): string {
  if (d.identity?.code === "verbatim" || d.arrives === "coded") return "codes taken verbatim from the files";
  if (d.unmapped === "code") return "codes from the map, or derived from the identifier under the key";
  return "codes from the map and the key";
}

/** The rule that says who a file is about: "PatientID, through the map". */
export function identityWords(d: Dataset): string {
  const rule = d.identity ?? null;
  const from = rule?.from?.[0];
  const source = !from ? "PatientID" : from.field ? from.field : from.path ? `folder ${from.path.segment} of the path` : "PatientID";
  if (rule?.code === "verbatim" || d.arrives === "coded") return `${source}, taken verbatim as the code`;
  if (d.unmapped === "code") return `${source}, through the map or hashed`;
  return `${source}, through the map`;
}

/** What the leaving policy does: "dates shifted · UIDs remapped · faces kept". */
export function leavingWords(h: Handling["on_release"] | undefined): string {
  if (!h) return "as the tree stands";
  const dates = h.dates === "shift" ? "dates shifted" : h.dates === "year" ? "dates cut to the year" : "dates kept";
  const uids = h.uids === "remap" ? "UIDs remapped" : "UIDs kept";
  const faces = h.deface ? "faces removed" : "faces kept";
  return `${dates} · ${uids} · ${faces}`;
}

/** Whether the leaving policy stands: shifted dates with kept UIDs is refused. */
export function leavingRefusal(h: Handling["on_release"]): string | null {
  return h.dates !== "keep" && h.uids === "preserve" ? "Dates that move cannot keep the original UIDs. Remap the UIDs, or keep the dates." : null;
}

export const ORIGINALS_WORDS: Record<OriginalsKept, string> = {
  kept: "kept here",
  vaulted: "vaulted: moved out of the way, not read",
  purged: "purged: the pseudonymised tree is all that is left",
};

/** Bytes as a person reads them. */
export function bytesWords(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.round(b / 1e3)} kB`;
}

/* ---------------------------------------------------------------- the map, read here */

export interface Csv {
  header: string[];
  rows: string[][];
  delimiter: string;
}

/** A CSV as the browser reads it: comma, semicolon or tab, quotes honoured, a trailing empty line dropped. */
export function parseCsv(text: string): Csv {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = (rows.shift() ?? []).map((h) => h.trim());
  const body = rows.filter((r) => r.some((v) => v.trim() !== "")).map((r) => header.map((_, i) => (r[i] ?? "").trim()));
  return { header, rows: body, delimiter };
}

/** A value's shape: every digit a 9, every capital an A, every small letter an a, everything else as it is. */
export function shapeOf(value: string): string {
  return value.trim().replace(/[0-9]/g, "9").replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a");
}

/** A shape in words: "12 digits" for digits alone, else the shape itself. */
export function shapeWords(shape: string): string {
  if (/^9+$/.test(shape)) return `${shape.length} digits`;
  return shape;
}

export interface ColumnLook {
  header: string;
  /** The most common shape, in words. */
  shape: string | null;
  /** How many rows hold a value. */
  filled: number;
  distinct: number;
  /** "12 digits, 1,244 rows, 212 distinct". */
  words: string;
}

const n = (v: number) => v.toLocaleString("en-US");

/** What a column looks like from its values. */
export function lookAt(header: string, values: string[]): ColumnLook {
  const filled = values.filter((v) => v.trim() !== "");
  const shapes = new Map<string, number>();
  for (const v of filled) shapes.set(shapeOf(v), (shapes.get(shapeOf(v)) ?? 0) + 1);
  const ranked = [...shapes.entries()].sort((a, b) => b[1] - a[1]);
  const distinct = new Set(filled.map((v) => v.trim())).size;
  if (filled.length === 0) return { header, shape: null, filled: 0, distinct: 0, words: "empty" };
  const shape = ranked.length > 1 && ranked[1][1] * 10 >= filled.length ? `${ranked.length} shapes: ${ranked.slice(0, 2).map(([s]) => shapeWords(s)).join(", ")}` : shapeWords(ranked[0][0]);
  const parts = [shape, `${n(filled.length)} ${filled.length === 1 ? "row" : "rows"}`];
  if (filled.length < values.length) parts.push("rest empty");
  if (distinct < filled.length) parts.push(`${n(distinct)} distinct`);
  return { header, shape, filled: filled.length, distinct, words: parts.join(", ") };
}

export interface Guess {
  role: ColumnRole;
  /** The registry's type, when the header names one. */
  id_type: string | null;
  /** A type to make, named after the header, when none matches. */
  new_type: string | null;
}

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Short headers a site writes for a national number, matched to a type named for one. */
const NUMBER_HEADERS = new Set(["pn", "pnr", "personnr", "personnummer", "personalnumber", "personnumber", "ssn", "nationalid", "nationalnumber"]);

/** The type a header names: by its plain name, or a national number's short header against a type named for one. */
function typeNamed(h: string, types: IdType[]): IdType | undefined {
  const exact = types.find((t) => plain(t.name) === h);
  if (exact) return exact;
  if (NUMBER_HEADERS.has(h)) {
    const number = types.find((t) => NUMBER_HEADERS.has(plain(t.name)) || /person|national|ssn/.test(plain(t.name)));
    if (number) return number;
  }
  return types.find((t) => (h.length >= 3 && plain(t.name).startsWith(h)) || (plain(t.name).length >= 3 && h.startsWith(plain(t.name))));
}

/** A type's name made plain for the registry: lowercase, words joined by one dash. */
export function typeName(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** What a column means, guessed from its header and what it holds: the person's number, the code, a type of the registry's, or a new type named after the header. */
export function guessRole(header: string, look: ColumnLook, types: IdType[]): Guess {
  const h = plain(header);
  if (look.filled === 0) return { role: "ignore", id_type: null, new_type: null };
  if (h.includes("canonical") || h === "person" || h === "personnumber") return { role: "canonical", id_type: null, new_type: null };
  if (h === "code" || h === "subjectcode" || h === "subject" || h === "nilscode" || h === "pseudonym") return { role: "code", id_type: null, new_type: null };
  const known = typeNamed(h, types);
  if (known) return { role: "identifier", id_type: known.name, new_type: null };
  return { role: "identifier", id_type: null, new_type: typeName(header) || "identifier" };
}

/** The columns as the import door takes them; a new type is named as its type until it is made. */
export function importColumns(header: string[], guesses: Guess[]): ImportColumn[] {
  return header.map((h, i) => {
    const g = guesses[i];
    if (g.role === "identifier") return { header: h, role: "identifier", id_type: g.id_type ?? g.new_type ?? typeName(h) };
    return { header: h, role: g.role };
  });
}

/** Why the map cannot be filed as the columns stand, or null. */
export function mapRefusal(guesses: Guess[]): string | null {
  const ids = guesses.filter((g) => g.role === "identifier").length;
  const canonical = guesses.filter((g) => g.role === "canonical").length;
  const code = guesses.filter((g) => g.role === "code").length;
  if (ids === 0 && canonical === 0) return "At least one column is an identifier or the person's number.";
  if (canonical > 1) return "One column stands for the person; two are chosen.";
  if (code > 1) return "One column is the code; two are chosen.";
  if (ids === 0 && code === 0) return "The person's number alone maps nothing: add an identifier column or the code.";
  return null;
}

/** The held files a dry run releases, as "4 of 4". */
export function heldReleasedWords(r: ImportReport): string {
  const h = r.held_released;
  if (typeof h === "number") return h === 0 ? "none" : `${n(h)} released`;
  return `${n(h.released)} of ${n(h.of)} released`;
}

/** What the report says, line by line, for the dialog. */
export function reportLines(r: ImportReport): { label: string; words: string; tone?: "caution" | "ok" }[] {
  const s = r.subjects;
  const i = r.identifiers;
  const merges = r.merges?.length ?? 0;
  const conflicts = r.conflicts?.length ?? 0;
  const typesNew = Array.isArray(i.types_new) ? i.types_new.length : i.types_new;
  const named = Array.isArray(i.types_new) && i.types_new.length > 0 ? ` (${i.types_new.join(", ")})` : "";
  return [
    { label: "subjects", words: `${n(s.named)} named · ${n(s.known)} known · ${n(s.new)} new, with codes derived from their number` },
    { label: "identifiers", words: `${n(i.filed)} filed · ${n(i.known)} already known · ${n(i.new)} new${typesNew > 0 ? ` · ${n(typesNew)} new ${typesNew === 1 ? "type" : "types"}${named}` : ""}` },
    { label: "held files", words: heldReleasedWords(r) },
    { label: "merges", words: merges === 0 ? "none" : `${n(merges)}: ${merges === 1 ? "a provisional subject becomes its canonical one" : "provisional subjects become their canonical ones"} · the old codes stay as identifiers`, tone: merges > 0 ? "caution" : undefined },
    { label: "conflicts", words: conflicts === 0 ? "0 · an identifier already on another subject would be listed here first, and nothing written" : `${n(conflicts)}: nothing is written until they are resolved`, tone: conflicts > 0 ? "caution" : "ok" },
  ];
}

/* ---------------------------------------------------------------- held until mapped */

export interface HeldGroup {
  shape: string;
  files: number;
  identifiers: number;
  batches: string[];
  since: string | null;
}

/** The held files by shape, most files first, with the batches and the earliest sighting of each. */
export function heldGroups(rows: HeldRow[]): HeldGroup[] {
  const by = new Map<string, HeldGroup>();
  for (const r of rows) {
    const g = by.get(r.shape) ?? { shape: r.shape, files: 0, identifiers: 0, batches: [], since: null };
    g.files += r.files;
    g.identifiers += 1;
    const b = r.batch === null || r.batch === undefined ? null : String(r.batch);
    if (b !== null && !g.batches.includes(b)) g.batches.push(b);
    if (r.first_seen && (g.since === null || r.first_seen < g.since)) g.since = r.first_seen;
    by.set(r.shape, g);
  }
  return [...by.values()].sort((a, b) => b.files - a.files);
}

/** A group's line: "12 digits, not in the map", then "AAA999, a second shape". */
export function heldLine(g: HeldGroup, index: number): string {
  return index === 0 ? `${shapeWords(g.shape)}, not in the map` : `${shapeWords(g.shape)}, ${index === 1 ? "a second shape" : "another shape"}`;
}

/* ---------------------------------------------------------------- the identity-check station's run */

export interface SawCard {
  title: string;
  meta: string | null;
  shapes: { shape: string; files: number }[];
  facts: [string, string][];
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

function sourceWords(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(sourceWords).filter(Boolean).join(", then ") || null;
  if (v && typeof v === "object") {
    const o = v as { field?: unknown; path?: { segment?: unknown }; sources?: unknown; from?: unknown; id_type?: unknown };
    if (typeof o.field === "string") return o.field;
    if (o.path && typeof o.path.segment === "number") return `folder ${o.path.segment} of the path`;
    if (o.sources !== undefined) return sourceWords(o.sources);
    if (o.from !== undefined) return sourceWords(o.from);
    if (typeof o.id_type === "string") return o.id_type;
  }
  return null;
}

/** What the station saw per rule, as cards: the shapes with their counts, the people, the files with no value. Shapes only; the station carries no value. */
export function sawOf(result: Record<string, unknown>): SawCard[] {
  const saw = Array.isArray(result.saw) ? (result.saw as Record<string, unknown>[]) : [];
  return saw.map((x, i) => {
    const source = sourceWords(x.rule) ?? sourceWords(x.source) ?? sourceWords(x.sources) ?? `rule ${i + 1}`;
    const shapes: { shape: string; files: number }[] = [];
    const raw = x.shapes;
    if (Array.isArray(raw)) {
      for (const s of raw as Record<string, unknown>[]) {
        const shape = str(s.shape);
        const files = typeof s.files === "number" ? s.files : typeof s.count === "number" ? s.count : null;
        if (shape !== null && files !== null) shapes.push({ shape, files });
      }
    } else if (raw && typeof raw === "object") {
      for (const [shape, files] of Object.entries(raw as Record<string, unknown>)) if (typeof files === "number") shapes.push({ shape, files });
    }
    shapes.sort((a, b) => b.files - a.files);
    const facts: [string, string][] = [];
    const people = x.subjects ?? x.people;
    if (typeof people === "number") facts.push(["people", `${n(people)} under this rule`]);
    const empty = x.empty ?? x.files_with_no_value ?? x.no_value;
    if (typeof empty === "number") facts.push(["files with no value", n(empty)]);
    if (typeof x.studies === "number") facts.push(["studies", n(x.studies)]);
    if (typeof x.constant === "boolean") facts.push(["one identity per file", x.constant ? "yes" : "no"]);
    if (typeof x.path_is_direct_identifier === "boolean") facts.push(["is the path an identifier?", x.path_is_direct_identifier ? "yes: a person's number in a folder name" : "no: a study code, not a person's number"]);
    const title = i === 0 ? `Now: ${source}` : `Candidate: ${source}`;
    const meta = typeof x.code === "string" ? `code ${x.code}` : i === 0 && saw.length > 1 ? "the rule in use" : null;
    return { title, meta, shapes, facts };
  });
}

/** The rule the station proposed, when it did: from the proposals list, else the result. */
export function proposedRule(verdict: { result: Record<string, unknown>; proposals: { kind: string; ref: Record<string, unknown>; sentence?: string }[] }): IdentityRule | null {
  const fromList = verdict.proposals.find((p) => p.kind === "identity_rule")?.ref?.rule;
  const rule = (fromList ?? verdict.result.proposed ?? null) as IdentityRule | null;
  return rule && typeof rule === "object" && typeof rule.id_type === "string" && Array.isArray(rule.from) ? rule : null;
}

/** A rule as a person reads it: "Read the code from folder 2 of the path, verbatim." */
export function ruleWords(rule: IdentityRule): string {
  const sources = rule.from.map((s) => (s.field ? s.field : s.path ? `folder ${s.path.segment} of the path` : "?"));
  const read = sources.length > 1 ? `${sources[0]}, then ${sources.slice(1).join(", then ")}` : sources[0] ?? "PatientID";
  return rule.code === "verbatim" ? `Read the code from ${read}, verbatim.` : `Read the ${rule.id_type} from ${read}, through the map.`;
}

/* ---------------------------------------------------------------- who sees what */

/** How many people see records at each detail, from the desk's people door. */
export function detailCounts(access: Access | null): Record<Detail, number> {
  const out: Record<Detail, number> = { plain: 0, quasi: 0, sensitive: 0 };
  for (const p of access?.people ?? []) out[p.access.detail] += 1;
  return out;
}

/** The tags the pseudonymiser removes, in v0's four groups, tag for tag. */
export const REMOVED_GROUPS: { group: string; tags: number }[] = [
  { group: "patient", tags: 34 },
  { group: "provider", tags: 38 },
  { group: "trial", tags: 23 },
  { group: "institution", tags: 5 },
];

export const REMOVED_TOTAL = REMOVED_GROUPS.reduce((s, g) => s + g.tags, 0);

/** A list typed as words, one tag a line or comma-separated, each once. */
export function tagList(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}
