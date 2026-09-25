// SPDX-License-Identifier: AGPL-3.0-only
// One renderer per question kind (record 45 S4, study A3): an axis and the
// axes as rows of values with their keys, a pick as the stacks that stand for
// a role, a form from its small JSON Schema, free text, and a file handed to
// the app that makes it. Each is a controlled component: the workspace holds
// what is given and sends it; a renderer only shows and changes it.

import { useRef, useState, type KeyboardEvent } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { cantTellKeyOf, formFields, keyOf, type FormSchema, type Given, type Item, type Question } from "./client";
import { findKeyOf, findMatches, LONG_ROW, type Found } from "./workspace";

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
  cantTell = null,
  onChoose,
  onNone,
  onCantTell,
}: {
  rows: Row[];
  chosen: Record<string, string | string[] | null>;
  marks?: Marks;
  /** Offer "none" on each row: an axes answer names every axis, and none says it has no value here. */
  none?: boolean;
  /** Offer "can't tell" on each row (record 48), with the question's word for it; null where the engine does not take it. */
  cantTell?: string | null;
  onChoose: (axis: string, value: string) => void;
  onNone?: (axis: string) => void;
  onCantTell?: (axis: string) => void;
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
              {cantTell !== null && (
                <CantTellButton on={on === cantTell} k={cantTellKeyOf(n)} who={marks[r.axis]?.[cantTell] ?? []} onClick={() => onCantTell?.(r.axis)} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The rows on one screen (record 48, after the first real read): many axes,
 * some with long vocabularies, each row one line or two. A row is found by
 * its number (`1` the first); its letters then narrow its values as they are
 * typed, the best match lit, and Enter takes it. On a single-valued row
 * Enter goes on to the next row; on a multi-valued row it toggles the value
 * and stays, and Enter with nothing typed goes on. Tab goes on without
 * choosing, Escape leaves. A short vocabulary is drawn whole in small
 * chips; a long one shows what is chosen and lists its matches only while
 * it is being typed into. Can't tell keeps its home-row key, none is typed
 * or clicked.
 */
export function CompactRows({
  rows,
  chosen,
  marks = {},
  none = false,
  cantTell = null,
  onChoose,
  onNone,
  onCantTell,
}: {
  rows: Row[];
  chosen: Record<string, string | string[] | null>;
  marks?: Marks;
  none?: boolean;
  cantTell?: string | null;
  onChoose: (axis: string, value: string) => void;
  onNone?: (axis: string) => void;
  onCantTell?: (axis: string) => void;
}) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [at, setAt] = useState<Record<string, number>>({});
  const [finding, setFinding] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const go = (n: number) => {
    const next = rows[n];
    if (next) inputs.current[next.axis]?.focus();
    else inputs.current[rows[n - 1]?.axis ?? ""]?.blur();
  };
  const take = (r: Row, f: Found) => {
    if (f.kind === "value") onChoose(r.axis, f.value);
    else if (f.kind === "none") onNone?.(r.axis);
    else onCantTell?.(r.axis);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: Row, n: number) => {
    const t = typed[r.axis] ?? "";
    const found = findMatches(r, t, { none, cantTell: cantTell !== null });
    const i = Math.min(at[r.axis] ?? 0, Math.max(0, found.length - 1));
    const clear = () => {
      setTyped((x) => ({ ...x, [r.axis]: "" }));
      setAt((x) => ({ ...x, [r.axis]: 0 }));
    };
    if (e.key === "Enter" && !e.ctrlKey) {
      e.preventDefault();
      if (t !== "" && found[i]) {
        take(r, found[i]);
        clear();
        if (!r.multi || found[i].kind !== "value") go(n + 1);
      } else {
        clear();
        go(n + 1);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      clear();
      go(e.shiftKey ? Math.max(0, n - 1) : n + 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      clear();
      e.currentTarget.blur();
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      if (t === "" && e.key === "ArrowRight") return;
      e.preventDefault();
      setAt((x) => ({ ...x, [r.axis]: Math.min(i + 1, found.length - 1) }));
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      if (t === "" && e.key === "ArrowLeft") return;
      e.preventDefault();
      setAt((x) => ({ ...x, [r.axis]: Math.max(0, i - 1) }));
    }
  };
  return (
    <div className="axis-rows compact">
      {rows.map((r, n) => {
        const on = chosen[r.axis];
        const long = r.values.length > LONG_ROW;
        const t = typed[r.axis] ?? "";
        const open = finding === r.axis;
        const found = open ? findMatches(r, t, { none, cantTell: cantTell !== null }) : [];
        const lit = found[Math.min(at[r.axis] ?? 0, Math.max(0, found.length - 1))] ?? null;
        const isLit = (f: Found) => open && t !== "" && lit !== null && JSON.stringify(lit) === JSON.stringify(f);
        const matches = (v: string) => !open || t === "" || found.some((f) => f.kind === "value" && f.value === v);
        const picked = (v: string) => (Array.isArray(on) ? on.includes(v) : on === v);
        const chip = (value: string) => {
          const who = marks[r.axis]?.[value] ?? [];
          const f: Found = { kind: "value", value };
          return (
            <button
              key={value}
              type="button"
              tabIndex={-1}
              className={["opt", picked(value) ? "on" : "", isLit(f) ? "lit" : "", matches(value) || picked(value) ? "" : "dim"].filter(Boolean).join(" ")}
              aria-pressed={picked(value)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChoose(r.axis, value)}
              title={who.length > 0 ? `given by ${who.join(", ")}` : undefined}
            >
              {value}
              {who.length > 0 && <span className="said-by">{who.length}</span>}
            </button>
          );
        };
        const key = findKeyOf(n);
        const ct = cantTellKeyOf(n);
        const chosenLong = long ? (Array.isArray(on) ? on : typeof on === "string" && on !== "" && on !== cantTell ? [on] : []) : [];
        return (
          <div key={r.axis} className={open ? "axis-row finding" : "axis-row"} role="group" aria-label={r.axis}>
            <span className="axis-name" title={r.multi ? `${r.axis}: several may hold` : r.axis}>
              {key && <kbd>{key}</kbd>}
              {r.axis.replace(/_/g, " ")}
              {r.multi && <span className="meta">+</span>}
            </span>
            <span className="axis-values">
              {long ? chosenLong.map(chip) : r.values.map(chip)}
              <input
                ref={(el) => {
                  inputs.current[r.axis] = el;
                }}
                className={long ? "axis-find" : "axis-find quiet"}
                data-find={r.axis}
                value={t}
                placeholder={long ? `type to find (${r.values.length})` : ""}
                aria-label={`find a value of ${r.axis}`}
                onFocus={() => setFinding(r.axis)}
                onBlur={() => setFinding((f) => (f === r.axis ? null : f))}
                onChange={(e) => {
                  setTyped((x) => ({ ...x, [r.axis]: e.target.value }));
                  setAt((x) => ({ ...x, [r.axis]: 0 }));
                }}
                onKeyDown={(e) => onKey(e, r, n)}
              />
              {none && (
                <button type="button" tabIndex={-1} className={["opt", on === null ? "on" : "", isLit({ kind: "none" }) ? "lit" : ""].filter(Boolean).join(" ")} aria-pressed={on === null} onMouseDown={(e) => e.preventDefault()} onClick={() => onNone?.(r.axis)}>
                  none
                </button>
              )}
              {cantTell !== null && (
                <button
                  type="button"
                  tabIndex={-1}
                  className={["opt", on === cantTell ? "on" : "", isLit({ kind: "cant_tell" }) ? "lit" : ""].filter(Boolean).join(" ")}
                  aria-pressed={on === cantTell}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onCantTell?.(r.axis)}
                  title={(marks[r.axis]?.[cantTell] ?? []).length > 0 ? `given by ${(marks[r.axis]?.[cantTell] ?? []).join(", ")}` : "the data give no clue for this axis"}
                >
                  {ct && <kbd>{ct}</kbd>}
                  {"can't tell"}
                  {(marks[r.axis]?.[cantTell] ?? []).length > 0 && <span className="said-by">{(marks[r.axis]?.[cantTell] ?? []).length}</span>}
                </button>
              )}
            </span>
            {long && open && (
              <span className="axis-pop" role="listbox" aria-label={`values of ${r.axis}`}>
                {found.filter((f): f is { kind: "value"; value: string } => f.kind === "value").map((f) => chip(f.value))}
                {found.length === 0 && <span className="meta">nothing begins or holds “{t}”</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CantTellButton({ on, k, who, onClick }: { on: boolean; k: string | null; who: string[]; onClick: () => void }) {
  return (
    <button type="button" className={on ? "opt on" : "opt"} aria-pressed={on} onClick={onClick} title={who.length > 0 ? `given by ${who.join(", ")}` : "the data give no clue for this axis"}>
      {k && <kbd>{k}</kbd>}
      {"can't tell"}
      {who.length > 0 && <span className="said-by">{who.length}</span>}
    </button>
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
