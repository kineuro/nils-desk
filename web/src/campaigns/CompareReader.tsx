// SPDX-License-Identifier: AGPL-3.0-only
// The comparison reader (the post-contrast study): the page pair mode and
// anchored reading share, each told by its own spec (PairReader.tsx,
// AnchoredReader.tsx) what an item shows and what its answers are. It shows
// the pictures and nothing else of the stacks: no time, no series name, no
// header, no value the rules gave, no stack number.
//
// Rebuilt after Nima's read of 2026-10-02 ("take the UI/UX to another
// level"): the page is three bands by what they do. On top, where the
// campaign stands: read, left, the median, this item's clock, and what the
// last key did, with the way back. In the middle, the panels, every one in
// the view the rater chose (the stack, the three planes, one plane alone),
// kept for every item and the next visit. Under them, a quiet toolbar of
// the view and the comparison (one slice, one window, the difference, the
// jumps) with the way back to one's answers, and apart from it the answer
// keys, large and on one line, the primary act of the page. Every control
// shows its key; `?` lists them all by what they do. The next items are
// warmed while this one is read (ahead.ts), so moving on draws from memory;
// the panels keep their place while the next item comes, so nothing
// shifts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import type { Manifest } from "../viewer/doors";
import type { ViewMode } from "../viewer/view";
import { aheadOf, Warmer, type Ahead } from "./ahead";
import { beatEvery, campaigns, leaseLeft, leaseWords, refused as refusedWords, type Campaign, type Item, type MyAnswer } from "./client";
import { compareKey, hubFollow, hubLinks, keyGroups, loadPrefs, nextView, prefsKey, READER_VIEWS, savePrefs, tiedCount, viewLabel, viewOf, withAll, withPanel, DEFAULT_PREFS, type ReaderPrefs } from "./compare";
import { RegionJumps, WindowControl } from "./Compare";
import { answerOf, useCorrection } from "./correct";
import { Difference } from "./Difference";
import { MyAnswers } from "./MyAnswers";
import { claimIn } from "./readerDoors";
import { planeAt, regionPoint, REGIONS, type Region } from "./regions";
import { StackView } from "./StackView";
import { useReference, useSharedWindow } from "./window";
import { beatSeat, seatOf, type Seat } from "./workspace";

export interface ComparePanel {
  /** The panel's name on the page: a side, a role. */
  key: string;
  stack: number;
  /** What the panel is called on the screen. */
  label: string;
  /** The panel the others are kept on one slice with. */
  lead: boolean;
  /** A flag beside the label (an anchor of another session). */
  flag?: { words: string; title: string };
}

export interface CompareSheet {
  item: number;
  /** In the order the engine's seed drew them, left to right. */
  panels: ComparePanel[];
}

export interface CompareSummary {
  items: number;
  answered: number;
  median: number | null;
  /** How often each answer was given, in words. */
  counts: string;
}

export interface CompareSpec<A extends string> {
  /** The page's address and the key the rater's choices are kept under. */
  kind: "pairs" | "anchored";
  title: string;
  /** What an item is called: "item", "pair". */
  noun: string;
  words: (i: Pick<Item, "position">) => string;
  answers: readonly A[];
  answerWords: Record<A, string>;
  /** Each answer in full, for the keys. */
  answerHelp: Record<A, string>;
  /** The panels' keys, in a fixed order (the hooks of each panel). */
  panelKeys: readonly string[];
  panelWord: (key: string) => string;
  sheet: (c: string, item: number) => Promise<CompareSheet>;
  summary: (c: string) => Promise<CompareSummary>;
  /** What the chosen answer says of a panel, shown on it. */
  says: (chosen: A, panel: string) => { words: string; post: boolean } | null;
  /** The candidate minus each reference (anchored reading). */
  difference: boolean;
  /** A view kept before this page kept one per campaign, as the first choice. */
  legacyView?: () => ViewMode | null;
}

