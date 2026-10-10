// SPDX-License-Identifier: AGPL-3.0-only
// Save as a selection and Make a cohort, from what the dataset viewer's
// filters show (Wave 7a, 2026-10-10). The two actions sit on each level's
// bar; each opens one dialog over what the level shows now: where it is,
// what it was narrowed by, and how many the engine finds for the question
// those filters mean, counted before anything is kept. A filter no question
// asks is named, and left out only when the person says so, as is a count
// that differs from the page's. Then the question is kept as a card and
// saved as a selection, or run and its subjects promoted into a cohort,
// through the same doors the Query page's dialogs use, and one line on the
// bar says where it went.

import { useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { selectionName, selections } from "../query/selections";
import { href } from "../routes";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { cohorts, type Cohort } from "./cohorts";
import { cannotPromote, countOf, grainWords, keepDoors, keepError, KEEP_DOORS, mayCohort, maySelect, Refusal, unasked, type Kept } from "./keep";
import { suggestedCohort } from "./PromoteDialog";
import { plural } from "./viewer";

const n = (v: number) => v.toLocaleString("en-US");

export type KeepKind = "selection" | "cohort";

/** What a done act left on the bar: its words, where it went, and a promotion's job to follow. */
export interface Said {
  words: string;
  href: string;
  link: string;
  job?: { id: number; cohort: string; subjects: number };
}

/** Why the page and the question may count differently, behind the "?". */
const DIFFERS =
  "A question leaves out the scans the pack ruled out, reads a visit as a session NILS built, and finds subjects by their subject code alone, so it can count otherwise than the page.";

type Count = { kind: "counting"; since: number } | { kind: "counted"; rows: number; subjects: number } | { kind: "refused"; detail: string } | { kind: "failed"; detail: string };

/** How many the question keeps, in words: a selection keeps its rows, a cohort takes their subjects. */
function countWords(kind: KeepKind, kept: Kept, c: { rows: number; subjects: number }): string {
  if (kept.grain === "subject") return grainWords("subject", c.rows);
  if (kind === "cohort") return `${plural(c.subjects, "subject")}, from ${grainWords(kept.grain, c.rows)}`;
  return `${grainWords(kept.grain, c.rows)} of ${plural(c.subjects, "subject")}`;
}

/** The two actions on a level's bar, the line a done one leaves, and the dialog they open. The question can take a read first (a search's subjects), so `kept` may answer later. */
export function KeepActions({ caps, kept, ready }: { caps: Capabilities; kept: () => Kept | Promise<Kept>; ready: boolean }) {
  const [open, setOpen] = useState<{ kind: KeepKind; kept: Kept } | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const selects = maySelect(caps);
  const promotes = mayCohort(caps);
  if (!selects && !promotes) return null;
  const start = (kind: KeepKind) => {
    setSaid(null);
    setRefused(null);
    let k: Kept | Promise<Kept>;
    try {
      k = kept();
    } catch (e) {
      setRefused(messageOf(e));
      return;
    }
    if (!(k instanceof Promise)) {
      setOpen({ kind, kept: k });
      return;
    }
    setPreparing(true);
    k.then(
      (done) => alive.current && setOpen({ kind, kept: done }),
      (e: unknown) => alive.current && setRefused(messageOf(e)),
    ).finally(() => alive.current && setPreparing(false));
  };
  return (
    <span className="vw-keep" role="group" aria-label="Keep what is shown">
      {said && <SaidLine caps={caps} said={said} />}
      {refused && (
        <span className="vw-said warn" role="status">
          {refused}
        </span>
      )}
      {selects && (
        <button type="button" className="button quiet small" disabled={!ready || preparing} onClick={() => start("selection")}>
          <Icon name="file" />
          Save as a selection
        </button>
      )}
      {promotes && (
        <button type="button" className="button quiet small" disabled={!ready || preparing} onClick={() => start("cohort")}>
          <Icon name="users" />
          Make a cohort
        </button>
      )}
      {open && (
        <KeepDialog
          caps={caps}
          kind={open.kind}
          kept={open.kept}
          onClose={() => setOpen(null)}
          onDone={(s) => {
            setOpen(null);
            setSaid(s);
          }}
        />
      )}
    </span>
  );
}

/** What a promotion's job did, in words: who joined, and who was in the cohort already. */
export function joinedWords(cohort: string, subjects: number, added: number | null): string {
  if (added === null || added === subjects) return `${plural(subjects, "subject")} joined ${cohort}.`;
  if (added === 0) return `They were in ${cohort} already.`;
  return `${plural(added, "subject")} joined ${cohort}; the rest were in it already.`;
}

/** The one line a done act leaves, a promotion's followed until its job ends. */
function SaidLine({ caps, said }: { caps: Capabilities; said: Said }) {
  const [state, setState] = useState<{ words: string; detail?: string }>({ words: said.words });
  const job = said.job;
  useEffect(() => {
    if (!job || !served(caps, KEEP_DOORS.job)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const look = () => {
      keepDoors.job(job.id).then(
        (j) => {
          if (!alive) return;
          if (j.state === "done") {
            const added = typeof j.result?.added === "number" ? j.result.added : null;
            setState({ words: joinedWords(job.cohort, job.subjects, added) });
          } else if (j.state === "failed" || j.state === "cancelled") {
            setState({ words: `They did not join ${job.cohort}.`, detail: j.error ?? j.state });
          } else if (++tries < 30) timer = setTimeout(look, 1000);
        },
        () => {
          if (alive && ++tries < 30) timer = setTimeout(look, 1000);
        },
      );
    };
    timer = setTimeout(look, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [caps, job]);
  return (
    <span className={state.detail === undefined ? "vw-said ok-words" : "vw-said warn"} role="status">
      {state.words}
      {state.detail !== undefined && <Hint text={state.detail} />} <a href={said.href}>{said.link}</a>
    </span>
  );
}

/** The dialog of one action over what a level shows. */
export function KeepDialog({ caps, kind, kept, onClose, onDone }: { caps: Capabilities; kind: KeepKind; kept: Kept; onClose: () => void; onDone: (s: Said) => void }) {
  const [count, setCount] = useState<Count>(() => ({ kind: "counting", since: Date.now() }));
  const [word, setWord] = useState(false);
  const [name, setName] = useState(() => (kind === "selection" ? (selectionName(kept.name) ?? "") : suggestedCohort(kept.name)));
  const [note, setNote] = useState("");
  const [into, setInto] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState("");
  const [list, setList] = useState<Cohort[] | null>(null);
  const [busy, setBusy] = useState<{ phase: string; since: number } | null>(null);
  const [why, setWhy] = useState<{ words: string; detail: string } | null>(null);
  const answer = String((kept.document.out as { set: string }).set);
  const lists = kind === "cohort" && served(caps, "GET /api/cohorts");

  // the engine counts the question before anything is kept
  useEffect(() => {
    let alive = true;
    keepDoors.count(kept.document).then(
      (d) => {
        if (!alive) return;
        const c = countOf(d, answer);
        if (!d.valid || !c) setCount({ kind: "refused", detail: d.issues.map((i) => i.message).join("; ") || "the engine could not count it" });
        else setCount({ kind: "counted", rows: c.rows, subjects: c.subjects });
      },
      (e: unknown) => alive && setCount({ kind: "failed", detail: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [kept, answer]);
  useEffect(() => {
    if (!lists) return;
    let alive = true;
    cohorts.list().then(
      (l) => alive && setList(l.filter((c) => !c.retired_at)),
      () => alive && setList([]),
    );
    return () => {
      alive = false;
    };
  }, [lists]);

  const left = unasked(kept);
  const counted = count.kind === "counted" ? count : null;
  const differs = left.length === 0 && counted !== null && kept.shown !== null && counted.rows !== kept.shown;
  const needsWord = left.length > 0 || differs;
  const asked = kept.narrowed.filter((x) => x.asked).map((x) => x.words);
  const howMany = counted ? countWords(kind, kept, counted) : count.kind === "counting" ? "counting" : "not counted";

  const clean = kind === "selection" ? selectionName(name) : into === "new" ? name.trim() : existing;
  /** What the act still needs, in words; null where it needs nothing. */
  const needs = (): string | null => {
    if (!clean) return into === "existing" && kind === "cohort" ? "a cohort to add them to" : "a name";
    if (kind === "cohort" && into === "new" && list?.some((c) => c.name === clean)) return "another name; that one is taken";
    return null;
  };
  const refusal = needs();
  const empty = kind === "cohort" && counted !== null && counted.rows === 0;
  const can = count.kind !== "counting" && count.kind !== "refused" && (!needsWord || word) && refusal === null && !empty && busy === null;

  const failed = (e: unknown) => {
    setBusy(null);
    setWhy({ words: keepError(e) ?? (kind === "selection" ? "The selection was not saved." : "The cohort was not made."), detail: e instanceof Refusal ? "" : messageOf(e) });
  };
  const save = () => {
    if (!can || !clean) return;
    setBusy({ phase: "saving", since: Date.now() });
    setWhy(null);
    keepDoors
      .store(kept.document)
      .then((id) => selections.save(clean, id, note))
      .then((s) => onDone({ words: `Saved as ${s.name}, version ${s.version}.`, href: href("query", "selections"), link: "Selections" }), failed);
  };
  const promote = () => {
    if (!can || !clean) return;
    setBusy({ phase: "running the question", since: Date.now() });
    setWhy(null);
    keepDoors
      .store(kept.document)
      .then((id) => keepDoors.run(id))
      .then((run) => {
        const no = cannotPromote(run);
        if (no) throw new Refusal(no);
        setBusy({ phase: "making the cohort", since: Date.now() });
        return keepDoors.promote(run.handle, { cohort: clean, create: into === "new", ...(note.trim() ? { reason: note.trim() } : {}) });
      })
      .then((r) => {
        const subjects = counted?.subjects ?? 0;
        onDone({ words: `${plural(subjects, "subject")} ${subjects === 1 ? "is" : "are"} joining ${clean}.`, href: href("data", "cohorts", clean), link: `Open ${clean}`, job: { id: r.job, cohort: clean, subjects } });
      }, failed);
  };

  const foot = (
    <div className="row actions">
      {busy ? <Wait phase={busy.phase} since={busy.since} /> : <span className="meta grow">{refusal ? `Needs ${refusal}.` : kind === "cohort" ? "It appears on Cohorts at once." : "It appears under Selections at once."}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!can} onClick={kind === "selection" ? save : promote}>
        {kind === "selection" ? "Save" : into === "new" ? "Make the cohort" : "Add them"}
      </button>
    </div>
  );
  return (
    <Dialog title={kind === "selection" ? "Save as a selection" : "Make a cohort"} icon={kind === "selection" ? "file" : "users"} onClose={onClose} foot={foot}>
      <Values cells={[{ k: "from", v: kept.where }, ...(asked.length > 0 ? [{ k: "filters", v: asked.join(" · ") }] : []), { k: kind === "selection" ? "it keeps" : "who joins", v: howMany }]} />
      {count.kind === "counting" && <Wait phase="counting" since={count.since} />}
      {count.kind === "refused" && (
        <p className="warn" role="alert">
          NILS cannot ask this.
          <Hint text={count.detail} />
        </p>
      )}
      {count.kind === "failed" && (
        <p className="meta">
          Not counted.
          <Hint text={count.detail} />
        </p>
      )}
      {left.length > 0 && (
        <div className="note caution keep-word">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">
              Cannot be asked:{" "}
              {left.map((x, i) => (
                <span key={x.key}>
                  {i > 0 && ", "}
                  {x.words}
                  {x.why && <Hint text={x.why} />}
                </span>
              ))}
            </p>
            <label className="check-row">
              <input type="checkbox" checked={word} onChange={(e) => setWord(e.target.checked)} />
              {left.length === 1 ? "Leave it out" : "Leave them out"}
              {counted && `: ${grainWords(kept.grain, counted.rows)}`}
            </label>
          </div>
        </div>
      )}
      {differs && counted && kept.shown !== null && (
        <div className="note caution keep-word">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">
              The page shows {n(kept.shown)}; the question finds {n(counted.rows)}.
              <Hint text={DIFFERS} />
            </p>
            <label className="check-row">
              <input type="checkbox" checked={word} onChange={(e) => setWord(e.target.checked)} />
              Keep the {n(counted.rows)} it finds
            </label>
          </div>
        </div>
      )}
      {kind === "selection" ? (
        <>
          <div className="field">
            <label className="label" htmlFor="keep-name">
              Name
              <Hint text="A name already used gets its next version; every version stays." />
            </label>
            <div className="input mono">
              <input id="keep-name" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="keep-note">
              Note
            </label>
            <div className="input">
              <input id="keep-note" value={note} placeholder="optional" onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <span className="label">Who joins</span>
            <div className="choices">
              <label className="radio-row">
                <input type="radio" name="keep-into" checked={into === "new"} onChange={() => setInto("new")} />
                <span>As a new cohort</span>
              </label>
              <label className="radio-row">
                <input type="radio" name="keep-into" checked={into === "existing"} onChange={() => setInto("existing")} />
                <span>
                  <span>
                    Add them to a cohort
                    <Hint text="Subjects already in it stay as they are." />
                  </span>
                </span>
              </label>
            </div>
          </div>
          {into === "new" ? (
            <div className="field">
              <label className="label" htmlFor="keep-cohort">
                Name
              </label>
              <div className="input mono">
                <input id="keep-cohort" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="field">
              <label className="label" htmlFor="keep-existing">
                Cohort
              </label>
              <div className="input">
                {lists ? (
                  <select id="keep-existing" value={existing} onChange={(e) => setExisting(e.target.value)}>
                    <option value="">{list === null ? "reading the cohorts" : list.length === 0 ? "no cohort yet" : "choose a cohort"}</option>
                    {(list ?? []).map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} · {plural(c.subjects, "subject")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id="keep-existing" value={existing} placeholder="the cohort's name" spellCheck={false} onChange={(e) => setExisting(e.target.value)} />
                )}
              </div>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="keep-why">
              Why
            </label>
            <div className="input">
              <input id="keep-why" value={note} placeholder="optional" onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </>
      )}
      {why && (
        <p className="warn" role="alert">
          {why.words}
          {why.detail !== "" && <Hint text={why.detail} />}
        </p>
      )}
    </Dialog>
  );
}
