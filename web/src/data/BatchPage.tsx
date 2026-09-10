// SPDX-License-Identifier: AGPL-3.0-only
// One batch's page (Wave 5 section 8.1): a stage strip, walked, digested,
// classified, reviewed, with counts under each, the pack version, the
// quarantine list by reason, and the jobs that did each stage. A digest, a
// reclassification and a session rebuild are queued from here.

import { useCallback, useEffect, useState } from "react";
import type { JobRow, Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { type Batch, data, ops, type ReviewItem } from "../ops/client";
import { usePageContext } from "../Rail";
import { door as served, holds } from "../sections";
import { Empty } from "../ui/Empty";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { byReason, type Stage, stages } from "./stages";

export function BatchPage({ caps, id }: { caps: Capabilities; id: number }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [files, setFiles] = useState<Json[]>([]);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const [queued, setQueued] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [pack, setPack] = useState("");
  const operator = holds(caps, "operator");
  const load = useCallback(() => {
    setSince(Date.now());
    data
      .batch(id)
      .then((b) => {
        setBatch(b);
        setFailed(null);
      })
      .catch((e: unknown) => setFailed(classify(e)));
    if (served(caps, "GET /api/jobs") && holds(caps, "reviewer")) ops.jobs(true, 200).then((j) => setJobs(j.jobs)).catch(() => setJobs([]));
    if (served(caps, "GET /api/review") && holds(caps, "reviewer")) ops.review(undefined, undefined, 200).then((r) => setReview(r.items.filter((i) => i.scope === "batch" && (i.ref as Json | null)?.batch_id === id))).catch(() => setReview([]));
    data.quarantine(id, undefined, 500).then((q) => setFiles(q.files)).catch(() => setFiles([]));
  }, [caps, id]);
  useEffect(() => {
    load();
  }, [load]);
  const jobIds = jobs.filter((j) => batch && j.started_at >= batch.started_at).map((j) => j.id).slice(0, 32);
  usePageContext({ page: { kind: "batch", id: String(id) }, job_ids: jobIds, pack: caps.engine?.packs[0] ? { name: caps.engine.packs[0].name, version: caps.engine.packs[0].version } : undefined });
  if (failed) return <Failure failed={failed} action={{ label: "Try again", onClick: load }} />;
  if (!batch) return <Wait phase="reading the batch" since={since} size="panel" />;
  const strip = stages(batch, jobs, review);
  const reasons = byReason(files);
  const queue = (command: string[], name: string) =>
    ops
      .enqueue(command, name)
      .then((j) => {
        setQueued(`queued as job ${j.job}`);
        load();
      })
      .catch((e: Error) => setWhy(e.message));
  return (
    <div className="batch">
      <dl className="facts">
        <dt>name</dt>
        <dd>{batch.name}</dd>
        <dt>state</dt>
        <dd>{batch.state}</dd>
        <dt>started</dt>
        <dd>{batch.started_at}</dd>
        {batch.finished_at && (
          <>
            <dt>finished</dt>
            <dd>{batch.finished_at}</dd>
          </>
        )}
        {batch.epoch_after !== null && (
          <>
            <dt>epoch after</dt>
            <dd>{batch.epoch_after}</dd>
          </>
        )}
        {caps.engine?.packs[0] && (
          <>
            <dt>pack</dt>
            <dd>
              <a href={`#pack/${caps.engine.packs[0].name}`}>{caps.engine.packs[0].name} {caps.engine.packs[0].version}</a>
            </dd>
          </>
        )}
      </dl>

      <ol className="strip" aria-label="stages">
        {strip.map((s) => (
          <StageCard key={s.name} stage={s} />
        ))}
      </ol>

      {operator && (
        <div className="panel">
          <h3>Queue</h3>
          <div className="row">
            <button type="button" onClick={() => queue(["digest", "--batch", String(id)], `digest batch ${id}`)}>Digest again</button>
            <label>
              pack <input value={pack} onChange={(e) => setPack(e.target.value)} placeholder={caps.engine?.packs[0]?.name ?? "mri"} size={8} />
            </label>
            <button type="button" onClick={() => queue(["classify", "--batch", String(id), ...(pack.trim() ? ["--pack", pack.trim()] : [])], `classify batch ${id}`)}>Reclassify</button>
            <button type="button" onClick={() => ops.rebuild().then((j) => { setQueued(`session rebuild queued as job ${j.job}`); load(); }).catch((e: Error) => setWhy(e.message))}>Rebuild sessions</button>
          </div>
          {queued && <p className="meta">{queued}; it appears in the rail and on Pipelines.</p>}
          {why && <p className="warn">{why}</p>}
        </div>
      )}

      <h3>Quarantine by reason</h3>
      {reasons.length === 0 ? (
        <Empty what="Nothing from this batch is quarantined." />
      ) : (
        <table className="thin">
          <thead>
            <tr>
              <th>reason</th>
              <th className="num">files</th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((r) => (
              <tr key={r.reason}>
                <td>
                  <a href={`#data/quarantine/${id}`}>{r.reason}</a>
                </td>
                <td className="num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StageCard({ stage }: { stage: Stage }) {
  return (
    <li className={`stage stage-${stage.state}`}>
      <span className="stage-name">{stage.name}</span>
      <span className="stage-words">{stage.words}</span>
      {stage.jobs.length > 0 ? (
        <ul className="stage-jobs">
          {stage.jobs.slice(0, 3).map((j) => (
            <li key={j.id}>
              <a href={`#job/${j.id}`}>
                job {j.id}, {j.state}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <span className="meta">{stage.name === "reviewed" ? "by people" : "no job recorded"}</span>
      )}
    </li>
  );
}
