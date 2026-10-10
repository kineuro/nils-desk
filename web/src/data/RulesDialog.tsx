// SPDX-License-Identifier: AGPL-3.0-only
// The rules of a dataset's pseudonymisation, opened from Change on its step
// (Wave 7a, the design of 2026-10-09): four choices and no paragraphs, each
// with a "?". What PatientID gets, the subject code or an ID type and which;
// what an ID with no code does, its files wait or it gets a generated code;
// the tags, the standard removal or the dataset's own, which the chooser
// edits; and the originals once every file has its copy, kept, vaulted or
// purged, the act itself behind Vaulted and Purged. Back to standard, Cancel
// and Save. The cohort a dataset feeds is its settings', and the dates are a
// release's.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { linkage, type LinkageType } from "./datasets";
import { writable } from "./FinishDataset";
import { plainError, type Plain } from "./plain";
import { tagCounts, NO_TAGS, type TagPolicy } from "./policy";
import { datasets as placeDoor, purgeRefusal, type Dataset, type OriginalsActs, type OriginalsLook } from "./pseudonyms";
import { rulesOf, rulesPatch, STANDARD, type Rules } from "./pseudoStep";

/** What each choice is, behind its "?". */
const HELP = {
  pid: "What NILS writes into PatientID in the pseudonymised copy: the subject code, or the subject's value of an ID type such as a study ID.",
  written: "Changed only before anything is pseudonymised.",
  unknown: "Its files wait until a map gives the ID a code. Or the ID gets a code made from itself, which a map given later folds into the right subject.",
  tags: "Standard removes what names the patient, the staff who did and read the scan, the trial and the institution. Choose keeps or removes tags of this dataset's own, in the list Save opens.",
  originals: "Kept: locked here. Vaulted: moved into a backup place and not read. Purged: deleted once each copy is proven.",
};

function Options<T extends string>(props: { label: string; value: T; options: [T, string, boolean?][]; onPick: (v: T) => void }) {
  return (
    <span className="ps-options" role="group" aria-label={props.label}>
      {props.options.map(([v, words, off]) => (
        <button key={v} type="button" className={props.value === v ? "ps-option on" : "ps-option"} aria-pressed={props.value === v} disabled={off === true} onClick={() => props.onPick(v)}>
          {words}
        </button>
      ))}
    </span>
  );
}

