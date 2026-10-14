// SPDX-License-Identifier: AGPL-3.0-only
// Where a dataset's chain stopped (2026-10-10, found trying the desk): a
// pseudonymise run that failed at once left the page as if nothing had
// happened, its button the same. The engine's summary now marks a chain step
// failed where its newest job failed; the job's own words are the jobs
// door's. The page says "Stopped:" with them, what to do next, and its main
// button tries again.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { ops } from "../ops/client";
import type { DatasetSummary, StepName } from "./summary";

/** The steps of a dataset's own chain, in the order a run takes them. */
export const CHAIN_STEPS: readonly StepName[] = ["pseudonymised", "read", "sorted", "main_scans"];

/** What to do once a run stopped, said once beside its words. */
export const STOPPED_NEXT = "Change what it names, then try again.";

/** The first step of the chain the engine says failed, with the job that failed it; null where none did. */
export function failedStep(s: Pick<DatasetSummary, "steps"> | null): { step: StepName; job: number } | null {
  if (!s) return null;
  for (const name of CHAIN_STEPS) {
    const st = s.steps.find((x) => x.step === name);
    if (st && st.state === "failed" && typeof st.job === "number") return { step: name, job: st.job };
  }
  return null;
}

/** A stopped chain: its step, its job and the engine's words for why. */
export interface Stopped {
  step: StepName;
  job: number;
  words: string;
}

/** The job's own words, or a plain line where it left none. */
export function stoppedWords(error: string | null | undefined): string {
  const words = (error ?? "").trim();
  return words === "" ? "the run ended without saying why" : words;
}

/**
 * Where the dataset's chain stopped, read from the summary and the failed
 * job's own words. Read again only when another job fails; null while
 * nothing stopped, and where this account may not read the jobs it still
 * says it stopped, with the plain line.
 */
export function useStopped(caps: Capabilities, s: Pick<DatasetSummary, "steps"> | null): Stopped | null {
  const failed = failedStep(s);
  const [read, setRead] = useState<Stopped | null>(null);
  const job = failed?.job ?? null;
  const step = failed?.step ?? null;
  const reads = may(caps, "pipelines:see") && served(caps, "GET /api/jobs");
  useEffect(() => {
    if (job === null || step === null) return setRead(null);
    if (!reads) return setRead({ step, job, words: stoppedWords(null) });
    let alive = true;
    ops.job(job).then(
      (row) => alive && setRead({ step, job, words: stoppedWords(row.error) }),
      () => alive && setRead({ step, job, words: stoppedWords(null) }),
    );
    return () => {
      alive = false;
    };
  }, [job, step, reads]);
  return read && read.job === job ? read : null;
}
