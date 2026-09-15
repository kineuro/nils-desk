// SPDX-License-Identifier: AGPL-3.0-only
// Deciding one item (record 26): a classifier question takes a value, or
// nothing, at a scope (this scan, its series, this subject, this scanner) and
// goes through the apply door; any other item is acknowledged with why. A
// person's decision outranks the rules and survives re-sorting; the engine's
// ranking says when one does not outrank the one before it.

import { useState } from "react";
import { ops, type ReviewItem } from "../ops/client";
import { Dialog } from "../ui/Dialog";
import { itemWords, refusalWords, SCOPES, type PackDoc } from "./client";
import { kindOf } from "./triage";

export interface DecideProps {
  item: ReviewItem;
  pack: PackDoc | null;
  /** A value to start from, when the page knows the rules' own guess. */
  guess?: string | null;
  onClose: () => void;
  onDone: (words: string) => void;
}

export function DecideDialog({ item, pack, guess = null, onClose, onDone }: DecideProps) {
  const k = kindOf(item.kind);
  const axis = k.classifier ? k.area : null;
  const values = axis ? (pack?.axes.find((a) => a.axis === axis)?.values ?? []) : [];
  const [value, setValue] = useState(guess ?? "");
  const [nothing, setNothing] = useState(false);
  const [scope, setScope] = useState<(typeof SCOPES)[number]["scope"]>("stack");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const apply = () => {
    setBusy(true);
    setRefused(null);
    const call = axis
      ? ops.reviewApply(item.id, { ...(nothing ? { nothing: true } : { value: value.trim() }), scope, ...(why.trim() ? { why: why.trim() } : {}) })
      : ops.reviewAccept(item.id, why.trim() || undefined);
    call
      .then(() => onDone(axis ? `Decided ${axis} ${nothing ? "has no value" : `is ${value.trim()}`} for ${SCOPES.find((s) => s.scope === scope)?.words ?? scope}.` : "Acknowledged."))
      .catch((e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      });
  };
  const ready = axis ? nothing || value.trim() !== "" : true;
  return (
    <Dialog
      title={axis ? `Decide ${axis}` : "Acknowledge this item"}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || !ready} onClick={apply}>
            {axis ? "Decide" : "Acknowledge"}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">{itemWords(item)}</p>
      {axis && (
        <div className="field">
          <span className="label">{axis} is</span>
          <div className="field-row">
            {values.length > 0 ? (
              <span className="input select">
                <select value={nothing ? "" : value} disabled={nothing} aria-label={`The value of ${axis}`} onChange={(e) => setValue(e.target.value)}>
                  <option value="">choose a value</option>
                  {values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label && v.label !== v.value ? `${v.value} (${v.label})` : v.value}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="input">
                <input value={value} disabled={nothing} placeholder={`a value of ${axis}`} aria-label={`The value of ${axis}`} onChange={(e) => setValue(e.target.value)} />
              </span>
            )}
            <label className="choice">
              <input type="checkbox" checked={nothing} onChange={(e) => setNothing(e.target.checked)} />
              no value here
            </label>
          </div>
          <span className="seg" role="radiogroup" aria-label="The decision's scope">
            {SCOPES.map((s) => (
              <button key={s.scope} type="button" role="radio" aria-checked={scope === s.scope} className={scope === s.scope ? "on" : ""} onClick={() => setScope(s.scope)}>
                {s.words}
              </button>
            ))}
          </span>
          <span className="meta">A person's decision outranks the rules and survives re-sorting. A new pack that disagrees raises a new item; it never overwrites.</span>
        </div>
      )}
      <div className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} placeholder={axis ? "what you saw, in a few words" : "why it needs no decision"} aria-label="Why" onChange={(e) => setWhy(e.target.value)} />
        </span>
      </div>
      {!axis && <p className="meta">Acknowledging records who looked and closes the item without a decision. An identity question is settled on the Identifiers page, by a map or a merge.</p>}
    </Dialog>
  );
}
