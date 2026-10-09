// SPDX-License-Identifier: AGPL-3.0-only
// The pseudonymise step of a dataset (Wave 7a, the design of 2026-10-09):
// what the step in the dataset's detail draws and does, worked out from what
// the engine says. The three boxes (the originals, locked; the IDs and how
// many have a code; the pseudonymised copy, what NILS reads), the one next
// action, the words on the rail, the IDs one row each by their shape, a map
// of ID and subject code read in the browser into its two columns, the four
// rules behind Change, and what every file got once it is done. An ID's value
// never passes through here: the rows carry shapes, and a map's values go
// once to the engine's rehearsal and are kept nowhere.

import { door } from "../ask/client";
import { NO_TAGS, sameTags, tagCounts, tagsOf, type TagPolicy } from "./policy";
import { shapeOf, type Csv, type Dataset, type DatasetPatch } from "./pseudonyms";
import type { SummaryStep } from "./summary";

const n = (v: number) => v.toLocaleString("en-US");
const files = (k: number) => `${n(k)} ${k === 1 ? "file" : "files"}`;
const ids = (k: number) => `${n(k)} ${k === 1 ? "ID" : "IDs"}`;

/* ---------------------------------------------------------------- the held IDs, as the engine lists them */

/** How a held ID stands: no code yet, a code a map gave, a code to be generated at the next run, or a subject waiting for a value of the type PatientID gets. */
export type HeldState = "held" | "mapped" | "generated" | "waits";

/** One held ID, by the row that stands for it and its shape: never its value. */
export interface HeldId {
  id: number;
  shape: string | null;
  id_type: string | null;
  files: number;
  first_seen: string | null;
  state: HeldState;
  /** The subject code a map gave it, or its subject's; a shape below detail quasi. */
  code: string | null;
  /** The other datasets the code's subject is in already. */
  also_in: string[];
  waits_for: string | null;
}

/** The held IDs of a dataset, and the subjects its pseudonymised copy carries. */
export interface HeldIds {
  files: number;
  identifiers: number;
  ids: HeldId[];
  subjects: { coded: number; generated: number };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const STATES: HeldState[] = ["held", "mapped", "generated", "waits"];

/** The held ids door's answer as the step reads it, whatever an engine left out. */
export function heldIdsOf(raw: unknown): HeldIds {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.ids) ? (r.ids as Record<string, unknown>[]) : [];
  const out: HeldId[] = list
    .filter((h) => h && typeof h.id === "number")
    .map((h) => ({
      id: h.id as number,
      shape: text(h.shape),
      id_type: text(h.id_type),
      files: num(h.files),
      first_seen: text(h.first_seen),
      state: STATES.includes(h.state as HeldState) ? (h.state as HeldState) : "held",
      code: text(h.code),
      also_in: names(h.also_in),
      waits_for: text(h.waits_for),
    }));
  const s = (r.subjects ?? {}) as Record<string, unknown>;
  return { files: num(r.files), identifiers: num(r.identifiers) || out.length, ids: out, subjects: { coded: num(s.coded), generated: num(s.generated) } };
}

/** A code a rehearsed map gives a held ID, by its row. */
export interface Matched {
  id: number;
  code: string;
  also_in: string[];
}

/** The rehearsal's codes for the dataset's held IDs. */
export function matchedOf(raw: unknown): Matched[] {
  const list = Array.isArray((raw as Record<string, unknown> | null)?.held_ids) ? ((raw as Record<string, unknown>).held_ids as Record<string, unknown>[]) : [];
  return list.filter((m) => m && typeof m.id === "number" && typeof m.code === "string").map((m) => ({ id: m.id as number, code: m.code as string, also_in: names(m.also_in) }));
}

/** The values the reveal answers, by the row that stands for each: shown once, and never kept past the page. */
export function revealedOf(raw: unknown): Map<number, string> {
  const out = new Map<number, string>();
  for (const g of Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []) {
    for (const v of Array.isArray(g?.identifiers) ? (g.identifiers as Record<string, unknown>[]) : []) {
      if (typeof v?.id === "number" && typeof v.value === "string") out.set(v.id, v.value);
    }
  }
  return out;
}

