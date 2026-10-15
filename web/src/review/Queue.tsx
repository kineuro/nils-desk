// SPDX-License-Identifier: AGPL-3.0-only
// The queue (record 27, R5d): a cohort's open items, the costliest first. On
// top, the three kinds as cards, each a count, a phrase and the one act that
// goes with it. Every row action stands: a row is decided, looked at in the
// viewer with its evidence, or seen; held files are mapped on their dataset's
// Pseudonymisation page and never decided here. The table keeps the filter an
// address names (record 51, G4) and carries it to the campaign maker; a model
// that disagrees with a person's decision carries a badge (record 51 R5).
// Review round 1 (record 56 section 6.3, DR4): the sort's own questions are
// answered as a grid of their scans above this list, so the unsure card
// sorts nothing and accepts nothing in bulk (its bulk accept would have
// closed rule conflicts unseen), and the axis and reason chips are gone.

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import type { ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Says } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { EvidenceLines } from "../campaigns/ReaderParts";
import { stackReadingFor } from "../campaigns/readerDoors";
import type { Reading } from "../campaigns/reader";
import { askPeopleHref, asksPeople } from "./askPeople";
import { acts, batchOf, DISAGREES, heldBy, isGrouped, itemKey, cohortChips, datasetOf, familyOf, identityActs, itemWords, kindTag, mapHref, membersOf, modelDisagrees, PAGED, stackOf, type CohortChip, type Family, type ReviewSummary } from "./client";
import { filterKind, filterWords, NO_FILTER, passes, queueHref, type QueueFilter } from "./filter";
import { kindOf, needsReading, sortByCost } from "./triage";
import "./grown.css";
import "../campaigns/campaigns.css";

const n = (v: number) => v.toLocaleString("en-US");

// the viewer carries cornerstone with it, so it is read only when a stack is looked at
const Viewer = lazy(() => import("../viewer/Viewer").then((m) => ({ default: m.Viewer })));

/** A card on top of the queue: what its kind counts and says, and the one act that goes with it. */
export interface NeedCard {
  family: Family;
  value: string;
  words: string;
  meta: string;
  count: number;
  /** The identity card's act, by what waits: Decide, Map them or Merge, each a page. */
  act: { label: string; href: string } | null;
}

/** The identity card: what waits there is named for what it is, the costliest kind first. */
function identityCard(identity: ReviewItem[]): NeedCard {
  const twice = identity.filter((i) => identityActs(i).decide);
  const held = identity.filter((i) => kindOf(i.kind).what === "unmapped");
  const provisional = identity.filter((i) => kindOf(i.kind).what === "provisional");
  const files = held.reduce((s, i) => s + (typeof (i.evidence as Json | null)?.files === "number" ? ((i.evidence as Json).files as number) : membersOf(i)), 0);
  const sources = [...new Set(identity.map(datasetOf).filter((d): d is string => d !== null))];
  const from = sources.length > 0 ? `from ${sources.length === 1 ? "dataset" : "datasets"} ${sources.join(" and ")}` : null;
  const heldWords = held.length > 0 ? `${n(files)} ${files === 1 ? "file" : "files"} held until mapped` : null;
  const provisionalWords = provisional.length > 0 ? `${n(provisional.length)} coded without a map` : null;
  const identifiers = href("review", "identifiers");
  const base = { family: "identity" as const, count: identity.length };
  if (twice.length > 0) {
    return { ...base, value: `${n(twice.length)} ${twice.length === 1 ? "subject" : "subjects"}`, words: "may be one subject twice", meta: ["the same identifier under two codes", from, heldWords, provisionalWords].filter(Boolean).join(" · "), act: { label: "Decide", href: identifiers } };
  }
  if (held.length > 0) {
    // one dataset's held files are mapped on its own page; several are named on the Identifiers page
    const heldSources = [...new Set(held.map(datasetOf).filter((d): d is string => d !== null))];
    return { ...base, value: `${n(files)} ${files === 1 ? "file" : "files"}`, words: "held until mapped", meta: ["an identifier the map does not know", from, provisionalWords].filter(Boolean).join(" · "), act: { label: "Map them", href: heldSources.length === 1 ? mapHref(held[0]) : identifiers } };
  }
  if (provisional.length > 0) {
    return { ...base, value: `${n(provisional.length)} ${provisional.length === 1 ? "subject" : "subjects"}`, words: "coded without a map", meta: ["merged into the person it stands for by a merge, or by a map that names the identifier", from].filter(Boolean).join(" · "), act: { label: "Merge", href: identifiers } };
  }
  return { ...base, value: "0 subjects", words: "may be one subject twice", meta: "", act: null };
}

export interface QueueProps {
  caps: Capabilities;
  items: ReviewItem[];
  summary: ReviewSummary | null;
  cohort: string;
  onCohort: (key: string) => void;
  /** The batch the page was reached from, when it was. */
  batch: number | null;
  /** The pipeline run the page was reached from, when it was (record 49): its failures and breaches. */
  run?: number | null;
  onDecide: (item: ReviewItem) => void;
  onExplain: (item: ReviewItem, stack: number) => void;
  onChanged: (words: string) => void;
  /** The axis and reason the table is narrowed to, from the page's address (record 51, G4). */
  filter?: QueueFilter;
  /** The dataset the page was opened for, which the way back to the whole list keeps. */
  dataset?: string;
  /** The words on the list's head: the queue, or what waits beside the questions above it. */
  title?: string;
  /** The cards shown on top, of the three; every one where none is named. */
  families?: Family[];
}

