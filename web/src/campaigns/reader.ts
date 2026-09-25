// SPDX-License-Identifier: AGPL-3.0-only
// The reader's pure parts (record 48 section 2, slice R1): the rating
// workspace of record 45 grown so a person reads a stack in seconds. The
// answer the rules and System 1 agree on is filled in and one key confirms
// it; where they disagree the legal candidates show with their
// probabilities; one line per axis says what decided it; the next items'
// pictures are warmed while this one is read; like stacks come as a batch;
// and every decision is timed. The page, the tests and the headless walk
// share these, so the walk proves what the page does.

import type { Json } from "../ask/client";
import type { AskedCandidate, AxisValue } from "../review/asked";
import { answeredAxes, axisValues, CANDIDATE_KEYS, cantTellOf, derivedAxes, type Derived, type Given, type Item, type Question } from "./client";
import { illegal } from "./workspace";

// ---------------------------------------------------------------- the evidence line

/** One axis as the reader shows it: what decided the value, in one line, with the rest one key away. */
export interface AxisLine {
  axis: string;
  /** The rules' value; a set on a multi-valued axis; null for no value. */
  value: AxisValue;
  /** The flags that decided it (the pack's flags on the header, such as `inversion`, `fat-sat`). */
  flags: string[];
  rule_set: string | null;
  rule: string | null;
  /** The clause of the rule that held, in the pack's words. */
  clause: string | null;
  /** The header values the clause read (TR, TE, TI, flip angle, sequence name, image type), name to value. */
  reads: [string, string][];
  /** Every rule that voted, the deciding one among them. */
  votes: { rule: string; value: string | null }[];
  /** The words it matched; null where the detail level does not allow them. */
  words: string[] | null;
  /** System 1's answer on the axis, and what it weighed most. */
  model: { value: string | null; p: number | null; weighed: string[] } | null;
  confidence: number | null;
  /** Whether the two systems name the same value; null where only one spoke. */
  agree: boolean | null;
}

/** What the reader reads for one item: the lines, the legal candidates, and the suggestion where the engine made one. */
export interface Reading {
  item: number | null;
  stack: number | null;
  axes: string[];
  lines: AxisLine[];
  /** Legal joint answers, most probable first. */
  candidates: AskedCandidate[];
  /** The engine's own suggestion, where it names one; else the desk derives it from the lines and candidates. */
  suggested: Record<string, AxisValue> | null;
  /** An axis question's suggestion, where the engine names it as one value. */
  suggestedOne?: string | null;
  /** The item's value to the model (record 48 "order by value"), where the engine says it. */
  value: number | null;
  /** The batch of like stacks the item belongs to, where the engine groups them. */
  batch: string | null;
  /** An item of a sealed sample (record 48 R2): read blind, with no classification at all, nothing suggested and no candidates. */
  blind?: boolean;
  /** The stack's raw header values as the door sends them (TR, TE, ...), in the engine's short names; all a blind item shows beside its pictures. */
  header?: [string, string][];
  /** The header's text fields as the file has them (record 48): series description, protocol, sequence name, image type and the rest. */
  texts?: Record<string, string>;
  /** The physics (record 48): TR, TE, TI, flip angle, field, scanner, geometry. */
  physics?: Record<string, string | number | (string | number)[]>;
  /** The path of the whole-header door for this item, where the engine names it. */
  headerDoor?: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" && x !== "" ? [x] : typeof x === "number" ? [String(x)] : [])) : typeof v === "string" && v !== "" ? [v] : []);

function axisValue(v: unknown): AxisValue | undefined {
  if (v === null) return null;
  if (typeof v === "string" && v !== "") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "")) return v as string[];
  return undefined;
}

/** Header values as pairs, from an object or a list of {name, value}. */
function pairs(v: unknown): [string, string][] {
  if (Array.isArray(v))
    return v.flatMap((x) => {
      const o = obj(x);
      const k = text(o.name) ?? text(o.tag) ?? text(o.field);
      return k && o.value !== undefined && o.value !== null ? [[k, Array.isArray(o.value) ? o.value.join("\\") : String(o.value)] as [string, string]] : [];
    });
  return Object.entries(obj(v)).flatMap(([k, x]) => (x === undefined || x === null ? [] : [[k, Array.isArray(x) ? x.join("\\") : String(x)] as [string, string]]));
}

function votes(v: unknown): { rule: string; value: string | null }[] {
  return Array.isArray(v) ? v.map(obj).flatMap((x) => (text(x.rule) ? [{ rule: x.rule as string, value: text(x.value) }] : [])) : [];
}

/** One line from the engine's evidence door (record 48 R1), read leniently: a field it does not name stays empty. */
export function lineOf(axis: string, raw: Json): AxisLine {
  const m = raw.model === undefined || raw.model === null ? null : obj(raw.model);
  const value = axisValue(raw.value);
  const words = raw.words === null || raw.matched === null ? null : raw.words !== undefined ? texts(raw.words) : raw.matched !== undefined ? texts(raw.matched) : [];
  return {
    axis,
    value: value === undefined ? null : value,
    flags: texts(raw.flags ?? raw.flag),
    rule_set: text(raw.rule_set),
    rule: text(raw.rule),
    clause: text(raw.clause) ?? text(raw.held),
    reads: pairs(raw.reads ?? raw.header ?? raw.headers),
    votes: votes(raw.votes),
    words,
    model: m ? { value: text(m.value), p: num(m.p), weighed: texts(m.weighed ?? m.features ?? m.top) } : null,
    confidence: num(raw.confidence),
    agree: typeof raw.agree === "boolean" ? raw.agree : null,
  };
}

/** The engine's short names for the header fields a reader is shown (its reader's CORE and MORE). */
export const HEADER_WORDS: Record<string, string> = {
  repetition_time: "TR",
  echo_time: "TE",
  inversion_time: "TI",
  flip_angle: "flip",
  text_sequence_name: "sequence",
  image_type: "image type",
  scanning_sequence: "scanning sequence",
  sequence_variant: "sequence variant",
  scan_options: "scan options",
  mr_acquisition_type: "acquisition",
  echo_train_length: "echo train",
  orientation: "orientation",
  n_slices: "slices",
};

