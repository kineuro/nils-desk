// SPDX-License-Identifier: AGPL-3.0-only
// A step over the scans chosen in the viewer, without a cohort (2026-11-06):
// a cohort is by subject, and the only way to run body part, post-contrast
// or the sort over some scans was to make one. Where the viewer shows scans,
// "Run a step" saves what it shows as a selection on the way (Keep's dialog,
// its count and its name), then lists each step's run over that selection
// as a dataset's rail offers it: the sort and each model step, its scans
// without its answer first, then every one, each with its count and parts,
// held with the engine's reason where a run would be refused. An act queues
// the run at the selection's step door; the bar's line says what was queued.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { messageOf } from "../settings/common";
import { Hint } from "../ui/Hint";
import { Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import type { Said } from "./Keep";
import { plainError } from "./plain";
import { RunChoice } from "./RunChoice";
import { runActs, runControl, SELECTION_STEPS_DOOR, startedWords, STEP_RUN_DOORS, stepRuns, type Over, type Runnable, type SelectionSteps } from "./stepRun";
import { stepWords } from "./summary";

const n = (v: number) => v.toLocaleString("en-US");

/** The steps a run over chosen scans offers, in the rail's order. */
const OFFERED: Runnable[] = ["sorted", "body_part", "post_contrast"];

/** Whether this person may run a step over the scans the viewer shows: work on Pipelines, and both selection step doors served. */
export function mayRunOnScans(caps: Capabilities): boolean {
  return may(caps, "pipelines:work") && served(caps, STEP_RUN_DOORS.selections) && served(caps, SELECTION_STEPS_DOOR);
}

type Read = { kind: "reading"; since: number } | { kind: "read"; value: SelectionSteps } | { kind: "failed"; why: string };

/** Each step's run over a saved selection, as the engine counts it, and an act that queues one. */
export function StepsOver({ caps, selection, onDone }: { caps: Capabilities; selection: { name: string; version: number }; onDone: (s: Said) => void }) {
  const [read, setRead] = useState<Read>(() => ({ kind: "reading", since: Date.now() }));
  const [pressed, setPressed] = useState(false);
  const [why, setWhy] = useState<{ words: string; detail: string } | null>(null);
  useEffect(() => {
    let alive = true;
    stepRuns.over(selection.name, selection.version).then(
      (value) => alive && setRead({ kind: "read", value }),
      (e: unknown) => alive && setRead({ kind: "failed", why: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [selection.name, selection.version]);

  if (read.kind === "reading") return <Wait phase="counting what each step would run on" since={read.since} />;
  if (read.kind === "failed")
    return (
      <p className="warn" role="alert">
        What each step would run on could not be counted.
        <Hint text={read.why} />
      </p>
    );
  const v = read.value;
  const run = (step: Runnable, over: Over) => {
    setPressed(true);
    setWhy(null);
    stepRuns.start("selections", `${v.selection.name}@${v.selection.version}`, step, over).then(
      (started) => onDone({ words: startedWords(v.selection.name, step, started), href: href("pipelines", "jobs"), link: "Jobs" }),
      (e: unknown) => {
        setPressed(false);
        setWhy(plainError(e, "It did not start."));
      },
    );
  };
  return (
    <div className="ros">
      <Values
        cells={[
          { k: "selection", v: `${v.selection.name}, version ${v.selection.version}` },
          { k: "scans", v: n(v.scans) },
        ]}
      />
      {OFFERED.map((step) => {
        const st = v.steps.find((x) => x.step === step);
        if (!st) return null;
        const title = stepWords(st).title;
        const c = runControl(caps, "selections", st);
        if (!c)
          return (
            <div key={step} className="dp-run-choice" role="group" aria-label={`Run ${title}`}>
              <span className="dp-run-title">{title}</span>
              <span className="meta">{st.state === "queued" ? "Waits its turn over these scans." : st.state === "running" ? "Runs now over these scans." : "Not offered here."}</span>
            </div>
          );
        return <RunChoice key={step} title={title} acts={runActs(st)} held={c.disabled || pressed} why={c.why} onRun={(over) => run(step, over)} />;
      })}
      {why && (
        <p className="warn" role="alert">
          {why.words}
          {why.detail !== "" && why.detail !== why.words && <Hint text={why.detail} />}
        </p>
      )}
    </div>
  );
}
