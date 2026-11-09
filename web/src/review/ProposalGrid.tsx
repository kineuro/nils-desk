// SPDX-License-Identifier: AGPL-3.0-only
// The batch accept grid (UX round 5, 2026-11-08; Nima's design on the
// Proposals page): for what a model left unsure, not a campaign read one by
// one but a filter by the value proposed and by the model's confidence, the
// scans dense, about five hundred a page, each framed in the proposed value's
// colour; a click sets a scan apart, shift-click a range, space the focused
// one; one primary button accepts the page but the exceptions, in the
// person's name with the model's probability beside each decision, and the
// next page loads. Nothing about the exceptions is written. One quiet line
// says where the page stands. No dialog. UX round 6, item 4: a set-apart
// scan the person can name takes its value: 0 or the tile's corner opens the
// axis's value list once over the tile (the question grid's popover), for
// that scan or for every scan set apart, the pick frames the tile in the
// value's colour with the word in its corner, and the one Accept writes the
// corrections beside the rest. Only where the engine says what values the
// axis takes; an older engine's grid is as before.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { valueTone, chosenTone } from "../campaigns/values";
import { ScanViewer } from "../data/ScanViewer";
import type { Scan } from "../data/scans";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { useFollowedJob } from "./resort";
import {
  acceptBody,
  acceptWords,
  acceptedFollowLine,
  acceptedWords,
  type Accepted,
  listedOf,
  bandWords,
  chooseValue,
  closeList,
  correctedWords,
  corrects,
  defaultFilter,
  filterOf,
  grid,
  gridHref,
  gridOf,
  keyAct,
  mayAccept,
  moved,
  openList,
  paletteOf,
  rangeApart,
  refusedWords,
  SIZES,
  spaceApart,
  stateLine,
  tally,
  tileTitle,
  toggleApart,
  type Band,
  type Filter,
  type GScan,
  type GridState,
} from "./proposalGrid";
import { axisTitle } from "./work";
import "../campaigns/campaigns.css";
import "./questions.css";
import "./proposalGrid.css";

const n = (v: number) => v.toLocaleString("en-US");

/** How many tiles a row of the grid holds now, for the up and down keys. */
function columnsOf(el: HTMLElement | null): number {
  const cells = el ? [...el.querySelectorAll<HTMLElement>(".pg-tile")] : [];
  if (cells.length < 2) return 1;
  const top = cells[0].offsetTop;
  const i = cells.findIndex((c) => c.offsetTop !== top);
  return i > 0 ? i : cells.length;
}

/** A scan as the light viewer takes one, for f. */
function asScan(s: GScan): Scan {
  return {
    id: s.stack,
    subjectId: s.subject?.id ?? 0,
    subject: s.subject?.code ?? "",
    session: s.session?.id ?? null,
    label: s.session?.label ?? null,
    day: s.day,
    name: s.name ?? s.description ?? `Scan ${s.stack}`,
    description: s.description,
    bids: s.bids,
    datatype: "other",
    folder: "other",
    axes: s.axes,
    series: null,
    orientation: null,
    images: null,
    picture: s.picture,
    partial: s.partial,
    questions: [],
  };
}

