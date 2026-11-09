// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 (record 56 section 6.3; studies/2026-10-09-review-round1,
// DR1 and DR2): the few questions the sort leaves to a person. The Questions
// page says each in plain words as a card (UX round 5: under Review's head,
// one axis or all, nothing else) with its distinct scans ("Which base? 7
// scans") and why; Answer opens its grid, which reads like the campaign
// gallery (UX round 6): the pictures first, each framed in the colour of the
// answer it will get with that word in its corner, the question's first
// answer every scan's at open; one bar above them with the two answers as
// coloured chips (keys 1 and 2, pressed: that answer for every scan not set
// otherwise), "other…" (0: the axis's whole list once, as a popover for the
// scan in focus or for the scans set apart), the keys behind one ?, the
// tally and Apply. A click gives a scan the other answer and takes it back,
// shift-click or space sets it apart (it stays open), f opens it full size,
// Enter applies the page and the next page, then the next question, opens.
// System 1's answer is a second small mark (the tiles it agrees with step
// back), a staged answer and a blind scan are marked. No dialog, no scope,
// no why field.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { valueTone, chosenTone } from "../campaigns/values";
import { ScanViewer } from "../data/ScanViewer";
import type { Scan } from "../data/scans";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { askPeopleHref, asksPeople } from "./askPeople";
import { axisTitle } from "./work";
import {
  answerBody,
  answeredWords,
  apartOf,
  axisWords,
  chooseKey,
  chooseNothing,
  chooseValue,
  focusApart,
  gridHref,
  gridOf,
  keyAct,
  keyValue,
  listHref,
  mayAnswer,
  moved,
  openList,
  opinionWords,
  otherOf,
  questions,
  refusedWords,
  ruleLine,
  slots,
  tallyWords,
  tileAnswer,
  toggleApart,
  toggleTile,
  valueLabel,
  type GridState,
  type QPage,
  type QScan,
  type Question,
  type QuestionList,
  type Where,
} from "./questions";
import "../campaigns/campaigns.css";
import "./questions.css";
import "./work.css";

const n = (v: number) => v.toLocaleString("en-US");
const scans = (v: number) => `${n(v)} ${v === 1 ? "scan" : "scans"}`;

// ------------------------------------------------------------ DR1, the questions as cards

export interface QuestionsPageProps {
  list: QuestionList | null;
  where: Where;
  failed?: string | null;
  since?: number;
  /** Review's first page sends a person to one axis's questions: only those are shown, under the axis's name. */
  axis?: string | null;
}

/**
 * The Questions page (UX round 5, 2026-11-08): under Review's head, the axis or "Scans to answer", one card per
 * question as Review's first page draws its cards (its words, its scans, its reason, Answer), and nothing else;
 * a dataset or cohort the page was opened for is one line under the head.
 */
