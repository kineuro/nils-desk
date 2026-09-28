// SPDX-License-Identifier: AGPL-3.0-only
// The A/B view (record 48, the reference read by judges). Independent voters
// read every stack; where they differ on an axis the person settles it here,
// blind: each axis's candidates as letters in the order the engine drew, each
// with one reason (the header facts it cites), and never who gave which. The
// axes they agree on are filled in, one key confirms; neither opens a free
// choice; can't tell stays out of the reference. Body part always shows with
// the pictures; a localizer asks its provenance and body part alone. After a
// choice the person may give its cause (1 to 5). The pictures and the file's
// header show as the reader shows them, on one screen, and the engine times
// each decision from the claim.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { abDoors, abKey, abProblem, answerOf, askedRows, CAUSE_WORDS, causeWords, choose, chosenValue, decided, decisionsFile, LETTER_KEYS, reset, sendsWords, shareWords, startOf, toggleCause, unsettled, valueWords, type AbRow, type AbSheet, type AbState, type AbSummary, type AbValue, type Choice } from "./ab";
import { axisValues, beatEvery, campaigns, itemWords, leaseLeft, leaseWords, refused as refusedWords, type Campaign, type HeaderDoc, type Question } from "./client";
import { nameHit, vocabularyOf, type ValueNames } from "./lookup";
import { HeaderBlock, HeaderDoors, HeaderDrawer, headerLinesOf } from "./ReaderParts";
import type { Reading } from "./reader";
import { claimIn, headerDoorOf, headerFor, readingFor } from "./readerDoors";
import { StackView } from "./StackView";
import { valueTone } from "./values";
import { beatSeat, seatOf, type Seat } from "./workspace";

const VIEW_KEY = "nils.reader.view";
type View = "stack" | "planes";
function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // a private window keeps nothing; the page works the same
  }
}

