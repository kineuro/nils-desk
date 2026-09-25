// SPDX-License-Identifier: AGPL-3.0-only
// The reader's parts (record 48 R1): the suggestion filled in with the
// candidates where the two systems differ, the evidence one line per axis
// (the rest one key away), the pace counter, and the order toggle. Terse
// (record 27), theme tokens only, every act a key.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asked, AskedCandidate } from "../review/asked";
import { CandidateList } from "../review/CandidateList";
import type { ReviewItem } from "../ops/client";
import type { HeaderDoc } from "./client";
import { CANDIDATE_KEYS, headerLines, lineWords, paceWords, suggestionWords, type AxisLine, type HeaderLine, type Order, type Pace, type RaterStats as RaterStatsDoc, type Suggestion } from "./reader";

/** The suggestion as a line, and the legal candidates, each with its key, where the systems differ. */
export function SuggestionBar({ s, chosen, onChoose, busy }: { s: Suggestion; chosen: AskedCandidate | null; onChoose: (c: AskedCandidate) => void; busy: boolean }) {
  const agree = s.differ.length === 0;
  return (
    <div className={agree ? "suggest agree" : "suggest differ"} role="status" aria-live="polite">
      <p className="suggest-words">
        <span className={agree ? "tag ok" : "tag caution"}>{agree ? "agreed" : "differ"}</span> {suggestionWords(s)}
      </p>
      {!agree && s.offered.length > 0 && <CandidateList asked={askedOf(s)} chosen={chosen} keys={CANDIDATE_KEYS} onChoose={onChoose} onNone={null} busy={busy} bare />}
    </div>
  );
}

/** The candidate list's shape from a suggestion: its offered candidates, the differing axes marked. */
function askedOf(s: Suggestion): Asked {
  return {
    item: null as unknown as ReviewItem,
    stack: null,
    candidates: s.offered,
    dropped: 0,
    rules: {},
    model: null,
    axes: [...s.agreed, ...s.differ],
    certificate: null,
    agree: s.agreed,
    differ: s.differ,
  };
}

