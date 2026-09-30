// SPDX-License-Identifier: AGPL-3.0-only
// Anchored reading (the post-contrast study, record 48 of 2026-09-29,
// night). Nima reads whether contrast was given to a candidate stack beside
// a known-pre and a known-post anchor of the same subject, in three panels
// in the order the engine's seed drew. The page shows the three pictures,
// labelled candidate, reference pre and reference post, and nothing else of
// any of them: no time, no series name, no header, no value the rules gave,
// no stack number. An anchor of another session is flagged. One key
// answers: 1 like the pre, 2 like the post, 3 can't tell; Enter sends it.
//
// So that a real difference in signal stays visible, every panel is scaled
// by its own reference tissue and shown under one window by default, which
// a drag on any panel moves for all (`w` gives each its own again). Where
// the geometry matches, paging one panel pages the others to the same
// place (`l`). `d` shows the candidate minus each anchor on the anchors'
// panels. 7 to 0 jump to the ventricles, the superior sagittal sinus, the
// transverse sinuses and the sella, estimated from the head's extent and
// said to be approximate. `b` opens one's last answer again (and again the
// one before), `m` lists one's answers by item; an answer opened shows the
// same three panels with it marked, and another choice and Enter correct it
// (the engine keeps the earlier answer). The item leased stays leased.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import type { Manifest } from "../viewer/doors";
import { ANCHORED_ANSWERS, ANCHORED_WORDS, anchoredCounts, anchoredDoors, anchoredKey, follow, linksOf, ROLE_WORDS, type AnchoredAnswer, type AnchoredSheet, type AnchoredSummary, type Role } from "./anchored";
import { beatEvery, campaigns, leaseLeft, leaseWords, refused as refusedWords, type Campaign, type Item, type MyAnswer } from "./client";
import { RegionJumps, WindowControl } from "./Compare";
import { answerOf, useCorrection } from "./correct";
import { Difference } from "./Difference";
import { MyAnswers } from "./MyAnswers";
import { claimIn } from "./readerDoors";
import { planeAt, regionPoint, REGIONS, type Region } from "./regions";
import { StackView } from "./StackView";
import { useReference, useSharedWindow } from "./window";
import { beatSeat, seatOf, type Seat } from "./workspace";

const NONE: Record<Role, number | null> = { candidate: null, reference_pre: null, reference_post: null };

/** An item in words, by its place in the campaign: never a stack's number. */
export const anchoredWords = (i: Pick<Item, "position">): string => `item ${i.position + 1}`;

