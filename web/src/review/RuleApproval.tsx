// SPDX-License-Identifier: AGPL-3.0-only
// A proposed rule change on the one approval card (record 56, sections 5.3,
// 5.6, 6.4 and 6.5), the same on the Rules page and in the one chat: its
// kind and state, its title, its effect in a line ("Moves 47 scans · base
// T2w → FLAIR, 47 · fixes 47, breaks 0"), where it lands, and any answer it
// breaks with its scans, in the caution colour, before any button. Adopt is
// one press; then one line follows its re-sort until it ends, and says what
// it did. A proposal rehearsed on another version of the pack is rehearsed
// again first. Details opens its stored effect report. No card names who
// made it.

import { useEffect, useState } from "react";
import "../assistant/assistant.css";
import type { Capabilities } from "../capabilities";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { refusalWords, type PackDoc } from "./client";
import { BreaksBox, EffectReport } from "./EffectReport";
import { appliedWords, axisCounts, cardLine, landsWords, resorting, stateTag, type Proposal } from "./proposals";
import { opWords } from "./ruleOps";
import { door as served } from "../deployment";
import { DOORS, mayDecide, mayRehearse, rulesDoors } from "./rulesDoors";

const n = (v: number) => v.toLocaleString("en-US");

/** How often a re-sort is asked after, ms; a test asks sooner. */
export const FOLLOW = { ms: 2000 };

export interface RuleApprovalProps {
  caps: Capabilities;
  /** The pack for the values' colours; a card in the chat draws them plain. */
  pack: PackDoc | null;
  proposal: Proposal;
  /** Opened alone, its report shown. */
  open?: boolean;
  /** A decision or a new rehearsal, said in words for the page. */
  onChanged?: (p: Proposal, words: string) => void;
  /** Change it: what the host does with a proposal to change (the form on the Rules page, the person's words in the chat). */
  onChange?: (p: Proposal) => void;
  /** Which proposals the host changes: one of a single operation, which the form holds, or any, as the chat's words do. */
  changes?: "one" | "any";
  onOpen?: (stack: number) => void;
}

