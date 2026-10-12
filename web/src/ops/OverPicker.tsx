// SPDX-License-Identifier: AGPL-3.0-only
// The run form's Over (2026-10-12): a combobox over the saved selections the
// engine lists. Typing finds them by name and words; each entry says its
// newest version, its size, who made it and when, and the cohort it is the
// source of. Arrows move, Enter takes, Escape closes the list. The newest
// version is taken, an older one a step away on the chip the choice becomes.
// Exact text (selection:x@2, x@2, handle:7) is taken as typed, checked by the
// engine; where the list is not served to the person, that is the way.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { mayList, selections, sizeWords } from "../query/selections";
import { Icon } from "../ui/Icon";
import { catalog, type Over } from "./catalog";
import { refusalOf } from "./failure";
import { askWord, findOver, merged, optionOf, specOf, type Found, type OverOption, type Spec } from "./pick";

const n = (v: number) => v.toLocaleString("en-US");

/** Selections read when the form opens, a page at a time; past them the engine's own filter is asked as a person types. */
const PAGE = 200;
const PAGES = 5;

type Pool = { kind: "off" } | { kind: "loading" } | { kind: "ready"; options: OverOption[]; whole: boolean } | { kind: "failed"; why: string };

/** One entry's second line: its size, who made it and when, the cohort it is the source of. */
export function optionWords(o: OverOption): string {
  const size = o.size ? `${sizeWords(o.size)}${o.size.version !== o.newest ? ` at v${o.size.version}` : ""}` : "not run yet";
  return [size, o.owner ? `by ${o.owner}` : null, o.made ? whenWords(o.made) : null].filter(Boolean).join(" · ");
}

/**
 * What the list offers for exact text the options do not hold: the text,
 * taken as typed. Text that says it is exact (a version after @, selection:
 * or handle:) comes first; a bare word only where nothing else is found.
 */
function typedEntry(typed: string, spec: Spec | null, found: Found[]): Spec | null {
  if (spec === null) return null;
  if ("handle" in spec) return spec;
  const hit = found.find((f) => f.option.name.toLowerCase() === spec.selection.toLowerCase());
  if (hit && (spec.version === null || spec.version <= hit.option.newest)) return null;
  return /@|^selection:/iu.test(typed.trim()) || found.length === 0 ? spec : null;
}

const specWords = (s: Spec) => ("handle" in s ? `handle ${s.handle}` : `selection:${s.selection}${s.version !== null ? `@${s.version}` : ""}`);

