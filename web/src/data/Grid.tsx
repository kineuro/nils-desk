// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's grid (Wave 7a, the desk redesign of 2026-10-09, the
// canvas's Grid, GridSessions and GridScans): v0's three levels taken
// further. The subjects as folders with no pictures, found by a search and a
// few filter toggles; one subject's visits with no pictures and a thin line
// of them in time; one visit's scans, the only level with pictures, in
// folders by datatype that fold, each family together and outlined in its
// colour. Keyboard first: the arrows move a cursor, Enter opens, Esc goes up
// a level, / searches, g turns to the browser at the same place. Every
// level's place is in the address, so back and forward work. Each level's
// bar ends in Save as a selection and Make a cohort, over what it shows
// (Keep.tsx).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { KeepActions } from "./Keep";
import { scansKept, subjectsKept, visitsKept } from "./keep";
import { pictures as sharedPictures } from "./pictures";
import { markOpen } from "./ScanViewer";
import { needsLook, questionWords, type Scan, type ScanPage } from "./scans";
import { compareScans, FAMILY_SLOT, FAMILY_WORD, sessionLabel } from "./tree";
import {
  colourOf,
  COLOUR_BY,
  daysAreNumbers,
  fillPictures,
  filterPhrase,
  foldersOf,
  askSearch,
  goUp,
  heldValue,
  hold,
  inDialog,
  keep,
  kept,
  KEPT,
  keptText,
  kindsLine,
  lastAt,
  lastScanKey,
  lastSubjectKey,
  lastVisitKey,
  legendOf,
  mainLine,
  paramsWords,
  picturesToCome,
  roleWord,
  plural,
  scansKey,
  scopeHome,
  scopeList,
  setLastAt,
  showOptions,
  sideOpen,
  spanWords,
  step,
  steppingDown,
  subjectFacts,
  subjectFilters,
  subjectsKey,
  takeSearch,
  toggled,
  VISIT_FILTERS,
  viewerDoors,
  visitAll,
  foundIds,
  viewHref,
  visitsKey,
  type ColourBy,
  type Scope,
  type SubjectsAsk,
  type SubjectsPage,
  type ViewState,
  visitFilter,
  type Visit,
  type VisitsPage,
} from "./viewer";
import "./grid.css";

/** The pauses before a visit's page is asked again while its pictures are being made, in milliseconds. */
export const PICTURE_POLL = [700, 1500, 2500, 4000, 6000, 8000, 10000];

export type Go = (v: Partial<ViewState>, replace?: boolean) => void;

interface LevelProps {
  caps: Capabilities;
  scope: Scope;
  view: ViewState;
  go: Go;
}

const ORDERS = ["look", "code", "visits", "scans"] as const;
type Order = (typeof ORDERS)[number];
const ORDER_WORDS: Record<Order, string> = { look: "Most to look at first", code: "Code", visits: "Most visits", scans: "Most scans" };
const NAMINGS = ["date", "number", "days"] as const;
type Naming = (typeof NAMINGS)[number];
const NAMING_WORDS: Record<Naming, string> = { date: "Date", number: "Visit number", days: "Days from the first" };
const NAMES = ["nils", "bids"] as const;
type Names = (typeof NAMES)[number];
const COLOURS = ["family", "contrast", "plane", "nothing"] as const;

const n = (v: number) => v.toLocaleString("en-US");

/** A frame later, or a moment later where there are no frames. */
const later = (f: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => f()) : setTimeout(f, 0));

/** Whether a key went to a field the person types in. */
function typing(t: EventTarget | null): boolean {
  const e = t as HTMLElement | null;
  return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable);
}

/** The grid: the level the address names. */
export function Grid(props: LevelProps) {
  const { view } = props;
  if (view.subject === null) return <SubjectsLevel {...props} />;
  if (view.visit === null) return <VisitsLevel key={view.subject} {...props} subject={view.subject} />;
  return <ScansLevel key={view.visit} {...props} subject={view.subject} visit={view.visit} />;
}

// ------------------------------------------------------------ the bar every level shares

interface Crumb {
  label: string;
  href?: string;
  mono?: boolean;
}