export function QuestionsPage({ list, where, failed = null, since = Date.now(), axis = null }: QuestionsPageProps) {
  const shown = list ? (axis ? list.questions.filter((q) => q.axis === axis) : list.questions) : [];
  const narrowed = where.dataset ? `in dataset ${where.dataset}` : where.cohort ? `in cohort ${where.cohort}` : null;
  return (
    <section className="data review work questions" aria-label="Questions">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("review")}>Review</a>
          </span>
          <h1>{axis ? axisTitle(axis) : "Scans to answer"}</h1>
          {narrowed && (
            <span className="meta q-where">
              {narrowed} · <a href={narrow(href("review", "questions"), { axis })}>everywhere</a>
            </span>
          )}
        </div>
      </div>
      {failed && <p className="warn">The questions could not be read: {failed}</p>}
      {!list && !failed && <Wait phase="reading the questions" since={since} size="line" />}
      {list && shown.length === 0 && (
        <p className="meta q-none">
          Nothing to answer here. <a href={href("review")}>Review</a>
        </p>
      )}
      {shown.length > 0 && (
        <div className="rv-grid">
          {shown.map((q) => (
            <article key={q.key} className="rv-card answer" aria-label={q.words} data-key={q.key}>
              <span className="rv-title">{q.words}</span>
              <div className="rv-big">
                <b>{n(q.scans)}</b>
                <span>{q.scans === 1 ? "scan" : "scans"}</span>
              </div>
              {q.reason && <span className="rv-meta">{q.reason}</span>}
              <div className="rv-acts">
                <a className="button" href={gridHref(q.key, where)}>
                  Answer
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** The Questions page at its address: the list read for where it was opened, drawn as cards. */
export function QuestionsRoute({ where, axis }: { where: Where; axis: string | null }) {
  const [list, setList] = useState<QuestionList | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const whereKey = `${where.dataset ?? ""}|${where.cohort ?? ""}`;
  useEffect(() => {
    let alive = true;
    setList(null);
    setFailed(null);
    questions.list(where).then(
      (l) => alive && setList(l),
      (e: Error) => alive && setFailed(e.message),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scope is what reads
  }, [whereKey]);
  return <QuestionsPage list={list} where={where} failed={failed} since={since} axis={axis} />;
}


// ------------------------------------------------------------ DR2, the grid

/** What the page said last, carried to the next question's grid as it opens. */
let carried: string | null = null;

/** How many tiles a row of the grid holds now, for the up and down keys. */
function columnsOf(el: HTMLElement | null): number {
  const cells = el ? [...el.querySelectorAll<HTMLElement>(".q-tile")] : [];
  if (cells.length < 2) return 1;
  const top = cells[0].offsetTop;
  const i = cells.findIndex((c) => c.offsetTop !== top);
  return i > 0 ? i : cells.length;
}

/** A question's scan as the light viewer takes one, for f. */
function asScan(s: QScan): Scan {
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
    series: s.series,
    orientation: null,
    images: null,
    picture: s.picture,
    partial: s.partial,
    questions: [],
  };
}

/** The scans left for later in this sitting, set apart again when they come back. */
function withSkips(s: GridState, skipped: Set<number>): GridState {
  let out = s;
  for (const scan of s.page.scans) if (skipped.has(scan.stack) && out.tiles[scan.stack]?.kind !== "apart") out = toggleApart(out, scan.stack);
  return { ...out, focus: s.focus };
}

/** The keys, behind the bar's one ? chip. */
export const KEYS_HELP = "1 and 2: that answer for every scan · click a scan: the other answer, and back · shift-click or space: set a scan apart, it stays open · 0: another value for the scan in focus (one set apart: for all set apart) · arrows: move · f: full size · Enter: apply · ?: each scan's rule";

export function QuestionGrid({ caps, qkey, where }: { caps: Capabilities; qkey: string; where: Where }) {
  const [state, setState] = useState<GridState | null>(null);
  const [list, setList] = useState<QuestionList | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(() => {
    const c = carried;
    carried = null;
    return c;
  });
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const [done, setDone] = useState(false);
  const ahead = useRef<{ page: number; got: Promise<QPage | null> } | null>(null);
  const skipped = useRef<Set<number>>(new Set());
  const grid = useRef<HTMLDivElement | null>(null);
  const answering = mayAnswer(caps);
  const whereKey = `${where.dataset ?? ""}|${where.cohort ?? ""}`;

  /** Read a page ahead, so it draws at once when its turn comes. */
  const prefetch = useCallback(
    (page: number) => {
      ahead.current = { page, got: questions.scans(qkey, where, page).catch(() => null) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the question and its scope are what read
    [qkey, whereKey],
  );

  const read = useCallback(() => {
    return questions.scans(qkey, where, 1).then(
      (p) => {
        setFailed(null);
        if (p.scans.length === 0) return setDone(true);
        setState(withSkips(gridOf(p), skipped.current));
        // the page after this one is read now, so it draws at once
        if (p.pages > 1) prefetch(2);
        else ahead.current = null;
      },
      (e: unknown) => {
        const r = refusedWords(e);
        if (r.stale) setDone(true);
        else setFailed(r.words);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the question and its scope are what read
  }, [qkey, whereKey, prefetch]);

  useEffect(() => {
    void read();
    questions.list(where).then(setList, () => setList(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the question and its scope are what read
  }, [qkey, whereKey]);

  /** The next question of the list, read again, or the done page. */
  const next = useCallback(() => {
    questions.list(where).then(
      (l) => {
        setList(l);
        const to = l.questions.find((x) => x.key !== qkey);
        if (to) {
          location.hash = gridHref(to.key, where);
          return;
        }
        // the last question: what was said stays on this page, and goes to no other
        carried = null;
        setDone(true);
      },
      () => {
        carried = null;
        setDone(true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the question and its scope are what read
  }, [qkey, whereKey]);

  const apply = useCallback(() => {
    if (!state || busy) return;
    if (!answering) return setSaid("Answering needs work on the Review page.");
    const body = answerBody(state, where);
    if (!body) return setSaid("This question offers no answer to apply.");
    const was = state;
    setBusy(true);
    questions
      .answer(qkey, body)
      .then((a) => {
        const words = answeredWords(a, was);
        setSaid(words);
        for (const s of a.skipped) skipped.current.add(s);
        // done here when nothing is left but what was left for later
        if (a.left === 0 || a.left <= skipped.current.size) {
          carried = words;
          next();
          return;
        }
        const after = ahead.current;
        ahead.current = null;
        if (a.skipped.length === 0 && after) {
          // the page read ahead is the next page now that this one is answered
          void after.got.then((p) => {
            if (p && p.scans.length > 0) {
              setState(withSkips(gridOf({ ...p, page: 1, pages: Math.max(1, Math.ceil(a.left / p.limit)), total: a.left }), skipped.current));
              if (a.left > p.scans.length) prefetch(2);
            } else void read();
          });
        } else void read();
      })
      .catch((e: unknown) => {
        const r = refusedWords(e);
        setSaid(r.words);
        if (r.stale) void read();
      })
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the state is what applies
  }, [state, busy, answering, qkey, whereKey, next, read, prefetch]);

  // the keys, on the window while the page is open; a field, a dialog or the full view keeps its own
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
      const act = keyAct(e.key, columnsOf(grid.current));
      if (act.kind === "none") return;
      // a focused button or link takes its own Enter and space
      if ((act.kind === "apply" || act.kind === "apart") && t?.closest?.("a, button")) return;
      e.preventDefault();
      switch (act.kind) {
        case "key":
          return setState((s) => (s ? chooseKey(s, act.key) : s));
        case "list":
          return setState((s) => (s ? openList(s) : s));
        case "apart":
          return setState((s) => (s && s.focus !== null ? toggleApart(s, s.focus) : s));
        case "apply":
          return k.apply();
        case "move":
          return setState((s) => (s ? moved(s, act.by) : s));
        case "full":
          return setFull(true);
        case "reasons":
          return setState((s) => (s ? { ...s, reasons: !s.reasons } : s));
        case "back":
          if (k.state.listing !== null) return setState((s) => (s ? { ...s, listing: null } : s));
          location.hash = listHref(where);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scope is read when Esc leaves
  }, [whereKey]);

  // the focused tile stays in view as the keys move it
  useEffect(() => {
    if (!state || state.focus === null) return;
    grid.current?.querySelector<HTMLElement>(`[data-stack="${state.focus}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [state?.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = list?.questions.find((x) => x.key === qkey) ?? null;
  const following = list?.questions.find((x) => x.key !== qkey) ?? null;
  return (
    <GridBody
      caps={caps}
      state={state}
      question={row}
      where={where}
      failed={failed}
      said={said}
      busy={busy}
      done={done}
      full={full}
      answering={answering}
      hasNext={following !== null}
      grid={grid}
      onState={setState}
      onApply={apply}
      onNext={next}
      onFull={setFull}
    />
  );
}

export interface GridBodyProps {
  caps: Capabilities;
  state: GridState | null;
  /** The question as the list says it, for its kinds; null until the list is read. */
  question: Question | null;
  where: Where;
  failed: string | null;
  said: string | null;
  busy: boolean;
  done: boolean;
  full: boolean;
  answering: boolean;
  hasNext: boolean;
  grid?: React.RefObject<HTMLDivElement | null>;
  onState: (f: (s: GridState | null) => GridState | null) => void;
  onApply: () => void;
  onNext: () => void;
  onFull: (open: boolean) => void;
}

/** The grid as it draws from its state: the head, one bar, the pictures. */
export function GridBody(p: GridBodyProps) {
  const s = p.state;
  const page = s?.page ?? null;
  const palette = useMemo(() => (page ? slots(page.vocabulary, page.values) : []), [page]);
  const kinds = Object.entries(p.question?.kinds ?? {}).sort((a, b) => b[1] - a[1]);
  const ask = asksPeople(p.caps) && kinds.length > 0 ? askPeopleHref({ kind: kinds[0][0], cohort: p.where.cohort ?? null }) : null;
  const blind = page ? page.scans.filter((x) => x.blind).length : 0;
  const focusAt = s && page ? Math.max(0, page.scans.findIndex((x) => x.stack === s.focus)) : 0;
  const set = (f: (s: GridState) => GridState) => p.onState((x) => (x ? f(x) : x));
  const head = (
    <div className="qgrid-head">
      <span className="eyebrow">
        <a href={listHref(p.where)}>Review · Questions</a>
      </span>
      <h1>{page?.words ?? p.question?.words ?? "Question"}</h1>
      {page && (
        <span className="meta">
          {[
            page.reason,
            scans(page.total),
            page.pages > 1 ? `${n(page.scans.length)} on this page` : null,
            page.system1.status === "not_confirmed" && page.scans.some((x) => x.system1) ? "System 1 not confirmed" : null,
            blind > 0 ? `${scans(blind)} read blind first, NILS's answers hidden` : null,
            page.pictures && !page.pictures.shown && page.pictures.why ? `no pictures: ${page.pictures.why}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      <span className="grow" />
      {ask && (
        <a className="button quiet small" href={ask}>
          Ask people about these
        </a>
      )}
      {p.hasNext && (
        <button type="button" className="button quiet small" onClick={p.onNext}>
          Next question
        </button>
      )}
    </div>
  );
  if (p.done)
    return (
      <section className="qgrid-page" aria-label="question">
        {head}
        <div className="qgrid-done">
          {p.said && <p className="meta said qgrid-said">{p.said}</p>}
          <p className="lede">Nothing left to answer here.</p>
          <a className="button" href={listHref(p.where)}>
            Questions
          </a>
        </div>
      </section>
    );
  /** One of the two answers as a coloured chip: pressed, it is the answer of every scan not set otherwise. */
  const chip = (key: "1" | "2") => {
    const v = s ? keyValue(s, key) : null;
    if (!s || v === null) return null;
    const on = s.answer === v;
    return (
      <button
        key={key}
        type="button"
        className={on ? "opt q-chip on" : "opt q-chip"}
        aria-pressed={on}
        title={on ? `${v}: every scan not set otherwise` : `${v} for every scan not set otherwise`}
        {...valueTone(palette, v)}
        onClick={(e) => {
          set((x) => chooseKey(x, key));
          e.currentTarget.blur();
        }}
      >
        <kbd>{key}</kbd>
        {v}
      </button>
    );
  };
  const forApart = s && focusApart(s) ? apartOf(s).length : 0;
  return (
    <section className="qgrid-page" aria-label="question">
      {head}
      {p.failed && (
        <p className="warn">
          <Icon name="alert" /> {p.failed}
        </p>
      )}
      {!s && !p.failed && <Wait phase="reading the scans" since={Date.now()} size="line" />}
      {s && page && (
        <div className="qgrid-bar" role="toolbar" aria-label="answers">
          <span className="q-keys">
            {chip("1")}
            {chip("2")}
            <button
              type="button"
              className={s.listing !== null ? "opt q-other on" : "opt q-other"}
              aria-expanded={s.listing !== null}
              title={forApart > 0 ? `another value for the ${scans(forApart)} set apart` : "another value for the scan in focus"}
              onClick={(e) => {
                set((x) => openList(x));
                e.currentTarget.blur();
              }}
            >
              <kbd>0</kbd>
              other…
            </button>
            <button type="button" className={s.reasons ? "opt q-help on" : "opt q-help"} aria-pressed={s.reasons} aria-label="the keys" title={KEYS_HELP} onClick={() => set((x) => ({ ...x, reasons: !x.reasons }))}>
              ?
            </button>
          </span>
          <span className="grow" />
          <span className="q-tally" role="status" aria-live="polite">
            {tallyWords(s)}
          </span>
          <button type="button" className="button" disabled={p.busy || s.answer === null || !p.answering} onClick={p.onApply}>
            Apply <kbd>Enter</kbd>
          </button>
          {s.listing === "apart" && <ValueList state={s} palette={palette} onState={set} />}
        </div>
      )}
      {p.said && <p className="meta said qgrid-said">{p.said}</p>}
      {s && page && (
        <div className="qgrid" ref={p.grid} data-qgrid="">
          {page.scans.map((x) => (
            <Tile
              key={x.stack}
              scan={x}
              state={s}
              palette={palette}
              onToggle={() => set((y) => (otherOf(y) === null ? openList({ ...y, focus: x.stack }, x.stack) : toggleTile(y, x.stack)))}
              onApart={() => set((y) => toggleApart(y, x.stack))}
              onState={set}
            />
          ))}
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

/** The axis's whole value list, open once for one scan or for the scans set apart, closed by the pick. */
function ValueList({ state: s, palette, onState }: { state: GridState; palette: string[]; onState: (f: (s: GridState) => GridState) => void }) {
  const page = s.page;
  const forApart = s.listing === "apart";
  const stack = typeof s.listing === "number" ? s.listing : null;
  const have = stack !== null ? s.tiles[stack] : null;
  const count = forApart ? apartOf(s).length : 1;
  const who = forApart ? `the ${scans(count)} set apart` : `scan ${stack}`;
  return (
    <div className="q-pop" role="group" aria-label={`a value for ${who}`} onClick={(e) => e.stopPropagation()}>
      <span className="meta q-pop-for">
        {who} · {axisWords(page.axis)}
      </span>
      {page.vocabulary.map((v) => {
        const on = have?.kind === "value" && have.value === v.value;
        return (
          <button key={v.value} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} {...chosenTone(palette, v.value, on)} onClick={() => onState((x) => chooseValue(x, v.value))}>
            {valueLabel(page.vocabulary, v.value)}
          </button>
        );
      })}
      <button type="button" className={have?.kind === "nothing" ? "opt on" : "opt"} aria-pressed={have?.kind === "nothing"} onClick={() => onState(chooseNothing)}>
        no value
      </button>
    </div>
  );
}

/** A scan's tile: its picture framed in the colour of the answer it will get, the answer word in its corner, its name. */
function Tile({ scan: x, state: s, palette, onToggle, onApart, onState }: { scan: QScan; state: GridState; palette: string[]; onToggle: () => void; onApart: () => void; onState: (f: (s: GridState) => GridState) => void }) {
  const t = s.tiles[x.stack] ?? null;
  const to = tileAnswer(s, x.stack);
  const apart = to?.kind === "skip";
  const focused = s.focus === x.stack;
  const agrees = x.system1?.agrees === true && x.nils !== null;
  const word = !to ? "no answer yet" : to.kind === "skip" ? "set apart" : to.kind === "nothing" ? "no value" : to.value;
  const cls = ["q-tile", focused ? "focused" : "", t ? "own" : "", apart ? "apart" : "", to?.kind === "nothing" ? "nothing" : "", x.blind ? "blind" : "", agrees ? "dim" : ""].filter(Boolean).join(" ");
  const s1 = opinionWords(x.system1);
  const rule = s.reasons ? ruleLine(x.rules) : null;
  const title = [x.description, x.subject?.code ? `subject ${x.subject.code}` : null, x.day, x.blind ? "read blind: NILS's answer hidden" : `NILS: ${x.nils ?? "no value"}`, s1 ? `System 1: ${s1}` : null].filter(Boolean).join(" · ");
  const tone = to?.kind === "value" ? valueTone(palette, to.value) : {};
  return (
    <div
      className={cls}
      data-stack={x.stack}
      {...tone}
      aria-label={`scan ${x.stack}: ${word}${x.blind ? ", blind" : ""}`}
      aria-current={focused ? "true" : undefined}
      title={title}
      onClick={(e) => (e.shiftKey ? onApart() : onToggle())}
    >
      <div className="q-pic">
        {x.picture ? <img src={x.picture} alt="" decoding="async" draggable={false} /> : <span className="q-blank">no picture yet</span>}
        {x.blind && <span className="q-mark q-blind">blind</span>}
        {x.staged?.value && (
          <span className="q-mark q-staged" title={`proposed by ${x.staged.actor ?? x.staged.author_kind ?? "a model"}, for a person to confirm`}>
            proposed {x.staged.value}
          </span>
        )}
        {s1 && (
          <span className="q-mark q-s1" {...valueTone(palette, x.system1?.value)} title={x.system1?.agrees ? "System 1 agrees" : "System 1 answers otherwise"}>
            S1 {s1}
          </span>
        )}
        <span className="q-mark q-answer" {...tone}>
          {word}
        </span>
      </div>
      <div className="q-name">{x.name ?? x.description ?? `scan ${x.stack}`}</div>
      {rule && <div className="q-rule">{rule}</div>}
      {s.listing === x.stack && <ValueList state={s} palette={palette} onState={onState} />}
    </div>
  );
}