/**
 * One axis of the why door (GET /api/campaigns/{id}/items/{item}/why, record
 * 48 R1): `decided` the rule that carried the value, its clause, what the
 * clause reads (fields, flags) and the header values among them, the words
 * it matched at detail quasi; `voted` the other rules; `s1` System 1's
 * values with their probability where it asked. `agree` is whether System
 * 1's item lists the axis among those both systems agree on, null where it
 * did not ask.
 */
export function whyLine(raw: Json, asked: Json | null): AxisLine {
  const axis = text(raw.axis) ?? "";
  const d = raw.decided && typeof raw.decided === "object" ? obj(raw.decided) : null;
  const reads = d ? obj(d.reads) : {};
  const header = pairs(d?.header).map(([k, v]) => [HEADER_WORDS[k] ?? k.replace(/_/g, " "), v] as [string, string]);
  const s1 = Array.isArray(raw.s1) ? raw.s1.map(obj) : [];
  const top = s1[0] ?? null;
  const value = axisValue(raw.value);
  const setBy = obj(raw.set_by);
  const byWhom = text(setBy.kind) && setBy.kind !== "rule" ? `a ${setBy.kind as string}'s decision` : null;
  const voted = Array.isArray(raw.voted) ? raw.voted.map(obj).filter((v) => v.restates !== true) : [];
  return {
    axis,
    value: value === undefined ? null : value,
    flags: texts(reads.flags),
    rule_set: d ? text(d.rule_set) : null,
    rule: d ? text(d.rule) : byWhom,
    clause: d && d.clause !== null && d.clause !== undefined ? `clause ${String(d.clause)}` : null,
    reads: header,
    votes: [...(d && text(d.rule) ? [{ rule: `${text(d.rule_set) ? `${d.rule_set as string}/` : ""}${d.rule as string}`, value: typeof value === "string" ? value : null }] : []), ...voted.flatMap((v) => (text(v.rule) ? [{ rule: `${text(v.rule_set) ? `${v.rule_set as string}/` : ""}${v.rule as string}`, value: text(v.value) }] : []))],
    words: d && d.matched !== undefined ? texts(d.matched) : null,
    model: top ? { value: text(top.value), p: num(top.p), weighed: [] } : null,
    confidence: num(raw.confidence),
    agree: asked ? texts(asked.agree).includes(axis) : null,
  };
}

/** A legal candidate from the evidence, or null; illegal or odd ones are never drawn (record 45 R5). */
function candidateOf(raw: unknown, axes: string[]): AskedCandidate | null {
  const r = obj(raw);
  if (r.legal === false) return null;
  const p = num(r.p);
  if (p === null || p < 0 || p > 1) return null;
  const values: Record<string, AxisValue> = {};
  for (const [axis, v] of Object.entries(obj(r.values))) {
    const x = axisValue(v);
    if (x === undefined) return null;
    values[axis] = x;
  }
  if (Object.keys(values).length === 0 || axes.some((a) => !(a in values))) return null;
  return { values, p };
}

/**
 * The engine's reading of one campaign item (record 48 R1's evidence door),
 * read leniently: `lines` as a list of {axis, ...} or `axes` as {axis: {...}},
 * candidates as classify.asked carries them, and a `suggestion` where the
 * engine names one.
 */
export function readingOf(raw: Json): Reading {
  const asked = raw.asked && typeof raw.asked === "object" && !Array.isArray(raw.asked) ? obj(raw.asked) : null;
  const lines: AxisLine[] = [];
  const whyShape = Array.isArray(raw.axes) && raw.axes.some((a) => a && typeof a === "object");
  if (whyShape) for (const a of (raw.axes as unknown[]).map(obj)) if (text(a.axis)) lines.push(whyLine(a, asked));
  if (Array.isArray(raw.lines)) for (const l of raw.lines.map(obj)) if (text(l.axis)) lines.push(lineOf(l.axis as string, l));
  const perAxis = raw.axes && typeof raw.axes === "object" && !Array.isArray(raw.axes) ? obj(raw.axes) : {};
  for (const [axis, l] of Object.entries(perAxis)) if (!lines.some((x) => x.axis === axis)) lines.push(lineOf(axis, obj(l)));
  const named = whyShape ? lines.map((l) => l.axis) : Array.isArray(raw.axes) ? texts(raw.axes) : Array.isArray(raw.asked) ? texts(raw.asked) : lines.map((l) => l.axis);
  const rawCandidates = Array.isArray(raw.candidates) ? raw.candidates : asked && Array.isArray(asked.candidates) ? asked.candidates : [];
  // a candidate names the axes System 1 asked about, which may be fewer than the stack's
  const candidates = rawCandidates.flatMap((c) => candidateOf(c, []) ?? []).sort((a, b) => b.p - a.p);
  const s = raw.suggestion !== undefined ? raw.suggestion : raw.suggested;
  let suggested: Record<string, AxisValue> | null = null;
  let suggestedOne: string | null = null;
  if (typeof s === "string" && s !== "") suggestedOne = s;
  else if (s && typeof s === "object" && !Array.isArray(s)) {
    suggested = {};
    for (const [axis, v] of Object.entries(obj(obj(s).values ?? s))) {
      const x = axisValue(v);
      if (x !== undefined) suggested[axis] = x;
    }
  }
  const worth = obj(raw.worth);
  const header = pairs(raw.header).map(([k, v]) => [HEADER_WORDS[k] ?? k.replace(/_/g, " "), v] as [string, string]);
  const file = fileOf(raw);
  // a sealed sample's item is read blind: no classification at all, whatever came with it; the pictures, the header and its text stay
  if (raw.blind === true) return blindReading({ item: num(raw.item) ?? num(raw.item_id), stack: num(raw.stack) ?? num(raw.stack_id), axes: named, lines, candidates: [], suggested: null, value: null, batch: null, header, ...file }, null, named);
  return {
    header,
    ...file,
    item: num(raw.item) ?? num(raw.item_id),
    stack: num(raw.stack) ?? num(raw.stack_id),
    axes: named,
    lines,
    candidates,
    suggested,
    suggestedOne,
    value: num(raw.value) ?? (num(worth.confidence) !== null ? 1 - (worth.confidence as number) + (worth.disagree === true ? 1 : 0) : null),
    batch: text(raw.batch) ?? (num(raw.batch) !== null ? String(raw.batch) : null),
  };
}

