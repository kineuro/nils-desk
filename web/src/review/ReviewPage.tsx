// SPDX-License-Identifier: AGPL-3.0-only
// The Review page (record 27, R5d): what needs a person, in three pages under
// one head, each with a head of a line. The page reads the queue and its
// summary once and again after every act, and holds the dialogs the three
// share: a decision, a look in the viewer, why one stack was judged so, and a
// word for the site.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { ops, type ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { familyOf, modelDisagrees, review, type PackDoc, type ReviewSummary } from "./client";
import { DecideDialog } from "./Decide";
import { kindOf } from "./triage";
import { ExplainDialog } from "./Explain";
import { filterKind, queueFilterOf, queueHref } from "./filter";
import { AskedFamily, PicksFamily, ProposalsFamily } from "./Families";
import { IdentifiersPage } from "./Identifiers";
import { MainScansPage } from "./MainScansPage";
import { LookDialog, QueuePage } from "./Queue";
import { RulesPage, type WordAt } from "./Rules";

export type ReviewSub = "queue" | "rules" | "identifiers" | "picks" | "proposals" | "asked";

const SUBS: readonly ReviewSub[] = ["rules", "identifiers", "picks", "proposals", "asked"];

const n = (v: number) => v.toLocaleString("en-US");

/** The page an address names: the queue unless it names another. */
export function subOf(page: string | null): ReviewSub {
  return SUBS.find((s) => s === page) ?? "queue";
}

/** How many items wait in each grown family (record 45): the open ones, from the summary where the engine gives one, else from the items read, and a model's staged groups, which wait for a person to commit them. */
export function familyCounts(items: ReviewItem[], summary: ReviewSummary | null): Record<"picks" | "proposals" | "asked", number> {
  const out = { picks: 0, proposals: 0, asked: 0 };
  const add = (kind: string, count: number) => {
    const f = familyOf(kind);
    if (f === "picks" || f === "proposals" || f === "asked") out[f] += count;
  };
  if (summary) for (const [kind, count] of Object.entries(summary.by_kind)) add(kind, count);
  else for (const i of items) if (i.status === "open") add(i.kind, 1);
  for (const i of items) if (i.status === "staged" && familyOf(i.kind) === "proposals") out.proposals += 1;
  return out;
}

/** The grown families' chips, each where the engine serves what it reads and something waits there, or where the page is open. */
export const GROWN: { sub: "picks" | "proposals" | "asked"; title: string }[] = [
  { sub: "picks", title: "Picks" },
  { sub: "proposals", title: "Proposals" },
  { sub: "asked", title: "Asked" },
];

const HEAD: Record<ReviewSub, { title: string; lede: string }> = {
  queue: { title: "What needs a person", lede: "Unsure scans, subjects that may be one person, sessions that moved." },
  rules: { title: "How scans are sorted", lede: "Eleven axes. Every list the pack opens is the site's to grow." },
  identifiers: { title: "Who a file is about", lede: "What the map does not settle, and what two codes share." },
  picks: { title: "Which scan stands for a role", lede: "Occasions a pick run doubts. A person's pick stands through every later run." },
  proposals: { title: "What models proposed", lede: "Staged until a person commits them. From the value held now to the value proposed." },
  asked: { title: "What System 1 asks", lede: "Legal candidates for a whole stack, most probable first." },
};

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; items: ReviewItem[]; summary: ReviewSummary | null };

/** The address of a page of Review: the old table of pick questions is #review/picks?earlier=1, since #review/picks is Main scans (record 55, decision 6). */
export function reviewHref(page: string | null, dataset?: string): string {
  return narrow(href("review", page), { earlier: page === "picks" ? 1 : undefined, dataset });
}

export function ReviewPage(props: { caps: Capabilities; page: string | null; query?: Record<string, string> }) {
  // Main scans has a page of its own; the pick questions of earlier runs keep their table under Review's head
  if (subOf(props.page) === "picks" && !props.query?.earlier) return <MainScansPage caps={props.caps} query={props.query} />;
  return <ReviewPages {...props} />;
}

