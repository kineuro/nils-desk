// SPDX-License-Identifier: AGPL-3.0-only
// The check reader (job type 3, record 55 H3; the build spec of 2026-10-11,
// sections 9.3 and 10, slice D2): the comparison reader with a third spec,
// so the bands, the kept view, the warm-up, the corrections (`b`, `m`) and
// the keys overlay (`?`) are the ones raters know. An item is one result:
// its mask over the scan it was made on and the visit's other main scans,
// each panel at its own resolution, framed in the brand line for the
// made-on one, linked through one point in the patient (`l`). Its parts are
// listed beside the panels; `n` and `p` bring each into view on every
// panel, `r` the whole result again. One key answers: 1 accepts, 2 rejects,
// 3 to 9 a reason, on the part in focus or on the whole result; a reason
// that needs a point waits for a click on a picture (Escape calls it off),
// one that needs a note opens it (`e`). Backspace takes the last mark back.
// Enter sends, the verdict shown on its key before it is pressed; with
// auto-advance (on for checks) 1 and 2 send at once at result grain, and
// every key at part grain. The mask's own keys are the viewer's (`o`, `f`,
// `[`, `]`, maskLook.ts). The parts a rater had in focus half a second are
// sent as seen; a scan shown with "+ scan" is sent as shown.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import type { Vec3 } from "../viewer/geometry";
import type { LayerRef } from "../viewer/layer";
import { DEFAULT_LOOK, useMaskKeys, withOpacity, type MaskLook, type Tone } from "../viewer/maskLook";
import type { Ahead } from "./ahead";
import {
  accept,
  answerKeys,
  buildAnswer,
  checkDoors,
  checkItemWords,
  checkKey,
  checkProgress,
  clearLast,
  flag,
  gridOf,
  marksOf,
  mlWords,
  NO_MARKS,
  partAt,
  partOrder,
  partWord,
  placePoint,
  pointOnSlice,
  reasonsIn,
  reject,
  sawPart,
  stepPart,
  SEEN_MS,
  stripWords,
  verdictLine,
  verdictOf,
  VERDICT_WORDS,
  VERDICTS,
  type CheckSheet,
  type Marks,
  type Verdict,
} from "./check";
import { campaigns } from "./client";
import { READER_VIEWS } from "./compare";
import { CompareReader, type Built, type ComparePanel, type CompareSheet, type CompareSpec, type ItemCtx, type ItemPage } from "./CompareReader";
import { slotOf } from "./values";

/** The panels' keys, in a fixed order: a check shows at most eight. */
export const CHECK_PANEL_KEYS = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"] as const;

/** The sheets read ahead, by campaign and item: each is taken once, so a sheet read again (an answer opened with `b`) is the engine's now. */
const ahead = new Map<string, Promise<CheckSheet>>();

/** Forget the sheets read ahead (a test, or a page that knows the answers changed). */
export function forgetCheckSheets(): void {
  ahead.clear();
}

function sheetOf(c: string, item: number): Promise<CheckSheet> {
  const key = `${c}/${item}`;
  const have = ahead.get(key);
  if (have) {
    ahead.delete(key);
    return have.catch(() => checkDoors.sheet(c, item));
  }
  return checkDoors.sheet(c, item);
}

/** The panels of a sheet as the comparison reader lays them out: what each shows, the made-on one framed and leading. */
export function comparePanels(s: CheckSheet): ComparePanel[] {
  return s.panels.slice(0, CHECK_PANEL_KEYS.length).map((p, i) => ({
    key: CHECK_PANEL_KEYS[i],
    stack: p.stack,
    label: p.shows || (p.madeOn ? "made on" : "scan"),
    lead: p.madeOn,
    tone: p.madeOn ? "is-made-on" : undefined,
    hint: p.link === "world" ? "aligned by the scanner's position" : undefined,
  }));
}

