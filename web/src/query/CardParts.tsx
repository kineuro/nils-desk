// SPDX-License-Identifier: AGPL-3.0-only
// The parts of a Query card that more than one page shows: the charts of a
// step, a step's editor with the moves the engine offers typed in by hand, and
// the hooks that read a card, its charts and the stack fields a chart counts
// by. The Query page's card and the card that floats over an Assistant
// conversation both hold them.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ask, catalogFields, chain, type Diagnosis, type DocumentHandle, type Json, type Move, type Options, type Profile } from "../ask/client";
import { editor, setsOf, type Step } from "../ask/editor";
import { nextMoves } from "../ask/start";
import { Icon } from "../ui/Icon";
import { argsOf, chartOf, clauseText, countsOf, fieldChoices, inputOf, moveWords, preview, tabsOf, unitWords, versionsOf, type Chart, type ChartTab, type Version } from "./cards";

const n = (v: number) => v.toLocaleString("en-US");

/** A card as the engine holds it: the document, the options of each of its sets, its versions and its diagnosis. */
export interface CardRead {
  doc: DocumentHandle | null;
  options: Record<string, Options | null>;
  versions: Version[];
  diagnosis: Diagnosis | null;
  steps: Step[];
  why: string | null;
  load: () => void;
}

/** A card read by its document id, read again whenever the id changes; the last card read stays until the next arrives. */
export function useCard(id: number | null): CardRead {
  const [doc, setDoc] = useState<DocumentHandle | null>(null);
  const [options, setOptions] = useState<Record<string, Options | null>>({});
  const [versions, setVersions] = useState<Version[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const load = useCallback(() => {
    if (id === null) return;
    setWhy(null);
    ask
      .get(id)
      .then(async (d) => {
        const pairs = await Promise.all(setsOf(d.ask).map((s) => ask.options(id, s).then((o) => [s, o] as const, () => [s, null] as const)));
        setOptions(Object.fromEntries(pairs));
        setDoc(d);
        chain(id).then((c) => setVersions(versionsOf(c)), () => setVersions([]));
        ask.diagnose(id, "clause").then(setDiagnosis, () => setDiagnosis(null));
      })
      .catch((e: Error) => setWhy(e.message));
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  const steps = useMemo(() => (doc ? editor(doc.ask, options) : []), [doc, options]);
  return { doc, options, versions, diagnosis, steps, why, load };
}

/** The charts of one step of a card, counted again for every version; a new field keeps the step's charts until its own arrive. */
export function useProfile(id: number | null, set: string | null, field: string, doc: DocumentHandle | null): { profile: Profile | null; loading: boolean; why: string | null } {
  const [got, setGot] = useState<{ key: string; value: Profile } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const key = `${id}:${set}:${field}`;
  useEffect(() => {
    if (id === null || set === null) return;
    let alive = true;
    setWhy(null);
    ask.profile(id, set, field).then(
      (p) => alive && setGot({ key, value: p }),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [key, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const sameStep = got !== null && got.key.startsWith(`${id}:${set}:`);
  return { profile: sameStep ? got.value : null, loading: set !== null && (got === null || got.key !== key), why };
}

/** The stack fields a chart may count by, read once. */
export function useStackFields(): string[] {
  const [fields, setFields] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    catalogFields("stack").then(
      (f) => alive && setFields(fieldChoices(f)),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return fields;
}

/** A step's editor: its sentence, its conditions with a button to take one away, and the moves the engine offers next, typed in by hand. */
export function StepEditor(props: {
  step: Step;
  options: Options | null;
  move: Move | null;
  typed: Record<string, string>;
  busy: boolean;
  onMove: (m: Move | null) => void;
  onType: (name: string, value: string) => void;
  onApply: (set: string, m: Move, args: Json) => void;
  /** Without the panel around it, inside another. */
  plain?: boolean;
}) {
  const { step, options, move, typed, busy, onMove, onType, onApply, plain } = props;
  const removeWhere = options?.moves.find((m) => m.kind === "remove_where") ?? null;
  const title = move?.kind === "add_set" ? "Add a step" : `Change ${step.set}`;
  return (
    <section className={plain ? "step-editor plain" : "panel card"}>
      <div className="row">
        {plain ? <h3 className="grow">{title}</h3> : <h2 className="grow">{title}</h2>}
        <span className="tag">{step.grain}</span>
      </div>
      {step.sentence && <p className="lede">{step.sentence}</p>}
      <div className="clauses">
        {step.where.map((c, i) => (
          <span key={`w${i}`} className="clause-pill">
            where {clauseText(c)}
            {removeWhere && (
              <button type="button" className="icon-button" aria-label="Remove this condition" disabled={busy} onClick={() => onApply(step.set, removeWhere, { index: i })}>
                <Icon name="x" />
              </button>
            )}
          </span>
        ))}
        {Object.entries(step.clauses).flatMap(([part, lines]) =>
          (lines ?? []).map((l, i) => (
            <span key={`${part}${i}`} className="clause-pill">
              {part} {l}
            </span>
          )),
        )}
      </div>
      {!move && (
        <div className="chips">
          {nextMoves(step).map(({ move: m }) => (
            <button key={m.id} type="button" className="move" disabled={busy} onClick={() => onMove(m)}>
              <Icon name="plus" />
              {moveWords(m)}
            </button>
          ))}
        </div>
      )}
      {move && (
        <MoveForm
          move={move}
          grain={step.grain}
          typed={typed}
          busy={busy}
          onType={onType}
          onApply={() => {
            const { args, missing } = argsOf(move, typed);
            if (missing.length === 0) onApply(step.set, move, args);
          }}
          onCancel={() => onMove(null)}
        />
      )}
    </section>
  );
}

export function ProfilePanel(props: {
  set: string | null;
  profile: Profile | null;
  loading: boolean;
  why: string | null;
  tab: ChartTab;
  onTab: (t: ChartTab) => void;
  field: string;
  fields: string[];
  onField: (f: string) => void;
  /** Without the panel around it, inside another. */
  plain?: boolean;
}) {
  const { set, profile, loading, why, field, fields, onTab, onField, plain } = props;
  const tabs = tabsOf(profile);
  const tab = tabs.some((t) => t.id === props.tab) ? props.tab : (tabs[0]?.id ?? null);
  const counts = countsOf(profile);
  const people = chartOf(profile?.demographics);
  const demographics = profile?.demographics && "sex" in profile.demographics ? profile.demographics : null;
  const clinical = profile?.clinical && "kinds" in profile.clinical ? profile.clinical : null;
  return (
    <section className={plain ? "profile plain" : "panel card"} aria-busy={loading}>
      <div className="row">
        {plain ? <h3 className="grow">{set ? `Under ${set}` : "Under this step"}</h3> : <h2 className="grow">{set ? `Under ${set}` : "Under this step"}</h2>}
        {loading && !why && <span className="meta">counting</span>}
      </div>
      {why && <p className="warn">The charts could not be counted: {why}</p>}
      {counts.length > 0 && (
        <div className="profile-counts">
          {counts.map((c) => (
            <div key={c.label} className="profile-count">
              <b className="num">{n(c.value)}</b>
              <span className="meta">{c.value === 1 && c.label.endsWith("s") ? c.label.slice(0, -1) : c.label}</span>
            </div>
          ))}
        </div>
      )}
      {tabs.length > 0 && (
        <div className="chart-tabs" role="tablist" aria-label="charts">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? "on" : ""} onClick={() => onTab(t.id)}>
              {t.words}
            </button>
          ))}
        </div>
      )}
      {profile && tab === "stacks" && <Bars chart={chartOf(profile.stack_types, "base")} unit="stacks" />}
      {profile && tab === "field" && (
        <>
          <label className="field chart-field">
            <span className="label">Count the stacks by</span>
            <span className="input">
              <select value={field} onChange={(e) => onField(e.target.value)}>
                {(fields.includes(field) ? fields : [field, ...fields]).map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <Bars chart={chartOf(profile.field)} unit="stacks" />
          {profile.field?.truncated && <p className="meta">The first 60 values are shown.</p>}
        </>
      )}
      {profile && tab === "people" && people.kind === "words" && <p className="meta">{people.words}</p>}
      {profile && tab === "people" && demographics && (
        <div className="profile-pair">
          <div>
            <h3>Sex</h3>
            <Bars chart={chartOf(demographics.sex, "sex")} unit="subjects" />
          </div>
          <div>
            <h3>Age at the session</h3>
            <Bars chart={chartOf(demographics.age_decades, "decade")} unit="sessions" />
          </div>
        </div>
      )}
      {profile && tab === "clinical" && (
        <>
          <Bars chart={chartOf(profile.clinical, "plain", "No clinical events are recorded for these subjects.")} unit="events" />
          {clinical?.sensitive_withheld && <p className="meta">Some kinds of event are left out, since you do not see everything in records.</p>}
        </>
      )}
    </section>
  );
}

export function Bars({ chart, unit }: { chart: Chart; unit: string }) {
  if (chart.kind === "none") return null;
  if (chart.kind === "words") return <p className="meta">{chart.words}</p>;
  const three = unit === "subjects";
  return (
    <div className={three ? "bars three" : "bars"}>
      {chart.bars.map((b, i) => (
        <div key={`${b.label}${i}`} className="bar-row">
          <span className="bar-label" title={b.label}>
            {b.label}
          </span>
          <span className="bar-track">
            <i style={{ width: `${Math.max(1, Math.round(100 * b.share))}%` }} />
          </span>
          <span className="num">{unitWords(b.count, unit)}</span>
          {!three && <span className="num meta">{unitWords(b.subjects, "subjects")}</span>}
        </div>
      ))}
    </div>
  );
}

export function MoveForm(props: { move: Move; grain: string; typed: Record<string, string>; busy: boolean; onType: (k: string, v: string) => void; onApply: () => void; onCancel: () => void }) {
  const { move, grain, typed, busy, onType, onApply, onCancel } = props;
  const { missing } = argsOf(move, typed);
  const field = typed.field ?? "";
  const [suggested, setSuggested] = useState<{ values: [unknown, number][]; hidden: boolean } | null>(null);
  // smart proposals for a condition: the values the chosen field holds most, with their counts
  useEffect(() => {
    setSuggested(null);
    if (move.kind !== "add_where" || !field) return;
    let alive = true;
    ask
      .values(grain, field, 8)
      .then((r) => alive && setSuggested({ values: r.items ?? [], hidden: (r as { kind?: string }).kind === "shapes" }))
      .catch(() => alive && setSuggested(null));
    return () => {
      alive = false;
    };
  }, [move.kind, grain, field]);
  return (
    <div className="move-form">
      <p className="move-sentence">{preview(move, typed)}</p>
      <div className="move-holes">
        {move.holes.map((h) => {
          const kind = inputOf(h);
          const value = typed[h.name] ?? "";
          return (
            <label key={h.name} className="field">
              <span className="label">
                {h.name.replace(/_/g, " ")}
                {h.optional ? " (optional)" : ""}
              </span>
              <span className="input">
                {kind === "choice" && (
                  <select value={value} onChange={(e) => onType(h.name, e.target.value)}>
                    <option value="">choose</option>
                    {(h.fillers ?? []).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                )}
                {kind === "yesno" && (
                  <select value={value} onChange={(e) => onType(h.name, e.target.value)}>
                    <option value="">choose</option>
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                )}
                {kind === "number" && <input type="number" value={value} onChange={(e) => onType(h.name, e.target.value)} />}
                {kind === "words" && <input value={value} onChange={(e) => onType(h.name, e.target.value)} />}
              </span>
            </label>
          );
        })}
      </div>
      {suggested && !suggested.hidden && suggested.values.length > 0 && (
        <div className="chips" aria-label="values this field holds">
          {suggested.values.map(([v, count]) => (
            <button key={String(v)} type="button" className="move" onClick={() => onType("value", String(v))}>
              {String(v)}
              <span className="meta num">{n(count)}</span>
            </button>
          ))}
        </div>
      )}
      {suggested?.hidden && <p className="meta">This field's values are not listed, since you do not see them in records; its shapes are.</p>}
      <div className="row actions">
        <button type="button" className="button small" disabled={busy || missing.length > 0} onClick={onApply}>
          Apply as the next version
        </button>
        <button type="button" className="button secondary small" onClick={onCancel}>
          Cancel
        </button>
        {missing.length > 0 && <span className="meta">still to fill: {missing.join(", ").replace(/_/g, " ")}</span>}
      </div>
    </div>
  );
}
