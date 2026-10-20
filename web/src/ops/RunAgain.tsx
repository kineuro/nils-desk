// SPDX-License-Identifier: AGPL-3.0-only
// Run again (2026-10-12, found on a laptop install: a run taken up again after
// dcm2niix was installed skipped every session for want of a FLAIR and read
// as done, and Run again had queued it without a look). A stopped run is
// taken up again only after its pre-flight, as a new run is started from the
// run form: the engine checks it for the units it still has to run, and
// Start waits on that answer. A run the engine says no unit of could run is
// not queued, and the dialog says why, one line a reason with the units
// under it. A job whose run cannot be taken up (one that failed after its
// containers ended) runs its command again as a new run, checked the same
// way. An engine from before that does not check a run taken up again says
// so, and Start goes.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { DoorError } from "../ask/client";
import { Dialog } from "../ui/Dialog";
import type { Over } from "./catalog";
import { refusalOf, requirementsOf, type Failure, type Requirement } from "./failure";
import { InstallFor } from "./Install";
import type { PersonAsk } from "./pack";
import { CannotList, PreflightPanel, Requirements } from "./Preflight";
import { FailNote } from "./Reason";
import { preflightGate, resumeChecked, resumeCommand, runActs, runs, type Preflight } from "./runs";

/** What Run again takes up: a run that stopped, by its id and its pipeline; or a job's command run again as a new run, over what it named. */
export type Again = { kind: "resume"; run: number; pipeline: number | string; label: string } | { kind: "new"; pipeline: string; over: Over; params: Record<string, string>; person?: PersonAsk; command: string[] };

/** Run again of a run that stopped: taken up where it stopped. */
export function againOfRun(r: { id: number; pipeline_id: number; pipeline: string }): Again {
  return { kind: "resume", run: r.id, pipeline: r.pipeline_id, label: r.pipeline };
}

/** The command Run again queues. */
export function againCommand(a: Again): string[] {
  return a.kind === "resume" ? resumeCommand({ id: a.run }) : a.command;
}

/** Whether Run again waits on a pre-flight here: an engine that answers one for it, to a person who may see it. */
export function againChecked(caps: Capabilities, a: Again): boolean {
  return a.kind === "resume" ? resumeChecked(caps) : runActs(caps).preflight;
}

/** What a refused Run again keeps of the jobs door's answer: its failure, the checks that fail, and the units that cannot run. */
export interface AgainRefused {
  f: Failure;
  checks: Requirement[];
  pre: Preflight | null;
}

export function againRefused(e: unknown): AgainRefused {
  const body = e instanceof DoorError && e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
  const units = body?.units as Preflight["units"] | undefined;
  return {
    f: refusalOf(e),
    checks: requirementsOf(body),
    pre: body && Array.isArray(body.cannot) && units ? ({ pipeline: "", units, cannot: body.cannot, unit: typeof body.unit === "string" ? body.unit : null, ready: false } as Preflight) : null,
  };
}

export function RunAgainDialog({ caps, again, onClose, onDone }: { caps: Capabilities; again: Again; onClose: () => void; onDone: (words: string) => void }) {
  const checks = againChecked(caps, again);
  const [pre, setPre] = useState<{ p: Preflight | null; why: Failure | null } | null>(null);
  const [installs, setInstalls] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<AgainRefused | null>(null);
  useEffect(() => {
    if (!checks) return;
    let alive = true;
    setPre(null);
    const asked = again.kind === "resume" ? runs.preflightResume(again.pipeline, again.run) : runs.preflight(again.pipeline, again.over, again.params, again.person ?? null);
    asked.then(
      (p) => alive && setPre({ p, why: null }),
      (e: unknown) => alive && setPre({ p: null, why: refusalOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [checks, installs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Start waits on the pre-flight's answer where the engine gives one
  const gate = checks ? (pre?.p ? preflightGate(pre.p) : { go: false, why: null }) : { go: true, why: null };
  const start = () => {
    setBusy(true);
    setRefused(null);
    // the runs' own door keeps a refusal's body: its failure, its checks and the units that cannot run
    runs.queue(againCommand(again)).then(
      (j) => onDone(again.kind === "resume" ? `Run ${again.run} is queued again as job ${j.job}.` : `Queued again as job ${j.job}.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(againRefused(e));
      },
    );
  };
  const title = again.kind === "resume" ? `Run ${again.run} again` : `Run ${again.pipeline} again`;
  return (
    <Dialog
      title={title}
      icon="play"
      onClose={onClose}
      className="run-again"
      foot={
        <>
          {refused && (
            <FailNote f={refused.f} lead="Not queued">
              <Requirements checks={refused.checks.filter((c) => !c.ok)} />
              {refused.pre && <CannotList p={refused.pre} />}
              <InstallFor caps={caps} f={refused.f} onInstalled={() => setRefused(null)} />
            </FailNote>
          )}
          <div className="row actions">
            <button type="button" className="button" disabled={busy || !gate.go} onClick={start}>
              Start
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <p className="meta">{again.kind === "resume" ? `${again.label}: goes on where it stopped, with every unit it finished kept.` : "Runs the same command again, as a new run."}</p>
      {checks ? (
        <PreflightPanel p={pre?.p ?? null} checking={pre === null} why={pre?.why ?? null} act={(f) => <InstallFor caps={caps} f={f} onInstalled={() => setInstalls((k) => k + 1)} />} />
      ) : (
        <p className="meta">This engine does not check a run taken up again before it goes.</p>
      )}
    </Dialog>
  );
}