/** The layers of the items ahead: each item's result on each of its panels, read from its item door (the claim names only the stacks). */
export async function checkAhead(c: string, list: Ahead[], n = 3): Promise<Ahead[]> {
  const out: Ahead[] = [];
  for (const [i, a] of list.entries()) {
    if (i >= n || a.item === null || a.layers) {
      out.push(a);
      continue;
    }
    const key = `${c}/${a.item}`;
    let p = ahead.get(key);
    if (!p) {
      p = checkDoors.sheet(c, a.item);
      ahead.set(key, p);
      p.catch(() => ahead.get(key) === p && ahead.delete(key));
    }
    try {
      const s = await p;
      const layer: LayerRef = { derivative: s.result.id, set: s.set.key };
      out.push({ ...a, layers: Object.fromEntries(s.panels.map((x) => [x.stack, layer])) });
    } catch {
      out.push(a);
    }
  }
  return out;
}

const VERDICT_HELP: Record<Verdict, string> = { accepted: "the result is right", rejected: "the whole result is unusable", flagged: "a part, a point or the result has a reason" };

function checkSpec(role: "rater" | "adjudicator"): CompareSpec<Verdict> {
  return {
    kind: "check",
    title: role === "adjudicator" ? "Settle checks" : "Check results",
    noun: "result",
    words: checkItemWords,
    answers: VERDICTS,
    answerWords: VERDICT_WORDS,
    answerHelp: VERDICT_HELP,
    panelKeys: CHECK_PANEL_KEYS,
    panelWord: (k) => `panel ${Number(k.slice(1)) + 1}`,
    sheet: (c, item) => sheetOf(c, item).then((s): CompareSheet => ({ item: s.item, panels: comparePanels(s), extra: s })),
    // the reader's own: their answers against the items given to them, their own pace and verdicts
    summary: (c, me) =>
      Promise.all([checkDoors.stats(c, me, true), campaigns.one(c)]).then(([s, campaign]) => ({ ...checkProgress(campaign, me, role), median: s.median, counts: verdictLine(s.verdicts), verb: role === "adjudicator" ? "settled" : "read" })),
    says: () => null,
    difference: false,
    useItem: useCheckItem,
    slices: false,
    window: false,
    jumps: false,
    auto: true,
    grid: gridOf,
    placeholders: 3,
    ahead: checkAhead,
    role,
  };
}

export const CHECK_SPEC = checkSpec("rater");
export const CHECK_ADJUDICATE_SPEC = checkSpec("adjudicator");

export function CheckReader({ caps, id, query, role = "rater" }: { caps: Capabilities; id: string; query?: Record<string, string>; role?: "rater" | "adjudicator" }) {
  return <CompareReader caps={caps} id={id} query={query} spec={role === "adjudicator" ? CHECK_ADJUDICATE_SPEC : CHECK_SPEC} />;
}

/** What the reader keeps of the item on the screen: the marks, the part in focus, the linked point, a point being placed, the note open. */
interface ItemState {
  key: string | null;
  marks: Marks;
  focus: number | null;
  point: Vec3 | null;
  placing: string | null;
  noteOpen: boolean;
}

/** An item's state as it opens: no marks, or one's own answer opened again; at part grain on its own part. */
function startOf(key: string | null, cs: CheckSheet | null, amending: boolean): ItemState {
  const marks = amending && cs ? marksOf(cs.mine) : NO_MARKS;
  const part = cs?.set.grain === "part" ? cs.part : null;
  return { key, marks, focus: part?.label ?? null, point: part?.anchor ?? null, placing: null, noteOpen: marks.note !== "" };
}

/** The look of the mask, kept for every item in this browser. */
const LOOK_KEY = "nils.check.look";
function lookKept(): MaskLook {
  try {
    const o = JSON.parse(localStorage.getItem(LOOK_KEY) ?? "null") as Partial<MaskLook> | null;
    if (!o || typeof o !== "object") return DEFAULT_LOOK;
    return { shown: true, fill: o.fill !== false, outline: o.outline !== false, opacity: typeof o.opacity === "number" && o.opacity >= 0 && o.opacity <= 1 ? Math.round(o.opacity * 10) / 10 : DEFAULT_LOOK.opacity };
  } catch {
    return DEFAULT_LOOK;
  }
}

/**
 * The check's part of the reader: the marks the keys make, the part in
 * focus, the linked point, the mask's look, and what each panel draws.
 */