/**
 * A reading made blind (an item of a sealed sample, by the door's mark or the
 * campaign's): no classification of any kind, not the values in force, the
 * deciding rules, the votes, the words, the line's text, who set it, System
 * 1's word or a suggestion; only the stack's raw header values stay, beside
 * the pictures. The rater answers from an empty form.
 */
export function blindReading(r: Reading | null, stack: number | null, axes: string[]): Reading {
  const file = r ? { ...(r.texts ? { texts: r.texts } : {}), ...(r.physics ? { physics: r.physics } : {}), ...(r.headerDoor ? { headerDoor: r.headerDoor } : {}) } : {};
  return { item: r?.item ?? null, stack: r?.stack ?? stack, axes: r?.axes ?? axes, lines: [], candidates: [], suggested: null, suggestedOne: null, value: null, batch: null, blind: true, header: r?.header ?? [], ...file };
}

/**
 * What the file says of itself, from the why door (record 48, after the
 * first real read): the header's text fields, the physics, and the path of
 * the whole-header door. Blind hides NILS's answers, never the file, so a
 * blind item keeps all three. A field the door does not send stays absent.
 */
export function fileOf(raw: Json): Pick<Reading, "texts" | "physics" | "headerDoor"> {
  const out: Pick<Reading, "texts" | "physics" | "headerDoor"> = {};
  if (raw.texts && typeof raw.texts === "object" && !Array.isArray(raw.texts)) {
    const t: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.texts as Json)) {
      if (typeof v === "string" && v.trim() !== "") t[k] = v;
      else if (Array.isArray(v) && v.length > 0) t[k] = v.map(String).join("\\");
      else if (typeof v === "number") t[k] = String(v);
    }
    out.texts = t;
  }
  if (raw.physics && typeof raw.physics === "object" && !Array.isArray(raw.physics)) {
    const p: Record<string, string | number | (string | number)[]> = {};
    for (const [k, v] of Object.entries(raw.physics as Json)) {
      if ((typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v !== "")) p[k] = v;
      else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" || typeof x === "string")) p[k] = v as (string | number)[];
    }
    out.physics = p;
  }
  // a door on this engine's own API, never elsewhere
  if (typeof raw.header_door === "string" && raw.header_door.startsWith("/api/")) out.headerDoor = raw.header_door;
  return out;
}

// ---------------------------------------------------------------- the file's text and physics

/** The text fields a reader reads first, in order, with their short names; a sequence name and its variant share a line. */
const TEXT_FIRST: [string, string][] = [
  ["series_description", "series"],
  ["protocol_name", "protocol"],
  ["sequence_name", "sequence"],
  ["scanning_sequence", "scanning"],
  ["image_type", "image type"],
];

/** Every other text field's short name; a field not named here is shown by its own name. */
const TEXT_MORE: Record<string, string> = {
  body_part_examined: "body part",
  series_comments: "series comments",
  image_comments: "image comments",
  derivation_description: "derivation",
  study_description: "study",
  contrast_bolus_agent: "contrast agent",
  contrast_bolus_route: "contrast route",
  angio_flag: "angio",
};

/** The physics a reader reads first, as a line: the timing, then the field. */
const PHYSICS_FIRST: [string, string, string][] = [
  ["repetition_time", "TR", ""],
  ["echo_time", "TE", ""],
  ["inversion_time", "TI", ""],
  ["flip_angle", "flip", ""],
  ["echo_train_length", "ETL", ""],
  ["diffusion_b_value", "b", ""],
  ["dwi_b_values", "b", ""],
  ["pixel_bandwidth", "bw", ""],
  ["magnetic_field_strength", "", "T"],
];

/** The physics a reader reads second, as a line: the scanner and the geometry. */
const PHYSICS_SECOND = ["manufacturer", "manufacturer_model_name", "slice_thickness", "spacing_between_slices", "rows", "columns", "acquisition_matrix", "pixel_spacing", "orientation", "n_slices", "n_instances"];

const shortNum = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
const physWords = (v: string | number | (string | number)[]) => (Array.isArray(v) ? v.map((x) => (typeof x === "number" ? shortNum(x) : x)).join("/") : typeof v === "number" ? shortNum(v) : v);

/** One line of the header block: its short name, what it says, and the whole of it for a hover. */
export interface HeaderLine {
  key: string;
  label: string;
  value: string;
}

/**
 * The header block's lines (record 48 "one screen"): the text fields a
 * reader reads first (the sequence name with its variant, the scanning
 * sequence with the acquisition type and the options); the other text
 * fields on one line;
 * then the physics on two lines, the timing and field first, the scanner and
 * geometry second, and anything else the door sent on a third. Absent fields
 * leave no line.
 */
