// SPDX-License-Identifier: AGPL-3.0-only
// Make a campaign (record 45 S3, study A3; Wave 7a, record 55 H3): from a
// saved selection, a result, or what waits on Review, each chosen from a
// list; or, for a pair, an anchored or an A/B campaign, from the selections
// its items are drawn from, with the seed of the draw. Then the question and
// its options, who rates and who adjudicates, chosen from the people on the
// desk where the desk names them, and what a close writes. Nothing is typed
// by hand that a list can offer; a text field stays only where the engine or
// the desk serves no list. Other pages open it with its source filled in
// through makeHref (client.ts): Query from a selection or a result, Review
// from its filter.

import { useEffect, useState } from "react";
import type React from "react";
import type { Json } from "../ask/client";
import { results, type HandleRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { selections as selectionsDoor, type SelectionRow } from "../query/selections";
import { packRoles, review, type PackDoc } from "../review/client";
import { kindWords } from "../review/triage";
import { href, narrow } from "../routes";
import { Dialog } from "../ui/Dialog";
import {
  campaigns,
  CLOSES_WORDS,
  closesFor,
  drawnCountsWords,
  emptyDraft,
  freshSeed,
  isDrawn,
  KIND_WORDS,
  kindsOffered,
  makeBody,
  makeRefusal,
  refused as refusedWords,
  SUGGEST_WORDS,
  voterName,
  voterOf,
  whoRatesWords,
  type Draft,
  type DraftField,
  type Prefill,
  type SourceKind,
  type SuggestMode,
} from "./client";
import { principalFor, readersOf, type Reader } from "./NewCheck";

const SOURCES: { kind: SourceKind; words: string; placeholder: string; says: string }[] = [
  { kind: "selection", words: "A selection", placeholder: "name@version", says: "Frozen now: its stacks, or its sessions for a pick, become the items." },
  { kind: "handle", words: "A result", placeholder: "the handle's number", says: "The keys of a result of that grain." },
  { kind: "review", words: "Review items", placeholder: "base:vote, or base: for every base item", says: "The open items of that kind, adopted as they are; one open campaign asks each." },
];

/** What the dialog offers to choose from; null where the engine or the desk serves no list, which leaves a text field. */
export interface MakeLists {
  selections: SelectionRow[] | null;
  handles: HandleRow[] | null;
  /** The open review kinds and their counts, the campaigns' own left out. */
  kinds: [string, number][] | null;
  people: Reader[] | null;
}

export const NO_LISTS: MakeLists = { selections: null, handles: null, kinds: null, people: null };

/** What the people door says of each person, as a check's maker reads it. */
type People = { people?: { subject: string; display: string; holds?: boolean }[] };

/** Read the lists the dialog offers, each where the person may and the engine serves it. */
function useLists(caps: Capabilities): MakeLists {
  const [lists, setLists] = useState<MakeLists>(NO_LISTS);
  useEffect(() => {
    let alive = true;
    const put = (p: Partial<MakeLists>) => alive && setLists((l) => ({ ...l, ...p }));
    if (served(caps, "GET /api/ask/selections") && may(caps, "query:see")) selectionsDoor.list("", null, 200).then((r) => put({ selections: r.selections }), () => undefined);
    if (served(caps, "GET /api/ask/handles") && may(caps, "query:see")) results.handles().then((r) => put({ handles: r.handles.filter((h) => h.kept && !h.withdrawn_at && !h.truncated) }), () => undefined);
    if (served(caps, "GET /api/review/summary") && may(caps, "review:see"))
      review.summary().then((s) => put({ kinds: Object.entries(s.by_kind).filter(([k, n]) => n > 0 && !k.startsWith("campaign.")).sort((a, b) => b[1] - a[1]) }), () => undefined);
    if (caps.desk?.mode !== "off")
      fetch("/desk/people?holding=campaigns:work")
        .then((r) => (r.ok ? (r.json() as Promise<People>) : null))
        .then((r) => r && put({ people: (r.people ?? []).map((p) => ({ principal: principalFor(caps, p.subject), display: p.display || p.subject, holds: typeof p.holds === "boolean" ? p.holds : null })) }))
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [caps]);
  return lists;
}

/** A pair, anchored or A/B campaign's preview: what the draw would make, written nowhere, asked again a moment after the draft changes. */
function usePreview(caps: Capabilities, d: Draft): { counts: string; why: string | null } | null {
  const [said, setSaid] = useState<{ counts: string; why: string | null } | null>(null);
  const body = makeBody({ ...d, name: d.name.trim() || "preview" });
  const key = isDrawn(d.kind) && body.ok ? JSON.stringify(body.body) : "";
  useEffect(() => {
    if (!key || !served(caps, "POST /api/campaigns/preview")) {
      setSaid(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      campaigns.preview(JSON.parse(key)).then(
        (r: Json) => alive && setSaid({ counts: drawnCountsWords((r.counts ?? r) as Json), why: null }),
        (e: unknown) => alive && setSaid({ counts: "", why: refusedWords(e) }),
      );
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [caps, key]);
  return said;
}

export function MakeDialog({ caps, prefill, taken, onClose, onCheck }: { caps: Capabilities; prefill: Prefill; taken: readonly string[]; onClose: () => void; onCheck?: () => void }) {
  const [d, setD] = useState<Draft>(() => emptyDraft(prefill));
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const packName = caps.engine?.packs[0]?.name ?? null;
  const readsPack = packName !== null && may(caps, "data:see");
  const lists = useLists(caps);
  useEffect(() => {
    if (readsPack && packName) review.pack(packName).then(setPack, () => undefined);
  }, [readsPack, packName]);
  // a drawn campaign's seed is made once, shown, and the person may write their own
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p, ...(p.kind && isDrawn(p.kind) && !x.seed ? { seed: freshSeed() } : {}) }));
  const preview = usePreview(caps, d);
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
        location.hash = narrow(href("review", "campaigns", String(c.id)), { missing: c.pictures?.missing || null });
      })
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusedWords(e));
      });
  };
  const footWords = refusal ?? (needs ? `Needs ${needs}.` : isDrawn(d.kind) && preview?.why ? preview.why : isDrawn(d.kind) && preview?.counts ? `Draws ${preview.counts}.` : "It opens for rating at once.");
  return (
    <Dialog
      title="Make a campaign"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{footWords}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || needs !== null || refusal !== null} onClick={make}>
            Make the campaign
          </button>
        </div>
      }
    >
      <MakeForm caps={caps} draft={d} pack={pack} lists={lists} onChange={set} onCheck={onCheck} />
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}

