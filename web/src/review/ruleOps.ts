// SPDX-License-Identifier: AGPL-3.0-only
// The typed rule operations as forms (record 56, section 5.5): "for most
// part maybe it is programable (adding keyword, changn order, adding new item
// to axes and so on)". One form per operation of the patch contract, read
// from the contract's own schema: patch.schema.json beside this file is the
// engine's contracts/patch/v1/patch.schema.json (Apache-2.0), copied as it
// is. The schema says which operations there are, their fields, their types,
// which are required and what each means; this module adds only the words a
// person reads (a field's label, an operation's title) and which fields stand
// first. An operation is built as the contract writes it, with its scope, its
// reason and its evidence, and the engine checks it before anything runs.

import raw from "./patch.schema.json";

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** What a field holds, as the schema types it. */
export type FieldKind =
  | "text"
  | "words"
  | "strings"
  | "integer"
  | "number"
  | "boolean"
  | "choice"
  | "conditions"
  | "candidates"
  | "bids"
  | "order"
  | "json";

/** What a text field offers to choose from, read from the pack. */
export type Suggest = "axis" | "value" | "rule" | "set" | "field" | "role" | "pick" | "border" | "bucket" | null;

export interface FieldSpec {
  /** The key the contract writes. */
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** The schema's own description, for the field's "?". */
  help: string | null;
  options: string[];
  min: number | null;
  max: number | null;
  suggest: Suggest;
}

export type Family = "words" | "order" | "values" | "rules" | "picks";

export interface OpSpec {
  op: string;
  title: string;
  family: Family;
  /** The schema's description of the operation, for its "?". */
  help: string;
  /** The fields, the place (before, after, position) folded into one. */
  fields: FieldSpec[];
  /** Placed before or after another, or first or last. */
  place: boolean;
  /** The fields a person fills first; the rest fold under More. */
  front: string[];
  /** A pick operation is a pack edit only: its scope is the pack. */
  packOnly: boolean;
}

/** The families in the order the chooser shows them, in plain words. */
export const FAMILIES: { family: Family; words: string }[] = [
  { family: "words", words: "Words" },
  { family: "order", words: "Order" },
  { family: "values", words: "Values and names" },
  { family: "rules", words: "Rules" },
  { family: "picks", words: "Main scans" },
];

/** What each operation is called, the family it is in, and the fields that stand first. */
const OPS: Record<string, { title: string; family: Family; front: string[] }> = {
  add_words: { title: "Add words", family: "words", front: ["axis", "value", "words", "field"] },
  remove_words: { title: "Remove words", family: "words", front: ["axis", "value", "words", "field"] },
  move_rule: { title: "Move a rule", family: "order", front: ["rule", "set"] },
  move_set: { title: "Move a rule set", family: "order", front: ["set"] },
  set_priority: { title: "Change a priority", family: "order", front: ["axis", "value", "priority"] },
  add_value: { title: "Add a value", family: "values", front: ["axis", "value", "label", "family", "words", "bids"] },
  map_name: { title: "Change a name", family: "values", front: ["axis", "value", "bids", "label"] },
  add_rule: { title: "Add a rule", family: "rules", front: ["axis", "value", "nothing", "when"] },
  silence: { title: "Silence an axis", family: "rules", front: ["axis", "when"] },
  by_model: { title: "Hand an axis to its model", family: "rules", front: ["axis"] },
  set_candidates: { title: "Who competes for a role", family: "picks", front: ["role", "when", "unless"] },
  remove_border: { title: "Raise a border no more", family: "picks", front: ["border"] },
  set_near_tie: { title: "Decide near ties", family: "picks", front: ["order"] },
  set_runner_up_within: { title: "Near-tie margin", family: "picks", front: ["within"] },
};

