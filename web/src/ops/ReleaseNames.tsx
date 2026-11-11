// SPDX-License-Identifier: AGPL-3.0-only
// New release's "Name subjects by": the ID types tried in order, each moved
// or taken out by its own buttons, the subject code last; under it what the
// engine's rehearsal says the names come to, a choice for each subject that
// holds several IDs of the type that names it, and the names two subjects
// would share. Nothing here is drawn for an engine without the rehearsal.

import { useEffect, useRef, useState } from "react";
import type { Json } from "../ask/client";
import { releases, type NameChoice, type NamesPlan, type Release } from "../data/cohorts";
import { knownError, type Plain } from "../data/plain";
import { idTypeWords } from "../data/viewer";
import { messageOf } from "../settings/common";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { CLEANED_WORDS, LAST, moved, namedWords, planWords, sharedBy, type NameType } from "./releaseNames";

/** How long the form rests before its names are rehearsed again. */
export const REHEARSE_AFTER_MS = 250;

const n = (v: number) => v.toLocaleString("en-US");

/** The order the ID types are tried in, the subject code last, and the types still to add. */
export function NameBy({ types, by, onChange }: { types: readonly NameType[]; by: readonly string[]; onChange: (by: string[]) => void }) {
  const host = useRef<HTMLSpanElement>(null);
  // a type moved by the keyboard keeps the focus on its own button, or on its other one at an end of the list
  const refocus = useRef<{ type: string; act: string } | null>(null);
  useEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const buttons = [...(host.current?.querySelectorAll<HTMLButtonElement>("button[data-type]") ?? [])].filter((b) => b.dataset.type === want.type);
    (buttons.find((b) => b.dataset.act === want.act && !b.disabled) ?? buttons.find((b) => !b.disabled))?.focus();
  }, [by]);
  const label = (name: string) => types.find((t) => t.name === name)?.label ?? idTypeWords(name);
  const move = (type: string, step: -1 | 1) => {
    refocus.current = { type, act: step < 0 ? "earlier" : "later" };
    onChange(moved(by, type, step));
  };
  const left = types.filter((t) => !by.includes(t.name));
  return (
    <span className="row wrap name-by" ref={host}>
      <ol className="name-by-order" aria-label="Name subjects by, in this order">
        {by.map((t, i) => (
          <li key={t}>
            {i > 0 && <span className="meta">then</span>}
            <span className="tag brand name-by-type">
              {label(t)}
              <button type="button" className="icon-button" data-type={t} data-act="earlier" aria-label={`Try ${label(t)} earlier`} disabled={i === 0} onClick={() => move(t, -1)}>
                <Icon name="chevron-left" />
              </button>
              <button type="button" className="icon-button" data-type={t} data-act="later" aria-label={`Try ${label(t)} later`} disabled={i === by.length - 1} onClick={() => move(t, 1)}>
                <Icon name="chevron-right" />
              </button>
              <button type="button" className="icon-button" data-type={t} data-act="remove" aria-label={`Remove ${label(t)}`} onClick={() => onChange(by.filter((x) => x !== t))}>
                <Icon name="x" />
              </button>
            </span>
          </li>
        ))}
        <li>
          {by.length > 0 && <span className="meta">then</span>}
          <span className="tag">{LAST}</span>
        </li>
      </ol>
      {left.length > 0 && (
        <span className="input">
          <select value="" aria-label="Add an ID type to name subjects by" onChange={(e) => e.target.value !== "" && onChange([...by, e.target.value])}>
            <option value="">{by.length === 0 ? "Add an ID type" : "Add another"}</option>
            {left.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
              </option>
            ))}
          </select>
        </span>
      )}
    </span>
  );
}

export interface Rehearsed {
  /** The last plan the engine answered; of the form as it stands only where `fresh`. */
  plan: NamesPlan | null;
  /** Whether the plan, or the refusal, is of the form as it stands now. */
  fresh: boolean;
  /** The rehearsal refused, in the desk's words with the engine's behind them. */
  failed: Plain | null;
  /** A plan the release door answered in place of the rehearsal's. */
  put: (plan: NamesPlan) => void;
}

/**
 * The names of the release as the form stands, rehearsed once the form rests:
 * `body` is the release's own body, or null where it names by no ID type.
 * An answer to a form since changed is dropped.
 */
export function useRehearsal(body: Json | null): Rehearsed {
  const key = body === null ? null : JSON.stringify(body);
  const [got, setGot] = useState<{ key: string; plan: NamesPlan | null; failed: Plain | null } | null>(null);
  useEffect(() => {
    if (key === null) {
      setGot(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      releases.names(JSON.parse(key) as Json).then(
        (plan) => alive && setGot({ key, plan, failed: null }),
        (e: unknown) => alive && setGot({ key, plan: null, failed: knownError(e) ?? { words: "The names could not be read.", detail: messageOf(e) } }),
      );
    }, REHEARSE_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  const fresh = key !== null && got?.key === key;
  return {
    plan: key === null ? null : (got?.plan ?? null),
    fresh,
    failed: fresh ? (got?.failed ?? null) : null,
    put: (plan) => key !== null && setGot({ key, plan, failed: null }),
  };
}

/**
 * What the rehearsal says under the control: how many subjects each type
 * names, a choice for each subject that holds several IDs, and the names
 * that would be shared.
 */
export function NamesSaid({ names, rows, chosen, onChoose }: { names: Rehearsed; rows: readonly NameChoice[]; chosen: Readonly<Record<string, string>>; onChoose: (subject: string, value: string) => void }) {
  const { plan, failed } = names;
  const open = plan?.needs_choice.length ?? 0;
  const shared = plan?.collisions ?? [];
  return (
    <>
      <span className="meta">{CLEANED_WORDS}</span>
      {plan ? (
        <span className="name-plan" aria-busy={!names.fresh}>
          {planWords(plan)}
        </span>
      ) : (
        !failed && <span className="meta">reading the names</span>
      )}
      {failed && (
        <span className="warn">
          {failed.words}
          <Hint text={failed.detail} />
        </span>
      )}
      {plan && open > 0 && (
        <span className="warn">
          {n(open)} {open === 1 ? "subject holds" : "subjects hold"} several IDs. {plan.values === "withheld" ? "Someone who may see IDs has to choose." : "Choose the one that names each."}
        </span>
      )}
      {rows.length > 0 && (
        <ul className="name-choices" aria-label="Subjects holding several IDs">
          {rows.map((c) => (
            <li key={c.subject}>
              <span className="path">{c.subject}</span>
              <span className="meta">
                {n(c.count)} of {idTypeWords(c.type)}
              </span>
              {c.values && (
                <span className="input">
                  <select value={chosen[c.subject] ?? ""} aria-label={`ID that names ${c.subject}`} onChange={(e) => onChoose(c.subject, e.target.value)}>
                    <option value="">choose</option>
                    {c.values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {shared.length > 0 && (
        <>
          <span className="warn">
            {n(shared.length)} {shared.length === 1 ? "name is" : "names are"} shared by several subjects.
          </span>
          <ul className="name-shared" aria-label="Names several subjects would share">
            {shared.map((c, i) => (
              <li key={c.name ?? i}>
                {c.name && <b className="path">sub-{c.name}</b>}
                <span>{sharedBy(c.subjects)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** What one release named its subjects by, where it is shown alone; nothing where every subject kept its subject code. */
export function NamedBy({ release }: { release: Pick<Release, "name_by" | "names"> }) {
  const named = namedWords(release);
  return named === null ? null : <p className="meta named-by">Subjects named by {named}.</p>;
}
