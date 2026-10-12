// SPDX-License-Identifier: AGPL-3.0-only
// The run form's Over (2026-10-12): a combobox over the saved selections the
// engine lists. Typing finds them by name and words; each entry says its
// newest version, its size, who made it and when, and the cohort it is the
// source of. Arrows move, Enter takes, Escape closes the list. The newest
// version is taken, an older one a step away on the chip the choice becomes.
// Exact text (selection:x@2, x@2, handle:7) is taken as typed, checked by the
// engine; where the list is not served to the person, that is the way.
// Record 55 (rulings of 2026-10-12, item 6): beside the selections, each
// dataset and cohort, whose main scans of a role a run goes straight over
// ("study-anon · main T1w"); the role is chosen on the chip, or taken from a
// word typed (study-anon flair), and main:ROLE@dataset:NAME works as typed.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { cohorts as cohortDoors } from "../data/cohorts";
import { isRoot } from "../data/layout";
import { sources, whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";
import { mayList, selections, sizeWords } from "../query/selections";
import { roleWord } from "../review/mainScans";
import { Icon } from "../ui/Icon";
import { catalog, mainRoles, mainSpec, type MainOver, type Over } from "./catalog";
import { refusalOf } from "./failure";
import { askWord, findOver, findScopes, merged, optionOf, specOf, type Found, type FoundScope, type OverOption, type ScopeOption, type Spec } from "./pick";

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

/** A dataset's or a cohort's size: its scans and subjects, where the engine says them; null where it says neither. */
export function scopeSize(o: ScopeOption): string | null {
  const parts = [o.scans !== null ? `${n(o.scans)} ${o.scans === 1 ? "scan" : "scans"}` : null, o.subjects !== null ? `${n(o.subjects)} ${o.subjects === 1 ? "subject" : "subjects"}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A dataset's or a cohort's second line in the list: its size, and what the run takes of it. */
export function scopeWords(o: ScopeOption): string {
  const size = scopeSize(o);
  return size ? `${size}, one main scan a visit` : "one main scan a visit";
}

/** Whether the datasets and the cohorts are listed for this person. */
export function mayListScopes(caps: Capabilities): { datasets: boolean; cohorts: boolean } {
  const data = may(caps, "data:see");
  return { datasets: data && served(caps, "GET /api/sources"), cohorts: data && served(caps, "GET /api/cohorts") };
}

/** The datasets (never a root) and the open cohorts, each with its size. */
async function readScopes(caps: Capabilities): Promise<ScopeOption[]> {
  const lists = mayListScopes(caps);
  const [datasets, cohorts] = await Promise.all([
    lists.datasets ? sources.list(0).then((r) => r.sources.filter((s) => !isRoot(s)).map((s): ScopeOption => ({ kind: "dataset", name: s.name, scans: s.totals?.stacks ?? null, subjects: s.totals?.subjects ?? null }))) : Promise.resolve([]),
    lists.cohorts ? cohortDoors.list().then((l) => l.filter((c) => !c.retired_at).map((c): ScopeOption => ({ kind: "cohort", name: c.name, scans: c.stacks ?? null, subjects: c.subjects ?? null }))) : Promise.resolve([]),
  ]);
  return [...datasets, ...cohorts];
}

/**
 * What the list offers for exact text the options do not hold: the text,
 * taken as typed. Text that says it is exact (a version after @, selection:,
 * main: or handle:) comes first; a bare word only where nothing else is found.
 */
function typedEntry(typed: string, spec: Spec | null, found: Found[], scopes: FoundScope[]): Spec | null {
  if (spec === null) return null;
  if ("handle" in spec || "main" in spec) return spec;
  const hit = found.find((f) => f.option.name.toLowerCase() === spec.selection.toLowerCase());
  if (hit && (spec.version === null || spec.version <= hit.option.newest)) return null;
  return /@|^selection:/iu.test(typed.trim()) || (found.length === 0 && scopes.length === 0) ? spec : null;
}

const specWords = (s: Spec) => ("handle" in s ? `handle ${s.handle}` : "main" in s ? mainSpec(s.main) : `selection:${s.selection}${s.version !== null ? `@${s.version}` : ""}`);

type Entry = { kind: "option"; f: Found } | { kind: "scope"; f: FoundScope } | { kind: "typed"; spec: Spec };

const entryKey = (e: Entry) => (e.kind === "option" ? `s:${e.f.option.name}` : e.kind === "scope" ? `m:${e.f.option.kind}:${e.f.option.name}` : "typed");

export function OverPicker({ caps, over, onOver }: { caps: Capabilities; over: Over | null; onOver: (o: Over | null) => void }) {
  const lists = mayList(caps);
  const listsScopes = mayListScopes(caps);
  const scopesListed = listsScopes.datasets || listsScopes.cohorts;
  const roles = useMemo(() => mainRoles(caps), [caps]);
  const [pool, setPool] = useState<Pool>(() => (lists ? { kind: "loading" } : { kind: "off" }));
  const [scopePool, setScopePool] = useState<ScopeOption[]>([]);
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

  // the datasets and the cohorts whose main scans a run goes over, read once too
  useEffect(() => {
    if (!scopesListed) return;
    let alive = true;
    readScopes(caps).then(
      (s) => alive && setScopePool(s),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [scopesListed]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const { found: scopes, more: moreScopes } = useMemo(() => findScopes(scopePool, typed, roles), [scopePool, typed, roles]);
  const spec = specOf(typed);
  const extra = typedEntry(typed, spec, found, scopes);
  const entries: Entry[] = [...(extra ? [{ kind: "typed" as const, spec: extra }] : []), ...found.map((f) => ({ kind: "option" as const, f })), ...scopes.map((f) => ({ kind: "scope" as const, f }))];
  const lit = Math.min(at, Math.max(0, entries.length - 1));
  const shown = open && (entries.length > 0 || typed.trim() !== "");

  const close = () => {
    setTyped("");
    setOpen(false);
  };
  const take = (e: Entry | undefined) => {
    if (!e) return;
    setWhy(null);
    if (e.kind === "option") {
      onOver({ selection: e.f.option.name, version: e.f.version });
      close();
      return;
    }
    if (e.kind === "scope") {
      onOver({ main: { kind: e.f.option.kind, name: e.f.option.name, role: e.f.role } });
      close();
      return;
    }
    const s = e.spec;
    if ("handle" in s) {
      onOver({ handle: s.handle });
      close();
      return;
    }
    // a dataset's or a cohort's main scans as typed: the engine's pre-flight says whether they are
    if ("main" in s) {
      onOver({ main: s.main });
      close();
      return;
    }
    // exact text the list does not hold: the engine says whether it is a selection, and its version
    setChecking(true);
    catalog.selection(s.version !== null ? `${s.selection}@${s.version}` : s.selection).then(
      (r) => {
        setChecking(false);
        onOver({ selection: r.name, version: r.version });
        close();
      },
      (err: unknown) => {
        setChecking(false);
        setWhy(refusalOf(err).line);
      },
    );
  };

  if (over) return <OverChosen over={over} options={options} scopes={scopePool} roles={roles} onOver={onOver} reopen={() => setTimeout(() => input.current?.focus(), 0)} openList={() => setOpen(true)} />;

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
            aria-label="What the run goes over"
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={listId}
            aria-activedescendant={shown && entries.length > 0 ? `${listId}-${lit}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={pool.kind === "off" && !scopesListed ? "name@version, or main:t1w@dataset:name" : "a selection or a dataset: t1 3d, study-anon flair, name@version"}
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
          <ul className="over-list" role="listbox" id={listId} aria-label="what the run goes over">
            {entries.map((e, i) => (
              <li
                key={entryKey(e)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === lit}
                className={`over-opt${e.kind === "scope" ? " over-scope" : ""}${i === lit ? " lit" : ""}`}
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
                ) : e.kind === "scope" ? (
                  <>
                    <span className="over-name">{e.f.option.name}</span>
                    <span className="over-v">main {roleWord(e.f.role)}</span>
                    <span className="tag">{e.f.option.kind}</span>
                    <span className="over-about">{scopeWords(e.f.option)}</span>
                  </>
                ) : (
                  <>
                    <span className="over-name">{specWords(e.spec)}</span>
                    <span className="over-about">as typed{checking ? ", checking…" : ""}</span>
                  </>
                )}
              </li>
            ))}
            {entries.length === 0 && <li className="meta over-none">{pool.kind === "loading" ? "reading the selections…" : `no selection or dataset holds “${typed.trim()}”`}</li>}
            {more + moreScopes > 0 && <li className="meta over-none">{n(more + moreScopes)} more; type more of the name</li>}
          </ul>
        )}
      </div>
      {why && <span className="warn">{why}</span>}
      {pool.kind === "failed" && <span className="meta">The list could not be read ({pool.why}); a name typed whole still works.</span>}
    </div>
  );
}

