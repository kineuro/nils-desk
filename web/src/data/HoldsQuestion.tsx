// SPDX-License-Identifier: AGPL-3.0-only
// The one question an identified dataset is asked (the design of 2026-10-09,
// its words of 2026-10-10): the kind of identifying ID its originals'
// PatientID holds, one that is the same everywhere, which the key codes with
// no map, or a hospital or study ID of a type, whose subject codes a map
// gives. Asked where a dataset is added, and on the step of one that was
// declared with no rule, in the same words.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { linkage, type LinkageType } from "./datasets";
import { writable } from "./FinishDataset";
import { typeLabel } from "./pseudonyms";
import type { Holds } from "./pseudoStep";

/** The ID types an identified dataset's PatientID may hold, read once; none until the engine answers, or where it has no door for them. */
export function useHoldsTypes(caps: Capabilities): LinkageType[] {
  const [types, setTypes] = useState<LinkageType[]>([]);
  const serves = served(caps, "GET /api/linkage/types");
  useEffect(() => {
    if (!serves) return;
    let alive = true;
    linkage
      .types()
      .then((r) => alive && setTypes(writable(r.types)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [serves]);
  return types;
}

export function HoldsQuestion(props: {
  /** The radio group's name, its own on the page. */
  name: string;
  holds: Holds["holds"] | null;
  /** The hospital or study ID's type, chosen or typed. */
  type: string;
  /** The types offered; with none, the type is typed. */
  types: LinkageType[];
  disabled?: boolean;
  onHolds: (h: Holds["holds"]) => void;
  onType: (t: string) => void;
}) {
  const { name, holds, type, types, disabled = false, onHolds, onType } = props;
  return (
    <>
      <span className="label">PatientID holds an identifying ID</span>
      <p className="meta">personnummer, national ID, social security number, or a hospital's or study's own ID: anything that leads to a person. NILS never keeps it; it becomes a subject code.</p>
      <div className="choices" role="radiogroup" aria-label="Which kind">
        <span className="meta">Which kind</span>
        <label className="radio-row">
          <input type="radio" name={name} checked={holds === "same"} disabled={disabled} onChange={() => onHolds("same")} />
          <span>
            <b>The same everywhere</b> (personnummer, national ID)
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name={name} checked={holds === "type"} disabled={disabled} onChange={() => onHolds("type")} />
          <span>
            <b>A hospital or study ID</b>
          </span>
        </label>
      </div>
      {holds === "type" && (
        <div className="field-row">
          {types.length > 0 ? (
            <div className="input">
              <select value={type} aria-label="Which hospital or study ID" disabled={disabled} onChange={(e) => onType(e.target.value)}>
                {types.map((t) => (
                  <option key={t.name} value={t.name} title={t.description ?? undefined}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="input mono">
              <input value={type} placeholder="study-id" aria-label="Which hospital or study ID" spellCheck={false} disabled={disabled} onChange={(e) => onType(e.target.value)} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
