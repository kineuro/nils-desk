// SPDX-License-Identifier: AGPL-3.0-only
// A label that says where it came from (UX round 2, 2026-11-06): one fact of
// a scan in the browser's footer, framed by its origin (none for the rules,
// the brand's frame for a decision, a value colour for a model, the caution
// frame where a decision in force was not sorted yet, with what was decided
// after the value). Hover says it in a line; a press opens the details:
// where it came from and when, the decision in force, a link to the campaign
// that made it or the model's run, and, where a decision was not sorted yet
// and the person may run a sort, the re-sort of the scan. Never a paragraph.

import { useEffect, useRef, useState } from "react";
import { messageOf } from "../settings/common";
import {
  decidedLine,
  decisionLink,
  fromLine,
  heldOrigins,
  keepOrigins,
  originsFor,
  originTone,
  runLink,
  sortedWords,
  staleLine,
  staleTail,
  targetKey,
  type AxisOrigin,
  type Origins,
  type Sorted,
  type Target,
} from "./origins";
import type { Fact } from "./tree";
import "./origins.css";

/** A target's origins, read once and kept; null while they are read, or where there is no target. */
export function useOrigins(t: Target | null): { origins: Origins | null; failed: string | null; keep: (o: Origins) => void } {
  const key = t ? targetKey(t) : null;
  const [state, setState] = useState<{ key: string | null; origins: Origins | null; failed: string | null }>(() => ({ key, origins: t ? heldOrigins(t) : null, failed: null }));
  useEffect(() => {
    if (!t) return;
    let live = true;
    const have = heldOrigins(t);
    setState({ key, origins: have, failed: null });
    if (have) return;
    originsFor(t).then(
      (origins) => live && setState({ key, origins, failed: null }),
      (e: unknown) => live && setState({ key, origins: null, failed: messageOf(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the target
  }, [key]);
  const mine = state.key === key;
  return {
    origins: mine ? state.origins : null,
    failed: mine ? state.failed : null,
    keep: (origins: Origins) => {
      if (!t) return;
      keepOrigins(t, origins);
      setState({ key, origins, failed: null });
    },
  };
}

/** The hover's lines: where it came from, and a decision not sorted yet. */
export function hoverOf(fact: Fact, a: AxisOrigin, sorted: Sorted | null): string {
  const lines = [`${fact.what}: ${fromLine(a, sorted)}`];
  const stale = staleLine(a);
  if (stale) lines.push(stale);
  return lines.join("\n");
}

/** A source field in words: series_description is "series description". */
const fieldWords = (s: string | undefined) => (s ?? "").replaceAll("_", " ").replace(/^text /, "");

export function OriginFact({
  fact,
  origin,
  sorted,
  resort,
}: {
  fact: Fact;
  origin: AxisOrigin | null;
  sorted: Sorted | null;
  /** Sorting the scan again, where the person may and a decision waits for it. */
  resort: (() => Promise<void>) | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);
  if (!origin) {
    return (
      <span className="dview-fact" title={fact.what}>
        {fact.value}
      </span>
    );
  }
  const tone = originTone(origin);
  const tail = staleTail(origin);
  const stale = staleLine(origin);
  const decided = decidedLine(origin);
  const link = decisionLink(origin);
  const run = runLink(origin);
  const when = origin.origin === "rules" ? sortedWords(sorted) : null;
  const matched = origin.rules[0]?.matched;
  const sort = () => {
    if (!resort) return;
    setBusy(true);
    setRefused(null);
    resort().then(
      () => {
        setBusy(false);
        setOpen(false);
      },
      (e: unknown) => {
        setBusy(false);
        setRefused(messageOf(e));
      },
    );
  };
  return (
    <span ref={box} className="origin-fact">
      <button type="button" className="dview-fact origin" data-tone={tone} aria-expanded={open} title={hoverOf(fact, origin, sorted)} onClick={() => setOpen((o) => !o)}>
        {fact.value}
        {tail && <span className="origin-tail">{tail}</span>}
      </button>
      {open && (
        <span className="origin-pop" role="dialog" aria-label={`Where ${fact.what.toLowerCase()} came from`} data-tone={tone}>
          <span className="origin-head">
            <b>{fact.what}</b> {fact.value}
          </span>
          <span className="origin-line">{fromLine(origin, sorted)}</span>
          {(when || matched) && (
            <span className="origin-line meta">
              {[when, matched ? `read “${matched}” in the ${fieldWords(origin.rules[0]?.source)}` : null].filter(Boolean).join(" · ")}
            </span>
          )}
          {stale && <span className="origin-line origin-stale">{stale}</span>}
          {decided && <span className="origin-line meta">{decided}</span>}
          {(link || run) && (
            <span className="origin-line">
              {link && <a href={link.href}>{link.label}</a>}
              {link && run && " · "}
              {run && <a href={run.href}>{run.label}</a>}
            </span>
          )}
          {stale && resort && (
            <span className="origin-line">
              <button type="button" className="button small" disabled={busy} onClick={sort}>
                {busy ? "Sorting…" : "Sort this scan again"}
              </button>
            </span>
          )}
          {refused && <span className="origin-line warn">Not sorted: {refused}</span>}
        </span>
      )}
    </span>
  );
}