/** A field's label in plain words. */
const LABELS: Record<string, string> = {
  axis: "Axis",
  value: "Value",
  words: "Words",
  field: "Field",
  rule: "Rule",
  set: "Rule set",
  priority: "Priority",
  label: "Label",
  family: "Family",
  description: "Description",
  terms: "Other names",
  aliases: "Earlier names",
  group: "Exclusion group",
  bids: "BIDS name",
  nothing: "Sets nothing",
  when: "When",
  unless: "Unless",
  confidence: "Confidence",
  why: "Its own why",
  pick: "Pick",
  role: "Role",
  border: "Border",
  order: "Order",
  within: "Within",
  bucket: "Bucket",
};

const SUGGEST: Record<string, Suggest> = { axis: "axis", value: "value", rule: "rule", set: "set", field: "field", role: "role", pick: "pick", border: "border", bucket: "bucket" };

/** Every field the operations share and the page asks for apart: where it applies, why, and where it came from. */
const SHARED = new Set(["op", "scope", "reason", "evidence"]);
const PLACE = new Set(["before", "after", "position"]);

/** The schema's description, its first sentence, for a "?". */
function firstSentence(text: unknown): string | null {
  const t = str(text);
  if (!t) return null;
  const at = t.search(/\.\s/u);
  return at < 0 ? t : t.slice(0, at + 1);
}

/** What a property is, by the schema's own types. */
function kindOf(name: string, p: Json): FieldKind {
  const ref = str(p.$ref);
  if (ref === "#/$defs/bids") return "bids";
  if (Array.isArray(p.oneOf)) {
    const alts = p.oneOf.filter(isObj);
    if (alts.some((a) => a.$ref === "#/$defs/condition")) return "conditions";
    if (alts.some((a) => a.type === "object" && a.minProperties === 2)) return "candidates";
    return "json";
  }
  if (Array.isArray(p.enum)) return "choice";
  if (p.type === "integer") return "integer";
  if (p.type === "number") return "number";
  if (p.type === "boolean") return "boolean";
  if (p.type === "string") return "text";
  if (p.type === "array" && isObj(p.items)) {
    if (p.items.type === "string") return name === "words" ? "words" : "strings";
    if (p.items.type === "object" && Array.isArray(p.items.required) && p.items.required.includes("of")) return "order";
  }
  return "json";
}

/** The operations of the contract, each as a form: read from the schema once. */
export function opsOf(schema: Json = raw as unknown as Json): OpSpec[] {
  const defs = isObj(schema.$defs) ? schema.$defs : {};
  const operation = isObj(defs.operation) ? defs.operation : {};
  const alts = Array.isArray(operation.oneOf) ? operation.oneOf.filter(isObj) : [];
  const out: OpSpec[] = [];
  for (const alt of alts) {
    const props = isObj(alt.properties) ? alt.properties : {};
    const op = isObj(props.op) ? str(props.op.const) : null;
    if (!op) continue;
    const required = new Set(Array.isArray(alt.required) ? alt.required.map(String) : []);
    const scope = isObj(props.scope) ? str(props.scope.description) : null;
    const known = OPS[op];
    const fields: FieldSpec[] = [];
    let place = false;
    for (const [name, value] of Object.entries(props)) {
      if (SHARED.has(name) || !isObj(value)) continue;
      if (PLACE.has(name)) {
        place = true;
        continue;
      }
      const kind = kindOf(name, value);
      fields.push({
        name,
        label: LABELS[name] ?? name.replace(/_/gu, " "),
        kind,
        required: required.has(name),
        help: firstSentence(value.description),
        options: Array.isArray(value.enum) ? value.enum.map(String) : [],
        min: typeof value.minimum === "number" ? value.minimum : null,
        max: typeof value.maximum === "number" ? value.maximum : null,
        suggest: kind === "text" ? (SUGGEST[name] ?? null) : null,
      });
    }
    const front = known ? known.front.filter((f) => fields.some((x) => x.name === f)) : fields.filter((f) => f.required).map((f) => f.name);
    out.push({
      op,
      title: known?.title ?? op.replace(/_/gu, " "),
      family: known?.family ?? "rules",
      help: firstSentence(alt.description) ?? "",
      fields,
      place,
      front,
      // the schema says it of the pick operations: their scope is the pack only
      packOnly: scope !== null && /^pack only/u.test(scope),
    });
  }
  return out;
}

