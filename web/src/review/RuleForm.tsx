// SPDX-License-Identifier: AGPL-3.0-only
// Change a rule (record 56, sections 5.4 and 5.5): a form for each typed
// operation, built from the patch contract's schema (ruleOps.ts), with where
// it applies and why. "Show the effect" replays the registry with the change
// and writes nothing; the effect report follows, and then the one next
// action is to propose it, where the engine keeps proposals. Any edit after
// the effect clears it, so what is proposed is always what was shown.

import { useEffect, useMemo, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { refusalWords, type PackDoc } from "./client";
import type { Effect } from "./effect";
import { EffectReport } from "./EffectReport";
import type { Draft } from "./quality";
import {
  FAMILIES,
  NEW_BIDS,
  NEW_CANDIDATE,
  NEW_CONDITION,
  NEW_ORDER,
  OP_SPECS,
  SCOPE_KINDS,
  buildOp,
  emptyForm,
  frontAndMore,
  opWords,
  scopeWords,
  specOf,
  type BidsValue,
  type CandidateRow,
  type ConditionRow,
  type FieldSpec,
  type FieldValue,
  type OpForm,
  type OrderRow,
  type ScopeChoice,
} from "./ruleOps";
import { BORDERS, rulesDoors, type PackChoices } from "./rulesDoors";

/** What the scope chooser offers: the sites (source roots), datasets, scanners and batches the registry knows. */
export interface ScopeOptions {
  sites: string[];
  datasets: string[];
  scanners: string[];
  batches: { id: number; name: string }[];
}

export interface RuleFormProps {
  caps: Capabilities;
  pack: PackDoc | null;
  choices: PackChoices | null;
  options: ScopeOptions;
  /** A change filled in by the page that opened the form: a quality row's mend. */
  draft: Draft | null;
  /** Proposing, where the engine keeps proposals: the operation as built, and the effect shown for it. */
  onPropose?: (op: Json, effect: Effect) => Promise<void>;
  /** Why a change cannot be proposed here, where it cannot. */
  noPropose?: string | null;
  onOpen?: (stack: number) => void;
}

type Shown = { kind: "none" } | { kind: "busy"; since: number } | { kind: "ready"; effect: Effect; op: Json } | { kind: "failed"; why: string };

const lid = (s: string) => `rules-${s.replace(/[^a-z0-9]+/giu, "-")}`;

export function RuleForm({ caps, pack, choices, options, draft, onPropose, noPropose, onOpen }: RuleFormProps) {
  const [form, setForm] = useState<OpForm>(() => draft?.form ?? emptyForm("add_words"));
  const [scope, setScope] = useState<ScopeChoice>(() => draft?.scope ?? { kind: "pack", value: "" });
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [evidence, setEvidence] = useState<unknown>(draft?.evidence ?? null);
  const [more, setMore] = useState(false);
  const [shown, setShown] = useState<Shown>({ kind: "none" });
  const [proposing, setProposing] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  // a new draft from the page replaces the form
  useEffect(() => {
    if (!draft) return;
    setForm(draft.form);
    setScope(draft.scope);
    setReason(draft.reason);
    setEvidence(draft.evidence);
    setShown({ kind: "none" });
    setWhy(null);
  }, [draft]);

  const spec = specOf(form.op);
  const built = useMemo(() => buildOp(form, scope, reason, evidence), [form, scope, reason, evidence]);
  const parts = spec ? frontAndMore(spec) : { front: [], more: [] };
  const edited = (next: OpForm) => {
    setForm(next);
    setShown({ kind: "none" });
    setWhy(null);
  };
  const setValue = (name: string, v: FieldValue) => edited({ ...form, values: { ...form.values, [name]: v } });
  const pick = (op: string) => {
    if (op === form.op) return;
    // what the two forms share stays: an axis and a value chosen once are not asked again
    const next = emptyForm(op);
    for (const k of ["axis", "value", "words", "field", "rule", "set", "role", "pick"]) if (k in next.values && typeof form.values[k] === "string") next.values[k] = form.values[k];
    setMore(false);
    edited(next);
  };

  const show = () => {
    if (!pack || !built.op) return;
    const since = Date.now();
    setShown({ kind: "busy", since });
    setWhy(null);
    const op = built.op;
    rulesDoors.rehearse(pack.pack, [op]).then(
      (effect) => setShown({ kind: "ready", effect, op }),
      (e: unknown) => setShown({ kind: "failed", why: refusalWords(e) }),
    );
  };
  const propose = () => {
    if (shown.kind !== "ready" || !onPropose) return;
    setProposing(true);
    setWhy(null);
    onPropose(shown.op, shown.effect)
      .catch((e: unknown) => setWhy(refusalWords(e)))
      .finally(() => setProposing(false));
  };

  const axisValues = (axis: string) => pack?.axes.find((a) => a.axis === axis)?.values.map((v) => v.value) ?? [];
  const chosenAxis = typeof form.values.axis === "string" ? form.values.axis : "";
  const ready = shown.kind === "ready";

  return (
    <div className="rf" aria-label="Change a rule">
      <Lists pack={pack} choices={choices} axisValues={axisValues(chosenAxis)} options={options} />
      <div className="rf-ops" role="group" aria-label="What to change">
        {FAMILIES.map((f) => {
          const ops = OP_SPECS.filter((s) => s.family === f.family);
          if (ops.length === 0) return null;
          return (
            <div key={f.family} className="rf-family">
              <span className="rf-family-name">{f.words}</span>
              <span className="chips">
                {ops.map((s) => (
                  <button key={s.op} type="button" className={s.op === form.op ? "opt on" : "opt"} aria-pressed={s.op === form.op} onClick={() => pick(s.op)}>
                    {s.title}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {spec && (
        <fieldset className="rf-body" disabled={shown.kind === "busy" || proposing}>
          <legend className="rf-legend">
            <span className="eyebrow">{spec.title}</span>
            {spec.help && <Hint text={spec.help} />}
          </legend>
          {parts.front.map((f) => (
            <Field key={f.name} f={f} form={form} axisValues={axisValues} onValue={setValue} />
          ))}
          {spec.place && <Place form={form} onPlace={(place) => edited({ ...form, place })} />}
          {parts.more.length > 0 && (
            <>
              <button type="button" className="button quiet small rf-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                <Icon name={more ? "chevron-up" : "chevron-down"} />
                More
              </button>
              {more && parts.more.map((f) => <Field key={f.name} f={f} form={form} axisValues={axisValues} onValue={setValue} />)}
            </>
          )}

          <div className="rf-row">
            <span className="rf-label">For</span>
            {spec.packOnly ? (
              <span className="rf-input">
                <span className="opt on rf-fixed">Everyone</span>
                <Hint text="A main-scan rule is one for every scan, so it is a change to the pack, never a local one." />
              </span>
            ) : (
              <span className="rf-input rf-scope">
                <span className="chips" role="group" aria-label="For">
                  {SCOPE_KINDS.map((k) => (
                    <button
                      key={k.kind}
                      type="button"
                      className={scope.kind === k.kind ? "opt on" : "opt"}
                      aria-pressed={scope.kind === k.kind}
                      onClick={() => {
                        setScope({ kind: k.kind, value: k.kind === scope.kind ? scope.value : "" });
                        setShown({ kind: "none" });
                      }}
                    >
                      {k.words}
                    </button>
                  ))}
                </span>
                {scope.kind !== "pack" && (
                  <span className="input">
                    <input
                      value={scope.value}
                      list={lid(`scope-${scope.kind}`)}
                      aria-label={`Which ${scope.kind}`}
                      placeholder={scope.kind === "scanner" ? "model=Prisma" : scope.kind === "batch" ? "its number" : `the ${scope.kind}'s name`}
                      onChange={(e) => {
                        setScope({ ...scope, value: e.target.value });
                        setShown({ kind: "none" });
                      }}
                    />
                  </span>
                )}
              </span>
            )}
          </div>
          <label className="rf-row">
            <span className="rf-label">Why</span>
            <span className="input rf-input">
              <input
                value={reason}
                aria-label="Why"
                placeholder="the partner writes mdc for contrast given"
                onChange={(e) => {
                  setReason(e.target.value);
                  setShown({ kind: "none" });
                }}
              />
            </span>
          </label>
        </fieldset>
      )}

      {shown.kind === "failed" && <p className="warn rf-refused">The change was refused: {shown.why}</p>}
      {ready && <EffectReport caps={caps} effect={shown.effect} pack={pack} onOpen={onOpen} />}
      <div className="rf-act">
        {!ready && (
          <button type="button" className="button" disabled={!built.op || !pack || shown.kind === "busy"} title={built.missing.length > 0 ? `Still needs ${built.missing.join(", ")}` : undefined} onClick={show}>
            Show the effect
          </button>
        )}
        {ready && onPropose && (
          <button type="button" className="button" disabled={proposing} onClick={propose}>
            Propose it
          </button>
        )}
        {ready && (
          <button type="button" className="button secondary" disabled={proposing} onClick={() => setShown({ kind: "none" })}>
            Change it
          </button>
        )}
        {!built.op && built.missing.length > 0 && <span className="meta">Needs {built.missing.join(", ")}.</span>}
        {built.op && !ready && shown.kind !== "busy" && <span className="meta rf-says">{`${opWords(built.op)}, ${scopeWords(built.op.scope)}`}</span>}
        {ready && !onPropose && noPropose && <span className="meta">{noPropose}</span>}
        {shown.kind === "busy" && <Wait phase="replaying the registry with the change" since={shown.since} />}
        {proposing && <Wait phase="proposing" since={Date.now()} />}
        {why && <span className="warn">{why}</span>}
      </div>
    </div>
  );
}

/** The lists the inputs offer: axes, the chosen axis's values, rule sets, fields, roles, borders, and the scopes. */
function Lists({ pack, choices, axisValues, options }: { pack: PackDoc | null; choices: PackChoices | null; axisValues: string[]; options: ScopeOptions }) {
  const lists: [string, string[]][] = [
    ["axis", pack?.axes.map((a) => a.axis) ?? []],
    ["value", axisValues],
    ["set", choices?.sets ?? []],
    ["field", choices?.fields ?? []],
    ["role", choices?.roles ?? []],
    ["pick", choices?.picks ?? []],
    ["border", BORDERS],
    ["bucket", pack ? Object.keys(pack.buckets) : []],
    ["scope-site", options.sites],
    ["scope-dataset", options.datasets],
    ["scope-scanner", options.scanners],
    ["scope-batch", options.batches.map((b) => String(b.id))],
  ];
  return (
    <>
      {lists.map(([name, values]) => (
        <datalist key={name} id={lid(name)}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
    </>
  );
}

/** One field, by what the schema says it holds. */
function Field({ f, form, axisValues, onValue }: { f: FieldSpec; form: OpForm; axisValues: (axis: string) => string[]; onValue: (name: string, v: FieldValue) => void }) {
  const v = form.values[f.name];
  const head = (
    <span className="rf-label">
      {f.label}
      {f.help && <Hint text={f.help} />}
    </span>
  );
  switch (f.kind) {
    case "boolean":
      return (
        <label className="rf-row rf-check">
          {head}
          <span className="rf-input">
            <input type="checkbox" checked={v === true} aria-label={f.label} onChange={(e) => onValue(f.name, e.target.checked)} />
          </span>
        </label>
      );
    case "choice":
      return (
        <div className="rf-row">
          {head}
          <span className="chips rf-input" role="group" aria-label={f.label}>
            {f.options.map((o) => (
              <button key={o} type="button" className={v === o ? "opt on" : "opt"} aria-pressed={v === o} onClick={() => onValue(f.name, v === o ? "" : o)}>
                {o}
              </button>
            ))}
          </span>
        </div>
      );
    case "conditions":
      return (
        <div className="rf-row rf-rows">
          {head}
          <Conditions rows={(v as ConditionRow[]) ?? []} axisValues={axisValues} onRows={(rows) => onValue(f.name, rows)} />
        </div>
      );
    case "candidates":
      return (
        <div className="rf-row rf-rows">
          {head}
          <Candidates name={f.label} rows={(v as CandidateRow[]) ?? []} onRows={(rows) => onValue(f.name, rows)} />
        </div>
      );
    case "order":
      return (
        <div className="rf-row rf-rows">
          {head}
          <Order rows={(v as OrderRow[]) ?? []} onRows={(rows) => onValue(f.name, rows)} />
        </div>
      );
    case "bids":
      return (
        <div className="rf-row">
          {head}
          <Bids value={(v as BidsValue) ?? NEW_BIDS} onValue={(b) => onValue(f.name, b)} />
        </div>
      );
    default: {
      const text = typeof v === "string" ? v : "";
      const numeric = f.kind === "integer" || f.kind === "number";
      return (
        <label className="rf-row">
          {head}
          <span className={f.kind === "words" || f.name === "rule" || f.name === "set" ? "input mono rf-input" : "input rf-input"}>
            <input
              value={text}
              type={numeric ? "number" : "text"}
              step={f.kind === "integer" ? 1 : f.kind === "number" ? "any" : undefined}
              min={f.min ?? undefined}
              max={f.max ?? undefined}
              list={f.suggest ? lid(f.suggest) : undefined}
              aria-label={f.label}
              placeholder={placeholderOf(f)}
              onChange={(e) => onValue(f.name, e.target.value)}
            />
          </span>
        </label>
      );
    }
  }
}

function placeholderOf(f: FieldSpec): string | undefined {
  if (f.kind === "words") return 'mdc, "gd " (quote a word to keep its spaces)';
  if (f.kind === "strings") return "separated by commas";
  if (f.name === "rule") return "set/rule";
  if (f.kind === "number" && f.max === 1) return "0 to 1";
  if (f.kind === "json") return "a word, or JSON";
  return undefined;
}

/** Before or after another, or first or last; or where the operation puts it when not said. */
function Place({ form, onPlace }: { form: OpForm; onPlace: (p: OpForm["place"]) => void }) {
  const p = form.place;
  const keys: [OpForm["place"]["at"], string][] = [
    ["none", "Where it goes"],
    ["before", "Before"],
    ["after", "After"],
    ["first", "First"],
    ["last", "Last"],
  ];
  return (
    <div className="rf-row">
      <span className="rf-label">
        Place
        <Hint text="Placed just before or after another, or first or last; where nothing is said, the operation puts it where the contract says." />
      </span>
      <span className="rf-input rf-scope">
        <span className="chips" role="group" aria-label="Place">
          {keys.map(([at, words]) => (
            <button key={at} type="button" className={p.at === at ? "opt on" : "opt"} aria-pressed={p.at === at} onClick={() => onPlace({ at, ref: p.ref })}>
              {words}
            </button>
          ))}
        </span>
        {(p.at === "before" || p.at === "after") && (
          <span className="input mono">
            <input value={p.ref} aria-label={`${p.at === "before" ? "Before" : "After"} what`} placeholder="a rule, a set or a value" onChange={(e) => onPlace({ at: p.at, ref: e.target.value })} />
          </span>
        )}
      </span>
    </div>
  );
}

const TAG_CMP: [ConditionRow["cmp"], string][] = [
  ["ge", "at least"],
  ["le", "at most"],
  ["gt", "above"],
  ["lt", "below"],
  ["between", "between"],
  ["is", "is"],
  ["ne", "is not"],
  ["has", "has"],
  ["present", "present"],
];

/** The conditions of a rule or a silence, all of which must hold. */
function Conditions({ rows, axisValues, onRows }: { rows: ConditionRow[]; axisValues: (axis: string) => string[]; onRows: (rows: ConditionRow[]) => void }) {
  const set = (i: number, r: ConditionRow) => onRows(rows.map((x, j) => (j === i ? r : x)));
  return (
    <span className="rf-input rf-list">
      {rows.map((r, i) => (
        <span key={i} className="rf-cond">
          <span className="chips" role="group" aria-label={`Condition ${i + 1}`}>
            {(["tag", "words", "axis", "flag"] as const).map((k) => (
              <button key={k} type="button" className={r.kind === k ? "opt on" : "opt"} aria-pressed={r.kind === k} onClick={() => set(i, { ...r, kind: k })}>
                {k === "tag" ? "A number" : k === "words" ? "Words" : k === "axis" ? "An axis" : "A flag"}
              </button>
            ))}
            <button type="button" className={r.not ? "opt on" : "opt"} aria-pressed={r.not} onClick={() => set(i, { ...r, not: !r.not })}>
              Not
            </button>
          </span>
          {r.kind === "tag" && (
            <span className="rf-inline">
              <span className="input mono rf-short">
                <input value={r.tag} list={lid("field")} aria-label="Field" placeholder="te" onChange={(e) => set(i, { ...r, tag: e.target.value })} />
              </span>
              <span className="input select rf-sel">
                <select value={r.cmp} aria-label="Compared" onChange={(e) => set(i, { ...r, cmp: e.target.value as ConditionRow["cmp"] })}>
                  {TAG_CMP.map(([k, w]) => (
                    <option key={k} value={k}>
                      {w}
                    </option>
                  ))}
                </select>
              </span>
              {r.cmp !== "present" && (
                <span className="input rf-short">
                  <input value={r.value} aria-label="Than" placeholder="200" onChange={(e) => set(i, { ...r, value: e.target.value })} />
                </span>
              )}
              {r.cmp === "between" && (
                <span className="input rf-short">
                  <input value={r.value2} aria-label="And" placeholder="2800" onChange={(e) => set(i, { ...r, value2: e.target.value })} />
                </span>
              )}
            </span>
          )}
          {r.kind === "words" && (
            <span className="rf-inline">
              <span className="input mono">
                <input value={r.words} aria-label="Words" placeholder="mdc, gd" onChange={(e) => set(i, { ...r, words: e.target.value })} />
              </span>
              <span className="input mono rf-short">
                <input value={r.field} list={lid("field")} aria-label="In the field" placeholder="series_description" onChange={(e) => set(i, { ...r, field: e.target.value })} />
              </span>
            </span>
          )}
          {r.kind === "axis" && (
            <span className="rf-inline">
              <span className="input rf-short">
                <input value={r.axis} list={lid("axis")} aria-label="Axis" placeholder="provenance" onChange={(e) => set(i, { ...r, axis: e.target.value })} />
              </span>
              <span className="meta">is</span>
              <span className="input">
                <input value={r.is} list={lid(`cond-${i}`)} aria-label="Is" placeholder="one value, or several with commas" onChange={(e) => set(i, { ...r, is: e.target.value })} />
              </span>
              <datalist id={lid(`cond-${i}`)}>
                {axisValues(r.axis).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </span>
          )}
          {r.kind === "flag" && (
            <span className="input mono">
              <input value={r.flag} aria-label="Flag" placeholder="is_3d_tse" onChange={(e) => set(i, { ...r, flag: e.target.value })} />
            </span>
          )}
          <button type="button" className="icon-button" aria-label={`Remove condition ${i + 1}`} onClick={() => onRows(rows.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <button type="button" className="button quiet small" onClick={() => onRows([...rows, { ...NEW_CONDITION }])}>
        <Icon name="plus" />
        {rows.length === 0 ? "A condition" : "And another"}
      </button>
    </span>
  );
}

/** The conditions a scan meets to compete for a role (set_candidates): a value of an axis, or a field against a number. */
function Candidates({ name, rows, onRows }: { name: string; rows: CandidateRow[]; onRows: (rows: CandidateRow[]) => void }) {
  const set = (i: number, r: CandidateRow) => onRows(rows.map((x, j) => (j === i ? r : x)));
  return (
    <span className="rf-input rf-list">
      {rows.map((r, i) => (
        <span key={i} className="rf-cond">
          <span className="chips" role="group" aria-label={`${name} ${i + 1}`}>
            <button type="button" className={r.kind === "axis" ? "opt on" : "opt"} aria-pressed={r.kind === "axis"} onClick={() => set(i, { ...r, kind: "axis" })}>
              An axis
            </button>
            <button type="button" className={r.kind === "tag" ? "opt on" : "opt"} aria-pressed={r.kind === "tag"} onClick={() => set(i, { ...r, kind: "tag" })}>
              A field
            </button>
          </span>
          {r.kind === "axis" ? (
            <span className="rf-inline">
              <span className="input rf-short">
                <input value={r.axis} list={lid("axis")} aria-label="Axis" placeholder="body_part" onChange={(e) => set(i, { ...r, axis: e.target.value })} />
              </span>
              <span className="meta">is</span>
              <span className="input">
                <input value={r.is} aria-label="Is" placeholder="spine, neck, chest, other" onChange={(e) => set(i, { ...r, is: e.target.value })} />
              </span>
            </span>
          ) : (
            <span className="rf-inline">
              <span className="input mono rf-short">
                <input value={r.tag} list={lid("field")} aria-label="Field" placeholder="slice_thickness" onChange={(e) => set(i, { ...r, tag: e.target.value })} />
              </span>
              <span className="input select rf-sel">
                <select value={r.cmp} aria-label="Compared" onChange={(e) => set(i, { ...r, cmp: e.target.value as CandidateRow["cmp"] })}>
                  {(["is", "le", "lt", "ge", "gt"] as const).map((k) => (
                    <option key={k} value={k}>
                      {TAG_CMP.find(([c]) => c === k)?.[1] ?? k}
                    </option>
                  ))}
                </select>
              </span>
              <span className="input rf-short">
                <input value={r.value} aria-label="Than" placeholder="3" onChange={(e) => set(i, { ...r, value: e.target.value })} />
              </span>
            </span>
          )}
          <button type="button" className="icon-button" aria-label={`Remove ${name.toLowerCase()} ${i + 1}`} onClick={() => onRows(rows.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <button type="button" className="button quiet small" onClick={() => onRows([...rows, { ...NEW_CANDIDATE }])}>
        <Icon name="plus" />
        {rows.length === 0 ? "A condition" : "Another"}
      </button>
    </span>
  );
}

/** A near tie's order, best first: prefer or avoid values, or the lowest or highest number. */
function Order({ rows, onRows }: { rows: OrderRow[]; onRows: (rows: OrderRow[]) => void }) {
  const set = (i: number, r: OrderRow) => onRows(rows.map((x, j) => (j === i ? r : x)));
  return (
    <span className="rf-input rf-list">
      {rows.map((r, i) => (
        <span key={i} className="rf-cond">
          <span className="rf-rank">{i + 1}</span>
          <span className="input rf-short">
            <input value={r.of} list={lid("field")} aria-label={`Step ${i + 1} of`} placeholder="orientation" onChange={(e) => set(i, { ...r, of: e.target.value })} />
          </span>
          <span className="input select rf-sel">
            <select value={r.how} aria-label={`Step ${i + 1} how`} onChange={(e) => set(i, { ...r, how: e.target.value as OrderRow["how"] })}>
              <option value="prefer">these first</option>
              <option value="avoid">these last</option>
              <option value="lowest">the lowest</option>
              <option value="highest">the highest</option>
            </select>
          </span>
          {(r.how === "prefer" || r.how === "avoid") && (
            <span className="input">
              <input value={r.values} aria-label={`Step ${i + 1} values`} placeholder="Axial, Coronal, Sagittal" onChange={(e) => set(i, { ...r, values: e.target.value })} />
            </span>
          )}
          <span className="input rf-short">
            <input value={r.roles} list={lid("role")} aria-label={`Step ${i + 1} roles`} placeholder="every role" onChange={(e) => set(i, { ...r, roles: e.target.value })} />
          </span>
          <button type="button" className="icon-button" aria-label={`Remove step ${i + 1}`} onClick={() => onRows(rows.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <button type="button" className="button quiet small" onClick={() => onRows([...rows, { ...NEW_ORDER }])}>
        <Icon name="plus" />
        {rows.length === 0 ? "A step" : "Then"}
      </button>
    </span>
  );
}

/** A value's BIDS name: its token, its suffix and datatype, its acq- token, or an entity's token. */
function Bids({ value: b, onValue }: { value: BidsValue; onValue: (b: BidsValue) => void }) {
  const kinds: [BidsValue["kind"], string][] = [
    ["token", "Token"],
    ["suffix", "Suffix"],
    ["acq", "acq-"],
    ["entity", "Entity"],
  ];
  return (
    <span className="rf-input rf-scope">
      <span className="chips" role="group" aria-label="BIDS name as">
        {kinds.map(([k, w]) => (
          <button key={k} type="button" className={b.kind === k ? "opt on" : "opt"} aria-pressed={b.kind === k} onClick={() => onValue({ ...b, kind: k })}>
            {w}
          </button>
        ))}
      </span>
      <span className="rf-inline">
        {b.kind === "token" && (
          <span className="input mono rf-short">
            <input value={b.token} aria-label="Token" placeholder="MPR" onChange={(e) => onValue({ ...b, token: e.target.value })} />
          </span>
        )}
        {b.kind === "acq" && (
          <span className="input mono rf-short">
            <input value={b.acq} aria-label="acq token" placeholder="ZZGRE" onChange={(e) => onValue({ ...b, acq: e.target.value })} />
          </span>
        )}
        {b.kind === "suffix" && (
          <>
            <span className="input mono rf-short">
              <input value={b.suffix} aria-label="Suffix" placeholder="T2w" onChange={(e) => onValue({ ...b, suffix: e.target.value })} />
            </span>
            <span className="input select rf-sel">
              <select value={b.datatype} aria-label="Datatype" onChange={(e) => onValue({ ...b, datatype: e.target.value })}>
                <option value="">its datatype</option>
                {["anat", "dwi", "func", "fmap", "perf"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </span>
          </>
        )}
        {b.kind === "entity" && (
          <>
            <span className="input select rf-sel">
              <select value={b.entity} aria-label="Entity" onChange={(e) => onValue({ ...b, entity: e.target.value })}>
                {["part", "mt", "rec"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </span>
            <span className="input mono rf-short">
              <input value={b.token} aria-label="Token" placeholder="mag" onChange={(e) => onValue({ ...b, token: e.target.value })} />
            </span>
          </>
        )}
      </span>
    </span>
  );
}