export function headerLines(texts: Record<string, string> = {}, physics: Record<string, string | number | (string | number)[]> = {}): HeaderLine[] {
  const out: HeaderLine[] = [];
  for (const [k, label] of TEXT_FIRST) {
    if (k === "sequence_name") {
      const seq = [texts.sequence_name, texts.sequence_variant].filter((x) => x !== undefined && x !== "");
      if (seq.length > 0) out.push({ key: k, label, value: seq.join(" · ") });
      continue;
    }
    // the scanning sequence, the acquisition type and the scan options share a line
    if (k === "scanning_sequence") {
      const scan = [texts.scanning_sequence, texts.mr_acquisition_type, texts.scan_options !== undefined ? `options ${texts.scan_options}` : undefined].filter((x) => x !== undefined && x !== "");
      if (scan.length > 0) out.push({ key: k, label, value: scan.join(" · ") });
      continue;
    }
    if (texts[k] !== undefined) out.push({ key: k, label, value: texts[k] });
  }
  const shown = new Set([...TEXT_FIRST.map(([k]) => k), "sequence_variant", "mr_acquisition_type", "scan_options"]);
  const more = Object.entries(texts).filter(([k]) => !shown.has(k));
  if (more.length > 0) out.push({ key: "texts", label: "more", value: more.map(([k, v]) => `${TEXT_MORE[k] ?? k.replace(/_/g, " ")} ${v}`).join(" · ") });
  const first = PHYSICS_FIRST.filter(([k]) => physics[k] !== undefined).map(([k, name, unit]) => `${name ? `${name} ` : ""}${physWords(physics[k])}${unit}`);
  if (first.length > 0) out.push({ key: "physics", label: "physics", value: first.join("  ") });
  const has = (k: string) => physics[k] !== undefined;
  const second: string[] = [];
  const scanner = ["manufacturer", "manufacturer_model_name"].filter(has).map((k) => physWords(physics[k]));
  if (scanner.length > 0) second.push(scanner.join(" "));
  const slices = ["slice_thickness", "spacing_between_slices"].filter(has).map((k) => physWords(physics[k]));
  if (slices.length > 0) second.push(`${slices.join("/")} mm`);
  if (has("rows") && has("columns")) second.push(`${physWords(physics.columns)}x${physWords(physics.rows)}`);
  if (has("acquisition_matrix")) second.push(`matrix ${physWords(physics.acquisition_matrix)}`);
  if (has("pixel_spacing")) second.push(`px ${physWords(physics.pixel_spacing)}`);
  if (has("orientation")) second.push(physWords(physics.orientation));
  if (has("n_slices")) second.push(`${physWords(physics.n_slices)} slices`);
  else if (has("n_instances")) second.push(`${physWords(physics.n_instances)} files`);
  if (second.length > 0) out.push({ key: "scanner", label: "scanner", value: second.join(" · ") });
  const named = new Set([...PHYSICS_FIRST.map(([k]) => k), ...PHYSICS_SECOND]);
  const rest = Object.entries(physics).filter(([k]) => !named.has(k));
  if (rest.length > 0) out.push({ key: "physics_more", label: "more", value: rest.map(([k, v]) => `${k.replace(/_/g, " ")} ${physWords(v)}`).join(" · ") });
  return out;
}

// ---------------------------------------------------------------- the derived axes

/**
 * A partial answer as the derive door takes it (record 48): the asked axes
 * chosen so far, each as the answer would send it (none as null, can't tell
 * as the question's word); an axis not chosen yet is left out, and the
 * engine takes it as can't tell. Null where nothing is chosen.
 */
export function deriveValue(q: Question, g: Given): Record<string, string | string[] | null> | null {
  if (q.kind !== "axes" || g.kind !== "values") return null;
  const out: Record<string, string | string[] | null> = {};
  for (const axis of answeredAxes(q)) {
    const v = g.values[axis];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[axis] = v;
  }
  return out;
}