/** The operations, read once. */
export const OP_SPECS: OpSpec[] = opsOf();

export function specOf(op: string): OpSpec | null {
  return OP_SPECS.find((s) => s.op === op) ?? null;
}

// ------------------------------------------------------------ the scope

/** Where an operation applies, as a person chooses it: the pack (everyone), a site, a dataset, a scanner, or a batch. */
export type ScopeKind = "pack" | "site" | "dataset" | "scanner" | "batch";

export interface ScopeChoice {
  kind: ScopeKind;
  /** The site's or dataset's name, the batch's id, or the scanner's key=value. */
  value: string;
}

export const SCOPE_KINDS: { kind: ScopeKind; words: string }[] = [
  { kind: "pack", words: "Everyone" },
  { kind: "site", words: "A site" },
  { kind: "dataset", words: "A dataset" },
  { kind: "scanner", words: "A scanner" },
  { kind: "batch", words: "A batch" },
];

/** The scope as the contract writes it, or why it is not one yet. */
export function scopeText(s: ScopeChoice): { text: string | null; why: string | null } {
  const v = s.value.trim();
  if (s.kind === "pack") return { text: "pack", why: null };
  if (v === "") return { text: null, why: `Name the ${s.kind}.` };
  if (s.kind === "batch") return /^\d+$/u.test(v) ? { text: `batch:${v}`, why: null } : { text: null, why: "A batch is named by its number." };
  if (s.kind === "scanner") {
    // manufacturer, model or station, each named key equal
    const parts = v.split(",").map((x) => x.trim()).filter(Boolean);
    const ok = parts.length > 0 && parts.every((x) => /^(manufacturer|model|station|batch)=.+$/u.test(x));
    return ok ? { text: `scanner:${parts.join(",")}`, why: null } : { text: null, why: "A scanner is named as manufacturer=, model= or station=." };
  }
  return { text: `${s.kind}:${v}`, why: null };
}

/** The scope in words, as a card says it: for everyone, or for one site, dataset, scanner or batch. */
export function scopeWords(scope: unknown): string {
  const s = str(scope) ?? "pack";
  if (s === "pack") return "for everyone";
  const at = s.indexOf(":");
  const kind = s.slice(0, at);
  const rest = s.slice(at + 1);
  if (kind === "dataset") return `for ${rest.includes(",") ? "datasets" : "dataset"} ${rest.split(",").join(", ")}`;
  if (kind === "scanner") return `for scanner ${rest.split(",").join(", ")}`;
  return `for ${kind} ${rest}`;
}

// ------------------------------------------------------------ a form's values

/** A condition of a rule or a silence, as a row of the form. */
export interface ConditionRow {
  not: boolean;
  kind: "words" | "tag" | "flag" | "axis";
  words: string;
  field: string;
  tag: string;
  cmp: "is" | "has" | "gt" | "ge" | "lt" | "le" | "eq" | "ne" | "between" | "present";
  value: string;
  value2: string;
  flag: string;
  axis: string;
  is: string;
}

export const NEW_CONDITION: ConditionRow = { not: false, kind: "tag", words: "", field: "", tag: "", cmp: "ge", value: "", value2: "", flag: "", axis: "", is: "" };

/** A candidate's condition (set_candidates): a value of an axis, or a field of the fingerprint against a number or a value. */
export interface CandidateRow {
  kind: "axis" | "tag";
  axis: string;
  is: string;
  tag: string;
  cmp: "is" | "lt" | "le" | "gt" | "ge";
  value: string;
}

export const NEW_CANDIDATE: CandidateRow = { kind: "axis", axis: "", is: "", tag: "", cmp: "is", value: "" };

/** A step of a near tie's order. */
export interface OrderRow {
  of: string;
  how: "prefer" | "avoid" | "lowest" | "highest";
  values: string;
  roles: string;
}