const secondsWords = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function AbReader({ caps, id }: { caps: Capabilities; id: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat>({ kind: "claiming" });
  const [sheet, setSheet] = useState<AbSheet | null>(null);
  const [sheetFailed, setSheetFailed] = useState<string | null>(null);
  const [st, setSt] = useState<AbState | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [summary, setSummary] = useState<AbSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [headerDoc, setHeaderDoc] = useState<HeaderDoc | null>(null);
  const [headerFailed, setHeaderFailed] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => (remembered(VIEW_KEY) === "stack" ? "stack" : "planes"));
  const chooseView = useCallback((v: View) => {
    remember(VIEW_KEY, v);
    setView(v);
  }, []);
  const capsNow = useRef(caps);
  capsNow.current = caps;

  const claim = useCallback(
    (note: string | null = null) => {
      setSeat({ kind: "claiming" });
      claimIn(id, "rater", "position")
        .then((c) => setSeat(seatOf(c, note)))
        .catch((e: unknown) => setSeat({ kind: "failed", why: refusedWords(e) }));
    },
    [id],
  );
  const refreshSummary = useCallback(() => {
    abDoors.summary(id).then(setSummary, () => undefined);
  }, [id]);

  useEffect(() => {
    let alive = true;
    campaigns
      .one(id)
      .then((c) => {
        if (!alive) return;
        setCampaign(c);
        claim();
        refreshSummary();
      })
      .catch((e: unknown) => alive && setFailed(refusedWords(e)));
    return () => {
      alive = false;
    };
  }, [id, claim, refreshSummary]);

  const holding = seat.kind === "holding" ? seat : null;
  const item = holding?.item ?? null;
  const assignmentId = holding?.assignment.id ?? null;
  const current = useRef<number | null>(null);
  current.current = item?.id ?? null;
  const q = campaign?.question ?? null;

  // a new item: its sheet, its file, the clock
  useEffect(() => {
    if (!q || !item) return;
    setSheet(null);
    setSheetFailed(null);
    setSt(null);
    setReading(null);
    setRefused(null);
    setHeaderOpen(false);
    setHeaderDoc(null);
    setHeaderFailed(null);
    setShownAt(Date.now());
    const at = item.id;
    abDoors.sheet(id, at).then(
      (s) => {
        if (current.current !== at) return;
        setSheet(s);
        setSt(startOf(s));
      },
      (e: unknown) => current.current === at && setSheetFailed(refusedWords(e)),
    );
    readingFor(capsNow.current, id, q, item).then((r) => current.current === at && setReading(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // the heartbeat keeps the lease; the clock ticks
  const leaseSeconds = campaign?.lease_seconds ?? 3600;
  useEffect(() => {
    if (assignmentId === null) return;
    const t = setInterval(() => {
      campaigns
        .renew(capsNow.current, id, assignmentId, "rater")
        .then((c) => setSeat((s) => beatSeat(s, c)))
        .catch(() => undefined);
    }, beatEvery(leaseSeconds));
    return () => clearInterval(t);
  }, [id, assignmentId, leaseSeconds]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const headerDoor = item ? headerDoorOf(caps, id, item.id, reading) : null;
  const openHeader = useCallback(() => {
    if (!headerDoor) return;
    setHeaderOpen(true);
    setHeaderFailed(null);
    const at = current.current;
    headerFor(headerDoor).then(
      (d) => current.current === at && setHeaderDoc(d),
      (e: unknown) => current.current === at && setHeaderFailed(refusedWords(e)),
    );
  }, [headerDoor]);

  const answer = useCallback(() => {
    if (!holding || !sheet || !st || busy || !q) return;
    const open = unsettled(sheet, st);
    if (open.length > 0) {
      setRefused(`Settle ${open.join(", ")} first: a letter, n for neither or x for can't tell.`);
      const rows = askedRows(sheet);
      setSt({ ...st, active: Math.max(0, rows.findIndex((r) => r.axis === open[0])) });
      return;
    }
    const problem = abProblem(q, sheet, st);
    if (problem) {
      setRefused(`The pack does not allow this: ${problem}.`);
      return;
    }
    const value = answerOf(sheet, st);
    if (!value) return;
    setBusy(true);
    const words = sendsWords(sheet, st);
    const causes = Object.entries(st.causes);
    const it = holding.item;
    campaigns
      .answer(id, holding.assignment.id, { value })
      .then(async (r) => {
        // the causes after the answer, each its own act; one refused does not undo the answer
        let lost = 0;
        for (const [axis, cause] of causes) await abDoors.cause(id, r.answer, axis, cause).catch(() => lost++);
        setSaid(`Settled ${itemWords(it)}: ${words}${lost > 0 ? `; ${lost} cause(s) not kept` : ""}.`);
        refreshSummary();
        claim();
      })
      .catch((e: unknown) => setRefused(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [holding, sheet, st, busy, q, id, claim, refreshSummary]);

  const giveBack = useCallback(
    (then: "next" | "stop") => {
      if (!holding || busy) return;
      setBusy(true);
      campaigns
        .release(id, holding.assignment.id)
        .then(() => {
          setSaid(`Gave ${itemWords(holding.item)} back.`);
          if (then === "next") claim();
          else location.hash = href("campaigns", id);
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
    },
    [holding, busy, id, claim],
  );

  const edit = useCallback((f: (s: AbState) => AbState) => {
    setRefused(null);
    setSt((s) => (s ? f(s) : s));
  }, []);

  // the keys
  const keyed = useRef({ sheet, st, answer, giveBack, openHeader, header: headerDoor !== null });
  keyed.current = { sheet, st, answer, giveBack, openHeader, header: headerDoor !== null };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("dialog, .drawer")) return;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      // Enter on a button or a link is that element's
      if (e.key === "Enter" && !inField && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
      const rows = k.sheet ? askedRows(k.sheet) : [];
      const row = k.st ? rows[k.st.active] : undefined;
      const act = abKey(e.key, { ctrl: e.ctrlKey, shift: e.shiftKey, inField, candidates: row?.candidates.length ?? 0, causes: k.st?.last ? 5 : 0, header: k.header });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "answer") return k.answer();
      if (act.kind === "skip") return k.giveBack("next");
      if (act.kind === "header") return k.openHeader();
      if (act.kind === "keys") return setKeys((x) => !x);
      if (!k.sheet || !k.st || !row) return;
      const sheet = k.sheet;
      if (act.kind === "letter") edit((s) => choose(sheet, s, { kind: "candidate", label: row.candidates[act.index].label }));
      else if (act.kind === "neither") edit((s) => ({ ...s, free: row.axis }));
      else if (act.kind === "cant_tell") edit((s) => choose(sheet, s, { kind: "cant_tell" }));
      else if (act.kind === "reset") edit((s) => reset(sheet, s));
      else if (act.kind === "move") edit((s) => ({ ...s, active: (s.active + act.by + rows.length) % rows.length, free: null }));
      else if (act.kind === "cause") {
        const causes = sheet.causes.length > 0 ? sheet.causes : Object.keys(CAUSE_WORDS);
        edit((s) => (s.last && causes[act.index] ? toggleCause(s, s.last, causes[act.index]) : s));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  if (failed) return <p className="warn">The campaign could not be read: {failed}</p>;
  if (!campaign || !q) return <Wait phase="reading the campaign" since={now} size="panel" />;
  const left = holding ? leaseLeft(holding.assignment, now) : null;
  const open = campaign.counts.items.open ?? null;
  return (
    <section className="data campaign-rate reader-one ab-reader">
      <div className="reader-head">
        <span className="eyebrow">
          <a href={href("campaigns")}>Campaigns</a> · <a href={href("campaigns", String(campaign.id))}>{campaign.name}</a>
        </span>
        <h1>Settle</h1>
        <span className="grow said-slot">
          {said && (
            <p key={said} className="meta said" title={said}>
              <Icon name="check" />
              {said}
            </p>
          )}
        </span>
        <span className="rate-count-line">
          {summary && (
            <span title={`causes given: ${causeWords(summary)}`}>
              <b>{summary.answered}</b> of {summary.items} settled · {shareWords(summary)}
              {summary.median !== null && ` · median ${summary.median} s`}
            </span>
          )}
          {summary === null && open !== null && (
            <span>
              <b>{open}</b> open
            </span>
          )}
          {holding && shownAt !== null && (
            <span className="on-this" title="how long this item has been on the screen">
              {" "}
              · this one <b>{secondsWords(now - shownAt)}</b>
            </span>
          )}
        </span>
      </div>
      <SeatNote seat={seat} campaign={campaign} now={now} onAgain={() => claim()} />
      {holding && (
        <div className="rate-grid">
          <div className="rate-picture">{holding.item.stack_id !== null && <StackView stack={holding.item.stack_id} view={view} onView={chooseView} keys />}</div>
          <div className="rate-side" data-reader-panel="">
            <div className="rate-item">
              <b>{itemWords(holding.item)}</b>
              <span className="meta">item {holding.item.position + 1}</span>
              <span className={left !== null && left < 120 ? "tag caution" : "tag"} title={holding.assignment.lease_until ?? undefined}>
                <Icon name="clock" />
                {leaseWords(left)}
              </span>
              {sheet?.localizer && (
                <span className="tag" title="a localizer: its provenance and body part are asked, the rest is not asked (reading guide ruling 1)">
                  localizer
                </span>
              )}
              <HeaderDoors whole={headerDoor !== null} onWhole={openHeader} />
            </div>
            <HeaderBlock lines={headerLinesOf(reading)} flat={reading?.header ?? []} />
            {sheetFailed && <p className="warn">The candidates could not be read: {sheetFailed}</p>}
            {!sheet && !sheetFailed && <Wait phase="reading the candidates" since={shownAt ?? now} size="line" />}
            {sheet && st && <AbRows q={q} sheet={sheet} st={st} busy={busy} onEdit={edit} />}
            {sheet && st && (
              <p className="meta pending one-line" title={sendsWords(sheet, st)}>
                Sends: {sendsWords(sheet, st)}
              </p>
            )}
            {refused && (
              <p className="warn one-line" title={refused}>
                {refused}
              </p>
            )}
            <div className="row actions">
              <span className="act-main" role="group" aria-label="the answer">
                <button type="button" className="button act-answer" disabled={busy || !sheet} onClick={answer}>
                  Answer <kbd>Enter</kbd>
                </button>
              </span>
              <button type="button" className="button secondary" disabled={busy} onClick={() => giveBack("next")} title="Back to the pool; never to you again">
                Give back <kbd>s</kbd>
              </button>
              <span className="grow" />
              <button type="button" className="button quiet" disabled={busy} onClick={() => giveBack("stop")}>
                Stop
              </button>
              <button type="button" className="icon-button" aria-label="Keys" aria-expanded={keys} onClick={() => setKeys((x) => !x)}>
                <kbd>?</kbd>
              </button>
            </div>
            {keys && (
              <div className="drawer keys-drawer" role="dialog" aria-label="keys">
                <AbKeyList header={headerDoor !== null} />
              </div>
            )}
            {headerOpen && <HeaderDrawer doc={headerDoc} failed={headerFailed} onClose={() => setHeaderOpen(false)} />}
          </div>
        </div>
      )}
    </section>
  );
}

function SeatNote({ seat, campaign, now, onAgain }: { seat: Seat; campaign: Campaign; now: number; onAgain: () => void }) {
  if (seat.kind === "claiming") return <Wait phase="claiming the next item" since={now} size="panel" />;
  if (seat.kind === "failed") return <p className="warn">{seat.why}</p>;
  if (seat.kind !== "done") return null;
  return (
    <div className="note">
      <Icon name="check" />
      <div className="note-body">
        <p className="note-lead">Nothing left for you.</p>
        <p className="note-detail">{seat.why}</p>
        <p>
          <a href={href("campaigns", String(campaign.id))}>Back to {campaign.name}</a> ·{" "}
          <button type="button" className="link-button" onClick={onAgain}>
            Look again
          </button>
        </p>
      </div>
    </div>
  );
}

/** One row per asked axis: the candidates with their letters and reasons, neither and can't tell, and the cause once decided. */
function AbRows({ q, sheet, st, busy, onEdit }: { q: Question; sheet: AbSheet; st: AbState; busy: boolean; onEdit: (f: (s: AbState) => AbState) => void }) {
  const rows = askedRows(sheet);
  const vocab = useMemo(() => vocabularyOf(q), [q]);
  const multi = q.constraints?.multi ?? [];
  const problem = abProblem(q, sheet, st);
  return (
    <div className="ab-rows" role="list" aria-label="the axes to settle">
      {rows.map((r, i) => (
        <AbAxisRow
          key={r.axis}
          r={r}
          at={i}
          active={st.active === i}
          choice={st.picks[r.axis]}
          cause={st.causes[r.axis] ?? null}
          last={st.last === r.axis}
          free={st.free === r.axis}
          values={axisValues(q, r.axis)}
          names={vocab[r.axis]}
          multi={multi.includes(r.axis)}
          causes={sheet.causes}
          busy={busy}
          onEdit={onEdit}
          sheet={sheet}
        />
      ))}
      {problem && (
        <p className="warn one-line" title={problem}>
          The pack does not allow this: {problem}.
        </p>
      )}
    </div>
  );
}

function AbAxisRow(p: { r: AbRow; at: number; active: boolean; choice: Choice | undefined; cause: string | null; last: boolean; free: boolean; values: string[]; names: Record<string, ValueNames> | undefined; multi: boolean; causes: string[]; busy: boolean; sheet: AbSheet; onEdit: (f: (s: AbState) => AbState) => void }) {
  const { r, at, choice, sheet, onEdit } = p;
  const settledTo = chosenValue(r, choice);
  const isDecided = decided(r, choice);
  const agreed = !r.split && r.candidates.length === 1;
  const tone = (v: AbValue) => valueTone(p.values, Array.isArray(v) ? (v[0] ?? null) : v);
  const cls = ["ab-row", r.split ? "split" : "agreed", p.active ? "active" : "", choice ? "settled" : "open", isDecided ? "decided" : ""].filter(Boolean).join(" ");
  const pick = (c: Choice) => onEdit((s) => choose(sheet, s, c, at));
  return (
    <div className={cls} role="listitem" aria-label={r.axis} aria-current={p.active ? "true" : undefined} onClick={() => !p.active && onEdit((s) => ({ ...s, active: at }))}>
      <span className="ab-axis">
        {r.axis.replace(/_/g, " ")}
        {agreed && isDecided && <span className="ab-state">changed</span>}
        {r.split && !choice && <span className="ab-state open">settle</span>}
      </span>
      <div className="ab-cands">
        {r.candidates.map((c, i) => {
          const on = choice?.kind === "candidate" && choice.label === c.label;
          return (
            <button key={c.label} type="button" className={on ? "opt on ab-cand" : "opt ab-cand"} aria-pressed={on} disabled={p.busy} {...tone(c.value)} onClick={(e) => (e.stopPropagation(), pick({ kind: "candidate", label: c.label }))} title={c.reason ?? "no reason given"}>
              <kbd>{p.active ? LETTER_KEYS[i] : c.label}</kbd>
              <b className="ab-v">{valueWords(c.value)}</b>
              <span className="ab-reason">{c.reason ?? "no reason given"}</span>
            </button>
          );
        })}
        {r.candidates.length === 0 && <span className="meta ab-none">no voter gave a value: choose one</span>}
        <span className="ab-else">
          <button type="button" className={choice?.kind === "free" ? "opt on ab-neither" : "opt ab-neither"} disabled={p.busy} onClick={(e) => (e.stopPropagation(), onEdit((s) => ({ ...s, active: at, free: r.axis })))} title="none of these: choose the value">
            {p.active && <kbd>n</kbd>}
            {choice?.kind === "free" ? <span {...tone(settledTo ?? null)} className="value-tag">{valueWords(settledTo ?? null)}</span> : "neither"}
          </button>
          <button type="button" className={choice?.kind === "cant_tell" ? "opt on ab-ct" : "opt ab-ct"} disabled={p.busy} onClick={(e) => (e.stopPropagation(), pick({ kind: "cant_tell" }))} title="the header and the pictures do not settle it">
            {p.active && <kbd>x</kbd>}can't tell
          </button>
        </span>
      </div>
      {p.free && <FreeChoice values={p.values} names={p.names} multi={p.multi} was={settledTo} onTake={(v) => pick({ kind: "free", value: v })} onClose={() => onEdit((s) => ({ ...s, free: null }))} />}
      {isDecided && (
        <div className="ab-causes" role="group" aria-label={`cause of ${r.axis}`}>
          <span className="meta">cause</span>
          {p.causes.map((c, i) => (
            <button key={c} type="button" className={p.cause === c ? "opt on" : "opt"} aria-pressed={p.cause === c} onClick={(e) => (e.stopPropagation(), onEdit((s) => toggleCause(s, r.axis, c)))}>
              {p.last && <kbd>{i + 1}</kbd>}
              {CAUSE_WORDS[c] ?? c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Neither: the value chosen freely, found by any name it goes by (BRAVO
 * finds MPRAGE). Enter takes the lit match; on an axis of several values it
 * adds or takes away one and stays, and Enter on an empty box keeps the set.
 * Esc leaves.
 */
function FreeChoice({ values, names, multi, was, onTake, onClose }: { values: string[]; names: Record<string, ValueNames> | undefined; multi: boolean; was: AbValue | undefined; onTake: (v: AbValue) => void; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [lit, setLit] = useState(0);
  const [set, setSet] = useState<string[]>(() => (multi && Array.isArray(was) ? was : []));
  const box = useRef<HTMLInputElement | null>(null);
  useEffect(() => box.current?.focus(), []);
  const found = useMemo(() => {
    const t = typed.trim();
    const all = ["none", ...values];
    if (t === "") return all.slice(0, 12);
    return all.filter((v) => (v === "none" ? "none".startsWith(t.toLowerCase()) : nameHit(v, names?.[v], t) !== null)).slice(0, 12);
  }, [typed, values, names]);
  const take = (v: string) => {
    if (v === "none") return onTake(multi ? [] : null);
    if (!multi) return onTake(v);
    setSet((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
    setTyped("");
    setLit(0);
  };
  return (
    <div className="ab-free" onClick={(e) => e.stopPropagation()}>
      <span className="input">
        <input
          ref={box}
          value={typed}
          aria-label="choose the value"
          placeholder={multi ? "any name; Enter adds, Enter on empty keeps" : "any name of the value; Enter takes it"}
          onChange={(e) => {
            setTyped(e.target.value);
            setLit(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setLit((l) => (found.length === 0 ? 0 : (l + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length));
            } else if (e.key === "Enter" && !e.ctrlKey) {
              e.preventDefault();
              e.stopPropagation();
              if (multi && typed.trim() === "") onTake(set);
              else if (found[lit]) take(found[lit]);
            }
          }}
        />
      </span>
      <span className="ab-found">
        {found.map((v, i) => (
          <button key={v} type="button" className={[i === lit ? "opt lit" : "opt", set.includes(v) ? "on" : ""].filter(Boolean).join(" ")} onClick={() => take(v)}>
            {v}
          </button>
        ))}
        {multi && (
          <button type="button" className="button small" onClick={() => onTake(set)}>
            Keep {set.length === 0 ? "none" : set.join(", ")}
          </button>
        )}
      </span>
    </div>
  );
}

function AbKeyList({ header }: { header: boolean }) {
  const pair = (k: string, d: string) => (
    <div className="facts-pair" key={k}>
      <dt>{k}</dt>
      <dd>{d}</dd>
    </div>
  );
  return (
    <dl className="facts keys">
      {pair("a b c", "take the lit axis's candidate by its letter; on an axis the voters agree on, a confirms it")}
      {pair("n", "neither: choose the value by any name it goes by")}
      {pair("x", "can't tell: the header and the pictures do not settle it")}
      {pair("j k, Tab", "the next axis, the one before")}
      {pair("Backspace", "undo the lit axis's choice")}
      {pair("1 to 5", "the cause of the axis just settled: rule bug, convention gap, header ambiguity, rater error, reader slip; again takes it away")}
      {pair("Enter", "answer, then the next item")}
      {pair("s", "give it back, then the next")}
      {header && pair("h", "the whole header")}
      {pair("Space, ↑ ↓", "the pictures: enlarge a plane, page the stack")}
    </dl>
  );
}

/**
 * The A/B campaign on its own page (record 48): how far it is settled, the
 * share of each choice on the split axes, the median seconds per decision,
 * the causes given, and the decisions to save as a file. While the campaign
 * is open none of it says which voter gave which; once it is closed the
 * engine adds the voters chosen and the audit's joint error.
 */
export function AbPanel({ campaign }: { campaign: Campaign }) {
  const [s, setS] = useState<AbSummary | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    abDoors.summary(campaign.id).then(setS, (e: unknown) => setFailed(refusedWords(e)));
    abDoors.summaryRaw(campaign.id).then(setRaw, () => undefined);
  }, [campaign.id]);
  const save = () => {
    setSaving(true);
    abDoors
      .decisions(campaign.id)
      .then((d) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = decisionsFile(campaign.name);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      })
      .catch((e: unknown) => setFailed(refusedWords(e)))
      .finally(() => setSaving(false));
  };
  const ab = (campaign.source as { ab?: { voters?: unknown; audit?: { share?: unknown; cells?: unknown }; seed_sha256?: unknown } }).ab ?? {};
  const voters = Array.isArray(ab.voters) ? ab.voters.filter((v): v is string => typeof v === "string") : [];
  const audit = raw?.audit as { items?: number; cells?: number; changed?: number } | undefined;
  return (
    <div className="ab-panel">
      <h2>Settled blind</h2>
      {failed && <p className="warn">{failed}</p>}
      {s && (
        <dl className="facts">
          <div className="facts-pair">
            <dt>settled</dt>
            <dd>
              {s.answered} of {s.items} items
            </dd>
          </div>
          <div className="facts-pair">
            <dt>split axes</dt>
            <dd>{shareWords(s)}</dd>
          </div>
          <div className="facts-pair">
            <dt>per decision</dt>
            <dd>{s.median === null ? "not timed yet" : `median ${s.median} s, 90% within ${s.p90} s`}</dd>
          </div>
          <div className="facts-pair">
            <dt>causes</dt>
            <dd>{causeWords(s)}</dd>
          </div>
          <div className="facts-pair">
            <dt>voters</dt>
            <dd>
              {voters.length} ({s.sources ? voters.join(", ") : "told once the campaign is closed"}) · audit {typeof ab.audit?.share === "number" ? `${Math.round(ab.audit.share * 100)}%` : "?"} of the agreements, at least {String(ab.audit?.cells ?? "?")} cells an axis
            </dd>
          </div>
          {audit && (
            <div className="facts-pair">
              <dt>joint error</dt>
              <dd>
                {audit.changed ?? 0} of {audit.cells ?? 0} audited cells changed, over {audit.items ?? 0} audit items
              </dd>
            </div>
          )}
        </dl>
      )}
      <p>
        <button type="button" className="button secondary small" disabled={saving} onClick={save}>
          Save the decisions
        </button>{" "}
        <span className="meta">every answer and axis with its candidates, choice, cause and seconds{s?.sources ? ", and the voters" : ""}</span>
      </p>
    </div>
  );
}