/** The three cards on top, from the open items: what each kind counts and says. */
export function needsOf(items: ReviewItem[]): NeedCard[] {
  const open = items.filter((i) => i.status === "open");
  const of = (f: Family) => open.filter((i) => familyOf(i.kind) === f);
  const unsure = of("unsure");
  const stacks = unsure.reduce((s, i) => s + membersOf(i), 0);
  const batches = [...new Set(unsure.map((i) => batchOf(i).name ?? (batchOf(i).id !== null ? String(batchOf(i).id) : null)).filter((b): b is string => b !== null))];
  const axes = new Map<string, number>();
  for (const i of unsure) axes.set(kindOf(i.kind).area, (axes.get(kindOf(i.kind).area) ?? 0) + membersOf(i));
  const top = [...axes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a);
  const missing = unsure.filter((i) => kindOf(i.kind).what === "missing").reduce((s, i) => s + membersOf(i), 0);
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
      count: unsure.length,
      act: null,
    },
    identityCard(of("identity")),
    {
      family: "moved",
      value: `${n(moved.length)} ${moved.length === 1 ? "session" : "sessions"}`,
      words: "moved between visits",
      meta: [schemes.length > 0 ? `the scheme ${schemes.join(", ")} read new dates` : null, moved.length > 0 ? "cards that pinned them are marked" : null].filter(Boolean).join(" · "),
      count: moved.length,
      act: null,
    },
  ];
}

/** The items of one batch, when the page was reached from its page. */
export function ofBatch(items: ReviewItem[], batch: number | null): ReviewItem[] {
  if (batch === null) return items;
  return items.filter((i) => batchOf(i).id === batch);
}

