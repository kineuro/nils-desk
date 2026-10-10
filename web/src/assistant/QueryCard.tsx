// SPDX-License-Identifier: AGPL-3.0-only
// A query answer in the chat (the Assistant redesign, 2026-10-09): one quiet
// card, "Query · vN", its title and Open; the answer's funnel as subjects,
// visits and scans; and the top three bars of its first chart. Open puts the
// version on the panel beside the chat, where it is worked on. While the
// panel is open the chat is narrow, and the card is one line that opens its
// version there. Nothing is kept or set aside on the card itself.

import { Fragment, useEffect, useState } from "react";
import type { DocumentHandle, Json, Profile } from "../ask/client";
import { cardTitle, chartOf, tabsOf, unitWords, type Bar } from "../query/cards";
import { Icon } from "../ui/Icon";
import { funnelOf, type FunnelStep } from "./inplay";
import { reads } from "./reads";

/** How the person left a version: still open, kept, set aside, or made for a version the query has moved on from. */
export type VersionState = "open" | "kept" | "set aside" | "stale";

/** A document's title and its answer's profile, read once (reads.ts). */
export function useQuick(document: number, epoch: number | null): { doc: DocumentHandle | null; profile: Profile | null; why: string | null } {
  const [doc, setDoc] = useState<DocumentHandle | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setWhy(null);
    reads.document(document).then(
      (d) => alive && setDoc(d),
      (e: Error) => alive && setWhy(e.message),
    );
    reads.profile(document, epoch).then(
      (p) => alive && setProfile(p),
      (e: Error) => alive && setWhy((was) => was ?? e.message),
    );
    return () => {
      alive = false;
    };
  }, [document, epoch]);
  return { doc, profile, why };
}

/** A document's name as its card says it. */
export function titleOfDocument(doc: DocumentHandle | null): string {
  if (!doc) return "A query";
  const ask = doc.ask as Json;
  return cardTitle(ask.name as string | undefined, ((ask.out as Json | undefined)?.set as string | undefined) ?? null);
}

/** The first chart a profile draws, its first three bars: scan kinds, else a field, else the subjects' sex, else clinical kinds. */
export function firstBars(p: Profile | null, many = 3): { bars: Bar[]; unit: string; three: boolean } | null {
  if (!p) return null;
  for (const t of tabsOf(p)) {
    const chart =
      t.id === "stacks"
        ? chartOf(p.stack_types, "base")
        : t.id === "field"
          ? chartOf(p.field)
          : t.id === "people"
            ? chartOf(p.demographics && "sex" in p.demographics ? p.demographics.sex : null, "sex")
            : chartOf(p.clinical);
    if (chart.kind !== "bars" || chart.bars.length === 0) continue;
    return { bars: chart.bars.slice(0, many), unit: t.id === "people" ? "subjects" : t.id === "clinical" ? "events" : "scans", three: t.id === "people" };
  }
  return null;
}

/** The funnel's steps as chips: subjects, then visits, then scans, the one the answer counts marked. */
export function FunnelChips({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="qfunnel" aria-label="The answer, step by step">
      {steps.map((s, i) => (
        <Fragment key={s.grain}>
          {i > 0 && <Icon name="arrow" />}
          <span className={s.answer ? "qstep on" : "qstep"}>
            <b>{s.word}</b>
            {s.hint && <span className="qstep-hint">{s.hint}</span>}
            <span className="num">{s.n.toLocaleString("en-US")}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/** A chart's bars as the card and the panel draw them: label, bar, count, and the subjects behind it. */
export function BarRows({ bars, unit, three, onPick }: { bars: Bar[]; unit: string; three: boolean; onPick?: (b: Bar) => (() => void) | null }) {
  return (
    <div className={three ? "qbars three" : "qbars"}>
      {bars.map((b, i) => {
        const pick = onPick?.(b) ?? null;
        const inner = (
          <>
            <span className="qbar-label" title={b.label}>
              {b.label}
            </span>
            <span className="qbar-track" aria-hidden="true">
              <i style={{ width: `${Math.max(1, Math.round(100 * b.share))}%` }} />
            </span>
            <span className="num qbar-n">{unitWords(b.count, unit)}</span>
            {!three && <span className="num qbar-subjects">{unitWords(b.subjects, "subjects")}</span>}
          </>
        );
        return pick ? (
          <button key={`${b.label}${i}`} type="button" className="qbar" title={`Narrow the question to ${b.label}`} onClick={pick}>
            {inner}
          </button>
        ) : (
          <div key={`${b.label}${i}`} className="qbar">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

const STATE_TAG: Record<Exclude<VersionState, "open">, { words: string; tone: string }> = {
  kept: { words: "kept", tone: "tag ok" },
  "set aside": { words: "set aside", tone: "tag" },
  stale: { words: "moved on", tone: "tag" },
};

export function QueryCard(props: { document: number; label: string | null; epoch: number | null; state: VersionState; compact: boolean; shown: boolean; onOpen: () => void }) {
  const { document, label, epoch, state, compact, shown, onOpen } = props;
  const { doc, profile, why } = useQuick(document, epoch);
  const title = titleOfDocument(doc);
  if (compact)
    return (
      <button type="button" className={shown ? "qcard-row on" : "qcard-row"} aria-pressed={shown} onClick={onOpen}>
        <Icon name="search" />
        <span className="qcard-row-title">{title}</span>
        <span className="qcard-row-tag">{[label, shown ? "open" : null].filter(Boolean).join(" · ")}</span>
      </button>
    );
  const chart = firstBars(profile);
  const tag = state === "open" ? null : STATE_TAG[state];
  return (
    <section className="qcard" aria-label={`Query ${label ?? ""}`.trim()}>
      <div className="qcard-head">
        <Icon name="search" />
        <span className="eyebrow">{label ? `Query · ${label}` : "Query"}</span>
        <span className="qcard-title">{title}</span>
        {tag && <span className={tag.tone}>{tag.words}</span>}
        <button type="button" className="button secondary small" onClick={onOpen}>
          Open
          <Icon name="external" />
        </button>
      </div>
      {why && !profile && <p className="meta qcard-why">It could not be counted: {why}</p>}
      <div className="qcard-funnel">
        <FunnelChips steps={funnelOf(profile)} />
      </div>
      {chart && (
        <div className="qcard-bars">
          <BarRows bars={chart.bars} unit={chart.unit} three={chart.three} />
        </div>
      )}
    </section>
  );
}
