// SPDX-License-Identifier: AGPL-3.0-only
// The query card an Assistant conversation is about, floating over the chat
// while the person and the assistant talk it through: the version the
// assistant proposed, to accept or disregard, the card's versions, its steps,
// each open to change by hand, and the charts of the step chosen. A change by
// hand is the card's next version, and the next prompt carries it.

import { useEffect, useRef, useState } from "react";
import { ask, DoorError, type Json, type Move } from "../ask/client";
import { ProfilePanel, StepEditor, useCard, useProfile, useStackFields } from "../query/CardParts";
import { cardTitle, changeWords, stepCounts, type ChartTab } from "../query/cards";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import type { Proposal } from "./parts";
import type { Conversing } from "./useConversation";

const n = (v: number) => v.toLocaleString("en-US");

/** What the card in play tells the page, for the next prompt's context. */
export interface InPlay {
  document: number;
  hash: string;
  root: number;
  chain: number[];
  sets: { name: string; grain: string }[];
  funnel: { set: string; rows: number }[];
}

export function CardInPlay({ talk, opened, keeping, onShown }: { talk: Conversing; opened: number | null; keeping: string | null; onShown: (card: InPlay | null) => void }) {
  const proposals = talk.pane.proposals;
  const [shown, setShown] = useState<number | null>(null);
  const seen = useRef(new Set<number>());
  // a proposal comes onto the card as soon as it is made
  useEffect(() => {
    for (const p of proposals) {
      if (seen.current.has(p.document)) continue;
      seen.current.add(p.document);
      if (p.decided === null && !p.stale) setShown(p.document);
    }
  }, [proposals]);
  const accepted = [...proposals].reverse().find((p) => p.decided === "accepted") ?? null;
  const display = shown ?? accepted?.document ?? opened;

  const card = useCard(display);
  const fields = useStackFields();
  const [folded, setFolded] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [move, setMove] = useState<Move | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<ChartTab>("stacks");
  const [field, setField] = useState("manufacturer");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [changes, setChanges] = useState<string[]>([]);

  const loaded = card.doc !== null && card.doc.document === display ? card.doc : null;
  const steps = loaded ? card.steps : [];
  const current = steps.find((s) => s.set === chosen) ?? steps.find((s) => s.answers) ?? steps[steps.length - 1] ?? null;
  const profile = useProfile(loaded ? display : null, current?.set ?? null, field, loaded);
  const proposal = proposals.find((p) => p.document === display && p.decided === null) ?? null;
  const root = card.versions.some((v) => v.id === display) ? card.versions[0].id : display;

  // the page's next prompt carries the version on the card
  useEffect(() => {
    if (!loaded || display === null) {
      onShown(null);
      return;
    }
    onShown({
      document: display,
      hash: loaded.hash,
      root: root ?? display,
      chain: card.versions.map((v) => v.id),
      sets: steps.map((s) => ({ name: s.set, grain: s.grain })),
      funnel: steps.flatMap((s) => {
        const c = stepCounts(card.diagnosis?.groups, s.set);
        return c ? [{ set: s.set, rows: c.rows }] : [];
      }),
    });
  }, [loaded, display, card.versions, card.diagnosis]); // eslint-disable-line react-hooks/exhaustive-deps

  // what a proposed version changes against the version it was made from
  useEffect(() => {
    setChanges([]);
    if (!proposal || proposal.parent === null) return;
    let alive = true;
    ask.diff({ document_id: proposal.parent }, { document_id: proposal.document }).then(
      (d) => alive && setChanges((d.changes ?? []).map(changeWords).filter((w) => w !== "")),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [proposal?.document, proposal?.parent]); // eslint-disable-line react-hooks/exhaustive-deps

  // accepted, the proposal is kept as the next version of the one it was made from
  const keep = async (p: Proposal): Promise<boolean> => {
    const ok = await talk.decide(p, "accepted", p.parent ?? undefined);
    if (ok && p.parent !== null) await ask.storeUnder(p.document, p.parent);
    return ok;
  };

  const decide = (p: Proposal, verdict: "accepted" | "rejected") => {
    setBusy(true);
    setWhy(null);
    (verdict === "accepted" ? keep(p) : talk.decide(p, "rejected", p.parent ?? undefined))
      .then((ok) => {
        if (!ok) return;
        if (verdict === "rejected") setShown(p.parent);
        else card.load();
      })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };

  // a change by hand: a proposal still open is taken first, since the person builds on it
  const apply = async (set: string, m: Move, args: Json) => {
    const o = card.options[set];
    if (!o || display === null) return;
    setBusy(true);
    setWhy(null);
    try {
      // a person without work on the Query page keeps nothing: the change is made from the version shown
      if (proposal && !proposal.stale && keeping === null) await keep(proposal);
      const a = await ask.apply(display, o, set, [{ move_id: m.id, args }]);
      setMove(null);
      setTyped({});
      if (a.document === display) card.load();
      else setShown(a.document);
    } catch (e) {
      if (e instanceof DoorError && e.stale) {
        setWhy("The card moved on since its options were read; they are read again.");
        card.load();
      } else setWhy((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (display === null) return null;
  const out = ((loaded?.ask.out as Json | undefined)?.set as string | undefined) ?? null;
  const title = loaded ? cardTitle((loaded.ask as Json).name as string | undefined, out) : "The query";
  return (
    <section className={folded ? "talk-card folded" : "talk-card"} aria-label="The query card of this conversation">
      <div className="talk-card-head">
        <Icon name="search" />
        <div className="grow">
          <span className="eyebrow">{proposal ? "proposed version" : "query card"}</span>
          <h2>{title}</h2>
        </div>
        {card.versions.length > 0 && (
          <nav className="versions" aria-label="versions">
            {card.versions.map((v) => (
              <button key={v.id} type="button" className={v.id === display ? "version on" : "version"} onClick={() => setShown(v.id)}>
                {v.label}
              </button>
            ))}
          </nav>
        )}
        <a className="button secondary small" href={href("query", String(display))}>
          Open in Query
        </a>
        <button type="button" className="button secondary small" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
          {folded ? "Unfold" : "Fold"}
        </button>
      </div>
      {proposal && (
        <div className="talk-card-proposal">
          <p>{proposal.sentence}</p>
          {changes.length > 0 && <p className="meta">{changes.join("; ")}</p>}
          {proposal.stale ? (
            <p className="meta">It was made for another version, so it can no longer be taken.</p>
          ) : (
            <div className="row actions">
              {keeping === null && (
                <button type="button" className="button small" disabled={busy} onClick={() => decide(proposal, "accepted")}>
                  Accept
                </button>
              )}
              <button type="button" className="button secondary small" disabled={busy} onClick={() => decide(proposal, "rejected")}>
                Disregard
              </button>
              {keeping !== null && <span className="meta">{keeping}</span>}
            </div>
          )}
        </div>
      )}
      {why && <p className="warn">{why}</p>}
      {!folded && (
        <>
          {!loaded && !card.why && <p className="meta">Reading the card.</p>}
          {card.why && <p className="warn">The card could not be read: {card.why}</p>}
          {steps.length > 0 && (
            <div className="step-chips" aria-label="steps">
              {steps.map((s, i) => {
                const c = stepCounts(card.diagnosis?.groups, s.set);
                const on = s.set === current?.set;
                return (
                  <span key={s.set} className="step-chip-wrap">
                    {i > 0 && <Icon name="arrow" />}
                    <button
                      type="button"
                      className={on ? "step-chip on" : "step-chip"}
                      aria-pressed={on && editing}
                      title="Change this step by hand"
                      onClick={() => {
                        if (on) setEditing((e) => !e);
                        else {
                          setChosen(s.set);
                          setEditing(true);
                        }
                        setMove(null);
                        setTyped({});
                      }}
                    >
                      <b>{s.set}</b>
                      <span className="meta">{s.grain}</span>
                      {c && <span className="num">{n(s.grain === "subject" ? c.subjects : c.rows)}</span>}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {current && editing && (
            <StepEditor
              plain
              step={current}
              options={card.options[current.set] ?? null}
              move={move}
              typed={typed}
              busy={busy}
              onMove={(m) => {
                setMove(m);
                setTyped({});
              }}
              onType={(k, v) => setTyped((t) => ({ ...t, [k]: v }))}
              onApply={(set, m, args) => void apply(set, m, args)}
            />
          )}
          {loaded && (
            <ProfilePanel plain set={current?.set ?? null} profile={profile.profile} loading={profile.loading} why={profile.why} tab={tab} onTab={setTab} field={field} fields={fields} onField={setField} />
          )}
        </>
      )}
    </section>
  );
}
