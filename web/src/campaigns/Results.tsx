// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's Results view (record 55, ruling 35 (d)): what its raters
// answered, item by item, what was settled and what the close wrote, the
// agreement and the counts by value, and its label sets to download. Read
// from the engine's results door; blind as the answers are.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Icon } from "../ui/Icon";
import { Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { answerWords, campaigns, itemWords, kappa, pct, refused as refusedWords, stateWords, STATES, type Answer, type Campaign, type Item, type LabelSet } from "./client";
import { answerOf, byAxis, catchWords, downloads, nameOf, raterColumns, resultsDoor, resultsRefusal, type ResultAnswer, type ResultItem, type Results } from "./results";

const n = (v: number) => v.toLocaleString("en-US");
const ROWS = 200;

type Words = (i: Item) => (a: Pick<Answer, "value" | "form" | "derivative_id">) => string;
type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; r: Results };

/** The view as the campaign page shows it: the door read once, then the body. */
export function ResultsView({ caps, campaign: c, sets, words }: { caps: Capabilities; campaign: Campaign; sets: LabelSet[]; words?: Words }) {
  const refusal = resultsRefusal(caps, c);
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (refusal !== null) return;
    resultsDoor(c.id).then(
      (r) => setLoad({ kind: "ready", r }),
      (e: unknown) => setLoad({ kind: "failed", why: refusedWords(e) }),
    );
  }, [c.id, c.status, refusal]);
  if (refusal !== null) return <p className="meta">{refusal}</p>;
  if (load.kind === "loading") return <Wait phase="reading the results" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The results could not be read: {load.why}</p>;
  const download = (set: LabelSet, file: string) => {
    setSaid(null);
    campaigns
      .labelSet(set.id)
      .then((full) => {
        const text = full.files?.["labels.tsv"];
        if (typeof text !== "string") {
          setSaid(`${set.name} v${set.version}: its labels are not shown at this detail.`);
          return;
        }
        const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = file;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      })
      .catch((e: unknown) => setSaid(`${set.name} v${set.version}: ${refusedWords(e)}`));
  };
  return <ResultsBody results={load.r} sets={sets} words={words} said={said} onDownload={download} />;
}

