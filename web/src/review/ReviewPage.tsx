// SPDX-License-Identifier: AGPL-3.0-only
// The Review section (record 27, R5d; Wave 7a, record 55 H3): one list of
// work first (WorkPage), the campaigns' pages and the label sets inside it,
// and the machine's questions in pages under one head, each with a head of a
// line. Those pages read the queue and its summary once and again after every
// act, and hold the dialogs they share: a decision, a look in the viewer, why
// one stack was judged so, and a word for the site. A person who holds only
// campaigns:* finds the list of their campaigns at every page of Review that
// would read the queue, and the queue is never read for them. Review round
// 1 (record 56 section 6.3): Questions is the sort's own questions in plain
// words, each answered as a grid of its scans at #review/questions/<key>,
// with what else waits under them.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { ops, type ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { familyOf, modelDisagrees, review, type PackDoc, type ReviewSummary } from "./client";
import { DecideDialog } from "./Decide";
import { kindOf } from "./triage";
import { ExplainDialog } from "./Explain";
import { filterKind, queueFilterOf } from "./filter";
import { QuestionGrid, QuestionsList } from "./Questions";
import { kindsAnswered, questions, questionsServed, whereOf, type QuestionList, type Where } from "./questions";
import { AskedFamily, PicksFamily, ProposalsFamily } from "./Families";
import { IdentifiersPage } from "./Identifiers";
import { MainScansPage } from "./MainScansPage";
import { LookDialog, QueuePage } from "./Queue";
import type { WordAt } from "./Rules";
import { RulesPage, tabOf } from "./RulesPage";
import { CampaignPages, LabelSetPages } from "../campaigns/CampaignsPage";
import { queuedCount } from "./work";
import { WorkPage } from "./WorkPage";
import { RoundsPage } from "./RoundsPage";

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
  queue: { title: "What needs a person", lede: "The questions the rules leave open, and what else waits." },
  rules: { title: "Rules", lede: "The pack decides every answer. One fix to a rule mends every scan it touches." },
  identifiers: { title: "Who a file is about", lede: "What the map does not settle, and what two codes share." },
  picks: { title: "Which scan stands for a role", lede: "Occasions a pick run doubts. A person's pick stands through every later run." },
  proposals: { title: "What models proposed", lede: "Staged until a person commits them. From the value held now to the value proposed." },
  asked: { title: "What System 1 asks", lede: "Legal candidates for a whole stack, most probable first." },
};

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; items: ReviewItem[]; summary: ReviewSummary | null };

/** The address of a page of Review: the queue is #review/questions, since #review is the one list of work; the old table of pick questions is #review/picks?earlier=1, since #review/picks is Main scans (record 55, decision 6). */
export function reviewHref(page: string | null, dataset?: string): string {
  return narrow(href("review", page ?? "questions"), { earlier: page === "picks" ? 1 : undefined, dataset });
}

/**
 * The page an address of Review opens. #review and #review/campaigns are the
 * one list of work (the latter the make dialog's address); #review with a
 * query is the queue it narrows, as Review's addresses were before the list
 * (#review?dataset=, ?batch=, ?axis=), and so is #review/questions.
 */
export function ReviewPage(props: { caps: Capabilities; page: string | null; arg?: string | null; sub?: string | null; query?: Record<string, string> }) {
  const { caps, page, arg = null, sub = null, query } = props;
  if (page === "campaigns" && arg !== null && /^\d+$/u.test(arg)) return <CampaignPages caps={caps} id={arg} view={sub} query={query} />;
  if (page === "label-sets") return <LabelSetPages caps={caps} id={arg} />;
  // record 56 section 6.3: one question, as a grid of its scans
  if (page === "questions" && arg !== null && arg !== "" && questionsServed(caps)) return <QuestionGrid key={`${arg}|${query?.dataset ?? ""}|${query?.cohort ?? ""}`} caps={caps} qkey={arg} where={whereOf(query)} />;
  // record 55 D3 and D7: the rounds, what each accepted and its blind audit
  if (page === "rounds" && may(caps, "review:see") && served(caps, "GET /api/review/rounds")) return <RoundsPage caps={caps} />;
  const narrowed = query !== undefined && Object.keys(query).length > 0;
  if (!may(caps, "review:see") || page === "campaigns" || page === "work" || (page === null && !narrowed)) return <WorkPage caps={caps} query={query} />;
  // Main scans has a page of its own; the pick questions of earlier runs keep their table under Review's head
  if (subOf(page) === "picks" && !query?.earlier) return <MainScansPage caps={caps} query={query} />;
  return <ReviewPages caps={caps} page={page === "questions" ? null : page} arg={arg} sub={sub} query={query} />;
}