export function OverPicker({ caps, over, onOver }: { caps: Capabilities; over: Over | null; onOver: (o: Over | null) => void }) {
  const lists = mayList(caps);
  const [pool, setPool] = useState<Pool>(() => (lists ? { kind: "loading" } : { kind: "off" }));
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  // the list, read once when the form opens: every selection up to PAGES pages
  useEffect(() => {
    if (!lists) return;
    let alive = true;
    (async () => {
      let options: OverOption[] = [];
      let after: string | null = null;
      for (let i = 0; i < PAGES; i++) {
        const p = await selections.list("", after, PAGE);
        options = merged(options, p.selections.map(optionOf));
        after = p.next;
        if (!after) break;
      }
      return { options, whole: after === null };
    })().then(
      (r) => alive && setPool({ kind: "ready", ...r }),
      (e: unknown) => alive && setPool({ kind: "failed", why: refusalOf(e).line }),
    );
    return () => {
      alive = false;
    };
  }, [lists]);

  // past the pages read, the engine's own filter is asked for the longest word typed, a moment after the last key
  const word = askWord(typed);
  const partial = pool.kind === "ready" && !pool.whole;
  useEffect(() => {
    if (!partial || word.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      selections.list(word, null, 50).then(
        (p) => alive && setPool((was) => (was.kind === "ready" ? { ...was, options: merged(was.options, p.selections.map(optionOf)) } : was)),
        () => undefined,
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [partial, word]);

  const options = pool.kind === "ready" ? pool.options : [];
  const { found, more } = useMemo(() => findOver(options, typed), [options, typed]);
  const spec = specOf(typed);
  const extra = typedEntry(typed, spec, found);
  const entries: ({ kind: "option"; f: Found } | { kind: "typed"; spec: Spec })[] = [...(extra ? [{ kind: "typed" as const, spec: extra }] : []), ...found.map((f) => ({ kind: "option" as const, f }))];
  const lit = Math.min(at, Math.max(0, entries.length - 1));
  const shown = open && (entries.length > 0 || typed.trim() !== "");

  const take = (e: (typeof entries)[number] | undefined) => {
    if (!e) return;
    setWhy(null);
    if (e.kind === "option") {
      onOver({ selection: e.f.option.name, version: e.f.version });
      setTyped("");
      setOpen(false);
      return;
    }
    const s = e.spec;
    if ("handle" in s) {
      onOver({ handle: s.handle });
      setTyped("");
      setOpen(false);
      return;
    }
    // exact text the list does not hold: the engine says whether it is a selection, and its version
    setChecking(true);
    catalog.selection(s.version !== null ? `${s.selection}@${s.version}` : s.selection).then(
      (r) => {
        setChecking(false);
        onOver({ selection: r.name, version: r.version });
        setTyped("");
        setOpen(false);
      },
      (err: unknown) => {
        setChecking(false);
        setWhy(refusalOf(err).line);
      },
    );
  };

  const chosen = over && "selection" in over ? (options.find((o) => o.name === over.selection) ?? null) : null;
  if (over) {
    return (
      <div className="field over-pick">
        <span className="label">Over</span>
        <div className="over-chosen">
          <span className="chip over-chip">
            <Icon name="layers" />
            {"selection" in over ? over.selection : `handle ${over.handle}`}
          </span>
          {"selection" in over &&
            (chosen && chosen.newest > 1 ? (
              <span className="input select over-version">
                <select value={over.version} aria-label="The version" onChange={(e) => onOver({ selection: over.selection, version: Number(e.target.value) })}>
                  {Array.from({ length: chosen.newest }, (_, i) => chosen.newest - i).map((v) => (
                    <option key={v} value={v}>
                      v{v}
                      {v === chosen.newest ? ", newest" : ""}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="meta">v{over.version}</span>
            ))}
          <button
            type="button"
            className="icon-button"
            aria-label="Choose another"
            onClick={() => {
              onOver(null);
              setOpen(true);
              setTimeout(() => input.current?.focus(), 0);
            }}
          >
            <Icon name="x" />
          </button>
        </div>
        <span className="meta">
          {chosen ? `${optionWords(chosen)} · ` : ""}
          {"selection" in over ? `selection:${over.selection}@${over.version}, frozen when the run starts` : "a frozen answer, run as it is"}
        </span>
      </div>
    );
  }

  return (
    <div className="field over-pick">
      <label className="label" htmlFor={`${listId}-input`}>
        Over
      </label>
      <div className="over-box">
        <span className="input">
          <Icon name="search" />
          <input
            ref={input}
            id={`${listId}-input`}
            value={typed}
            role="combobox"
            aria-label="The selection"
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={listId}
            aria-activedescendant={shown && entries.length > 0 ? `${listId}-${lit}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={pool.kind === "off" ? "name, or name@version" : "a selection: t1 3d, siemens, or name@version"}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              setTyped(e.target.value);
              setAt(0);
              setOpen(true);
              setWhy(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!open) setOpen(true);
                else setAt(Math.min(lit + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt(Math.max(lit - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (shown) take(entries[lit]);
                else if (spec) take({ kind: "typed", spec });
              } else if (e.key === "Escape" && shown) {
                // the list closes; the dialog stays
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
        </span>
        {shown && (
          <ul className="over-list" role="listbox" id={listId} aria-label="selections">
            {entries.map((e, i) => (
              <li
                key={e.kind === "option" ? e.f.option.name : "typed"}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === lit}
                className={i === lit ? "over-opt lit" : "over-opt"}
                onMouseDown={(ev) => ev.preventDefault()}
                onMouseEnter={() => setAt(i)}
                onClick={() => take(e)}
              >
                {e.kind === "option" ? (
                  <>
                    <span className="over-name">{e.f.option.name}</span>
                    <span className="over-v">v{e.f.version}</span>
                    {e.f.option.cohort && <span className="tag">cohort {e.f.option.cohort}</span>}
                    <span className="over-about">{optionWords(e.f.option)}</span>
                  </>
                ) : (
                  <>
                    <span className="over-name">{specWords(e.spec)}</span>
                    <span className="over-about">as typed{checking ? ", checking…" : ""}</span>
                  </>
                )}
              </li>
            ))}
            {entries.length === 0 && <li className="meta over-none">{pool.kind === "loading" ? "reading the selections…" : `no selection holds “${typed.trim()}”`}</li>}
            {more > 0 && <li className="meta over-none">{n(more)} more; type more of the name</li>}
          </ul>
        )}
      </div>
      {why && <span className="warn">{why}</span>}
      {pool.kind === "failed" && <span className="meta">The list could not be read ({pool.why}); a name typed whole still works.</span>}
    </div>
  );
}
