// SPDX-License-Identifier: AGPL-3.0-only
// Pair mode (the post-contrast study, P6). Nima reads the picture gold of
// whether contrast was given two stacks at a time: a pre/post candidate pair
// of one session, a same-header rerun included, side by side, left and right
// as the engine's seed drew them. The page shows the two pictures and
// nothing else of either stack: no time, no series name, no header, no
// value the rules gave, not even a stack's number. One key answers: 1 the
// left is post, 2 the right is post, 3 both pre, 4 both post, 5 can't tell;
// Enter sends it. Both sides are scaled by their own reference tissue and
// shown under one window by default, which a drag on either moves for both
// (`w` gives each its own window again), so enhancement is not normalised
// away; where the two stacks' geometry matches, paging one pages the other
// to the same place (`l` lets them go and brings them back). 7 to 0 jump
// to the ventricles, the sinuses and the sella, approximately. The arrows
// page the side under the pointer. `b` opens one's last answer again (and
// again the one before), `m` lists one's answers by pair; an answer opened
// shows the same two pictures with it marked, and another choice and Enter
// correct it (the engine keeps the earlier answer). The pair leased stays
// leased.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import type { Manifest } from "../viewer/doors";
import { beatEvery, campaigns, leaseLeft, leaseWords, refused as refusedWords, type Campaign, type Item, type MyAnswer } from "./client";
import { answerOf, useCorrection } from "./correct";
import { MyAnswers } from "./MyAnswers";
import { ANSWER_WORDS, answerCounts, PAIR_ANSWERS, pairDoors, pairKey, pairSync, sidesOf, SIDES, type PairAnswer, type PairSheet, type PairSummary, type Side } from "./pair";
import { claimIn } from "./readerDoors";
import { RegionJumps, WindowControl } from "./Compare";
import { planeAt, regionPoint, REGIONS, type Region } from "./regions";
import { StackView } from "./StackView";
import { useReference, useSharedWindow } from "./window";
import { beatSeat, seatOf, type Seat } from "./workspace";

// the pair view keeps its own: the stack view is where the two are kept on one slice
const VIEW_KEY = "nils.pair.view";
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

/** A pair in words, by its place in the campaign: never a stack's number, which follows the order of acquisition. */
export const pairWords = (i: Pick<Item, "position">): string => `pair ${i.position + 1}`;

const sideWords = (s: "post" | "pre" | "?") => (s === "?" ? "can't tell" : s);