export function RulesDialog(props: {
  caps: Capabilities;
  dataset: Dataset;
  policy: TagPolicy | null;
  /** What an act on the originals would do, as the engine answers it; null where it has not. */
  look: OriginalsLook | null;
  acts: OriginalsActs;
  /** Files already pseudonymised: what PatientID gets is changed only before the first. */
  written: number;
  onClose: () => void;
  onSaved: (words: string) => void;
  /** The chooser, which owns the tag lists. */
  onTags: () => void;
  /** The acts themselves, which move or remove the files. */
  onVault: () => void;
  onPurge: () => void;
}) {
  const { caps, dataset: d, policy, look, acts, written, onClose, onSaved, onTags, onVault, onPurge } = props;
  const [rules, setRules] = useState<Rules>(() => rulesOf(d));
  const [types, setTypes] = useState<LinkageType[]>([]);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<Plain | null>(null);
  /** Choose was pressed: the chooser opens once the rest is saved. */
  const [choosing, setChoosing] = useState(false);
  const set = (patch: Partial<Rules>) => setRules((was) => ({ ...was, ...patch }));

  useEffect(() => {
    if (!served(caps, "GET /api/linkage/types")) return;
    let alive = true;
    linkage
      .types()
      .then((r) => {
        if (!alive) return;
        const w = writable(r.types);
        setTypes(w);
        setRules((was) => (was.pidType === "" && w[0] ? { ...was, pidType: w[0].name } : was));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the dataset opened
  }, []);

  const was = rulesOf(d);
  const removed = policy ? tagCounts(policy, NO_TAGS).removed : null;
  // Vaulted and Purged are acts: offered where the engine would take them, kept as they are once done
  const vaultable = was.originals === "vault" || acts.vault;
  const purgeable = was.originals === "purge" || (acts.purge && purgeRefusal(look) === null);
  const pidLocked = written > 0;
  const ready = !saving && !(rules.pid === "type" && rules.pidType.trim() === "");

  const save = () => {
    const patch = rulesPatch(d, rules);
    const then = () => {
      if (choosing && rules.tags === "choose") return onTags();
      if (rules.originals === "vault" && was.originals !== "vault") return onVault();
      if (rules.originals === "purge" && was.originals !== "purge") return onPurge();
      onSaved(Object.keys(patch).length > 0 ? `${d.name}: rules saved.` : `${d.name}: nothing changed.`);
    };
    if (Object.keys(patch).length === 0) return then();
    setSaving(true);
    setRefused(null);
    placeDoor
      .set(d.id, patch)
      .then(then)
      .catch((e: unknown) => {
        setSaving(false);
        setRefused(plainError(e, "The rules were not saved."));
      });
  };

  const foot = (
    <div className="row actions">
      <button type="button" className="button quiet" disabled={saving} onClick={() => setRules({ ...STANDARD, pid: pidLocked ? was.pid : STANDARD.pid, pidType: rules.pidType, originals: was.originals })}>
        Back to standard
      </button>
      <span className="grow" />
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!ready} onClick={save}>
        Save
      </button>
    </div>
  );

  return (
    <Dialog title={`Rules for ${d.name}`} icon="shield" onClose={onClose} foot={foot}>
      <div className="ps-rules">
        <div className="ps-rule">
          <span className="ps-rule-label">PatientID gets</span>
          <span className="ps-rule-choice">
            <Options
              label="PatientID gets"
              value={rules.pid}
              options={[
                ["code", "The subject code", pidLocked && was.pid !== "code"],
                ["type", "An ID type", pidLocked && was.pid !== "type"],
              ]}
              onPick={(pid) => set({ pid })}
            />
            {rules.pid === "type" && (
              <label className="ps-which">
                which
                {types.length > 0 ? (
                  <select value={rules.pidType} disabled={pidLocked} onChange={(e) => set({ pidType: e.target.value })}>
                    {types.map((t) => (
                      <option key={t.name} value={t.name} title={t.description ?? undefined}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={rules.pidType} placeholder="study-id" spellCheck={false} disabled={pidLocked} onChange={(e) => set({ pidType: e.target.value })} />
                )}
              </label>
            )}
          </span>
          <Hint text={pidLocked ? `${HELP.pid} ${HELP.written}` : HELP.pid} />
        </div>
        <div className="ps-rule">
          <span className="ps-rule-label">An ID with no code</span>
          <span className="ps-rule-choice">
            <Options
              label="An ID with no code"
              value={rules.unknown}
              options={[
                ["wait", "Its files wait"],
                ["generate", "It gets a generated code"],
              ]}
              onPick={(unknown) => set({ unknown })}
            />
          </span>
          <Hint text={HELP.unknown} />
        </div>
        <div className="ps-rule">
          <span className="ps-rule-label">Tags</span>
          <span className="ps-rule-choice">
            <Options
              label="Tags"
              value={rules.tags}
              options={[
                ["standard", removed === null ? "Standard" : `Standard, ${removed.toLocaleString("en-US")} removed`],
                ["choose", "Choose"],
              ]}
              onPick={(tags) => {
                set({ tags });
                setChoosing(tags === "choose");
              }}
            />
          </span>
          <Hint text={HELP.tags} />
        </div>
        <div className="ps-rule">
          <span className="ps-rule-label">The originals, once done</span>
          <span className="ps-rule-choice">
            <Options
              label="The originals, once done"
              value={rules.originals}
              options={[
                ["keep", "Kept", was.originals === "purge"],
                ["vault", "Vaulted", !vaultable],
                ["purge", "Purged", !purgeable],
              ]}
              onPick={(originals) => set({ originals })}
            />
          </span>
          <Hint text={!purgeable && purgeRefusal(look) !== null && was.originals === "keep" ? `${HELP.originals} ${purgeRefusal(look)}` : HELP.originals} />
        </div>
        {rules.originals === "purge" && was.originals !== "purge" && (
          <p className="warn ps-warn">
            <Icon name="alert" />
            Deleted once each copy is proven. It cannot be undone.
          </p>
        )}
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