export function RuleApproval({ caps, pack, proposal, open = false, onChanged, onChange, changes = "one", onOpen }: RuleApprovalProps) {
  const [p, setP] = useState<Proposal>(proposal);
  const [details, setDetails] = useState(open);
  const [full, setFull] = useState<Proposal | null>(proposal.report ? proposal : null);
  const [busy, setBusy] = useState<{ phase: string; since: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [because, setBecause] = useState("");
  const packName = p.pack || pack?.pack || caps.engine?.packs[0]?.name || "";
  useEffect(() => setP(proposal), [proposal]);

  // the stored report, read once its details are opened
  useEffect(() => {
    if (!details || full || !packName) return;
    let alive = true;
    rulesDoors.proposal(packName, p.id).then(
      (f) => alive && setFull(f),
      (e: unknown) => alive && setWhy(refusalWords(e)),
    );
    return () => {
      alive = false;
    };
  }, [details, full, packName, p.id]);

  // an adopted proposal's re-sort, followed on the proposal itself until it ends
  const following = resorting(p);
  useEffect(() => {
    if (!following || !packName) return;
    let alive = true;
    const t = setTimeout(() => {
      rulesDoors.proposal(packName, p.id).then(
        (next) => {
          if (!alive) return;
          setP(next);
          if (!resorting(next)) onChanged?.(next, appliedWords(next) ?? `Adopted ${next.title}.`);
        },
        () => alive && setP((was) => ({ ...was })),
      );
    }, FOLLOW.ms);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [following, p, packName]); // eslint-disable-line react-hooks/exhaustive-deps

  const adopt = () => {
    setBusy({ phase: "adopting", since: Date.now() });
    setWhy(null);
    rulesDoors
      .decide(packName, p.id, "adopt")
      .then((r) => {
        const job = typeof r.job === "number" ? { id: r.job, state: "queued" } : r.job && typeof r.job === "object" ? { id: r.job.id, state: r.job.state ?? "queued" } : null;
        // the moment it was adopted, which the line following its re-sort counts from until the engine's own is read
        const next: Proposal = { ...p, status: "adopted", decided_at: new Date().toISOString(), job, applied: { state: job?.state ?? "queued", expected: null, measured: null } };
        setP(next);
        onChanged?.(next, `Adopted ${p.title || `change ${p.id}`}; re-sorting.`);
      })
      .catch((e: unknown) => setWhy(refusalWords(e)))
      .finally(() => setBusy(null));
  };
  const reject = () => {
    setBusy({ phase: "rejecting", since: Date.now() });
    setWhy(null);
    rulesDoors
      .decide(packName, p.id, "reject", because.trim() || undefined)
      .then(() => {
        const next: Proposal = { ...p, status: "rejected", why: because.trim() || null };
        setP(next);
        setRejecting(false);
        onChanged?.(next, `${p.title || `Change ${p.id}`} is not adopted.`);
      })
      .catch((e: unknown) => setWhy(refusalWords(e)))
      .finally(() => setBusy(null));
  };
  const again = () => {
    setBusy({ phase: "rehearsing it again", since: Date.now() });
    setWhy(null);
    rulesDoors
      .again(packName, p.id)
      .then((next) => {
        setP(next);
        setFull(next.report ? next : null);
        onChanged?.(next, `${next.title || `Change ${next.id}`} is rehearsed again on ${next.on}.`);
      })
      .catch((e: unknown) => setWhy(refusalWords(e)))
      .finally(() => setBusy(null));
  };

  const tag = stateTag(p);
  const card = p.card;
  const title = p.title || (full?.operations ?? []).map(opWords).join("; ") || `Rule change ${p.id}`;
  const decides = mayDecide(caps);
  const proposed = p.status === "proposed";
  const applied = appliedWords(p);
  const changeable = changes === "any" || (full?.operations.length ?? 0) === 1;
  return (
    <section className="approval-card rule-card" data-state={p.status} aria-label={`Rule change ${p.id}`}>
      <div className="approval-body">
        <div className="approval-kind">
          <span className="eyebrow">Rule change</span>
          <span className={tag.tone ? `tag ${tag.tone}` : "tag"}>{tag.words}</span>
          {p.stale && proposed && <span className="tag caution">rehearsed on {p.on || "an older pack"}</span>}
        </div>
        <p className="approval-title">{title}</p>
        {card && <p className="approval-sentence rule-line">{cardLine(card)}</p>}
        <p className="meta rule-lands">
          {landsWords(p)}
          {p.reason ? ` · ${p.reason}` : ""}
        </p>
        {card && <BreaksBox caps={caps} pack={pack} count={card.breaks} cases={card.right_to_wrong} onOpen={onOpen} />}
        {card && !card.cases.held && <p className="warn">Some of the pack's own cases no longer hold.</p>}
        {applied && (
          <div className="rule-applied" role="status">
            {following ? <Wait phase={applied} since={Date.parse(p.decided_at ?? "") || Date.now()} /> : <span className={p.applied?.state === "failed" || p.applied?.state === "cancelled" ? "warn" : ""}>{applied}</span>}
          </div>
        )}
        {p.status === "adopted" && p.applied?.measured && <Measured p={p} />}
        {p.status === "rejected" && p.why && <p className="meta">Not adopted: {p.why}</p>}
        {details && !full && !why && <Wait phase="reading its report" since={Date.now()} />}
        {details && full?.report && <EffectReport caps={caps} effect={full.report} pack={pack} head={false} breaks={false} onOpen={onOpen} />}
        {details && full && !full.report && <p className="meta">No report is kept with it.</p>}
      </div>
      <div className="approval-foot">
        {proposed && decides && !p.stale && (
          <button type="button" className="button" disabled={busy !== null} onClick={adopt}>
            Adopt
          </button>
        )}
        {proposed && p.stale && mayRehearse(caps) && (
          <button type="button" className="button" disabled={busy !== null} onClick={again}>
            Rehearse it again
          </button>
        )}
        {proposed && onChange && changeable && (
          <button type="button" className="button secondary" disabled={busy !== null} onClick={() => onChange(full ?? p)}>
            Change it
          </button>
        )}
        {proposed && decides && !rejecting && (
          <button type="button" className="button quiet" disabled={busy !== null} onClick={() => setRejecting(true)}>
            Reject
          </button>
        )}
        {rejecting && (
          <span className="rule-reject">
            <span className="input">
              <input value={because} aria-label="Why not" placeholder="why not, in a few words" onChange={(e) => setBecause(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reject()} />
            </span>
            <button type="button" className="button secondary" disabled={busy !== null} onClick={reject}>
              Reject it
            </button>
            <button type="button" className="icon-button" aria-label="Keep it" onClick={() => setRejecting(false)}>
              <Icon name="x" />
            </button>
          </span>
        )}
        <button type="button" className="button quiet rule-details" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
          <Icon name={details ? "chevron-up" : "chevron-down"} />
          {details ? "Less" : "Details"}
        </button>
        {proposed && !decides && <span className="meta">Adopting needs work on Review and on Data.</span>}
        {busy && <Wait phase={busy.phase} since={busy.since} />}
        {why && <span className="warn">{why}</span>}
      </div>
    </section>
  );
}

/** What the re-sort did to the stored answers, per axis that moved: each value before and after. */
function Measured({ p }: { p: Proposal }) {
  const m = p.applied!.measured!;
  const axes = Object.entries(m.axes)
    .filter(([, v]) => v > 0)
    .map(([axis]) => axis);
  if (axes.length === 0) return null;
  return (
    <div className="rule-measured">
      {axes.map((axis) => (
        <p key={axis} className="meta">
          <b>{axis}</b>{" "}
          {axisCounts(m, axis)
            .slice(0, 4)
            .map((r) => `${r.value === "" ? "nothing" : r.value} ${n(r.before)} → ${n(r.after)}`)
            .join(" · ")}
        </p>
      ))}
    </div>
  );
}

/** A proposal read by its id, then on its card: the chat's card for a change the assistant proposed, its values in the pack's colours where the pack can be read. */
export function RuleApprovalById({ caps, pack, id, onChange }: { caps: Capabilities; pack: string | null; id: number; onChange?: () => void }) {
  const [p, setP] = useState<Proposal | null>(null);
  const [doc, setDoc] = useState<PackDoc | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const name = pack ?? caps.engine?.packs[0]?.name ?? null;
  useEffect(() => {
    if (!name) return;
    let alive = true;
    rulesDoors.proposal(name, id).then(
      (x) => alive && setP(x),
      (e: unknown) => alive && setWhy(refusalWords(e)),
    );
    if (served(caps, DOORS.pack))
      rulesDoors.pack(name).then(
        (x) => alive && setDoc(x.pack),
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, [caps, name, id]);
  if (why) return <p className="warn">Rule change {id} could not be read: {why}</p>;
  if (!p) return <Wait phase="reading the rule change" since={Date.now()} />;
  return <RuleApproval caps={caps} pack={doc} proposal={p} onChange={onChange ? () => onChange() : undefined} changes="any" />;
}
