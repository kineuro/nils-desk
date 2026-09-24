// SPDX-License-Identifier: AGPL-3.0-only
// One campaign (record 45 S3, study A3): its source and question, who rates
// and who adjudicates, how far it is, how well the raters agree, its items by
// state, and its answers. Two acts: Close, which first shows what it will
// write, and Export, which writes a label set.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { mayAny } from "../grants";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import {
  adjudicatorHas,
  agreementWords,
  answerWords,
  campaigns,
  CLOSES_WORDS,
  closedWords,
  closeRefusal,
  closure,
  exportRefusal,
  itemTotal,
  itemWords,
  kappa,
  KIND_WORDS,
  pct,
  questionWords,
  rateRefusal,
  refused as refusedWords,
  seesAnswers,
  sourceWords,
  STATES,
  stateWords,
  type Answer,
  type Campaign,
  type Closure,
  type Item,
  type LabelSet,
} from "./client";
import { StateBar, Tabs } from "./parts";

const n = (v: number) => v.toLocaleString("en-US");
const ROWS = 200;

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; c: Campaign; answers: Answer[] | null; sets: LabelSet[] };

export function CampaignPage({ caps, id }: { caps: Capabilities; id: string }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [acting, setActing] = useState<"close" | "export" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const readsSets = served(caps, "GET /api/label-sets") && mayAny(caps, "campaigns:see", "review:see");
  const read = useCallback(() => {
    const sets = readsSets ? campaigns.labelSets().catch(() => [] as LabelSet[]) : Promise.resolve([] as LabelSet[]);
    Promise.all([campaigns.one(id), campaigns.answers(id).catch(() => null), sets])
      .then(([c, answers, all]) => setLoad({ kind: "ready", c, answers, sets: all.filter((s) => s.campaign_id === c.id) }))
      .catch((e: unknown) => setLoad({ kind: "failed", why: refusedWords(e) }));
  }, [readsSets, id]);
  useEffect(() => read(), [read]);
  if (load.kind === "loading") return <Wait phase="reading the campaign" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The campaign could not be read: {load.why}</p>;
  const c = load.c;
  return (
    <CampaignBody caps={caps} campaign={c} answers={load.answers} sets={load.sets} said={said} onAct={setActing}>
      {acting === "close" && (
        <CloseDialog
          campaign={c}
          plan={closure(c, load.answers)}
          onClose={() => setActing(null)}
          onDone={(w) => {
            setActing(null);
            setSaid(w);
            read();
          }}
        />
      )}
      {acting === "export" && (
        <ExportDialog
          campaign={c}
          onClose={() => setActing(null)}
          onDone={(set) => {
            setActing(null);
            setSaid(`Exported ${set.name} v${set.version}: ${n(set.rows)} ${set.rows === 1 ? "row" : "rows"}.`);
            read();
          }}
        />
      )}
    </CampaignBody>
  );
}

export interface CampaignBodyProps {
  caps: Capabilities;
  campaign: Campaign;
  answers: Answer[] | null;
  sets: LabelSet[];
  said?: string | null;
  /** The state the items table shows; all when null. */
  filter?: string | null;
  onAct: (act: "close" | "export") => void;
  children?: React.ReactNode;
}