/** The choice as a chip: a selection with its version a step away, a scope's main scans with the role chosen on it, or a handle. */
function OverChosen({ over, options, scopes, roles, onOver, reopen, openList }: { over: Over; options: OverOption[]; scopes: ScopeOption[]; roles: string[]; onOver: (o: Over | null) => void; reopen: () => void; openList: () => void }) {
  const chosen = "selection" in over ? (options.find((o) => o.name === over.selection) ?? null) : null;
  const scope = "main" in over ? (scopes.find((s) => s.kind === over.main.kind && s.name === over.main.name) ?? null) : null;
  const main: MainOver | null = "main" in over ? over.main : null;
  // a role typed that the pack does not name stays offered, so the engine can say so
  const roleChoices = main && !roles.includes(main.role) ? [...roles, main.role] : roles;
  return (
    <div className="field over-pick">
      <span className="label">Over</span>
      <div className="over-chosen">
        <span className="chip over-chip">
          <Icon name="layers" />
          {"selection" in over ? over.selection : "main" in over ? over.main.name : `handle ${over.handle}`}
        </span>
        {main && <span className="tag">{main.kind}</span>}
        {main && (
          <span className="input select over-role">
            <select value={main.role} aria-label="The role" onChange={(e) => onOver({ main: { ...main, role: e.target.value } })}>
              {roleChoices.map((r) => (
                <option key={r} value={r}>
                  main {roleWord(r)}
                </option>
              ))}
            </select>
          </span>
        )}
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
            openList();
            reopen();
          }}
        >
          <Icon name="x" />
        </button>
      </div>
      <span className="meta">
        {chosen ? `${optionWords(chosen)} · ` : ""}
        {scope && scopeSize(scope) ? `${scopeSize(scope)} · ` : ""}
        {"selection" in over
          ? `selection:${over.selection}@${over.version}, frozen when the run starts`
          : main
            ? `${mainSpec(main)}: the ${main.kind}'s main ${roleWord(main.role)} scans, one a visit, resolved and frozen when the run starts`
            : "a frozen answer, run as it is"}
      </span>
    </div>
  );
}
