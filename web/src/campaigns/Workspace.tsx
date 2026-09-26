// SPDX-License-Identifier: AGPL-3.0-only
// The rating workspace (record 45 S4, study A3): claim the next item under a
// lease, answer it, move on; a heartbeat keeps watch on the lease, keys do
// what the mouse does, and giving an item back returns it to the pool for
// others. The adjudicator's view is the same workspace with every rater's
// answer beside the options and the disagreement named. A rater sees no
// other rater's answer. After the first gold campaign: one's own answer is
// opened again to correct it (`u` for the last, or from My answers), which
// the engine keeps as a new answer superseding the earlier; and the next
// item is read ahead while this one is read, so it shows at once.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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
  AMEND,
  answerWords,
  beatEvery,
  campaigns,
  CANDIDATES,
  CANT_TELL_KEYS,
  cantTellOf,
  COMBINATIONS,
  itemWords,
  leaseLeft,
  leaseWords,
  questionWords,
  rateRefusal,
  refused as refusedWords,
  UNSURE_KEY,
  unsureOf,
  type Answer,
  type Campaign,
  type Derived,
  type Given,
  type HeaderDoc,
  type Hint,
  type Item,
  type MyAnswer,
  givenOfMine,
  mineWords,
} from "./client";
import { amendRefusal, MyAnswers } from "./MyAnswers";
import { AxisRows, blank, CompactRows, FormFields, FreeText, Handoff, PickStacks, type Marks, type Row } from "./renderers";
import { BatchView, type BatchViewProps } from "./Batches";
import type { AskedCandidate } from "../review/asked";
import { acceptPlan, baselineOf, batchKey, CANDIDATE_KEYS, changesOf, chosenCandidate, Clock, deriveValue, derivedWords, givenOf, givenOfCandidate, NO_PACE, paced, Prefetcher, suggestionOf, upcoming, type AxisLine, type Batch, type HeaderLine, type Order, type Pace, type Reading, type Suggestion } from "./reader";
import { acceptBatch, batchesFor, claimIn, deriveAsked, deriveDoor, Deriver, headerDoorOf, headerFor, hintOf, nextOf, prefetchOn, R48, readingFor, valueOrderServed } from "./readerDoors";
import { ComboSearch, DerivedLine, EvidenceDrawer, HeaderBlock, HeaderDoors, HeaderDrawer, headerLinesOf, OrderToggle, PaceCount, SuggestionBar } from "./ReaderParts";
import { combinationsOf, seedsOf, settle, takeCombo, vocabularyOf, type Combination, type Settled } from "./lookup";
import { StackView } from "./StackView";
import { warmStack } from "../viewer/prefetch";
import { amendSeat, answeredWords, beatSeat, boardOf, bodyOf, chosenOf, compactRows, disagreementWords, enterOwnedBy, findKeyOf, given as choose, givenCantTell, givenNone, hintsNow, illegal, keyAct, marksOf, pendingWords, rowsOf, seatOf, type Seat } from "./workspace";

type Role = "rater" | "adjudicator";

const ORDER_KEY = "nils.reader.order";
const EVIDENCE_KEY = "nils.reader.evidence";
// the picture's view a reader chose (record 48, the second real read), kept across items and visits
const VIEW_KEY = "nils.reader.view";
type View = "stack" | "planes";
// the rows compact (every axis a find box) or expanded (the short rows drawn whole), kept per person (record 48, after the learners report)
const ROWS_KEY = "nils.reader.rows";
type RowsView = "compact" | "expanded";
const rowsRemembered = (who: string): RowsView => (remembered(`${ROWS_KEY}.${who}`) === "compact" ? "compact" : "expanded");
const viewRemembered = (): View => (remembered(VIEW_KEY) === "stack" ? "stack" : "planes");
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

