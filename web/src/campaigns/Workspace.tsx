// SPDX-License-Identifier: AGPL-3.0-only
// The rating workspace (record 45 S4, study A3): claim the next item under a
// lease, answer it, move on; a heartbeat keeps watch on the lease, keys do
// what the mouse does, and giving an item back returns it to the pool for
// others. The adjudicator's view is the same workspace with every rater's
// answer beside the options and the disagreement named. A rater sees no
// other rater's answer.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { review, type PackDoc } from "../review/client";
import { PickQuestion, type BoardCandidate } from "../review/SessionBoard";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import {
  answerWords,
  beatEvery,
  campaigns,
  CANDIDATES,
  itemWords,
  leaseLeft,
  leaseWords,
  questionWords,
  rateRefusal,
  refused as refusedWords,
  type Answer,
  type Campaign,
  type Given,
  type Item,
} from "./client";
import { AxisRows, blank, FormFields, FreeText, Handoff, PickStacks, type Marks, type Row } from "./renderers";
import { BatchView, type BatchViewProps } from "./Batches";
import type { AskedCandidate } from "../review/asked";
import { acceptPlan, baselineOf, batchKey, CANDIDATE_KEYS, changesOf, chosenCandidate, suggestedValue, Clock, givenOf, givenOfCandidate, NO_PACE, paced, Prefetcher, suggestionOf, upcoming, type AxisLine, type Batch, type Order, type Pace, type Reading, type Suggestion } from "./reader";
import { acceptBatch, batchesFor, claimIn, hintOf, R48, readingFor, timed, valueOrderServed } from "./readerDoors";
import { EvidenceLines, OrderToggle, PaceCount, SuggestionBar } from "./ReaderParts";
import { StackView } from "./StackView";
import { warmStack } from "../viewer/prefetch";
import { answeredWords, beatSeat, boardOf, bodyOf, chosenOf, disagreementWords, given as choose, givenNone, illegal, keyAct, marksOf, rowsOf, seatOf, type Seat } from "./workspace";

type Role = "rater" | "adjudicator";

const ORDER_KEY = "nils.reader.order";
const EVIDENCE_KEY = "nils.reader.evidence";
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

const n = (v: number) => v.toLocaleString("en-US");