/** The view as it draws from what the door answered. */
export function ResultsBody({ results: r, sets, words, said = null, onDownload }: { results: Results; sets: LabelSet[]; words?: Words; said?: string | null; onDownload?: (set: LabelSet, file: string) => void }) {
  const a = r.agreement;
  const cols = raterColumns(r);
  const rows = r.items.slice(0, ROWS);
  const closed = r.status === "closed";
  const wordsOf = (i: ResultItem) => (x: ResultAnswer) => (words ? words(i) : answerWords)({ value: x.value, form: x.form ?? null, derivative_id: x.derivative_id ?? null });
  const groups = byAxis(r.values);
  const files = downloads(sets);
  // record 58 P1: a verify campaign's catch rate beside the agreement, against the bar
  const caught = r.catch ?? null;
  const name = (rater: string) => nameOf(r, rater);
  const caughtBy = (rater: string) => {
    const p = caught?.per_rater.find((x) => x.rater === rater);
    return p ? catchWords(p) : "";
  };
  return (
    <div className="campaign-results">
      <Values
        cells={[
          { k: "settled", v: `${n(r.settled)} of ${n(r.count)}` },
          { k: "adjudicated", v: n(r.adjudicated) },
          { k: "exact", v: pct(a?.exact) },
          { k: "κ", v: kappa(a?.cohen_kappa ?? a?.fleiss_kappa), title: a?.cohen_kappa !== null && a?.cohen_kappa !== undefined ? "Cohen's kappa" : "Fleiss' kappa" },
          ...(caught ? [{ k: "caught", v: catchWords(caught), title: `planted values the readers did not accept; the bar is ${pct(caught.bar)}` }] : []),
          { k: "unsure", v: n(r.unsure) },
          ...(closed ? [{ k: r.closes_into === "pick" ? "picks" : "decisions", v: n(r.closes_into === "pick" ? r.picks : r.decisions) }] : []),
        ]}
      />
      {caught && r.below_bar && (
        <p className="warn catch-bar">
          <span className="tag caution">under the bar</span> Caught {pct(caught.rate)} of the planted values; the bar is {pct(caught.bar)}. This result does not stand alone.
        </p>
      )}
      {!r.named && <p className="meta">Raters by number.</p>}
      {groups.length > 0 && (
        <>
          <h2>By value</h2>
          <div className="table-wrap">
            <table className="thin results-values">
              <thead>
                <tr>
                  {groups.some((g) => g.axis !== null) && <th>Axis</th>}
                  <th>Value</th>
                  <th className="num">Answers</th>
                  <th className="num">Settled</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) =>
                  g.rows.map((v, k) => (
                    <tr key={`${g.axis ?? ""}/${v.value}`}>
                      {g.axis !== null && <td>{k === 0 ? g.axis : ""}</td>}
                      <td>{v.value}</td>
                      <td className="num">{n(v.answers)}</td>
                      <td className="num">{n(v.settled)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {r.raters.length > 0 && (
        <>
          <h2>By rater</h2>
          <div className="table-wrap">
            <table className="thin results-raters">
              <thead>
                <tr>
                  <th>Rater</th>
                  <th className="num">Answers</th>
                  <th className="num">Adjudications</th>
                  <th className="num">Unsure</th>
                  {caught && <th className="num">Caught</th>}
                </tr>
              </thead>
              <tbody>
                {r.raters.map((x) => (
                  <tr key={x.rater}>
                    <td title={x.rater}>{name(x.rater)}</td>
                    <td className="num">{n(x.answers)}</td>
                    <td className="num">{n(x.adjudications)}</td>
                    <td className="num">{n(x.unsure)}</td>
                    {caught && <td className="num">{caughtBy(x.rater)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h2>By item</h2>
      <div className="table-wrap">
        <table className="thin results-items">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Item</th>
              {cols.map((c) => (
                <th key={c} title={c}>
                  {name(c)}
                </th>
              ))}
              <th>Adjudication</th>
              <th>Settled</th>
              <th>{closed ? "Written" : "State"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <ResultRow key={i.id} item={i} cols={cols} words={wordsOf(i)} name={name} />
            ))}
          </tbody>
        </table>
      </div>
      {r.items.length > ROWS && <p className="meta">The first {n(ROWS)} of {n(r.items.length)} are listed.</p>}
      <h2>Labels</h2>
      {files.length === 0 ? (
        <p className="meta">No label set yet. Export writes one.</p>
      ) : (
        <div className="table-wrap">
          <table className="thin results-labels">
            <thead>
              <tr>
                <th>Set</th>
                <th>Of</th>
                <th className="num">Rows</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map(({ set, file }) => (
                <tr key={set.id}>
                  <td>
                    {set.name} v{set.version}
                  </td>
                  <td>{set.kind}</td>
                  <td className="num">{n(set.rows)}</td>
                  <td className="num">
                    <button type="button" className="button quiet small" title={file} disabled={!onDownload} onClick={() => onDownload?.(set, file)}>
                      <Icon name="download" />
                      labels.tsv
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {said && <p className="warn">{said}</p>}
    </div>
  );
}

function ResultRow({ item: i, cols, words, name }: { item: ResultItem; cols: string[]; words: (a: ResultAnswer) => string; name: (rater: string) => string }) {
  const tone = STATES.find((s) => s.state === i.state)?.tone ?? "";
  const judged = i.answers.filter((a) => a.role === "adjudicator");
  const settled = i.outcome && ["agreed", "adjudicated", "resolved"].includes(i.state);
  const decisions = [...new Set([...(i.decision_id !== null ? [i.decision_id] : []), ...Object.values(i.outcome?.decisions ?? {})])];
  return (
    <tr>
      <td className="num">{i.position + 1}</td>
      <td>{itemWords(i)}</td>
      {cols.map((c) => {
        const x = answerOf(i, c);
        return (
          <td key={c} className={x?.unsure ? "unsure" : undefined} title={x?.unsure ? "marked unsure" : (x?.why ?? undefined)}>
            {x ? `${words(x)}${x.unsure ? " ?" : ""}` : ""}
          </td>
        );
      })}
      <td>{judged.map((x) => `${name(x.rater)}: ${words(x)}`).join(" · ")}</td>
      <td>{settled ? words({ id: 0, rater: "", role: "rater", round: 0, value: i.outcome?.value, form: i.outcome?.form ?? null, derivative_id: i.outcome?.derivative_id ?? null }) : ""}</td>
      <td>
        {i.state === "refused" ? (
          <span className="warn">Not written: {i.refused?.why ?? "the close refused it"}</span>
        ) : decisions.length > 0 ? (
          `decision ${decisions.join(", ")}`
        ) : i.pick_id !== null ? (
          `pick ${i.pick_id}`
        ) : (
          <span className={tone ? `tag ${tone}` : "tag"}>{stateWords(i.state)}</span>
        )}
      </td>
    </tr>
  );
}
