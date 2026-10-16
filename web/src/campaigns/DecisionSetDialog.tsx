// SPDX-License-Identifier: AGPL-3.0-only
// New label set (gate T31, step 21.3): the decisions in force on one axis,
// written as a label set into an export place. A name taken gets its next
// version, and nothing is written over.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placesKept } from "../objects/kept";
import { review, type PackDoc } from "../review/client";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { useKept } from "../ui/kept";
import { refused, type LabelSet } from "./client";
import { DECISION_SET_HINT, decisionSetBody, decisionSets, decisionSetWords, type DecisionSet } from "./decisionSet";

export function DecisionSetDialog({ caps, onClose, onDone }: { caps: Capabilities; onClose: () => void; onDone: (set: LabelSet, words: string) => void }) {
  const [axis, setAxis] = useState("");
  const [name, setName] = useState("");
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const places = useKept(placesKept);
  const packName = caps.engine?.packs[0]?.name ?? null;
  const readsPack = packName !== null && may(caps, "data:see");
  useEffect(() => {
    if (served(caps, "GET /api/places")) placesKept.ensure();
    if (readsPack && packName) review.pack(packName).then(setPack, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens
  }, []);
  // with several export places the engine asks which; with one it is the one
  const exports = (places.value?.places ?? []).filter((p) => p.role === "export" && p.retired_at === null);
  const place = exports.length > 1 ? (exports.find((p) => p.id === placeId) ?? exports[0]) : null;
  const built = decisionSetBody({ axis, name, place: place?.name ?? "" });
  const axes = pack?.axes.map((a) => a.axis) ?? null;
  const write = () => {
    if (!built.ok) return;
    setBusy(true);
    setWhy(null);
    decisionSets
      .write(built.body)
      .then((set: DecisionSet) => onDone(set, decisionSetWords(set)))
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refused(e));
      });
  };
  return (
    <Dialog
      title="New label set"
      icon="release"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{built.ok ? "A name taken gets its next version; nothing is written over." : `Needs ${built.why}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || !built.ok} onClick={write}>
            Write the label set
          </button>
        </div>
      }
    >
      <div className="fields2">
        <label className="field">
          <span className="label">
            Decisions on
            <Hint text={DECISION_SET_HINT} />
          </span>
          {axes !== null && axes.length > 0 ? (
            <span className="input">
              <select value={axis} onChange={(e) => setAxis(e.target.value)} aria-label="The axis">
                <option value="">choose an axis</option>
                {axes.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            <span className="input mono">
              <input value={axis} onChange={(e) => setAxis(e.target.value)} placeholder="body_part" aria-label="The axis" />
            </span>
          )}
        </label>
        <label className="field">
          <span className="label">Name</span>
          <span className="input mono">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={axis || "the axis"} aria-label="The label set's name" />
          </span>
        </label>
      </div>
      {place && (
        <label className="field">
          <span className="label">Written to</span>
          <span className="input">
            <select value={place.id} onChange={(e) => setPlaceId(Number(e.target.value))} aria-label="Export place">
              {exports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </span>
        </label>
      )}
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}