/** A selection chosen from the saved ones, or typed where the engine lists none. */
function SelectionField({ label, value, onChange, lists, optional = false, says }: { label: string; value: string; onChange: (v: string) => void; lists: MakeLists; optional?: boolean; says?: string }) {
  const rows = lists.selections;
  return (
    <label className="field">
      <span className="label">
        {label}
        {optional ? " · optional" : ""}
      </span>
      {rows === null ? (
        <span className="input mono">
          <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder="name@version" />
        </span>
      ) : (
        <span className="input">
          <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{optional ? "none" : "choose"}</option>
            {value && !rows.some((r) => specOf(r) === value) && <option value={value}>{value}</option>}
            {rows.map((r) => (
              <option key={r.id} value={specOf(r)}>
                {selectionWords(r)}
              </option>
            ))}
          </select>
        </span>
      )}
      {rows !== null && rows.length === 0 && (
        <span className="meta">
          No saved selection yet. <a href={href("query")}>Save one from a card</a>.
        </span>
      )}
      {says && <span className="meta">{says}</span>}
    </label>
  );
}

/** A selection's current version, as the make door takes it. */
export const specOf = (r: Pick<SelectionRow, "name" | "versions" | "size">): string => `${r.name}@${r.size?.version ?? r.versions}`;

/** A selection in a list: its name, version, size and grain. */
export function selectionWords(r: SelectionRow): string {
  const size = r.size ? (r.size.rows === null ? "size held back" : `${r.size.rows.toLocaleString("en-US")} ${r.size.grain}${r.size.rows === 1 ? "" : "s"}`) : (r.grain ?? "");
  return [`${r.name} v${r.size?.version ?? r.versions}`, size].filter(Boolean).join(" · ");
}

