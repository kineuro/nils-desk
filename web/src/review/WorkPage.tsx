// SPDX-License-Identifier: AGPL-3.0-only
// Review's first page (Wave 7a, record 55 H3; spec 13.2): one list of work.
// The machine's open questions by kind and the campaigns, each under the job
// a person does, with its count and the one act that starts it. It reads the
// review summary only for a person who reviews; a rater who holds only
// campaigns:* finds their campaigns here, and the page never reads the queue
// for them. The make dialog and New check open from it, as the Campaigns
// list's did: #review/campaigns?make=selection|handle|review&from= and
// #review/campaigns?make=check[&run=<id>].

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { campaigns, makeRefusal, MINE, ownCampaign, prefillOf, rateRefusal, type Campaign, type Prefill } from "../campaigns/client";
import { MakeDialog } from "../campaigns/MakeCampaign";
import { NewCheck, runChoiceOf, type RunChoice } from "../campaigns/NewCheck";
import { checkServed, makeCheckRefusal } from "../campaigns/check";
import { StateBar } from "../campaigns/parts";
import { catalog } from "../ops/catalog";
import { reviews } from "../home/placeholders";
import { review, type ReviewSummary } from "./client";
import { heldCount, queuedCount, shareWords, workList, type WorkRow } from "./work";
import "../campaigns/campaigns.css";
import "./work.css";

const n = (v: number) => v.toLocaleString("en-US");

/** The most campaigns whose own share is read, one small read each. */
const SHARES_READ = 30;

type Load<T> = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: T };

