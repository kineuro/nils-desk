// SPDX-License-Identifier: AGPL-3.0-only
// The query a conversation works on, as the Assistant page holds it (the
// redesign, 2026-10-09; it replaces the card that floated over the chat): the
// version on the panel and in the next prompt, every version the
// conversation proposed or made by hand in its line, and the two things done
// to a version here, keeping one the assistant proposed and changing one by
// hand. A proposal comes onto the panel as soon as it is made, so saying a
// change in the chat changes the panel too.

import { useEffect, useMemo, useRef, useState } from "react";
import { ask, chain, DoorError, type Json, type Move } from "../ask/client";
import { type CardRead, useCard } from "../query/CardParts";
import { stepCounts } from "../query/cards";
import { type Known, lineOf, type Placed, placed } from "./inplay";
import type { Proposal } from "./parts";
import type { Conversing } from "./useConversation";

/** What the version in play tells the page, for the next prompt's context. */
export interface InPlay {
  document: number;
  hash: string;
  root: number;
  chain: number[];
  sets: { name: string; grain: string }[];
  funnel: { set: string; rows: number }[];
}

export interface Playing {
  /** The version on the panel and in the next prompt; null before the conversation has one. */
  display: number | null;
  show: (document: number) => void;
  /** Every version the conversation knows, placed in its line. */
  versions: Map<number, Placed>;
  /** The versions of the line the one shown is in. */
  line: Placed[];
  /** The version the one shown was made from, when the conversation knows it. */
  parent: number | null;
  card: CardRead;
  /** The proposal that made the version shown, when the assistant made it. */
  proposal: Proposal | null;
  context: InPlay | null;
  busy: boolean;
  why: string | null;
  /** A proposed version kept as the next version of the one it was made from. */
  keep: (p: Proposal) => void;
  /** A change by hand: the version's next, shown at once; false when it was refused. */
  apply: (set: string, m: Move, args: Json) => Promise<boolean>;
}

export function useInPlay(talk: Conversing, conv: string | null, opened: number | null, keeping: string | null): Playing {
  const proposals = talk.pane.proposals;
  const [forConv, setForConv] = useState(conv);
  const [known, setKnown] = useState<Known[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [base, setBase] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const seen = useRef(new Set<number>());
  // another conversation opened: nothing of the last one stays
  if (forConv !== conv) {
    setForConv(conv);
    setKnown([]);
    setShown(null);
    setWhy(null);
    seen.current = new Set();
  }

  // a proposal comes onto the panel as soon as it is made, in the order the conversation made them
  useEffect(() => {
    const fresh: Known[] = [];
    let latest: number | null = null;
    for (const p of proposals) {
      if (seen.current.has(p.document)) continue;
      seen.current.add(p.document);
      fresh.push({ document: p.document, parent: p.parent });
      if (p.decided === null && !p.stale) latest = p.document;
    }
    if (fresh.length > 0) setKnown((k) => [...k, ...fresh]);
    if (latest !== null) setShown(latest);
  }, [proposals]);

  // a conversation about a card of the Query page goes on from that card's versions there
  useEffect(() => {
    if (opened === null) return;
    let alive = true;
    chain(opened).then(
      (c) => alive && setBase({ [opened]: c.length }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [opened]);

  const accepted = [...proposals].reverse().find((p) => p.decided === "accepted") ?? null;
  const display = shown ?? accepted?.document ?? opened;
  const all = useMemo(() => [...(opened !== null ? [{ document: opened, parent: null }] : []), ...known], [opened, known]);
  const versions = useMemo(() => placed(all, base), [all, base]);
  const line = useMemo(() => lineOf(versions, display), [versions, display]);
  const parent = display === null ? null : (all.find((k) => k.document === display)?.parent ?? null);
  const card = useCard(display);
  const proposal = display === null ? null : (proposals.find((p) => p.document === display) ?? null);

  // the next prompt carries the version in play, as the card over the chat carried it
  const loaded = card.doc !== null && card.doc.document === display ? card.doc : null;
  const context = useMemo<InPlay | null>(() => {
    if (!loaded || display === null) return null;
    return {
      document: display,
      hash: loaded.hash,
      root: card.versions.some((v) => v.id === display) ? card.versions[0].id : display,
      chain: card.versions.map((v) => v.id),
      sets: card.steps.map((s) => ({ name: s.set, grain: s.grain })),
      funnel: card.steps.flatMap((s) => {
        const c = stepCounts(card.diagnosis?.groups, s.set);
        return c ? [{ set: s.set, rows: c.rows }] : [];
      }),
    };
  }, [loaded, display, card.versions, card.steps, card.diagnosis]);

  // kept, a proposed version becomes the next version of the one it was made from
  const keepIt = async (p: Proposal): Promise<boolean> => {
    const ok = await talk.decide(p, "accepted", p.parent ?? undefined);
    if (ok && p.parent !== null) await ask.storeUnder(p.document, p.parent);
    return ok;
  };

  const keep = (p: Proposal) => {
    setBusy(true);
    setWhy(null);
    keepIt(p)
      .then((ok) => ok && card.load())
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };

  // a change by hand: a proposal still open is kept first, since the person builds on it
  const apply = async (set: string, m: Move, args: Json): Promise<boolean> => {
    const o = card.options[set];
    if (!o || display === null) return false;
    setBusy(true);
    setWhy(null);
    try {
      const open = proposals.find((p) => p.document === display && p.decided === null && !p.stale);
      // a person without work on the Query page keeps nothing: the change is made from the version shown
      if (open && keeping === null) await keepIt(open);
      const a = await ask.apply(display, o, set, [{ move_id: m.id, args }]);
      if (a.document === display) card.load();
      else {
        seen.current.add(a.document);
        setKnown((k) => [...k, { document: a.document, parent: display }]);
        setShown(a.document);
      }
      return true;
    } catch (e) {
      if (e instanceof DoorError && e.stale) {
        setWhy("The query moved on since its options were read; they are read again.");
        card.load();
      } else setWhy((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { display, show: setShown, versions, line, parent, card, proposal, context, busy, why, keep, apply };
}