/** The doors the step reads and acts through, beside the map's own. */
export const held = {
  ids: (place: string) => door<unknown>("GET", `/api/linkage/held/ids?place=${encodeURIComponent(place)}`).then(heldIdsOf),
  /** Chosen IDs, or every one without a code, given a generated code at the dataset's next run; nothing is queued. */
  generate: (place: string, chosen?: number[]) => door<{ files?: number; state?: string }>("POST", "/api/linkage/held/code", { place, ...(chosen ? { ids: chosen } : {}), run: false }),
  reveal: (place: string) => door<unknown>("POST", "/api/linkage/held/reveal", { place }).then(revealedOf),
};

/* ---------------------------------------------------------------- where the step is */

/** The step's phase: never run, IDs without a code, ready to go, running, or done. */
export type Phase = "fresh" | "codes" | "ready" | "running" | "done";

/** One held ID as a row of the step: its code now, or the one the map being rehearsed gives it. */
export interface IdRow extends HeldId {
  /** The code from the map being rehearsed, where it gives one and the ID has none of its own. */
  from_map: boolean;
  /** It has, or gets at the next run, a code: the engine's, the map's, or a generated one. */
  coded: boolean;
}

/** What the step draws: its phase and the numbers of its three boxes. */
export interface StepView {
  phase: Phase;
  originals: number | null;
  bytes: number | null;
  /** The files of the pseudonymised copy. */
  copy: number;
  /** PatientID holds a personnummer, which the key codes: there is no mapping step. */
  personnummer: boolean;
  rows: IdRow[];
  /** The held IDs that have, or get at the next run, a code. */
  coded: number;
  /** The held IDs with no code, and their files. */
  without: { ids: number; files: number };
  /** The files the next run pseudonymises: the new ones, and the held ones whose ID has a code. */
  go: number;
  /** The subjects the pseudonymised copy carries, and how many were coded without a map. */
  subjects: HeldIds["subjects"];
}

/** Whether the dataset's originals are read as personnummer: their codes come from the key and no map. */
export function readsPersonnummer(d: Pick<Dataset, "identity">): boolean {
  return d.identity?.id_type === "personnummer";
}

/**
 * Where the step is, from the dataset, its summary's pseudonymised step, its
 * held IDs and the codes a map being rehearsed gives them. `running` is the
 * engine's word that a run of the dataset's goes now, or the desk's own act
 * on the way.
 */
export function stepView(d: Dataset, step: SummaryStep | null, heldIds: HeldIds | null, matched: readonly Matched[], running: boolean): StepView {
  const originals = typeof d.trees?.originals?.files === "number" ? d.trees.originals.files : null;
  const bytes = typeof d.trees?.originals?.bytes === "number" ? d.trees.originals.bytes : null;
  const copy = typeof step?.files === "number" ? step.files : typeof d.trees?.anon?.files === "number" ? d.trees.anon.files : 0;
  const heldFiles = heldIds?.files ?? d.held?.files ?? 0;
  const byId = new Map(matched.map((m) => [m.id, m]));
  const rows: IdRow[] = (heldIds?.ids ?? [])
    .map((h): IdRow => {
      const m = h.state === "held" || h.state === "generated" ? byId.get(h.id) : undefined;
      if (m) return { ...h, code: m.code, also_in: m.also_in, from_map: true, coded: true };
      return { ...h, from_map: false, coded: h.state === "mapped" || h.state === "generated" };
    })
    .sort((a, b) => b.files - a.files || a.id - b.id);
  const coded = rows.filter((r) => r.coded).length;
  const lacking = rows.filter((r) => !r.coded);
  const without = { ids: lacking.length, files: lacking.reduce((s, r) => s + r.files, 0) };
  // never seen by a run: the originals less the copy and every held file
  const unseen = originals === null ? 0 : Math.max(0, originals - copy - heldFiles);
  const go = unseen + rows.filter((r) => r.coded && r.state !== "waits").reduce((s, r) => s + r.files, 0);
  // a dataset whose held files the engine counts but does not list yet has IDs without a code all the same
  const unlisted = heldIds === null && (d.held?.identifiers ?? 0) > 0;
  const waiting = typeof step?.waiting === "number" ? step.waiting : originals === null ? 0 : Math.max(0, originals - copy);
  const phase: Phase = running
    ? "running"
    : copy === 0 && heldFiles === 0 && rows.length === 0
      ? "fresh"
      : without.ids > 0 || unlisted
        ? "codes"
        : go > 0 || waiting > 0
          ? "ready"
          : "done";
  return {
    phase,
    originals,
    bytes,
    copy,
    personnummer: readsPersonnummer(d),
    rows,
    coded,
    without: unlisted ? { ids: d.held?.identifiers ?? 0, files: d.held?.files ?? 0 } : without,
    go: phase === "fresh" ? (originals ?? 0) : go,
    subjects: heldIds?.subjects ?? { coded: 0, generated: 0 },
  };
}

