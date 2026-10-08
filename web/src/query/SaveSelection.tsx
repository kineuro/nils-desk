// SPDX-License-Identifier: AGPL-3.0-only
// "Save as a selection" on a query card (Wave 7a, H2 round 3): the card's
// version kept under a name, with an optional note, so a run, a campaign or
// a picture build can take it; a name already used gets its next version.

import { useState } from "react";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Wait } from "../ui/Wait";
import { selectionName, selections } from "./selections";

export function SaveSelection({ documentId, title, onClose, onSaved }: { documentId: number; title: string; onClose: () => void; onSaved: (words: string) => void }) {
  const [name, setName] = useState(() => selectionName(title) ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const clean = selectionName(name);
  const save = () => {
    if (!clean) return;
    setSaving(Date.now());
    setWhy(null);
    selections.save(clean, documentId, note).then(
      (s) => onSaved(`Saved as ${s.name}, version ${s.version}.`),
      (e: unknown) => {
        setSaving(null);
        setWhy(messageOf(e));
      },
    );
  };
  const foot = (
    <div className="row actions">
      {saving !== null && <Wait phase="saving" since={saving} />}
      {why && <span className="warn">{why}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!clean || saving !== null} onClick={save}>
        Save
      </button>
    </div>
  );
  return (
    <Dialog title="Save as a selection" icon="file" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="selection-name">
          Name
          <Hint text="A name already used gets its next version; every version stays." />
        </label>
        <div className="input mono">
          <input id="selection-name" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="selection-note">
          Note
        </label>
        <div className="input">
          <input id="selection-note" value={note} placeholder="optional" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
