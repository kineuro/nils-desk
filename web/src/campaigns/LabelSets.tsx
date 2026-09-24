// SPDX-License-Identifier: AGPL-3.0-only
// Label sets (record 42 S7), a tab of Campaigns: decisions or a campaign's
// answers as labelled data, each version in files of its own with the sha256
// of its labels, the handle it pinned and whether it may train a model. One
// set shows its provenance and its labels as written.

import { useEffect, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { campaigns, refused as refusedWords, sourceWords, type LabelSet } from "./client";
import { Tabs } from "./parts";

const n = (v: number) => v.toLocaleString("en-US");
const ROWS = 200;

type Load<T> = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: T };

export function LabelSetsPage({ caps }: { caps: Capabilities }) {
  const [load, setLoad] = useState<Load<LabelSet[]>>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    campaigns
      .labelSets()
      .then((value) => setLoad({ kind: "ready", value }))
      .catch((e: unknown) => setLoad({ kind: "failed", why: refusedWords(e) }));
  }, []);
  return <LabelSetsBody caps={caps} sets={load.kind === "ready" ? load.value : null} why={load.kind === "failed" ? load.why : null} since={load.kind === "loading" ? load.since : Date.now()} />;
}

/** Where a set's labels came from, in a few words. */
export function setSource(s: LabelSet): string {
  const src = s.source ?? {};
  if (typeof src.name === "string" && s.campaign_id !== null) return `campaign ${src.name}${typeof src.of === "string" ? ` · ${src.of}` : ""}`;
  if (typeof src.selection === "string" || src.handle !== undefined || src.review) return sourceWords(src);
  return s.what ? `decisions on ${s.what}` : "decisions";
}

export function LabelSetsBody({ caps, sets, why, since }: { caps: Capabilities; sets: LabelSet[] | null; why: string | null; since: number }) {
  return (
    <section className="data label-sets">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Campaigns</span>
          <h1>Label sets</h1>
          <p className="lede">Labels with their provenance and a digest.</p>
        </div>
      </div>
      <Tabs caps={caps} on="label-sets" />
      {sets === null && !why && <Wait phase="reading the label sets" since={since} size="panel" />}
      {why && <p className="warn">The label sets could not be read: {why}</p>}
      {sets !== null && sets.length === 0 && <p className="empty">No label set yet. A campaign&apos;s Export writes one.</p>}
      {sets !== null && sets.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Set</th>
                <th>From</th>
                <th className="num">Rows</th>
                <th>Training</th>
                <th>Made</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a href={href("campaigns", "label-sets", String(s.id))}>
                      {s.name} v{s.version}
                    </a>
                    <div className="meta">
                      {s.kind}
                      {s.what ? ` · ${s.what}` : ""}
                    </div>
                  </td>
                  <td className="meta">{setSource(s)}</td>
                  <td className="num">{n(s.rows)}</td>
                  <td>{s.sealed ? <span className="tag blocked">sealed</span> : <span className="tag">{s.training}</span>}</td>
                  <td className="meta nowrap">
                    {s.created_by} · {day(s.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Says head="What a label set is">
        One version of a set of labels, written into an export place in files of its own: labels.tsv, in a canonical order so the same state gives the same sha256, and provenance.json with the handle it
        pinned, the epoch and the pack. A set holding any item of a sample sealed for certification is sealed, and never trains a model.
      </Says>
    </section>
  );
}

export function LabelSetPage({ caps, id }: { caps: Capabilities; id: number }) {
  const [load, setLoad] = useState<Load<LabelSet>>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    campaigns
      .labelSet(id)
      .then((value) => setLoad({ kind: "ready", value }))
      .catch((e: unknown) => setLoad({ kind: "failed", why: refusedWords(e) }));
  }, [id]);
  if (load.kind === "loading") return <Wait phase="reading the label set" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The label set could not be read: {load.why}</p>;
  return <LabelSetBody caps={caps} set={load.value} />;
}

/** The rows of labels.tsv: its header, then its lines. */
export function tsvRows(text: string | undefined): { head: string[]; rows: string[][] } {
  const lines = (text ?? "").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { head: [], rows: [] };
  return { head: lines[0].split("\t"), rows: lines.slice(1).map((l) => l.split("\t")) };
}

export function LabelSetBody({ caps, set: s }: { caps: Capabilities; set: LabelSet }) {
  const tsv = tsvRows(s.files?.["labels.tsv"]);
  // the empty columns of every row say nothing here
  const keep = tsv.head.map((_, i) => tsv.rows.some((r) => (r[i] ?? "") !== ""));
  const prov = (s.files?.["provenance.json"] ?? null) as Json | null;
  return (
    <section className="data label-set">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("campaigns", "label-sets")}>Label sets</a>
          </span>
          <h1>
            {s.name} v{s.version}
          </h1>
          <p className="lede">
            {setSource(s)} {s.sealed ? <span className="tag blocked">sealed: never training data</span> : <span className="tag ok">training {s.training}</span>}
          </p>
        </div>
      </div>
      <Tabs caps={caps} on="label-sets" />
      <Values
        cells={[
          { k: "rows", v: n(s.rows) },
          { k: "kind", v: s.kind },
          { k: "what", v: s.what ?? "" },
          { k: "epoch", v: String(s.epoch) },
        ]}
      />
      <dl className="facts">
        <div className="facts-pair">
          <dt>sha256</dt>
          <dd className="mono">{s.digest}</dd>
        </div>
        {s.campaign_id !== null && (
          <div className="facts-pair">
            <dt>campaign</dt>
            <dd>
              <a href={href("campaigns", String(s.campaign_id))}>{typeof s.source?.name === "string" ? s.source.name : `campaign ${s.campaign_id}`}</a>
            </dd>
          </div>
        )}
        {s.handle_id !== null && (
          <div className="facts-pair">
            <dt>handle</dt>
            <dd>{s.handle_id}</dd>
          </div>
        )}
        <div className="facts-pair">
          <dt>pack</dt>
          <dd>
            {s.pack_version ?? ""}
            {s.scheme_digest ? ` · scheme ${s.scheme_digest.slice(0, 12)}` : ""}
          </dd>
        </div>
        <div className="facts-pair">
          <dt>written</dt>
          <dd>
            {s.created_by} · {day(s.created_at)}
          </dd>
        </div>
        {s.path && (
          <div className="facts-pair">
            <dt>where</dt>
            <dd className="mono">{s.path}</dd>
          </div>
        )}
      </dl>
      {!s.files && (
        <p className="meta">
          <Icon name="lock" /> Its files hold a person&apos;s words, read with identifying details; at this detail the set shows its counts only.
        </p>
      )}
      {tsv.head.length > 0 && (
        <>
          <h2>labels.tsv</h2>
          <div className="table-wrap">
            <table className="thin labels">
              <thead>
                <tr>
                  {tsv.head.map((h, i) => (keep[i] ? <th key={h}>{h.replace(/_/g, " ")}</th> : null))}
                </tr>
              </thead>
              <tbody>
                {tsv.rows.slice(0, ROWS).map((r, j) => (
                  <tr key={j}>{r.map((v, i) => (keep[i] ? <td key={i}>{v}</td> : null))}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {tsv.rows.length > ROWS && <p className="meta">The first {n(ROWS)} of {n(tsv.rows.length)} rows.</p>}
        </>
      )}
      {prov && (
        <details className="says">
          <summary>provenance.json</summary>
          <pre className="mono">{JSON.stringify(prov, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
