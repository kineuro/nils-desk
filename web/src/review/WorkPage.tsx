// SPDX-License-Identifier: AGPL-3.0-only
// Review's first page (Wave 7a, record 55 H3; redesigned 2026-11-08 after a
// person opened it for a model's proposals and could not find them): cards,
// as Data's page, in up to four bands. What models proposed, each card with
// Commit and Read; the scans the rules ask about, one card per axis with
// Answer; the campaigns people read, each with its one act; and everything
// else, folded, in a person's words. A band with nothing is left out. It
// reads the review doors only for a person who reviews; a rater who holds
// only campaigns:* finds their campaigns here, and the page never reads the
// queue for them. An engine without a door shows the page with what it
// serves. The make dialog and New check open from it, as the Campaigns list's
// did: #review/campaigns?make=selection|handle|review&from= and
// #review/campaigns?make=check[&run=<id>].

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { campaigns, makeRefusal, MINE, ownCampaign, prefillOf, rateRefusal, type Campaign, type Prefill } from "../campaigns/client";
import { MakeDialog } from "../campaigns/MakeCampaign";
import { NewCheck, runChoiceOf, type RunChoice } from "../campaigns/NewCheck";
import { checkServed, makeCheckRefusal } from "../campaigns/check";
import { StateBar } from "../campaigns/parts";
import { catalog } from "../ops/catalog";
import { readsCampaigns as readsCampaignsOf, reviews } from "../home/placeholders";
import { review, type ReviewSummary } from "./client";
import { standingActs, standingDoors, type Standing } from "./modelFamily";
import { CommitStandingDialog, RestCampaignDialog } from "./ModelStanding";
import { questions, questionsServed, type QuestionList } from "./questions";
import { committedLine, followLine, resortOf, useFollowedJob, type Resort } from "./resort";
import { alsoRows, alsoSummary, axisCards, campaignBand, modelSub, shareWords, sortStandings, standingMeta, standingTitle, type CampaignCard } from "./work";
import "../campaigns/campaigns.css";
import "./work.css";

const n = (v: number) => v.toLocaleString("en-US");

/** The most campaigns whose own share is read, one small read each. */
const SHARES_READ = 30;

type Load<T> = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: T };

const loading = <T,>(): Load<T> => ({ kind: "loading", since: Date.now() });
const ready = <T,>(value: T): Load<T> => ({ kind: "ready", value });

