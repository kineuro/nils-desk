// SPDX-License-Identifier: AGPL-3.0-only
// The Review page (record 26): what needs a person. Three pages under one
// head: the queue by cohort, the rules with every axis and its words, and
// the identity questions. The page reads the queue and its summary once and
// again after every act, and holds the dialogs the three share: a decision,
// a look in the viewer, why one stack was judged so, and a word for the site.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { ops, type ReviewItem } from "../ops/client";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { familyOf, review, type PackDoc, type ReviewSummary } from "./client";
import { DecideDialog } from "./Decide";
import { kindOf } from "./triage";
import { ExplainDialog } from "./Explain";
import { IdentifiersPage } from "./Identifiers";
import { LookDialog, QueuePage } from "./Queue";
import { RulesPage, type WordAt } from "./Rules";

export type ReviewSub = "queue" | "rules" | "identifiers";

const n = (v: number) => v.toLocaleString("en-US");

/** The page an address names: the queue unless it says rules or identifiers. */
export function subOf(page: string | null): ReviewSub {
  return page === "rules" || page === "identifiers" ? page : "queue";
}

const HEAD: Record<ReviewSub, { title: string; lede: string }> = {
  queue: { title: "What needs a person", lede: "A scan the rules could not place, two records that may be one person, a visit that moved. Pick a cohort and take its queue." },
  rules: { title: "How scans are sorted", lede: "The pack decides, axis by axis: a flag, a word, or physics. Every word list is the site's to grow, for a scanner, a batch or everywhere, tried on real stacks before anyone adopts it." },
  identifiers: { title: "Who a file is about", lede: "A subject stays one subject however it arrives. What the map does not settle, and what two codes share, waits here." },
};

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; items: ReviewItem[]; summary: ReviewSummary | null };

export function ReviewPage({ caps, page, query }: { caps: Capabilities; page: string | null; query?: Record<string, string> }) {
  const sub = subOf(page);
  const batch = query?.batch && /^\d+$/.test(query.batch) ? Number(query.batch) : null;
  const [cohort, setCohort] = useState<string>(query?.cohort ?? "");
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
    const items = filters ? review.list({ cohort: cohortArg, limit: 500 }) : ops.review(undefined, undefined, 500);
    const summary = filters ? review.summary(cohortArg).catch(() => null) : Promise.resolve(null);
    Promise.all([items, summary])
      .then(([r, s]) => setLoad({ kind: "ready", items: r.items, summary: s }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  }, [filters, cohort]);

  useEffect(() => {
    read();
  }, [read]);

  const items = load.kind === "ready" ? load.items : [];
  const open = items.filter((i) => i.status === "open");
  const identity = open.filter((i) => familyOf(i.kind) === "identity").length;
  const changed = (words: string) => {
    setSaid(words);
    read();
  };
  const head = HEAD[sub];

  return (
    <section className="data review">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Review</span>
          <h1>{head.title}</h1>
          <p className="lede">{head.lede}</p>
        </div>
      </div>
      <div className="chips pages">
        <a className={sub === "queue" ? "opt on" : "opt"} href={href("review")} aria-current={sub === "queue" ? "page" : undefined}>
          Queue
          {load.kind === "ready" && <b>{n(open.length)}</b>}
        </a>
        <a className={sub === "rules" ? "opt on" : "opt"} href={href("review", "rules")} aria-current={sub === "rules" ? "page" : undefined}>
          Rules
        </a>
        <a className={sub === "identifiers" ? "opt on" : "opt"} href={href("review", "identifiers")} aria-current={sub === "identifiers" ? "page" : undefined}>
          Identifiers
          {load.kind === "ready" && identity > 0 && <b>{n(identity)}</b>}
        </a>
      </div>
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {load.kind === "loading" && sub !== "rules" && <Wait phase="reading the queue" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The queue could not be read: {load.why}</p>}
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
          batch={batch}
          onDecide={setDeciding}
          onExplain={(item, stack) => setExplaining({ item, stack })}
          onChanged={changed}
        />
      )}
      {sub === "rules" && <RulesPage caps={caps} items={items} wordAt={wordAt} onWordClose={() => setWordAt(null)} onChanged={changed} />}
      {sub === "identifiers" && load.kind === "ready" && <IdentifiersPage caps={caps} items={items} onDecide={setDeciding} onChanged={changed} />}
      {deciding && <DecideDialog item={deciding} pack={pack} onClose={() => setDeciding(null)} onDone={(w) => { setDeciding(null); changed(w); }} />}
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