export function PairReader({ caps, id, query }: { caps: Capabilities; id: string; query?: Record<string, string> }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat>({ kind: "claiming" });
  // the sheet with the item it is of: one of an item no longer on the screen is never drawn or answered against
  const [loaded, setLoaded] = useState<{ key: string; sheet: PairSheet } | null>(null);
  const [sheetFailed, setSheetFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PairAnswer | null>(null);
  const [summary, setSummary] = useState<PairSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [manifests, setManifests] = useState<Partial<Record<Side, Manifest>>>({});
  const [slices, setSlices] = useState<Record<Side, number | null>>({ left: null, right: null });
  const [linked, setLinked] = useState(true);
  const [active, setActive] = useState<Side>("left");
  const [view, setView] = useState<View>(() => (remembered(VIEW_KEY) === "planes" ? "planes" : "stack"));
  const chooseView = useCallback((v: View) => {
    remember(VIEW_KEY, v);
    setView(v);
  }, []);
  const capsNow = useRef(caps);
  capsNow.current = caps;
  const amendAt = query?.amend && /^\d+$/u.test(query.amend) ? Number(query.amend) : null;
  const correction = useCorrection({ caps, id, campaign, amendAt, busy, say: setSaid, words: pairWords });
  const amending = correction.amending;

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
    pairDoors.summary(id).then(setSummary, () => undefined);
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
  const assignmentId = holding?.assignment.id ?? null;
  // the pair on the screen: one's own answer open to correct, else the pair leased
  const shown: Pick<Item, "id" | "position"> | null = amending ? { id: amending.item, position: amending.position } : (holding?.item ?? null);
  const shownKey = amending ? `amend:${amending.answer}` : assignmentId === null ? null : `lease:${assignmentId}`;
  const was = amending ? answerOf(PAIR_ANSWERS, amending.value) : null;
  const current = useRef<string | null>(null);
  current.current = shownKey;
  const sheet = loaded && loaded.key === shownKey ? loaded.sheet : null;
  const [shownAt, setShownAt] = useState<number | null>(null);

  // a new pair: its two stacks, the clock, both pictures on their middles
  useEffect(() => {
    if (!shown || !shownKey) return;
    setLoaded(null);
    setSheetFailed(null);
    setChosen(was);
    setRefused(null);
    setManifests({});
    setSlices({ left: null, right: null });
    setShownAt(Date.now());
    const at = shownKey;
    pairDoors.sheet(id, shown.id).then(
      (s) => current.current === at && setLoaded({ key: at, sheet: s }),
      (e: unknown) => current.current === at && setSheetFailed(refusedWords(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

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

  // one slice where the geometry matches
  const sync = useMemo(() => (manifests.left && manifests.right ? pairSync(manifests.left, manifests.right) : null), [manifests]);
  const syncRef = useRef({ sync, linked });
  syncRef.current = { sync, linked };
  const moved = useCallback((side: Side, z: number) => {
    const { sync, linked } = syncRef.current;
    if (!linked || !sync) {
      setSlices((s) => ({ ...s, [side]: z }));
      return;
    }
    setSlices(side === "left" ? { left: z, right: sync.toRight.map(z) } : { left: sync.toLeft.map(z), right: z });
  }, []);
  // once both are read, and each time they are tied again, the right comes to the left's place
  useEffect(() => {
    const m = manifests.left;
    if (!sync || !linked || !m) return;
    setSlices((s) => {
      const z = s.left ?? Math.floor(m.shape[0] / 2);
      return { left: s.left, right: sync.toRight.map(z) };
    });
  }, [sync, linked, manifests.left]);
  const seen = useCallback((side: Side, m: Manifest) => setManifests((x) => (x[side] === m ? x : { ...x, [side]: m })), []);

  // one window across the two, scaled to each one's reference tissue
  const shared = useSharedWindow({
    left: sheet ? { stack: sheet.left, manifest: manifests.left } : undefined,
    right: sheet ? { stack: sheet.right, manifest: manifests.right } : undefined,
  });
  const onVoi = useMemo(() => ({ left: (v: { lower: number; upper: number }) => shared.dragged("left", v), right: (v: { lower: number; upper: number }) => shared.dragged("right", v) }), [shared]);
  // the jumps, each side from its own head's extent
  const refs = { left: useReference(sheet?.left ?? null, manifests.left), right: useReference(sheet?.right ?? null, manifests.right) };
  const [jumped, setJumped] = useState<string | null>(null);
  useEffect(() => setJumped(null), [sheet]);
  const jumpable = !!(refs.left?.extent && manifests.left);
  const jump = useCallback(
    (r: Region) => {
      const next: Record<Side, number | null> = { left: null, right: null };
      for (const side of SIDES) {
        const m = manifests[side];
        const e = refs[side]?.extent;
        const at = m && e ? planeAt(m, regionPoint(r, e)) : null;
        if (at) next[side] = at.z;
      }
      setSlices((s) => ({ left: next.left ?? s.left, right: next.right ?? s.right }));
      setJumped(`${r.label}, approximately`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifests, refs.left, refs.right],
  );
  const onSlice = useMemo(() => ({ left: (z: number) => moved("left", z), right: (z: number) => moved("right", z) }), [moved]);
  const onManifest = useMemo(() => ({ left: (m: Manifest) => seen("left", m), right: (m: Manifest) => seen("right", m) }), [seen]);

  const send = useCallback(() => {
    if (!sheet || busy || (!holding && !amending)) return;
    if (!chosen) {
      setRefused("Choose first: 1 the left is post, 2 the right is post, 3 both pre, 4 both post, 5 can't tell.");
      return;
    }
    setBusy(true);
    if (amending) {
      const a: MyAnswer = amending;
      const answer = chosen;
      campaigns
        .amend(id, a.answer, { value: answer })
        .then((r) => {
          const before = answerOf(PAIR_ANSWERS, a.value);
          setSaid(r.unchanged || before === answer ? `${pairWords(a)} kept as it was: ${ANSWER_WORDS[answer]}.` : `Corrected ${pairWords(a)}: ${before ? ANSWER_WORDS[before] : "the earlier answer"} is now ${ANSWER_WORDS[answer]}; the earlier answer is kept.`);
          refreshSummary();
          correction.done(a);
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
      return;
    }
    if (!holding) return setBusy(false);
    const it = holding.item;
    const answer = chosen;
    campaigns
      .answer(id, holding.assignment.id, { value: answer })
      .then(() => {
        setSaid(`Read ${pairWords(it)}: ${ANSWER_WORDS[answer]}.`);
        refreshSummary();
        claim();
      })
      .catch((e: unknown) => setRefused(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [holding, amending, sheet, busy, chosen, id, claim, refreshSummary, correction]);

  const giveBack = useCallback(
    (then: "next" | "stop") => {
      if (busy) return;
      // a correction left as it was: back to the pair leased, which stays leased
      if (amending) {
        correction.leave();
        if (then !== "stop") return;
        // Stop gives the item leased back, as it does without a correction open
        if (holding) campaigns.release(id, holding.assignment.id).catch(() => undefined);
        location.hash = href("campaigns", id);
        return;
      }
      if (!holding) return;
      setBusy(true);
      campaigns
        .release(id, holding.assignment.id)
        .then(() => {
          setSaid(`Gave ${pairWords(holding.item)} back.`);
          if (then === "next") claim();
          else location.hash = href("campaigns", id);
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
    },
    [holding, amending, busy, id, claim, correction],
  );

  // the keys
  const keyed = useRef({ send, giveBack, shared, jump, jumpable, correction });
  keyed.current = { send, giveBack, shared, jump, jumpable, correction };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("dialog, .drawer")) return;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      // Enter on a button or a link is that element's
      if (e.key === "Enter" && !inField && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
      const act = pairKey(e.key, { inField, ctrl: e.ctrlKey });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "answer") {
        setRefused(null);
        setChosen(act.answer);
      } else if (act.kind === "send") keyed.current.send();
      else if (act.kind === "skip") keyed.current.giveBack("next");
      else if (act.kind === "sync") setLinked((x) => !x);
      else if (act.kind === "window") keyed.current.shared.setMode(keyed.current.shared.mode === "shared" ? "own" : "shared");
      else if (act.kind === "region") {
        if (keyed.current.jumpable) keyed.current.jump(REGIONS[act.region]);
      } else if (act.kind === "back") keyed.current.correction.back();
      else if (act.kind === "mine") keyed.current.correction.setListOpen((x) => !x);
      else if (act.kind === "keys") setKeys((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (failed) return <p className="warn">The campaign could not be read: {failed}</p>;
  if (!campaign) return <Wait phase="reading the campaign" since={now} size="panel" />;
  const left = holding ? leaseLeft(holding.assignment, now) : null;
  const open = campaign.counts.items.open ?? null;
  const both = manifests.left && manifests.right;
  const syncWords = !linked ? "each alone" : !both ? "one slice, once both are read" : sync ? "one slice" : "each alone: the geometry differs";
  return (
    <section className="data campaign-rate reader-one pair-reader">
      <div className="reader-head">
        <span className="eyebrow">
          <a href={href("campaigns")}>Campaigns</a> · <a href={href("campaigns", String(campaign.id))}>{campaign.name}</a>
        </span>
        <h1>Read pairs</h1>
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
            <span title={answerCounts(summary)}>
              <b>{summary.answered}</b> of {summary.items} read{summary.median !== null && ` · median ${summary.median} s`}
            </span>
          )}
          {summary === null && open !== null && (
            <span>
              <b>{open}</b> open
            </span>
          )}
          {shown && shownAt !== null && (
            <span className="on-this" title="how long this pair has been on the screen">
              {" "}
              · this one <b>{secondsWords(now - shownAt)}</b>
            </span>
          )}
        </span>
      </div>
      {!amending && <SeatNote seat={seat} campaign={campaign} now={now} onAgain={() => claim()} onMine={() => correction.setListOpen(true)} />}
      {correction.listOpen && <MyAnswers caps={caps} campaign={campaign} values={[]} back="rate" onClose={() => correction.setListOpen(false)} onPick={correction.open} current={amending?.answer ?? null} />}
      {shown && (
        <div className={amending ? "pair-grid correcting" : "pair-grid"}>
          {sheetFailed && <p className="warn pair-bar">The pair could not be read: {sheetFailed}</p>}
          {!sheet && !sheetFailed && <Wait phase="reading the pair" since={shownAt ?? now} size="panel" />}
          {sheet &&
            SIDES.map((side) => (
              <div key={side} className={active === side ? "rate-picture pair-side active" : "rate-picture pair-side"} data-side={side} onPointerEnter={() => setActive(side)} onFocusCapture={() => setActive(side)}>
                <span className="pair-label" aria-hidden="true">
                  {side}
                  {chosen && <b className={`pair-says ${sidesOf(chosen)[side] === "post" ? "post" : ""}`}>{sideWords(sidesOf(chosen)[side])}</b>}
                </span>
                <StackView stack={side === "left" ? sheet.left : sheet.right} view={view} onView={chooseView} keys={active === side} slice={slices[side]} onSlice={onSlice[side]} onManifest={onManifest[side]} voi={shared.voiFor(side)} onVoi={onVoi[side]} />
              </div>
            ))}
          {sheet && (
            <div className="pair-bar" data-reader-panel="">
              <div className="rate-item">
                <b>{pairWords(shown)}</b>
                {amending ? (
                  <span className="tag caution correcting-tag" title="your answer to this pair, open to correct; the pair you were reading stays yours">
                    correcting your answer
                  </span>
                ) : (
                  holding && (
                    <span className={left !== null && left < 120 ? "tag caution" : "tag"} title={holding.assignment.lease_until ?? undefined}>
                      <Icon name="clock" />
                      {leaseWords(left)}
                    </span>
                  )
                )}
                <button type="button" className={linked && sync ? "tag pair-sync on" : "tag pair-sync"} aria-pressed={linked} onClick={() => setLinked((x) => !x)} title="keep the two pictures on one slice where their geometry matches (l)">
                  {syncWords}
                </button>
                <WindowControl w={shared} />
                <RegionJumps onJump={jump} disabled={!jumpable} why={jumpable ? null : "finding the head, or the stack names no place in the patient"} />
                {jumped && <span className="meta compare-jumped">{jumped}</span>}
              </div>
              <div className="pair-answers" role="group" aria-label="the answer">
                {PAIR_ANSWERS.map((a, i) => (
                  <button key={a} type="button" className={["opt", "pair-answer", chosen === a ? "on" : "", was === a ? "yours" : ""].filter(Boolean).join(" ")} aria-pressed={chosen === a} disabled={busy} onClick={() => (setRefused(null), setChosen(a))}>
                    <kbd>{i + 1}</kbd>
                    {ANSWER_WORDS[a]}
                    {was === a && <span className="was">your answer</span>}
                  </button>
                ))}
              </div>
              <div className="row actions">
                <span className="act-main" role="group" aria-label="send">
                  <button type="button" className="button act-answer" disabled={busy || !chosen} onClick={send}>
                    {amending ? "Correct" : "Answer"} <kbd>Enter</kbd>
                  </button>
                </span>
                {amending ? (
                  <button type="button" className="button secondary" disabled={busy} onClick={() => giveBack("next")} title="Leave your answer as it was, and go back to the pair you were reading">
                    Keep it <kbd>s</kbd>
                  </button>
                ) : (
                  <button type="button" className="button secondary" disabled={busy} onClick={() => giveBack("next")} title="Back to the pool; never to you again">
                    Give back <kbd>s</kbd>
                  </button>
                )}
                <span className="grow" />
                {refused && (
                  <p className="warn one-line" title={refused}>
                    {refused}
                  </p>
                )}
                <button type="button" className="button quiet mine-back" disabled={busy} onClick={correction.back} title="open your last answer again to correct it; again, the one before">
                  Previous <kbd>b</kbd>
                </button>
                <button type="button" className="button quiet mine-open" aria-expanded={correction.listOpen} onClick={() => correction.setListOpen((x) => !x)} title="your answers here, by pair, to open one and correct it">
                  My answers <kbd>m</kbd>
                </button>
                <button type="button" className="button quiet" disabled={busy} onClick={() => giveBack("stop")}>
                  Stop
                </button>
                <button type="button" className="icon-button" aria-label="Keys" aria-expanded={keys} onClick={() => setKeys((x) => !x)}>
                  <kbd>?</kbd>
                </button>
              </div>
              {keys && (
                <div className="drawer keys-drawer" role="dialog" aria-label="keys">
                  <PairKeyList />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const secondsWords = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function SeatNote({ seat, campaign, now, onAgain, onMine }: { seat: Seat; campaign: Campaign; now: number; onAgain: () => void; onMine: () => void }) {
  if (seat.kind === "claiming") return <Wait phase="claiming the next pair" since={now} size="panel" />;
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
          </button>{" "}
          ·{" "}
          <button type="button" className="link-button" onClick={onMine}>
            My answers
          </button>{" "}
          <kbd>m</kbd>
        </p>
      </div>
    </div>
  );
}

function PairKeyList() {
  const pair = (k: string, d: string) => (
    <div className="facts-pair" key={k}>
      <dt>{k}</dt>
      <dd>{d}</dd>
    </div>
  );
  return (
    <dl className="facts keys">
      {pair("1", "the left is post, the right pre")}
      {pair("2", "the right is post, the left pre")}
      {pair("3", "both pre")}
      {pair("4", "both post (a rerun after the contrast)")}
      {pair("5", "can't tell")}
      {pair("Enter", "answer, then the next pair; on an answer opened again, correct it")}
      {pair("s", "give it back, then the next; on an answer opened again, leave it as it was")}
      {pair("b", "open your last answer again to correct it; again, the one before")}
      {pair("m", "your answers, by pair, to open one and correct it")}
      {pair("l", "keep the two pictures on one slice, or let each move alone")}
      {pair("w", "one window for both, scaled to each stack's reference tissue, or each its own")}
      {pair("7 8 9 0", "jump to the ventricles, the superior sagittal sinus, the transverse sinuses, the sella (approximate)")}
      {pair("↑ ↓, Page Up and Down", "page the side under the pointer; where they are kept on one slice, the other follows")}
      {pair("Space", "the three planes: enlarge one")}
    </dl>
  );
}

/**
 * A pair campaign on its own page: how far it is read, how often each
 * answer was given, the time per pair, and each answer resolved per stack
 * to save as a file. While the campaign is open a rater reads only their own.
 */
export function PairPanel({ campaign }: { campaign: Campaign }) {
  const [s, setS] = useState<PairSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    pairDoors.summary(campaign.id).then(setS, (e: unknown) => setFailed(refusedWords(e)));
  }, [campaign.id]);
  const save = () => {
    setSaving(true);
    pairDoors
      .values(campaign.id)
      .then((d) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${campaign.name.replace(/[^\w.-]+/gu, "-")}-values.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      })
      .catch((e: unknown) => setFailed(refusedWords(e)))
      .finally(() => setSaving(false));
  };
  return (
    <div className="ab-panel pair-panel">
      <h2>Read in pairs</h2>
      {failed && <p className="warn">{failed}</p>}
      {s && (
        <dl className="facts">
          <div className="facts-pair">
            <dt>read</dt>
            <dd>
              {s.answered} of {s.items} pairs
            </dd>
          </div>
          <div className="facts-pair">
            <dt>answers</dt>
            <dd>{answerCounts(s)}</dd>
          </div>
          <div className="facts-pair">
            <dt>per pair</dt>
            <dd>{s.median === null ? "not timed yet" : `median ${s.median} s`}</dd>
          </div>
        </dl>
      )}
      <p>
        <button type="button" className="button secondary small" disabled={saving} onClick={save}>
          Save the values
        </button>{" "}
        <span className="meta">each answer resolved per stack: left post gives the left given and the right not given, and so on</span>
      </p>
    </div>
  );
}