export function useCheckItem(ctx: ItemCtx<Verdict>): ItemPage<Verdict> {
  const cs = (ctx.sheet?.extra as CheckSheet | undefined) ?? null;
  const shownKey = ctx.shownKey;
  // the item's own state, named by the item on the screen: a new item (or an answer opened again) starts from
  // its own marks in the very render that shows it, so no key pressed at once meets the last item's
  const [kept, setKept] = useState<ItemState>(() => startOf(null, null, false));
  const now = useRef({ key: shownKey, cs, amending: ctx.amending });
  now.current = { key: shownKey, cs, amending: ctx.amending };
  const st = kept.key === shownKey ? kept : startOf(shownKey, cs, ctx.amending);
  const update = useCallback((f: (s: ItemState) => ItemState) => {
    setKept((prev) => {
      const n = now.current;
      return f(prev.key === n.key ? prev : startOf(n.key, n.cs, n.amending));
    });
  }, []);
  const { marks, focus, point, placing, noteOpen } = st;
  const setMarks = useCallback((f: Marks | ((m: Marks) => Marks)) => update((s) => ({ ...s, marks: typeof f === "function" ? f(s.marks) : f })), [update]);
  const setFocus = useCallback((focus: number | null) => update((s) => ({ ...s, focus })), [update]);
  const setPoint = useCallback((f: Vec3 | null | ((p: Vec3 | null) => Vec3 | null)) => update((s) => ({ ...s, point: typeof f === "function" ? f(s.point) : f })), [update]);
  const setPlacing = useCallback((placing: string | null) => update((s) => ({ ...s, placing })), [update]);
  const setNoteOpen = useCallback((noteOpen: boolean) => update((s) => ({ ...s, noteOpen })), [update]);
  const [look, setLookState] = useState<MaskLook>(lookKept);
  const [order, setOrder] = useState<"position" | "size">("position");
  const note = useRef<HTMLInputElement | null>(null);
  const setLook = useCallback((f: (l: MaskLook) => MaskLook) => {
    setLookState((l) => {
      const next = f(l);
      try {
        localStorage.setItem(LOOK_KEY, JSON.stringify({ fill: next.fill, outline: next.outline, opacity: next.opacity }));
      } catch {
        // a private window keeps nothing; the page works the same
      }
      return next;
    });
  }, []);
  useMaskKeys(setLook, !!cs);

  const grain = cs?.set.grain ?? "result";
  const own = grain === "part" ? (cs?.part?.label ?? null) : null;
  const reasons = cs?.reasons ?? [];
  const word = partWord(cs?.set.kind ?? "components");

  // a part in focus half a second is seen
  useEffect(() => {
    if (focus === null || !shownKey) return;
    const t = setTimeout(() => setMarks((m) => sawPart(m, focus)), SEEN_MS);
    return () => clearTimeout(t);
  }, [focus, shownKey]);

  const parts = cs?.parts ?? [];
  const byLabel = useMemo(() => new Map(parts.map((p) => [p.label, p])), [parts]);
  const ordered = useMemo(() => partOrder(parts, order), [parts, order]);
  const focusPart = focus !== null ? (byLabel.get(focus) ?? (cs?.part?.label === focus ? cs.part : null)) : null;

  const open = useCallback(
    (label: number | null) => {
      setFocus(label);
      const p = label !== null ? byLabel.get(label) : null;
      if (p) setPoint(p.anchor);
    },
    [byLabel],
  );

  const build = useCallback((m: Marks): Built<Verdict> => {
    if (!cs) return { ok: false, needs: "The result is being read." };
    const b = buildAnswer(m, { reasons, grain, part: own });
    if (!b.ok) return b;
    const v = b.value;
    const nParts = (b.body.form as { parts: unknown[] }).parts.length;
    const nPoints = (b.body.form as { points: unknown[] }).points.length;
    const words = v === "flagged" && (nParts > 0 || nPoints > 0) ? `flagged · ${[nParts ? `${nParts} ${nParts === 1 ? word : `${word}s`}` : "", nPoints ? `${nPoints} ${nPoints === 1 ? "point" : "points"}` : ""].filter(Boolean).join(", ")}` : b.words;
    return { ok: true, value: v, body: b.body, words };
  }, [cs, reasons, grain, own, word]);

  const sendNow = (m: Marks) => {
    const raw = buildAnswer(m, { reasons, grain, part: own });
    if (!raw.ok && raw.note) {
      setNoteOpen(true);
      setTimeout(() => note.current?.focus(), 0);
    }
    ctx.send(build(m));
  };

  /** An answer's key, 1 to 9. */
  const answer = (index: number) => {
    if (!cs || !ctx.fresh || ctx.busy) return;
    setPlacing(null);
    if (index === 0) {
      const had = marks.parts.length + marks.points.length + marks.reasons.length;
      const next = accept(marks);
      setMarks(next);
      if (had > 0) ctx.refuse(`${had} ${had === 1 ? "mark" : "marks"} cleared: Enter accepts.`);
      else if (ctx.auto) sendNow(next);
      return;
    }
    if (index === 1) {
      const next = reject(marks);
      setMarks(next);
      if (ctx.auto) sendNow(next);
      return;
    }
    const r = reasons[index - 2];
    if (!r) return;
    if (r.needs === "point") {
      setPlacing(r.id);
      return;
    }
    const next = flag(marks, r.id, grain === "part" ? own : focus);
    setMarks(next);
    if (r.needs === "note" && !next.note.trim()) {
      setNoteOpen(true);
      setTimeout(() => note.current?.focus(), 0);
      return;
    }
    if (ctx.auto && grain === "part" && verdictOf(next) !== null) sendNow(next);
  };

  /** A click on a picture: a point being placed, else the part under it opened, else the linked point there. */
  const clicked = useCallback(
    (mm: Vec3) => {
      if (!cs) return;
      if (placing) {
        const next = placePoint(marks, placing, mm);
        setMarks(next);
        setPlacing(null);
        setPoint(mm);
        if (ctx.auto && grain === "part") {
          const b = build(next);
          if (b.ok) ctx.send(b);
        }
        return;
      }
      const hit = cs.set.kind !== "whole" && grain === "result" ? partAt(parts, mm) : null;
      if (hit) open(hit.label);
      else setPoint(mm);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cs, placing, marks, grain, parts, open, ctx.auto, build],
  );

  const key = (e: KeyboardEvent, inField: boolean): boolean => {
    if (!cs) return false;
    const act = checkKey(e.key, { inField, modifier: e.altKey || e.metaKey || e.ctrlKey, placing: placing !== null });
    if (!act) return false;
    if (act.kind === "cancel") setPlacing(null);
    else if (act.kind === "next" || act.kind === "previous") {
      if (grain === "part") open(own);
      else open(stepPart(ordered, focus, act.kind === "next" ? 1 : -1));
    } else if (act.kind === "whole") setFocus(null);
    else if (act.kind === "clear") {
      if (placing) setPlacing(null);
      else setMarks((m) => clearLast(m, grain === "part" ? own : focus));
      ctx.refuse(null);
    } else if (act.kind === "note") {
      setNoteOpen(true);
      setTimeout(() => note.current?.focus(), 0);
    }
    return true;
  };

  // the mask on every panel: the result's layer on that scan, each part's tone
  const tones = useMemo(() => {
    const t = new Map<number, Tone>();
    if (!cs) return t;
    if (grain === "part") for (const p of parts) t.set(p.label, "dim");
    for (const p of marks.parts) t.set(p.label, "flagged");
    if (focus !== null) t.set(focus, "focus");
    return t;
  }, [cs, grain, parts, marks.parts, focus]);
  const max = useMemo(() => parts.reduce((a, p) => Math.max(a, p.label), cs?.set.count ?? 0), [parts, cs?.set.count]);
  const labels = useMemo(() => (cs?.set.kind === "labels" ? parts.map((p) => p.label).sort((a, b) => a - b) : undefined), [parts, cs?.set.kind]);
  const layer = useMemo<LayerRef | null>(() => (cs ? { derivative: cs.result.id, set: cs.set.key } : null), [cs]);
  const focusProp = useMemo(() => (focusPart && shownKey ? { anchor: focusPart.anchor, box: focusPart.box, key: `${shownKey}:${focusPart.label}` } : null), [focusPart, shownKey]);
  const onSlice = useMemo(() => {
    const out: Record<string, (z: number) => void> = {};
    for (const k of CHECK_PANEL_KEYS)
      out[k] = (z: number) => {
        const m = ctx.manifests[k];
        if (m) setPoint((p) => pointOnSlice(m, p, z));
      };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.manifests]);

  // the scans shown for this item alone ("+ scan"), after the frozen panels
  const shownStacks = marks.shown;
  const panels = (base: ComparePanel[]): ComparePanel[] => {
    if (!cs || shownStacks.length === 0) return base;
    const extra = shownStacks.slice(0, Math.max(0, CHECK_PANEL_KEYS.length - base.length)).map((stack, i) => ({
      key: CHECK_PANEL_KEYS[base.length + i],
      stack,
      label: cs.more.find((m) => m.stack === stack)?.shows || "scan",
      lead: false,
      tone: "is-added",
      hint: "shown for this result alone; aligned by the scanner's position",
    }));
    return [...base, ...extra];
  };
  const addScan = (stack: number) => {
    setMarks((m) => (m.shown.includes(stack) ? m : { ...m, shown: [...m.shown, stack] }));
  };

  if (!cs) return { answerCount: 2 + reasons.length, key: () => false };

  const verdict = verdictOf(marks);
  const keysList = answerKeys(reasons, grain, word);
  const reasonIds = reasons.map((r) => r.id);
  const onPart = grain === "part" ? own : focus;
  const partReason = onPart !== null ? (marks.parts.find((p) => p.label === onPart)?.reason ?? null) : null;
  const isOn = (id: string) => (id === "accepted" ? marks.chosen === "accepted" && verdict === "accepted" : id === "rejected" ? verdict === "rejected" : placing === id || (onPart !== null ? partReason === id : marks.reasons.includes(id)));
  const panelCount = cs.panels.length + shownStacks.length;
  const moreLeft = cs.more.filter((m) => !shownStacks.includes(m.stack) && !cs.panels.some((p) => p.stack === m.stack));
  const seen = new Set(marks.seen);
  const flagged = new Map(marks.parts.map((p) => [p.label, p.reason]));
  const reasonWords = (id: string) => reasons.find((r) => r.id === id)?.words ?? id;

  const strip = (
    <span className="check-strip" aria-live="polite">
      <b className="check-part">{stripWords(cs, focusPart)}</b>
      {placing && (
        <span className="tag caution check-placing">
          {reasonWords(placing)}: click it on a picture <kbd>Esc</kbd>
        </span>
      )}
      {cs.answers.length > 0 && (
        <span className="meta check-voters" title="the raters' answers, by letter">
          {cs.answers.map((a) => `${a.as} ${a.value}`).join(" · ")}
        </span>
      )}
    </span>
  );

  const side =
    cs.set.kind === "whole" ? undefined : (
      <aside className="check-parts" aria-label={`the ${word}s`}>
        <div className="check-parts-head">
          <span>
            <b>{cs.set.count.toLocaleString("en-US")}</b> {cs.set.count === 1 ? word : `${word}s`}
          </span>
          <button type="button" className="link-button check-order" onClick={() => setOrder((o) => (o === "position" ? "size" : "position"))} title="the order n and p step through">
            {order === "position" ? "bottom up" : "largest first"}
          </button>
        </div>
        <ol className="check-part-list">
          {ordered.map((label, i) => {
            const p = byLabel.get(label)!;
            const r = flagged.get(label);
            const votes = cs.answers.filter((a) => a.form.parts.some((x) => x.label === label));
            // a structure by its whole name, wrapped, so two of one side read apart
            const named = cs.set.kind === "labels" && !!p.name;
            return (
              <li key={label}>
                <button type="button" className={["check-part-row", named ? "named" : "", focus === label ? "on" : "", grain === "part" && label !== own ? "context" : ""].filter(Boolean).join(" ")} aria-pressed={focus === label} onClick={() => open(label)} title={p.name ?? undefined}>
                  <span className={seen.has(label) || focus === label ? "check-n" : "check-n unseen"}>{named ? p.name : i + 1}</span>
                  <span className="check-ml">{mlWords(p.volumeMm3)}</span>
                  {r && (
                    // one tag per reason, each in its own colour: a part's reason may be several, joined
                    <span className="check-flags">
                      {reasonsIn(r).map((x) => (
                        <span key={x} className="value-tag check-flag" data-slot={slotOf(reasonIds, x) ?? undefined}>
                          {reasonWords(x)}
                        </span>
                      ))}
                    </span>
                  )}
                  {votes.map((a) => (
                    <span key={a.as} className="tag check-vote" title={`${a.as}: ${a.form.parts.filter((x) => x.label === label).flatMap((x) => reasonsIn(x.reason)).map(reasonWords).join(", ")}`}>
                      {a.as}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ol>
        {marks.points.length > 0 && (
          <ol className="check-points">
            {marks.points.map((pt, i) => (
              <li key={i}>
                <button type="button" className="check-part-row" onClick={() => setPoint(pt.mm)}>
                  <span className="check-n">+{i + 1}</span>
                  <span className="value-tag check-flag" data-slot={slotOf(reasonIds, pt.reason) ?? undefined}>
                    {reasonWords(pt.reason)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {cs.partsDoor && <p className="meta">The first {parts.length.toLocaleString("en-US")} listed.</p>}
      </aside>
    );

  const tools = (
    <>
      <span className="compare-group check-mask" role="group" aria-label="the mask">
        <button type="button" className={look.shown ? "tool on" : "tool"} aria-pressed={look.shown} onClick={() => setLook((l) => ({ ...l, shown: !l.shown }))} title="the mask on and off; held down, hidden until let go (o)">
          <span className="tool-label">Mask</span>
          <kbd>o</kbd>
        </button>
        <button type="button" className={look.fill ? "tool on" : "tool"} aria-pressed={look.fill} onClick={() => setLook((l) => (l.fill && !l.outline ? l : { ...l, fill: !l.fill }))} title="fill, outline, both (f)">
          <span className="tool-label">Fill</span>
        </button>
        <button type="button" className={look.outline ? "tool on" : "tool"} aria-pressed={look.outline} onClick={() => setLook((l) => (l.outline && !l.fill ? l : { ...l, outline: !l.outline }))} title="fill, outline, both (f)">
          <span className="tool-label">Outline</span>
          <kbd>f</kbd>
        </button>
        <label className="tool check-opacity" title="the fill's opacity ([ and ])">
          <span className="sr-only">the fill&apos;s opacity</span>
          <input type="range" min={0} max={1} step={0.1} value={look.opacity} onChange={(e) => setLook((l) => withOpacity(l, Number(e.target.value) - l.opacity))} onKeyUp={(e) => (e.target as HTMLInputElement).blur()} />
          <kbd>[ ]</kbd>
        </label>
      </span>
      <span className="compare-group check-link">
        <button type="button" className={ctx.linked ? "tool on" : "tool"} aria-pressed={ctx.linked} onClick={() => ctx.setLinked((x) => !x)} title="one point in the patient for every panel: a click, or a part brought into view (l)">
          <span className="tool-label">Linked</span>
          <kbd>l</kbd>
        </button>
        <label className="tool check-add" title={moreLeft.length === 0 ? "no other scan of this visit in the same frame" : "another scan of this visit, for this result alone"}>
          <span className="sr-only">another scan</span>
          <select
            value=""
            disabled={moreLeft.length === 0 || panelCount >= CHECK_PANEL_KEYS.length}
            onChange={(e) => {
              if (e.target.value) addScan(Number(e.target.value));
              // the keys are the page's again at once
              e.target.blur();
            }}
          >
            <option value="">+ scan</option>
            {moreLeft.map((m) => (
              <option key={m.stack} value={m.stack}>
                {m.shows || "scan"}
              </option>
            ))}
          </select>
        </label>
      </span>
    </>
  );

  const answers = (
    <div className="pair-answers compare-answers check-answers" role="group" aria-label="the answer" style={{ "--answers": keysList.length } as React.CSSProperties}>
      {keysList.map((k, i) => {
        const on = isOn(k.id);
        const slot = i >= 2 && on ? slotOf(reasonIds, k.id) : null;
        return (
          <button
            key={k.id}
            type="button"
            className={["opt", "pair-answer", i >= 2 ? "check-reason" : "check-verdict", on ? "on" : "", slot ? "value-tag" : ""].filter(Boolean).join(" ")}
            data-slot={slot ?? undefined}
            aria-pressed={on}
            disabled={ctx.busy || !ctx.fresh}
            onClick={() => (ctx.refuse(null), answer(i))}
            title={i === 0 ? "the result is right" : i === 1 ? (grain === "part" ? `not a ${word}` : "the whole result is unusable: failed, empty, in the wrong place") : `${k.words}${k.needs === "point" ? ": then click it on a picture" : k.needs === "note" ? ": with a note" : ""}, on the ${word} in focus or the whole result`}
          >
            <kbd>{k.key}</kbd>
            <span className="answer-words">{k.words}</span>
            {k.needs !== "none" && <span className="check-needs">{k.needs}</span>}
          </button>
        );
      })}
      {(noteOpen || marks.note) && (
        <label className="check-note">
          <span className="sr-only">the note</span>
          <input
            ref={note}
            value={marks.note}
            maxLength={2000}
            placeholder="note"
            onChange={(e) => setMarks((m) => ({ ...m, note: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLInputElement).blur();
                sendNow(marks);
              } else if (e.key === "Escape") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
      )}
    </div>
  );

  const groups: { title: string; keys: [string, string][] }[] = [
    {
      title: "Answer",
      keys: [
        ...keysList.map((k) => [k.key, k.key === "1" ? (grain === "part" ? `a good ${word}` : "accept the result") : k.key === "2" ? (grain === "part" ? `not a ${word}` : "reject the whole result: unusable") : `${k.words}${k.needs === "point" ? ", then a click on a picture" : k.needs === "note" ? ", with a note" : ""}`] as [string, string]),
        ["Enter", "send, then the next result; on an answer opened again, correct it"],
        ["u", "send on 1 and 2 (every key at part grain), with no Enter (on or off)"],
        ["s", "give the result back, then the next"],
        ["b", "open your last answer again to correct it; again, the one before"],
        ["m", "your answers, by result"],
      ],
    },
    {
      title: "Parts",
      keys: [
        ["n p", `the next and previous ${word}, zoomed on every panel`],
        ["r", "the whole result again, zoom reset"],
        ["Backspace", `clear the ${word}'s reason, or the last point`],
        ["e", "the note"],
        ["Esc", "call off a point being placed"],
        ["click", `a ${word} opens it; elsewhere, every panel to that point`],
      ],
    },
    {
      title: "Mask",
      keys: [
        ["o", "the mask on and off; held down, hidden until let go"],
        ["f", "fill, outline, both"],
        ["[ ]", "the fill's opacity down and up by a tenth"],
        ["l", "every panel through one point, on and off"],
      ],
    },
    {
      title: "View",
      keys: [...READER_VIEWS.map((v) => [v.key, v.title] as [string, string]), ["v", "the next view"], ["Shift + key", "that view for the panel under the pointer alone"], ["Space", "in three planes: enlarge the plane under the pointer, and back"]],
    },
    {
      title: "Pictures",
      keys: [
        ["↑ ↓", "page the picture under the pointer a plane; Page Up and Down ten"],
        ["wheel", "page; linked, the others follow"],
        ["left drag", "window and level"],
        ["right drag, middle drag", "zoom, pan"],
      ],
    },
  ];

  return {
    panels,
    view: (p) => ({
      mask: layer ? { layer, look, tones, max, labels } : null,
      point: ctx.linked ? point : null,
      onPoint: clicked,
      focus: focusProp,
      onSlice: ctx.linked ? onSlice[p.key] : undefined,
    }),
    strip,
    side,
    tools,
    answers,
    answerCount: keysList.length,
    key,
    answer,
    build: () => build(marks),
    sendWords: `${ctx.amending ? "Correct" : "Send"}${verdict ? ` · ${VERDICT_WORDS[verdict]}` : ""}`,
    keyGroups: groups,
  };
}