export function AnchoredReader({ caps, id, query }: { caps: Capabilities; id: string; query?: Record<string, string> }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat>({ kind: "claiming" });
  // the sheet with the item it is of: one of an item no longer on the screen is never drawn or answered against
  const [loaded, setLoaded] = useState<{ key: string; sheet: AnchoredSheet } | null>(null);
  const [sheetFailed, setSheetFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<AnchoredAnswer | null>(null);
  const [summary, setSummary] = useState<AnchoredSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [manifests, setManifests] = useState<Partial<Record<Role, Manifest>>>({});
  const [slices, setSlices] = useState<Record<Role, number | null>>(NONE);
  const [linked, setLinked] = useState(true);
  const [difference, setDifference] = useState(false);
  const [active, setActive] = useState<Role>("candidate");
  const [jumped, setJumped] = useState<string | null>(null);
  const capsNow = useRef(caps);
  capsNow.current = caps;
  const amendAt = query?.amend && /^\d+$/u.test(query.amend) ? Number(query.amend) : null;
  const correction = useCorrection({ caps, id, campaign, amendAt, busy, say: setSaid, words: anchoredWords });
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
    anchoredDoors.summary(id).then(setSummary, () => undefined);
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
  // the item on the screen: one's own answer open to correct, else the item leased
  const shown: Pick<Item, "id" | "position"> | null = amending ? { id: amending.item, position: amending.position } : (holding?.item ?? null);
  const shownKey = amending ? `amend:${amending.answer}` : assignmentId === null ? null : `lease:${assignmentId}`;
  const was = amending ? answerOf(ANCHORED_ANSWERS, amending.value) : null;
  const current = useRef<string | null>(null);
  current.current = shownKey;
  const sheet = loaded && loaded.key === shownKey ? loaded.sheet : null;
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    if (!shown || !shownKey) return;
    setLoaded(null);
    setSheetFailed(null);
    setChosen(was);
    setRefused(null);
    setManifests({});
    setSlices(NONE);
    setJumped(null);
    setShownAt(Date.now());
    const at = shownKey;
    anchoredDoors.sheet(id, shown.id).then(
      (s) => current.current === at && setLoaded({ key: at, sheet: s }),
      (e: unknown) => current.current === at && setSheetFailed(refusedWords(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

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

  const stackOf = useCallback((r: Role) => sheet?.panels.find((p) => p.role === r)?.stack ?? null, [sheet]);

  // one window across the three
  const shared = useSharedWindow({
    candidate: sheet ? { stack: stackOf("candidate")!, manifest: manifests.candidate } : undefined,
    reference_pre: sheet ? { stack: stackOf("reference_pre")!, manifest: manifests.reference_pre } : undefined,
    reference_post: sheet ? { stack: stackOf("reference_post")!, manifest: manifests.reference_post } : undefined,
  });

  // one slice where the geometry matches
  const links = useMemo(() => linksOf(manifests), [manifests]);
  const syncRef = useRef({ links, linked });
  syncRef.current = { links, linked };
  const moved = useCallback((role: Role, z: number) => {
    const { links, linked } = syncRef.current;
    setSlices((s) => (linked ? follow(links, role, z, s) : { ...s, [role]: z }));
  }, []);
  useEffect(() => {
    const m = manifests.candidate;
    if (!links || !linked || !m) return;
    setSlices((s) => follow(links, "candidate", s.candidate ?? Math.floor(m.shape[0] / 2), s));
  }, [links, linked, manifests.candidate]);
  const seen = useCallback((role: Role, m: Manifest) => setManifests((x) => (x[role] === m ? x : { ...x, [role]: m })), []);
  const onSlice = useMemo(() => Object.fromEntries((["candidate", "reference_pre", "reference_post"] as const).map((r) => [r, (z: number) => moved(r, z)])) as Record<Role, (z: number) => void>, [moved]);
  const onManifest = useMemo(() => Object.fromEntries((["candidate", "reference_pre", "reference_post"] as const).map((r) => [r, (m: Manifest) => seen(r, m)])) as Record<Role, (m: Manifest) => void>, [seen]);
  const onVoi = useMemo(() => Object.fromEntries((["candidate", "reference_pre", "reference_post"] as const).map((r) => [r, (v: { lower: number; upper: number }) => shared.dragged(r, v)])) as Record<Role, (v: { lower: number; upper: number }) => void>, [shared]);

  // each panel's reference, for the jumps (its head's extent) and the difference (its value)
  const refs = {
    candidate: useReference(stackOf("candidate"), manifests.candidate),
    reference_pre: useReference(stackOf("reference_pre"), manifests.reference_pre),
    reference_post: useReference(stackOf("reference_post"), manifests.reference_post),
  };
  const jumpable = !!(refs.candidate?.extent && manifests.candidate);
  const jumpWhy = !manifests.candidate ? "the pictures are being read" : !refs.candidate ? "finding the head" : "the stack names no place in the patient, or no head was found";
  const jump = useCallback(
    (r: Region) => {
      const next = { ...NONE };
      const outside: string[] = [];
      for (const role of ["candidate", "reference_pre", "reference_post"] as const) {
        const m = manifests[role];
        const e = refs[role]?.extent;
        if (!m || !e) continue;
        const at = planeAt(m, regionPoint(r, e));
        if (!at) continue;
        next[role] = at.z;
        if (!at.inside) outside.push(ROLE_WORDS[role]);
      }
      setSlices((s) => ({ candidate: next.candidate ?? s.candidate, reference_pre: next.reference_pre ?? s.reference_pre, reference_post: next.reference_post ?? s.reference_post }));
      setJumped(outside.length ? `${r.label}, approximately; outside the ${outside.join(" and the ")}` : `${r.label}, approximately`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifests, refs.candidate, refs.reference_pre, refs.reference_post],
  );

  const send = useCallback(() => {
    if (!sheet || busy || (!holding && !amending)) return;
    if (!chosen) {
      setRefused("Choose first: 1 like the pre, 2 like the post, 3 can't tell.");
      return;
    }
    setBusy(true);
    if (amending) {
      const a: MyAnswer = amending;
      const answer = chosen;
      campaigns
        .amend(id, a.answer, { value: answer })
        .then((r) => {
          const before = answerOf(ANCHORED_ANSWERS, a.value);
          setSaid(r.unchanged || before === answer ? `${anchoredWords(a)} kept as it was: ${ANCHORED_WORDS[answer]}.` : `Corrected ${anchoredWords(a)}: ${before ? ANCHORED_WORDS[before] : "the earlier answer"} is now ${ANCHORED_WORDS[answer]}; the earlier answer is kept.`);
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
        setSaid(`Read ${anchoredWords(it)}: ${ANCHORED_WORDS[answer]}.`);
        refreshSummary();
        claim();
      })
      .catch((e: unknown) => setRefused(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [holding, amending, sheet, busy, chosen, id, claim, refreshSummary, correction]);

  const giveBack = useCallback(
    (then: "next" | "stop") => {
      if (busy) return;
      // a correction left as it was: back to the item leased, which stays leased
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
          setSaid(`Gave ${anchoredWords(holding.item)} back.`);
          if (then === "next") claim();
          else location.hash = href("campaigns", id);
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
    },
    [holding, amending, busy, id, claim, correction],
  );

  const keyed = useRef({ send, giveBack, jump, jumpable, shared, correction });
  keyed.current = { send, giveBack, jump, jumpable, shared, correction };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("dialog, .drawer")) return;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Enter" && !inField && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
      const act = anchoredKey(e.key, { inField, ctrl: e.ctrlKey });
      if (!act) return;
      e.preventDefault();
      const k = keyed.current;
      if (act.kind === "answer") {
        setRefused(null);
        setChosen(act.answer);
      } else if (act.kind === "send") k.send();
      else if (act.kind === "skip") k.giveBack("next");
      else if (act.kind === "sync") setLinked((x) => !x);
      else if (act.kind === "window") k.shared.setMode(k.shared.mode === "shared" ? "own" : "shared");
      else if (act.kind === "difference") setDifference((x) => !x);
      else if (act.kind === "region") {
        if (k.jumpable) k.jump(REGIONS[act.region]);
      } else if (act.kind === "back") k.correction.back();
      else if (act.kind === "mine") k.correction.setListOpen((x) => !x);
      else if (act.kind === "keys") setKeys((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (failed) return <p className="warn">The campaign could not be read: {failed}</p>;
  if (!campaign) return <Wait phase="reading the campaign" since={now} size="panel" />;
  const left = holding ? leaseLeft(holding.assignment, now) : null;
  const open = campaign.counts.items.open ?? null;
  const all = manifests.candidate && manifests.reference_pre && manifests.reference_post;
  const tied = links ? (["reference_pre", "reference_post"] as const).filter((r) => links.fromCandidate[r]).length : 0;
  const syncWords = !linked ? "each alone" : !all ? "one slice, once all are read" : tied === 2 ? "one slice" : tied === 1 ? "one slice where the geometry matches" : "each alone: the geometry differs";
  const cand = stackOf("candidate");
  const candRef = refs.candidate?.value ?? null;
  return (
    <section className="data campaign-rate reader-one pair-reader anchored-reader">
      <div className="reader-head">
        <span className="eyebrow">
          <a href={href("campaigns")}>Campaigns</a> · <a href={href("campaigns", String(campaign.id))}>{campaign.name}</a>
        </span>
        <h1>Read against anchors</h1>
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
            <span title={anchoredCounts(summary)}>
              <b>{summary.answered}</b> of {summary.items} read{summary.median !== null && ` · median ${summary.median} s`}
            </span>
          )}
          {summary === null && open !== null && (
            <span>
              <b>{open}</b> open
            </span>
          )}
          {shown && shownAt !== null && (
            <span className="on-this" title="how long this item has been on the screen">
              {" "}
              · this one <b>{secondsWords(now - shownAt)}</b>
            </span>
          )}
        </span>
      </div>
      {!amending && <SeatNote seat={seat} campaign={campaign} now={now} onAgain={() => claim()} onMine={() => correction.setListOpen(true)} />}
      {correction.listOpen && <MyAnswers caps={caps} campaign={campaign} values={[]} back="rate" onClose={() => correction.setListOpen(false)} onPick={correction.open} current={amending?.answer ?? null} />}
      {shown && (
        <div className={amending ? "anchored-grid correcting" : "anchored-grid"}>
          {sheetFailed && <p className="warn pair-bar">The item could not be read: {sheetFailed}</p>}
          {!sheet && !sheetFailed && <Wait phase="reading the item" since={shownAt ?? now} size="panel" />}
          {sheet &&
            sheet.panels.map((p) => {
              const anchorRef = refs[p.role]?.value ?? null;
              const showDiff = difference && p.role !== "candidate" && cand !== null && manifests.candidate && manifests[p.role] && candRef && anchorRef;
              return (
                <div key={p.role} className={["rate-picture", "pair-side", "anchored-panel", active === p.role ? "active" : "", p.role === "candidate" ? "is-candidate" : "is-reference"].filter(Boolean).join(" ")} data-role={p.role} onPointerEnter={() => setActive(p.role)} onFocusCapture={() => setActive(p.role)}>
                  <span className="pair-label" aria-hidden="true">
                    {ROLE_WORDS[p.role]}
                    {p.otherSession && (
                      <b className="tag caution anchored-other" title="this reference is from another session of the same person, the closest with the same settings">
                        another session
                      </b>
                    )}
                    {p.role === "candidate" && chosen && <b className={`pair-says ${chosen === "like_post" ? "post" : ""}`}>{ANCHORED_WORDS[chosen]}</b>}
                  </span>
                  <div className="anchored-stage">
                    <StackView stack={p.stack} view="stack" keys={active === p.role} slice={slices[p.role]} onSlice={onSlice[p.role]} onManifest={onManifest[p.role]} voi={shared.voiFor(p.role)} onVoi={onVoi[p.role]} />
                    {showDiff && (
                      <Difference
                        cand={{ stack: cand, manifest: manifests.candidate!, ref: candRef }}
                        anchor={{ stack: p.stack, manifest: manifests[p.role]!, ref: anchorRef }}
                        z={slices.candidate ?? Math.floor(manifests.candidate!.shape[0] / 2)}
                        label={`candidate − ${ROLE_WORDS[p.role]}`}
                      />
                    )}
                    {difference && p.role !== "candidate" && !showDiff && <p className="difference-none difference-wait">The difference waits for both pictures and their references.</p>}
                  </div>
                </div>
              );
            })}
          {sheet && (
            <div className="pair-bar anchored-bar" data-reader-panel="">
              <div className="rate-item">
                <b>{anchoredWords(shown)}</b>
                {amending ? (
                  <span className="tag caution correcting-tag" title="your answer to this item, open to correct; the item you were reading stays yours">
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
                <button type="button" className={linked && tied > 0 ? "tag pair-sync on" : "tag pair-sync"} aria-pressed={linked} onClick={() => setLinked((x) => !x)} title="keep the pictures on one slice where their geometry matches (l)">
                  {syncWords}
                </button>
                <WindowControl w={shared} />
                <button type="button" className={difference ? "tag compare-toggle on" : "tag compare-toggle"} aria-pressed={difference} onClick={() => setDifference((x) => !x)} title="the candidate minus each reference on the reference's panel, each scaled by its reference tissue; mid grey is none, brighter is the candidate brighter (d)">
                  difference
                </button>
                <RegionJumps onJump={jump} disabled={!jumpable} why={jumpable ? null : jumpWhy} />
                {jumped && <span className="meta compare-jumped">{jumped}</span>}
              </div>
              <div className="pair-answers" role="group" aria-label="the answer">
                {ANCHORED_ANSWERS.map((a, i) => (
                  <button key={a} type="button" className={["opt", "pair-answer", chosen === a ? "on" : "", was === a ? "yours" : ""].filter(Boolean).join(" ")} aria-pressed={chosen === a} disabled={busy} onClick={() => (setRefused(null), setChosen(a))}>
                    <kbd>{i + 1}</kbd>
                    {ANCHORED_WORDS[a]}
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
                  <button type="button" className="button secondary" disabled={busy} onClick={() => giveBack("next")} title="Leave your answer as it was, and go back to the item you were reading">
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
                <button type="button" className="button quiet mine-open" aria-expanded={correction.listOpen} onClick={() => correction.setListOpen((x) => !x)} title="your answers here, by item, to open one and correct it">
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
                  <AnchoredKeyList />
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

function AnchoredKeyList() {
  const pair = (k: string, d: string) => (
    <div className="facts-pair" key={k}>
      <dt>{k}</dt>
      <dd>{d}</dd>
    </div>
  );
  return (
    <dl className="facts keys">
      {pair("1", "the candidate looks like the reference pre")}
      {pair("2", "the candidate looks like the reference post")}
      {pair("3", "can't tell")}
      {pair("Enter", "answer, then the next item; on an answer opened again, correct it")}
      {pair("s", "give it back, then the next; on an answer opened again, leave it as it was")}
      {pair("b", "open your last answer again to correct it; again, the one before")}
      {pair("m", "your answers, by item, to open one and correct it")}
      {pair("l", "keep the pictures on one slice, or let each move alone")}
      {pair("w", "one window for all, scaled to each stack's reference tissue, or each its own")}
      {pair("d", "the candidate minus each reference, on the references' panels")}
      {pair("7 8 9 0", "jump to the ventricles, the superior sagittal sinus, the transverse sinuses, the sella (approximate)")}
      {pair("↑ ↓, Page Up and Down", "page the picture under the pointer; where they are kept on one slice, the others follow")}
      {pair("left drag", "window and level; with one window, all follow")}
    </dl>
  );
}

/**
 * An anchored campaign on its own page: how far it is read, how often each
 * answer was given, the items with an anchor of another session, the time
 * per item, and each answer's candidate value to save as a file.
 */
export function AnchoredPanel({ campaign }: { campaign: Campaign }) {
  const [s, setS] = useState<AnchoredSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    anchoredDoors.summary(campaign.id).then(setS, (e: unknown) => setFailed(refusedWords(e)));
  }, [campaign.id]);
  const save = () => {
    setSaving(true);
    anchoredDoors
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
      <h2>Read against anchors</h2>
      {failed && <p className="warn">{failed}</p>}
      {s && (
        <dl className="facts">
          <div className="facts-pair">
            <dt>read</dt>
            <dd>
              {s.answered} of {s.items} items
            </dd>
          </div>
          <div className="facts-pair">
            <dt>answers</dt>
            <dd>{anchoredCounts(s)}</dd>
          </div>
          <div className="facts-pair">
            <dt>anchors</dt>
            <dd>{s.otherSession === 0 ? "every one from the candidate's session" : `${s.otherSession} item${s.otherSession === 1 ? "" : "s"} with an anchor of another session`}</dd>
          </div>
          <div className="facts-pair">
            <dt>per item</dt>
            <dd>{s.median === null ? "not timed yet" : `median ${s.median} s`}</dd>
          </div>
        </dl>
      )}
      <p>
        <button type="button" className="button secondary small" disabled={saving} onClick={save}>
          Save the values
        </button>{" "}
        <span className="meta">each answer resolved for its candidate alone: like the post gives it given, like the pre not given; the anchors get no value</span>
      </p>
    </div>
  );
}
