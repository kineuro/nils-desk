// SPDX-License-Identifier: AGPL-3.0-only
// Review round 1 (record 56 section 6.3; studies/2026-10-09-review-round1,
// DR1 and DR2): the few questions the sort leaves to a person. The list says
// each in plain words with its distinct scans ("Which base? 7 scans") and
// why it is asked; one click opens its grid, a page of its scans' pictures,
// each framed in the colour of NILS's answer, with System 1's answer as a
// second small mark (the tiles it agrees with step back) and a staged answer
// marked. Two keys above the grid give the two answers in dispute, 0 the
// axis's whole list and - no value; space sets the focused scan apart (it
// takes the other key's answer), Enter applies to the page, and the next
// page, then the next question, opens. The arrows move, f opens a scan full
// size with its slices, ? shows each scan's rule and what it was decided
// over. No dialog, no scope, no why field.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { valueTone, chosenTone } from "../campaigns/values";
import { ScanViewer } from "../data/ScanViewer";
import type { Scan } from "../data/scans";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { askPeopleHref, asksPeople } from "./askPeople";
import {
  answerBody,
  answeredWords,
  chooseKey,
  chooseNothing,
  chooseValue,
  elsewhereHref,
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
  setApart,
  slots,
  tally,
  tileAnswer,
  toggleApart,
  valueLabel,
  type Apart,
  type GridState,
  type QPage,
  type QScan,
  type Question,
  type QuestionList,
  type Where,
} from "./questions";
import "../campaigns/campaigns.css";
import "./questions.css";

const n = (v: number) => v.toLocaleString("en-US");
const scans = (v: number) => `${n(v)} ${v === 1 ? "scan" : "scans"}`;

// ------------------------------------------------------------ DR1, the list

export interface QuestionsListProps {
  list: QuestionList | null;
  where: Where;
  failed?: string | null;
  since?: number;
}