export function WorkPage({ caps, query }: { caps: Capabilities; query?: Record<string, string> }) {
  const reviewer = reviews(caps);
  const readsCampaigns = may(caps, "campaigns:see") && served(caps, "GET /api/campaigns");
  const [summary, setSummary] = useState<Load<ReviewSummary | null>>(() => ({ kind: "loading", since: Date.now() }));
  const [list, setList] = useState<Load<Campaign[]>>(() => ({ kind: "loading", since: Date.now() }));
  const [mine, setMine] = useState<Record<number, number>>({});
  const prefill = prefillOf(query);
  const check = query?.make === "check" ? (query.run && /^\d+$/u.test(query.run) ? Number(query.run) : 0) : null;
  const [making, setMaking] = useState<Prefill | null>(prefill);
  const [checking, setChecking] = useState<{ run: RunChoice | null } | null>(check === 0 ? { run: null } : null);

  // the machine's questions, for a person who reviews; never read for a rater
  useEffect(() => {
    if (!reviewer) {
      setSummary({ kind: "ready", value: null });
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
      (s) => alive && setSummary({ kind: "ready", value: s }),
      (e: Error) => alive && setSummary({ kind: "failed", why: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [caps, reviewer]);

  useEffect(() => {
    if (!readsCampaigns) {
      setList({ kind: "ready", value: [] });
      return;
    }
    let alive = true;
    campaigns.list().then(
      (l) => alive && setList({ kind: "ready", value: l }),
      (e: Error) => alive && setList({ kind: "failed", why: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [caps, readsCampaigns]);

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
  return (
    <WorkBody
      caps={caps}
      summary={summary.kind === "ready" ? summary.value : null}
      list={listed}
      mine={mine}
      since={summary.kind === "loading" ? summary.since : list.kind === "loading" ? list.since : null}
      why={[summary.kind === "failed" ? `the questions could not be read: ${summary.why}` : null, list.kind === "failed" ? `the campaigns could not be read: ${list.why}` : null].filter((w): w is string => w !== null)}
      onMake={() => setMaking({ source: "selection", from: "" })}
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
    </WorkBody>
  );
}

export interface WorkBodyProps {
  caps: Capabilities;
  /** The machine's questions by kind; null for a person who does not review, or while it is read. */
  summary: ReviewSummary | null;
  list: readonly Campaign[] | null;
  /** The person's own answers standing, by campaign. */
  mine?: Record<number, number>;
  since?: number | null;
  why?: string[];
  now?: number;
  onMake: () => void;
  children?: React.ReactNode;
}

/** The list as it draws from what it read. */
export function WorkBody({ caps, summary, list, mine = {}, since = null, why = [], now = Date.now(), onMake, children }: WorkBodyProps) {
  const reviewer = reviews(caps);
  const making = makeRefusal(caps);
  const groups = useMemo(() => workList(caps, summary, list), [caps, summary, list]);
  const closed = (list ?? []).filter((c) => c.status === "closed");
  const held = heldCount(summary);
  const queued = queuedCount(summary);
  return (
    <section className="data review work">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Review</span>
          <h1>Work</h1>
          <p className="lede">{reviewer ? "What the machine asks, and the campaigns people read." : "The campaigns you read."}</p>
        </div>
        {making === null && (
          <button type="button" className="button" onClick={onMake}>
            <Icon name="plus" />
            Make a campaign
          </button>
        )}
      </div>
      <div className="chips pages">
        <a className="opt on" href={href("review")} aria-current="page">
          Work
        </a>
        {reviewer && (
          <a className="opt" href={href("review", "questions")}>
            Questions
            {summary && <b>{n(queued)}</b>}
          </a>
        )}
        {reviewer && served(caps, "GET /api/review/rounds") && (
          <a className="opt" href={href("review", "rounds")}>
            Rounds
          </a>
        )}
        {may(caps, "campaigns:see") && served(caps, "GET /api/label-sets") && (
          <a className="opt" href={href("review", "label-sets")}>
            Label sets
          </a>
        )}
      </div>
      {since !== null && <Wait phase="reading the work" since={since ?? now} size="panel" />}
      {why.map((w) => (
        <p key={w} className="warn">
          {w.charAt(0).toUpperCase() + w.slice(1)}
        </p>
      ))}
      {since === null &&
        groups.map((g) => (
          <section key={g.job} className={`work-group job-${g.job}`} aria-label={g.title}>
            <div className="section-head">
              <h2>{g.title}</h2>
              {g.waiting > 0 && <span className="tag">{n(g.waiting)}</span>}
              <span className="meta">{g.line}</span>
            </div>
            {g.rows.length === 0 ? <p className="meta work-empty">Nothing waits.</p> : <WorkRows rows={g.rows} mine={mine} />}
            {g.job === "answer" && held > 0 && (
              <p className="meta work-held">
                {n(held)} {held === 1 ? "question is" : "questions are"} held by campaigns, answered there.
              </p>
            )}
          </section>
        ))}
      {closed.length > 0 && (
        <details className="retired">
          <summary className="meta">
            {closed.length} closed {closed.length === 1 ? "campaign keeps" : "campaigns keep"} every answer
          </summary>
          <ul className="work-rows">
            {closed.map((c) => (
              <li key={c.id} className="work-row from-closed">
                <span className="work-what">
                  <a className="work-title" href={href("review", "campaigns", String(c.id))}>
                    {c.name}
                  </a>
                  <span className="meta">{c.closed_at ? `closed ${c.closed_at.slice(0, 10)}` : "closed"}</span>
                </span>
                <StateBar counts={c.counts} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {children}
    </section>
  );
}

function WorkRows({ rows, mine }: { rows: readonly WorkRow[]; mine: Record<number, number> }) {
  return (
    <ul className="work-rows">
      {rows.map((r) => {
        const share = r.campaign && r.from === "campaign" ? shareWords(mine[r.campaign.id], r.campaign) : null;
        return (
          <li key={r.key} className={`work-row from-${r.from}`}>
            <span className="work-what">
              <a className="work-title" href={r.href}>
                {r.title}
              </a>
              <span className="meta">
                {r.from === "campaign" ? "campaign · " : r.from === "adjudication" ? "adjudication · " : ""}
                {r.what}
                {share ? ` · ${share}` : ""}
              </span>
            </span>
            {r.campaign && r.from === "campaign" ? (
              <StateBar counts={r.campaign.counts} />
            ) : (
              <span className="work-count">{r.count !== null ? <b>{n(r.count)}</b> : null}</span>
            )}
            <span className="work-act">
              {r.act && (
                <a className="button secondary small" href={r.href}>
                  {r.act}
                </a>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
