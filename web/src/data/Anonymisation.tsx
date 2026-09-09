// SPDX-License-Identifier: AGPL-3.0-only
// The anonymisation page (Wave 4c section 9.14): the identity-check
// station's probe over a registered location, shown as the two histograms
// the engine answered (shapes, never values), the subject and study counts
// under each rule, and the rule the station proposes with the path
// question answered. A re-digest under a changed rule is a person's act:
// the page shows the command, it queues nothing.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { stations, type StationRun, type Verdict } from "../assistant/stations";
import { ops } from "../ops/client";

interface Candidate {
  label?: string;
  rule?: { id_type?: string; sources?: string[] };
  files?: number;
  sources?: { source: string; answered: number; empty: number; unparsed: number; unread: number; shapes: Record<string, number>; other_shapes?: number }[];
  identity_constant?: { constant: boolean; shape?: string; files?: number; distinct?: number };
  subjects?: number;
  studies?: number;
  fell_back?: number;
}

export function Anonymisation({ caps }: { caps: Capabilities }) {
  const roots = caps.engine?.ingest_roots ?? [];
  const [location, setLocation] = useState(roots[0] ?? "");
  const [words, setWords] = useState("");
  const [run, setRun] = useState<StationRun | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [probe, setProbe] = useState<{ job: number; candidates: Candidate[] } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const busy = run !== null && (run.state === "queued" || run.state === "running");

  const check = () => {
    setVerdict(null);
    setProbe(null);
    setWhy(null);
    const message = `Check the identity rule for the registered location ${location}.${words.trim() ? ` ${words.trim()}` : ""}`;
    stations
      .follow("identity-check", message, setRun)
      .then(async ({ run: r, verdict: v }) => {
        setRun(r);
        setVerdict(v);
        const jobs = (v?.result.probe_jobs as number[] | undefined) ?? [];
        const last = jobs[jobs.length - 1];
        if (last !== undefined) {
          const job = await ops.job(last);
          const result = (job as { result?: { candidates?: Candidate[] } }).result;
          setProbe({ job: last, candidates: result?.candidates ?? [] });
        }
      })
      .catch((e: Error) => setWhy(e.message));
  };

  const result = verdict?.result as { proposed?: Record<string, unknown>; path_is_direct_identifier?: boolean | null; sentence?: string; saw?: unknown[] } | undefined;

  return (
    <div>
      <p>Which identity rule a batch should be digested under: the tag the default reads, another tag, or a folder of the path. The probe reads a bounded sample of a registered location and answers shapes and counts, never a value.</p>
      <div className="row">
        <label>location{" "}
          {roots.length > 0 ? (
            <select value={location} onChange={(e) => setLocation(e.target.value)}>{roots.map((r) => <option key={r}>{r}</option>)}</select>
          ) : (
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="a registered location by name" />
          )}
        </label>
        <label>what you know <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="which folder is the subject, what the tag holds" size={44} /></label>
        <button type="button" onClick={check} disabled={busy || !location}>{busy ? `Working (${run?.state})` : "Check with the assistant"}</button>
      </div>
      {why && <p className="warn">{why}</p>}
      {run && !busy && run.state !== "settled" && <p className="warn">The run ended: {run.state}{run.error ? `, ${run.error}` : ""}.</p>}
      {run && run.state === "settled" && !verdict && <p className="warn">The run ended without a verdict{run.reply?.metadata?.terminal ? `: ${run.reply.metadata.terminal}` : ""}.</p>}
      {probe && (
        <div className="panel">
          <h2>The probe, job {probe.job}</h2>
          <div className="histograms">
            {probe.candidates.map((c, i) => (
              <div key={c.label ?? i} className="candidate">
                <h3>{c.label ?? `rule ${i + 1}`}: {c.rule?.id_type ?? ""} from {c.rule?.sources?.join(", then ") ?? ""}</h3>
                {(c.sources ?? []).map((s) => (
                  <div key={s.source} className="source">
                    <p className="meta">{s.source}: answered {s.answered}, empty {s.empty}, unparsed {s.unparsed}, unread {s.unread}</p>
                    <Histogram shapes={s.shapes} total={c.files ?? 0} />
                  </div>
                ))}
                <p>
                  {c.identity_constant?.constant ? <>The identity is <strong>constant</strong> across the sample (shape {c.identity_constant.shape}): a placeholder, not an identity. </> : null}
                  {c.subjects} subjects, {c.studies} studies{c.fell_back ? `, ${c.fell_back} fell back` : ""}.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {result && (
        <div className="proposal open">
          <p className="sentence">{result.sentence}</p>
          {result.proposed && (
            <p>
              Proposed rule: <code>{JSON.stringify(result.proposed)}</code>
              {typeof result.path_is_direct_identifier === "boolean" && <>. The path segment it reads <strong>{result.path_is_direct_identifier ? "is" : "is not"}</strong> a direct identifier of the person.</>}
            </p>
          )}
          {result.proposed && (
            <p className="meta">
              A re-digest under this rule is a person's act: <code>nils digest --identity-rule &lt;file&gt; @{location}</code> with the rule above as its <code>identity</code> block.
            </p>
          )}
          {verdict && <details><summary>checks</summary><ul>{verdict.checks.map((c) => <li key={c.name}>{c.name}: {c.passed ? "passed" : c.why}</li>)}</ul></details>}
        </div>
      )}
    </div>
  );
}

/** Shapes and their counts as bars; the widest is the whole sample. */
export function Histogram({ shapes, total }: { shapes: Record<string, number>; total: number }) {
  const rows = Object.entries(shapes).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = Math.max(total, ...rows.map(([, n]) => n), 1);
  if (rows.length === 0) return <p className="meta">no shape answered</p>;
  return (
    <ul className="histogram">
      {rows.map(([shape, n]) => (
        <li key={shape}>
          <span className="shape">{shape}</span>
          <span className="bar" style={{ width: `${Math.round((100 * n) / max)}%` }} />
          <span className="num">{n}</span>
        </li>
      ))}
    </ul>
  );
}