/** The source of a campaign of keys: a selection, a result or Review items, each from its list. */
function SourceField({ draft: d, lists, onChange: set }: { draft: Draft; lists: MakeLists; onChange: (p: Partial<Draft>) => void }) {
  const src = SOURCES.find((s) => s.kind === d.source) ?? SOURCES[0];
  return (
    <fieldset className="field">
      <legend className="label">From</legend>
      <span className="chips">
        {SOURCES.map((s) => (
          <button key={s.kind} type="button" className={d.source === s.kind ? "opt on" : "opt"} aria-pressed={d.source === s.kind} onClick={() => set({ source: s.kind, ...(s.kind !== d.source ? { from: "" } : {}) })}>
            {s.words}
          </button>
        ))}
      </span>
      {d.source === "selection" && lists.selections !== null ? (
        <SelectionField label={src.words} value={d.from} onChange={(from) => set({ from })} lists={lists} />
      ) : d.source === "handle" && lists.handles !== null ? (
        <span className="input">
          <select aria-label={src.words} value={d.from} onChange={(e) => set({ from: e.target.value })}>
            <option value="">choose</option>
            {d.from && !lists.handles.some((h) => String(h.id) === d.from) && <option value={d.from}>result {d.from}</option>}
            {lists.handles.map((h) => (
              <option key={h.id} value={String(h.id)}>
                {[h.name ?? `result ${h.id}`, h.row_count === null ? "size held back" : `${h.row_count.toLocaleString("en-US")} ${h.grain}${h.row_count === 1 ? "" : "s"}`, h.created_at.slice(0, 10)].join(" · ")}
              </option>
            ))}
          </select>
        </span>
      ) : d.source === "review" && lists.kinds !== null ? (
        <span className="input">
          <select aria-label={src.words} value={d.from} onChange={(e) => set({ from: e.target.value })}>
            <option value="">choose</option>
            {d.from && !reviewChoices(lists.kinds).some((c) => c.value === d.from) && <option value={d.from}>{d.from}</option>}
            {reviewChoices(lists.kinds).map((c) => (
              <option key={c.value} value={c.value}>
                {c.words}
              </option>
            ))}
          </select>
        </span>
      ) : (
        <span className="input mono">
          <input aria-label={src.words} value={d.from} onChange={(e) => set({ from: e.target.value })} placeholder={src.placeholder} />
        </span>
      )}
      <span className="meta">{src.says}</span>
      {d.source === "review" && (d.job || d.limit || d.cohort) && <span className="meta">{narrowedWords(d)}</span>}
    </fieldset>
  );
}

/** The Review items a campaign may adopt: each open kind with its count, and every kind of an axis together where it has several. */
export function reviewChoices(kinds: readonly [string, number][]): { value: string; words: string }[] {
  const out = kinds.map(([k, n]) => ({ value: k, words: `${kindWords(k)} · ${n.toLocaleString("en-US")} open` }));
  const byAxis = new Map<string, number[]>();
  for (const [k, n] of kinds) {
    const m = /^([a-z_]+):[a-z_]+$/u.exec(k);
    if (m) byAxis.set(m[1], [...(byAxis.get(m[1]) ?? []), n]);
  }
  for (const [axis, counts] of byAxis) if (counts.length > 1) out.push({ value: `${axis}:`, words: `every ${axis} question · ${counts.reduce((a, b) => a + b, 0).toLocaleString("en-US")} open` });
  return out;
}

/** The people chosen to rate or adjudicate, from those the desk names, or typed where it names none. */
function PeopleField({ caps, label, value, onChange, people }: { caps: Capabilities; label: string; value: string; onChange: (v: string) => void; people: Reader[] | null }) {
  const chosen = value.split(/[\s,]+/u).filter(Boolean);
  if (people === null)
    return (
      <label className="field">
        <span className="label">{label} · optional</span>
        <span className="input mono">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="reviewers, when none is named" />
        </span>
      </label>
    );
  const { offered } = readersOf(people, "");
  const toggle = (p: string) => onChange((chosen.includes(p) ? chosen.filter((x) => x !== p) : [...chosen, p]).join(", "));
  const me = caps.engine?.principal || caps.person.subject;
  return (
    <fieldset className="field">
      <legend className="label">{label} · optional</legend>
      <span className="chips" role="group" aria-label={label}>
        {[{ principal: me, display: "Me", holds: true }, ...offered].map((p) => (
          <button key={p.principal} type="button" className={chosen.includes(p.principal) ? "opt on" : "opt"} aria-pressed={chosen.includes(p.principal)} onClick={() => toggle(p.principal)}>
            {p.display}
          </button>
        ))}
      </span>
    </fieldset>
  );
}