/** What the step's one primary button does: run the dataset's thread, or open the IDs to give them codes. */
export type Act = "run" | "find" | "codes";

/**
 * The one next action, in the words that say exactly what will happen; none
 * while it runs or once it is done. A dataset never run whose IDs are coded
 * by the key, or get a generated code, goes at once; one whose IDs need a map
 * first finds them, holding what has no code.
 */
export function primaryOf(v: StepView, generates: boolean, open: boolean): { label: string; act: Act } | null {
  if (v.phase === "fresh") return v.personnummer || generates ? { label: `Pseudonymise and sort ${files(v.go)}`, act: "run" } : { label: "Find the IDs", act: "find" };
  if (v.phase === "codes" && !open) return { label: `Give the ${v.without.ids === 1 ? "ID" : `${n(v.without.ids)} IDs`} a code`, act: "codes" };
  if ((v.phase === "codes" || v.phase === "ready") && v.go > 0) return { label: `Pseudonymise and sort ${files(v.go)}`, act: "run" };
  return null;
}

/** The step's chip: what waits on a person, or that it runs. */
export function chipOf(v: StepView, open: boolean): { words: string; tone: "caution" | "ok" | "brand" } | null {
  if (v.phase === "running") return { words: "Running", tone: "brand" };
  if (v.phase === "codes") return { words: open && v.coded > 0 ? `${ids(v.without.ids)} without a code` : `${ids(v.without.ids)} ${v.without.ids === 1 ? "needs" : "need"} a code`, tone: "caution" };
  if (v.phase === "ready" && v.rows.length > 0) return { words: "Every ID has a code", tone: "ok" };
  return null;
}

/** The middle box: how many IDs there are and how many have a code. */
export function idsBox(v: StepView): { big: string; words: string; caution: boolean } {
  if (v.personnummer) return { big: n(v.subjects.coded), words: `${v.subjects.coded === 1 ? "subject" : "subjects"} · personnummer, coded by the key`, caution: false };
  if (v.phase === "fresh") return { big: "?", words: "found at the first run", caution: false };
  const all = v.rows.length > 0 ? v.rows.length : v.without.ids;
  if (all === 0) return { big: "0", words: "none held", caution: false };
  if (v.coded === 0) return { big: n(all), words: `${all === 1 ? "ID" : "IDs"} · none has a code yet`, caution: true };
  if (v.coded === all) return { big: n(all), words: `${all === 1 ? "ID" : "IDs"} · every one has a code`, caution: false };
  return { big: `${n(v.coded)} of ${n(all)}`, words: "have a code", caution: false };
}

/** The pseudonymised step on the rail while it waits on a person: what it needs, and that it is next. */
export function railWords(v: StepView): { what: string; when: string; next: boolean } | null {
  if (v.phase === "running" || v.phase === "done") return null;
  if (v.phase === "fresh") return { what: "not yet", when: "next step", next: true };
  if (v.phase === "codes") return { what: v.coded > 0 ? `${n(v.coded)} of ${ids(v.rows.length)} have a code` : `${ids(v.without.ids)} ${v.without.ids === 1 ? "needs" : "need"} a code`, when: "next step", next: true };
  return { what: `${files(v.go)} to go`, when: "next step", next: true };
}

/** The line under the IDs: the files still waiting for a code. */
export function waitWords(v: StepView): string | null {
  if (v.without.ids === 0) return null;
  return `${files(v.without.files)} of ${ids(v.without.ids)} wait for a code`;
}

/* ---------------------------------------------------------------- a map of ID and subject code, read here */

/** The two columns a map of codes is read by, by their place in the file. */
export interface CodeColumns {
  id: number;
  code: number;
}

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const CODE_HEADERS = new Set(["code", "subjectcode", "subject", "subjectid", "pseudonym", "nilscode", "kod"]);

/** How many of a column's values have one of the held shapes. */
function shapeHits(values: string[], shapes: ReadonlySet<string>): number {
  return values.filter((v) => v.trim() !== "" && shapes.has(shapeOf(v))).length;
}