/** One campaign as it draws from what it read. */
export function CampaignBody({ caps, campaign: c, answers, sets, said = null, filter: initial = null, onAct, children }: CampaignBodyProps) {
  const [filter, setFilter] = useState<string | null>(initial);
  const items = c.items ?? [];
  const shown = filter ? items.filter((i) => i.state === filter) : items;
  const rate = rateRefusal(caps, c) === null && (c.counts.items.open ?? 0) > 0;
  const adjudicate = adjudicatorHas(caps, c);
  const close = closeRefusal(caps, c);
  const exp = exportRefusal(caps);
  const a = c.agreement;
  const blind = !seesAnswers(caps, c);
  const byItem = new Map<number, Answer[]>();
  for (const x of answers ?? []) byItem.set(x.item_id, [...(byItem.get(x.item_id) ?? []), x]);
  return (
    <section className="data campaign">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("campaigns")}>Campaigns</a>
          </span>
          <h1>{c.name}</h1>
          <p className="lede">
            {KIND_WORDS[c.question.kind] ?? c.question.kind}: {questionWords(c.question)} <span className={c.status === "open" ? "tag ok" : "tag"}>{c.status}</span>
          </p>
        </div>
        {rate && (
          <a className="button" href={href("campaigns", String(c.id), "rate")}>
            Rate
          </a>
        )}
        {adjudicate && (
          <a className="button" href={href("campaigns", String(c.id), "adjudicate")}>
            Adjudicate
          </a>
        )}
        {c.status !== "closed" && close === null && (
          <button type="button" className="button secondary" onClick={() => onAct("close")}>
            Close
          </button>
        )}
        {exp === null && (
          <button type="button" className="button secondary" onClick={() => onAct("export")}>
            Export
          </button>
        )}
      </div>
      <Tabs caps={caps} on="campaigns" />
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      <Values
        cells={[
          { k: "items", v: n(itemTotal(c.counts)) },
          { k: "raters each", v: String(c.raters_per_item) },
          { k: "answers", v: n(c.counts.answers) },
          { k: "exact", v: pct(a?.exact), title: agreementWords(a) },
          { k: "κ", v: kappa(a?.cohen_kappa ?? a?.fleiss_kappa), title: a?.cohen_kappa !== null && a?.cohen_kappa !== undefined ? "Cohen's kappa" : "Fleiss' kappa" },
        ]}
      />
      <StateBar counts={c.counts} />
      <dl className="facts">
        <div className="facts-pair">
          <dt>source</dt>
          <dd>
            {sourceWords(c.source)}
            {c.handle_id !== null && ` · handle ${c.handle_id}`} · {c.grain}s
          </dd>
        </div>
        <div className="facts-pair">
          <dt>raters</dt>
          <dd>{c.rater_policy.raters.length > 0 ? c.rater_policy.raters.join(", ") : "anyone with work on Campaigns"}</dd>
        </div>
        <div className="facts-pair">
          <dt>adjudicators</dt>
          <dd>{c.rater_policy.adjudicators.length > 0 ? c.rater_policy.adjudicators.join(", ") : "anyone with work on Campaigns"}</dd>
        </div>
        <div className="facts-pair">
          <dt>adjudicated</dt>
          <dd>
            {c.adjudication.when === "never" ? "never" : c.adjudication.when === "always" ? "always" : "on disagreement"} · {c.adjudication.metric}
            {c.adjudication.metric !== "exact" && c.adjudication.threshold !== null && c.adjudication.threshold !== undefined && ` below ${c.adjudication.threshold}`}
          </dd>
        </div>
        <div className="facts-pair">
          <dt>closes into</dt>
          <dd>{CLOSES_WORDS[c.closes_into] ?? c.closes_into}</dd>
        </div>
        <div className="facts-pair">
          <dt>lease</dt>
          <dd>{Math.round(c.lease_seconds / 60)} min</dd>
        </div>
        <div className="facts-pair">
          <dt>made</dt>
          <dd>
            {c.owner} · {day(c.created_at)}
            {c.pack_version && ` · ${c.pack_version}`}
          </dd>
        </div>
        {c.closed_at && (
          <div className="facts-pair">
            <dt>closed</dt>
            <dd>
              {c.closed_by ?? ""} · {day(c.closed_at)}
            </dd>
          </div>
        )}
      </dl>
      {close !== null && c.status !== "closed" && <p className="meta">{close}</p>}
      {sets.length > 0 && (
        <p className="meta">
          Label sets:{" "}
          {sets.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <a href={href("campaigns", "label-sets", String(s.id))}>
                {s.name} v{s.version}
              </a>
            </span>
          ))}
        </p>
      )}
      <h2>Items</h2>
      <div className="chips">
        <button type="button" className={filter === null ? "opt on" : "opt"} onClick={() => setFilter(null)}>
          all <b>{n(items.length)}</b>
        </button>
        {STATES.filter((s) => (c.counts.items[s.state] ?? 0) > 0).map((s) => (
          <button key={s.state} type="button" className={filter === s.state ? "opt on" : "opt"} onClick={() => setFilter(s.state)}>
            {s.words} <b>{n(c.counts.items[s.state] ?? 0)}</b>
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="thin campaign-items">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Item</th>
              <th>State</th>
              <th>Answers</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, ROWS).map((i) => (
              <ItemRow key={i.id} item={i} answers={byItem.get(i.id) ?? []} blind={blind} />
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > ROWS && <p className="meta">The first {n(ROWS)} of {n(shown.length)} are listed.</p>}
      {answers === null && <p className="meta">The answers could not be read at this detail.</p>}
      {blind && <p className="meta">Raters rate blind: each answer shows here once the campaign closes, and to its adjudicators before.</p>}
      <Says head="What closing does">
        Every agreed or adjudicated item becomes one decision through Review, {c.closes_into === "stage" ? "staged until a person commits it" : "in force"}; an item a model or an agent settled is staged
        whatever the campaign says. Items without an outcome stay open in the queue. Leases still out end. Every answer stays, and the agreement is kept.
      </Says>
      {children}
    </section>
  );
}

function ItemRow({ item: i, answers, blind }: { item: Item; answers: Answer[]; blind: boolean }) {
  const tone = STATES.find((s) => s.state === i.state)?.tone ?? "";
  return (
    <tr>
      <td className="num">{i.position + 1}</td>
      <td>
        {itemWords(i)}
        {i.round > 1 && <span className="meta"> · round {i.round}</span>}
      </td>
      <td>
        <span className={tone ? `tag ${tone}` : "tag"}>{stateWords(i.state)}</span>
      </td>
      <td className="meta">
        {answers.length === 0
          ? ""
          : blind
            ? `${answers.length} ${answers.length === 1 ? "answer" : "answers"}`
            : answers.map((a) => (
              <span key={a.id} className="answer-chip" title={a.why ?? undefined}>
                {a.principal.split("@")[0]}
                {a.role === "adjudicator" ? " (adj.)" : ""} {answerWords(a)}
              </span>
            ))}
      </td>
      <td>
        {i.outcome ? answerWords({ value: i.outcome.value, form: i.outcome.form ?? null, derivative_id: i.outcome.derivative_id ?? null }) : ""}
        {i.decision_id !== null && <span className="meta"> · decision {i.decision_id}</span>}
        {i.pick_id !== null && <span className="meta"> · pick {i.pick_id}</span>}
      </td>
    </tr>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The closure panel: what a close will write, counted before anything is written. */
export function ClosurePanel({ campaign: c, plan }: { campaign: Campaign; plan: Closure }) {
  return (
    <div className="closure">
      <p className="note-lead">
        Writes {n(plan.writes.n)} {plan.writes.words}.
      </p>
      {plan.staged > 0 && <p className="meta">{n(plan.staged)} of them a model or an agent answered, so they are staged whatever the campaign says, and a person commits them.</p>}
      {plan.already > 0 && <p className="meta">{n(plan.already)} were resolved by an earlier close.</p>}
      {plan.unresolvedTotal > 0 ? (
        <p>
          Leaves {n(plan.unresolvedTotal)} unresolved: {plan.unresolved.map((u) => `${n(u.n)} ${u.words}`).join(", ")}. Their review items stay in the queue.
        </p>
      ) : (
        <p>Leaves nothing unresolved.</p>
      )}
      {plan.leases > 0 && <p className="meta">Ends {n(plan.leases)} {plan.leases === 1 ? "lease" : "leases"} still out.</p>}
      <p className="meta">A decision that outranks one of these is left standing, and its item is named as refused. The campaign then takes no claim or answer.</p>
      {c.closes_into === "none" && <p className="meta">It writes no decision: the answers are the labels, to export.</p>}
    </div>
  );
}

function CloseDialog({ campaign: c, plan, onClose, onDone }: { campaign: Campaign; plan: Closure; onClose: () => void; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setWhy(null);
    campaigns
      .close(c.id)
      .then((r) => onDone(closedWords(r, c.closes_into)))
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusedWords(e));
      });
  };
  return (
    <Dialog
      title={`Close ${c.name}`}
      icon="check"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy} onClick={go}>
            Close the campaign
          </button>
        </div>
      }
    >
      <ClosurePanel campaign={c} plan={plan} />
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}