type Loaded = { key: string; sheet: CompareSheet; item: Pick<Item, "id" | "position"> };

export function CompareReader<A extends string>({ caps, id, query, spec }: { caps: Capabilities; id: string; query?: Record<string, string>; spec: CompareSpec<A> }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [seat, setSeat] = useState<Seat>({ kind: "claiming" });
  const [ahead, setAhead] = useState<Ahead[]>([]);
  // the sheet on the screen with the item it is of; the next one replaces it whole once read, so nothing shifts while it comes
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sheetFailed, setSheetFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<A | null>(null);
  const [summary, setSummary] = useState<CompareSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ words: string; undo: boolean; n: number } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  const [manifests, setManifests] = useState<Partial<Record<string, Manifest>>>({});
  const [slices, setSlices] = useState<Record<string, number | null>>({});
  const [linked, setLinked] = useState(true);
  const [difference, setDifference] = useState(false);
  const [active, setActive] = useState<string>(spec.panelKeys[0]);
  const [jumped, setJumped] = useState<string | null>(null);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [ready, setReady] = useState<Record<string, "first" | "full">>({});
  const principal = caps.person?.subject ?? caps.engine?.principal ?? "someone";
  const storeKey = prefsKey(spec.kind, id, principal);
  const [prefs, setPrefsState] = useState<ReaderPrefs>(() => loadPrefs(storeKey, { ...DEFAULT_PREFS, all: spec.legacyView?.() ?? DEFAULT_PREFS.all }));
  const setPrefs = useCallback(
    (f: (p: ReaderPrefs) => ReaderPrefs) =>
      setPrefsState((p) => {
        const next = f(p);
        savePrefs(storeKey, next);
        return next;
      }),
    [storeKey],
  );
  const say = useCallback((words: string, undo = false) => setSaid((s) => ({ words, undo, n: (s?.n ?? 0) + 1 })), []);
  const capsNow = useRef(caps);
  capsNow.current = caps;
  const amendAt = query?.amend && /^\d+$/u.test(query.amend) ? Number(query.amend) : null;
  const correction = useCorrection({ caps, id, campaign, amendAt, busy, say: (w) => say(w), words: spec.words });
  const amending = correction.amending;

  const claim = useCallback(
    (note: string | null = null) => {
      setSeat({ kind: "claiming" });
      claimIn(id, "rater", "position")
        .then((c) => {
          setAhead(aheadOf(c));
          setSeat(seatOf(c, note));
        })
        .catch((e: unknown) => setSeat({ kind: "failed", why: refusedWords(e) }));
    },
    [id],
  );
  const refreshSummary = useCallback(() => {
    spec.summary(id).then(setSummary, () => undefined);
  }, [id, spec]);

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
  // the item asked for: one's own answer open to correct, else the item leased
  const wanted: Pick<Item, "id" | "position"> | null = amending ? { id: amending.item, position: amending.position } : (holding?.item ?? null);
  const wantedKey = amending ? `amend:${amending.answer}` : assignmentId === null ? null : `lease:${assignmentId}`;
  const was = amending ? answerOf(spec.answers, amending.value) : null;
  const current = useRef<string | null>(null);
  current.current = wantedKey;
  // what is on the screen, and whether it is still the item asked for: an answer is only ever sent against that
  const sheet = loaded?.sheet ?? null;
  const fresh = !!loaded && loaded.key === wantedKey;
  const shown = fresh ? loaded.item : wanted;
  const wasRef = useRef(was);
  wasRef.current = was;
  // the items read last, so the way back draws from memory
  const behind = useRef<number[][]>([]);

  useEffect(() => {
    if (!wanted || !wantedKey) return;
    setSheetFailed(null);
    setRefused(null);
    const at = wantedKey;
    const item = wanted;
    spec.sheet(id, item.id).then(
      (s) => {
        if (current.current !== at) return;
        setLoaded((prev) => {
          if (prev && prev.key !== at) behind.current = [prev.sheet.panels.map((p) => p.stack), ...behind.current].slice(0, 2);
          return { key: at, sheet: s, item };
        });
        // the item's own state, all at once with its pictures
        setChosen(wasRef.current);
        setManifests({});
        setSlices({});
        setJumped(null);
        setReady({});
        setShownAt(Date.now());
      },
      (e: unknown) => current.current === at && setSheetFailed(refusedWords(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  // the heartbeat keeps the lease
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

  const panelOf = useCallback((k: string) => sheet?.panels.find((p) => p.key === k) ?? null, [sheet]);
  const lead = sheet?.panels.find((p) => p.lead)?.key ?? spec.panelKeys[0];

  // one window across the panels
  const windowPanels: Record<string, { stack: number; manifest?: Manifest } | undefined> = {};
  for (const k of spec.panelKeys) {
    const p = panelOf(k);
    windowPanels[k] = p ? { stack: p.stack, manifest: manifests[k] } : undefined;
  }
  const shared = useSharedWindow(windowPanels);

  // one slice where the geometry matches, through the lead panel
  const links = useMemo(() => hubLinks(manifests, lead, spec.panelKeys), [manifests, lead, spec.panelKeys]);
  const syncRef = useRef({ links, linked });
  syncRef.current = { links, linked };
  const moved = useCallback((k: string, z: number) => {
    const { links, linked } = syncRef.current;
    setSlices((s) => (linked ? hubFollow(links, k, z, s) : { ...s, [k]: z }));
  }, []);
  useEffect(() => {
    const m = manifests[lead];
    if (!links || !linked || !m) return;
    setSlices((s) => hubFollow(links, lead, s[lead] ?? Math.floor(m.shape[0] / 2), s));
  }, [links, linked, lead, manifests]);
  const seen = useCallback((k: string, m: Manifest) => setManifests((x) => (x[k] === m ? x : { ...x, [k]: m })), []);
  const onSlice = useMemo(() => Object.fromEntries(spec.panelKeys.map((k) => [k, (z: number) => moved(k, z)])) as Record<string, (z: number) => void>, [moved, spec.panelKeys]);
  const onManifest = useMemo(() => Object.fromEntries(spec.panelKeys.map((k) => [k, (m: Manifest) => seen(k, m)])) as Record<string, (m: Manifest) => void>, [seen, spec.panelKeys]);
  const onVoi = useMemo(() => Object.fromEntries(spec.panelKeys.map((k) => [k, (v: { lower: number; upper: number }) => shared.dragged(k, v)])) as Record<string, (v: { lower: number; upper: number }) => void>, [shared, spec.panelKeys]);
  const onReady = useMemo(() => Object.fromEntries(spec.panelKeys.map((k) => [k, (r: "first" | "full") => setReady((x) => (x[k] === r ? x : { ...x, [k]: r }))])) as Record<string, (r: "first" | "full") => void>, [spec.panelKeys]);

  // each panel's reference: the jumps from its head's extent, the difference from its value (a hook per panel, in a fixed order)
  const refs: Record<string, ReturnType<typeof useReference>> = {};
  for (const k of spec.panelKeys) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    refs[k] = useReference(panelOf(k)?.stack ?? null, manifests[k]);
  }
  const jumpable = !!(refs[lead]?.extent && manifests[lead]);
  const jumpWhy = !manifests[lead] ? "the pictures are being read" : !refs[lead] ? "finding the head" : "the stack names no place in the patient, or no head was found";
  const refsKey = spec.panelKeys.map((k) => (refs[k] ? 1 : 0)).join("");
  const jump = useCallback(
    (r: Region) => {
      const next: Record<string, number | null> = {};
      const outside: string[] = [];
      for (const k of spec.panelKeys) {
        const m = manifests[k];
        const e = refs[k]?.extent;
        if (!m || !e) continue;
        const at = planeAt(m, regionPoint(r, e));
        if (!at) continue;
        next[k] = at.z;
        if (!at.inside) outside.push(spec.panelWord(k));
      }
      setSlices((s) => ({ ...s, ...Object.fromEntries(Object.entries(next).filter(([, z]) => z !== null)) }));
      setJumped(outside.length ? `${r.label}, approximately; outside the ${outside.join(" and the ")}` : `${r.label}, approximately`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifests, refsKey, spec],
  );

  // the next items, warmed once this one is drawn (or has had a moment), in the views the panels are in
  const warmer = useRef<Warmer | null>(null);
  warmer.current ??= new Warmer();
  useEffect(() => () => warmer.current?.stop(), []);
  const grid = useRef<HTMLDivElement | null>(null);
  const modes = spec.panelKeys.map((k) => viewOf(prefs, k));
  const modesKey = modes.join(",");
  const drawnKeys = sheet ? sheet.panels.filter((p) => ready[p.key] === "full").length : 0;
  const allDrawn = !!sheet && drawnKeys === sheet.panels.length;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (!fresh) return;
    const t = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(t);
  }, [fresh, loaded?.key]);
  const aheadKey = ahead.map((a) => a.stacks.join(".")).join("|");
  const aheadNow = useRef(ahead);
  aheadNow.current = ahead;
  useEffect(() => {
    if (!sheet || !fresh || !(allDrawn || settled)) return;
    const px = grid.current?.querySelector<HTMLElement>(".viewer-element")?.clientWidth ?? grid.current?.querySelector<HTMLElement>(".compare-panel")?.clientWidth ?? 512;
    void warmer.current!.warm(ahead, { modes, px }, { current: sheet.panels.map((p) => p.stack), behind: behind.current.flat() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aheadKey, modesKey, loaded?.key, fresh, allDrawn, settled]);

  const send = useCallback(
    (given?: A) => {
      const answer = given ?? chosen;
      if (!sheet || !fresh || busy || (!holding && !amending)) return;
      if (!answer) {
        setRefused(`Choose first: ${spec.answers.map((a, i) => `${i + 1} ${spec.answerWords[a]}`).join(", ")}.`);
        return;
      }
      setBusy(true);
      // the answer, the claim and the next item go first: the warming waits until it is drawn
      warmer.current?.pause([...sheet.panels.map((p) => p.stack), ...(aheadNow.current[0]?.stacks ?? [])]);
      if (amending) {
        const a: MyAnswer = amending;
        campaigns
          .amend(id, a.answer, { value: answer })
          .then((r) => {
            const before = answerOf(spec.answers, a.value);
            say(r.unchanged || before === answer ? `${spec.words(a)} kept as it was: ${spec.answerWords[answer]}.` : `Corrected ${spec.words(a)}: ${before ? spec.answerWords[before] : "the earlier answer"} is now ${spec.answerWords[answer]}; the earlier answer is kept.`);
            refreshSummary();
            correction.done(a);
          })
          .catch((e: unknown) => setRefused(refusedWords(e)))
          .finally(() => setBusy(false));
        return;
      }
      if (!holding) return setBusy(false);
      const it = holding.item;
      campaigns
        .answer(id, holding.assignment.id, { value: answer })
        .then(() => {
          say(`Read ${spec.words(it)}: ${spec.answerWords[answer]}.`, true);
          refreshSummary();
          claim();
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
    },
    [holding, amending, sheet, fresh, busy, chosen, id, claim, refreshSummary, correction, spec, say],
  );

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
          say(`Gave ${spec.words(holding.item)} back.`);
          if (then === "next") claim();
          else location.hash = href("campaigns", id);
        })
        .catch((e: unknown) => setRefused(refusedWords(e)))
        .finally(() => setBusy(false));
    },
    [holding, amending, busy, id, claim, correction, spec, say],
  );

  const chooseView = useCallback((mode: ViewMode | "next", one: string | null) => {
    setPrefs((p) => {
      if (one) return withPanel(p, one, mode === "next" ? nextView(viewOf(p, one)) : mode);
      return withAll(p, mode === "next" ? nextView(p.all) : mode);
    });
  }, [setPrefs]);

  // the keys
  const keyed = useRef({ send, giveBack, shared, jump, jumpable, correction, chosen, prefs, active, fresh });
  keyed.current = { send, giveBack, shared, jump, jumpable, correction, chosen, prefs, active, fresh };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("dialog, .drawer, .mine-drawer")) return;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      // Enter on a button or a link is that element's
      if (e.key === "Enter" && !inField && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
      const act = compareKey(e.key, { inField, ctrl: e.ctrlKey, shift: e.shiftKey, answers: spec.answers.length, difference: spec.difference });
      if (!act) return;
      e.preventDefault();
      const k = keyed.current;
      if (act.kind === "answer") {
        const a = spec.answers[act.index];
        setRefused(null);
        setChosen(a);
        if (k.prefs.auto && k.fresh) k.send(a);
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
      else if (act.kind === "auto") setPrefs((p) => ({ ...p, auto: !p.auto }));
      else if (act.kind === "view") chooseView(act.mode, act.one ? k.active : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spec, setPrefs, chooseView]);

  if (failed) return <p className="warn">The campaign could not be read: {failed}</p>;
  if (!campaign) return <Wait phase="reading the campaign" since={Date.now()} size="panel" />;
  const open = campaign.counts.items.open ?? null;
  const tied = tiedCount(links);
  const others = spec.panelKeys.length - 1;
  const all = spec.panelKeys.every((k) => manifests[k]);
  const syncWords = !linked ? "each alone" : !all ? "one slice" : tied === others ? "one slice" : tied > 0 ? "one slice, partly" : "each alone: the geometry differs";
  const syncTitle = !linked ? "each picture pages alone (l)" : tied === others ? "the pictures are kept on one slice (l)" : tied > 0 ? "kept on one slice where the geometry matches; the others move alone (l)" : "the geometry differs: each picture moves alone (l)";
  const leadPanel = sheet?.panels.find((p) => p.lead) ?? null;
  const leadRef = refs[lead]?.value ?? null;
  const waiting = !!wanted && !fresh && !sheetFailed;
  const left = holding ? leaseLeft(holding.assignment, Date.now()) : null;
  const done = !amending && (seat.kind === "done" || seat.kind === "failed") && !fresh;
  const mixed = Object.keys(prefs.panels).length > 0;
  return (
    <section className={`data campaign-rate reader-one pair-reader compare-reader ${spec.kind === "anchored" ? "anchored-reader" : "pairs-reader"}`} data-panels={spec.panelKeys.length}>
      <header className="reader-head compare-head">
        <span className="eyebrow">
          <a href={href("campaigns")}>Campaigns</a> · <a href={href("campaigns", String(campaign.id))}>{campaign.name}</a>
        </span>
        <h1>{spec.title}</h1>
        <span className="rate-item compare-item">
          <b>{shown ? spec.words(shown) : " "}</b>
          {amending ? (
            <span className="tag caution correcting-tag" title={`your answer to this ${spec.noun}, open to correct; the ${spec.noun} you were reading stays yours`}>
              correcting
            </span>
          ) : (
            // the lease is kept by the page; it is said only when it runs short
            holding && left !== null && left < 300 && (
              <span className={left < 120 ? "tag caution compare-lease" : "tag compare-lease"} title={`your lease: ${leaseWords(left)}`}>
                <Icon name="clock" />
                <LeaseClock assignment={holding.assignment} />
              </span>
            )
          )}
        </span>
        <span className="grow said-slot" aria-live="polite">
          {said && (
            <span key={said.n} className="meta said" title={said.words}>
              <Icon name="check" />
              <span className="said-words">{said.words}</span>
              {said.undo && correction.refusal === null && (
                <button type="button" className="link-button said-undo" onClick={correction.back}>
                  Undo <kbd>b</kbd>
                </button>
              )}
            </span>
          )}
        </span>
        <Progress summary={summary} open={open} shownAt={fresh ? shownAt : null} noun={spec.noun} />
      </header>
      {correction.listOpen && <MyAnswers caps={caps} campaign={campaign} values={[]} back="rate" onClose={() => correction.setListOpen(false)} onPick={correction.open} current={amending?.answer ?? null} />}
      {done ? (
        <SeatNote seat={seat} campaign={campaign} onAgain={() => claim()} onMine={() => correction.setListOpen(true)} />
      ) : (
        <>
          <div ref={grid} className={["compare-grid", amending ? "correcting" : "", waiting ? "waiting" : ""].filter(Boolean).join(" ")} aria-busy={waiting || !sheet}>
            {(sheet?.panels ?? spec.panelKeys.map((k) => ({ key: k, stack: -1, label: "", lead: false }) as ComparePanel)).map((p) => {
              const mode = viewOf(prefs, p.key);
              const own = prefs.panels[p.key] !== undefined;
              const anchorRef = refs[p.key]?.value ?? null;
              const showDiff = spec.difference && difference && sheet && !p.lead && leadPanel && manifests[lead] && manifests[p.key] && leadRef && anchorRef;
              const s = chosen && sheet ? spec.says(chosen, p.key) : null;
              return (
                <div
                  key={p.key}
                  className={["rate-picture", "pair-side", "anchored-panel", "compare-panel", active === p.key ? "active" : "", p.lead ? "is-candidate is-lead" : "is-reference", ready[p.key] === "full" ? "drawn" : ""].filter(Boolean).join(" ")}
                  data-role={p.key}
                  data-side={p.key}
                  onPointerEnter={() => setActive(p.key)}
                  onFocusCapture={() => setActive(p.key)}
                >
                  <div className="pair-label compare-label">
                    <span className="compare-name">{sheet ? p.label : " "}</span>
                    {p.flag && (
                      <b className="tag caution anchored-other" title={p.flag.title}>
                        {p.flag.words}
                      </b>
                    )}
                    {s && <b className={s.post ? "pair-says post" : "pair-says"}>{s.words}</b>}
                    <span className="grow" />
                    <PanelView mode={mode} own={own} panel={spec.panelWord(p.key)} onChoose={(m) => chooseView(m, p.key)} />
                  </div>
                  <div className="anchored-stage compare-stage">
                    {sheet && p.stack >= 0 && <StackView stack={p.stack} view={mode} bare keys={active === p.key} onReady={onReady[p.key]} slice={slices[p.key] ?? null} onSlice={onSlice[p.key]} onManifest={onManifest[p.key]} voi={shared.voiFor(p.key)} onVoi={onVoi[p.key]} />}
                    {showDiff && (
                      <Difference
                        cand={{ stack: leadPanel!.stack, manifest: manifests[lead]!, ref: leadRef! }}
                        anchor={{ stack: p.stack, manifest: manifests[p.key]!, ref: anchorRef! }}
                        z={slices[lead] ?? Math.floor(manifests[lead]!.shape[0] / 2)}
                        label={`${spec.panelWord(lead)} − ${spec.panelWord(p.key)}`}
                      />
                    )}
                    {spec.difference && difference && sheet && !p.lead && !showDiff && <p className="difference-none difference-wait">The difference waits for both pictures and their references.</p>}
                    {(!sheet || waiting) && (
                      <div className="compare-wait" aria-hidden="true">
                        <span className="compare-spinner" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pair-bar anchored-bar compare-bar" data-reader-panel="">
            <div className="compare-tools" role="toolbar" aria-label="the view and the comparison">
              <span className="compare-group compare-views" role="radiogroup" aria-label="the view of every panel">
                {READER_VIEWS.map((v) => (
                  <button key={v.mode} type="button" role="radio" aria-checked={!mixed && prefs.all === v.mode} className={!mixed && prefs.all === v.mode ? "tool on" : prefs.all === v.mode ? "tool on mixed" : "tool"} onClick={() => chooseView(v.mode, null)} title={`${v.title}, every panel (${v.key}; Shift+${v.key} for the panel under the pointer)`}>
                    <span className="tool-label">{v.label}</span>
                    <kbd>{v.key}</kbd>
                  </button>
                ))}
              </span>
              <span className="compare-group">
                <button type="button" className={linked && tied > 0 ? "tool pair-sync on" : "tool pair-sync"} aria-pressed={linked} onClick={() => setLinked((x) => !x)} title={syncTitle}>
                  <span className="tool-label">{syncWords}</span>
                  <kbd>l</kbd>
                </button>
                <WindowControl w={shared} />
                {spec.difference && (
                  <button type="button" className={difference ? "tool compare-diff on" : "tool compare-diff"} aria-pressed={difference} onClick={() => setDifference((x) => !x)} title="the candidate minus each reference on the reference's panel, each scaled by its reference tissue; mid grey is none, brighter is the candidate brighter (d)">
                    <span className="tool-label">difference</span>
                    <kbd>d</kbd>
                  </button>
                )}
              </span>
              <span className="compare-group compare-jumps">
                <RegionJumps onJump={jump} disabled={!jumpable} why={jumpable ? null : jumpWhy} />
              </span>
              <span className="grow compare-jumped-slot">{jumped && <span className="meta compare-jumped">{jumped}</span>}</span>
              <span className="compare-group compare-mine">
                <button type="button" className="tool mine-back" disabled={busy} onClick={correction.back} title="open your last answer again to correct it; again, the one before (b)">
                  <span className="tool-label">Previous</span>
                  <kbd>b</kbd>
                </button>
                <button type="button" className="tool mine-open" aria-expanded={correction.listOpen} onClick={() => correction.setListOpen((x) => !x)} title={`your answers here, by ${spec.noun}, to open one and correct it (m)`}>
                  <span className="tool-label">My answers</span>
                  <kbd>m</kbd>
                </button>
                <button type="button" className="tool compare-keys" aria-label="Keys" aria-expanded={keys} onClick={() => setKeys((x) => !x)} title="every key, by what it does (?)">
                  <kbd>?</kbd>
                </button>
              </span>
            </div>
            <div className="compare-answer">
              <div className="pair-answers compare-answers" role="group" aria-label="the answer" style={{ "--answers": spec.answers.length } as React.CSSProperties}>
                {spec.answers.map((a, i) => (
                  <button key={a} type="button" className={["opt", "pair-answer", chosen === a ? "on" : "", was === a ? "yours" : ""].filter(Boolean).join(" ")} aria-pressed={chosen === a} disabled={busy || !fresh} onClick={() => (setRefused(null), setChosen(a), prefs.auto && send(a))} title={spec.answerHelp[a]}>
                    <kbd>{i + 1}</kbd>
                    <span className="answer-words">{spec.answerWords[a]}</span>
                    {was === a && <span className="was">yours</span>}
                  </button>
                ))}
              </div>
              <span className="act-main compare-send" role="group" aria-label="send">
                <button type="button" className="button act-answer" disabled={busy || !chosen || !fresh} onClick={() => send()}>
                  {amending ? "Correct" : "Answer"} <kbd>Enter</kbd>
                </button>
              </span>
              <button type="button" className="button secondary compare-giveback" disabled={busy} onClick={() => giveBack("next")} title={amending ? `Leave your answer as it was, and go back to the ${spec.noun} you were reading` : "Back to the pool; never to you again"}>
                {amending ? "Keep it" : "Give back"} <kbd>s</kbd>
              </button>
              <label className="compare-auto" title="an answer's key sends it and moves on, with no Enter (u)">
                <input type="checkbox" checked={prefs.auto} onChange={(e) => setPrefs((p) => ({ ...p, auto: e.target.checked }))} />
                <span>send on key</span>
                <kbd>u</kbd>
              </label>
              <span className="grow compare-refused">
                {(refused || sheetFailed) && (
                  <span className="warn one-line" title={refused ?? sheetFailed ?? undefined}>
                    {refused ?? `The ${spec.noun} could not be read: ${sheetFailed}`}
                  </span>
                )}
              </span>
              <button type="button" className="button quiet compare-stop" disabled={busy} onClick={() => giveBack("stop")}>
                Stop
              </button>
            </div>
          </div>
        </>
      )}
      {keys && <KeysOverlay groups={keyGroups({ answers: spec.answers.map((a, i) => ({ key: String(i + 1), words: spec.answerHelp[a] })), noun: spec.noun, difference: spec.difference })} onClose={() => setKeys(false)} />}
    </section>
  );
}

/** Where the campaign stands: a bar of what is read, the numbers, and this item's clock (which ticks here alone, not the page). */
function Progress({ summary, open, shownAt, noun }: { summary: CompareSummary | null; open: number | null; shownAt: number | null; noun: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const share = summary && summary.items > 0 ? summary.answered / summary.items : null;
  return (
    <span className="rate-count-line compare-progress">
      {summary ? (
        <>
          <span className="compare-meter" role="progressbar" aria-valuemin={0} aria-valuemax={summary.items} aria-valuenow={summary.answered} aria-label={`${summary.answered} of ${summary.items} read`}>
            <span style={{ width: `${Math.round((share ?? 0) * 1000) / 10}%` }} />
          </span>
          <span title={summary.counts}>
            <b>{summary.answered.toLocaleString("en")}</b> of {summary.items.toLocaleString("en")} read · <b>{Math.max(0, summary.items - summary.answered).toLocaleString("en")}</b> left
            {summary.median !== null && ` · median ${summary.median} s`}
          </span>
        </>
      ) : (
        open !== null && (
          <span>
            <b>{open}</b> open
          </span>
        )
      )}
      <span className="on-this" title={`how long this ${noun} has been on the screen`}>
        {" "}
        · this one <b>{shownAt === null ? "–" : secondsWords(now - shownAt)}</b>
      </span>
    </span>
  );
}

function LeaseClock({ assignment }: { assignment: Parameters<typeof leaseLeft>[0] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  return <>{leaseWords(leaseLeft(assignment, now))}</>;
}

/** A panel's own view: the same as every panel's, or one of its own, kept. */
function PanelView({ mode, own, panel, onChoose }: { mode: ViewMode; own: boolean; panel: string; onChoose: (m: ViewMode) => void }) {
  return (
    <label className={own ? "panel-view own" : "panel-view"} title={`the view of the ${panel} alone (Shift and the view's key, over it)`}>
      <span className="sr-only">view of the {panel}</span>
      <select
        value={mode}
        onChange={(e) => {
          onChoose(e.target.value as ViewMode);
          // the keys are the page's again at once
          e.target.blur();
        }}
      >
        {READER_VIEWS.map((v) => (
          <option key={v.mode} value={v.mode}>
            {viewLabel(v.mode)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Every key, by what it does. */
function KeysOverlay({ groups, onClose }: { groups: { title: string; keys: [string, string][] }[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.showModal === "function" && !d.open) d.showModal();
    const close = () => onClose();
    d.addEventListener("close", close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" ) {
        e.preventDefault();
        onClose();
      }
    };
    d.addEventListener("keydown", onKey);
    return () => {
      d.removeEventListener("close", close);
      d.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <dialog ref={ref} className="keys-overlay" aria-label="keys" onClick={(e) => e.target === ref.current && onClose()}>
      <div className="keys-overlay-head">
        <h2>Keys</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="keys-overlay-groups">
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl className="facts keys">
              {g.keys.map(([k, d]) => (
                <div className="facts-pair" key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}

const secondsWords = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function SeatNote({ seat, campaign, onAgain, onMine }: { seat: Seat; campaign: Campaign; onAgain: () => void; onMine: () => void }) {
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