/** Where the page is, as a trail; then Grid | Browser. */
export function ViewHead({ crumbs, mode, onMode, children }: { crumbs: Crumb[]; mode: "grid" | "browser"; onMode: ((m: "grid" | "browser") => void) | null; children?: React.ReactNode }) {
  return (
    <div className="vw-head">
      <nav className="vw-crumbs" aria-label="Where">
        {crumbs.map((c, i) => (
          <span key={`${i}-${c.label}`}>
            {i > 0 && <span className="sep">/</span>}
            {c.href ? (
              <a className={c.mono ? "mono" : undefined} href={c.href}>
                {c.label}
              </a>
            ) : (
              <span className={c.mono ? "here mono" : "here"} aria-current="page">
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      {children}
      {onMode && <ModeSwitch mode={mode} onMode={onMode} />}
    </div>
  );
}

export function ModeSwitch({ mode, onMode }: { mode: "grid" | "browser"; onMode: (m: "grid" | "browser") => void }) {
  return (
    <div className="vw-switch" role="group" aria-label="View (g)">
      <button type="button" aria-pressed={mode === "grid"} onClick={() => mode !== "grid" && onMode("grid")}>
        Grid
      </button>
      <button type="button" aria-pressed={mode === "browser"} onClick={() => mode !== "browser" && onMode("browser")}>
        Browser
      </button>
    </div>
  );
}

export function NamesSwitch({ names, onNames }: { names: Names; onNames: (n: Names) => void }) {
  return (
    <div className="vw-switch names" role="group" aria-label="Names (n)">
      <button type="button" aria-pressed={names === "nils"} onClick={() => onNames("nils")}>
        Name
      </button>
      <button type="button" aria-pressed={names === "bids"} onClick={() => onNames("bids")}>
        BIDS
      </button>
    </div>
  );
}

function Chips({ offer, on, onToggle }: { offer: { key: string; label: string; caution?: boolean }[]; on: string[]; onToggle: (key: string) => void }) {
  return (
    <>
      {offer.map((f) => (
        <button key={f.key} type="button" className={f.caution ? "vw-chip caution" : "vw-chip"} aria-pressed={on.includes(f.key)} onClick={() => onToggle(f.key)}>
          {f.label}
        </button>
      ))}
    </>
  );
}

/** A choice kept in this browser, with its setter. */
function useKept<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => kept(key, allowed, fallback));
  return [
    v,
    (x: T) => {
      setV(x);
      keep(key, x);
    },
  ];
}

/** The cards of a level: the one the cursor is on focused and in view. */
function focusCard(box: HTMLElement | null, i: number): void {
  const card = box?.querySelectorAll<HTMLElement>("[data-card]")[i];
  if (!card) return;
  card.focus({ preventScroll: true });
  card.scrollIntoView?.({ block: "nearest" });
}

function spotsOf(box: HTMLElement | null) {
  return [...(box?.querySelectorAll<HTMLElement>("[data-card]") ?? [])].map((c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
}

/** One subject's way of being shown, kept: its code, or an ID type's value. */
function useShow(): [string, (v: string) => void] {
  const [show, setShow] = useState(() => keptText(KEPT.show, "code"));
  return [
    show,
    (v: string) => {
      setShow(v);
      keep(KEPT.show, v);
    },
  ];
}

// ------------------------------------------------------------ the subjects

interface SubjectsState {
  /** The ask the page shown answers: the one asked last once it came, the one before while it is read. */
  key: string;
  page: SubjectsPage | null;
  failed: string | null;
  since: number;
}

/**
 * The subjects an ask finds, page after page as the person scrolls; held, so
 * coming back up shows them at once. While a new ask is read the page before
 * stays on screen (`fresh` false), so a filter never blanks the grid.
 */
function useSubjects(scope: Scope, ask: SubjectsAsk, onRefused: () => void) {
  const key = subjectsKey(scope, ask);
  const [state, setState] = useState<SubjectsState>(() => ({ key, page: heldValue<SubjectsPage>(key), failed: null, since: Date.now() }));
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  useEffect(() => {
    const was = heldValue<SubjectsPage>(key);
    if (was) {
      setState({ key, page: was, failed: null, since: Date.now() });
      return;
    }
    let live = true;
    busy.current = true;
    setState((s) => ({ ...s, failed: null, since: Date.now() }));
    viewerDoors.subjects(scope, ask).then(
      (page) => {
        if (!live) return;
        hold(key, page);
        setState({ key, page, failed: null, since: Date.now() });
      },
      (e: unknown) => {
        if (!live) return;
        setState((s) => ({ ...s, failed: messageOf(e) }));
        // an ID type the engine no longer knows: back to the codes
        if (ask.show !== "code") onRefused();
      },
    ).finally(() => {
      if (live) busy.current = false;
    });
    return () => {
      live = false;
      busy.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the ask
  }, [key]);
  const more = useCallback(() => {
    const s = latest.current;
    if (busy.current || s.key !== key || !s.page || s.page.next === null) return;
    const after = s.page.next;
    busy.current = true;
    viewerDoors
      .subjects(scope, ask, after)
      .then(
        (p) =>
          setState((t) => {
            if (t.key !== key || !t.page || t.page.next !== after) return t;
            const page = { ...p, subjects: [...t.page.subjects, ...p.subjects] };
            hold(key, page);
            return { ...t, page };
          }),
        (e: unknown) => setState((t) => (t.key === key ? { ...t, failed: messageOf(e) } : t)),
      )
      .finally(() => {
        busy.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the ask
  }, [key]);
  return { ...state, fresh: state.key === key, more };
}

function SubjectsLevel({ caps, scope, view, go }: LevelProps) {
  const [show, setShow] = useShow();
  const [order, setOrder] = useKept<Order>(KEPT.order, ORDERS, "look");
  const [naming, setNaming] = useKept<Naming>(KEPT.visits, NAMINGS, "date");
  const filterKey = view.filter.join(",");
  const ask = useMemo<SubjectsAsk>(() => ({ q: view.q, show, order, filter: view.filter }), [view.q, show, order, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useSubjects(scope, ask, () => setShow("code"));
  const page = list.page;
  const subjects = page?.subjects ?? [];

  // the search: what is typed shows at once, and asks after a pause
  const [text, setText] = useState(view.q);
  useEffect(() => setText(view.q), [view.q]);
  useEffect(() => {
    if (text === view.q) return;
    const t = setTimeout(() => go({ q: text }, true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the text is what waits
  }, [text]);
  const search = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (takeSearch()) search.current?.focus();
  }, []);

  // the cursor: where it was when this scope was left, else the first card
  const box = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const placed = useRef<string | null>(null);
  const listKey = list.key;
  useEffect(() => {
    if (placed.current === listKey || subjects.length === 0) return;
    const first = placed.current === null;
    placed.current = listKey;
    const was = Number(lastAt(lastSubjectKey(scope)) ?? NaN);
    const i = first ? subjects.findIndex((s) => s.id === was) : -1;
    setCursor(Math.max(0, i));
    // the cursor takes the focus, unless the person is in the search
    if (i >= 0) later(() => document.activeElement !== search.current && focusCard(box.current, i));
  }, [subjects, scope, listKey]);
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, subjects.length - 1)));
  }, [subjects.length]);

  const open = (id: number) => {
    setLastAt(lastSubjectKey(scope), String(id));
    const to = viewHref(scope, { ...view, subject: id, visit: null, scan: null });
    steppingDown(to);
    location.hash = to;
  };
  const toBrowser = () => go({ mode: "browser", subject: subjects[cursor]?.id ?? null, visit: null, scan: null });

  // more as the person scrolls: the line under the cards coming into view reads the next page
  const sentinel = useRef<HTMLDivElement | null>(null);
  const next = page?.next ?? null;
  const more = list.more;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || next === null || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: "600px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, [next, more]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inDialog(e.target)) return;
      if (typing(e.target)) {
        if (e.target !== search.current) return;
        if (e.key === "Escape") {
          e.preventDefault();
          if (text !== "") setText("");
          else search.current?.blur();
        } else if ((e.key === "Enter" || e.key === "ArrowDown") && subjects.length > 0) {
          e.preventDefault();
          setCursor(0);
          focusCard(box.current, 0);
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "g") {
        e.preventDefault();
        toBrowser();
      } else if (e.key === "Escape") {
        if (sideOpen()) return;
        e.preventDefault();
        location.hash = scopeHome(scope);
      } else if (e.key === "Enter") {
        if ((e.target as HTMLElement | null)?.closest?.("a, button")) return;
        const s = subjects[cursor];
        if (s) {
          e.preventDefault();
          open(s.id);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (subjects.length === 0) return;
        e.preventDefault();
        const to = step(spotsOf(box.current), cursor, e.key);
        setCursor(to);
        focusCard(box.current, to);
        if (to >= subjects.length - 4) more();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const offer = subjectFilters(page?.facets ?? null);
  const roles = (page?.facets.roles ?? []).map((r) => r.name);
  const options = showOptions(page?.facets.idTypes ?? []);
  if (!options.some((o) => o.value === show)) options.push({ value: show, label: show });
  const t = page?.totals;
  const filtered = view.filter.length > 0 || view.q.trim() !== "";
  const phrase = filterPhrase(view.filter);
  const list0 = scopeList(scope);
  return (
    <section className="vw" aria-label={`the subjects of ${scope.name}`}>
      <ViewHead crumbs={[{ label: list0.label, href: list0.href }, { label: scope.name }]} mode="grid" onMode={(m) => m === "browser" && toBrowser()} />
      <div className="vw-title">
        <h1>{scope.name}</h1>
        {t && (
          <span className="vw-sum">
            {plural(t.subjects, "subject")} · {plural(t.visits, "visit")} · {plural(t.scans, "scan")}
            {t.look > 0 && (
              <>
                {" · "}
                <span className="look">{n(t.look)} need a look</span>
              </>
            )}
          </span>
        )}
      </div>
      <div className="vw-controls">
        <label className="vw-search">
          <Icon name="search" />
          <span className="sr-only">Search subjects</span>
          <input ref={search} type="search" placeholder="A code or an ID" value={text} onChange={(e) => setText(e.target.value)} />
          <span className="vw-key" aria-hidden="true">
            /
          </span>
        </label>
        <span className="vw-pick">
          <label className="vw-label" htmlFor="vw-show">
            Show subjects by
          </label>
          <select id="vw-show" className="vw-select" value={show} onChange={(e) => setShow(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
        <span className="vw-pick">
          <label className="vw-label" htmlFor="vw-visits">
            Name visits by
          </label>
          <select id="vw-visits" className="vw-select" value={naming} onChange={(e) => setNaming(e.target.value as Naming)}>
            {NAMINGS.map((v) => (
              <option key={v} value={v}>
                {NAMING_WORDS[v]}
              </option>
            ))}
          </select>
        </span>
        <span className="vw-pick">
          <label className="vw-label" htmlFor="vw-order">
            Order
          </label>
          <select id="vw-order" className="vw-select" value={order} onChange={(e) => setOrder(e.target.value as Order)}>
            {ORDERS.map((v) => (
              <option key={v} value={v}>
                {ORDER_WORDS[v]}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="vw-filters" role="group" aria-label="Filters">
        <span className="vw-label">Only subjects</span>
        <Chips offer={offer} on={view.filter} onToggle={(k) => go({ filter: toggled(view.filter, k) }, true)} />
        {filtered && (
          <button
            type="button"
            className="link-button vw-clear"
            onClick={() => {
              setText("");
              go({ filter: [], q: "" }, true);
            }}
          >
            Clear
          </button>
        )}
        <KeepActions
          caps={caps}
          ready={!!page && list.fresh && !list.failed && page.matched > 0}
          kept={() =>
            // a search is kept as the subjects it found, by id: what was typed can be an identifier, and is never kept
            ask.q.trim() === ""
              ? subjectsKept(scope, { found: null, filter: view.filter }, { shown: page?.matched ?? null })
              : foundIds(scope, ask).then((found) => subjectsKept(scope, { found, filter: view.filter }, { shown: page?.matched ?? null }))
          }
        />
      </div>
      {list.failed && <p className="warn">The subjects could not be read: {list.failed}</p>}
      {!page && !list.failed && <Wait phase="reading the subjects" since={list.since} size="panel" />}
      {page && subjects.length === 0 && <p className="vw-none">{filtered ? "No subject matches." : "No subjects yet."}</p>}
      {subjects.length > 0 && (
        <div ref={box} className={list.fresh ? "vw-cards" : "vw-cards stale"} role="group" aria-label="Subjects" aria-busy={!list.fresh}>
          {subjects.map((s, i) => (
            <a
              key={s.id}
              data-card
              className={i === cursor ? "vw-card at" : "vw-card"}
              href={viewHref(scope, { ...view, subject: s.id, visit: null, scan: null })}
              tabIndex={i === cursor ? 0 : -1}
              onFocus={() => setCursor(i)}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                open(s.id);
              }}
            >
              <div className="vw-card-top">
                <Icon name="folder" />
                <span className={s.label === null ? "vw-card-name none" : "vw-card-name"} title={s.label === null ? `No ${options.find((o) => o.value === show)?.label ?? show}; its code is ${s.code}` : s.label !== s.code ? s.code : undefined}>
                  {s.label ?? s.code}
                </span>
                {s.look > 0 && (
                  <span className="vw-tag look" title={`${plural(s.look, "scan")} to look at`}>
                    {n(s.look)}
                  </span>
                )}
              </div>
              <div className="vw-card-meta">
                {plural(s.visits, "visit")} · {plural(s.scans, "scan")}
              </div>
              <div className="vw-card-facts">{subjectFacts(s, roles) || " "}</div>
            </a>
          ))}
        </div>
      )}
      <div ref={sentinel} className="vw-more" />
      {page && subjects.length > 0 && (
        <div className="vw-foot">
          {filtered ? `${n(subjects.length)} of the ${plural(page.matched, "subject")}` : `${n(subjects.length)} of ${plural(page.matched, "subject")}`}
          {phrase !== "" && ` ${phrase}`}
          {next !== null && (
            <>
              {" · "}
              <button type="button" className="link-button" onClick={more}>
                more as you scroll
              </button>
            </>
          )}
          {" · Enter opens · / searches"}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------ one subject's visits

/** A subject's visits as the visits door answers them for an ask, held. */
function useVisits(scope: Scope, subject: number, ask: { name: string; show: string; filter: string[] }) {
  const key = visitsKey(scope, subject, ask);
  const [state, setState] = useState<{ key: string; page: VisitsPage | null; failed: string | null; since: number }>(() => ({ key, page: heldValue<VisitsPage>(key), failed: null, since: Date.now() }));
  useEffect(() => {
    const was = heldValue<VisitsPage>(key);
    if (was) {
      setState({ key, page: was, failed: null, since: Date.now() });
      return;
    }
    let live = true;
    // the page before stays on screen while this one is read
    setState((s) => ({ ...s, failed: null, since: Date.now() }));
    viewerDoors.visits(scope, subject, ask).then(
      (page) => {
        if (!live) return;
        hold(key, page);
        setState({ key, page, failed: null, since: Date.now() });
      },
      (e: unknown) => live && setState((s) => ({ ...s, failed: messageOf(e) })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the ask
  }, [key]);
  return { ...state, fresh: state.key === key };
}

/** The subjects before and after this one, in the order and filters the subjects level shows them. */
function useAround(scope: Scope, view: ViewState, subject: number): { before: number | null; after: number | null } {
  const ask: SubjectsAsk = { q: view.q, show: keptText(KEPT.show, "code"), order: kept(KEPT.order, ORDERS, "look"), filter: view.filter };
  const key = subjectsKey(scope, ask);
  const [page, setPage] = useState<SubjectsPage | null>(() => heldValue<SubjectsPage>(key));
  useEffect(() => {
    const was = heldValue<SubjectsPage>(key);
    const at = was ? was.subjects.findIndex((s) => s.id === subject) : -1;
    // the page held, unless this subject is its last and more are to come
    if (was && at >= 0 && (at < was.subjects.length - 1 || was.next === null)) {
      setPage(was);
      return;
    }
    let live = true;
    const read = was && at >= 0 ? viewerDoors.subjects(scope, ask, was.next).then((p) => ({ ...p, subjects: [...was.subjects, ...p.subjects] })) : viewerDoors.subjects(scope, ask);
    read.then(
      (p) => {
        if (!live) return;
        hold(key, p);
        setPage(p);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key and the subject are the ask
  }, [key, subject]);
  const list = page?.subjects ?? [];
  const i = list.findIndex((s) => s.id === subject);
  return { before: i > 0 ? list[i - 1].id : null, after: i >= 0 && i < list.length - 1 ? list[i + 1].id : null };
}

function VisitsLevel({ caps, scope, view, go, subject }: LevelProps & { subject: number }) {
  const [naming, setNaming] = useKept<Naming>(KEPT.visits, NAMINGS, "date");
  const [show] = useShow();
  const vfilterKey = view.vfilter.join(",");
  const ask = useMemo(() => ({ name: naming, show, filter: view.vfilter }), [naming, show, vfilterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useVisits(scope, subject, ask);
  const page = state.page;
  const visits = page?.visits ?? [];
  const around = useAround(scope, view, subject);

  const box = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || visits.length === 0) return;
    placed.current = true;
    const i = visits.findIndex((v) => v.key === lastAt(lastVisitKey(scope, subject)));
    if (i >= 0) {
      setCursor(i);
      later(() => focusCard(box.current, i));
    }
  }, [visits, scope, subject]);

  const subjectHref = (id: number) => viewHref(scope, { ...view, subject: id, visit: null, scan: null, vfilter: view.vfilter });
  const up = viewHref(scope, { ...view, subject: null, visit: null, scan: null, vfilter: [] });
  const open = (v: Visit) => {
    setLastAt(lastVisitKey(scope, subject), v.key);
    const to = viewHref(scope, { ...view, visit: v.key, scan: null });
    steppingDown(to);
    location.hash = to;
  };
  const toBrowser = () => go({ mode: "browser", visit: visits[cursor]?.key ?? null, scan: null });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || inDialog(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        goUp(up);
      } else if (e.key === "/") {
        e.preventDefault();
        askSearch();
        location.hash = up;
      } else if (e.key === "g") {
        e.preventDefault();
        toBrowser();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const to = e.key === "ArrowLeft" ? around.before : around.after;
        e.preventDefault();
        if (to !== null) location.replace(subjectHref(to));
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (visits.length === 0) return;
        e.preventDefault();
        const to = Math.max(0, Math.min(visits.length - 1, cursor + (e.key === "ArrowUp" ? -1 : 1)));
        setCursor(to);
        focusCard(box.current, to);
      } else if (e.key === "Enter") {
        if ((e.target as HTMLElement | null)?.closest?.("a, button")) return;
        const v = visits[cursor];
        if (v) {
          e.preventDefault();
          open(v);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const name = page ? (page.subject.label ?? page.subject.code) : `Subject ${subject}`;
  const t = page?.totals;
  // below detail quasi a day is a shape that only looks like a number: not said at all
  const numbers = daysAreNumbers(page?.detail);
  const span = spanWords(t?.span ?? null, page?.detail);
  const list0 = scopeList(scope);
  return (
    <section className="vw" aria-label={`the visits of ${name}`}>
      <ViewHead
        crumbs={[{ label: list0.label, href: list0.href }, { label: scope.name, href: up }, { label: name, mono: true }]}
        mode="grid"
        onMode={(m) => m === "browser" && toBrowser()}
      />
      <div className="vw-title">
        <h1 className="mono">{name}</h1>
        {t && (
          <span className="vw-sum">
            {plural(t.visits, "visit")}
            {span !== "" && ` ${span}`} · {plural(t.scans, "scan")}
            {t.look > 0 && (
              <>
                {" · "}
                <span className="look">{n(t.look)} need a look</span>
              </>
            )}
          </span>
        )}
        <span className="grow" />
        <span className="vw-near">
          {around.before !== null ? (
            <a href={subjectHref(around.before)} onClick={(e) => (e.preventDefault(), location.replace(subjectHref(around.before as number)))}>
              Previous subject
            </a>
          ) : (
            <span className="vw-label">Previous subject</span>
          )}
          {around.after !== null ? (
            <a href={subjectHref(around.after)} onClick={(e) => (e.preventDefault(), location.replace(subjectHref(around.after as number)))}>
              Next subject
            </a>
          ) : (
            <span className="vw-label">Next subject</span>
          )}
        </span>
      </div>
      <div className="vw-filters" role="group" aria-label="Filters">
        <span className="vw-pick">
          <label className="vw-label" htmlFor="vw-visits-by">
            Name visits by
          </label>
          <select id="vw-visits-by" className="vw-select" value={naming} onChange={(e) => setNaming(e.target.value as Naming)}>
            {NAMINGS.map((v) => (
              <option key={v} value={v}>
                {NAMING_WORDS[v]}
              </option>
            ))}
          </select>
        </span>
        <span className="vw-label apart">Only visits</span>
        <Chips offer={VISIT_FILTERS} on={view.vfilter} onToggle={(k) => go({ vfilter: toggled(view.vfilter, k) }, true)} />
        <KeepActions caps={caps} ready={!!page && state.fresh && !state.failed && visits.length > 0} kept={() => visitsKept(scope, { id: subject, label: name }, view.vfilter, page?.visits ?? null, page?.matched ?? null)} />
      </div>
      {state.failed && <p className="warn">The visits could not be read: {state.failed}</p>}
      {!page && !state.failed && <Wait phase="reading the visits" since={state.since} size="panel" />}
      {page && visits.length === 0 && <p className="vw-none">{view.vfilter.length > 0 ? "No visit matches." : "No visits."}</p>}
      {visits.length > 0 && <Timeline visits={visits} numbers={numbers} at={cursor} onPick={(i) => (setCursor(i), focusCard(box.current, i))} />}
      {visits.length > 0 && (
        <div ref={box} className={state.fresh ? "vw-cards visits" : "vw-cards visits stale"} role="group" aria-label="Visits" aria-busy={!state.fresh}>
          {visits.map((v, i) => (
            <a
              key={v.key}
              data-card
              className={i === cursor ? "vw-card visit at" : "vw-card visit"}
              href={viewHref(scope, { ...view, visit: v.key, scan: null })}
              tabIndex={i === cursor ? 0 : -1}
              onFocus={() => setCursor(i)}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                open(v);
              }}
            >
              <div className="vw-card-top">
                <Icon name="calendar" />
                <span className="vw-card-name">{v.label}</span>
                {v.look > 0 && <span className="vw-tag look">{n(v.look)} to look at</span>}
              </div>
              <div className="vw-visit-line">
                {v.day !== null && numbers && (
                  <>
                    <span>day {v.day}</span>
                    <span>·</span>
                  </>
                )}
                <span>{plural(v.scans, "scan")}</span>
                {v.regions.map((r) => (
                  <span key={r} className="vw-tag">
                    {r}
                  </span>
                ))}
              </div>
              <div className="vw-card-meta">{kindsLine(v) || " "}</div>
              <div className="vw-card-facts" title={v.main.map((m) => m.name).join(", ") || undefined}>
                Main: {mainLine(v.main)}
              </div>
            </a>
          ))}
        </div>
      )}
      {page && <div className="vw-foot">← → subjects · Enter opens a visit · Esc back to the subjects</div>}
    </section>
  );
}

/** The visits in time: a dot a visit along a thin line, the first day at the left and the last at the right; evenly apart where the days are shapes. */
function Timeline({ visits, numbers, at, onPick }: { visits: Visit[]; numbers: boolean; at: number; onPick: (i: number) => void }) {
  const days = visits.map((v) => (numbers && v.day !== null && /^\d+$/.test(v.day) ? Number(v.day) : null));
  const known = days.every((d) => d !== null);
  const last = known ? Math.max(...(days as number[])) : 0;
  const place = (i: number) => (visits.length === 1 ? 0 : known && last > 0 ? ((days[i] as number) / last) * 100 : (i / (visits.length - 1)) * 100);
  const first = visits[0];
  const end = visits[visits.length - 1];
  return (
    <div className="vw-time" aria-label="Visits in time">
      <div className="vw-time-line" />
      {visits.map((v, i) => (
        <button key={v.key} type="button" className={i === at ? "vw-dot at" : "vw-dot"} style={{ left: `${place(i)}%` }} title={`${v.label}${numbers && v.day !== null ? `, day ${v.day}` : ""}`} aria-label={v.label} onClick={() => onPick(i)} />
      ))}
      {numbers && first.day !== null && <div className="vw-time-day first">day {first.day}</div>}
      {numbers && visits.length > 1 && end.day !== null && <div className="vw-time-day last">day {end.day}</div>}
    </div>
  );
}

// ------------------------------------------------------------ one visit's scans

/** A scan's middle frames read ahead, so it opens sharp in the browser. */
function readAhead(s: Scan): void {
  const pics = sharedPictures();
  pics.preview(s.id).then(
    (p) => {
      if (p.planes > 0) pics.ahead(s.id, p.planes, Math.floor(p.planes / 2), p.digest, p.partial).catch(() => undefined);
    },
    () => undefined,
  );
}

/** The session a visit's key names, or null for a visit of studies no session holds. */
const sessionOf = (key: string): number | null => (/^s\d+$/.test(key) ? Number(key.slice(1)) : null);

/** The studies a visit is: its key's where it names them, else the visit's own and its scans'. */
function studiesOf(key: string, here: Visit | null, scans: Scan[]): number[] {
  const named = visitFilter(key)?.studies;
  if (named) return named.split(",").map(Number);
  const all = new Set<number>([...(here?.studies ?? []), ...scans.flatMap((s) => (typeof s.study === "number" ? [s.study] : []))]);
  return [...all].sort((a, b) => a - b);
}

function ScansLevel({ caps, scope, view, go, subject, visit }: LevelProps & { subject: number; visit: string }) {
  const [names, setNames] = useKept<Names>(KEPT.names, NAMES, "nils");
  const [colour, setColour] = useKept<ColourBy>(KEPT.colour, COLOURS, "family");
  const [folded, setFolded] = useState<Set<string>>(() => new Set(["other"]));
  const key = scansKey(scope, visit);
  const [load, setLoad] = useState<{ key: string; page: ScanPage | null; failed: string | null; since: number }>(() => ({ key, page: heldValue<ScanPage>(key), failed: null, since: Date.now() }));
  useEffect(() => {
    const was = heldValue<ScanPage>(key);
    if (was && picturesToCome(was.pictures) === 0) {
      setLoad({ key, page: was, failed: null, since: Date.now() });
      return;
    }
    let live = true;
    setLoad({ key, page: was, failed: null, since: Date.now() });
    visitAll(scope, visit).then(
      (page) => {
        if (!live) return;
        hold(key, page);
        setLoad({ key, page, failed: null, since: Date.now() });
      },
      (e: unknown) => live && setLoad((s) => ({ ...s, failed: messageOf(e) })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the visit
  }, [key]);
  const page = load.key === key ? load.page : null;

  // pictures still being made: the page asked again after short and then longer pauses, each picture that came filled in
  const latest = useRef(page);
  latest.current = page;
  const toCome = page?.pictures?.shown ? picturesToCome(page.pictures) > 0 : false;
  // the page stops asking after its last pause: the cards still blank then stop saying their picture is being made
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  const waiting = toCome && gaveUp !== key;
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pauses = [...PICTURE_POLL];
    const tick = () => {
      const ms = pauses.shift();
      if (ms === undefined) {
        if (alive) setGaveUp(key);
        return;
      }
      timer = setTimeout(() => {
        visitAll(scope, visit).then(
          (fresh) => {
            const was = latest.current;
            if (!alive || !was) return;
            const at = fillPictures(was, fresh);
            if (at !== was) {
              hold(key, at);
              setLoad((s) => (s.key === key ? { ...s, page: at } : s));
            }
            if (picturesToCome(at.pictures) > 0) tick();
          },
          () => alive && tick(),
        );
      }, ms);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the visit is what waits
  }, [waiting, key]);

  // the visits of this subject, for the title and Alt with the arrows
  const [show] = useShow();
  const naming = kept<Naming>(KEPT.visits, NAMINGS, "date");
  const visits = useVisits(scope, subject, { name: naming, show, filter: view.vfilter }).page;
  const at = visits?.visits.findIndex((v) => v.key === visit) ?? -1;
  const here: Visit | null = at >= 0 && visits ? visits.visits[at] : null;
  const scans = page?.scans ?? [];
  const folders = useMemo(() => foldersOf(scans, compareScans), [scans]);
  const shownScans = folders.filter((f) => !folded.has(f.key)).flatMap((f) => f.groups.flatMap((g) => g.scans));
  const indexOf = new Map(shownScans.map((s, i) => [s.id, i]));

  const box = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const placed = useRef(false);
  // the scan last seen here, whose folder opens if it was folded
  const wasSeen = view.scan ?? Number(lastAt(lastScanKey(scope, visit)) ?? NaN);
  useLayoutEffect(() => {
    const hidden = folders.find((f) => folded.has(f.key) && f.groups.some((g) => g.scans.some((s) => s.id === wasSeen)));
    if (!placed.current && hidden)
      setFolded((was) => {
        const s = new Set(was);
        s.delete(hidden.key);
        return s;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the folders read are what open it
  }, [folders]);
  useLayoutEffect(() => {
    if (placed.current || shownScans.length === 0) return;
    if (folders.some((f) => folded.has(f.key) && f.groups.some((g) => g.scans.some((s) => s.id === wasSeen)))) return;
    placed.current = true;
    const i = shownScans.findIndex((s) => s.id === wasSeen);
    const to = i >= 0 ? i : 0;
    setCursor(to);
    if (i >= 0) focusCard(box.current, i);
    readAhead(shownScans[to]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first scans read place the cursor
  }, [shownScans.length, folded]);
  const atScan = shownScans[Math.min(cursor, shownScans.length - 1)] ?? null;
  const moveTo = (i: number) => {
    setCursor(i);
    focusCard(box.current, i);
    const s = shownScans[i];
    if (s) readAhead(s);
  };

  const up = viewHref(scope, { ...view, visit: null, scan: null });
  const browse = (s: Scan | null) => {
    if (s) markOpen(s.id);
    const to = viewHref(scope, { ...view, mode: "browser", scan: s?.id ?? null });
    steppingDown(to);
    location.hash = to;
  };

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || typing(e.target) || inDialog(e.target)) return;
      if (e.altKey) {
        if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && visits && at >= 0) {
          e.preventDefault();
          const to = visits.visits[at + (e.key === "ArrowLeft" ? -1 : 1)];
          if (to) go({ visit: to.key, scan: null }, true);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        goUp(up);
      } else if (e.key === "/") {
        e.preventDefault();
        askSearch();
        location.hash = viewHref(scope, { ...view, subject: null, visit: null, scan: null, vfilter: [] });
      } else if (e.key === "g") {
        e.preventDefault();
        browse(atScan);
      } else if (e.key === "n") {
        setNames(names === "bids" ? "nils" : "bids");
      } else if (e.key === "Enter") {
        if ((e.target as HTMLElement | null)?.closest?.("a, button")) return;
        if (atScan) {
          e.preventDefault();
          browse(atScan);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (shownScans.length === 0) return;
        e.preventDefault();
        moveTo(step(spotsOf(box.current), cursor, e.key));
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  });

  const name = visits?.subject.label ?? visits?.subject.code ?? `Subject ${subject}`;
  const title = here?.label ?? (scans[0] ? sessionLabel(scans[0]) : "Visit");
  const look = scans.filter(needsLook).length;
  const legend = colour === "contrast" || colour === "plane" ? legendOf(scans, colour) : [];
  const list0 = scopeList(scope);
  return (
    <section className="vw" aria-label={`the scans of ${title}`}>
      <ViewHead
        crumbs={[
          { label: list0.label, href: list0.href },
          { label: scope.name, href: viewHref(scope, { ...view, subject: null, visit: null, scan: null, vfilter: [] }) },
          { label: name, href: up, mono: true },
          { label: title, mono: true },
        ]}
        mode="grid"
        onMode={(m) => m === "browser" && browse(atScan)}
      />
      <div className="vw-title center">
        <h1 className="mono">{title}</h1>
        <span className="vw-sum">
          {here?.day !== null && here?.day !== undefined && daysAreNumbers(visits?.detail) && `day ${here.day} · `}
          {plural(scans.length, "scan")}
          {look > 0 && (
            <>
              {" · "}
              <span className="look">{n(look)} need a look</span>
            </>
          )}
        </span>
        <span className="grow" />
        <span className="vw-pick">
          <label className="vw-label" htmlFor="vw-colour">
            Colour by
          </label>
          <select id="vw-colour" className="vw-select" value={colour} onChange={(e) => setColour(e.target.value as ColourBy)}>
            {COLOUR_BY.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </span>
        <NamesSwitch names={names} onNames={setNames} />
        <KeepActions
          caps={caps}
          ready={!!page && !load.failed && scans.length > 0}
          kept={() =>
            scansKept(
              scope,
              { subject, subjectLabel: name, visit, label: title, number: here?.number ?? null, studies: studiesOf(visit, here, scans), session: sessionOf(visit) },
              scans,
              page?.total ?? null,
            )
          }
        />
      </div>
      {legend.length > 0 && (
        <div className="vw-legend" aria-label={`Coloured by ${colour}`}>
          {legend.map((l) => (
            <span key={l.word} data-slot={l.slot}>
              {l.word}
            </span>
          ))}
        </div>
      )}
      {load.failed && <p className="warn">The scans could not be read: {load.failed}</p>}
      {!page && !load.failed && <Wait phase="reading the scans" since={load.since} size="panel" />}
      {page?.pictures && !page.pictures.shown && page.pictures.why && <p className="vw-none">No pictures: {page.pictures.why}</p>}
      {page && scans.length === 0 && <p className="vw-none">No scans.</p>}
      {page && page.next !== null && <p className="vw-none">The first {scans.length.toLocaleString("en-US")} of {page.total.toLocaleString("en-US")} scans of this visit.</p>}
      <div ref={box} className="vw-folders">
        {folders.map((f) => {
          const isOpen = !folded.has(f.key);
          return (
            <section key={f.key} className="vw-folder" aria-label={f.label}>
              <button
                type="button"
                className="vw-folder-head"
                aria-expanded={isOpen}
                onClick={() =>
                  setFolded((was) => {
                    const s = new Set(was);
                    if (s.has(f.key)) s.delete(f.key);
                    else s.add(f.key);
                    return s;
                  })
                }
              >
                <span className="vw-chev">
                  <Icon name="chevron-down" />
                </span>
                <Icon name="folder" />
                <span className="vw-folder-name">{f.label}</span>
                <span className="vw-tag">{n(f.scans)}</span>
                <span className="vw-sum">{isOpen ? [f.main > 0 ? `${n(f.main)} main` : "", f.look > 0 ? `${n(f.look)} to look at` : ""].filter(Boolean).join(" · ") : "folded"}</span>
              </button>
              {isOpen && (
                <div className="vw-folder-body">
                  {f.groups.map((g, gi) => {
                    const slot = colour === "family" ? FAMILY_SLOT[g.family] : null;
                    const cards = (
                      <div className="vw-scans">
                        {g.scans.map((s) => {
                          const i = indexOf.get(s.id) ?? -1;
                          const value = colour === "contrast" || colour === "plane" ? colourOf(s, colour) : null;
                          const main = s.main ?? [];
                          const looks = needsLook(s);
                          const shown = names === "bids" && s.bids ? s.bids : s.name;
                          return (
                            <a
                              key={s.id}
                              data-card
                              data-stack={s.id}
                              data-slot={value?.slot}
                              className={i === cursor ? "vw-card vw-scan at" : "vw-card vw-scan"}
                              href={viewHref(scope, { ...view, mode: "browser", scan: s.id })}
                              tabIndex={i === cursor ? 0 : -1}
                              title={[s.description, value?.word, looks ? `needs a look: ${questionWords(s)}` : ""].filter(Boolean).join(" · ") || undefined}
                              onFocus={() => setCursor(i)}
                              onMouseEnter={() => readAhead(s)}
                              onClick={(e) => {
                                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                                e.preventDefault();
                                browse(s);
                              }}
                            >
                              <div className="vw-pic">
                                {s.picture ? <img src={s.picture} alt="" decoding="async" /> : <span className={waiting ? "vw-blank making" : "vw-blank"} />}
                                {main.length > 0 && (
                                  <span className="vw-tag main" title={`The main ${main.map(roleWord).join(", ")}`}>
                                    main
                                  </span>
                                )}
                                {looks && <span className="vw-tag look">look</span>}
                                {s.images !== null && <span className="vw-slices">{n(s.images)}</span>}
                              </div>
                              <div className="vw-scan-words">
                                <span className="vw-scan-name">{shown}</span>
                                <span className="vw-scan-params">{paramsWords(s) || " "}</span>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    );
                    if (g.family === "plain") return <div key={`${g.family}-${gi}`}>{cards}</div>;
                    return (
                      <div key={`${g.family}-${gi}`} className="vw-family" data-slot={slot ?? undefined}>
                        <div className="vw-family-name">{FAMILY_WORD[g.family]}</div>
                        {cards}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {page && scans.length > 0 && <div className="vw-foot">Arrows move · Enter opens in Browser · Alt ← → visits · Esc back to the visits</div>}
    </section>
  );
}
