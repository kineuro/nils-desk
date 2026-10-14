// SPDX-License-Identifier: AGPL-3.0-only
// The question under an open scan (Review round 1, record 56 section 6.3,
// DR3): the dataset viewer carries the same mark and the same keys as the
// question's grid, so a scan that needs a look is answered where it is
// seen, and the answer closes its question everywhere. NILS's answer frames
// the picture in its value's colour (the caution colour, dashed, where it has
// none); 1 and 2 give the question's two answers, 0 the axis's whole list,
// - no value, and Enter applies to this scan alone. The viewer's own keys
// (the arrows, j and k, 3, g, n, / and Esc) stay the viewer's.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { chosenTone, slotOf } from "../campaigns/values";
import { gridHref, mayAnswer, questions, questionsServed, refusedWords, slots, valueLabel, type Choice, type Question, type Vocab, type Where } from "./questions";
import "../campaigns/campaigns.css";
import "./questions.css";

/** The mark a scan's picture takes: the slot of NILS's answer among the axis's values, or none where it has no answer. */
export interface ScanMark {
  axis: string;
  value: string | null;
  slot: number | null;
}

export interface ScanQuestionProps {
  caps: Capabilities;
  where: Where;
  /** The scan open, with what NILS says it is now. */
  scan: { id: number; axes: Record<string, string> };
  /** Whether a question of the sort waits on the scan (`needsLook`): only then are its questions read. */
  looks: boolean;
  /** The picture's frame, as the question says it: null while no question asks the scan. */
  onMark?: (m: ScanMark | null) => void;
  /** The scan was answered: its axis and the answer, so the viewer clears its look. */
  onAnswered: (axis: string, value: string | null) => void;
}

/** What the bar has read: the first question that asks the scan, and its axis's values. */
interface Asked {
  stack: number;
  question: Question;
  vocabulary: Vocab[];
}