/**
 * Which column is the ID and which the subject code: the code by its header,
 * the ID by the held shapes its values have, else by its header, else the
 * other of two. A file with neither is refused in words before a row is posted.
 */
export function codeColumnsOf(csv: Csv, shapes: readonly string[]): CodeColumns | { refusal: string } {
  const heads = csv.header.map(plain);
  const values = (i: number) => csv.rows.map((r) => r[i] ?? "");
  const known = new Set(shapes.filter(Boolean));
  let code = heads.findIndex((h) => CODE_HEADERS.has(h) || (h.endsWith("code") && h !== "postcode"));
  const hits = heads.map((_, i) => (i === code ? -1 : shapeHits(values(i), known)));
  let id = hits.some((h) => h > 0) ? hits.indexOf(Math.max(...hits)) : -1;
  if (id < 0) id = heads.findIndex((h, i) => i !== code && /^id|id$|patient|study|site|identifier/.test(h));
  if (code < 0 && heads.length === 2 && id >= 0) code = 1 - id;
  if (id < 0 && heads.length === 2 && code >= 0) id = 1 - code;
  if (id < 0 || code < 0 || id === code) return { refusal: "A map here is two columns: the ID and its subject code." };
  return { id, code };
}

/** The rows of a map as the pair the rehearsal reads, each with an ID and a code. */
export function codePairs(csv: Csv, c: CodeColumns): string[][] {
  return csv.rows.map((r) => [(r[c.id] ?? "").trim(), (r[c.code] ?? "").trim()]).filter(([i, k]) => i !== "" && k !== "");
}

/** The import's body for the pairs: the ID filed under the type the dataset reads it as, the code taken as given. */
export function codesBody(place: string, idType: string, pairs: string[][], dryRun: boolean) {
  return {
    place,
    columns: [
      { header: "id", role: "identifier" as const, id_type: idType },
      { header: "code", role: "code" as const },
    ],
    rows: pairs,
    dry_run: dryRun,
    // the type is the one the dataset's rule already reads its IDs as: made where the store has not got it yet
    make_types: true,
  };
}

/** The type the dataset's IDs are filed under: the one they were held as, else the rule's, else the engine's own default. */
export function idTypeOf(d: Pick<Dataset, "identity">, rows: readonly Pick<HeldId, "id_type">[]): string {
  return rows.find((r) => r.id_type)?.id_type ?? d.identity?.id_type ?? "patient-id";
}

/* ---------------------------------------------------------------- the rules behind Change */

/** The four choices of the rules: what PatientID gets, what an ID with no code does, the tags, and the originals. */
export interface Rules {
  pid: "code" | "type";
  /** The ID type PatientID gets, when it gets one. */
  pidType: string;
  unknown: "wait" | "generate";
  tags: "standard" | "choose";
  originals: "keep" | "vault" | "purge";
}

export const STANDARD: Rules = { pid: "code", pidType: "", unknown: "wait", tags: "standard", originals: "keep" };

/** Whether a dataset's tag lists are the standard ones: nothing of its own kept or removed. */
export function standardTags(d: Pick<Dataset, "tags">): boolean {
  return sameTags(tagsOf(d.tags), NO_TAGS);
}

/** The rules a dataset stands under now. */
export function rulesOf(d: Pick<Dataset, "patient_id" | "unmapped" | "tags" | "originals_kept">): Rules {
  const pid = d.patient_id ?? "subject-code";
  return {
    pid: pid.startsWith("id-type:") ? "type" : "code",
    pidType: pid.startsWith("id-type:") ? pid.slice("id-type:".length) : "",
    unknown: d.unmapped === "code" ? "generate" : "wait",
    tags: standardTags(d) ? "standard" : "choose",
    originals: d.originals_kept === "vaulted" ? "vault" : d.originals_kept === "purged" ? "purge" : "keep",
  };
}

/** Whether the rules are the standard ones; an ID type's name is no rule while PatientID gets the code. */
export function isStandard(r: Rules): boolean {
  return r.pid === STANDARD.pid && r.unknown === STANDARD.unknown && r.tags === STANDARD.tags && r.originals === STANDARD.originals;
}

/**
 * What Save sends the dataset's place: only what changed. The originals are
 * never among it, since only the act that moves or removes them writes where
 * they stand; standard tags clear the dataset's own lists, and choosing tags
 * is the chooser's.
 */
