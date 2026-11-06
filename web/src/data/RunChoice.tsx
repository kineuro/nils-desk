// SPDX-License-Identifier: AGPL-3.0-only
// What a step's Run would go over, said before it starts (2026-11-05): a
// press of a step's Run on the rail of a dataset or a cohort opens this line
// under the rail, with the step's name and its acts, each with its count and,
// for a large one, the parts it takes. A model step offers its scans without
// its answer first ("Run on the 135 without a body part"), then every scan
// ("Run again on all 456,132", in 23 parts); the sort every scan, main scans
// every subject. Production's body part went over all 456,132 scans in 23
// parts where 135 had no body part, and nothing said so before it began.
// Since 2026-11-06 the sort offers its scans not sorted first too, the Main
// scans map's layer Run opens the same choice, and a dialog over the scans
// chosen in the viewer lists one per step.

import type { Over, RunAct } from "./stepRun";

const n = (v: number) => v.toLocaleString("en-US");

export function RunChoice({
  title,
  acts,
  held,
  why,
  onRun,
  onClose,
}: {
  /** The step's name, as the rail says it. */
  title: string;
  acts: RunAct[];
  /** A press is being answered, or the step's Run is held now. */
  held: boolean;
  /** Why the Run is held, where the engine says why. */
  why?: string | null;
  onRun: (over: Over) => void;
  /** Where the choice can be put away; none where it stands in a list of its own, as in a dialog. */
  onClose?: () => void;
}) {
  return (
    <div className="dp-run-choice" role="group" aria-label={`Run ${title}`}>
      <span className="dp-run-title">{title}</span>
      {acts.map((a) => (
        <span key={a.over} className="dp-run-act">
          <button type="button" className={a.primary ? "button small" : "button secondary small"} disabled={held} onClick={() => onRun(a.over)}>
            {a.label}
          </button>
          {a.parts > 1 && <span className="meta">in {n(a.parts)} parts</span>}
        </span>
      ))}
      {why && <span className="meta">{why}</span>}
      {onClose && (
        <button type="button" className="button quiet small" onClick={onClose}>
          Cancel
        </button>
      )}
    </div>
  );
}