function ReviewPages({ caps, page, query }: { caps: Capabilities; page: string | null; query?: Record<string, string> }) {
  const sub = subOf(page);
  const batch = query?.batch && /^\d+$/.test(query.batch) ? Number(query.batch) : null;
  const run = query?.run && /^\d+$/.test(query.run) ? Number(query.run) : null;
  // a dataset's card opens the queue on its own scans: #review?dataset=NAME
  const dataset = query?.dataset && query.dataset !== "" ? query.dataset : undefined;
  /** A page of Review, still narrowed to the dataset it was opened for. */
  const pageHref = (page: string | null) => reviewHref(page, dataset);
  const [cohort, setCohort] = useState<string>(query?.cohort ?? "");
  // record 51, G4: the queue's axis and reason live in the address, so a reload or a link keeps them
  const filter = queueFilterOf(query);
  const kind = filterKind(filter)?.kind;
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<ReviewItem | null>(null);
  const [looking, setLooking] = useState<{ item: ReviewItem | null; stack: number } | null>(null);
  const [explaining, setExplaining] = useState<{ item: ReviewItem | null; stack: number } | null>(null);
  const [wordAt, setWordAt] = useState<WordAt | null>(null);
  // the pack's values, read once a decision on a classifier question is opened, so the value is chosen from a list
  const [pack, setPack] = useState<PackDoc | null>(null);
  const filters = served(caps, "GET /api/review/summary");
  const packName = caps.engine?.packs[0]?.name ?? null;
  useEffect(() => {
    if (!deciding || pack !== null || packName === null || !kindOf(deciding.kind).classifier) return;
    let alive = true;
    review.pack(packName).then((p) => alive && setPack(p), () => undefined);
    return () => {
      alive = false;
    };
  }, [deciding, pack, packName]);

  const read = useCallback(() => {
    const cohortArg = filters && cohort !== "" ? cohort : undefined;
    // one kind is asked of the engine, so the queue holds every item of it rather than the first 500 of all
    const items = filters ? review.list({ cohort: cohortArg, dataset, kind, limit: 500 }) : ops.review(undefined, kind, 500, undefined, dataset);
    const summary = filters ? review.summary(cohortArg, dataset).catch(() => null) : Promise.resolve(null);
    Promise.all([items, summary])
      .then(([r, s]) => setLoad({ kind: "ready", items: r.items, summary: s }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  }, [filters, cohort, kind, dataset]);

  useEffect(() => {
    read();
  }, [read]);

  const items = load.kind === "ready" ? load.items : [];
  const open = items.filter((i) => i.status === "open");
  // the queue's count is the whole queue's, where the summary gives it, also while the table reads one kind
  const summary = load.kind === "ready" ? load.summary : null;
  const queued = summary ? Object.values(summary.by_kind).reduce((a, b) => a + b, 0) : open.length;
  const identity = open.filter((i) => familyOf(i.kind) === "identity").length;
  const changed = (words: string) => {
    setSaid(words);
    read();
  };
  const head = HEAD[sub];
  const grown = familyCounts(items, load.kind === "ready" ? load.summary : null);

  return (
    <section className="data review">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Review</span>
          <h1>{head.title}</h1>
          {dataset && (
            <span className="row review-dataset">
              <span className="tag">{dataset}</span>
              <a className="icon-button" href={reviewHref(sub === "queue" ? null : sub)} aria-label={`Every dataset, not only ${dataset}`}>
                <Icon name="x" />
              </a>
            </span>
          )}
          <p className="lede">{head.lede}</p>
        </div>
      </div>
      <div className="chips pages">
        <a className={sub === "queue" ? "opt on" : "opt"} href={pageHref(null)} aria-current={sub === "queue" ? "page" : undefined}>
          Queue
          {load.kind === "ready" && <b>{n(queued)}</b>}
        </a>
        <a className={sub === "rules" ? "opt on" : "opt"} href={pageHref("rules")} aria-current={sub === "rules" ? "page" : undefined}>
          Rules
        </a>
        <a className={sub === "identifiers" ? "opt on" : "opt"} href={pageHref("identifiers")} aria-current={sub === "identifiers" ? "page" : undefined}>
          Identifiers
          {load.kind === "ready" && identity > 0 && <b>{n(identity)}</b>}
        </a>
        {GROWN.filter((g) => sub === g.sub || grown[g.sub] > 0).map((g) => (
          <a key={g.sub} className={sub === g.sub ? "opt on" : "opt"} href={pageHref(g.sub)} aria-current={sub === g.sub ? "page" : undefined}>
            {g.title}
            {grown[g.sub] > 0 && <b>{n(grown[g.sub])}</b>}
          </a>
        ))}
      </div>
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {load.kind === "loading" && (sub === "queue" || sub === "identifiers") && <Wait phase="reading the queue" since={load.since} size="panel" />}
      {load.kind === "failed" && (sub === "queue" || sub === "identifiers") && <p className="warn">The queue could not be read: {load.why}</p>}
      {sub === "queue" && load.kind === "ready" && (
        <QueuePage
          caps={caps}
          items={items}
          summary={load.summary}
          cohort={cohort}
          onCohort={(c) => {
            setCohort(c);
            setSaid(null);
          }}
          filter={filter}
          onFilter={(f) => {
            setSaid(null);
            location.hash = queueHref(f, cohort, dataset ?? "");
          }}
          batch={batch}
          run={run}
          onDecide={setDeciding}
          onExplain={(item, stack) => setExplaining({ item, stack })}
          onChanged={changed}
        />
      )}
      {sub === "rules" && <RulesPage caps={caps} items={items} wordAt={wordAt} onWordClose={() => setWordAt(null)} onChanged={changed} />}
      {sub === "identifiers" && load.kind === "ready" && <IdentifiersPage caps={caps} items={items} onDecide={setDeciding} onChanged={changed} />}
      {sub === "picks" && <PicksFamily key={dataset ?? ""} caps={caps} packName={packName} dataset={dataset} onChanged={changed} />}
      {sub === "proposals" && <ProposalsFamily caps={caps} onChanged={changed} />}
      {sub === "asked" && <AskedFamily caps={caps} packName={packName} onExplain={(item, stack) => setExplaining({ item, stack })} onChanged={changed} />}
      {deciding && <DecideDialog item={deciding} pack={pack} guess={modelDisagrees(deciding)?.decision ?? null} onClose={() => setDeciding(null)} onDone={(w) => { setDeciding(null); changed(w); }} />}
      {explaining && (
        <ExplainDialog
          caps={caps}
          stack={explaining.stack}
          item={explaining.item}
          onClose={() => setExplaining(null)}
          onLook={(stack) => {
            const e = explaining;
            setExplaining(null);
            setLooking({ item: e.item, stack });
          }}
          onAddWord={(at) => {
            setExplaining(null);
            setWordAt(at);
            if (sub !== "rules") location.hash = href("review", "rules");
          }}
          onDecided={(w) => {
            setExplaining(null);
            changed(w);
          }}
        />
      )}
      {looking && looking.item && (
        <LookDialog
          item={looking.item}
          stack={looking.stack}
          onClose={() => setLooking(null)}
          onExplain={() => {
            const l = looking;
            setLooking(null);
            setExplaining({ item: l.item, stack: l.stack });
          }}
          onDecide={null}
        />
      )}
    </section>
  );
}