export const NEW_ORDER: OrderRow = { of: "", how: "prefer", values: "", roles: "" };

/** A value's BIDS name, in one of the contract's four shapes. */
export interface BidsValue {
  kind: "token" | "suffix" | "acq" | "entity";
  token: string;
  suffix: string;
  datatype: string;
  acq: string;
  entity: string;
}

export const NEW_BIDS: BidsValue = { kind: "token", token: "", suffix: "", datatype: "", acq: "", entity: "rec" };

export type FieldValue = string | boolean | ConditionRow[] | CandidateRow[] | OrderRow[] | BidsValue;

/** A form's state: the fields by name, and the place. */
export interface OpForm {
  op: string;
  values: Record<string, FieldValue>;
  place: { at: "none" | "before" | "after" | "first" | "last"; ref: string };
}

/** An empty form for an operation, a field's own default where the field has one. */
export function emptyForm(op: string): OpForm {
  const spec = specOf(op);
  const values: Record<string, FieldValue> = {};
  for (const f of spec?.fields ?? []) {
    if (f.kind === "boolean") values[f.name] = false;
    else if (f.kind === "conditions") values[f.name] = f.required ? [{ ...NEW_CONDITION }] : [];
    else if (f.kind === "candidates") values[f.name] = [];
    else if (f.kind === "order") values[f.name] = [{ ...NEW_ORDER }];
    else if (f.kind === "bids") values[f.name] = { ...NEW_BIDS };
    else values[f.name] = "";
  }
  return { op, values, place: { at: "none", ref: "" } };
}

/**
 * Words as a person types them: separated by commas or new lines, each
 * trimmed, unless it is quoted, which keeps its spaces (a leading space is
 * part of a word: " -k" is not "-k").
 */
export function wordsOf(text: string): string[] {
  const out: string[] = [];
  const re = /[ \t]*(?:"([^"]*)"[ \t]*|([^,\n]+))/gu;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) {
      if (m[1] !== "") out.push(m[1]);
    } else if (m[2] !== undefined) {
      const w = m[2].trim();
      if (w !== "") out.push(w);
    }
  }
  return out;
}

/** A value typed in a field of the fingerprint: a number where it reads as one. */
function scalar(v: string): string | number {
  const t = v.trim();
  return t !== "" && /^-?\d+(\.\d+)?$/u.test(t) ? Number(t) : t;
}