/** The derive door's answer, read leniently: each axis a value, a set, none or can't tell. */
export function derivedOf(raw: unknown): Derived | null {
  const r = obj(raw).derived;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const d = r as Json;
  const out: Derived = {};
  for (const [axis, v] of Object.entries(d)) {
    if (v === null || typeof v === "string") out[axis] = v;
    else if (Array.isArray(v)) out[axis] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

/** The short names the derived line gives its axes. */
const DERIVED_WORDS: Record<string, string> = { directory_type: "dir" };
/** The order the derived line says them in, where the question does not name one. */
const DERIVED_ORDER = ["directory_type", "disposition", "convertible", "role", "quality"];

/**
 * The derived axes in one line, as the question names them: `derived: dir
 * anat · disposition acquisition · convertible yes · role t1w · quality
 * none`; can't tell is `?`, none or an empty set is none.
 */
export function derivedWords(d: Derived, q: Question | null = null, cantTell = "cant_tell"): string {
  const named = q ? derivedAxes(q) : [];
  const order = [...(named.length > 0 ? named : DERIVED_ORDER).filter((a) => a in d), ...Object.keys(d).filter((a) => !(named.length > 0 ? named : DERIVED_ORDER).includes(a))];
  const word = q ? (cantTellOf(q) ?? cantTell) : cantTell;
  const said = order.map((axis) => {
    const v = d[axis];
    const w = v === null || (Array.isArray(v) && v.length === 0) ? "none" : v === word || v === "cant_tell" ? "?" : Array.isArray(v) ? v.map((x) => (x === word ? "?" : x)).join("+") : v;
    return `${DERIVED_WORDS[axis] ?? axis.replace(/_/g, " ")} ${w}`;
  });
  return `derived: ${said.join(" · ")}`;
}

/** The explain door's axis rows (GET /api/explain/{stack}), as far as it goes. */
export interface ExplainRows {
  axes: { axis: string; value: string | null; confidence?: number; evidence?: { rule_set: string; rule: string; source: string; matched: string | null; value?: string | null }[] | null }[];
}

/** Header fields a rule reads, as the explain door names its sources; anything else a rule matched is words. */
const HEADER = /^(tr|te|ti|flip|flip ?angle|repetition|echo|inversion|scanning ?sequence|sequence ?(name|variant)|image ?type|mr ?acquisition ?type|b ?value|slice ?thickness|contrast|modality|manufacturer|\(?[0-9a-f]{4},[0-9a-f]{4}\)?)/iu;

/**
 * A reading from what an engine before record 48 serves: a classify.asked
 * item's evidence (the candidates, both systems, where they agree) and the
 * explain door's rows (the rule, what it read, what it matched). Flags and
 * clauses are the new door's; this reads what is there.
 */
export function readingFromAsked(evidence: Json | null, explain: ExplainRows | null, stack: number | null, askedAxes: string[]): Reading {
  const ev = obj(evidence);
  const axes = texts(ev.axes).length > 0 ? texts(ev.axes) : askedAxes;
  const systems = obj(ev.systems);
  const rulesDoc = obj(systems.rules);
  const perAxis = rulesDoc.axes && typeof rulesDoc.axes === "object" ? obj(rulesDoc.axes) : {};
  const model = obj(systems.model);
  const modelP = obj(model.p);
  const agree = texts(ev.agree);
  const all = [...new Set([...axes, ...askedAxes, ...(explain?.axes ?? []).map((a) => a.axis)])].filter((a) => askedAxes.length === 0 || askedAxes.includes(a));
  const lines = all.map((axis): AxisLine => {
    const r = obj(perAxis[axis]);
    const x = explain?.axes.find((a) => a.axis === axis) ?? null;
    const rows = x?.evidence ?? [];
    const top = Object.entries(obj(modelP[axis])).flatMap(([v, p]) => (typeof p === "number" ? [[v, p] as const] : [])).sort((a, b) => b[1] - a[1])[0];
    const reads: [string, string][] = [];
    const words: string[] = [];
    for (const e of rows) {
      if (!e.matched) continue;
      if (HEADER.test(e.source)) reads.push([e.source, e.matched]);
      else if (!words.includes(e.matched)) words.push(e.matched);
    }
    const decided = rows[0] ?? null;
    const rulesValue = r.value !== undefined ? axisValue(r.value) : undefined;
    const value = rulesValue !== undefined ? rulesValue : (x?.value ?? null);
    return {
      axis,
      value,
      flags: texts(r.flags),
      rule_set: text(r.rule_set) ?? decided?.rule_set ?? null,
      rule: text(r.rule) ?? decided?.rule ?? null,
      clause: text(r.clause),
      reads,
      votes: votes(r.votes).length > 0 ? votes(r.votes) : rows.map((e) => ({ rule: e.rule_set ? `${e.rule_set}/${e.rule}` : e.rule, value: e.value ?? null })),
      words: rows.length > 0 || words.length > 0 ? words : null,
      model: top ? { value: top[0], p: top[1], weighed: [] } : null,
      confidence: x?.confidence ?? null,
      // where the item lists the axes both systems agree on, any other asked axis is a disagreement
      agree: agree.includes(axis) ? true : Array.isArray(ev.agree) && axes.includes(axis) ? false : top && typeof value === "string" ? top[0] === value : null,
    };
  });
  const candidates = (Array.isArray(ev.candidates) ? ev.candidates : []).flatMap((c) => candidateOf(c, axes) ?? []).sort((a, b) => b.p - a.p);
  return { item: null, stack, axes: all, lines, candidates, suggested: null, value: null, batch: null };
}

// ---------------------------------------------------------------- the suggestion

/** The answer filled in, and why. */
export interface Suggestion {
  /** The values filled in, by axis: the ones both systems agree on. */
  values: Record<string, AxisValue>;
  /** The axes both systems agree on, filled in. */
  agreed: string[];
  /** The axes they differ on, left for the person; the candidates show. */
  differ: string[];
  /** The legal candidates shown where they differ, most probable first, at most four. */
  offered: AskedCandidate[];
  /** The first candidate's probability, where there is one. */
  p: number | null;
}

/** The axes a question asks the rater: a derived axis (record 48) is the engine's to compute, never asked. */
export function askedAxes(q: Question): string[] {
  return answeredAxes(q);
}

/** How sure a lone candidate must be to be filled in when no rule speaks to its axis. */
const SURE = 0.9;

export { CANDIDATE_KEYS };

/** Whether a value may stand in the question's answer: one of its listed values, where it lists them. */
function allowed(q: Question, axis: string, v: AxisValue): boolean {
  const list = axisValues(q, axis);
  if (list.length === 0 || v === null) return true;
  return (Array.isArray(v) ? v : [v]).every((x) => list.includes(x));
}

const same = (a: AxisValue | undefined, b: AxisValue | undefined) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function norm(v: AxisValue | undefined): string[] | string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.length === 0 ? null : [...v].sort();
  return v;
}

/**
 * The suggestion for an item: the engine's where it names one; else the
 * first legal candidate's values on the axes the two systems agree on; else
 * the rules' value on an axis System 1 does not contradict. Only values the
 * question allows are filled in, and never a combination the pack forbids.
 */
export function suggestionOf(q: Question, r: Reading | null): Suggestion | null {
  // a blind item has nothing filled in: its answer measures the model, so nothing may lead it
  if (!r || r.blind || (q.kind !== "axis" && q.kind !== "axes")) return null;
  const axes = askedAxes(q);
  // the candidates as the question asks them: every asked axis named, one per answer to it, most probable first
  const fit: AskedCandidate[] = [];
  for (const c of r.candidates) {
    if (!axes.every((a) => a in c.values)) continue;
    const values: Record<string, AxisValue> = {};
    for (const a of axes) values[a] = c.values[a];
    const had = fit.find((f) => axes.every((a) => same(f.values[a], values[a])));
    if (had) had.p = Math.round((had.p + c.p) * 1e6) / 1e6;
    else fit.push({ values, p: c.p });
  }
  fit.sort((a, b) => b.p - a.p);
  const top = fit[0] ?? null;
  const values: Record<string, AxisValue> = {};
  const agreed: string[] = [];
  const differ: string[] = [];
  for (const axis of axes) {
    const line = r.lines.find((l) => l.axis === axis) ?? null;
    const cand = top && axis in top.values ? top.values[axis] : undefined;
    let v: AxisValue | undefined;
    if (r.suggested && axis in r.suggested) v = r.suggested[axis];
    else if (q.kind === "axis" && r.suggestedOne) v = r.suggestedOne;
    else if (line?.agree === false) v = undefined;
    else if (cand !== undefined && line?.agree === true) v = cand;
    else if (cand !== undefined && line && line.value !== null && same(cand, line.value)) v = cand;
    else if (cand !== undefined && !line && top!.p >= SURE) v = cand;
    // the rules alone, where System 1 has not spoken
    else if (cand === undefined && line && line.value !== null && line.model === null) v = line.value;
    if (v !== undefined && allowed(q, axis, v)) {
      values[axis] = v;
      agreed.push(axis);
    } else differ.push(axis);
  }
  // a combination the pack forbids is never filled in: the differing axes are left open
  const g = givenOf(q, { values });
  if (g && illegal(q, g)) return { values: {}, agreed: [], differ: axes, offered: fit.slice(0, CANDIDATE_KEYS.length), p: top?.p ?? null };
  if (agreed.length === 0 && differ.length === 0) return null;
  return { values, agreed, differ, offered: differ.length > 0 ? fit.slice(0, CANDIDATE_KEYS.length) : [], p: top?.p ?? null };
}

/** The given answer a suggestion fills in: an axis's value, or an axes answer with the agreed axes set (none for an empty set). */
export function givenOf(q: Question, s: Pick<Suggestion, "values"> | null): Given | null {
  if (!s) return null;
  if (q.kind === "axis" && q.axis) {
    const v = s.values[q.axis];
    return typeof v === "string" ? { kind: "value", value: v } : { kind: "value", value: "" };
  }
  if (q.kind === "axes") {
    const values: Record<string, string | string[] | null> = {};
    for (const [axis, v] of Object.entries(s.values)) values[axis] = Array.isArray(v) && v.length === 0 ? null : v;
    return { kind: "values", values };
  }
  return null;
}

/** A candidate as a given answer, every asked axis set. */
export function givenOfCandidate(q: Question, c: AskedCandidate): Given | null {
  const values: Record<string, AxisValue> = {};
  for (const axis of askedAxes(q)) values[axis] = c.values[axis] ?? null;
  return givenOf(q, { values });
}

/** How many asked axes the answer changed from what was filled in; null when nothing was. */
export function changesOf(q: Question, suggested: Given | null, final: Given): number | null {
  if (!suggested) return null;
  const at = (g: Given, axis: string): AxisValue | undefined => (g.kind === "value" ? g.value || undefined : g.kind === "values" ? (g.values[axis] === "" ? undefined : g.values[axis]) : undefined);
  return askedAxes(q).filter((axis) => !same(at(suggested, axis), at(final, axis))).length;
}

/**
 * The suggestion as an answer's value would say it, for the engine to keep
 * beside the answer: the values filled in where every axis is, else the first
 * candidate shown; null where nothing was suggested whole.
 */
export function suggestedValue(q: Question, s: Suggestion | null): string | Record<string, AxisValue> | null {
  if (!s) return null;
  const axes = askedAxes(q);
  const whole = s.differ.length === 0 ? s.values : (s.offered[0]?.values ?? null);
  if (!whole || axes.some((a) => !(a in whole))) return null;
  if (q.kind === "axis" && q.axis) return typeof whole[q.axis] === "string" ? (whole[q.axis] as string) : null;
  const out: Record<string, AxisValue> = {};
  for (const a of axes) out[a] = Array.isArray(whole[a]) && (whole[a] as string[]).length === 0 ? null : whole[a];
  return out;
}

/** What an answer's changes are counted against: the suggestion whole, as the engine is told it. */
export function baselineOf(q: Question, s: Suggestion | null): Given | null {
  const v = suggestedValue(q, s);
  if (v === null) return null;
  return typeof v === "string" ? { kind: "value", value: v } : givenOf(q, { values: v });
}

/** The shown candidate the answer now matches, if any. */
export function chosenCandidate(q: Question, offered: AskedCandidate[], g: Given): AskedCandidate | null {
  return offered.find((c) => changesOf(q, givenOfCandidate(q, c), g) === 0) ?? null;
}

/** Whether every asked axis is filled in, so Enter alone answers. */
export function complete(q: Question, g: Given): boolean {
  if (g.kind === "value") return g.value !== "";
  if (g.kind === "values") return askedAxes(q).every((a) => a in g.values && g.values[a] !== "" && !(Array.isArray(g.values[a]) && (g.values[a] as string[]).length === 0));
  return false;
}

/** The suggestion in words, for the line above the rows. */
export function suggestionWords(s: Suggestion): string {
  if (s.differ.length === 0) return `Rules and System 1 agree${s.p !== null ? ` · p ${s.p.toFixed(2)}` : ""}. Enter confirms.`;
  if (s.agreed.length === 0) return `They differ on ${s.differ.join(", ")}: choose one below.`;
  return `They agree on ${s.agreed.join(", ")} and differ on ${s.differ.join(", ")}: choose one below.`;
}

// ---------------------------------------------------------------- the line in words

const valueWords = (v: AxisValue) => (v === null ? "no value" : Array.isArray(v) ? (v.length > 0 ? v.join("+") : "none") : v);

/** The short line: value, then what decided it, most telling first. */
export function lineWords(l: AxisLine): { value: string; why: string[] } {
  const why: string[] = [];
  if (l.flags.length > 0) why.push(`flags ${l.flags.join(", ")}`);
  // the clause's own words where they say more than the header values that follow
  if (l.rule) why.push(`rule ${l.rule}${l.clause && l.reads.length === 0 ? ` (${l.clause})` : ""}`);
  if (l.reads.length > 0) why.push(l.reads.map(([k, v]) => `${k} ${v}`).join(" "));
  if (l.words && l.words.length > 0) why.push(`“${l.words.join("”, “")}”`);
  const others = l.votes.filter((v) => v.rule !== l.rule && v.rule !== `${l.rule_set}/${l.rule}`);
  if (others.length > 0) why.push(`${others.length} more ${others.length === 1 ? "vote" : "votes"}`);
  if (l.model && l.model.value !== null) why.push(`System 1 ${l.model.value}${l.model.p !== null ? ` ${l.model.p.toFixed(2)}` : ""}`);
  return { value: valueWords(l.value), why };
}

// ---------------------------------------------------------------- timing

/** When each item was first shown, so an answer knows how long it took. */
export class Clock {
  private shown = new Map<number, number>();
  /** The item is on screen; a second call keeps the first time. */
  start(item: number, at: number): void {
    if (!this.shown.has(item)) this.shown.set(item, at);
  }
  /** Seconds since the item was shown, and forget it; null when it was never started. */
  stop(item: number, at: number): number | null {
    const t = this.shown.get(item);
    if (t === undefined) return null;
    this.shown.delete(item);
    return Math.max(0, (at - t) / 1000);
  }
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The session's pace: each decision's seconds, and how many changed the suggestion. */
export interface Pace {
  seconds: number[];
  suggested: number;
  changed: number;
  /** Decisions taken by accepting a batch, each counted once. */
  batched: number;
}

export const NO_PACE: Pace = { seconds: [], suggested: 0, changed: 0, batched: 0 };

export function paced(p: Pace, seconds: number | null, changes: number | null, n = 1): Pace {
  // a batch's time is split over its stacks, each its own decision
  const each = seconds === null ? [] : Array.from({ length: n }, () => seconds / n);
  return {
    seconds: [...p.seconds, ...each],
    suggested: p.suggested + (changes === null ? 0 : n),
    changed: p.changed + (changes !== null && changes > 0 ? 1 : 0),
    batched: p.batched + (n > 1 ? n : 0),
  };
}

export function paceWords(p: Pace): string {
  const n = p.seconds.length;
  if (n === 0) return "no decisions yet";
  const m = median(p.seconds) ?? 0;
  return `${n.toLocaleString("en-US")} decided · median ${m < 10 ? m.toFixed(1) : Math.round(m)} s`;
}

// ---------------------------------------------------------------- the order

export type Order = "value" | "position";

/**
 * The items the reader is likely to be handed next, for the pictures to be
 * ready: the engine's hint where the claim names one; else the open items
 * after this one, by value where the items carry it and the order is by
 * value, by position otherwise, less those this person already answered.
 */
export function upcoming(current: Item | null, items: (Item & { value?: number | null })[], done: Set<number>, order: Order, n = 2, hinted: number[] = []): number[] {
  const stacks: number[] = [];
  const add = (s: number | null | undefined) => {
    if (typeof s === "number" && s !== current?.stack_id && !stacks.includes(s) && stacks.length < n) stacks.push(s);
  };
  for (const s of hinted) add(s);
  const open = items.filter((i) => i.id !== current?.id && !done.has(i.id) && (i.state === "open" || i.state === "needs_adjudication") && i.stack_id !== null);
  const byValue = order === "value" && open.some((i) => typeof i.value === "number");
  const sorted = byValue ? [...open].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.position - b.position) : [...open].sort((a, b) => a.position - b.position);
  const after = byValue || !current ? sorted : [...sorted.filter((i) => i.position > current.position), ...sorted.filter((i) => i.position <= current.position)];
  for (const i of after) add(i.stack_id);
  return stacks;
}

/** How many entries the reader's caches keep: the readings and the stacks warmed. */
export const KEEP = 200;

/** Forget the oldest entries of a set or map past `keep`, in the order they were added. */
export function bound<K>(m: Set<K> | Map<K, unknown>, keep = KEEP): void {
  while (m.size > keep) {
    const first = m.keys().next();
    if (first.done) break;
    m.delete(first.value);
  }
}

/**
 * Warms the next stacks' pictures a few at a time: each stack once, the
 * newest wish first, and a stack no longer wanted is dropped from the queue
 * before it starts. The warming itself is given (the viewer's manifest and
 * first planes), so the scheduling is tested alone.
 */
export class Prefetcher {
  private warm: (stack: number) => Promise<unknown>;
  private at: number;
  private done = new Set<number>();
  private running = new Set<number>();
  private queue: number[] = [];
  /** The stacks warmed, in order, the last `keep` of them; for the tests and the walk. */
  readonly warmed: number[] = [];

  private keep: number;

  constructor(warm: (stack: number) => Promise<unknown>, atOnce = 2, keep = KEEP) {
    this.warm = warm;
    this.at = atOnce;
    this.keep = keep;
  }

  /** The stacks wanted now, most urgent first; anything queued and not wanted any more is dropped. */
  want(stacks: number[]): void {
    this.queue = stacks.filter((s) => !this.done.has(s) && !this.running.has(s));
    this.pump();
  }

  /** Whether a stack was warmed, or is being. */
  has(stack: number): boolean {
    return this.done.has(stack) || this.running.has(stack);
  }

  private pump(): void {
    while (this.running.size < this.at && this.queue.length > 0) {
      const s = this.queue.shift()!;
      this.running.add(s);
      this.warm(s)
        .catch(() => undefined)
        .finally(() => {
          this.running.delete(s);
          this.done.add(s);
          bound(this.done, this.keep);
          this.warmed.push(s);
          if (this.warmed.length > this.keep) this.warmed.shift();
          this.pump();
        });
    }
  }
}

// ---------------------------------------------------------------- batches

/** Like stacks the engine groups (the same deciding rules and header physics, the same answer suggested), offered as one move (record 48 R1). */
export interface Batch {
  key: string;
  /** What the stacks share, in a few words. */
  words: string;
  /** The answer suggested for every stack in it, by axis. */
  values: Record<string, AxisValue>;
  /** How many items the batch holds. */
  count: number;
  /** The items the door named, with their stacks where the campaign's items say them. */
  items: { item: number; stack: number | null }[];
}

/** The share of an accepted batch the engine holds back at random to be read alone (the door's default). */
export const HOLD_BACK = 0.1;

function signatureWords(sig: Json): string {
  const rules = Object.entries(obj(sig.rules)).map(([axis, r]) => `${axis} by ${String(r)}`);
  const header = pairs(sig.header).map(([k, v]) => `${HEADER_WORDS[k] ?? k.replace(/_/g, " ")} ${v}`);
  return [...header, ...rules].join(" · ");
}

/**
 * The batches door's answer ({groups: [{key, count, suggested, signature,
 * sample}]}), read leniently; `stackOf` names an item's stack from the
 * campaign's items, and `axis` is an axis question's, whose suggestion is
 * one value.
 */
export function batchesOf(raw: Json, stackOf: (item: number) => number | null = () => null, axis: string | null = null, blind: (item: number) => boolean = () => false): Batch[] {
  const list = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.batches) ? raw.batches : [];
  return list.map(obj).flatMap((b, i) => {
    const named = (Array.isArray(b.sample) ? b.sample : Array.isArray(b.items) ? b.items : []).flatMap((x) => {
      if (typeof x === "number") return [{ item: x, blind: blind(x) }];
      const o = obj(x);
      const item = num(o.item) ?? num(o.item_id) ?? num(o.id);
      return item === null ? [] : [{ item, blind: o.blind === true || blind(item) }];
    });
    // an item of a sealed sample is never in a batch, whatever a door says
    const ids = named.filter((i) => !i.blind).map((i) => i.item);
    const count = Math.max(0, (num(b.count) ?? named.length) - (named.length - ids.length));
    if (count === 0) return [];
    const values: Record<string, AxisValue> = {};
    const sg = b.suggested ?? b.values;
    if (typeof sg === "string" && axis) values[axis] = sg;
    else
      for (const [a, v] of Object.entries(obj(sg))) {
        const x = axisValue(v);
        if (x !== undefined) values[a] = x;
      }
    const key = text(b.key) ?? (num(b.key) !== null ? String(b.key) : `batch ${i + 1}`);
    const words = text(b.words) ?? (b.signature ? signatureWords(obj(b.signature)) : "") ?? key;
    return [{ key, words: words || key, values, count, items: ids.map((item) => ({ item, stack: stackOf(item) })) }];
  });
}

