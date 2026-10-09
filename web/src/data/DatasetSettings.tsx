// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's settings (Wave 7a, the design of 2026-10-09): the cohort its
// new subjects join, which moved here from the pseudonymisation's Change.
// One choice and Save; what it means is behind a "?".

import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { cohortChoices, cohortOf, type Dataset } from "./datasets";
import { plainError, type Plain } from "./plain";
import { datasets as placeDoor } from "./pseudonyms";

/** The choice a dataset's cohort reads as: the one it feeds, or none. */
export function cohortChoice(d: Pick<Dataset, "cohort" | "name">): string {
  if (!d.cohort) return "none";
  return d.cohort === d.name ? `new:${d.cohort}` : `is:${d.cohort}`;
}

export function DatasetSettings(props: { dataset: Dataset; cohorts: readonly string[]; onClose: () => void; onSaved: (words: string) => void }) {
  const { dataset: d, cohorts, onClose, onSaved } = props;
  const choices = cohortChoices(d.name, [...cohorts, ...(d.cohort && !cohorts.includes(d.cohort) ? [d.cohort] : [])]);
  const [choice, setChoice] = useState(() => cohortChoice(d));
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<Plain | null>(null);
  const cohort = cohortOf(choice);
  const save = () => {
    if (cohort === (d.cohort ?? null)) return onClose();
    setSaving(true);
    setRefused(null);
    placeDoor
      .set(d.id, { cohort })
      .then(() => onSaved(cohort ? `${d.name} feeds ${cohort}.` : `${d.name} feeds no cohort.`))
      .catch((e: unknown) => {
        setSaving(false);
        setRefused(plainError(e, "The settings were not saved."));
      });
  };
  const foot = (
    <div className="row actions">
      <span className="grow" />
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={saving} onClick={save}>
        Save
      </button>
    </div>
  );
  return (
    <Dialog title={`Settings of ${d.name}`} icon="settings" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="dataset-feeds">
          Feeds a cohort
          <Hint text="Every subject a read of this dataset adds joins the cohort. Taking it away keeps every member." />
        </label>
        <div className="input">
          <select id="dataset-feeds" value={choice} disabled={saving} onChange={(e) => setChoice(e.target.value)}>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value === "none" ? "No cohort" : c.value.startsWith("new:") ? `${cohortOf(c.value)}, named after it` : cohortOf(c.value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {refused && (
        <p className="warn">
          {refused.words}
          <Hint text={refused.detail} />
        </p>
      )}
    </Dialog>
  );
}
