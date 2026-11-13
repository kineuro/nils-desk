// SPDX-License-Identifier: AGPL-3.0-only
// One proposal, one card (2026-11-13). A job plan the agent proposes is kept
// by the assistant twice: as a change, whose approval card stands in the
// turn that proposed it, and as a plan, which the inbox lists. The desk drew
// both, so a person saw "waits for you" over a second card that said
// "approved", pressed one, and the other went on waiting; when the job
// finished, nothing on the page said so. Here the change's card is the one
// card: where the assistant says it stands, and once approved its plan's
// steps as they stand now, each with its job, and what a finished question
// made, with one link to where its rows are saved.

import { useEffect, useState } from "react";
import { results, type JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door } from "../deployment";
import { may } from "../grants";
import { logsOffered } from "../ops/logs";
import { ApprovalCardView } from "./Cards";
import type { Plan } from "./client";
import { cardOfChange, type Ran, ranSteps } from "./events";
import type { Change } from "./parts";

const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** What a stored question's job made, read from its row: the result that keeps the answer, its rows, and the question it ran. */
export function ranOf(job: Pick<JobRow, "args" | "result">): Ran {
  const r = (job.result ?? {}) as Record<string, unknown>;
  const argv = Array.isArray(job.args?.argv) ? job.args.argv : [];
  const at = argv.indexOf("--document");
  const document = at >= 0 ? Number(argv[at + 1]) : Number.NaN;
  const handle = int(r.handle);
  return {
    document: Number.isInteger(document) ? document : null,
    handle,
    rows: int(r.row_count),
    grain: typeof r.grain === "string" && r.grain !== "" ? r.grain : null,
    // a list held back whole has a result and no length (the engine's small lists at plain)
    held: handle !== null && r.row_count === null,
  };
}

/** Whether the person finds the kept results, on Query's Exports. */
const findsResults = (caps: Capabilities): boolean => may(caps, "query:see") && door(caps, "GET /api/ask/handles");

/** What each finished question of a plan made, by job: each job's row read once, where the engine serves it. */
function useRan(plan: Plan | null, caps: Capabilities): Record<number, Ran> {
  const [ran, setRan] = useState<Record<number, Ran>>({});
  const jobs = plan && door(caps, "GET /api/jobs/{id}") ? ranSteps(plan).map((s) => s.job) : [];
  const key = jobs.join(",");
  useEffect(() => {
    let alive = true;
    for (const job of jobs) {
      if (job in ran) continue;
      results.job(job).then(
        (row) => alive && setRan((was) => ({ ...was, [job]: ranOf(row) })),
        // a job the person may not read: the step says it is done, with its number
        () => undefined,
      );
    }
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return ran;
}

/** A change on its one card, with the plan it proposed where the conversation has one. */
export function ChangeCard(props: { change: Change; plan: Plan | null; caps: Capabilities; onDecide?: (verdict: "approved" | "declined") => void; onRevise?: () => void }) {
  const { change, plan, caps, onDecide, onRevise } = props;
  const ran = useRan(plan, caps);
  const card = cardOfChange(change, plan ? { plan, ran, links: { logs: logsOffered(caps), exports: findsResults(caps) } } : null);
  return <ApprovalCardView card={card} onDecide={onDecide} onRevise={onDecide ? onRevise : undefined} />;
}