/** One value, or several separated by commas, as the contract takes an axis's values. */
function oneOrMany(v: string): string | string[] {
  const list = v.split(",").map((x) => x.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

/** A condition row as the contract writes it, or null where it is not filled. */
export function conditionOf(r: ConditionRow): Json | null {
  let c: Json | null = null;
  if (r.kind === "words") {
    const words = wordsOf(r.words);
    if (words.length > 0) c = r.field.trim() ? { words, field: r.field.trim() } : { words };
  } else if (r.kind === "tag") {
    const tag = r.tag.trim();
    if (tag !== "") {
      if (r.cmp === "present") c = { tag, present: true };
      else if (r.cmp === "between") {
        if (r.value.trim() !== "" && r.value2.trim() !== "") c = { tag, between: [scalar(r.value), scalar(r.value2)] };
      } else if (r.value.trim() !== "") c = { tag, [r.cmp]: scalar(r.value) };
    }
  } else if (r.kind === "flag") {
    if (r.flag.trim() !== "") c = { flag: r.flag.trim() };
  } else if (r.axis.trim() !== "" && r.is.trim() !== "") c = { axis: r.axis.trim(), is: oneOrMany(r.is) };
  if (c && r.not) return { not: c };
  return c;
}

/** A candidate's condition as the contract writes it, or null where it is not filled. */
export function candidateOf(r: CandidateRow): Json | null {
  if (r.kind === "axis") return r.axis.trim() !== "" && r.is.trim() !== "" ? { axis: r.axis.trim(), is: oneOrMany(r.is) } : null;
  if (r.tag.trim() === "" || r.value.trim() === "") return null;
  return { tag: r.tag.trim(), [r.cmp]: scalar(r.value) };
}

/** A near tie's step as the contract writes it, or null where it is not filled. */
export function orderOf(r: OrderRow): Json | null {
  const of = r.of.trim();
  if (of === "") return null;
  const roles = r.roles.split(",").map((x) => x.trim()).filter(Boolean);
  const step: Json = { of };
  if (r.how === "lowest" || r.how === "highest") step[r.how] = true;
  else {
    const values = r.values.split(",").map((x) => x.trim()).filter(Boolean);
    if (values.length === 0) return null;
    step[r.how] = values;
  }
  if (roles.length > 0) step.roles = roles;
  return step;
}

/** A BIDS name as the contract writes it, or null where it is not filled. */
export function bidsOf(b: BidsValue): string | Json | null {
  if (b.kind === "token") return b.token.trim() || null;
  if (b.kind === "acq") return b.acq.trim() ? { acq: b.acq.trim() } : null;
  if (b.kind === "entity") return b.token.trim() ? { entity: b.entity, token: b.token.trim() } : null;
  if (!b.suffix.trim()) return null;
  return b.datatype ? { suffix: b.suffix.trim(), datatype: b.datatype } : { suffix: b.suffix.trim() };
}

/** What a form says of a field, as the contract takes it, or undefined where it says nothing. */
function fieldOf(f: FieldSpec, v: FieldValue | undefined): unknown {
  if (v === undefined) return undefined;
  switch (f.kind) {
    case "boolean":
      return v === true ? true : undefined;
    case "words":
    case "strings": {
      const list = typeof v === "string" ? (f.kind === "words" ? wordsOf(v) : v.split(",").map((x) => x.trim()).filter(Boolean)) : [];
      return list.length > 0 ? list : undefined;
    }
    case "integer":
    case "number": {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
    case "conditions": {
      const list = (v as ConditionRow[]).map(conditionOf).filter((c): c is Json => c !== null);
      if (list.length === 0) return undefined;
      return list.length === 1 ? list[0] : list;
    }
    case "candidates": {
      const list = (v as CandidateRow[]).map(candidateOf).filter((c): c is Json => c !== null);
      return list.length > 0 ? list : undefined;
    }
    case "order": {
      const list = (v as OrderRow[]).map(orderOf).filter((c): c is Json => c !== null);
      return list;
    }
    case "bids":
      return bidsOf(v as BidsValue) ?? undefined;
    case "json": {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      try {
        return JSON.parse(v);
      } catch {
        return v.trim();
      }
    }
    default:
      return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  }
}

/** A built operation: as the contract writes it, or what is missing before it is one. */
export interface Built {
  op: Json | null;
  missing: string[];
}

/**
 * The operation a form says, with its scope, its reason and its evidence,
 * as the contract writes it; or the labels of what it still lacks. The
 * engine checks the rest.
 */
export function buildOp(form: OpForm, scope: ScopeChoice, reason: string, evidence: unknown): Built {
  const spec = specOf(form.op);
  if (!spec) return { op: null, missing: ["an operation"] };
  const op: Json = { op: spec.op };
  const missing: string[] = [];
  for (const f of spec.fields) {
    const v = fieldOf(f, form.values[f.name]);
    if (v === undefined) {
      if (f.required) missing.push(f.label.toLowerCase());
      continue;
    }
    op[f.name] = v;
  }
  // a word list is reached by its axis and value, or by a bucket in their place
  if ((spec.op === "add_words" || spec.op === "remove_words") && !op.bucket && !(op.axis && op.value)) missing.push("an axis and a value, or a bucket");
  if (spec.op === "add_rule" && !op.value && op.nothing !== true) missing.push("a value, or Sets nothing");
  // set_candidates with neither when nor unless takes the role's candidacy out, which the contract allows
  if (spec.place && form.place.at !== "none") {
    if (form.place.at === "first" || form.place.at === "last") op.position = form.place.at;
    else if (form.place.ref.trim() !== "") op[form.place.at] = form.place.ref.trim();
    else missing.push(`what it goes ${form.place.at}`);
  }
  const s = spec.packOnly ? { text: "pack", why: null } : scopeText(scope);
  if (s.why) missing.push(s.why.replace(/\.$/u, "").toLowerCase());
  else if (s.text) op.scope = s.text;
  const why = reason.trim();
  if (why === "") missing.push("why");
  else op.reason = why;
  op.evidence = evidence ?? "written on the Rules page";
  return missing.length > 0 ? { op: null, missing } : { op, missing: [] };
}

// ------------------------------------------------------------ an operation in words

const CMP: Record<string, string> = { is: "is", has: "has", gt: "above", ge: "at least", lt: "below", le: "at most", eq: "is", ne: "is not" };

const list = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(", ") : String(v ?? ""));
const quoted = (v: unknown): string => (Array.isArray(v) ? v.map((w) => `"${String(w)}"`).join(", ") : `"${String(v ?? "")}"`);

/** A condition in words: `te at least 200`, `provenance is Calibration`, `"mdc" in series_description`. */
export function conditionWords(c: unknown): string {
  if (!isObj(c)) return String(c ?? "");
  if (isObj(c.not)) return `not ${conditionWords(c.not)}`;
  if (c.words !== undefined) return `${quoted(c.words)}${str(c.field) ? ` in ${String(c.field)}` : ""}`;
  if (str(c.flag)) return `flag ${String(c.flag)}`;
  if (str(c.axis)) return `${String(c.axis)} is ${list(c.is).replace(/, ([^,]*)$/u, " or $1")}`;
  if (str(c.tag)) {
    if (c.present === true) return `${String(c.tag)} present`;
    if (Array.isArray(c.between)) return `${String(c.tag)} between ${String(c.between[0])} and ${String(c.between[1])}`;
    for (const k of Object.keys(CMP)) if (c[k] !== undefined) return `${String(c.tag)} ${CMP[k]} ${list(c[k])}`;
  }
  return JSON.stringify(c);
}

function conditionsWords(v: unknown): string {
  const all = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return all.map(conditionWords).join(" and ");
}

function placeWords(op: Json): string {
  if (str(op.before)) return ` before ${String(op.before)}`;
  if (str(op.after)) return ` after ${String(op.after)}`;
  if (op.position === "first") return ", first";
  if (op.position === "last") return ", last";
  return "";
}

function bidsWords(b: unknown): string {
  if (typeof b === "string") return b;
  if (!isObj(b)) return "";
  if (str(b.acq)) return `acq-${String(b.acq)}`;
  if (str(b.suffix)) return `${String(b.suffix)}${str(b.datatype) ? ` in ${String(b.datatype)}` : ""}`;
  if (str(b.entity)) return `${String(b.entity)}-${String(b.token ?? "")}`;
  return "";
}

function stepWords(s: unknown): string {
  if (!isObj(s)) return "";
  const of = String(s.of ?? "");
  const roles = Array.isArray(s.roles) && s.roles.length > 0 ? ` (${list(s.roles)})` : "";
  if (s.lowest === true) return `the lowest ${of}${roles}`;
  if (s.highest === true) return `the highest ${of}${roles}`;
  if (s.prefer !== undefined) return `${of} ${list(s.prefer)} first${roles}`;
  if (s.avoid !== undefined) return `${of} ${list(s.avoid)} last${roles}`;
  return of;
}

/** What one operation does, in a line, without its scope: what a card and a list say of it. */
export function opWords(raw: unknown): string {
  if (!isObj(raw)) return "";
  const op = raw;
  const at = op.bucket ? String(op.bucket) : `${String(op.axis ?? "")} ${String(op.value ?? "")}`.trim();
  const field = str(op.field) ? ` in ${String(op.field)}` : "";
  switch (op.op) {
    case "add_words":
      return `Add ${quoted(op.words)} to ${at}${field}`;
    case "remove_words":
      return `Remove ${quoted(op.words)} from ${at}${field}`;
    case "move_rule":
      return `Move rule ${String(op.rule ?? "")}${placeWords(op)}`;
    case "move_set":
      return `Move rule set ${String(op.set ?? "")}${placeWords(op)}`;
    case "set_priority":
      return `Give ${at} priority ${String(op.priority ?? "")}`;
    case "add_value":
      return `Add the value ${String(op.value ?? "")} to ${String(op.axis ?? "")}${placeWords(op)}`;
    case "add_rule":
      return `${String(op.axis ?? "")} is ${op.nothing === true ? "nothing" : String(op.value ?? "")} when ${conditionsWords(op.when)}`;
    case "silence":
      return `${op.axis ? `${String(op.axis)} says nothing` : "Nobody is asked"} when ${conditionsWords(op.when)}`;
    case "by_model":
      return `${String(op.axis ?? "")} is left to its model`;
    case "map_name":
      return `${at} is named ${[bidsWords(op.bids) ? `${bidsWords(op.bids)} in BIDS` : "", str(op.label) ? `${String(op.label)} in the names` : ""].filter(Boolean).join(" and ") || "anew"}`;
    case "set_candidates": {
      const when = op.when !== undefined ? ` when ${conditionsWords(op.when)}` : "";
      const unless = op.unless !== undefined ? ` unless ${(Array.isArray(op.unless) ? op.unless : [op.unless]).map(conditionWords).join(" or ")}` : "";
      return when || unless ? `${String(op.role ?? "")} candidates${when}${unless}` : `Every scan holding ${String(op.role ?? "")} competes for it`;
    }
    case "remove_border":
      return `The pick raises no ${String(op.border ?? "")} border`;
    case "set_near_tie":
      return Array.isArray(op.order) && op.order.length > 0 ? `A near tie goes to ${op.order.map(stepWords).join(", then ")}` : "Near ties are borders again";
    case "set_runner_up_within":
      return `A near tie is within ${typeof op.within === "number" ? `${Math.round(op.within * 1000) / 10} %` : String(op.within ?? "")}`;
    default:
      return String(op.op ?? "");
  }
}

/** The fields a spec shows first and the ones under More, in order. */
export function frontAndMore(spec: OpSpec): { front: FieldSpec[]; more: FieldSpec[] } {
  const front = spec.front.map((n) => spec.fields.find((f) => f.name === n)).filter((f): f is FieldSpec => f !== undefined);
  // a required field always stands first
  for (const f of spec.fields) if (f.required && !front.includes(f)) front.push(f);
  return { front, more: spec.fields.filter((f) => !front.includes(f)) };
}

// ------------------------------------------------------------ an operation back into its form

const text = (v: unknown): string => (v === undefined || v === null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v));

/** A word as a person would type it again: quoted where its spaces, a comma or a quote would be lost. */
function typed(w: unknown): string {
  const s = String(w);
  return /^\s|\s$|,/u.test(s) ? `"${s}"` : s;
}

const CMP_KEYS = ["is", "has", "gt", "ge", "lt", "le", "eq", "ne"] as const;

function conditionRowOf(c: unknown): ConditionRow {
  if (!isObj(c)) return { ...NEW_CONDITION };
  if (isObj(c.not)) return { ...conditionRowOf(c.not), not: true };
  if (c.words !== undefined) return { ...NEW_CONDITION, kind: "words", words: (Array.isArray(c.words) ? c.words : [c.words]).map(typed).join(", "), field: text(c.field) };
  if (str(c.flag)) return { ...NEW_CONDITION, kind: "flag", flag: String(c.flag) };
  if (str(c.axis)) return { ...NEW_CONDITION, kind: "axis", axis: String(c.axis), is: text(c.is) };
  const row: ConditionRow = { ...NEW_CONDITION, kind: "tag", tag: text(c.tag) };
  if (c.present === true) return { ...row, cmp: "present" };
  if (Array.isArray(c.between)) return { ...row, cmp: "between", value: text(c.between[0]), value2: text(c.between[1]) };
  for (const k of CMP_KEYS) if (c[k] !== undefined) return { ...row, cmp: k, value: text(c[k]) };
  return row;
}

function candidateRowOf(c: unknown): CandidateRow {
  if (!isObj(c)) return { ...NEW_CANDIDATE };
  if (str(c.axis)) return { ...NEW_CANDIDATE, kind: "axis", axis: String(c.axis), is: text(c.is) };
  for (const k of ["is", "lt", "le", "gt", "ge"] as const) if (c[k] !== undefined) return { ...NEW_CANDIDATE, kind: "tag", tag: text(c.tag), cmp: k, value: text(c[k]) };
  return { ...NEW_CANDIDATE, kind: "tag", tag: text(c.tag) };
}

function orderRowOf(s: unknown): OrderRow {
  if (!isObj(s)) return { ...NEW_ORDER };
  const roles = text(s.roles);
  if (s.lowest === true) return { of: text(s.of), how: "lowest", values: "", roles };
  if (s.highest === true) return { of: text(s.of), how: "highest", values: "", roles };
  if (s.avoid !== undefined) return { of: text(s.of), how: "avoid", values: text(s.avoid), roles };
  return { of: text(s.of), how: "prefer", values: text(s.prefer), roles };
}

function bidsValueOf(b: unknown): BidsValue {
  if (typeof b === "string") return { ...NEW_BIDS, kind: "token", token: b };
  if (!isObj(b)) return { ...NEW_BIDS };
  if (str(b.acq)) return { ...NEW_BIDS, kind: "acq", acq: String(b.acq) };
  if (str(b.entity)) return { ...NEW_BIDS, kind: "entity", entity: String(b.entity), token: text(b.token) };
  return { ...NEW_BIDS, kind: "suffix", suffix: text(b.suffix), datatype: text(b.datatype) };
}

/** A scope as the contract writes it, as the chooser holds it. */
export function scopeChoiceOf(scope: unknown): ScopeChoice {
  const s = str(scope);
  if (!s || s === "pack") return { kind: "pack", value: "" };
  const at = s.indexOf(":");
  const kind = s.slice(0, at) as ScopeKind;
  if (!SCOPE_KINDS.some((k) => k.kind === kind)) return { kind: "pack", value: "" };
  return { kind, value: s.slice(at + 1) };
}

/** An operation as the contract writes it, back in its form, with its scope: what Change it opens; null for one this desk has no form for. */
export function formOfOp(op: unknown): { form: OpForm; scope: ScopeChoice } | null {
  if (!isObj(op)) return null;
  const spec = specOf(String(op.op ?? ""));
  if (!spec) return null;
  const form = emptyForm(spec.op);
  for (const f of spec.fields) {
    const v = op[f.name];
    if (v === undefined) continue;
    if (f.kind === "boolean") form.values[f.name] = v === true;
    else if (f.kind === "words") form.values[f.name] = (Array.isArray(v) ? v : [v]).map(typed).join(", ");
    else if (f.kind === "conditions") form.values[f.name] = (Array.isArray(v) ? v : [v]).map(conditionRowOf);
    else if (f.kind === "candidates") form.values[f.name] = (Array.isArray(v) ? v : [v]).map(candidateRowOf);
    else if (f.kind === "order") form.values[f.name] = Array.isArray(v) ? v.map(orderRowOf) : [];
    else if (f.kind === "bids") form.values[f.name] = bidsValueOf(v);
    else if (f.kind === "json") form.values[f.name] = typeof v === "string" ? v : JSON.stringify(v);
    else form.values[f.name] = text(v);
  }
  if (spec.place) {
    if (str(op.before)) form.place = { at: "before", ref: String(op.before) };
    else if (str(op.after)) form.place = { at: "after", ref: String(op.after) };
    else if (op.position === "first" || op.position === "last") form.place = { at: op.position, ref: "" };
  }
  return { form, scope: scopeChoiceOf(op.scope) };
}
