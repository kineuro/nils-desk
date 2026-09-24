// SPDX-License-Identifier: AGPL-3.0-only
// Make a campaign (record 45 S3, study A3): from a saved selection, a
// result's handle, or what waits on Review; the question and its options;
// how many raters each item takes, who rates and who adjudicates; and what a
// close writes. Other pages open it with its source filled in through
// makeHref (client.ts): Query from a selection or a result, Review from its
// filter.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { review, type PackDoc } from "../review/client";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { campaigns, CLOSES_WORDS, closesFor, emptyDraft, KIND_WORDS, kindsOffered, makeBody, makeRefusal, refused as refusedWords, type Draft, type DraftField, type SourceKind } from "./client";

const SOURCES: { kind: SourceKind; words: string; placeholder: string; says: string }[] = [
  { kind: "selection", words: "A selection", placeholder: "name@version", says: "Frozen now: its stacks, or its sessions for a pick, become the items." },
  { kind: "handle", words: "A result", placeholder: "the handle's number", says: "The keys of a result of that grain." },
  { kind: "review", words: "Review items", placeholder: "base:vote, or base: for every base item", says: "The open items of that kind, adopted as they are; one open campaign asks each." },
];

export function MakeDialog({ caps, prefill, taken, onClose }: { caps: Capabilities; prefill: { source: SourceKind; from: string }; taken: readonly string[]; onClose: () => void }) {
  const [d, setD] = useState<Draft>(() => emptyDraft(prefill));
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const packName = caps.engine?.packs[0]?.name ?? null;
  const readsPack = packName !== null && may(caps, "data:see");
  useEffect(() => {
    if (readsPack && packName) review.pack(packName).then(setPack, () => undefined);
  }, [readsPack, packName]);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const body = makeBody(d);
  const needs = !body.ok ? body.needs : taken.includes(d.name.trim()) ? "another name; that one is taken" : null;
  const refusal = makeRefusal(caps);
  const make = () => {
    if (!body.ok) return;
    setBusy(true);
    setWhy(null);
    campaigns
      .make(body.body)
      .then((c) => {
        onClose();
        location.hash = href("campaigns", String(c.id));
      })
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusedWords(e));
      });
  };
  return (
    <Dialog
      title="Make a campaign"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal ?? (needs ? `Needs ${needs}.` : "It opens for rating at once.")}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || needs !== null || refusal !== null} onClick={make}>
            Make the campaign
          </button>
        </div>
      }
    >
      <MakeForm caps={caps} draft={d} pack={pack} onChange={set} />
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}