/**
 * What accepting a batch does. With nothing held by the person, the whole
 * batch is accepted and the engine holds back a tenth at random; where the
 * person held some of the shown ones back, only the shown others are named,
 * and the rest of the batch stays for a later move.
 */
export function acceptPlan(b: Batch, mine: Set<number>, share = HOLD_BACK): { items: number[] | null; n: number; drawn: number; read: number[] } {
  const read = b.items.filter((i) => mine.has(i.item)).map((i) => i.item);
  const items = read.length === 0 ? null : b.items.map((i) => i.item).filter((i) => !read.includes(i));
  const n = items === null ? b.count : items.length;
  const drawn = n > 1 ? Math.ceil(n * share) : 0;
  return { items, n, drawn, read };
}

export function planWords(p: { n: number; drawn: number; read: number[] }): string {
  const taking = p.n - p.drawn;
  const a = `${taking} ${taking === 1 ? "stack takes" : "stacks take"} the suggestion`;
  const held = p.drawn + p.read.length;
  return held === 0 ? `${a}.` : `${a}; ${held} held back to read one by one.`;
}

export type BatchAct = { kind: "accept" } | { kind: "back" } | { kind: "next" } | { kind: "keys" };

/** What a key does in the batch view: Enter accepts, `n` shows the next batch, `b` or Escape goes back to one by one. */
export function batchKey(key: string, inField: boolean): BatchAct | null {
  if (inField) return null;
  if (key === "Enter") return { kind: "accept" };
  if (key === "n" || key === "N") return { kind: "next" };
  if (key === "b" || key === "B" || key === "Escape") return { kind: "back" };
  if (key === "?") return { kind: "keys" };
  return null;
}

