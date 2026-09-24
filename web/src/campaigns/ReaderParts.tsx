// SPDX-License-Identifier: AGPL-3.0-only
// The reader's parts (record 48 R1): the suggestion filled in with the
// candidates where the two systems differ, the evidence one line per axis
// (the rest one key away), the pace counter, and the order toggle. Terse
// (record 27), theme tokens only, every act a key.

import type { Asked, AskedCandidate } from "../review/asked";
import { CandidateList } from "../review/CandidateList";
import type { ReviewItem } from "../ops/client";
import { CANDIDATE_KEYS, lineWords, paceWords, suggestionWords, type AxisLine, type Order, type Pace, type RaterStats as RaterStatsDoc, type Suggestion } from "./reader";

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