function ExportDialog({ campaign: c, onClose, onDone }: { campaign: Campaign; onClose: () => void; onDone: (set: LabelSet) => void }) {
  const [of, setOf] = useState<"outcomes" | "answers">("outcomes");
  const [name, setName] = useState(c.name);
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setWhy(null);
    campaigns
      .export(c.id, { of, ...(name.trim() && name.trim() !== c.name ? { name: name.trim() } : {}), ...(place.trim() ? { place: place.trim() } : {}) })
      .then(onDone)
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusedWords(e));
      });
  };
  return (
    <Dialog
      title={`Export ${c.name}`}
      icon="release"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">A name taken gets its next version; nothing is written over.</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy} onClick={go}>
            Write the label set
          </button>
        </div>
      }
    >
      <div className="chips">
        <button type="button" className={of === "outcomes" ? "opt on" : "opt"} aria-pressed={of === "outcomes"} onClick={() => setOf("outcomes")}>
          Outcomes
        </button>
        <button type="button" className={of === "answers" ? "opt on" : "opt"} aria-pressed={of === "answers"} onClick={() => setOf("answers")}>
          Every answer
        </button>
      </div>
      <p className="meta">{of === "outcomes" ? "A row per resolved item: the decision it became, or the answer that settled it." : "A row per answer, for an agreement study or a two-rater reference."}</p>
      <div className="fields2">
        <label className="field">
          <span className="label">Name</span>
          <span className="input mono">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="label">Export place · optional</span>
          <span className="input mono">
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="the one there is" />
          </span>
        </label>
      </div>
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}