/** The items of one pipeline run, when the page was reached from its page. */
export function ofRun(items: ReviewItem[], run: number | null): ReviewItem[] {
  if (run === null) return items;
  return items.filter((i) => (i.ref as Record<string, unknown> | null | undefined)?.run_id === run);
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
              <tr key={itemKey(i)} className={i.status === "open" ? "" : "decided"}>
                <td>
                  <span className={`tag ${tag.tone}`}>{tag.words}</span>
                  {i.mode === "blind_first" && <span className="tag mode-blind">blind first</span>}
                </td>
                <td>
                  {modelDisagrees(i) && <span className="tag caution badge">{DISAGREES}</span>}
                  {itemWords(i)}
                  {i.status !== "open" && <span className="meta"> · {i.status}</span>}
                </td>
                <td className="path">{family === "moved" && scheme ? `scheme ${scheme}` : (b.name ?? (b.id !== null ? `batch ${b.id}` : ""))}</td>
                <td className="num">{i.created_at ? whenWords(i.created_at) : ""}</td>
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
                    {family === "identity" && i.status === "open" && identityActs(i).map && (
                      <a className="button secondary small" href={mapHref(i)}>
                        Map them
                      </a>
                    )}
                    {family === "identity" && i.status === "open" && identityActs(i).merge && !identityActs(i).decide && (
                      <a className="button secondary small" href={href("review", "identifiers")}>
                        Merge
                      </a>
                    )}
                    {family === "campaigns" && heldBy(i).id !== null && (
                      <a className="button secondary small" href={href("review", "campaigns", String(heldBy(i).id))}>
                        Open
                      </a>
                    )}
                    {family !== null && PAGED.includes(family) && (
                      <a className="button secondary small" href={family === "picks" ? narrow(href("review", "picks"), { earlier: 1 }) : href("review", family)}>
                        Open
                      </a>
                    )}
                    {isGrouped(i) && <span className="meta">counted at your detail</span>}
                    {may && !isGrouped(i) && i.status === "open" && family !== "moved" && (family === null || !PAGED.includes(family)) && (family !== "identity" || identityActs(i).decide) && (
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

export function QueuePage({ caps, items, summary, cohort, onCohort, batch, run = null, onDecide, onExplain, filter = NO_FILTER, dataset = "", title: named, families }: QueueProps) {
  const may = acts(caps).decide;
  const [family, setFamily] = useState<Family | null>(null);
  const [look, setLook] = useState<{ item: ReviewItem; stack: number } | null>(null);
  const [all, setAll] = useState(false);
  const inBatch = useMemo(() => ofRun(ofBatch(items, batch), run), [items, batch, run]);
  const open = inBatch.filter((i) => i.status === "open");
  const chips: CohortChip[] = cohortChips(summary, items);
  const cards = needsOf(inBatch).filter((c) => !families || families.includes(c.family));
  const filtered = open.filter((i) => passes(i, filter));
  const shown = (family ? filtered.filter((i) => familyOf(i.kind) === family) : filtered).slice(0, all ? undefined : 50);
  const narrowed = filterWords(filter);
  const carried = filterKind(filter);
  const ask = asksPeople(caps) && filtered.length > 0 && carried !== null ? askPeopleHref({ ...carried, cohort: cohort === "" ? null : cohort }) : null;
  const title = named ?? (cohort === "" ? "The queue" : cohort === "none" ? "The queue of subjects in no cohort" : `The queue of ${cohort}`);
  return (
    <>
      <div className="chips cohorts">
        {chips.map((c) => (
          <button key={c.key} type="button" className={c.key === cohort ? "opt on" : "opt"} aria-pressed={c.key === cohort} onClick={() => onCohort(c.key)}>
            {c.words}
            <b>{n(c.open)}</b>
          </button>
        ))}
      </div>
      {batch !== null && (
        <p className="meta">
          The items of batch {batch}. <a href={href("review", "questions")}>The whole queue</a>
        </p>
      )}
      {run !== null && (
        <p className="meta">
          The items of pipeline run {run}. <a href={href("review", "questions")}>The whole queue</a>
        </p>
      )}
      <div className="needs">
        {cards.map((c) => (
          <div key={c.family} className={c.count === 0 ? "need quiet" : "need"}>
            <span className="value">{c.value}</span>
            <span>{c.words}</span>
            <span className="meta">{c.meta || (c.count === 0 ? "nothing waits" : "")}</span>
            <div className="row actions">
              {c.family === "identity" && (
                <a className="button small" aria-disabled={c.act === null} href={c.act?.href ?? href("review", "identifiers")}>
                  {c.act?.label ?? "Decide"}
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
          <span className="meta">
            the costliest first{narrowed ? ` · ${narrowed}, ${n(filtered.length)} open` : ""}
            {narrowed && (
              <>
                {" · "}
                <a href={queueHref(NO_FILTER, cohort, dataset)}>every question</a>
              </>
            )}
            {family ? ` · ${family === "unsure" ? "the unsure stacks" : family === "identity" ? "the identity questions" : "the sessions that moved"}` : ""}
          </span>
          {family && (
            <button type="button" className="button quiet small" onClick={() => setFamily(null)}>
              All {n(filtered.length)}
            </button>
          )}
          {!family && filtered.length > 50 && !all && (
            <button type="button" className="button quiet small" onClick={() => setAll(true)}>
              All {n(filtered.length)}
            </button>
          )}
          {ask && (
            <a className="button secondary small" href={ask}>
              Ask people about these
            </a>
          )}
          {asksPeople(caps) && narrowed && carried === null && <span className="meta">choose an axis to ask people about these</span>}
        </div>
        <QueueTable items={shown} may={may} onDecide={onDecide} onLook={(i, s) => setLook({ item: i, stack: s })} onSee={(i) => setFamily(familyOf(i.kind))} />
        <Says head="How the queue is shared out">
          A subject in two cohorts shows on both queues and is decided once. Deciding needs work on the Review page. A rule proposed here is tried on the cohort&apos;s stacks first, and adopting it needs
          work on the Data page too, since it changes how data is sorted.
        </Says>
      </section>
      {look && <LookDialog caps={caps} item={look.item} stack={look.stack} onClose={() => setLook(null)} onExplain={() => { const l = look; setLook(null); onExplain(l.item, l.stack); }} onDecide={may ? () => { const l = look; setLook(null); onDecide(l.item); } : null} />}
    </>
  );
}

/**
 * A stack in the viewer, with why the rules decided beside it (record 55
 * H5: the engine's GET /api/stacks/{stack}/why, where it serves it and the
 * person may read the queue) and the item's own evidence under that.
 */
export function LookDialog({ caps, item, stack, onClose, onExplain, onDecide }: { caps?: Capabilities; item: ReviewItem; stack: number; onClose: () => void; onExplain: () => void; onDecide: (() => void) | null }) {
  const ev = (item.evidence ?? {}) as Json;
  const facts = Object.entries(ev).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v));
  const level = typeof ev.level === "number" ? ev.level : null;
  const [reading, setReading] = useState<Reading | null>(null);
  useEffect(() => {
    if (!caps) return;
    let alive = true;
    setReading(null);
    stackReadingFor(caps, stack).then((r) => alive && setReading(r));
    return () => {
      alive = false;
    };
  }, [caps, stack]);
  const lines = reading && !reading.blind ? reading.lines : [];
  return (
    <Dialog
      title={`Stack ${n(stack)}`}
      icon="review"
      className="look-dialog"
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
      {modelDisagrees(item) && (
        <p>
          <span className="tag caution badge">{DISAGREES}</span>
        </p>
      )}
      <p className="lede">{itemWords(item)}</p>
      <div className="look-grid">
        <div className="look-picture">
          <Suspense fallback={<Wait phase="loading the viewer" since={Date.now()} size="panel" />}>
            <Viewer stack={stack} level={level} />
          </Suspense>
        </div>
        <div className="look-side">
          {reading?.blind && <p className="meta">Sealed: read blind, the rules' answer is not shown.</p>}
          <EvidenceLines lines={lines} full pack={reading?.pack ?? null} />
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
        </div>
      </div>
    </Dialog>
  );
}