function ReviewPages({ caps, page, arg = null, sub: opens = null, query }: { caps: Capabilities; page: string | null; arg?: string | null; sub?: string | null; query?: Record<string, string> }) {
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
  // record 56 section 6.3: the sort's own questions, gathered, where the engine serves them; read on
  // every page of Review for the Questions chip's count, drawn on the questions' own page
  const listed = questionsServed(caps);
  const asks = listed && sub === "queue";
  const where: Where = dataset ? { dataset } : cohort !== "" && cohort !== "none" ? { cohort } : {};
  const whereKey = `${where.dataset ?? ""}|${where.cohort ?? ""}`;
  const [qlist, setQlist] = useState<{ list: QuestionList | null; failed: string | null; since: number }>(() => ({ list: null, failed: null, since: Date.now() }));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!listed) return;
    let alive = true;
    setQlist((was) => ({ ...was, failed: null }));
    questions.list(where).then(
      (list) => alive && setQlist({ list, failed: null, since: Date.now() }),
      (e: Error) => alive && setQlist((was) => ({ ...was, failed: e.message })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scope and an act are what read again
  }, [listed, whereKey, tick]);
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
  const queued = summary ? queuedCount(summary) : open.filter((i) => familyOf(i.kind) !== "campaigns").length;
  const changed = (words: string) => {
    setSaid(words);
    read();
    setTick((x) => x + 1);
  };
  // what the questions above answer leaves the list under them: the kinds the grid takes, but a model's disagreement with a person's decision
  const answeredHere = kindsAnswered(qlist.list);
  const rest = asks ? items.filter((i) => !answeredHere.has(i.kind) || modelDisagrees(i) !== null) : items;
  const questionsCount = listed && qlist.list ? qlist.list.scans : null;
  const head = HEAD[sub];
  const grown = familyCounts(items, load.kind === "ready" ? load.summary : null);

  return (
    <section className={sub === "rules" ? "data review rules-scale" : "data review"}>
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
      {/* the questions and their grown families; Rules and Subjects are pages of the side (record 55 H2, round 4) */}
      {sub !== "rules" && sub !== "identifiers" && (
      <div className="chips pages">
        <a className={sub === "queue" ? "opt on" : "opt"} href={pageHref(null)} aria-current={sub === "queue" ? "page" : undefined}>
          Questions
          {questionsCount !== null ? <b>{n(questionsCount)}</b> : load.kind === "ready" && <b>{n(queued)}</b>}
        </a>
        {/* record 55 H2, round 4: nothing hidden while empty, each with its count, zero too */}
        {GROWN.map((g) => (
          <a key={g.sub} className={sub === g.sub ? "opt on" : "opt"} href={pageHref(g.sub)} aria-current={sub === g.sub ? "page" : undefined}>
            {g.title}
            {load.kind === "ready" && <b>{n(grown[g.sub])}</b>}
          </a>
        ))}
      </div>
      )}
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {load.kind === "loading" && (sub === "queue" || sub === "identifiers") && <Wait phase="reading the queue" since={load.since} size="panel" />}
      {load.kind === "failed" && (sub === "queue" || sub === "identifiers") && <p className="warn">The queue could not be read: {load.why}</p>}
      {asks && <QuestionsList list={qlist.list} where={where} failed={qlist.failed} since={qlist.since} />}
      {sub === "queue" && load.kind === "ready" && (
        <QueuePage
          caps={caps}
          items={rest}
          summary={load.summary}
          cohort={cohort}
          onCohort={(c) => {
            setCohort(c);
            setSaid(null);
          }}
          filter={filter}
          dataset={dataset ?? ""}
          title={asks ? "Also waiting" : undefined}
          families={asks ? ["identity", "moved"] : undefined}
          batch={batch}
          run={run}
          onDecide={setDeciding}
          onExplain={(item, stack) => setExplaining({ item, stack })}
          onChanged={changed}
        />
      )}
      {sub === "rules" && (
        <RulesPage
          caps={caps}
          items={items}
          tab={tabOf(arg)}
          opened={tabOf(arg) === "proposals" && opens !== null && /^\d+$/u.test(opens) ? Number(opens) : null}
          dataset={dataset ?? null}
          wordAt={wordAt}
          onWordClose={() => setWordAt(null)}
          onChanged={changed}
          onOpen={(stack) => setExplaining({ item: null, stack })}
        />
      )}
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
            if (sub !== "rules" || tabOf(arg) !== "words") location.hash = href("review", "rules", "words");
          }}
          onDecided={(w) => {
            setExplaining(null);
            changed(w);
          }}
        />
      )}
      {looking && looking.item && (
        <LookDialog
          caps={caps}
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
