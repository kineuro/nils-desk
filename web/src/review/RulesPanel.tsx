// SPDX-License-Identifier: AGPL-3.0-only
// The Rules panel beside the Main scans page (record 55, decision 6): a
// dataset's or a cohort's own rules for its main scans, drawn as the approved
// canvas draws them. The effect against the saved version comes first; then
// the role, how scans are kept alike, the kinds in the order they are taken,
// what is allowed, and, folded, how two scans of one kind in a visit are told
// apart; the rules as text; and a why with "Save as version N" and "Back to
// version N". The draft lives in the browser until it is saved; the page asks
// the map door again with it at each change. A save queues the scope's pick
// run, and one line follows that run until it ends.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { messageOf } from "../settings/common";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import {
  KEEP_ALIKE,
  RULES_SAVE_DOOR,
  RULES_TEXT_DOOR,
  WEIGHTS,
  edited,
  effectRows,
  effectWords,
  hasContrastKinds,
  isNewKind,
  kindsOrder,
  mainScans,
  moveKind,
  moveTie,
  pctWords,
  roleWord,
  tieWords,
  toggleKind,
  versionsWords,
  type BodyPart,
  type Contrast,
  type Dimension,
  type MapAnswer,
  type Rules,
  type RulesDoc,
  type Scope,
} from "./mainScans";
import { KindTag, type Slot } from "./MainScansParts";

export type Status = { tone: "ok" | "warn"; words: string } | { tone: "busy"; words: string; since: number };

export interface RulesPanelProps {
  caps: Capabilities;
  scope: Scope;
  /** The scope's own name, as the engine answered it. */
  title: string;
  doc: RulesDoc;
  /** The draft where there is one, else the saved rules. */
  working: Rules;
  dirty: boolean;
  role: string;
  roles: string[];
  /** The roles whose rules the draft changes: a save writes every role. */
  changedRoles: string[];
  onRole: (role: string) => void;
  /** The current role's map, with the draft as it settled; null while it is first read or could not be. */
  map: MapAnswer | null;
  /** Since when the map is first read, and why it could not be. */
  mapSince: number | null;
  mapFailed: string | null;
  /** A newer draft is being asked about, or its answer has not come. */
  mapBusy: boolean;
  /** Why the map of the latest changes could not be read, while the one shown is older. */
  mapStale: string | null;
  slot: Slot;
  onChange: (next: Rules) => void;
  onRevert: () => void;
  onClose: () => void;
  /** A save of the draft with its why; true when it was saved. The page follows its run. */
  onSave: (reason: string) => Promise<boolean>;
  saving: boolean;
  /** The map's answer is the draft's own, so the effect shown is what saving does. */
  effectReady: boolean;
  /** The one line about the last save, or the draft moved onto a newer version. */
  status: Status | null;
}

/** The slice thickness the slider draws: 1 to 6 mm, its top end any. */
const MM_ANY = 6;

