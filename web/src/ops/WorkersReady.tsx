// SPDX-License-Identifier: AGPL-3.0-only
// The engine's standing workers, apart from the jobs: one line ("Workers: 3
// ready") that opens to each worker's kind and last heartbeat. They run from
// the engine's start and beat while they wait, so they are never "in
// progress"; a worker silent for two minutes shows as not answering.

import type { JobRow } from "../ask/client";
import { workersOf, workersWords } from "../data/now";

export function WorkersReady({ jobs, now }: { jobs: JobRow[]; now: number }) {
  const ws = workersOf(jobs, now);
  const words = workersWords(ws);
  if (!words) return null;
  const silent = ws.some((w) => !w.answering);
  return (
    <details className={`says workers-ready${silent ? " silent" : ""}`} aria-label="standing workers">
      <summary>{words}</summary>
      <ul className="workers-list">
        {ws.map((w) => (
          <li key={w.id} className={w.answering ? "ready" : "silent"}>
            <b>{w.kind}</b> <span className="meta">{w.answering ? w.beat : `not answering · ${w.beat}`}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
