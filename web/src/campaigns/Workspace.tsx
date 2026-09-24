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
import { StackView } from "./StackView";
import { answeredWords, beatSeat, bodyOf, chosenOf, disagreementWords, given as choose, givenNone, illegal, keyAct, marksOf, rowsOf, seatOf, type Seat } from "./workspace";

type Role = "rater" | "adjudicator";

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
  // a session item's stacks, where the engine names them (record 45); the session board of S5 draws them as tiles
  const [pickable, setPickable] = useState<number[] | null>(null);
  const [stackWords, setStackWords] = useState<Record<number, string>>({});

  // the capabilities are read again every few seconds; the workspace follows them without starting over
  const capsNow = useRef(caps);
  capsNow.current = caps;

  const claim = useCallback(
    (note: string | null = null) => {
      setSeat({ kind: "claiming" });
      campaigns
        .claim(id, role)
        .then((c) => setSeat(seatOf(c, note)))
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

  // a new item starts from a blank answer; its review item's evidence where the person may read the queue; every answer for the adjudicator
  useEffect(() => {
    if (!q || assignmentId === null || !item) return;
    setG(blank(q));
    setWhy("");
    setRefused(null);
    setEvidence(null);
    setPickable(null);
    if (q.kind === "pick" && served(capsNow.current, CANDIDATES))
      campaigns.candidates(id, item.id).then(
        (r) => {
          setPickable(r.candidates.map((x) => x.stack_id));
          setStackWords(Object.fromEntries(r.candidates.map((x) => [x.stack_id, Object.values(x.axes).flat().join(" ")])));
        },
        () => undefined,
      );
    if (item.review_item_id !== null && may(capsNow.current, "review:see")) campaigns.reviewItem(item.review_item_id).then((r) => setEvidence(r.evidence ?? null), () => undefined);
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
    campaigns
      .answer(id, holding.assignment.id, b.body)
      .then((r) => {
        setDone((d) => d + 1);
        setSaid(answeredWords(r, holding.item));
        setOpen((o) => (o === null ? o : Math.max(0, o - (r.state === "open" ? 0 : 1))));
        claim();
      })
      .catch((e: unknown) => setRefused(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [q, holding, busy, g, why, id, claim]);

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
  const candidates = pickable ?? candidatesOf(evidence);

  // the keys
  const keyed = useRef({ q, rows, candidates, g, answer, giveBack });
  keyed.current = { q, rows, candidates, g, answer, giveBack };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (!k.q || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (t?.closest?.("dialog")) return;
      // Enter on a link or an act's button is that link's or button's; on a value it answers
      if (e.key === "Enter" && t && (t.tagName === "A" || (t.tagName === "BUTTON" && !t.closest(".axis-rows, .form-fields")))) return;
      const act = keyAct(e.key, { ctrl: e.ctrlKey, inField, q: k.q, rows: k.rows, candidates: k.candidates });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "answer") k.answer();
      else if (act.kind === "skip") k.giveBack("next");
      else if (act.kind === "keys") setKeys((x) => !x);
      else if (act.kind === "choose") setG((was) => choose(k.q!, was, act.row, act.value));
      else if (act.kind === "pick") setG((was) => (was.kind === "stacks" ? { kind: "stacks", stacks: was.stacks.includes(act.stack) ? was.stacks.filter((s) => s !== act.stack) : [...was.stacks, act.stack] } : was));
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
          <span className="meta">{p.done > 0 ? `${n(p.done)} answered here` : "items"}</span>
        </div>
      </div>
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
      {holding && (
        <div className="rate-grid">
          <div className="rate-picture">
            {holding.item.stack_id !== null ? (
              <StackView stack={holding.item.stack_id} />
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
            {p.keys && <KeyList rows={p.rows.length} />}
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

function KeyList({ rows }: { rows: number }) {
  return (
    <dl className="facts keys">
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
