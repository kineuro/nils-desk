// SPDX-License-Identifier: AGPL-3.0-only
// One renderer per question kind (record 45 S4, study A3): an axis and the
// axes as rows of values with their keys, a pick as the stacks that stand for
// a role, a form from its small JSON Schema, free text, and a file handed to
// the app that makes it. Each is a controlled component: the workspace holds
// what is given and sends it; a renderer only shows and changes it.

import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { formFields, keyOf, type FormSchema, type Given, type Item, type Question } from "./client";

/** One row of values: an axis, its values in the pack's order, and the families they group under where the pack says. */
export interface Row {
  axis: string;
  values: string[];
  families?: Record<string, string | null>;
  multi?: boolean;
}

/** Who among the raters gave a value, for the adjudicator: value to principals. */
export type Marks = Record<string, Record<string, string[]>>;

/** One row per axis, the values grouped by family, each with the key that picks it. */
export function AxisRows({
  rows,
  chosen,
  marks = {},
  none = false,
  onChoose,
  onNone,
}: {
  rows: Row[];
  chosen: Record<string, string | string[] | null>;
  marks?: Marks;
  /** Offer "none" on each row: an axes answer names every axis, and none says it has no value here. */
  none?: boolean;
  onChoose: (axis: string, value: string) => void;
  onNone?: (axis: string) => void;
}) {
  return (
    <div className="axis-rows">
      {rows.map((r, n) => {
        const on = chosen[r.axis];
        const groups = groupOf(r);
        return (
          <div key={r.axis} className="axis-row" role="group" aria-label={r.axis}>
            <span className="axis-name">
              {r.axis}
              {r.multi && <span className="meta"> · several</span>}
            </span>
            <span className="axis-values">
              {groups.map((g) => (
                <span key={g.family ?? ""} className="axis-family">
                  {g.family && <span className="axis-family-name">{g.family}</span>}
                  {g.values.map(({ value, i }) => {
                    const key = keyOf(n, i);
                    const picked = Array.isArray(on) ? on.includes(value) : on === value;
                    const who = marks[r.axis]?.[value] ?? [];
                    return (
                      <button key={value} type="button" className={picked ? "opt on" : "opt"} aria-pressed={picked} onClick={() => onChoose(r.axis, value)} title={who.length > 0 ? `given by ${who.join(", ")}` : undefined}>
                        {key && <kbd>{key}</kbd>}
                        {value}
                        {who.length > 0 && <span className="said-by">{who.length}</span>}
                      </button>
                    );
                  })}
                </span>
              ))}
              {none && (
                <button type="button" className={on === null ? "opt on" : "opt"} aria-pressed={on === null} onClick={() => onNone?.(r.axis)}>
                  none
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function groupOf(r: Row): { family: string | null; values: { value: string; i: number }[] }[] {
  const out: { family: string | null; values: { value: string; i: number }[] }[] = [];
  r.values.forEach((value, i) => {
    const family = r.families?.[value] ?? null;
    const last = out[out.length - 1];
    if (last && last.family === family) last.values.push({ value, i });
    else out.push({ family, values: [{ value, i }] });
  });
  return out;
}

/** The value chosen on a row, as the given answer holds it after a choice: one value, or a set on a multi-valued axis. */
export function choose(given: Record<string, string | string[] | null>, row: Row, value: string): Record<string, string | string[] | null> {
  if (!row.multi) return { ...given, [row.axis]: given[row.axis] === value ? "" : value };
  const was = Array.isArray(given[row.axis]) ? (given[row.axis] as string[]) : [];
  return { ...given, [row.axis]: was.includes(value) ? was.filter((v) => v !== value) : [...was, value] };
}

/** A form from its small schema: an enum as choices, a boolean as yes or no, a number, or words. */
export function FormFields({ schema, form, onChange }: { schema: FormSchema | undefined; form: Json; onChange: (form: Json) => void }) {
  const fields = formFields(schema);
  const set = (name: string, v: unknown) => {
    const next = { ...form };
    if (v === undefined || v === "") delete next[name];
    else next[name] = v;
    onChange(next);
  };
  return (
    <div className="form-fields">
      {fields.map(({ name, field, required }) => (
        <label key={name} className="field">
          <span className="label">
            {field.title ?? name}
            {required ? "" : " · optional"}
          </span>
          {field.enum ? (
            <span className="chips">
              {field.enum.map((v) => (
                <button key={String(v)} type="button" className={form[name] === v ? "opt on" : "opt"} aria-pressed={form[name] === v} onClick={() => set(name, form[name] === v ? undefined : v)}>
                  {String(v)}
                </button>
              ))}
            </span>
          ) : field.type === "boolean" ? (
            <span className="chips">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" className={form[name] === v ? "opt on" : "opt"} aria-pressed={form[name] === v} onClick={() => set(name, form[name] === v ? undefined : v)}>
                  {v ? "yes" : "no"}
                </button>
              ))}
            </span>
          ) : field.type === "number" || field.type === "integer" ? (
            <span className="input">
              <input
                type="number"
                step={field.type === "integer" ? 1 : "any"}
                value={typeof form[name] === "number" ? String(form[name]) : ""}
                onChange={(e) => set(name, e.target.value === "" ? undefined : field.type === "integer" ? Math.trunc(Number(e.target.value)) : Number(e.target.value))}
              />
            </span>
          ) : (
            <span className="input">
              <input value={typeof form[name] === "string" ? (form[name] as string) : ""} onChange={(e) => set(name, e.target.value)} />
            </span>
          )}
          {field.description && <span className="meta">{field.description}</span>}
        </label>
      ))}
    </div>
  );
}

export function FreeText({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  return (
    <label className="field">
      <span className="label">Your words</span>
      <span className="input">
        <textarea rows={4} value={text} onChange={(e) => onChange(e.target.value)} />
      </span>
      <span className="meta">Ctrl+Enter answers.</span>
    </label>
  );
}

/**
 * The stacks that stand for the role on this occasion, where the engine does
 * not name the session's candidates (an engine before record 45's candidates
 * door, or a person below detail quasi): the candidates the item's evidence
 * names are offered, and any stack of the session may be named by number.
 * Where it does, the workspace draws the session board instead.
 */
export function PickStacks({ role, candidates, words = {}, stacks, onChange }: { role: string; candidates: number[]; words?: Record<number, string>; stacks: number[]; onChange: (s: number[]) => void }) {
  const toggle = (s: number) => onChange(stacks.includes(s) ? stacks.filter((x) => x !== s) : [...stacks, s]);
  return (
    <div className="form-fields">
      <span className="label">The stacks that stand for {role}</span>
      {candidates.length > 0 && (
        <span className="chips">
          {candidates.map((s, i) => (
            <button key={s} type="button" className={stacks.includes(s) ? "opt on" : "opt"} aria-pressed={stacks.includes(s)} onClick={() => toggle(s)}>
              {keyOf(0, i) && <kbd>{keyOf(0, i)}</kbd>}
              stack {s}
              {words[s] && <span className="meta"> · {words[s]}</span>}
            </button>
          ))}
        </span>
      )}
      <label className="field">
        <span className="label">By number</span>
        <span className="input mono">
          <input
            value={stacks.join(", ")}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(/[\s,]+/u)
                  .filter((x) => /^\d+$/u.test(x))
                  .map(Number),
              )
            }
            placeholder="12, 14"
          />
        </span>
      </label>
    </div>
  );
}

/** The app that answers a file question here, where one is registered: its entry names the kind, or it is Segment. */
export function answeringApp(caps: Capabilities, kind: string | undefined): { id: string; title: string } | null {
  for (const a of caps.apps) {
    const answers = (a.capabilities as { answers?: unknown } | null)?.answers;
    const named = Array.isArray(answers) && answers.some((x) => x === `derivative:${kind ?? ""}` || x === "derivative");
    if (named || a.id === "segment") return { id: a.id, title: a.title ?? a.id };
  }
  return null;
}

/**
 * The derivative hand-off: a file question is answered in the app that makes
 * the file (Segment, from wave 46), which registers it and answers with its
 * number. The desk links there with the assignment, says where the item's
 * starting files come from, and takes a file's number by hand where it was
 * registered some other way. No app here says so (the absence story).
 */
export function Handoff({
  caps,
  campaign,
  assignment,
  item,
  question,
  derivative,
  form,
  onDerivative,
  onForm,
}: {
  caps: Capabilities;
  campaign: number;
  assignment: number;
  item: Item;
  question: Question;
  derivative: number | null;
  form: Json;
  onDerivative: (d: number | null) => void;
  onForm: (f: Json) => void;
}) {
  const app = answeringApp(caps, question.derivative_kind);
  const inputs = item.input_derivative_ids ?? [];
  const to = app ? `/apps/${encodeURIComponent(app.id)}/?campaign=${campaign}&assignment=${assignment}&item=${item.id}${item.stack_id !== null ? `&stack=${item.stack_id}` : ""}` : null;
  return (
    <div className="handoff">
      {to && app ? (
        <p>
          <a className="button" href={to} target="_blank" rel="noopener">
            Open in {app.title}
          </a>{" "}
          <span className="meta">It registers the {question.derivative_kind ?? "file"} and answers this item.</span>
        </p>
      ) : (
        <p className="note-lead">No app here answers this.</p>
      )}
      {inputs.length > 0 && (
        <p className="meta">
          Starts from{" "}
          {inputs.map((d, i) => (
            <span key={d}>
              {i > 0 && ", "}
              <a href={`/api/derivatives/${d}`} target="_blank" rel="noopener">
                file {d}
              </a>
            </span>
          ))}
          .
        </p>
      )}
      <label className="field">
        <span className="label">A file registered elsewhere, by number</span>
        <span className="input mono">
          <input value={derivative === null ? "" : String(derivative)} onChange={(e) => onDerivative(/^\d+$/u.test(e.target.value) ? Number(e.target.value) : null)} placeholder="the derivative's id" />
        </span>
      </label>
      {question.form && <FormFields schema={question.form} form={form} onChange={onForm} />}
    </div>
  );
}

/** The given answer a question starts from. */
export function blank(q: Question): Given {
  switch (q.kind) {
    case "axis":
      return { kind: "value", value: "" };
    case "axes":
      return { kind: "values", values: {} };
    case "pick":
      return { kind: "stacks", stacks: [] };
    case "form":
      return { kind: "form", form: {} };
    case "derivative":
      return { kind: "file", derivative: null, form: {} };
    case "free":
      return { kind: "text", text: "" };
    default:
      return { kind: "none" };
  }
}