/** The questions in plain words, each with its distinct scans and why, and the way to its grid. */
export function QuestionsList({ list, where, failed = null, since = Date.now() }: QuestionsListProps) {
  if (failed) return <p className="warn">The questions could not be read: {failed}</p>;
  if (!list) return <Wait phase="reading the questions" since={since} size="line" />;
  const elsewhere = list.elsewhere.filter((e) => e.scans > 0);
  return (
    <section className="questions" aria-label="Questions">
      {list.questions.length === 0 ? (
        <p className="meta q-none">No question waits: the rules decided every scan.</p>
      ) : (
        <ul className="q-rows">
          {list.questions.map((q) => (
            <li key={q.key} className="q-row" data-key={q.key}>
              <a className="q-what" href={gridHref(q.key, where)}>
                <span className="q-words">{q.words}</span>
                {q.reason && <span className="meta">{q.reason}</span>}
              </a>
              <span className="q-count">
                <b>{n(q.scans)}</b> {q.scans === 1 ? "scan" : "scans"}
                {q.staged > 0 && <span className="tag caution">{n(q.staged)} staged</span>}
              </span>
              <span className="q-act">
                <a className="button small" href={gridHref(q.key, where)}>
                  Answer
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      {elsewhere.map((e) => {
        const to = elsewhereHref(e, where);
        return (
          <p key={e.kind} className="meta q-else">
            {e.words}: {scans(e.scans)}
            {to ? <a href={to}>Open</a> : " · below"}
          </p>
        );
      })}
      {list.held.scans > 0 && (
        <p className="meta q-held">
          {scans(list.held.scans)} {list.held.scans === 1 ? "is" : "are"} held by {list.held.campaigns.length === 1 ? `campaign ${list.held.campaigns[0].name}` : `${n(list.held.campaigns.length)} campaigns`}, answered there.
        </p>
      )}
    </section>
  );
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
  for (const scan of s.page.scans) if (skipped.has(scan.stack)) out = setApart(out, scan.stack, { kind: "skip" });
  return out;
}

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
    if (!body) return setSaid("Choose an answer first: 1, 2, 0 or -.");
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
        case "nothing":
          return setState((s) => (s ? chooseNothing(s) : s));
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

/** The grid as it draws from its state. */
export function GridBody(p: GridBodyProps) {
  const s = p.state;
  const page = s?.page ?? null;
  const palette = useMemo(() => (page ? slots(page.vocabulary, page.values) : []), [page]);
  const t = s ? tally(s) : null;
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
          {[page.reason, scans(page.total), page.pages > 1 ? `${n(page.scans.length)} on this page` : null, page.system1.status === "not_confirmed" && page.scans.some((x) => x.system1) ? "System 1 not confirmed" : null].filter(Boolean).join(" · ")}
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
  const keyButton = (key: "1" | "2") => {
    const v = s ? keyValue(s, key) : null;
    if (!s || v === null) return null;
    const on = s.choice?.kind === "value" && s.choice.value === v && s.choice.key === key;
    return (
      <button
        key={key}
        type="button"
        className={on ? "opt on" : "opt"}
        aria-pressed={on}
        {...chosenTone(palette, v, on)}
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
  const listed = s?.choice?.kind === "value" && s.choice.key === "0" ? s.choice.value : null;
  const nothing = s?.choice?.kind === "nothing";
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
        <div className="qgrid-bar" role="toolbar" aria-label="keys">
          <span className="q-keys">
            {keyButton("1")}
            {keyButton("2")}
            <button
              type="button"
              className={listed ? "opt on" : "opt"}
              aria-pressed={listed !== null}
              aria-expanded={s.listing === "answer"}
              {...(listed ? chosenTone(palette, listed, true) : {})}
              onClick={(e) => {
                set((x) => openList(x));
                e.currentTarget.blur();
              }}
            >
              <kbd>0</kbd>
              {listed ?? "other value"}
            </button>
            <button
              type="button"
              className={nothing ? "opt on" : "opt"}
              aria-pressed={nothing}
              onClick={(e) => {
                set(chooseNothing);
                e.currentTarget.blur();
              }}
            >
              <kbd>-</kbd>no value
            </button>
          </span>
          <span className="q-help">
            <span>
              <kbd>space</kbd>set apart
            </span>
            <span>
              <kbd>f</kbd>full size
            </span>
            <span>
              <kbd>?</kbd>why
            </span>
          </span>
          <span className="grow" />
          {t && (
            <span className="q-tally" role="status" aria-live="polite">
              <b>{n(t.total)}</b> {t.total === 1 ? "scan" : "scans"}
              {t.answer ? (
                <>
                  {" · "}
                  <b>{t.answer}</b>
                </>
              ) : null}
              {t.apart > 0 ? <> · <b>{n(t.apart)}</b> set apart</> : null}
            </span>
          )}
          <button type="button" className="button" disabled={p.busy || !s.choice || !p.answering} onClick={p.onApply}>
            Apply <kbd>Enter</kbd>
          </button>
        </div>
      )}
      {s && page && s.listing !== null && (
        <div className="q-list" role="group" aria-label={typeof s.listing === "number" ? `the value of scan ${s.listing}` : `every value of ${page.axis.replaceAll("_", " ")}`}>
          <span className="meta">{typeof s.listing === "number" ? `scan ${s.listing}` : page.axis.replaceAll("_", " ")}</span>
          {page.vocabulary.map((v) => {
            const on = s.listing === "answer" && s.choice?.kind === "value" && s.choice.value === v.value;
            return (
              <button key={v.value} type="button" className={on ? "opt on" : "opt"} {...chosenTone(palette, v.value, on)} onClick={() => set((x) => chooseValue(x, v.value))}>
                {valueLabel(page.vocabulary, v.value)}
              </button>
            );
          })}
          <button type="button" className="opt" onClick={() => set(chooseNothing)}>
            no value
          </button>
        </div>
      )}
      {p.said && <p className="meta said qgrid-said">{p.said}</p>}
      {page?.pictures && !page.pictures.shown && page.pictures.why && <p className="meta">No pictures: {page.pictures.why}</p>}
      {blind > 0 && <p className="meta">{scans(blind)} read blind first: NILS's answers are hidden on {blind === 1 ? "it" : "them"}.</p>}
      {s && page && (
        <div className="qgrid" ref={p.grid} data-qgrid="">
          {page.scans.map((x) => (
            <Tile key={x.stack} scan={x} state={s} palette={palette} onToggle={() => set((y) => toggleApart({ ...y, focus: x.stack }, x.stack))} onApart={(a) => set((y) => setApart(y, x.stack, a))} />
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

/** What a set-apart tile's own picker shows: a value, no value, or later. */
function apartChoice(s: GridState, stack: number): string {
  const a = tileAnswer(s, stack);
  if (!a || a.kind === "skip") return "~skip";
  return a.kind === "nothing" ? "~nothing" : a.value;
}

function Tile({ scan: x, state: s, palette, onToggle, onApart }: { scan: QScan; state: GridState; palette: string[]; onToggle: () => void; onApart: (a: Apart) => void }) {
  const apart = x.stack in s.apart;
  const focused = s.focus === x.stack;
  const agrees = x.system1?.agrees === true && x.nils !== null;
  const cls = ["q-tile", x.blind ? "blind" : x.nils === null ? "none" : "", focused ? "focused" : "", apart ? "apart" : "", agrees ? "dim" : ""].filter(Boolean).join(" ");
  const s1 = opinionWords(x.system1);
  const rule = s.reasons ? ruleLine(x.rules) : null;
  const to = apart ? tileAnswer(s, x.stack) : null;
  const other = otherOf(s);
  const label = `scan ${x.stack}: ${x.blind ? "blind" : (x.nils ?? "no value")}${apart ? `, set apart${to?.kind === "value" ? ` to ${to.value}` : to?.kind === "nothing" ? " to no value" : ", for later"}` : ""}`;
  return (
    <div className={cls} data-stack={x.stack} {...(x.blind ? {} : valueTone(palette, x.nils))} aria-label={label} aria-current={focused ? "true" : undefined} title={[x.description, x.subject?.code ? `subject ${x.subject.code}` : null, x.day].filter(Boolean).join(" · ") || undefined} onClick={onToggle}>
      <div className="q-pic">
        {x.picture ? <img src={x.picture} alt="" decoding="async" draggable={false} /> : <span className="q-blank">no picture yet</span>}
        {x.blind && <span className="q-mark q-blind">blind</span>}
        {x.staged?.value && (
          <span className="q-mark q-staged" title={`staged by ${x.staged.actor ?? x.staged.author_kind ?? "a model"}, for a person to confirm`}>
            staged {x.staged.value}
          </span>
        )}
        {s1 && (
          <span className="q-mark q-s1" {...valueTone(palette, x.system1?.value)} title={x.system1?.agrees ? "System 1 agrees" : "System 1 answers otherwise"}>
            S1 {s1}
          </span>
        )}
      </div>
      <div className="q-line">
        <span className="q-nils">{x.blind ? "blind" : (x.nils ?? "no value")}</span>
        {apart && (
          <span className="q-to" onClick={(e) => e.stopPropagation()}>
            →
            <select
              aria-label={`answer for scan ${x.stack}`}
              value={apartChoice(s, x.stack)}
              onChange={(e) => {
                const v = e.target.value;
                onApart(v === "~skip" ? { kind: "skip" } : v === "~nothing" ? { kind: "nothing" } : v === other ? { kind: "other" } : { kind: "value", value: v });
                e.target.blur();
              }}
            >
              {palette.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              <option value="~nothing">no value</option>
              <option value="~skip">later</option>
            </select>
          </span>
        )}
      </div>
      <div className="q-name">{x.name ?? x.description ?? `scan ${x.stack}`}</div>
      {rule && <div className="q-rule">{rule}</div>}
    </div>
  );
}