export function RulesPanel(p: RulesPanelProps) {
  const { caps, scope, doc, working, dirty, role, map, saving } = p;
  const [reason, setReason] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [yaml, setYaml] = useState<{ version: number; text: string | null; why: string | null } | null>(null);
  const version = doc.current.version;
  const rr = working.roles[role];
  const saved = doc.current.rules.roles[role];
  // only the kinds the scope holds, from the map; the rest keep their places, hidden
  const held = map ? map.kinds.map((k) => k.key) : [];
  const shown = rr && map ? kindsOrder(rr, held).filter((k) => held.includes(k)) : [];
  const allowed = (k: string) => map?.kinds.find((x) => x.key === k)?.allowed !== false;
  const used = (k: string) => !rr?.not_used.includes(k);
  const ranked = shown.filter(used);
  const same = working.same_kind_in_one_visit;
  const maySave = may(caps, "pipelines:work") && served(caps, RULES_SAVE_DOOR);
  const readsText = served(caps, RULES_TEXT_DOOR);
  const change = (fn: (r: Rules) => void) => p.onChange(edited(working, fn));
  const canSave = dirty && p.effectReady && !saving && reason.trim() !== "";

  // the rules as text, of the version saved now
  useEffect(() => {
    if (!textOpen || !readsText) return;
    let alive = true;
    mainScans.text(scope, version).then(
      (text) => alive && setYaml({ version, text, why: null }),
      (e: unknown) => alive && setYaml({ version, text: null, why: messageOf(e) }),
    );
    return () => {
      alive = false;
    };
  }, [textOpen, readsText, scope, version]);

  const save = async () => {
    if (!canSave) return;
    if (await p.onSave(reason)) setReason("");
  };

  const effect = dirty ? (map?.effect ?? null) : null;
  const rows = map ? effectRows(effect?.before ?? map.metrics, map.metrics, role) : [];
  const mm = rr?.slice_thickness_at_most_mm ?? null;

  return (
    <aside className="ms-rules" aria-label={`Rules for ${scope.name}`}>
      <div className="ms-rules-head">
        <div className="grow">
          <span className="eyebrow">
            Rules · version {version}
            {!doc.current.saved ? ", the pack's defaults" : ""}
            {dirty ? ", changed" : ""}
          </span>
          <h2>Main scans of {p.title}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Close the rules" onClick={p.onClose}>
          <Icon name="x" />
        </button>
      </div>

      <div className={p.mapStale ? "ms-effect stale" : "ms-effect"} aria-busy={p.mapBusy} aria-label="What saving changes">
        <span className="eyebrow">{dirty ? `If saved · ${roleWord(role)}` : `Saved · ${roleWord(role)}`}</span>
        <span className="ms-effect-line">{!dirty ? "No change yet" : effect ? effectWords(effect) : "Reading what it changes"}</span>
        {p.mapStale && <span className="warn ms-status">The effect of your latest changes could not be read: {p.mapStale}</span>}
        {rows.length > 0 && (
          <div className="ms-effect-rows">
            {rows.map((r) => (
              <div key={r.label} className="ms-effect-row">
                <span className="label">{r.label}</span>
                <span className="before">{pctWords(r.before)}</span>
                <span className="to">to</span>
                <span className={`after ${r.way}`}>{pctWords(r.after)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <fieldset className="ms-rules-body" disabled={saving}>
        <div className="chips" role="group" aria-label="Role of the rules">
          {p.roles.map((r) => (
            <button key={r} type="button" className={r === role ? "opt on" : "opt"} aria-pressed={r === role} onClick={() => p.onRole(r)}>
              {roleWord(r)}
              {p.changedRoles.includes(r) && <span className="ms-key-changed"> · changed</span>}
            </button>
          ))}
        </div>

        {rr && (
          <>
            <div className="ms-rules-sec">
              <span className="eyebrow">Keep alike</span>
              <div className="ms-wide-keys" role="group" aria-label="Keep alike">
                {KEEP_ALIKE.map((k) => (
                  <button key={k.key} type="button" className={rr.keep_alike === k.key ? "opt on" : "opt"} aria-pressed={rr.keep_alike === k.key} onClick={() => change((r) => void (r.roles[role].keep_alike = k.key))}>
                    {k.words}
                  </button>
                ))}
              </div>
            </div>

            <div className="ms-rules-sec">
              <span className="eyebrow">Kinds, in the order they are taken</span>
              {!map && p.mapFailed && <p className="warn">The kinds could not be read: {p.mapFailed}</p>}
              {!map && !p.mapFailed && <Wait phase="reading the kinds" since={p.mapSince ?? Date.now()} />}
              {map && shown.length === 0 && <p className="ms-none">No kind of this role here.</p>}
              {shown.map((k, i) => {
                const on = used(k);
                return (
                  <div key={k} className="ms-order-row">
                    <span className="ms-rank">{on ? ranked.indexOf(k) + 1 : ""}</span>
                    <span className="ms-order-name">
                      <KindTag kind={k} slot={p.slot} off={!on || !allowed(k)} />
                      {isNewKind(saved, k) && <span className="tag caution">new</span>}
                    </span>
                    <label className="ms-use">
                      <input type="checkbox" checked={on} aria-label={`Use ${k}`} onChange={() => p.onChange(toggleKind(working, role, k))} />
                      Used
                    </label>
                    <button type="button" className="icon-button" aria-label={`Move ${k} up`} disabled={i === 0} onClick={() => p.onChange(moveKind(working, role, held, k, -1, shown))}>
                      <Icon name="chevron-up" />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Move ${k} down`} disabled={i === shown.length - 1} onClick={() => p.onChange(moveKind(working, role, held, k, 1, shown))}>
                      <Icon name="chevron-down" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="ms-rules-sec">
              <span className="eyebrow">Allowed</span>
              {hasContrastKinds(held) && (
                <Keys<Contrast>
                  name="Contrast"
                  value={rr.contrast}
                  keys={[
                    ["either", "Either"],
                    ["without", "Without"],
                    ["with", "With"],
                  ]}
                  onPick={(v) => change((r) => void (r.roles[role].contrast = v))}
                />
              )}
              <Keys<Dimension>
                name="Dimension"
                value={rr.dimension}
                keys={[
                  ["any", "2D or 3D"],
                  ["3d", "3D only"],
                ]}
                onPick={(v) => change((r) => void (r.roles[role].dimension = v))}
              />
              <Keys<BodyPart>
                name="Body part"
                value={rr.body_part}
                keys={[
                  ["brain", "Brain", "Brain, brain-neck, or not stated"],
                  ["any", "Any", "Every body part"],
                ]}
                onPick={(v) => change((r) => void (r.roles[role].body_part = v))}
              />
              <label className="ms-range">
                <span className="name">Slice thickness</span>
                <input
                  type="range"
                  min={1}
                  max={MM_ANY}
                  step={0.5}
                  value={mm === null ? MM_ANY : Math.min(MM_ANY, Math.max(1, mm))}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    change((r) => void (r.roles[role].slice_thickness_at_most_mm = v >= MM_ANY ? null : v));
                  }}
                />
                <span className="val">{mm === null ? "any" : `at most ${mm.toFixed(1)} mm`}</span>
              </label>
            </div>
          </>
        )}

        <div className="ms-rules-sec">
          <button type="button" className="button quiet ms-fold" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
            <Icon name="chevron-down" />
            Two scans of one kind in a visit
          </button>
          {advanced && (
            <div className="ms-fold-body">
              <span className="eyebrow">
                The score&apos;s parts
                <Hint text="How the pack's score weighs two candidates of one kind. A derived series scores that share of its score." />
              </span>
              {WEIGHTS.map((w) => (
                <label key={w.key} className="ms-range wide">
                  <span className="name">{w.words}</span>
                  <input type="range" min={0} max={0.4} step={0.01} value={same.weights[w.key] ?? 0} onChange={(e) => {
                    const v = Number(e.target.value);
                    change((r) => void (r.same_kind_in_one_visit.weights[w.key] = v));
                  }} />
                  <span className="val mono">{(same.weights[w.key] ?? 0).toFixed(2)}</span>
                </label>
              ))}
              <label className="ms-range wide">
                <span className="name">A derived series scores</span>
                <input type="range" min={0} max={1} step={0.05} value={same.derived_series_scores} onChange={(e) => {
                  const v = Number(e.target.value);
                  change((r) => void (r.same_kind_in_one_visit.derived_series_scores = v));
                }} />
                <span className="val mono">× {same.derived_series_scores.toFixed(2)}</span>
              </label>
              <label className="ms-range wide">
                <span className="name">A near tie is within</span>
                <input type="range" min={0} max={10} step={1} value={same.near_tie_within_percent} onChange={(e) => {
                  const v = Number(e.target.value);
                  change((r) => void (r.same_kind_in_one_visit.near_tie_within_percent = v));
                }} />
                <span className="val mono">{same.near_tie_within_percent} %</span>
              </label>
              <span className="eyebrow">A near tie goes to</span>
              {same.near_tie_goes_to.map((t, i) => (
                <div key={t} className="ms-tie-row">
                  <span className="ms-rank">{i + 1}</span>
                  <span>{tieWords(t)}</span>
                  <button type="button" className="icon-button" aria-label={`Move ${tieWords(t)} up`} disabled={i === 0} onClick={() => p.onChange(moveTie(working, t, -1))}>
                    <Icon name="chevron-up" />
                  </button>
                  <button type="button" className="icon-button" aria-label={`Move ${tieWords(t)} down`} disabled={i === same.near_tie_goes_to.length - 1} onClick={() => p.onChange(moveTie(working, t, 1))}>
                    <Icon name="chevron-down" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {readsText && (
          <div className="ms-rules-sec">
            <button type="button" className="button quiet ms-text-toggle" aria-expanded={textOpen} onClick={() => setTextOpen((t) => !t)}>
              <Icon name="code" />
              {textOpen ? "Hide the text" : "As text"}
            </button>
            {textOpen && (
              <>
                {dirty && <span className="ms-none">Version {version} as saved; your changes are not in it yet.</span>}
                {yaml === null || yaml.version !== version ? <span className="ms-none">Reading the text.</span> : yaml.why ? <p className="warn">The text could not be read: {yaml.why}</p> : <pre className="ms-yaml">{yaml.text}</pre>}
              </>
            )}
          </div>
        )}
      </fieldset>

      <div className="ms-rules-foot">
        {maySave ? (
          <label className="ms-reason">
            Why this version
            <input type="text" value={reason} disabled={saving} placeholder="the lesion study wants 3D T1 only" onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
          </label>
        ) : (
          <span className="ms-none">Saving a version needs work on Pipelines.</span>
        )}
        <div className="row ms-acts">
          {maySave && (
            <button type="button" className="button" disabled={!canSave} onClick={() => void save()}>
              Save as version {version + 1}
            </button>
          )}
          <button type="button" className="button secondary" disabled={!dirty || saving} onClick={p.onRevert}>
            Back to version {version}
          </button>
        </div>
        <StatusLine status={p.status} />
        <span className="ms-versions">{versionsWords(doc.versions)}</span>
      </div>
    </aside>
  );
}

/** The one line about a save and its pick run, or a draft moved onto a newer version. */
export function StatusLine({ status }: { status: Status | null }) {
  if (!status) return null;
  if (status.tone === "busy") return <Wait phase={status.words} since={status.since} />;
  return (
    <p className={status.tone === "warn" ? "warn ms-status" : "ms-status"} role="status">
      {status.words}
    </p>
  );
}

/** One allowed field's keys, the chosen one in colour. */
function Keys<T extends string>({ name, value, keys, onPick }: { name: string; value: T; keys: [T, string, string?][]; onPick: (v: T) => void }) {
  return (
    <div className="ms-allow" role="group" aria-label={name}>
      <span className="name">{name}</span>
      {keys.map(([k, words, tip]) => (
        <button key={k} type="button" className={value === k ? "opt on" : "opt"} aria-pressed={value === k} title={tip} onClick={() => onPick(k)}>
          {words}
        </button>
      ))}
    </div>
  );
}