export function ProposalGrid({ caps, model, axis, query }: { caps: Capabilities; model: string; axis: string; query?: Record<string, string> }) {
  const given = useMemo(() => filterOf(query), [query?.value, query?.min, query?.max, query?.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState<Filter>(given);
  const [state, setState] = useState<GridState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // the last accept and the page it was made on: the said line follows the re-sort job it queued, as the commit's does
  const [accepted, setAccepted] = useState<{ a: Accepted; was: GridState } | null>(null);
  const job = useFollowedJob(accepted?.a.resort?.job ?? null);
  const line = accepted && job ? acceptedFollowLine(accepted.a, accepted.was, job) : said;
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const [since, setSince] = useState(Date.now());
  // a read under way, the grid still on screen under it; each read carries its number, so an answer
  // to an earlier read that lands after a later one is dropped
  const [reading, setReading] = useState(false);
  const seq = useRef(0);
  const gridEl = useRef<HTMLDivElement | null>(null);
  const accepting = mayAccept(caps);
  // the first read opens the filter: the value with the most scans, the band below the threshold
  const opened = useRef(false);

  const read = useCallback(
    (f: Filter) => {
      const mine = ++seq.current;
      setSince(Date.now());
      setReading(true);
      return grid.scans(model, axis, f).then(
        (p) => {
          if (mine !== seq.current) return;
          setReading(false);
          setFailed(null);
          setState(gridOf(p));
        },
        (e: unknown) => {
          if (mine !== seq.current) return;
          setReading(false);
          setFailed(refusedWords(e).words);
        },
      );
    },
    [model, axis],
  );

  useEffect(() => {
    opened.current = false;
    setState(null);
    setSaid(null);
    setAccepted(null);
    // one small read for the counts, then the page under the filter they open
    grid.scans(model, axis, given, 1, 1).then(
      (p) => {
        const f = defaultFilter(p, given);
        opened.current = true;
        setFilter(f);
        void read(f);
      },
      (e: unknown) => setFailed(refusedWords(e).words),
    );
  }, [model, axis, given, read]);

  /** The filter changed by the person: the address keeps it, the page is read again; the grid that is there stays until the new one lands. */
  const narrow = useCallback(
    (f: Filter) => {
      setFilter(f);
      history.replaceState(null, "", gridHref(model, axis, f));
      void read(f);
    },
    [model, axis, read],
  );

  const apply = useCallback(() => {
    if (!state || busy) return;
    if (!accepting) return setSaid("Accepting needs work on the Review page.");
    const body = acceptBody(state, filter);
    if (!body) return setSaid("Choose a value first.");
    if (tally(state).accept === 0) return setSaid("Every scan on this page is set apart or decided: nothing to accept.");
    const was = state;
    setBusy(true);
    grid
      .accept(body)
      .then((a) => {
        setSaid(acceptedWords(a, was));
        setAccepted(a.resort?.job ? { a, was } : null);
        // the next page: the scans accepted left the set, so the first page is the next
        return read(filter);
      })
      .catch((e: unknown) => {
        const r = refusedWords(e);
        setSaid(r.words);
        setAccepted(null);
        if (r.stale) void read(filter);
      })
      .finally(() => setBusy(false));
  }, [state, busy, accepting, filter, read]);

  // the keys, on the window while the page is open; a field or the full view keeps its own
  const keyed = useRef({ state, apply, full });
  keyed.current = { state, apply, full };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (!k.state || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t?.closest?.("dialog")) return;
      if (k.full) {
        if (e.key === "f") {
          e.preventDefault();
          setFull(false);
        }
        return;
      }
      const act = keyAct(e.key, columnsOf(gridEl.current));
      if (act.kind === "none") return;
      if ((act.kind === "apply" || act.kind === "apart") && t?.closest?.("a, button")) return;
      e.preventDefault();
      switch (act.kind) {
        case "apart":
          return setState((s) => (s && s.focus !== null ? spaceApart(s, s.focus) : s));
        case "list":
          return setState((s) => (s ? openList(s) : s));
        case "apply":
          return k.apply();
        case "move":
          return setState((s) => (s ? moved(s, act.by) : s));
        case "full":
          return setFull(true);
        case "back":
          if (k.state.listing !== null) return setState((s) => (s ? closeList(s) : s));
          location.hash = href("review");
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the focused tile stays in view as the keys move it
  useEffect(() => {
    if (!state || state.focus === null) return;
    gridEl.current?.querySelector<HTMLElement>(`[data-stack="${state.focus}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [state?.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GridBody
      state={state}
      axis={axis}
      filter={filter}
      failed={failed}
      said={line}
      reading={reading}
      busy={busy}
      full={full}
      since={since}
      accepting={accepting}
      grid={gridEl}
      onState={setState}
      onFilter={narrow}
      onApply={apply}
      onFull={setFull}
    />
  );
}

export interface GridBodyProps {
  state: GridState | null;
  axis: string;
  filter: Filter;
  failed: string | null;
  said: string | null;
  reading: boolean;
  busy: boolean;
  full: boolean;
  since?: number;
  accepting: boolean;
  grid?: React.RefObject<HTMLDivElement | null>;
  onState: (f: (s: GridState | null) => GridState | null) => void;
  onFilter: (f: Filter) => void;
  onApply: () => void;
  onFull: (open: boolean) => void;
}

/** The grid as it draws from its state. */
export function GridBody(p: GridBodyProps) {
  const s = p.state;
  const page = s?.page ?? null;
  const palette = useMemo(() => (s ? paletteOf(s) : []), [s?.page, s?.corrections]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = s ? tally(s) : null;
  const focusAt = s && page ? Math.max(0, page.scans.findIndex((x) => x.stack === s.focus)) : 0;
  const set = (f: (s: GridState) => GridState) => p.onState((x) => (x ? f(x) : x));
  const value = page?.value ?? p.filter.value;
  const empty = page !== null && page.total === 0;
  return (
    <section className="qgrid-page pgrid-page" aria-label="proposals">
      <div className="qgrid-head">
        <span className="eyebrow">
          <a href={href("review")}>Review</a>
        </span>
        <h1>{axisTitle(p.axis)} · what the model is unsure of</h1>
        {page && (
          <span className="meta">
            {page.label}
            {page.threshold !== null ? ` · sure at ${page.threshold.toFixed(2)} or above` : ""}
          </span>
        )}
        <span className="grow" />
        {page && (
          <span className="meta pg-state" role="status">
            {stateLine(page, p.filter)}
          </span>
        )}
      </div>
      {p.failed && (
        <p className="warn">
          <Icon name="alert" /> {p.failed}{" "}
          <button type="button" className="button" onClick={() => p.onFilter(p.filter)}>
            Try again
          </button>
        </p>
      )}
      {page && (
        <div className="pg-filter" role="group" aria-label="Narrow the scans">
          <span className="pg-values" role="group" aria-label="Value proposed">
            {page.values.map((v) => {
              const on = v.value === value;
              return (
                <button key={v.value} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} {...chosenTone(palette, v.value, on)} onClick={() => p.onFilter({ ...p.filter, value: v.value })}>
                  {v.value}
                  <b>{n(v.count)}</b>
                </button>
              );
            })}
          </span>
          {page.range && <Histogram bands={page.bands} range={page.range} min={p.filter.min} max={p.filter.max} onChange={(min, max) => p.onFilter({ ...p.filter, min, max })} />}
          <label className="pg-size">
            <span className="meta">a page</span>
            <select aria-label="Scans a page" value={p.filter.size} onChange={(e) => p.onFilter({ ...p.filter, size: Number(e.target.value) })}>
              {SIZES.map((z) => (
                <option key={z} value={z}>
                  {n(z)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {p.said && <p className="meta said qgrid-said">{p.said}</p>}
      {!s && !p.failed && <Wait phase="reading the scans" since={p.since ?? Date.now()} size="line" />}
      {page?.pictures && !page.pictures.shown && page.pictures.why && <p className="meta">No pictures: {page.pictures.why}</p>}
      {page && (page.asked > 0 || page.withheldSealed > 0) && (
        <p className="meta">
          {[page.asked > 0 ? `${n(page.asked)} asked in a campaign, answered there` : null, page.withheldSealed > 0 ? `${n(page.withheldSealed)} of a sealed sample, withheld` : null].filter(Boolean).join(" · ")}
        </p>
      )}
      {empty && (
        <div className="qgrid-done">
          <p className="lede">Nothing left here{value ? ` for ${value}` : ""}{bandWords(p.filter.min, p.filter.max) ? ` ${bandWords(p.filter.min, p.filter.max)}` : ""}.</p>
          <a className="button" href={href("review")}>
            Review
          </a>
        </div>
      )}
      {s && page && !empty && (
        <div className={p.reading ? "pgrid-wrap reading" : "pgrid-wrap"}>
          <div className="pgrid" ref={p.grid} data-pgrid="" aria-busy={p.reading || undefined}>
            {page.scans.map((x) => (
              <Tile key={x.stack} scan={x} state={s} palette={palette} onClick={(shift) => set((y) => (shift ? rangeApart(y, x.stack) : toggleApart(y, x.stack)))} onCorner={() => set((y) => openList(y, x.stack))} onState={set} />
            ))}
          </div>
          {p.reading && (
            <div className="pg-veil">
              <Wait phase="reading the scans" since={p.since ?? Date.now()} size="line" />
            </div>
          )}
        </div>
      )}
      {s && page && !empty && (
        <div className="pg-foot" role="toolbar" aria-label="accept">
          <button type="button" className="button" disabled={p.busy || !p.accepting || !value || (t?.accept ?? 0) === 0} onClick={p.onApply}>
            {acceptWords(s, p.filter)} <kbd>Enter</kbd>
          </button>
          {t && (
            <span className="q-tally" role="status" aria-live="polite">
              {t.corrected > 0 || t.apart > 0 ? (
                [t.corrected > 0 ? <><b>{n(t.corrected)}</b> corrected ({correctedWords(s)})</> : null, t.apart > 0 ? <><b>{n(t.apart)}</b> set apart</> : null].filter(Boolean).map((part, i) => (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    {part}
                  </span>
                ))
              ) : (
                <span className="meta">click a wrong one to set it apart{corrects(s) ? ", 0 gives it its value" : ""}</span>
              )}
              {t.decided > 0 ? <> · <b>{n(t.decided)}</b> decided by a person, kept</> : null}
            </span>
          )}
          <span className="grow" />
          <span className="q-help">
            <span>
              <kbd>space</kbd>set apart
            </span>
            <span>
              <kbd>shift</kbd>click a range
            </span>
            {corrects(s) && (
              <span>
                <kbd>0</kbd>other value
              </span>
            )}
            <span>
              <kbd>f</kbd>full size
            </span>
          </span>
        </div>
      )}
      {p.full && s && page && page.scans.length > 0 && (
        <div className="qgrid-full">
          <ScanViewer scans={page.scans.map(asScan)} at={focusAt} onAt={(i) => set((y) => ({ ...y, focus: page.scans[i]?.stack ?? y.focus }))} onClose={() => p.onFull(false)} />
        </div>
      )}
    </section>
  );
}

/** The model's confidence as ten bars, with two handles for the band. */
export function Histogram({ bands, range, min, max, onChange }: { bands: Band[]; range: { low: number; high: number }; min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void }) {
  const lo = range.low;
  const hi = range.high;
  const span = Math.max(hi - lo, 0.0001);
  const most = Math.max(1, ...bands.map((b) => b.count));
  const at = (p: number) => `${(((p - lo) / span) * 100).toFixed(2)}%`;
  const step = 0.01;
  // The handles move the band on screen as they are dragged, and the page is read once, on the
  // release (or 300 ms after the last move, where no release arrives, as on some touch screens).
  // A drag fired a read of 500 pictures at every pixel and the page stayed blank between them.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = drag?.from ?? min ?? lo;
  const to = drag?.to ?? max ?? hi;
  // a handle at the range's own edge leaves that edge open
  const settle = (a: number, b: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dragRef.current = null;
    setDrag(null);
    onChange(a <= lo + 1e-9 ? null : Math.min(a, b - step), b >= hi - 1e-9 ? null : Math.max(b, a + step));
  };
  const move = (a: number, b: number) => {
    const d = { from: Math.min(a, b - step), to: Math.max(b, a + step) };
    dragRef.current = d;
    setDrag(d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => settle(d.from, d.to), 300);
  };
  const release = () => {
    const d = dragRef.current;
    if (d) settle(d.from, d.to);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="pg-hist" role="group" aria-label="Confidence">
      <div className="pg-bars" aria-hidden="true">
        {bands.map((b, i) => {
          const inBand = b.to > from && b.from < to;
          return <span key={i} className={inBand ? "pg-bar on" : "pg-bar"} style={{ height: `${Math.max(2, (b.count / most) * 100)}%` }} title={`${b.from.toFixed(2)} to ${b.to.toFixed(2)}: ${b.count.toLocaleString("en-US")}`} />;
        })}
        <span className="pg-chosen" style={{ left: at(from), width: `calc(${at(to)} - ${at(from)})` }} />
      </div>
      <div className="pg-handles">
        <input type="range" aria-label="Lowest confidence" min={lo} max={hi} step={step} value={from} onChange={(e) => move(Number(e.target.value), to)} onPointerUp={release} onKeyUp={release} onTouchEnd={release} />
        <input type="range" aria-label="Highest confidence" min={lo} max={hi} step={step} value={to} onChange={(e) => move(from, Number(e.target.value))} onPointerUp={release} onKeyUp={release} onTouchEnd={release} />
      </div>
      <span className="pg-band meta">{bandWords(from <= lo + 1e-9 ? null : from, to >= hi - 1e-9 ? null : to) || `${lo.toFixed(2)} to ${hi.toFixed(2)}`}</span>
    </div>
  );
}

/**
 * A scan's tile: its picture framed in the proposed value's colour; set apart, the caution frame and the word
 * `apart` in its corner; corrected, the person's value's colour and that word. The corner opens the value list
 * where the engine offers one.
 */
function Tile({ scan: x, state: s, palette, onClick, onCorner, onState }: { scan: GScan; state: GridState; palette: string[]; onClick: (shift: boolean) => void; onCorner: () => void; onState: (f: (s: GridState) => GridState) => void }) {
  const apart = x.stack in s.apart;
  const correction = s.corrections[x.stack] ?? null;
  const focused = s.focus === x.stack;
  const listing = s.listing === x.stack || (s.listing === "apart" && apart && focused);
  const cls = ["pg-tile", focused ? "focused" : "", apart && !correction ? "apart" : "", correction ? "corrected" : "", x.decided ? "decided" : "", listing ? "listing" : ""].filter(Boolean).join(" ");
  const corner = correction ?? (apart ? "apart" : null);
  const label = `scan ${x.stack}: ${x.proposed} ${x.probability.toFixed(2)}${correction ? `, corrected to ${correction}` : apart ? ", set apart" : ""}${x.decided ? ", decided by a person" : ""}`;
  return (
    <div className={cls} data-stack={x.stack} {...valueTone(palette, correction ?? x.proposed)} aria-label={label} aria-current={focused ? "true" : undefined} title={tileTitle(x, correction)} onClick={(e) => onClick(e.shiftKey)}>
      {x.picture ? <img src={x.picture} alt="" decoding="async" draggable={false} /> : <span className="q-blank">no picture</span>}
      <span className="pg-p">{x.probability.toFixed(2)}</span>
      {corner &&
        (corrects(s) ? (
          <button
            type="button"
            className={correction ? "pg-mark pg-corner pg-value" : "pg-mark pg-corner"}
            {...(correction ? valueTone(palette, correction) : {})}
            aria-expanded={listing}
            title={correction ? "another value" : "its value"}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onCorner();
            }}
          >
            {corner}
          </button>
        ) : (
          <span className="pg-mark">{corner}</span>
        ))}
      {x.decided && !apart && <span className="pg-mark pg-decided">decided</span>}
      {listing && <ValueList state={s} palette={palette} onState={onState} />}
    </div>
  );
}

/** The axis's whole value list over a tile, open once for that scan or for the scans set apart; the pick closes it. */
function ValueList({ state: s, palette, onState }: { state: GridState; palette: string[]; onState: (f: (s: GridState) => GridState) => void }) {
  const forApart = s.listing === "apart";
  const stack = typeof s.listing === "number" ? s.listing : s.focus;
  const have = forApart ? null : stack !== null ? s.corrections[stack] ?? null : null;
  const count = forApart ? listedOf(s).length : 1;
  const who = forApart ? `the ${n(count)} set apart` : `scan ${stack}`;
  // the list opens to the right of the tile's corner; at the grid's right edge it opens to the left instead
  const el = useRef<HTMLDivElement | null>(null);
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    const pop = el.current;
    const host = pop?.closest<HTMLElement>(".pgrid");
    if (!pop || !host) return;
    const r = pop.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    if (r.width > 0 && r.right > h.right) setFlip(true);
  }, []);
  return (
    <div ref={el} className={flip ? "q-pop flip" : "q-pop"} role="group" aria-label={`a value for ${who}`} onClick={(e) => e.stopPropagation()}>
      <span className="meta q-pop-for">
        {who} · {axisTitle(s.page.axis).toLowerCase()}
      </span>
      {s.page.legal.map((v) => {
        const on = have === v;
        return (
          <button key={v} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} {...chosenTone(palette, v, on)} onClick={() => onState((x) => chooseValue(x, v))}>
            {v}
          </button>
        );
      })}
    </div>
  );
}