export function ScanQuestion({ caps, where, scan, looks, onMark, onAnswered }: ScanQuestionProps) {
  const [asked, setAsked] = useState<Asked | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [listing, setListing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const served = questionsServed(caps);
  const answering = mayAnswer(caps);
  const whereKey = `${where.dataset ?? ""}|${where.cohort ?? ""}`;

  // the questions that ask this scan, read when it opens needing a look; a
  // new scan starts afresh, while the scan just answered keeps what was said
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    const moved = shownFor.current !== scan.id;
    shownFor.current = scan.id;
    if (moved) {
      setAsked(null);
      setChoice(null);
      setListing(false);
      setSaid(null);
    }
    if (!served || !looks) return;
    let live = true;
    questions.list(where, scan.id).then(
      (l) => {
        if (!live) return;
        const q = l.questions[0];
        setAsked(q ? { stack: scan.id, question: q, vocabulary: l.vocabularies[q.axis] ?? [] } : null);
      },
      () => live && setAsked(null),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new scan, or a look that came, is what asks
  }, [scan.id, whereKey, served, looks]);

  const q = asked && asked.stack === scan.id ? asked.question : null;
  const palette = useMemo(() => (asked ? slots(asked.vocabulary, asked.question.values) : []), [asked]);
  const nils = q ? (scan.axes[q.axis] ?? null) : null;
  const mark: ScanMark | null = q ? { axis: q.axis, value: nils, slot: slotOf(palette, nils) } : null;
  const markKey = mark ? `${mark.axis}|${mark.value ?? ""}|${mark.slot ?? ""}` : "";
  useEffect(() => {
    onMark?.(mark);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the mark's words are what change it
  }, [markKey]);
  useEffect(() => () => onMark?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!q || !choice || busy || !answering) return;
    setBusy(true);
    const body = {
      ...(choice.kind === "nothing" ? { nothing: true as const } : { value: choice.value }),
      stacks: [scan.id],
      except: [],
      ...(where.dataset ? { dataset: where.dataset } : {}),
      ...(where.cohort ? { cohort: where.cohort } : {}),
    };
    questions
      .answer(q.key, body)
      .then((a) => {
        const value = choice.kind === "nothing" ? null : choice.value;
        setSaid(`${q.axis.replaceAll("_", " ")}: ${value ?? "no value"}${a.resort?.state === "done" ? " · sorted again" : ""}`);
        setAsked(null);
        setChoice(null);
        onAnswered(q.axis, value);
      })
      .catch((e: unknown) => setSaid(refusedWords(e).words))
      .finally(() => setBusy(false));
  };

  // the keys, while a question asks the scan and the person may answer
  const keyed = useRef({ q, choice, apply, listing });
  keyed.current = { q, choice, apply, listing };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (!k.q || !answering || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t?.closest?.("dialog, [role=tree], a, button")) return;
      const values = k.q.values;
      if ((e.key === "1" || e.key === "2") && values[e.key === "1" ? 0 : 1]) {
        e.preventDefault();
        setChoice({ kind: "value", value: values[e.key === "1" ? 0 : 1], key: e.key });
        setListing(false);
      } else if (e.key === "0") {
        e.preventDefault();
        setListing((x) => !x);
      } else if (e.key === "-") {
        e.preventDefault();
        setChoice({ kind: "nothing" });
        setListing(false);
      } else if (e.key === "Enter" && k.choice) {
        e.preventDefault();
        k.apply();
      } else if (e.key === "Escape" && k.listing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setListing(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [answering]);

  if (!q) return said ? <div className="scan-question"><p className="meta said">{said}</p></div> : null;
  const keyButton = (key: "1" | "2") => {
    const v = q.values[key === "1" ? 0 : 1];
    if (!v) return null;
    const on = choice?.kind === "value" && choice.value === v && choice.key === key;
    return (
      <button key={key} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} disabled={!answering} {...chosenTone(palette, v, on)} onClick={(e) => { setChoice({ kind: "value", value: v, key }); setListing(false); e.currentTarget.blur(); }}>
        <kbd>{key}</kbd>
        {v}
      </button>
    );
  };
  const listed = choice?.kind === "value" && choice.key === "0" ? choice.value : null;
  return (
    <div className="scan-question" role="group" aria-label={`The question about ${q.axis.replaceAll("_", " ")}`}>
      <a className="q-ask" href={gridHref(q.key, where)} title={q.reason || undefined}>
        {q.words}
      </a>
      <span className="meta">NILS: {nils ?? "no value"}</span>
      {answering ? (
        <>
          <span className="q-keys">
            {keyButton("1")}
            {keyButton("2")}
            <button type="button" className={listed ? "opt on" : "opt"} aria-pressed={listed !== null} aria-expanded={listing} {...(listed ? chosenTone(palette, listed, true) : {})} onClick={(e) => { setListing((x) => !x); e.currentTarget.blur(); }}>
              <kbd>0</kbd>
              {listed ?? "other value"}
            </button>
            <button type="button" className={choice?.kind === "nothing" ? "opt on" : "opt"} aria-pressed={choice?.kind === "nothing"} onClick={(e) => { setChoice({ kind: "nothing" }); setListing(false); e.currentTarget.blur(); }}>
              <kbd>-</kbd>no value
            </button>
          </span>
          <button type="button" className="button small" disabled={busy || !choice} onClick={apply}>
            Apply <kbd>Enter</kbd>
          </button>
        </>
      ) : (
        <span className="meta">{q.reason}</span>
      )}
      {said && <p className="meta said">{said}</p>}
      {listing && asked && (
        <div className="q-list" role="group" aria-label={`every value of ${q.axis.replaceAll("_", " ")}`}>
          {asked.vocabulary.map((v) => {
            const on = listed === v.value;
            return (
              <button key={v.value} type="button" className={on ? "opt on" : "opt"} {...chosenTone(palette, v.value, on)} onClick={() => { setChoice({ kind: "value", value: v.value, key: q.values[0] === v.value ? "1" : q.values[1] === v.value ? "2" : "0" }); setListing(false); }}>
                {valueLabel(asked.vocabulary, v.value)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