export function WorkPage({ caps, query }: { caps: Capabilities; query?: Record<string, string> }) {
  const reviewer = reviews(caps);
  const readsCampaigns = readsCampaignsOf(caps);
  const acts = standingActs(caps);
  const asks = questionsServed(caps);
  const [summary, setSummary] = useState<Load<ReviewSummary | null>>(loading);
  const [standings, setStandings] = useState<Load<Standing[] | null>>(loading);
  const [qlist, setQlist] = useState<Load<QuestionList | null>>(loading);
  const [list, setList] = useState<Load<Campaign[]>>(loading);
  const [mine, setMine] = useState<Record<number, number>>({});
  const [tick, setTick] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  // UX round 5: the re-sort a commit queued, followed through the jobs door until it is over
  const [follow, setFollow] = useState<{ s: Standing; resort: Resort } | null>(null);
  const followed = useFollowedJob(follow?.resort.job ?? null, () => setTick((x) => x + 1));
  const [committing, setCommitting] = useState<Standing | null>(null);
  const [reading, setReading] = useState<Standing | null>(null);
  const prefill = prefillOf(query);
  const check = query?.make === "check" ? (query.run && /^\d+$/u.test(query.run) ? Number(query.run) : 0) : null;
  const [making, setMaking] = useState<Prefill | null>(prefill);
  const [checking, setChecking] = useState<{ run: RunChoice | null } | null>(check === 0 ? { run: null } : null);

  // the summary of what waits, for a person who reviews; never read for a rater
  useEffect(() => {
    if (!reviewer) {
      setSummary(ready(null));
      return;
    }
    let alive = true;
    const read = served(caps, "GET /api/review/summary")
      ? review.summary()
      : review.list({ status: "open", limit: 500 }).then((r) => {
          const by_kind: Record<string, number> = {};
          for (const i of r.items) if (i.status === "open") by_kind[i.kind] = (by_kind[i.kind] ?? 0) + 1;
          return { by_kind, cohorts: [], none: 0 } as ReviewSummary;
        });
    read.then(
      (s) => alive && setSummary(ready(s)),
      (e: Error) => alive && setSummary({ kind: "failed", why: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [caps, reviewer, tick]);

  // what models proposed, where the engine counts them
  useEffect(() => {
    if (!acts.reads) {
      setStandings(ready(null));
      return;
    }
    let alive = true;
    standingDoors.list().then(
      (l) => alive && setStandings(ready(l)),
      (e: Error) => alive && setStandings({ kind: "failed", why: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [caps, acts.reads, tick]);

  // the rules' own questions, gathered, where the engine serves them
  useEffect(() => {
    if (!asks) {
      setQlist(ready(null));
      return;
    }
    let alive = true;
    questions.list({}).then(
      (l) => alive && setQlist(ready(l)),
      (e: Error) => alive && setQlist({ kind: "failed", why: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [caps, asks, tick]);

  useEffect(() => {
    if (!readsCampaigns) {
      setList(ready([]));
      return;
    }
    let alive = true;
    campaigns.list().then(
      (l) => alive && setList(ready(l)),
      (e: Error) => alive && setList({ kind: "failed", why: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [caps, readsCampaigns, tick]);

  // the person's own share of each open campaign they read in, one small read each
  const listed = list.kind === "ready" ? list.value : null;
  useEffect(() => {
    if (!listed || !served(caps, MINE)) return;
    let alive = true;
    const asked = listed.filter((c) => c.status === "open" && (ownCampaign(caps, c) || rateRefusal(caps, c) === null)).slice(0, SHARES_READ);
    Promise.all(asked.map((c) => campaigns.mine(c.id, { limit: 1 }).then((m) => [c.id, m.count] as const, () => null))).then((got) => {
      if (!alive) return;
      const out: Record<number, number> = {};
      for (const g of got) if (g) out[g[0]] = g[1];
      setMine(out);
    });
    return () => {
      alive = false;
    };
  }, [caps, listed]);

  useEffect(() => {
    if (!check) return;
    let alive = true;
    Promise.all([catalog.runs(200), catalog.list()])
      .then(([r, c]) => {
        const run = r.runs.find((x) => x.id === check);
        if (alive) setChecking({ run: run ? runChoiceOf(run, c.pipelines) : null });
      })
      .catch(() => alive && setChecking({ run: null }));
    return () => {
      alive = false;
    };
  }, [check]);
  useEffect(() => {
    if (prefill) setMaking(prefill);
  }, [prefill?.source, prefill?.from, prefill?.job, prefill?.limit, prefill?.cohort]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = () => {
    if (location.hash.includes("?")) history.replaceState(null, "", href("review"));
  };
  const loads: Load<unknown>[] = [summary, standings, qlist, list];
  const since = loads.reduce<number | null>((s, l) => (l.kind === "loading" ? Math.min(s ?? l.since, l.since) : s), null);
  const why = [
    summary.kind === "failed" ? `what waits could not be read: ${summary.why}` : null,
    standings.kind === "failed" ? `the proposals could not be read: ${standings.why}` : null,
    qlist.kind === "failed" ? `the questions could not be read: ${qlist.why}` : null,
    list.kind === "failed" ? `the campaigns could not be read: ${list.why}` : null,
  ].filter((w): w is string => w !== null);
  return (
    <WorkBody
      caps={caps}
      summary={summary.kind === "ready" ? summary.value : null}
      standings={standings.kind === "ready" ? standings.value : null}
      qlist={qlist.kind === "ready" ? qlist.value : null}
      list={listed}
      mine={mine}
      since={since}
      why={why}
      said={follow ? followLine(follow.s, follow.resort, followed) : said}
      onMake={() => setMaking({ source: "selection", from: "" })}
      onCommit={acts.commit ? setCommitting : undefined}
      onRead={acts.campaign ? setReading : undefined}
    >
      {making && (
        <MakeDialog
          caps={caps}
          prefill={making}
          taken={listed ? listed.map((c) => c.name) : []}
          onClose={() => {
            setMaking(null);
            leave();
          }}
          onCheck={checkServed(caps) && makeCheckRefusal(caps) === null ? () => (setMaking(null), setChecking({ run: null })) : undefined}
        />
      )}
      {checking && (
        <NewCheck
          caps={caps}
          run={checking.run}
          onClose={() => {
            setChecking(null);
            leave();
          }}
        />
      )}
      {committing && (
        <CommitStandingDialog
          s={committing}
          onClose={() => setCommitting(null)}
          onDone={(answer) => {
            const s = committing;
            setCommitting(null);
            const resort = resortOf(answer);
            if (resort.job !== null) {
              setSaid(null);
              setFollow({ s, resort });
            } else {
              setFollow(null);
              setSaid(committedLine(s, answer));
            }
            setTick((x) => x + 1);
          }}
        />
      )}
      {reading && <RestCampaignDialog s={reading} onClose={() => setReading(null)} />}
    </WorkBody>
  );
}

export interface WorkBodyProps {
  caps: Capabilities;
  /** What waits, by the engine's kind; null for a person who does not review, or while it is read. */
  summary: ReviewSummary | null;
  /** What models proposed; null where the engine does not count them, or while it is read. */
  standings?: readonly Standing[] | null;
  /** The rules' own questions; null where the engine does not gather them, or while they are read. */
  qlist?: QuestionList | null;
  list: readonly Campaign[] | null;
  /** The person's own answers standing, by campaign. */
  mine?: Record<number, number>;
  since?: number | null;
  why?: string[];
  said?: string | null;
  now?: number;
  onMake: () => void;
  /** Commit a model's sure answers; absent where the person may not. */
  onCommit?: (s: Standing) => void;
  /** Read a model's unsure answers in a campaign of one's own; absent where the person may not. */
  onRead?: (s: Standing) => void;
  children?: React.ReactNode;
}

/** The page as it draws from what it read: each band once its own reading landed, none while it has nothing. */
export function WorkBody({ caps, summary, standings = null, qlist = null, list, mine = {}, since = null, why = [], said = null, now = Date.now(), onMake, onCommit, onRead, children }: WorkBodyProps) {
  const reviewer = reviews(caps);
  const making = makeRefusal(caps);
  const proposed = useMemo(() => sortStandings(standings ?? []).filter((s) => s.staged.stacks > 0 || s.below.stacks > 0), [standings]);
  const axes = useMemo(() => (reviewer ? axisCards(qlist, summary) : []), [reviewer, qlist, summary]);
  const cards = useMemo(() => campaignBand(caps, list), [caps, list]);
  // the fold only where something is counted; Main scans alone has its page in the side
  const also = useMemo(() => {
    const rows = reviewer && summary ? alsoRows(caps, summary, standings !== null, qlist) : [];
    return rows.some((r) => (r.count ?? 0) > 0) ? rows : [];
  }, [caps, reviewer, summary, standings, qlist]);
  const closed = (list ?? []).filter((c) => c.status === "closed");
  const empty = since === null && proposed.length === 0 && axes.length === 0 && cards.length === 0 && also.length === 0;
  return (
    <section className="data review work">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Review</span>
          <h1>Review</h1>
        </div>
        {making === null && (
          <button type="button" className="button" onClick={onMake}>
            <Icon name="plus" />
            Make a campaign
          </button>
        )}
      </div>
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {since !== null && <Wait phase="reading what waits" since={since ?? now} size="panel" />}
      {why.map((w) => (
        <p key={w} className="warn">
          {w.charAt(0).toUpperCase() + w.slice(1)}
        </p>
      ))}
      {proposed.length > 0 && (
        <section className="rv-band" aria-label="Proposed by models">
          <div className="rv-band-head">
            <span className="eyebrow">Proposed by models</span>
          </div>
          <div className="rv-grid">
            {proposed.map((s) => (
              <article key={`${s.model.id}|${s.axis}`} className="rv-card proposed" aria-label={standingTitle(s)}>
                <span className="rv-title">{standingTitle(s)}</span>
                <span className="rv-sub path">{modelSub(s)}</span>
                <div className="rv-big">
                  <b>{n(s.staged.stacks)}</b>
                  <span>proposed</span>
                </div>
                <span className="rv-meta">{standingMeta(s)}</span>
                {((onCommit && s.commit.stacks > 0) || (onRead && s.below.stacks > 0)) && (
                  <div className="rv-acts">
                    {onCommit && s.commit.stacks > 0 && (
                      <button type="button" className="button" onClick={() => onCommit(s)}>
                        Commit {n(s.commit.stacks)}
                      </button>
                    )}
                    {onRead && s.below.stacks > 0 && (
                      <button type="button" className={onCommit && s.commit.stacks > 0 ? "button secondary" : "button"} onClick={() => onRead(s)}>
                        Read the {n(s.below.stacks)}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <a className="rv-quiet" href={href("review", "proposals")}>
            Value by value
          </a>
        </section>
      )}
      {axes.length > 0 && (
        <section className="rv-band" aria-label="Scans to answer">
          <div className="rv-band-head">
            <span className="eyebrow">Scans to answer</span>
          </div>
          <div className="rv-grid">
            {axes.map((a) => (
              <article key={a.axis} className="rv-card answer" aria-label={a.title}>
                <span className="rv-title">{a.title}</span>
                <div className="rv-big">
                  <b>{n(a.scans)}</b>
                  <span>{a.scans === 1 ? "scan" : "scans"}</span>
                </div>
                <span className="rv-meta">{a.meta}</span>
                <div className="rv-acts">
                  <a className="button" href={a.href}>
                    Answer
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {cards.length > 0 && (
        <section className="rv-band" aria-label="Campaigns">
          <div className="rv-band-head">
            <span className="eyebrow">Campaigns</span>
          </div>
          <div className="rv-grid campaigns">
            {cards.map((c) => (
              <CampaignTile key={c.key} card={c} share={c.kind === "campaign" ? shareWords(mine[c.campaign.id], c.campaign) : null} />
            ))}
          </div>
        </section>
      )}
      {closed.length > 0 && (
        <details className="retired rv-closed">
          <summary className="meta">
            {closed.length} closed {closed.length === 1 ? "campaign keeps" : "campaigns keep"} every answer
          </summary>
          <ul className="rv-rows">
            {closed.map((c) => (
              <li key={c.id} className="rv-row">
                <span className="rv-row-what">
                  <a href={href("review", "campaigns", String(c.id))}>{c.name}</a>
                  <span className="meta">{c.closed_at ? `closed ${c.closed_at.slice(0, 10)}` : "closed"}</span>
                </span>
                <StateBar counts={c.counts} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {also.length > 0 && (
        <details className="rv-fold">
          <summary>{alsoSummary(also)}</summary>
          <ul className="rv-rows">
            {also.map((r) => (
              <li key={r.key} className="rv-row">
                <span className="rv-row-what">{r.words}</span>
                <span className="rv-row-count">{r.count !== null && <b>{n(r.count)}</b>}</span>
                <a className="button secondary small" href={r.href}>
                  Open
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {empty && why.length === 0 && <p className="meta">Nothing waits.</p>}
      {children}
    </section>
  );
}

/** One campaign's card: its name, its line, its items by state, and the one act. */
function CampaignTile({ card: c, share }: { card: CampaignCard; share: string | null }) {
  const camp = c.campaign;
  return (
    <article className={`rv-card ${c.kind}`} aria-label={camp.name}>
      <a className="rv-title" href={href("review", "campaigns", String(camp.id))}>
        {camp.name}
      </a>
      <span className="rv-meta">
        {c.meta}
        {share ? ` · ${share}` : ""}
      </span>
      <StateBar counts={camp.counts} />
      <div className="rv-acts">
        <a className="button" href={c.href}>
          {c.act}
        </a>
      </div>
    </article>
  );
}