/** One line per axis: the value, then what decided it; `h` opens the rest. */
export function EvidenceLines({ lines, open, onToggle }: { lines: AxisLine[]; open: boolean; onToggle: () => void }) {
  if (lines.length === 0) return null;
  return (
    <div className="evidence-lines">
      <button type="button" className="evidence-toggle link-button" aria-expanded={open} onClick={onToggle}>
        <kbd>h</kbd>
        {open ? "less" : "how it was decided"}
      </button>
      <ul className="evidence">
        {lines.map((l) => {
          const w = lineWords(l);
          return (
            <li key={l.axis} className={l.agree === false ? "ev differ" : "ev"}>
              <span className="ev-axis">{l.axis}</span>
              <b className="ev-value">{w.value}</b>
              <span className="ev-why" title={w.why.join(" · ")}>
                {w.why.length > 0 ? w.why.join(" · ") : "no rule spoke"}
              </span>
              {open && <EvidenceMore l={l} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EvidenceMore({ l }: { l: AxisLine }) {
  return (
    <dl className="facts ev-more">
      {l.flags.length > 0 && (
        <div className="facts-pair">
          <dt>flags</dt>
          <dd>{l.flags.join(", ")}</dd>
        </div>
      )}
      {l.rule && (
        <div className="facts-pair">
          <dt>rule</dt>
          <dd>
            {l.rule_set ? `${l.rule_set}/` : ""}
            {l.rule}
            {l.clause ? ` · held: ${l.clause}` : ""}
          </dd>
        </div>
      )}
      {l.reads.length > 0 && (
        <div className="facts-pair">
          <dt>read</dt>
          <dd>
            {l.reads.map(([k, v]) => (
              <span key={k} className="ev-read">
                {k} <b>{v}</b>
              </span>
            ))}
          </dd>
        </div>
      )}
      {l.votes.length > 0 && (
        <div className="facts-pair">
          <dt>votes</dt>
          <dd>{l.votes.map((v) => `${v.rule} → ${v.value ?? "none"}`).join("; ")}</dd>
        </div>
      )}
      <div className="facts-pair">
        <dt>words</dt>
        <dd>{l.words === null ? "not at this detail" : l.words.length > 0 ? l.words.join(", ") : "none matched"}</dd>
      </div>
      {l.model && (
        <div className="facts-pair">
          <dt>System 1</dt>
          <dd>
            {l.model.value ?? "no value"}
            {l.model.p !== null ? ` · p ${l.model.p.toFixed(2)}` : ""}
            {l.model.weighed.length > 0 ? ` · weighed ${l.model.weighed.join(", ")}` : ""}
          </dd>
        </div>
      )}
      {l.confidence !== null && (
        <div className="facts-pair">
          <dt>confidence</dt>
          <dd>{l.confidence.toFixed(2)}</dd>
        </div>
      )}
    </dl>
  );
}

/** The session's pace: decisions and their median time. */
export function PaceCount({ pace }: { pace: Pace }) {
  return (
    <span className="pace meta" aria-label="your pace this session">
      {paceWords(pace)}
      {pace.suggested > 0 && ` · ${pace.changed} of ${pace.suggested} suggestions changed`}
    </span>
  );
}

/** The order the next claims take: by value (what the model is least sure of first) or by position. */
export function OrderToggle({ order, onOrder }: { order: Order; onOrder: (o: Order) => void }) {
  return (
    <span className="chips order-toggle" role="group" aria-label="order">
      {(["value", "position"] as const).map((o) => (
        <button key={o} type="button" className={order === o ? "opt on" : "opt"} aria-pressed={order === o} onClick={() => onOrder(o)} title={o === "value" ? "least sure and most telling first" : "the campaign's own order"}>
          by {o}
        </button>
      ))}
    </span>
  );
}

const secs = (v: number | null) => (v === null ? "none" : v < 10 ? v.toFixed(1) : String(Math.round(v)));

/**
 * The pace on the campaign page, as the engine counts it: decisions, the
 * median and ninetieth percentile seconds, the share of suggestions changed.
 * Blind as the answers are: a rater sees their own row alone, and no totals.
 */
export function RaterStats({ stats }: { stats: RaterStatsDoc }) {
  const pct = (v: number | null) => (v === null ? "none" : `${Math.round(v * 100)}%`);
  return (
    <>
      <h2>{stats.blind ? "Your pace" : "Pace"}</h2>
      <div className="table-wrap">
        <table className="thin rater-stats">
          <thead>
            <tr>
              {!stats.blind && <th>Rater</th>}
              <th className="num">Decisions</th>
              <th className="num">Median s</th>
              <th className="num">90% within s</th>
              <th className="num">Suggestions changed</th>
              <th className="num">In batches</th>
            </tr>
          </thead>
          <tbody>
            {stats.raters.map((r) => (
              <tr key={r.principal}>
                {!stats.blind && <td>{r.principal}</td>}
                <td className="num">{r.decisions.toLocaleString("en-US")}</td>
                <td className="num">{secs(r.median_seconds)}</td>
                <td className="num">{secs(r.p90_seconds)}</td>
                <td className="num">{pct(r.changed)}</td>
                <td className="num">{r.batched === null ? "none" : r.batched.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stats.blind && <p className="meta">The others' pace is theirs, as their answers are, until the campaign closes.</p>}
    </>
  );
}

/** A blind item's raw header values, all it shows beside its pictures: nothing of how it was classified. */
export function HeaderValues({ header }: { header: [string, string][] }) {
  if (header.length === 0) return null;
  return (
    <dl className="facts header-values" aria-label="header values">
      {header.map(([k, v]) => (
        <div key={k} className="facts-pair">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The file's own words beside the pictures (record 48, after the first real
 * read): the header's text fields a reader reads first, one per line, then
 * the physics, compact and in monospace. A long value is cut with an
 * ellipsis and whole on hover; `h` opens the whole header. Shown blind or
 * not: blind hides NILS's answers, never the file. Where the engine sends no
 * text or physics, the flat header values it sends stand in.
 */
export function HeaderBlock({ lines, flat = [], brief = false }: { lines: HeaderLine[]; flat?: [string, string][]; brief?: boolean }) {
  // brief beside a suggestion: the lines of the other fields give their room to the candidates, and stay one key away
  const kept = brief ? lines.filter((l) => l.label !== "more") : lines;
  const shown: HeaderLine[] = kept.length > 0 ? kept : flat.length > 0 ? [{ key: "flat", label: "header", value: flat.map(([k, v]) => `${k} ${v}`).join("  ") }] : [];
  if (shown.length === 0) return null;
  return (
    <div className="header-block" aria-label="the file's header">
      {shown.map((l) => (
        <div key={l.key} className="hb-line" title={`${l.label}: ${l.value}`}>
          <span className="hb-k">{l.label}</span>
          <span className="hb-v">{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/** The doors beside the header block: `h` the whole header where the engine serves it, `H` how each axis was decided where it was. */
export function HeaderDoors({ whole = false, evidence = false, onWhole, onEvidence }: { whole?: boolean; evidence?: boolean; onWhole?: () => void; onEvidence?: () => void }) {
  if (!whole && !evidence) return null;
  return (
    <span className="hb-doors">
      {whole && (
        <button type="button" className="link-button" onClick={onWhole}>
          <kbd>h</kbd>whole header
        </button>
      )}
      {evidence && (
        <button type="button" className="link-button" onClick={onEvidence}>
          <kbd>H</kbd>how it was decided
        </button>
      )}
    </span>
  );
}

/** The header block's lines from a reading: its text and physics where the engine sends them. */
export const headerLinesOf = (r: { texts?: Record<string, string>; physics?: Record<string, string | number | (string | number)[]> } | null) => (r ? headerLines(r.texts, r.physics) : []);

const fieldValue = (v: unknown) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.map(String).join("\\") : typeof v === "object" ? JSON.stringify(v) : String(v));

/**
 * The whole header one key away (record 48): a drawer over the reader with
 * a compact table of every stored field of one instance, direct identifiers
 * left out, filtered as one types; Escape or `h` closes it.
 */
export function HeaderDrawer({ doc, failed, onClose }: { doc: HeaderDoc | null; failed: string | null; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => input.current?.focus(), []);
  const rows = useMemo(() => {
    const t = typed.trim().toLowerCase();
    const all = doc?.fields ?? [];
    if (!t) return all;
    return all.filter((f) => [f.keyword, f.column, f.tag, fieldValue(f.value)].some((x) => typeof x === "string" && x.toLowerCase().includes(t)));
  }, [doc, typed]);
  const out = doc?.left_out ?? null;
  return (
    <div
      className="drawer header-drawer"
      role="dialog"
      aria-label="the whole header"
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "h" && e.target !== input.current)) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="drawer-head">
        <b>Whole header</b>
        {doc?.instance?.instance_number != null && <span className="meta">instance {doc.instance.instance_number}</span>}
        <span className="meta">{doc ? `${rows.length} of ${doc.fields.length} fields` : ""}</span>
        <span className="grow" />
        <button type="button" className="button quiet small" onClick={onClose}>
          Close <kbd>Esc</kbd>
        </button>
      </div>
      <span className="input mono drawer-find">
        <input ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="type to filter: a keyword, a tag or a value" aria-label="filter the header" />
      </span>
      {failed && <p className="warn">{failed}</p>}
      {!doc && !failed && <p className="meta">reading the header</p>}
      {doc && (
        <div className="drawer-body">
          <table className="thin header-table">
            <tbody>
              {rows.map((f, i) => (
                <tr key={`${f.tag ?? f.column ?? f.keyword ?? ""}-${i}`}>
                  <td className="ht-tag">{f.tag ?? ""}</td>
                  <td className="ht-key">{f.keyword ?? f.column ?? ""}</td>
                  <td className="ht-value" title={fieldValue(f.value)}>
                    {fieldValue(f.value)}
                  </td>
                  <td className="ht-level">{f.level ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {out && (out.identifying || out.removed) ? (
        <p className="meta">
          Left out: {out.identifying ?? 0} identifying, {out.removed ?? 0} removed.
        </p>
      ) : null}
    </div>
  );
}

/** The evidence in a drawer over the reader (record 48, one screen): one line per axis and the rest, `H` or Escape closes it. */
export function EvidenceDrawer({ lines, onClose }: { lines: AxisLine[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => box.current?.focus(), []);
  return (
    <div
      ref={box}
      tabIndex={-1}
      className="drawer evidence-drawer"
      role="dialog"
      aria-label="how it was decided"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "H") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="drawer-head">
        <b>How it was decided</b>
        <span className="grow" />
        <button type="button" className="button quiet small" onClick={onClose}>
          Close <kbd>Esc</kbd>
        </button>
      </div>
      <div className="drawer-body">
        <EvidenceLines lines={lines} open onToggle={onClose} />
      </div>
    </div>
  );
}

/** The derived axes in one line, live as the answer changes (record 48): the rater's answer carried through the pack. */
export function DerivedLine({ words }: { words: string | null }) {
  return (
    <p className="meta derived-line" role="status" aria-live="polite" title={words ?? undefined}>
      {words ?? "derived: …"}
    </p>
  );
}