/** The form of the make dialog, drawn from the draft. */
export function MakeForm({ caps, draft: d, pack, lists = NO_LISTS, onChange: set, onCheck }: { caps: Capabilities; draft: Draft; pack: PackDoc | null; lists?: MakeLists; onChange: (p: Partial<Draft>) => void; onCheck?: () => void }) {
  const axes = pack?.axes.map((a) => a.axis) ?? [];
  const roles = packRoles(pack);
  const closes = closesFor(d.kind);
  const drawn = isDrawn(d.kind);
  const valuesOf = (axis: string) => pack?.axes.find((a) => a.axis === axis)?.values.map((v) => v.value) ?? [];
  return (
    <div className="make-form">
      <label className="field">
        <span className="label">Name</span>
        <span className="input mono">
          <input value={d.name} autoFocus onChange={(e) => set({ name: e.target.value })} placeholder="body-part-seed" />
        </span>
      </label>
      <fieldset className="field">
        <legend className="label">Question</legend>
        <span className="chips">
          {kindsOffered(caps).map((k) => (
            <button key={k} type="button" className={d.kind === k ? "opt on" : "opt"} aria-pressed={d.kind === k} onClick={() => set({ kind: k, closesInto: closesFor(k)[0] })}>
              {KIND_WORDS[k] ?? k}
            </button>
          ))}
          {onCheck && (
            <button type="button" className="opt" aria-pressed={false} onClick={onCheck} title="is a pipeline's result right: its masks read one at a time">
              {KIND_WORDS.check}
            </button>
          )}
        </span>
      </fieldset>
      {!drawn && <SourceField draft={d} lists={lists} onChange={set} />}
      {d.kind === "pair" && (
        <div className="fields2">
          <SelectionField label="Stacks" value={d.from} onChange={(from) => set({ from })} lists={lists} says="Every two stacks of one session are a pair." />
          <SelectionField label="Paired with" optional value={d.with} onChange={(w) => set({ with: w })} lists={lists} says="Each stack with each of these in its session." />
        </div>
      )}
      {d.kind === "anchored" && (
        <div className="fields3">
          <SelectionField label="Candidates" value={d.from} onChange={(from) => set({ from })} lists={lists} />
          <SelectionField label="Pre anchors" value={d.pre} onChange={(pre) => set({ pre })} lists={lists} />
          <SelectionField label="Post anchors" value={d.post} onChange={(post) => set({ post })} lists={lists} />
        </div>
      )}
      {(d.kind === "pair" || d.kind === "anchored") && (
        <div className="fields3">
          <AxisPick label="Axis" value={d.pairAxis} onChange={(pairAxis) => set({ pairAxis, postValue: "", preValue: "" })} options={axes} placeholder="post_contrast" />
          <AxisPick label="Post" value={d.postValue} onChange={(postValue) => set({ postValue })} options={valuesOf(d.pairAxis || "post_contrast")} placeholder="the engine's" />
          <AxisPick label="Pre" value={d.preValue} onChange={(preValue) => set({ preValue })} options={valuesOf(d.pairAxis || "post_contrast")} placeholder="the engine's" />
        </div>
      )}
      {d.kind === "ab" && <AbFields draft={d} lists={lists} axes={axes} onChange={set} />}
      {drawn && (
        <label className="field">
          <span className="label">Seed</span>
          <span className="input mono">
            <input aria-label="Seed" value={d.seed} onChange={(e) => set({ seed: e.target.value })} />
          </span>
          <span className="meta">Draws the sides and the order. Write it down; the campaign keeps only its hash.</span>
        </label>
      )}
      {d.kind === "axis" && (
        <div className="fields2">
          <label className="field">
            <span className="label">Axis</span>
            {axes.length > 0 ? (
              <span className="input">
                <select value={d.axis} onChange={(e) => set({ axis: e.target.value, values: "" })}>
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
          {d.axis && valuesOf(d.axis).length > 0 ? (
            <ValuesField values={valuesOf(d.axis)} chosen={d.values} onChange={(values) => set({ values })} />
          ) : (
            <label className="field">
              <span className="label">Values · optional</span>
              <span className="input mono">
                <input value={d.values} onChange={(e) => set({ values: e.target.value })} placeholder="the pack's, or a few: head, spine" />
              </span>
            </label>
          )}
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
      {(d.kind === "axis" || d.kind === "axes") && (
        <fieldset className="field">
          <legend className="label">Shown beside each item</legend>
          <span className="chips">
            {(["none", "rules", "imported"] as SuggestMode[]).map((m) => (
              <button key={m} type="button" className={d.suggest === m ? "opt on" : "opt"} aria-pressed={d.suggest === m} onClick={() => set({ suggest: m })}>
                {SUGGEST_WORDS[m].words}
              </button>
            ))}
          </span>
          <span className="meta">{SUGGEST_WORDS[d.suggest].says} Said once; the campaign keeps it.</span>
          {d.suggest === "none" && (
            <label className="check">
              <input type="checkbox" checked={d.hideHeader} onChange={(e) => set({ hideHeader: e.target.checked })} />
              <span>
                Pictures only <span className="meta">no series name, sequence or other header text beside them, as in pair mode</span>
              </span>
            </label>
          )}
        </fieldset>
      )}
      {d.kind === "pick" && roles.length > 0 && (
        <fieldset className="field">
          <legend className="label">Role</legend>
          <span className="chips">
            {roles.map((r) => (
              <button key={r} type="button" className={d.role === r ? "opt on" : "opt"} aria-pressed={d.role === r} onClick={() => set({ role: r })}>
                {r}
              </button>
            ))}
          </span>
          <span className="meta">The roles the pack&apos;s picks declare. Asked of sessions; a close writes a person&apos;s pick.</span>
        </fieldset>
      )}
      {d.kind === "pick" && roles.length === 0 && (
        <label className="field">
          <span className="label">Role</span>
          <span className="input mono">
            <input value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="t1w" />
          </span>
          <span className="meta">One the pack&apos;s picks declare. Asked of sessions; a close writes a person&apos;s pick.</span>
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
      <div className={d.kind === "ab" ? "fields2" : "fields3"}>
        {d.kind !== "ab" && (
          <label className="field">
            <span className="label">Raters per item</span>
            <span className="input">
              <input type="number" min={1} value={d.ratersPerItem} onChange={(e) => set({ ratersPerItem: Number(e.target.value) })} />
            </span>
          </label>
        )}
        <PeopleField caps={caps} label="Raters" value={d.raters} onChange={(raters) => set({ raters })} people={lists.people} />
        {!drawn && <PeopleField caps={caps} label="Adjudicators" value={d.adjudicators} onChange={(adjudicators) => set({ adjudicators })} people={lists.people} />}
      </div>
      <p className="meta">{whoRatesWords(drawn ? { ...d, adjudicators: "" } : d)}</p>
      <details className="more-fields">
        <summary>{drawn ? "Close and lease" : "Adjudication, close and lease"}</summary>
        <div className="more-body">
          {!drawn && (
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
          )}
          {!drawn && d.kind !== "derivative" && (
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
          {!drawn && (d.metric !== "exact" || d.kind === "derivative") && (
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

/** An axis or a value chosen from the pack, or typed where the pack is not read. */
function AxisPick({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {options.length > 0 ? (
        <span className="input">
          <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{placeholder}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </span>
      ) : (
        <span className="input mono">
          <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        </span>
      )}
    </label>
  );
}

/** An axis question's values, each a key; none chosen asks every value the pack has. */
function ValuesField({ values, chosen, onChange }: { values: string[]; chosen: string; onChange: (v: string) => void }) {
  const on = chosen.split(/[\s,]+/u).filter(Boolean);
  const toggle = (v: string) => onChange((on.includes(v) ? on.filter((x) => x !== v) : [...on, v]).join(", "));
  return (
    <fieldset className="field">
      <legend className="label">Values · optional</legend>
      <span className="chips" role="group" aria-label="Values">
        {values.map((v) => (
          <button key={v} type="button" className={on.includes(v) ? "opt on" : "opt"} aria-pressed={on.includes(v)} onClick={() => toggle(v)}>
            {v}
          </button>
        ))}
      </span>
      <span className="meta">{on.length === 0 ? "None chosen: every value the pack has." : `${on.length} of ${values.length}.`}</span>
    </fieldset>
  );
}

/** An A/B campaign's selection, axes and voters: the rules, and readings brought from folders of JSON files, one per stack. */
function AbFields({ draft: d, lists, axes, onChange: set }: { draft: Draft; lists: MakeLists; axes: string[]; onChange: (p: Partial<Draft>) => void }) {
  const [reading, setReading] = useState(false);
  const addFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0) return;
    const folder = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] ?? "voter";
    setReading(true);
    Promise.all(files.map((f) => f.text().then((text) => ({ name: f.name, text }))))
      .then((read) => {
        const v = voterOf(voterName(folder, d.voters.map((x) => x.name)), read);
        set({ voters: [...d.voters, v] });
      })
      .finally(() => setReading(false));
  };
  return (
    <>
      <SelectionField label="Stacks" value={d.from} onChange={(from) => set({ from })} lists={lists} says="Frozen now: the stacks the voters read." />
      <fieldset className="field">
        <legend className="label">Axes</legend>
        <span className="chips">
          {(axes.length > 0 ? axes : ["provenance", "technique", "modifier", "construct", "base", "body_part", "post_contrast"]).map((a) => (
            <button key={a} type="button" className={d.axes.includes(a) ? "opt on" : "opt"} aria-pressed={d.axes.includes(a)} onClick={() => set({ axes: d.axes.includes(a) ? d.axes.filter((x) => x !== a) : [...d.axes, a] })}>
              {a}
            </button>
          ))}
        </span>
        <span className="meta">{d.axes.length === 0 ? "None chosen: the reference read's seven." : "One answer names every axis chosen, and provenance, which tells a localizer."}</span>
      </fieldset>
      <fieldset className="field">
        <legend className="label">Voters</legend>
        <label className="check">
          <input type="checkbox" checked={d.rules} onChange={(e) => set({ rules: e.target.checked })} />
          <span>
            The rules <span className="meta">the values in force, with the header facts that decided them</span>
          </span>
        </label>
        {d.voters.map((v) => (
          <span key={v.name} className="row voter">
            <span className="tag">{v.name}</span>
            <span className="meta">
              {Object.keys(v.stacks).length.toLocaleString("en-US")} stacks read{v.skipped > 0 ? ` · ${v.skipped} files skipped` : ""}
            </span>
            <button type="button" className="link-button" onClick={() => set({ voters: d.voters.filter((x) => x.name !== v.name) })}>
              remove
            </button>
          </span>
        ))}
        <label className="button secondary small file-pick">
          {reading ? "Reading" : "Add a voter's folder"}
          {/* a folder of JSON files, one per stack, as a judge writes them */}
          <input type="file" multiple accept=".json,application/json" onChange={addFolder} {...({ webkitdirectory: "" } as Record<string, string>)} hidden />
        </label>
        <span className="meta">Where the voters split, a person settles A or B, blind to who said which.</span>
      </fieldset>
      <label className="field">
        <span className="label">Audit share</span>
        <span className="input">
          <input aria-label="Audit share" value={d.auditShare} onChange={(e) => set({ auditShare: e.target.value })} />
        </span>
        <span className="meta">Of the stacks the voters agree on, read too.</span>
      </label>
    </>
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

/** What Review narrowed the items to, in words: the job and the limit are sent with the source, the cohort is not. */
export function narrowedWords(d: Pick<Draft, "job" | "limit" | "cohort">): string {
  const parts = [d.job ? `only the items job ${d.job} raised` : "", d.limit ? `at most ${d.limit.toLocaleString("en-US")}` : ""].filter(Boolean);
  const said = parts.length > 0 ? `${parts.join(", ")}.` : "";
  const cohort = d.cohort ? `Review showed cohort ${d.cohort}; the campaign takes every open item of the kind, whatever its cohort.` : "";
  return [said.charAt(0).toUpperCase() + said.slice(1), cohort].filter(Boolean).join(" ");
}
