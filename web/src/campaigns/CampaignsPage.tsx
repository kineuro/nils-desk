// SPDX-License-Identifier: AGPL-3.0-only
// The Campaigns section (record 45 S3, study A3): the list, one campaign,
// the rating workspace, and the label sets as a tab. Addresses:
//   #campaigns                  the list (?make=selection|handle|review&from= opens the make dialog)
//   #campaigns/<id>             one campaign
//   #campaigns/<id>/rate        the rating workspace
//   #campaigns/<id>/adjudicate  the adjudicator's view
//   #campaigns/label-sets[/<n>] the label sets, or one

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Says } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { CampaignPage } from "./CampaignPage";
import { StateBar, Tabs } from "./parts";
import {
  adjudicatorHas,
  campaigns,
  KIND_WORDS,
  makeRefusal,
  prefillOf,
  questionWords,
  rateRefusal,
  sourceWords,
  agreementWords,
  type Campaign,
  type SourceKind,
} from "./client";
import { LabelSetPage, LabelSetsPage } from "./LabelSets";
import { MakeDialog } from "./MakeCampaign";
import { Workspace } from "./Workspace";
import "./campaigns.css";

export function CampaignsPage({ caps, page, arg, query }: { caps: Capabilities; page: string | null; arg: string | null; query?: Record<string, string> }) {
  if (page === "label-sets") return arg && /^\d+$/u.test(arg) ? <LabelSetPage caps={caps} id={Number(arg)} /> : <LabelSetsPage caps={caps} />;
  if (page && /^\d+$/u.test(page)) {
    if (arg === "rate") return <Workspace key={`${page}/rate`} caps={caps} id={page} role="rater" />;
    if (arg === "adjudicate") return <Workspace key={`${page}/adj`} caps={caps} id={page} role="adjudicator" />;
    return <CampaignPage caps={caps} id={page} missing={query?.missing && /^\d+$/u.test(query.missing) ? Number(query.missing) : null} />;
  }
  return <ListPage caps={caps} prefill={prefillOf(query)} />;
}

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Campaign[] };

function ListPage({ caps, prefill }: { caps: Capabilities; prefill: { source: SourceKind; from: string } | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [making, setMaking] = useState<{ source: SourceKind; from: string } | null>(prefill);
  useEffect(() => {
    campaigns
      .list()
      .then((list) => setLoad({ kind: "ready", list }))
      .catch((e: Error) => setLoad({ kind: "failed", why: e.message }));
  }, []);
  useEffect(() => {
    if (prefill) setMaking(prefill);
  }, [prefill?.source, prefill?.from]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <CampaignsBody caps={caps} list={load.kind === "ready" ? load.list : null} since={load.kind === "loading" ? load.since : null} why={load.kind === "failed" ? load.why : null} onMake={() => setMaking({ source: "selection", from: "" })}>
      {making && (
        <MakeDialog
          caps={caps}
          prefill={making}
          taken={load.kind === "ready" ? load.list.map((c) => c.name) : []}
          onClose={() => {
            setMaking(null);
            if (location.hash.includes("?")) history.replaceState(null, "", href("campaigns"));
          }}
        />
      )}
    </CampaignsBody>
  );
}

export interface CampaignsBodyProps {
  caps: Capabilities;
  list: readonly Campaign[] | null;
  since?: number | null;
  why: string | null;
  now?: number;
  onMake: () => void;
  children?: React.ReactNode;
}

/** The list as it draws from what it read. */
export function CampaignsBody({ caps, list, since = null, why, now = Date.now(), onMake, children }: CampaignsBodyProps) {
  const making = makeRefusal(caps);
  const open = (list ?? []).filter((c) => c.status !== "closed");
  const closed = (list ?? []).filter((c) => c.status === "closed");
  return (
    <section className="data campaigns">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Campaigns</span>
          <h1>Campaigns</h1>
          <p className="lede">One question, several raters, one decision per item.</p>
        </div>
        {making === null && (
          <button type="button" className="button" onClick={onMake}>
            <Icon name="plus" />
            Make a campaign
          </button>
        )}
      </div>
      <Tabs caps={caps} on="campaigns" />
      {list === null && !why && <Wait phase="reading the campaigns" since={since ?? now} size="panel" />}
      {why && <p className="warn">The campaigns could not be read: {why}</p>}
      {list !== null && list.length === 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">No campaign yet.</p>
            <p className="note-detail">{making ?? "Make one from a saved selection, a result, or what waits on Review."}</p>
          </div>
        </div>
      )}
      {open.length > 0 && <CampaignTable caps={caps} list={open} />}
      {closed.length > 0 && (
        <details className="retired">
          <summary className="meta">
            {closed.length} closed {closed.length === 1 ? "campaign keeps" : "campaigns keep"} every answer
          </summary>
          <CampaignTable caps={caps} list={closed} />
        </details>
      )}
      <Says head="What a campaign is">
        A frozen list of items, stacks or sessions, and one question asked of each. Raters claim an item under a lease and answer it; nobody rates the same item twice. Where they disagree an
        adjudicator settles it. Closing writes one decision per item through Review, and every answer stays.
      </Says>
      {children}
    </section>
  );
}

function CampaignTable({ caps, list }: { caps: Capabilities; list: readonly Campaign[] }) {
  return (
    <div className="table-wrap">
      <table className="thin campaigns-list">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Question</th>
            <th>Source</th>
            <th>Items</th>
            <th>Agreement</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td>
                <a href={href("campaigns", String(c.id))}>{c.name}</a>
                <div className="meta">
                  {c.grain} · {c.raters_per_item} {c.raters_per_item === 1 ? "rater" : "raters"} each
                  {c.status !== "open" && ` · ${c.status}`}
                </div>
              </td>
              <td>
                {KIND_WORDS[c.question.kind] ?? c.question.kind}
                <div className="meta">{questionWords(c.question)}</div>
              </td>
              <td className="meta">{sourceWords(c.source)}</td>
              <td>
                <StateBar counts={c.counts} />
              </td>
              <td className="meta nowrap">{c.agreement ? agreementWords(c.agreement) : "on its page"}</td>
              <td className="acts nowrap">
                {rateRefusal(caps, c) === null && (c.counts.items.open ?? 0) > 0 && (
                  <a className="button secondary" href={href("campaigns", String(c.id), "rate")}>
                    Rate
                  </a>
                )}
                {adjudicatorHas(caps, c) && (
                  <a className="button secondary" href={href("campaigns", String(c.id), "adjudicate")}>
                    Adjudicate
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