export function rulesPatch(d: Pick<Dataset, "patient_id" | "unmapped" | "tags" | "originals_kept">, r: Rules): DatasetPatch {
  const was = rulesOf(d);
  const patch: DatasetPatch = {};
  const pid = r.pid === "type" && r.pidType.trim() !== "" ? `id-type:${r.pidType.trim()}` : "subject-code";
  if (pid !== (d.patient_id ?? "subject-code")) patch.patient_id = pid;
  if (r.unknown !== was.unknown) patch.unmapped = r.unknown === "generate" ? "code" : "hold";
  if (r.tags === "standard" && was.tags === "choose") patch.tags = { ...NO_TAGS };
  return patch;
}

/** The rules as one line beside Change: "Standard rules", or what differs, briefly. */
export function rulesLine(d: Pick<Dataset, "patient_id" | "unmapped" | "tags" | "originals_kept">): string {
  const r = rulesOf(d);
  if (isStandard(r)) return "Standard rules";
  const parts: string[] = [];
  if (r.pid === "type") parts.push(`PatientID gets the ${r.pidType}`);
  if (r.unknown === "generate") parts.push("generated codes");
  if (r.tags === "choose") parts.push("own tags");
  if (r.originals !== "keep") parts.push(r.originals === "vault" ? "originals vaulted" : "originals purged");
  return parts.join(" · ");
}

/* ---------------------------------------------------------------- what every file got */

const NAMED_REMOVED: [string, string][] = [
  ["0010,0010", "names"],
  ["0010,0030", "birth date"],
  ["0010,1040", "address"],
];
const EXAMINATION_WORDS: Record<string, string> = { "0008,0050": "accession number", "0020,0010": "study ID" };

/** The policy as the step reads more of it than the chooser does: the examination's numbers and the marks, where the engine serves them. */
type Served = TagPolicy & { examination?: { tag: string }[]; marks?: unknown };

/** One line of what every file got: its label, its value, and a link's words where the chooser lists them all. */
export interface FileLine {
  label: string;
  value: string;
  all?: string;
}

/**
 * What every pseudonymised file of the dataset got, as the engine's policy
 * and the dataset's own lists say it: PatientID, what was removed (a few by
 * name, the rest counted), what was kept, and the mark in its own header.
 * Without the policy only PatientID and what is always kept are said.
 */
export function everyFile(policy: TagPolicy | null, d: Pick<Dataset, "patient_id" | "tags">): FileLine[] {
  const pid = d.patient_id ?? "subject-code";
  const out: FileLine[] = [{ label: "PatientID", value: pid.startsWith("id-type:") ? `the subject's ${pid.slice("id-type:".length)}` : "the subject code" }];
  const tags = tagsOf(d.tags);
  if (policy) {
    const served = policy as Served;
    const exam = served.examination ?? [];
    const removed = tagCounts(policy, tags).removed + exam.length;
    const gone = new Set(policy.tags.filter((t) => t.fate === "removed" && !tags.keep.includes(t.tag)).map((t) => t.tag));
    const named = [...NAMED_REMOVED.filter(([t]) => gone.has(t)).map(([, w]) => w), ...exam.map((e) => EXAMINATION_WORDS[e.tag]).filter(Boolean)];
    const more = Math.max(0, removed - named.length);
    const value = named.length === 0 ? `${n(removed)} tags` : more > 0 ? `${named.join(", ")} and ${n(more)} more` : named.join(", ");
    out.push({ label: "Removed", value, all: `See all ${n(policy.count)}` });
  }
  const kept = ["dates", "UIDs", ...(tags.keep_demographics ? ["sex", "weight", "size"] : []), "age"];
  if (tags.keep.length > 0) kept.push(`${n(tags.keep.length)} of its own`);
  out.push({ label: "Kept", value: kept.join(", ") });
  if (policy && (policy as Served).marks) out.push({ label: "Marked", value: "de-identified, and how, in the file’s own header" });
  return out;
}

/** Where the codes came from, for the done step's middle box. */
export function codesWords(subjects: HeldIds["subjects"] | null, personnummer: boolean): string {
  if (personnummer) return "coded by the key";
  if (!subjects || subjects.coded === 0) return "none yet";
  const given = subjects.coded - subjects.generated;
  return [given > 0 ? `${n(given)} from a map` : null, subjects.generated > 0 ? `${n(subjects.generated)} generated` : null].filter(Boolean).join(" · ");
}