/** The form of the make dialog, drawn from the draft. */
export function MakeForm({ caps, draft: d, pack, onChange: set }: { caps: Capabilities; draft: Draft; pack: PackDoc | null; onChange: (p: Partial<Draft>) => void }) {
  const src = SOURCES.find((s) => s.kind === d.source) ?? SOURCES[0];
  const axes = pack?.axes.map((a) => a.axis) ?? [];
  const closes = closesFor(d.kind);
  return (
    <div className="make-form">
      <label className="field">
        <span className="label">Name</span>
        <span className="input mono">
          <input value={d.name} autoFocus onChange={(e) => set({ name: e.target.value })} placeholder="body-part-seed" />
        </span>
      </label>
      <fieldset className="field">
        <legend className="label">From</legend>
        <span className="chips">
          {SOURCES.map((s) => (
            <button key={s.kind} type="button" className={d.source === s.kind ? "opt on" : "opt"} aria-pressed={d.source === s.kind} onClick={() => set({ source: s.kind })}>
              {s.words}
            </button>
          ))}
        </span>
        <span className="input mono">
          <input aria-label={src.words} value={d.from} onChange={(e) => set({ from: e.target.value })} placeholder={src.placeholder} />
        </span>
        <span className="meta">{src.says}</span>
      </fieldset>
      <fieldset className="field">
        <legend className="label">Question</legend>
        <span className="chips">
          {kindsOffered(caps).map((k) => (
            <button key={k} type="button" className={d.kind === k ? "opt on" : "opt"} aria-pressed={d.kind === k} onClick={() => set({ kind: k, closesInto: closesFor(k)[0] })}>
              {KIND_WORDS[k] ?? k}
            </button>
          ))}
        </span>
      </fieldset>
      {d.kind === "axis" && (
        <div className="fields2">
          <label className="field">
            <span className="label">Axis</span>
            {axes.length > 0 ? (
              <span className="input">
                <select value={d.axis} onChange={(e) => set({ axis: e.target.value })}>
                  <option value="">choose</option>
                  {axes.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="input mono">
                <input value={d.axis} onChange={(e) => set({ axis: e.target.value })} placeholder="body_part" />
              </span>
            )}
          </label>
          <label className="field">
            <span className="label">Values · optional</span>
            <span className="input mono">
              <input value={d.values} onChange={(e) => set({ values: e.target.value })} placeholder="the pack's, or a few: head, spine" />
            </span>
          </label>
        </div>
      )}
      {d.kind === "axes" && (
        <fieldset className="field">
          <legend className="label">Axes</legend>
          <span className="chips">
            {(axes.length > 0 ? axes : ["base", "technique", "modifier", "construct", "provenance"]).map((a) => (
              <button key={a} type="button" className={d.axes.includes(a) ? "opt on" : "opt"} aria-pressed={d.axes.includes(a)} onClick={() => set({ axes: d.axes.includes(a) ? d.axes.filter((x) => x !== a) : [...d.axes, a] })}>
                {a}
              </button>
            ))}
          </span>
          <span className="meta">One answer names every axis; the pack refuses a combination it does not allow.</span>
        </fieldset>
      )}
      {d.kind === "pick" && (
        <label className="field">
          <span className="label">Role</span>
          <span className="input mono">
            <input value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="main_t1" />
          </span>
          <span className="meta">Asked of sessions; a close writes a person&apos;s pick.</span>
        </label>
      )}
      {d.kind === "derivative" && (
        <label className="field">
          <span className="label">Kind of file</span>
          <span className="input mono">
            <input value={d.derivativeKind} onChange={(e) => set({ derivativeKind: e.target.value })} placeholder="mask" />
          </span>
          <span className="meta">Answered in the app that makes it; the engine never compares files, so agreement comes from an external metric.</span>
        </label>
      )}
      {d.kind === "form" && <FieldsEditor fields={d.fields} onChange={(fields) => set({ fields })} />}
      <div className="fields3">
        <label className="field">
          <span className="label">Raters per item</span>
          <span className="input">
            <input type="number" min={1} value={d.ratersPerItem} onChange={(e) => set({ ratersPerItem: Number(e.target.value) })} />
          </span>
        </label>
        <label className="field">
          <span className="label">Raters · optional</span>
          <span className="input mono">
            <input value={d.raters} onChange={(e) => set({ raters: e.target.value })} placeholder="anyone with work" />
          </span>
        </label>
        <label className="field">
          <span className="label">Adjudicators · optional</span>
          <span className="input mono">
            <input value={d.adjudicators} onChange={(e) => set({ adjudicators: e.target.value })} placeholder="anyone with work" />
          </span>
        </label>
      </div>
      <details className="more-fields">
        <summary>Adjudication, close and lease</summary>
        <div className="more-body">
          <fieldset className="field">
            <legend className="label">Adjudicate</legend>
            <span className="chips">
              {(["disagree", "always", "never"] as const).map((w) => (
                <button key={w} type="button" className={d.when === w ? "opt on" : "opt"} aria-pressed={d.when === w} onClick={() => set({ when: w })}>
                  {w === "disagree" ? "on disagreement" : w}
                </button>
              ))}
            </span>
          </fieldset>
          {d.kind !== "derivative" && (
            <fieldset className="field">
              <legend className="label">Agreement by</legend>
              <span className="chips">
                {(["exact", "kappa", "external"] as const).map((m) => (
                  <button key={m} type="button" className={d.metric === m ? "opt on" : "opt"} aria-pressed={d.metric === m} onClick={() => set({ metric: m })}>
                    {m}
                  </button>
                ))}
              </span>
            </fieldset>
          )}
          {(d.metric !== "exact" || d.kind === "derivative") && (
            <label className="field">
              <span className="label">Threshold</span>
              <span className="input">
                <input value={d.threshold} onChange={(e) => set({ threshold: e.target.value })} />
              </span>
            </label>
          )}
          <fieldset className="field">
            <legend className="label">Closes into</legend>
            <span className="chips">
              {closes.map((k) => (
                <button key={k} type="button" className={d.closesInto === k ? "opt on" : "opt"} aria-pressed={d.closesInto === k} onClick={() => set({ closesInto: k })}>
                  {CLOSES_WORDS[k] ?? k}
                </button>
              ))}
            </span>
          </fieldset>
          <label className="field">
            <span className="label">Lease, minutes</span>
            <span className="input">
              <input type="number" min={1} value={d.leaseMinutes} onChange={(e) => set({ leaseMinutes: Number(e.target.value) })} />
            </span>
          </label>
        </div>
      </details>
    </div>
  );
}

function FieldsEditor({ fields, onChange }: { fields: DraftField[]; onChange: (f: DraftField[]) => void }) {
  const put = (i: number, p: Partial<DraftField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <fieldset className="field">
      <legend className="label">Fields</legend>
      {fields.map((f, i) => (
        <div key={i} className="form-row">
          <span className="input mono">
            <input aria-label="field name" value={f.name} onChange={(e) => put(i, { name: e.target.value })} placeholder="motion" />
          </span>
          <span className="input">
            <select aria-label="field type" value={f.type} onChange={(e) => put(i, { type: e.target.value as DraftField["type"] })}>
              <option value="enum">choices</option>
              <option value="boolean">yes or no</option>
              <option value="integer">whole number</option>
              <option value="number">number</option>
              <option value="string">words</option>
            </select>
          </span>
          {f.type === "enum" && (
            <span className="input mono">
              <input aria-label="choices" value={f.choices} onChange={(e) => put(i, { choices: e.target.value })} placeholder="none, mild, severe" />
            </span>
          )}
          <label className="check">
            <input type="checkbox" checked={f.required} onChange={(e) => put(i, { required: e.target.checked })} /> required
          </label>
          {fields.length > 1 && (
            <button type="button" className="link-button" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
              remove
            </button>
          )}
        </div>
      ))}
      <button type="button" className="link-button" onClick={() => onChange([...fields, { name: "", type: "string", choices: "", required: false }])}>
        Add a field
      </button>
    </fieldset>
  );
}