/** What the accept door answered ({accepted: [{item, answer, state}], held_back, refused}), read leniently. */
export function acceptedOf(raw: Json): { accepted: number; held: number[]; refused: number } {
  const accepted = Array.isArray(raw.accepted) ? raw.accepted.length : (num(raw.accepted) ?? 0);
  const heldRaw = Array.isArray(raw.held_back) ? raw.held_back : Array.isArray(raw.held) ? raw.held : [];
  const held = heldRaw.flatMap((x) => (typeof x === "number" ? [x] : []));
  return { accepted, held, refused: Array.isArray(raw.refused) ? raw.refused.length : 0 };
}

// ---------------------------------------------------------------- the raters' pace

export interface RaterStat {
  principal: string;
  decisions: number;
  median_seconds: number | null;
  /** The ninetieth percentile, where the engine gives it. */
  p90_seconds: number | null;
  /** Share of suggestions the rater changed, where the engine counts them. */
  changed: number | null;
  batched: number | null;
}

/** The stats door's answer: each rater's row, or the caller's own alone where the answers are blind to them. */
export interface RaterStats {
  raters: RaterStat[];
  /** Blind as the answers are: a rater reads their own row and no one else's, and no totals. */
  blind: boolean;
}

/** The stats door's per-rater rows, read leniently; the door's totals over every rater are never read. */
export function statsOf(raw: Json): RaterStats {
  const list = Array.isArray(raw.raters) ? raw.raters : Array.isArray(raw.readers) ? raw.readers : Array.isArray(raw.by_rater) ? raw.by_rater : [];
  const raters = list.map(obj).flatMap((r) => {
    const who = text(r.principal) ?? text(r.rater) ?? text(r.reader);
    if (!who) return [];
    const decisions = num(r.decisions) ?? num(r.answers) ?? 0;
    const suggested = num(r.suggested);
    const changedN = num(r.changed);
    const changed = num(r.share_changed) ?? num(r.changed_share) ?? num(r.change_rate) ?? (changedN !== null && suggested ? changedN / suggested : null);
    return [{ principal: who, decisions, median_seconds: num(r.median_seconds) ?? num(r.seconds_median) ?? num(r.median), p90_seconds: num(r.p90_seconds), changed, batched: num(r.batched) }];
  });
  return { raters, blind: raw.blind === true };
}
