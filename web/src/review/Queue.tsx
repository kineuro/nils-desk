// SPDX-License-Identifier: AGPL-3.0-only
// The queue (record 26): a cohort's open items, the costliest first. On top,
// the three kinds as cards: the stacks the rules are unsure of, with Sort
// them and the rules' guess accepted in bulk for the ones triage says need
// no reading; the subjects that may be one person; the sessions that moved.
// Each row is decided, looked at in the viewer with its evidence, or seen.

import { lazy, Suspense, useMemo, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { ops, type ReviewItem } from "../ops/client";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { acts, batchOf, cohortChips, familyOf, itemWords, kindTag, membersOf, stackOf, type CohortChip, type Family, type ReviewSummary } from "./client";
import { bulkPlan, kindOf, needsReading, sortByCost } from "./triage";

const n = (v: number) => v.toLocaleString("en-US");

// the viewer carries cornerstone with it, so it is read only when a stack is looked at
const Viewer = lazy(() => import("../viewer/Viewer").then((m) => ({ default: m.Viewer })));

export interface QueueProps {
  caps: Capabilities;
  items: ReviewItem[];
  summary: ReviewSummary | null;
  cohort: string;
  onCohort: (key: string) => void;
  /** The batch the page was reached from, when it was. */
  batch: number | null;
  onDecide: (item: ReviewItem) => void;
  onExplain: (item: ReviewItem, stack: number) => void;
  onChanged: (words: string) => void;
}

/** The three cards on top, from the open items: what each kind counts and says. */
export function needsOf(items: ReviewItem[]): { family: Family; value: string; words: string; meta: string; bulk: number; count: number }[] {
  const open = items.filter((i) => i.status === "open");
  const of = (f: Family) => open.filter((i) => familyOf(i.kind) === f);
  const unsure = of("unsure");
  const stacks = unsure.reduce((s, i) => s + membersOf(i), 0);
  const batches = [...new Set(unsure.map((i) => batchOf(i).name ?? (batchOf(i).id !== null ? String(batchOf(i).id) : null)).filter((b): b is string => b !== null))];
  const axes = new Map<string, number>();
  for (const i of unsure) axes.set(kindOf(i.kind).area, (axes.get(kindOf(i.kind).area) ?? 0) + membersOf(i));
  const top = [...axes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a);
  const missing = unsure.filter((i) => kindOf(i.kind).what === "missing").reduce((s, i) => s + membersOf(i), 0);
  const bulk = bulkPlan(unsure, unsure.map((i) => i.id)).accepts.length;
  const identity = of("identity");
  const sources = [...new Set(identity.flatMap((i) => (typeof (i.evidence as Json | null)?.place === "string" ? [(i.evidence as Json).place as string] : [])))];
  const moved = of("moved");
  const schemes = [...new Set(moved.flatMap((i) => (typeof (i.evidence as Json | null)?.scheme === "string" ? [(i.evidence as Json).scheme as string] : [])))];
  return [
    {
      family: "unsure",
      value: `${n(stacks)} ${stacks === 1 ? "stack" : "stacks"}`,
      words: stacks === 1 ? "the rules are unsure of" : "the rules are unsure of",
      meta: [batches.length > 0 ? `${batches.length === 1 ? "batch" : "batches"} ${batches.slice(0, 3).join(", ")}${batches.length > 3 ? ` and ${batches.length - 3} more` : ""}` : null, top.length > 0 ? `mostly ${top.join(" or ")}` : null, missing > 0 ? `${n(missing)} with no value` : null]
        .filter(Boolean)
        .join(" · "),
      bulk,
      count: unsure.length,
    },
    {
      family: "identity",
      value: `${n(identity.length)} ${identity.length === 1 ? "subject" : "subjects"}`,
      words: "may be one person twice",
      meta: [identity.length > 0 ? "the same identifier under two codes" : null, sources.length > 0 ? `from ${sources.length === 1 ? "source" : "sources"} ${sources.join(" and ")}` : null].filter(Boolean).join(" · "),
      bulk: 0,
      count: identity.length,
    },
    {
      family: "moved",
      value: `${n(moved.length)} ${moved.length === 1 ? "session" : "sessions"}`,
      words: "moved between visits",
      meta: [schemes.length > 0 ? `the scheme ${schemes.join(", ")} read new dates` : null, moved.length > 0 ? "cards that pinned them are marked" : null].filter(Boolean).join(" · "),
      bulk: 0,
      count: moved.length,
    },
  ];
}

/** The items of one batch, when the page was reached from its page. */
export function ofBatch(items: ReviewItem[], batch: number | null): ReviewItem[] {
  if (batch === null) return items;
  return items.filter((i) => batchOf(i).id === batch);
}

/** The queue's table: the costliest first, each row with the act its kind takes. */
export function QueueTable({ items, may, onDecide, onLook, onSee }: { items: ReviewItem[]; may: boolean; onDecide: (i: ReviewItem) => void; onLook: (i: ReviewItem, stack: number) => void; onSee: (i: ReviewItem) => void }) {
  const rows = sortByCost(items);
  return (
    <div className="table-wrap">
      <table className="thin queue">
        <thead>
          <tr>
            <th>Kind</th>
            <th>What</th>
            <th>Batch</th>
            <th>Since</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const tag = kindTag(i.kind);
            const b = batchOf(i);
            const stack = stackOf(i);
            const family = familyOf(i.kind);
            const ev = (i.evidence ?? {}) as Json;
            const scheme = typeof ev.scheme === "string" ? ev.scheme : null;
            return (
              <tr key={i.id} className={i.status === "open" ? "" : "decided"}>
                <td>
                  <span className={`tag ${tag.tone}`}>{tag.words}</span>
                </td>
                <td>
                  {itemWords(i)}
                  {i.status !== "open" && <span className="meta"> · {i.status}</span>}
                </td>
                <td className="path">{family === "moved" && scheme ? `scheme ${scheme}` : (b.name ?? (b.id !== null ? `batch ${b.id}` : ""))}</td>
                <td className="num">{whenWords(i.created_at)}</td>
                <td className="acts">
                  <span className="row-actions">
                    {family === "unsure" && stack !== null && (
                      <button type="button" className="button secondary small" onClick={() => onLook(i, stack)}>
                        Look
                      </button>
                    )}
                    {family === "moved" && (
                      <button type="button" className="button secondary small" onClick={() => onSee(i)}>
                        See
                      </button>
                    )}
                    {may && i.status === "open" && family !== "moved" && (
                      <button type="button" className="button small" onClick={() => onDecide(i)}>
                        Decide
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="meta">
                Nothing waits here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function QueuePage({ caps, items, summary, cohort, onCohort, batch, onDecide, onExplain, onChanged }: QueueProps) {
  const may = acts(caps).decide;
  const [family, setFamily] = useState<Family | null>(null);
  const [look, setLook] = useState<{ item: ReviewItem; stack: number } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [all, setAll] = useState(false);
  const inBatch = useMemo(() => ofBatch(items, batch), [items, batch]);
  const open = inBatch.filter((i) => i.status === "open");
  const chips: CohortChip[] = cohortChips(summary, items);
  const cards = needsOf(inBatch);
  const shown = (family ? open.filter((i) => familyOf(i.kind) === family) : open).slice(0, all ? undefined : 50);
  const title = cohort === "" ? "The queue" : cohort === "none" ? "The queue of subjects in no cohort" : `The queue of ${cohort}`;
  return (
    <>
      <div className="chips cohorts">
        {chips.map((c) => (
          <button key={c.key} type="button" className={c.key === cohort ? "opt on" : "opt"} aria-pressed={c.key === cohort} onClick={() => onCohort(c.key)}>
            {c.words}
            <b>{n(c.open)}</b>
          </button>
        ))}
        {summary && <span className="meta chips-note">a subject in two cohorts shows in both, decided once</span>}
      </div>
      {batch !== null && (
        <p className="meta">
          The items of batch {batch}. <a href={href("review")}>The whole queue</a>
        </p>
      )}
      <div className="needs">
        {cards.map((c) => (
          <div key={c.family} className={c.count === 0 ? "need quiet" : "need"}>
            <span className="value">{c.value}</span>
            <span>{c.words}</span>
            <span className="meta">{c.meta || (c.count === 0 ? "nothing waits" : "")}</span>
            <div className="row actions">
              {c.family === "unsure" && (
                <>
                  <button type="button" className="button small" disabled={c.count === 0} onClick={() => setFamily("unsure")}>
                    Sort them
                  </button>
                  {may && c.bulk > 0 && (
                    <button type="button" className="button quiet small" onClick={() => setBulk(true)}>
                      Accept the rules' guess for {n(c.bulk)}
                    </button>
                  )}
                </>
              )}
              {c.family === "identity" && (
                <a className={c.count === 0 ? "button small" : "button small"} aria-disabled={c.count === 0} href={href("review", "identifiers")}>
                  Decide
                </a>
              )}
              {c.family === "moved" && (
                <button type="button" className="button secondary small" disabled={c.count === 0} onClick={() => setFamily("moved")}>
                  See the {n(c.count)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>{title}</h2>
          <span className="meta">the costliest first{family ? ` · ${family === "unsure" ? "the unsure stacks" : family === "identity" ? "the identity questions" : "the sessions that moved"}` : ""}</span>
          {family && (
            <button type="button" className="button quiet small" onClick={() => setFamily(null)}>
              All {n(open.length)}
            </button>
          )}
          {!family && open.length > 50 && !all && (
            <button type="button" className="button quiet small" onClick={() => setAll(true)}>
              All {n(open.length)}
            </button>
          )}
        </div>
        <QueueTable items={shown} may={may} onDecide={onDecide} onLook={(i, s) => setLook({ item: i, stack: s })} onSee={(i) => setFamily(familyOf(i.kind))} />
      </section>
      <div className="note gated">
        <Icon name="lock" />
        <div className="note-body">
          <p className="note-detail">
            Deciding needs Review: Work. A rule proposed here (an overlay) is tried on the cohort's stacks first and adopted by someone with Data: Work too, since it changes how data is sorted.
          </p>
        </div>
      </div>
      {look && <LookDialog item={look.item} stack={look.stack} onClose={() => setLook(null)} onExplain={() => { const l = look; setLook(null); onExplain(l.item, l.stack); }} onDecide={may ? () => { const l = look; setLook(null); onDecide(l.item); } : null} />}
      {bulk && <BulkDialog items={open.filter((i) => familyOf(i.kind) === "unsure")} onClose={() => setBulk(false)} onDone={(words) => { setBulk(false); onChanged(words); }} />}
    </>
  );
}

/** A stack in the viewer, with the item's evidence beside it. */
export function LookDialog({ item, stack, onClose, onExplain, onDecide }: { item: ReviewItem; stack: number; onClose: () => void; onExplain: () => void; onDecide: (() => void) | null }) {
  const ev = (item.evidence ?? {}) as Json;
  const facts = Object.entries(ev).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v));
  const level = typeof ev.level === "number" ? ev.level : null;
  return (
    <Dialog
      title={`Stack ${n(stack)}`}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button quiet" onClick={onExplain}>
            Why is this
          </button>
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
          {onDecide && (
            <button type="button" className="button" onClick={onDecide}>
              Decide
            </button>
          )}
        </div>
      }
    >
      <p className="lede">{itemWords(item)}</p>
      <Suspense fallback={<Wait phase="loading the viewer" since={Date.now()} size="panel" />}>
        <Viewer stack={stack} level={level} />
      </Suspense>
      {facts.length > 0 && (
        <dl className="facts">
          {facts.map(([k, v]) => (
            <div key={k} className="facts-pair">
              <dt>{k.replace(/_/g, " ")}</dt>
              <dd>{v === null ? "" : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {needsReading(item) && <p className="meta">{needsReading(item)}.</p>}
    </Dialog>
  );
}

/** The rules' guess accepted for every unsure item that needs no reading: one audit row each, the refused ones named with why. */
export function BulkDialog({ items, onClose, onDone }: { items: ReviewItem[]; onClose: () => void; onDone: (words: string) => void }) {
  const plan = bulkPlan(items, items.map((i) => i.id));
  const [busy, setBusy] = useState<{ done: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const go = async () => {
    setBusy({ done: 0 });
    setWhy(null);
    let done = 0;
    try {
      for (const i of plan.accepts) {
        await ops.reviewAccept(i.id, "accepted the rules' guess from the Review queue");
        done += 1;
        setBusy({ done });
      }
      onDone(`Accepted the rules' guess on ${n(done)} ${done === 1 ? "item" : "items"}, ${n(plan.stacks)} stacks.`);
    } catch (e) {
      setBusy(null);
      setWhy(`${done} accepted, then: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <Dialog
      title="Accept the rules' guess"
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy !== null || plan.accepts.length === 0} onClick={go}>
            Accept {n(plan.accepts.length)}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {busy && <Wait phase={`accepting, ${busy.done} of ${plan.accepts.length}`} since={since} />}
          {why && <span className="warn">{why}</span>}
        </div>
      }
    >
      <p className="lede">
        {n(plan.accepts.length)} {plan.accepts.length === 1 ? "item" : "items"} about {n(plan.stacks)} stacks keep the value the rules guessed, each acknowledged on its own audit row.
      </p>
      {plan.refused.length > 0 && (
        <div className="field">
          <span className="label">Not in bulk</span>
          <ul className="tried-list">
            {plan.refused.slice(0, 8).map((r) => (
              <li key={r.item.id} className="meta">
                {itemWords(r.item)}: {r.why}
              </li>
            ))}
            {plan.refused.length > 8 && <li className="meta">and {plan.refused.length - 8} more</li>}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