export function Workspace({ caps, id, role }: { caps: Capabilities; id: string; role: Role }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat>({ kind: "claiming" });
  const [g, setG] = useState<Given>({ kind: "none" });
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [evidence, setEvidence] = useState<Json | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [keys, setKeys] = useState(false);
  const [done, setDone] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  // a session item's stacks, where the engine names them (record 45), which the session board draws as tiles
  const [pickable, setPickable] = useState<number[] | null>(null);
  const [board, setBoard] = useState<BoardCandidate[] | null>(null);
  const [stackWords, setStackWords] = useState<Record<number, string>>({});
  // the reader (record 48 R1)
  const [order, setOrder] = useState<Order>(() => (valueOrderServed(caps) && remembered(ORDER_KEY) !== "position" ? "value" : "position"));
  const [reading, setReading] = useState<Reading | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggested, setSuggested] = useState<Given | null>(null);
  const [evOpen, setEvOpen] = useState(() => remembered(EVIDENCE_KEY) === "open");
  const [pace, setPace] = useState<Pace>(NO_PACE);
  const [mode, setMode] = useState<"one" | "batch">("one");
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchAt, setBatchAt] = useState(0);
  const [mine, setMine] = useState<Set<number>>(() => new Set());
  const [batchSaid, setBatchSaid] = useState<string | null>(null);
  const clock = useRef(new Clock());
  const batchShown = useRef<number | null>(null);
  const prefetch = useRef<Prefetcher | null>(null);
  prefetch.current ??= new Prefetcher(warmStack, 2);
  const orderNow = useRef(order);
  orderNow.current = order;
  // held-back stacks to read one by one, asked for by name before the next by order
  const heldQueue = useRef<number[]>([]);
  const answeredHere = useRef(new Set<number>());
  const hint = useRef<number[]>([]);

  // the capabilities are read again every few seconds; the workspace follows them without starting over
  const capsNow = useRef(caps);
  capsNow.current = caps;

  const claim = useCallback(
    (note: string | null = null) => {
      setSeat({ kind: "claiming" });
      const named = heldQueue.current.shift() ?? null;
      claimIn(id, role, orderNow.current, named)
        .then((c) => {
          hint.current = hintOf(c);
          if (c.item) heldQueue.current = heldQueue.current.filter((i) => i !== c.item!.id);
          setSeat(seatOf(c, note));
        })
        .catch((e: unknown) => setSeat({ kind: "failed", why: refusedWords(e) }));
    },
    [id, role],
  );

  // the campaign, then the first claim
  useEffect(() => {
    let alive = true;
    campaigns
      .one(id)
      .then((c) => {
        if (!alive) return;
        setCampaign(c);
        setOpen(c.counts.items.open ?? 0);
        if (rateRefusal(capsNow.current, c, role) === null) claim();
      })
      .catch((e: unknown) => alive && setFailed(refusedWords(e)));
    return () => {
      alive = false;
    };
  }, [id, role, claim]);

  // the pack's families and multi-valued axes, where the person may read the pack
  const q = campaign?.question ?? null;
  const packName = caps.engine?.packs[0]?.name ?? null;
  const readsPack = q !== null && (q.kind === "axis" || q.kind === "axes") && packName !== null && may(caps, "data:see");
  useEffect(() => {
    if (readsPack && packName) review.pack(packName).then(setPack, () => undefined);
  }, [readsPack, packName]);

  const holding = seat.kind === "holding" ? seat : null;
  const assignmentId = holding?.assignment.id ?? null;
  const item = holding?.item ?? null;
  const currentItem = useRef<number | null>(null);
  currentItem.current = item?.id ?? null;

  // a new item starts from a blank answer; its review item's evidence where the person may read the queue; every answer for the adjudicator
  useEffect(() => {
    if (!q || assignmentId === null || !item) return;
    const fresh = blank(q);
    setG(fresh);
    setWhy("");
    setRefused(null);
    setEvidence(null);
    setPickable(null);
    setBoard(null);
    setReading(null);
    setSuggestion(null);
    setSuggested(null);
    clock.current.start(item.id, Date.now());
    if (q.kind === "axis" || q.kind === "axes") {
      // the suggestion filled in, unless a key was pressed before it came
      readingFor(capsNow.current, id, q, item).then((r) => {
        if (currentItem.current !== item.id) return;
        const s = suggestionOf(q, r);
        const g0 = givenOf(q, s);
        setReading(r);
        setSuggestion(s);
        setSuggested(g0);
        if (g0) setG((was) => (JSON.stringify(was) === JSON.stringify(fresh) ? g0 : was));
      });
      // the next items: their pictures warmed and their readings asked for while this one is read
      const items = campaign?.items ?? [];
      const next = upcoming(item, items, answeredHere.current, orderNow.current, 2, hint.current);
      prefetch.current?.want(next);
      for (const n of items.filter((i) => i.stack_id !== null && next.includes(i.stack_id))) void readingFor(capsNow.current, id, q, n);
    }
    if (q.kind === "pick" && served(capsNow.current, CANDIDATES))
      campaigns.candidates(id, item.id).then(
        (r) => {
          setPickable(r.candidates.map((x) => x.stack_id));
          setBoard(boardOf(r));
          setStackWords(Object.fromEntries(r.candidates.map((x) => [x.stack_id, Object.values(x.axes).flat().join(" ")])));
        },
        () => undefined,
      );
    if (q.kind !== "axis" && q.kind !== "axes" && item.review_item_id !== null && may(capsNow.current, "review:see")) campaigns.reviewItem(item.review_item_id).then((r) => setEvidence(r.evidence ?? null), () => undefined);
    if (role === "adjudicator") campaigns.answers(id).then(setAnswers, () => setAnswers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // the heartbeat: whether the lease still holds, and how long, from the engine
  const leaseSeconds = campaign?.lease_seconds ?? 3600;
  useEffect(() => {
    if (assignmentId === null) return;
    const t = setInterval(() => {
      campaigns
        .renew(capsNow.current, id, assignmentId, role)
        .then((c) => setSeat((s) => beatSeat(s, c)))
        .catch(() => undefined);
      campaigns.list().then((list) => setOpen(list.find((c) => String(c.id) === id || c.name === id)?.counts.items.open ?? null), () => undefined);
    }, beatEvery(leaseSeconds));
    return () => clearInterval(t);
  }, [id, role, assignmentId, leaseSeconds]);

  // the countdown
  useEffect(() => {
    if (assignmentId === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [assignmentId]);

  const answer = useCallback(() => {
    if (!q || !holding || busy) return;
    const b = bodyOf(q, g, why);
    if (!b.ok) {
      setRefused(`Needs ${b.needs}.`);
      return;
    }
    setBusy(true);
    const seconds = clock.current.stop(holding.item.id, Date.now());
    const changes = changesOf(q, baselineOf(q, suggestion), g);
    campaigns
      .answer(id, holding.assignment.id, timed(b.body, seconds, changes, suggestedValue(q, suggestion)))
      .then((r) => {
        setDone((d) => d + 1);
        setPace((p) => paced(p, seconds, changes));
        answeredHere.current.add(holding.item.id);
        setSaid(answeredWords(r, holding.item));
        setOpen((o) => (o === null ? o : Math.max(0, o - (r.state === "open" ? 0 : 1))));
        claim();
      })
      .catch((e: unknown) => {
        // the clock runs on while the person fixes it
        if (seconds !== null) clock.current.start(holding.item.id, Date.now() - seconds * 1000);
        setRefused(refusedWords(e));
      })
      .finally(() => setBusy(false));
  }, [q, holding, busy, g, why, id, claim, suggested, suggestion]);

  // the batches of like stacks (record 48 R1)
  const batchesOffered = served(caps, R48.batches) && (q?.kind === "axis" || q?.kind === "axes") && role === "rater";
  const openBatches = useCallback(() => {
    setMode("batch");
    setBatches(null);
    setBatchAt(0);
    setMine(new Set());
    setBatchSaid(null);
    batchShown.current = Date.now();
    batchesFor(id).then(setBatches, (e: unknown) => {
      setBatches([]);
      setBatchSaid(refusedWords(e));
    });
  }, [id]);
  const acceptNow = useCallback(() => {
    const b = batches?.[batchAt];
    if (!b || busy) return;
    const plan = acceptPlan(b, mine);
    if (plan.accept.length === 0) return;
    const seconds = batchShown.current === null ? null : (Date.now() - batchShown.current) / 1000;
    setBusy(true);
    acceptBatch(id, q!, b, plan, seconds)
      .then((r) => {
        setPace((p) => paced(p, seconds, 0, r.accepted));
        setDone((d) => d + r.accepted);
        setOpen((o) => (o === null ? o : Math.max(0, o - r.accepted)));
        heldQueue.current = [...heldQueue.current, ...r.held.filter((i) => !heldQueue.current.includes(i))];
        for (const i of plan.accept) answeredHere.current.add(i);
        const words = `Accepted ${r.accepted} of ${b.words}; ${r.held.length} held back, read next one by one.`;
        setSaid(words);
        setBatchSaid(words);
        setMine(new Set());
        const rest = (batches ?? []).filter((x) => x.key !== b.key);
        setBatches(rest);
        setBatchAt((a) => Math.min(a, Math.max(0, rest.length - 1)));
        batchShown.current = Date.now();
        // the item held now may have been in the batch; the claim hands back what is still mine, or the next
        claim();
      })
      .catch((e: unknown) => setBatchSaid(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [batches, batchAt, busy, mine, id, claim, q]);
  const hold = useCallback((i: number) => setMine((m) => {
    const n = new Set(m);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  }), []);
  const toggleEvidence = useCallback(() => setEvOpen((x) => {
    remember(EVIDENCE_KEY, x ? "closed" : "open");
    return !x;
  }), []);
  const chooseOrder = useCallback((o: Order) => {
    remember(ORDER_KEY, o);
    setOrder(o);
  }, []);

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

  const rows = q ? rowsOf(q, pack) : [];
  // on the board, a key chooses an acquisition, named by its first stack
  const candidates = board && board.length > 0 ? board.map((b) => b.stacks[0]) : (pickable ?? candidatesOf(evidence));

  // the keys
  const offered = suggestion?.differ.length ? suggestion.offered : [];
  const keyed = useRef({ q, rows, candidates, board, g, answer, giveBack, offered, suggested, mode, batchesOffered, openBatches, acceptNow, batchCount: batches?.length ?? 0, toggleEvidence });
  keyed.current = { q, rows, candidates, board, g, answer, giveBack, offered, suggested, mode, batchesOffered, openBatches, acceptNow, batchCount: batches?.length ?? 0, toggleEvidence };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (!k.q || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (t?.closest?.("dialog")) return;
      // Enter on a link or an act's button is that link's or button's; on a value it answers
      if (e.key === "Enter" && t && (t.tagName === "A" || (t.tagName === "BUTTON" && !t.closest(".axis-rows, .form-fields")))) return;
      if (k.mode === "batch") {
        const b = e.ctrlKey ? null : batchKey(e.key, inField);
        if (!b) return;
        e.preventDefault();
        if (b.kind === "accept") k.acceptNow();
        else if (b.kind === "next") setBatchAt((a) => (k.batchCount > 0 ? (a + 1) % k.batchCount : 0));
        else if (b.kind === "back") setMode("one");
        else setKeys((x) => !x);
        return;
      }
      const act = keyAct(e.key, { ctrl: e.ctrlKey, inField, q: k.q, rows: k.rows, candidates: k.candidates, offered: k.offered.length, batches: k.batchesOffered });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "candidate") {
        const c = k.offered[act.index];
        const cg = c ? givenOfCandidate(k.q, c) : null;
        if (cg) setG(cg);
      } else if (act.kind === "evidence") k.toggleEvidence();
      else if (act.kind === "reset") setG(k.suggested ?? blank(k.q));
      else if (act.kind === "batch") k.openBatches();
      else if (act.kind === "answer") k.answer();
      else if (act.kind === "skip") k.giveBack("next");
      else if (act.kind === "keys") setKeys((x) => !x);
      else if (act.kind === "choose") setG((was) => choose(k.q!, was, act.row, act.value));
      else if (act.kind === "pick" && k.board && k.board.length > 0) {
        const bundle = k.board.find((b) => b.stacks[0] === act.stack);
        if (bundle) setG({ kind: "stacks", stacks: bundle.stacks });
      } else if (act.kind === "pick") setG((was) => (was.kind === "stacks" ? { kind: "stacks", stacks: was.stacks.includes(act.stack) ? was.stacks.filter((s) => s !== act.stack) : [...was.stacks, act.stack] } : was));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (failed) return <p className="warn">The campaign could not be read: {failed}</p>;
  if (!campaign) return <Wait phase="reading the campaign" since={now} size="panel" />;
  return (
    <WorkspaceBody
      caps={caps}
      campaign={campaign}
      role={role}
      seat={seat}
      rows={rows}
      given={g}
      why={why}
      marks={role === "adjudicator" && item && q ? marksOf(q, answers, item.id) : {}}
      split={role === "adjudicator" && item && q ? disagreementWords(q, answers, item.id) : null}
      raterAnswers={role === "adjudicator" && item ? answers.filter((a) => a.item_id === item.id && a.role === "rater") : []}
      evidence={evidence}
      candidates={candidates}
      board={board}
      stackWords={stackWords}
      now={now}
      busy={busy}
      refused={refused}
      said={said}
      open={open}
      done={done}
      keys={keys}
      onGiven={setG}
      onWhy={setWhy}
      onAnswer={answer}
      onSkip={() => giveBack("next")}
      onStop={() => giveBack("stop")}
      onKeys={() => setKeys((x) => !x)}
      onAgain={() => claim()}
      lines={reading?.lines ?? null}
      suggestion={suggestion}
      evOpen={evOpen}
      onEvidence={toggleEvidence}
      onCandidate={(c) => {
        const cg = givenOfCandidate(q!, c);
        if (cg) setG(cg);
      }}
      pace={pace}
      order={valueOrderServed(caps) ? order : null}
      onOrder={chooseOrder}
      batchesOffered={batchesOffered}
      onBatches={openBatches}
      batch={
        mode === "batch"
          ? {
              batches,
              at: batchAt,
              mine,
              busy,
              said: batchSaid,
              onHold: hold,
              onAccept: acceptNow,
              onNext: () => setBatchAt((a) => (batches && batches.length > 0 ? (a + 1) % batches.length : 0)),
              onBack: () => setMode("one"),
            }
          : null
      }
    />
  );
}

/** The stacks a pick item's evidence offers, where it names candidates (a `pick.border` item adopted by the campaign). */
export function candidatesOf(evidence: Json | null): number[] {
  const c = evidence?.candidates;
  if (!Array.isArray(c)) return [];
  return c.flatMap((x) => (typeof x === "number" ? [x] : x && typeof x === "object" && typeof (x as Json).stack === "number" ? [(x as Json).stack as number] : []));
}

/** The review item's evidence a rater may read as facts: its plain values, less what only names the campaign. */
export function factsOf(evidence: Json | null): [string, string][] {
  const skip = new Set(["campaign", "campaign_name", "question", "campaign_state", "position", "axis", "role"]);
  return Object.entries(evidence ?? {})
    .filter(([k, v]) => !skip.has(k) && (v === null || ["string", "number", "boolean"].includes(typeof v)))
    .map(([k, v]) => [k.replace(/_/g, " "), v === null ? "" : String(v)]);
}

export interface WorkspaceBodyProps {
  caps: Capabilities;
  campaign: Campaign;
  role: Role;
  seat: Seat;
  rows: Row[];
  given: Given;
  why: string;
  marks: Marks;
  split: string | null;
  raterAnswers: Answer[];
  evidence: Json | null;
  candidates: number[];
  /** A session item's candidates as the session board draws them, where the engine names them (record 45). */
  board?: BoardCandidate[] | null;
  /** What the classifier says of each candidate stack, in a few words. */
  stackWords?: Record<number, string>;
  now: number;
  busy: boolean;
  refused: string | null;
  said: string | null;
  open: number | null;
  done: number;
  keys: boolean;
  onGiven: (g: Given) => void;
  onWhy: (w: string) => void;
  onAnswer: () => void;
  onSkip: () => void;
  onStop: () => void;
  onKeys: () => void;
  onAgain: () => void;
  /** The reader (record 48 R1): the evidence one line per axis, where it was read. */
  lines?: AxisLine[] | null;
  /** The answer filled in and the candidates where the systems differ. */
  suggestion?: Suggestion | null;
  evOpen?: boolean;
  onEvidence?: () => void;
  onCandidate?: (c: AskedCandidate) => void;
  pace?: Pace;
  /** The claim order, where the engine offers value order; null hides the toggle. */
  order?: Order | null;
  onOrder?: (o: Order) => void;
  batchesOffered?: boolean;
  onBatches?: () => void;
  /** The batch view in place of the one stack, while it is open. */
  batch?: BatchViewProps | null;
}

/** The workspace as it draws from what it holds. */
export function WorkspaceBody(p: WorkspaceBodyProps) {
  const { caps, campaign: c, role, seat } = p;
  const q = c.question;
  const refusal = rateRefusal(caps, c, role);
  const holding = seat.kind === "holding" ? seat : null;
  const left = holding ? leaseLeft(holding.assignment, p.now) : null;
  const facts = factsOf(p.evidence);
  return (
    <section className="data campaign-rate">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("campaigns")}>Campaigns</a> · <a href={href("campaigns", String(c.id))}>{c.name}</a>
          </span>
          <h1>{role === "adjudicator" ? "Adjudicate" : "Rate"}</h1>
          <p className="lede">{questionWords(q)}</p>
        </div>
        <div className="rate-count">
          <span className="k">open</span>
          <span className="v">{p.open === null ? "?" : n(p.open)}</span>
          {p.pace ? <PaceCount pace={p.pace} /> : <span className="meta">{p.done > 0 ? `${n(p.done)} answered here` : "items"}</span>}
        </div>
      </div>
      {(p.order || p.batchesOffered) && !refusal && (
        <div className="row reader-bar">
          {p.order && p.onOrder && <OrderToggle order={p.order} onOrder={p.onOrder} />}
          <span className="grow" />
          {p.batchesOffered && p.onBatches && !p.batch && (
            <button type="button" className="button secondary small" onClick={p.onBatches}>
              Like stacks in batches <kbd>b</kbd>
            </button>
          )}
        </div>
      )}
      {p.said && (
        <p className="meta said">
          <Icon name="check" />
          {p.said}
        </p>
      )}
      {refusal && <p className="warn">{refusal}</p>}
      {!refusal && seat.kind === "claiming" && <Wait phase="claiming the next item" since={p.now} size="panel" />}
      {!refusal && seat.kind === "failed" && <p className="warn">{seat.why}</p>}
      {!refusal && seat.kind === "done" && (
        <div className="note">
          <Icon name="check" />
          <div className="note-body">
            <p className="note-lead">Nothing left for you.</p>
            <p className="note-detail">{seat.why}</p>
            <p>
              <a href={href("campaigns", String(c.id))}>Back to {c.name}</a> ·{" "}
              <button type="button" className="link-button" onClick={p.onAgain}>
                Look again
              </button>
            </p>
          </div>
        </div>
      )}
      {!refusal && p.batch && <BatchView {...p.batch} />}
      {holding && !p.batch && (
        <div className="rate-grid">
          <div className="rate-picture">
            {holding.item.stack_id !== null ? (
              <StackView stack={holding.item.stack_id} view={q.kind === "axis" || q.kind === "axes" ? "planes" : "stack"} />
            ) : (
              <p className="meta">{itemWords(holding.item)}: a session, answered from its stacks below.</p>
            )}
          </div>
          <div className="rate-side">
            <div className="rate-item">
              <b>{itemWords(holding.item)}</b>
              <span className="meta">
                item {holding.item.position + 1}
                {holding.item.round > 1 ? ` · round ${holding.item.round}` : ""}
              </span>
              <span className={left !== null && left < 120 ? "tag caution" : "tag"} title={holding.assignment.lease_until ?? undefined}>
                <Icon name="clock" />
                {leaseWords(left)}
              </span>
            </div>
            {holding.note && <p className="note-lead">{holding.note}</p>}
            {p.suggestion && <SuggestionBar s={p.suggestion} chosen={chosenCandidate(q, p.suggestion.offered, p.given)} onChoose={(c) => p.onCandidate?.(c)} busy={p.busy} />}
            {p.lines && p.lines.length > 0 && <EvidenceLines lines={p.lines} open={p.evOpen ?? false} onToggle={() => p.onEvidence?.()} />}
            {facts.length > 0 && (
              <dl className="facts">
                {facts.map(([k, v]) => (
                  <div key={k} className="facts-pair">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {role === "adjudicator" && (
              <div className="adjudicate">
                {p.split && <p className="note-lead">{p.split}</p>}
                <ul className="vlist">
                  {p.raterAnswers.map((a) => (
                    <li key={a.id}>
                      <b>{a.principal}</b> {answerWords(a)}
                      {a.author_kind !== "person" && <span className="tag caution">{a.author_kind}</span>}
                      {a.why && <span className="meta"> · {a.why}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Renderer {...p} item={holding.item} assignment={holding.assignment.id} />
            <label className="field">
              <span className="label">Why · optional</span>
              <span className="input">
                <input value={p.why} onChange={(e) => p.onWhy(e.target.value)} placeholder={role === "adjudicator" ? "what settles it" : ""} />
              </span>
            </label>
            {p.refused && <p className="warn">{p.refused}</p>}
            <div className="row actions">
              <button type="button" className="button" disabled={p.busy} onClick={p.onAnswer}>
                Answer <kbd>Enter</kbd>
              </button>
              <button type="button" className="button secondary" disabled={p.busy} onClick={p.onSkip} title="Back to the pool for others; never to you again">
                Give back <kbd>s</kbd>
              </button>
              <span className="grow" />
              <button type="button" className="button quiet" disabled={p.busy} onClick={p.onStop}>
                Stop
              </button>
              <button type="button" className="icon-button" aria-label="Keys" aria-expanded={p.keys} onClick={p.onKeys}>
                <kbd>?</kbd>
              </button>
            </div>
            {p.keys && <KeyList rows={p.rows.length} reader={q.kind === "axis" || q.kind === "axes"} candidates={(p.suggestion?.differ.length ?? 0) > 0 ? (p.suggestion?.offered.length ?? 0) : 0} batches={p.batchesOffered ?? false} />}
          </div>
        </div>
      )}
    </section>
  );
}

function Renderer(p: WorkspaceBodyProps & { item: Item; assignment: number }) {
  const q = p.campaign.question;
  const g = p.given;
  switch (q.kind) {
    case "axis":
    case "axes":
      return (
        <>
          <AxisRows
            rows={p.rows}
            chosen={chosenOf(q, g)}
            marks={p.marks}
            none={q.kind === "axes"}
            onChoose={(axis, value) => p.onGiven(choose(q, g, p.rows.find((r) => r.axis === axis)!, value))}
            onNone={(axis) => p.onGiven(givenNone(g, axis))}
          />
          {illegal(q, g) && <p className="warn">The pack does not allow this: {illegal(q, g)}.</p>}
        </>
      );
    case "pick":
      if (p.board && p.board.length > 0) return <PickQuestion role={q.role ?? "the role"} candidates={p.board} stacks={g.kind === "stacks" ? g.stacks : []} onStacks={(stacks) => p.onGiven({ kind: "stacks", stacks })} />;
      return <PickStacks role={q.role ?? "the role"} candidates={p.candidates} words={p.stackWords} stacks={g.kind === "stacks" ? g.stacks : []} onChange={(stacks) => p.onGiven({ kind: "stacks", stacks })} />;
    case "form":
      return <FormFields schema={q.schema} form={g.kind === "form" ? g.form : {}} onChange={(form) => p.onGiven({ kind: "form", form })} />;
    case "free":
      return <FreeText text={g.kind === "text" ? g.text : ""} onChange={(text) => p.onGiven({ kind: "text", text })} />;
    case "derivative":
      return (
        <Handoff
          caps={p.caps}
          campaign={p.campaign.id}
          assignment={p.assignment}
          item={p.item}
          question={q}
          derivative={g.kind === "file" ? g.derivative : null}
          form={g.kind === "file" ? g.form : {}}
          onDerivative={(d) => p.onGiven({ kind: "file", derivative: d, form: g.kind === "file" ? g.form : {} })}
          onForm={(form) => p.onGiven({ kind: "file", derivative: g.kind === "file" ? g.derivative : null, form })}
        />
      );
    default:
      return <p className="warn">This desk does not know the question {q.kind}; update the desk.</p>;
  }
}

function KeyList({ rows, reader = false, candidates = 0, batches = false }: { rows: number; reader?: boolean; candidates?: number; batches?: boolean }) {
  return (
    <dl className="facts keys">
      {reader && (
        <div className="facts-pair">
          <dt>Enter</dt>
          <dd>confirm the answer filled in</dd>
        </div>
      )}
      {candidates > 0 && (
        <div className="facts-pair">
          <dt>{CANDIDATE_KEYS.slice(0, candidates).split("").join(" ")}</dt>
          <dd>choose a candidate</dd>
        </div>
      )}
      {reader && (
        <div className="facts-pair">
          <dt>h</dt>
          <dd>how each axis was decided</dd>
        </div>
      )}
      {reader && (
        <div className="facts-pair">
          <dt>Backspace</dt>
          <dd>back to the suggestion</dd>
        </div>
      )}
      {batches && (
        <div className="facts-pair">
          <dt>b</dt>
          <dd>like stacks in batches</dd>
        </div>
      )}
      {rows > 0 && (
        <div className="facts-pair">
          <dt>1 to 0</dt>
          <dd>a value on the first row</dd>
        </div>
      )}
      {rows > 1 && (
        <div className="facts-pair">
          <dt>q to p</dt>
          <dd>a value on the second row</dd>
        </div>
      )}
      <div className="facts-pair">
        <dt>Enter</dt>
        <dd>answer, then the next item</dd>
      </div>
      <div className="facts-pair">
        <dt>s</dt>
        <dd>give it back, then the next</dd>
      </div>
      <div className="facts-pair">
        <dt>Ctrl+Enter</dt>
        <dd>answer from a text field</dd>
      </div>
    </dl>
  );
}