export function Workspace({ caps, id, role, query }: { caps: Capabilities; id: string; role: Role; query?: Record<string, string> }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat>({ kind: "claiming" });
  const [g, setG] = useState<Given>({ kind: "none" });
  const [why, setWhy] = useState("");
  // the rater wants a second look (record 48), sent beside the answer where the engine takes it
  const [unsure, setUnsure] = useState(false);
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
  // the derived axes of the answer as it stands (record 48); gone where the engine has no derive door
  const [derived, setDerived] = useState<Derived | null>(null);
  const [deriveGone, setDeriveGone] = useState(false);
  const deriver = useRef<Deriver | null>(null);
  // the whole header, one key away (record 48)
  const [headerOpen, setHeaderOpen] = useState(false);
  const [headerDoc, setHeaderDoc] = useState<HeaderDoc | null>(null);
  const [headerFailed, setHeaderFailed] = useState<string | null>(null);
  // the picture's view, the same for every item until the reader changes it
  const [view, setView] = useState<View>(viewRemembered);
  const chooseView = useCallback((v: View) => {
    remember(VIEW_KEY, v);
    setView(v);
  }, []);
  const who = caps.person.subject;
  const [rowsView, setRowsView] = useState<RowsView>(() => rowsRemembered(who));
  const chooseRows = useCallback(
    (v: RowsView) => {
      remember(`${ROWS_KEY}.${who}`, v);
      setRowsView(v);
    },
    [who],
  );
  // the whole answers the search offers: the registry's, most common first (generic, never this campaign's stacks)
  const [counted, setCounted] = useState<Combination[] | null>(null);
  const combo = useRef<HTMLInputElement | null>(null);
  const clock = useRef(new Clock());
  const batchShown = useRef<number | null>(null);
  const prefetch = useRef<Prefetcher | null>(null);
  prefetch.current ??= new Prefetcher(warmStack, 2);
  const orderNow = useRef(order);
  orderNow.current = order;
  const answeredHere = useRef(new Set<number>());
  const hint = useRef<number[]>([]);
  // the items the engine names as the next (record 50, after the first gold campaign), read ahead
  const nextItems = useRef<{ item: number | null; stack: number }[]>([]);
  // the last answer given here, which `u` opens again to correct
  const last = useRef<MyAnswer | null>(null);
  const [mineOpen, setMineOpen] = useState(false);
  // only the items held back to be read one by one, and a sealed sample's (from the gallery's link)
  const alone = query?.alone === "1" || query?.alone === "true";
  const amendAt = query?.amend && /^\d+$/u.test(query.amend) ? Number(query.amend) : null;
  const back = query?.back === "gallery" ? "gallery" : "rate";

  // the capabilities are read again every few seconds; the workspace follows them without starting over
  const capsNow = useRef(caps);
  capsNow.current = caps;

  const claim = useCallback(
    (note: string | null = null) => {
      setSeat({ kind: "claiming" });
      claimIn(id, role, orderNow.current, alone)
        .then((c) => {
          hint.current = prefetchOn() ? hintOf(c) : [];
          nextItems.current = prefetchOn() ? nextOf(c) : [];
          setSeat(seatOf(c, note));
        })
        .catch((e: unknown) => setSeat({ kind: "failed", why: refusedWords(e) }));
    },
    [id, role, alone],
  );

  // the campaign, then the first claim; or the answer a link opens to correct
  const openAmend = useCallback(
    (a: MyAnswer, items: Item[] | undefined, note: string | null) => setSeat(amendSeat(a, items?.find((i) => i.id === a.item) ?? null, note)),
    [],
  );
  useEffect(() => {
    let alive = true;
    campaigns
      .one(id)
      .then((c) => {
        if (!alive) return;
        setCampaign(c);
        setOpen(c.counts.items.open ?? 0);
        if (rateRefusal(capsNow.current, c, role) !== null) return;
        if (amendAt === null) return claim();
        campaigns.mine(id).then(
          (m) => {
            if (!alive) return;
            const a = m.answers.find((x) => x.answer === amendAt);
            if (!a) setSeat({ kind: "failed", why: `Answer ${amendAt} is not one of yours still standing: it may have been corrected already. Open My answers for the latest.` });
            else openAmend(a, c.items, `Correcting your answer: ${mineWords(c.question, a.value)}.`);
          },
          (e: unknown) => alive && setSeat({ kind: "failed", why: refusedWords(e) }),
        );
      })
      .catch((e: unknown) => alive && setFailed(refusedWords(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role, claim]);

  // the pack's families and multi-valued axes, where the person may read the pack
  const q = campaign?.question ?? null;
  const packName = caps.engine?.packs[0]?.name ?? null;
  const readsPack = q !== null && (q.kind === "axis" || q.kind === "axes") && packName !== null && may(caps, "data:see");
  useEffect(() => {
    if (readsPack && packName) review.pack(packName).then(setPack, () => undefined);
  }, [readsPack, packName]);

  const rows = useMemo(() => (q ? rowsOf(q, pack) : []), [q, pack]);
  // what the choices settle on the other rows (record 48, the second real read); the answer sent is the settled one
  const settled = useMemo<Settled>(() => settle(q, g, rows), [q, g, rows]);
  const combos = useMemo(() => (q && q.kind === "axes" ? [...(counted ?? []), ...seedsOf(q, rows)] : []), [q, rows, counted]);
  // the registry's combinations of the answered axes, once per campaign, where the engine counts them
  const countsServed = q?.kind === "axes" && served(caps, COMBINATIONS);
  useEffect(() => {
    if (!countsServed) return;
    campaigns.combinations(id).then((r) => setCounted(combinationsOf(r)), () => setCounted([]));
  }, [countsServed, id]);

  const holding = seat.kind === "holding" ? seat : null;
  const amending = holding?.amend ?? null;
  const assignmentId = holding?.assignment.id ?? null;
  const item = holding?.item ?? null;
  const currentItem = useRef<number | null>(null);
  currentItem.current = item?.id ?? null;

  // a new item starts from a blank answer; its review item's evidence where the person may read the queue; every answer for the adjudicator
  useEffect(() => {
    if (!q || assignmentId === null || !item) return;
    // a correction starts from the rater's own answer, never from a suggestion
    const own = amending ? givenOfMine(q, amending.value) : null;
    const fresh = own ?? blank(q);
    setG(fresh);
    setWhy("");
    setUnsure(amending?.unsure ?? false);
    setRefused(null);
    setEvidence(null);
    setPickable(null);
    setBoard(null);
    setReading(null);
    setSuggestion(null);
    setSuggested(null);
    setDerived(null);
    setHeaderOpen(false);
    setHeaderDoc(null);
    setHeaderFailed(null);
    deriver.current?.stop();
    deriver.current = null;
    if (deriveAsked(capsNow.current, q))
      deriver.current = new Deriver(deriveDoor(id, item.id), (d, absent) => {
        if (currentItem.current !== item.id) return;
        if (absent) setDeriveGone(true);
        else setDerived(d);
      });
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
        if (g0 && !own) setG((was) => (JSON.stringify(was) === JSON.stringify(fresh) ? g0 : was));
      });
      // the next items: their pictures warmed, their readings and headers asked for while this one is read
      if (prefetchOn()) {
        const items = campaign?.items ?? [];
        const next = upcoming(item, items, answeredHere.current, orderNow.current, 2, hint.current);
        prefetch.current?.want(next);
        const ahead = new Map<number, Pick<Item, "id" | "stack_id" | "review_item_id" | "blind">>();
        for (const n of items.filter((i) => i.stack_id !== null && next.includes(i.stack_id))) ahead.set(n.id, n);
        // the engine's own word on what comes next, whether or not the campaign listed it
        for (const n of nextItems.current) if (n.item !== null && n.item !== item.id && !ahead.has(n.item)) ahead.set(n.item, items.find((i) => i.id === n.item) ?? { id: n.item, stack_id: n.stack, review_item_id: null });
        for (const n of ahead.values()) {
          void readingFor(capsNow.current, id, q, n).then((r) => {
            const path = headerDoorOf(capsNow.current, id, n.id, r);
            if (path) headerFor(path).catch(() => undefined);
          });
        }
      }
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

  // the derived line follows the answer as it changes (record 48)
  useEffect(() => {
    if (!q || !deriver.current) return;
    const v = deriveValue(q, settled.given);
    if (v) deriver.current.want(v);
  }, [q, settled]);
  useEffect(() => () => deriver.current?.stop(), []);

  const headerDoor = item ? headerDoorOf(caps, id, item.id, reading) : null;
  const openHeader = useCallback(() => {
    if (!headerDoor) return;
    setHeaderOpen(true);
    setHeaderFailed(null);
    if (headerDoc) return;
    const at = currentItem.current;
    headerFor(headerDoor).then(
      (d) => currentItem.current === at && setHeaderDoc(d),
      (e: unknown) => currentItem.current === at && setHeaderFailed(refusedWords(e)),
    );
  }, [headerDoor, headerDoc]);

  // the heartbeat: whether the lease still holds, and how long, from the engine
  const leaseSeconds = campaign?.lease_seconds ?? 3600;
  useEffect(() => {
    if (assignmentId === null || assignmentId < 0) return;
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
    const b = bodyOf(q, settled.given, why, unsure);
    if (!b.ok) {
      setRefused(`Needs ${b.needs}.`);
      return;
    }
    setBusy(true);
    const seconds = clock.current.stop(holding.item.id, Date.now());
    const changes = changesOf(q, baselineOf(q, suggestion), settled.given);
    if (holding.amend) {
      const was = holding.amend;
      campaigns
        .amend(id, was.answer, b.body)
        .then((r) => {
          const now = mineWords(q, b.body.value);
          last.current = { ...was, answer: r.unchanged ? was.answer : r.answer, value: b.body.value ?? was.value, unsure: b.body.unsure === true, supersedes: r.unchanged ? was.supersedes : was.answer, via: r.unchanged ? was.via : "amend" };
          setSaid(r.unchanged ? `${itemWords(holding.item)} kept as it was: ${now}.` : `Corrected ${itemWords(holding.item)}: ${mineWords(q, was.value)} is now ${now}; the earlier answer is kept.`);
          // back where the correction was opened from: the gallery, the reader's own address, or the item held before it
          if (back === "gallery") location.hash = href("campaigns", id, "gallery");
          else if (amendAt !== null) location.hash = href("campaigns", id, "rate");
          else claim();
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
      return;
    }
    campaigns
      .answer(id, holding.assignment.id, b.body)
      .then((r) => {
        last.current = { answer: r.answer, item: holding.item.id, stack: holding.item.stack_id, position: holding.item.position, value: b.body.value ?? null, answered_at: new Date().toISOString(), via: "claim", unsure: b.body.unsure === true, supersedes: null, role, round: holding.item.round, thumb: null, sealed: holding.item.blind === true };
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
  }, [q, holding, busy, settled, why, unsure, id, claim, suggestion, back, role, amendAt]);

  // `u`: the last answer given here opened again to correct; without one, My answers
  const undo = useCallback(() => {
    if (!campaign || busy) return;
    const refusal = amendRefusal(capsNow.current, campaign, null);
    if (refusal) {
      setSaid(refusal);
      return;
    }
    const a = last.current;
    if (!a || holding?.amend?.answer === a.answer) {
      setMineOpen(true);
      return;
    }
    openAmend(a, campaign.items, `Correcting your last answer: ${mineWords(campaign.question, a.value)}.`);
  }, [campaign, busy, holding, openAmend]);

  // the batches of like stacks (record 48 R1)
  const batchesOffered = served(caps, R48.batches) && (q?.kind === "axis" || q?.kind === "axes") && role === "rater";
  const openBatches = useCallback(() => {
    setMode("batch");
    setBatches(null);
    setBatchAt(0);
    setMine(new Set());
    setBatchSaid(null);
    batchShown.current = Date.now();
    batchesFor(id, q!, campaign?.items ?? []).then(setBatches, (e: unknown) => {
      setBatches([]);
      setBatchSaid(refusedWords(e));
    });
  }, [id, q, campaign]);
  const acceptNow = useCallback(() => {
    const b = batches?.[batchAt];
    if (!b || busy) return;
    const plan = acceptPlan(b, mine);
    if (plan.n === 0) return;
    const seconds = batchShown.current === null ? null : (Date.now() - batchShown.current) / 1000;
    setBusy(true);
    acceptBatch(id, b, plan)
      .then((r) => {
        setPace((p) => paced(p, seconds, 0, r.accepted));
        setDone((d) => d + r.accepted);
        setOpen((o) => (o === null ? o : Math.max(0, o - r.accepted)));
        const held = r.held.length + plan.read.length;
        const words = `Accepted ${r.accepted} like stacks; ${held} held back to read one by one${r.refused > 0 ? `; ${r.refused} refused` : ""}.`;
        setSaid(words);
        setBatchSaid(words);
        setMine(new Set());
        batchShown.current = Date.now();
        // the batches again: what is left open to this person now
        batchesFor(id, q!, campaign?.items ?? []).then((rest) => {
          setBatches(rest);
          setBatchAt((a) => Math.min(a, Math.max(0, rest.length - 1)));
        }, () => setBatches([]));
        // the item held now may have been in the batch; the claim hands back what is still mine, or the next
        claim();
      })
      .catch((e: unknown) => setBatchSaid(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [batches, batchAt, busy, mine, id, claim, q, campaign]);
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
      // a correction left as it was: back to where it came from
      if (holding.amend) {
        setSaid(`${itemWords(holding.item)} left as it was.`);
        if (then === "stop" || back === "gallery") location.hash = href("campaigns", id, back === "gallery" ? "gallery" : null);
        else if (amendAt !== null) location.hash = href("campaigns", id, "rate");
        else claim();
        return;
      }
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
    [holding, busy, id, claim, back, amendAt],
  );

  // on the board, a key chooses an acquisition, named by its first stack
  const candidates = board && board.length > 0 ? board.map((b) => b.stacks[0]) : (pickable ?? candidatesOf(evidence));

  // the keys
  const offered = suggestion?.differ.length ? suggestion.offered : [];
  const keyed = useRef({ q, rows, candidates, board, g, answer, giveBack, offered, suggested, mode, batchesOffered, openBatches, acceptNow, batchCount: batches?.length ?? 0, toggleEvidence, header: headerDoor !== null, openHeader, undo, mineOpen });
  keyed.current = { q, rows, candidates, board, g, answer, giveBack, offered, suggested, mode, batchesOffered, openBatches, acceptNow, batchCount: batches?.length ?? 0, toggleEvidence, header: headerDoor !== null, openHeader, undo, mineOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (!k.q || e.altKey || e.metaKey || k.mineOpen) return;
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (t?.closest?.("dialog, .drawer")) return;
      // Enter on a link, a button, a tile or a toggle is that element's alone; on the body or a value it answers
      if (e.key === "Enter" && enterOwnedBy(t)) return;
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
      const act = keyAct(e.key, { ctrl: e.ctrlKey, inField, q: k.q, rows: k.rows, candidates: k.candidates, offered: k.offered.length, batches: k.batchesOffered, header: k.header });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "candidate") {
        const c = k.offered[act.index];
        const cg = c ? givenOfCandidate(k.q, c) : null;
        if (cg) setG(cg);
      } else if (act.kind === "evidence") k.toggleEvidence();
      else if (act.kind === "header") k.openHeader();
      else if (act.kind === "combo") combo.current?.focus();
      else if (act.kind === "find") document.querySelector<HTMLInputElement>(`[data-find="${act.row.axis.replace(/["\\]/g, "")}"]`)?.focus();
      else if (act.kind === "reset") setG(k.suggested ?? blank(k.q));
      else if (act.kind === "batch") k.openBatches();
      else if (act.kind === "cant_tell") setG((was) => givenCantTell(k.q!, was, act.row.axis));
      else if (act.kind === "unsure") setUnsure((x) => !x);
      else if (act.kind === "answer") k.answer();
      else if (act.kind === "undo") k.undo();
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
      settled={settled}
      combos={combos}
      comboRef={combo}
      onCombo={(c) => q && setG((was) => takeCombo(q, was, c))}
      view={view}
      onView={chooseView}
      rowsView={rowsView}
      onRowsView={chooseRows}
      why={why}
      unsure={unsure}
      onUnsure={() => setUnsure((x) => !x)}
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
      amending={amending}
      onMine={campaign && served(caps, AMEND) ? () => setMineOpen(true) : undefined}
      mine={mineOpen ? <MyAnswers caps={caps} campaign={campaign} values={rows.length === 1 ? rows[0].values : []} back="rate" onClose={() => setMineOpen(false)} /> : null}
      lines={reading?.lines ?? null}
      suggestion={suggestion}
      blind={reading?.blind === true || item?.blind === true}
      header={reading?.header ?? null}
      headerLines={headerLinesOf(reading)}
      headerWhole={headerDoor !== null}
      onHeader={openHeader}
      headerDrawer={headerOpen ? { doc: headerDoc, failed: headerFailed } : null}
      onHeaderClose={() => setHeaderOpen(false)}
      derived={deriver.current && !deriveGone ? (derived ? derivedWords(derived, q) : null) : undefined}
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
  /** The unsure mark (record 48), shown where the engine takes it. */
  unsure?: boolean;
  onUnsure?: () => void;
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
  /** The item is of a sealed sample, read blind (record 48): no classification shown, only the pictures and the raw header. */
  blind?: boolean;
  /** The stack's raw header values, shown for a blind item. */
  header?: [string, string][] | null;
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
  /** The header block's lines (record 48): the file's text and physics, key fields first. */
  headerLines?: HeaderLine[];
  /** Whether `h` opens the whole header (the engine serves the door). */
  headerWhole?: boolean;
  onHeader?: () => void;
  /** The whole header drawer while it is open. */
  headerDrawer?: { doc: HeaderDoc | null; failed: string | null } | null;
  onHeaderClose?: () => void;
  /** The derived axes in one line (record 48); null while the first answer is awaited; absent where the engine derives nothing. */
  derived?: string | null;
  /** What the choices settle (record 48, the second real read): the answer with what they imply, and what can no longer hold. */
  settled?: Settled;
  /** The whole answers the combination search offers. */
  combos?: Combination[];
  comboRef?: RefObject<HTMLInputElement | null>;
  onCombo?: (c: Combination) => void;
  /** The picture's view, kept across items. */
  view?: View;
  onView?: (v: View) => void;
  /** The rows compact or expanded, kept per person. */
  rowsView?: RowsView;
  onRowsView?: (v: RowsView) => void;
  /** One's own answer being corrected (record 50, after the first gold campaign), in place of a claimed item. */
  amending?: MyAnswer | null;
  /** Open one's own answers, where the engine takes corrections. */
  onMine?: () => void;
  /** One's own answers while they are open. */
  mine?: ReactNode;
}

/** The workspace as it draws from what it holds. */
export function WorkspaceBody(p: WorkspaceBodyProps) {
  const { caps, campaign: c, role, seat } = p;
  const q = c.question;
  const refusal = rateRefusal(caps, c, role);
  const holding = seat.kind === "holding" ? seat : null;
  const left = holding ? leaseLeft(holding.assignment, p.now) : null;
  const facts = factsOf(p.evidence);
  // the answer about to be sent, the unsure mark apart as a tag
  const pending = holding ? pendingWords(q, p.settled?.given ?? p.given) : null;
  // an axis or axes question is read on one screen (record 48): pictures left, the file and the rows right, nothing below the fold
  const one = q.kind === "axis" || q.kind === "axes";
  if (one) return <ReaderOne {...p} refusal={refusal} left={left} pending={pending} />;
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
      <Said said={p.said} />
      {refusal && <p className="warn">{refusal}</p>}
      <SeatState {...p} refusal={refusal} />
      {holding && (
        <div className="rate-grid">
          <div className="rate-picture">
            {holding.item.stack_id !== null ? <StackView stack={holding.item.stack_id} view="stack" /> : <p className="meta">{itemWords(holding.item)}: a session, answered from its stacks below.</p>}
          </div>
          <div className="rate-side">
            <ItemLine {...p} left={left} />
            {holding.note && <p className="note-lead">{holding.note}</p>}
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
            <Adjudicate {...p} />
            <Renderer {...p} item={holding.item} assignment={holding.assignment.id} />
            <label className="field">
              <span className="label">Why · optional</span>
              <span className="input">
                <input value={p.why} onChange={(e) => p.onWhy(e.target.value)} placeholder={role === "adjudicator" ? "what settles it" : ""} />
              </span>
            </label>
            {pending !== null && (
              <p className="meta pending">
                Sends: {pending}
                {p.unsure && unsureOf(q) && (
                  <>
                    {" "}
                    <span className="tag caution">unsure</span>
                  </>
                )}
              </p>
            )}
            {p.refused && <p className="warn">{p.refused}</p>}
            <Actions {...p} />
            {p.keys && <KeyList rows={p.rows.length} unsure={unsureOf(q)} />}
          </div>
        </div>
      )}
    </section>
  );
}

type Drawn = WorkspaceBodyProps & { refusal: string | null; left: number | null; pending: string | null };

/**
 * The reader on one screen (record 48, after the first real read): the
 * pictures on the left, and on the right from the top the file's header
 * text and physics, the asked rows, the derived line and the answer. On a
 * laptop nothing needs scrolling: the page is the window's height, the rows
 * are compact, and what does not fit a line (the whole header, the evidence,
 * the keys) opens over the reader on a key.
 */
function ReaderOne(p: Drawn) {
  const { campaign: c, role, seat, refusal } = p;
  const q = c.question;
  const holding = seat.kind === "holding" ? seat : null;
  const blind = p.blind === true || holding?.item.blind === true;
  const compact = compactRows(p.rows);
  const lines = p.lines ?? [];
  const evidence = !blind && lines.length > 0;
  return (
    <section className="data campaign-rate reader-one">
      <div className="reader-head">
        <span className="eyebrow">
          <a href={href("campaigns")}>Campaigns</a> · <a href={href("campaigns", String(c.id))}>{c.name}</a>
        </span>
        <h1>{role === "adjudicator" ? "Adjudicate" : "Rate"}</h1>
        <span className="grow said-slot">
          <Said said={p.said} />
        </span>
        {q.kind === "axes" && compact && p.onRowsView && !refusal && <RowsToggle view={p.rowsView ?? "expanded"} onView={p.onRowsView} />}
        {p.order && p.onOrder && !refusal && <OrderToggle order={p.order} onOrder={p.onOrder} />}
        {p.batchesOffered && p.onBatches && !p.batch && !refusal && (
          <button type="button" className="button secondary small" onClick={p.onBatches}>
            Like stacks in batches <kbd>b</kbd>
          </button>
        )}
        {p.onMine && !refusal && (
          <button type="button" className="button quiet small" onClick={p.onMine} title="your answers, the latest first, to correct one">
            My answers <kbd>u</kbd>
          </button>
        )}
        <span className="rate-count-line">
          <b>{p.open === null ? "?" : n(p.open)}</b> open · {p.pace ? <PaceCount pace={p.pace} /> : <span>{p.done > 0 ? `${n(p.done)} answered here` : "items"}</span>}
        </span>
      </div>
      {refusal && <p className="warn">{refusal}</p>}
      <SeatState {...p} />
      {!refusal && p.batch && <BatchView {...p.batch} />}
      {p.mine}
      {holding && !p.batch && (
        <div className="rate-grid">
          <div className="rate-picture">
            {holding.item.stack_id !== null ? <StackView stack={holding.item.stack_id} view={p.view ?? "planes"} onView={p.onView} /> : <p className="meta">{itemWords(holding.item)}: a session, answered from its stacks below.</p>}
          </div>
          <div className="rate-side" data-reader-panel="">
            <ItemLine {...p}>
              {q.kind === "axes" && compact && p.combos && p.onCombo && <ComboSearch combos={p.combos} vocab={vocabularyOf(q)} axes={p.rows.map((r) => r.axis)} inputRef={p.comboRef} onTake={p.onCombo} />}
              <HeaderDoors whole={p.headerWhole ?? false} evidence={evidence} onWhole={p.onHeader} onEvidence={p.onEvidence} />
            </ItemLine>
            {holding.note && <p className="note-lead">{holding.note}</p>}
            {!blind && p.suggestion && <SuggestionBar s={p.suggestion} chosen={chosenCandidate(q, p.suggestion.offered, p.given)} onChoose={(x) => p.onCandidate?.(x)} busy={p.busy} />}
            <HeaderBlock lines={p.headerLines ?? []} flat={p.header ?? []} brief={!blind && (p.suggestion?.offered.length ?? 0) > 0} />
            <Adjudicate {...p} />
            <Renderer {...p} item={holding.item} assignment={holding.assignment.id} />
            {p.derived !== undefined && <DerivedLine words={p.derived} />}
            {p.pending !== null && (
              <p className="meta pending" title={p.pending}>
                Sends: {p.pending}
                {p.unsure && unsureOf(q) && (
                  <>
                    {" "}
                    <span className="tag caution">unsure</span>
                  </>
                )}
              </p>
            )}
            {p.refused && <p className="warn one-line" title={p.refused}>{p.refused}</p>}
            <Actions {...p} withWhy />
            {p.keys && (
              <div className="drawer keys-drawer" role="dialog" aria-label="keys">
                <KeyList rows={p.rows.length} compact={compact} combos={q.kind === "axes" && compact} reader candidates={(p.suggestion?.differ.length ?? 0) > 0 ? (p.suggestion?.offered.length ?? 0) : 0} batches={p.batchesOffered ?? false} cantTell={cantTellOf(q) !== null ? p.rows.length : 0} unsure={unsureOf(q)} header={p.headerWhole ?? false} evidence={evidence} />
              </div>
            )}
            {p.headerDrawer && <HeaderDrawer doc={p.headerDrawer.doc} failed={p.headerDrawer.failed} onClose={() => p.onHeaderClose?.()} />}
            {evidence && p.evOpen && <EvidenceDrawer lines={lines} onClose={() => p.onEvidence?.()} />}
          </div>
        </div>
      )}
    </section>
  );
}

/** Compact (every axis a find box) or expanded (the short rows drawn whole), one pair of buttons. */
function RowsToggle({ view, onView }: { view: RowsView; onView: (v: RowsView) => void }) {
  return (
    <span className="chips order-toggle rows-toggle" role="group" aria-label="the rows">
      {(["compact", "expanded"] as const).map((v) => (
        <button key={v} type="button" className={view === v ? "opt on" : "opt"} aria-pressed={view === v} onClick={() => onView(v)} title={v === "compact" ? "every axis a box: type any name of a value" : "the short rows drawn whole, a key per value"}>
          {v}
        </button>
      ))}
    </span>
  );
}

function Said({ said }: { said: string | null }) {
  if (!said) return null;
  return (
    <p className="meta said" title={said}>
      <Icon name="check" />
      {said}
    </p>
  );
}

function SeatState(p: WorkspaceBodyProps & { refusal: string | null }) {
  const { seat, refusal, campaign: c } = p;
  if (refusal) return null;
  if (seat.kind === "claiming") return <Wait phase="claiming the next item" since={p.now} size="panel" />;
  if (seat.kind === "failed") return <p className="warn">{seat.why}</p>;
  if (seat.kind !== "done") return null;
  return (
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
  );
}

function ItemLine(p: WorkspaceBodyProps & { left: number | null; children?: ReactNode }) {
  const holding = p.seat.kind === "holding" ? p.seat : null;
  if (!holding) return null;
  return (
    <div className="rate-item">
      <b>{itemWords(holding.item)}</b>
      <span className="meta">
        item {holding.item.position + 1}
        {holding.item.round > 1 ? ` · round ${holding.item.round}` : ""}
      </span>
      {(holding.item.blind || p.blind) && (
        <span className="tag gated" title="of a sealed sample: read without a suggestion, never in a batch">
          blind
        </span>
      )}
      {holding.amend ? (
        <span className="tag caution" title="a new answer that supersedes your earlier one; the earlier is kept">
          <Icon name="pencil" />
          correcting your answer
        </span>
      ) : (
        <span className={p.left !== null && p.left < 120 ? "tag caution" : "tag"} title={holding.assignment.lease_until ?? undefined}>
          <Icon name="clock" />
          {leaseWords(p.left)}
        </span>
      )}
      {p.children}
    </div>
  );
}

function Adjudicate(p: WorkspaceBodyProps) {
  if (p.role !== "adjudicator") return null;
  return (
    <div className="adjudicate">
      {p.split && <p className="note-lead">{p.split}</p>}
      <ul className="vlist">
        {p.raterAnswers.map((a) => (
          <li key={a.id}>
            <b>{a.principal}</b> {answerWords(a)}
            {a.author_kind !== "person" && <span className="tag caution">{a.author_kind}</span>}
            {a.unsure && <span className="tag caution">unsure</span>}
            {a.why && <span className="meta"> · {a.why}</span>}
            {a.derived && Object.keys(a.derived).length > 0 && <span className="meta derived-of"> · {derivedWords(a.derived, p.campaign.question)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Actions(p: WorkspaceBodyProps & { withWhy?: boolean }) {
  const q = p.campaign.question;
  return (
    <div className="row actions">
      <button type="button" className="button" disabled={p.busy} onClick={p.onAnswer}>
        {p.amending ? "Correct" : "Answer"} <kbd>Enter</kbd>
      </button>
      {p.amending ? (
        <button type="button" className="button secondary" disabled={p.busy} onClick={p.onSkip} title="Leave your answer as it was">
          Leave as it was <kbd>s</kbd>
        </button>
      ) : (
        <button type="button" className="button secondary" disabled={p.busy} onClick={p.onSkip} title="Back to the pool for others; never to you again">
          Give back <kbd>s</kbd>
        </button>
      )}
      {unsureOf(q) && (
        <button type="button" className={p.unsure ? "opt on" : "opt"} aria-pressed={p.unsure ?? false} disabled={p.busy} onClick={p.onUnsure} title="Answered, and wants a second look">
          Unsure <kbd>{UNSURE_KEY}</kbd>
        </button>
      )}
      {p.withWhy ? (
        <span className="input why-input">
          <input value={p.why} onChange={(e) => p.onWhy(e.target.value)} placeholder={p.role === "adjudicator" ? "why: what settles it" : "why · optional"} aria-label="why, optional" />
        </span>
      ) : (
        <span className="grow" />
      )}
      <button type="button" className="button quiet" disabled={p.busy} onClick={p.onStop}>
        Stop
      </button>
      <button type="button" className="icon-button" aria-label="Keys" aria-expanded={p.keys} onClick={p.onKeys}>
        <kbd>?</kbd>
      </button>
    </div>
  );
}

/** The pack's hints that hold for the answer so far (record 48): what is usual, with its reason; never a refusal. */
function HintLines({ hints }: { hints: Hint[] }) {
  if (hints.length === 0) return null;
  return (
    <>
      {hints.map((h) => (
        <p key={h.id} className="meta hint one-line" title={h.why}>
          Usually {h.axis} {h.value}
          {h.why ? `: ${h.why}` : ""}
        </p>
      ))}
    </>
  );
}

function Renderer(p: WorkspaceBodyProps & { item: Item; assignment: number }) {
  const q = p.campaign.question;
  const g = p.given;
  switch (q.kind) {
    case "axis":
    case "axes":
      if (q.kind === "axes" && compactRows(p.rows))
        return (
          <>
            <CompactRows
              rows={p.rows}
              chosen={chosenOf(q, p.settled?.given ?? g)}
              settled={p.settled}
              find={p.rowsView === "compact"}
              marks={p.marks}
              none
              cantTell={cantTellOf(q)}
              onCantTell={(axis) => p.onGiven(givenCantTell(q, g, axis))}
              onChoose={(axis, value) => p.onGiven(choose(q, g, p.rows.find((r) => r.axis === axis)!, value))}
              onNone={(axis) => p.onGiven(givenNone(g, axis))}
            />
            {illegal(q, p.settled?.given ?? g) && <p className="warn one-line" title={illegal(q, p.settled?.given ?? g) ?? undefined}>The pack does not allow this: {illegal(q, p.settled?.given ?? g)}.</p>}
            <HintLines hints={hintsNow(q, p.settled?.given ?? g)} />
          </>
        );
      return (
        <>
          <AxisRows
            rows={p.rows}
            chosen={chosenOf(q, g)}
            marks={p.marks}
            none={q.kind === "axes"}
            cantTell={cantTellOf(q)}
            onCantTell={(axis) => p.onGiven(givenCantTell(q, g, axis))}
            onChoose={(axis, value) => p.onGiven(choose(q, g, p.rows.find((r) => r.axis === axis)!, value))}
            onNone={(axis) => p.onGiven(givenNone(g, axis))}
          />
          {illegal(q, g) && <p className="warn">The pack does not allow this: {illegal(q, g)}.</p>}
          <HintLines hints={hintsNow(q, g)} />
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

function KeyList({ rows, compact = false, combos = false, reader = false, candidates = 0, batches = false, cantTell = 0, unsure = false, header = false, evidence = false }: { rows: number; compact?: boolean; combos?: boolean; reader?: boolean; candidates?: number; batches?: boolean; cantTell?: number; unsure?: boolean; header?: boolean; evidence?: boolean }) {
  const pair = (k: string, d: string) => (
    <div className="facts-pair" key={k + d}>
      <dt>{k}</dt>
      <dd>{d}</dd>
    </div>
  );
  return (
    <dl className="facts keys">
      {reader && pair("Enter", "confirm the answer filled in")}
      {candidates > 0 && pair(CANDIDATE_KEYS.slice(0, candidates).split("").join(" "), "choose a candidate")}
      {header && pair("h", "the whole header")}
      {reader && (evidence || !header) && pair(header ? "H" : "h", "how each axis was decided")}
      {reader && pair("Backspace", "back to the suggestion")}
      {batches && pair("b", "like stacks in batches")}
      {combos && pair("/", "find a whole answer by any name in it (bravo, mprage t1); Enter fills every row, then change what differs")}
      {compact && pair(`1 to ${findKeyOf(rows - 1) ?? rows}`, "find a row, then type any name of a value (a vendor's too: BRAVO finds MPRAGE); Enter or a click takes it, clears the box and goes on to the next axis unanswered (a multi-valued one stays for another), Tab goes on, Esc leaves")}
      {compact && pair("implied", "filled in by another choice, held until that choice changes; a greyed value says on hover why it cannot hold")}
      {!compact && rows > 0 && pair("1 to 0", "a value on the first row")}
      {!compact && rows > 1 && pair("q to p", "a value on the second row")}
      {cantTell > 0 && pair(CANT_TELL_KEYS.slice(0, cantTell).split("").join(" "), "can't tell on the first row, the second, and on; again clears it")}
      {unsure && pair(UNSURE_KEY, "mark it unsure, for a second look")}
      {pair("u", "your last answer opened again to correct it (where u is no value's key); without one, your answers")}
      {pair("Enter", "answer, then the next item")}
      {pair("s", "give it back, then the next")}
      {pair("Ctrl+Enter", "answer from a text field")}
    </dl>
  );
}
