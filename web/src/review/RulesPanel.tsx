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
import { ops } from "../ops/client";
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
  refusalWords,
  roleWord,
  saveRefusal,
  tieWords,
  toggleKind,
  versionsWords,
  type BodyPart,
  type Contrast,
  type Dimension,
  type MapAnswer,
  type Rules,
  type RulesDoc,
  type Saved,
  type Scope,
} from "./mainScans";
import { KindTag, type Slot } from "./MainScansParts";

export interface RulesPanelProps {
  caps: Capabilities;
  scope: Scope;
  doc: RulesDoc;
  /** The draft where there is one, else the saved rules. */
  working: Rules;
  dirty: boolean;
  role: string;
  roles: string[];
  onRole: (role: string) => void;
  /** The current role's map, with the draft as it settled; null while it is first read. */
  map: MapAnswer | null;
  /** A newer draft is being asked about. */
  mapBusy: boolean;
  slot: Slot;
  onChange: (next: Rules) => void;
  onRevert: () => void;
  onClose: () => void;
  /** The rules read again; resolves to the fresh document. */
  reload: () => Promise<RulesDoc | null>;
  /** The picks read again, once a save's run has ended. */
  onRun: () => void;
}

type Status = { tone: "ok" | "warn"; words: string } | { tone: "busy"; words: string; since: number };

/** The slice thickness the slider draws: 1 to 6 mm, its top end any. */
const MM_ANY = 6;

export function RulesPanel(p: RulesPanelProps) {
  const { caps, scope, doc, working, dirty, role, map } = p;
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [following, setFollowing] = useState<{ version: number; job: number; since: number } | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [yaml, setYaml] = useState<{ version: number; text: string | null; why: string | null } | null>(null);
  const version = doc.current.version;
  const rr = working.roles[role];
  const saved = doc.current.rules.roles[role];
  const held = map ? map.kinds.map((k) => k.key) : [];
  const full = rr ? kindsOrder(rr, held) : [];
  // the kinds the data holds, in the rules' order, once the map says which they are
  const shown = map ? full.filter((k) => held.includes(k)) : full;
  const allowed = (k: string) => map?.kinds.find((x) => x.key === k)?.allowed !== false;
  const used = (k: string) => !rr?.not_used.includes(k);
  const ranked = shown.filter(used);
  const same = working.same_kind_in_one_visit;
  const maySave = may(caps, "pipelines:work") && served(caps, RULES_SAVE_DOOR);
  const readsText = served(caps, RULES_TEXT_DOOR);
  const change = (fn: (r: Rules) => void) => p.onChange(edited(working, fn));

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

  // a save's pick run, followed until it ends; then the page reads its picks again
  useEffect(() => {
    if (!following) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { version: v, job, since } = following;
    const tick = () => {
      ops.job(job).then(
        (row) => {
          if (!alive) return;
          if (row.state === "done") {
            setStatus({ tone: "ok", words: `Version ${v} saved; its picks are written.` });
            setFollowing(null);
            p.onRun();
          } else if (row.state === "failed" || row.state === "cancelled") {
            setStatus({ tone: "warn", words: `Version ${v} saved; its pick run ${row.state === "failed" ? "stopped" : "was cancelled"}${row.error ? `: ${row.error}` : "."}` });
            setFollowing(null);
            p.onRun();
          } else {
            setStatus({ tone: "busy", words: `Version ${v} saved; picking with it (job ${job}, ${row.state})`, since });
            timer = setTimeout(tick, 2000);
          }
        },
        () => {
          if (alive) timer = setTimeout(tick, 4000);
        },
      );
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the run is followed once a save; the page's callback may change meanwhile
  }, [following]);

  const follow = (s: Saved) => {
    const v = s.version || version + 1;
    if (s.job === null) {
      setStatus({ tone: "ok", words: `Version ${v} saved.` });
      p.onRun();
      return;
    }
    if (!(may(caps, "pipelines:see") && served(caps, "GET /api/jobs/{id}"))) {
      setStatus({ tone: "ok", words: `Version ${v} saved; its pick run is queued (job ${s.job}).` });
      p.onRun();
      return;
    }
    const since = Date.now();
    setStatus({ tone: "busy", words: `Version ${v} saved; picking with it (job ${s.job})`, since });
    setFollowing({ version: v, job: s.job, since });
  };

  const save = async () => {
    if (!dirty || reason.trim() === "" || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const s = await mainScans.save(scope, working, reason, version);
      setReason("");
      await p.reload();
      p.onRevert();
      follow(s);
    } catch (e) {
      const r = saveRefusal(e);
      if (r.kind === "stale") {
        // someone saved first: the rules are read again, and this draft, made on the older version, is let go
        const fresh = await p.reload();
        p.onRevert();
        const c = fresh?.current;
        setStatus({ tone: "warn", words: c ? `${c.author ?? "Someone"} saved version ${c.version} first. The rules now show it; your changes were not saved.` : "Someone saved first; your changes were not saved." });
      } else {
        setStatus({ tone: "warn", words: refusalWords(r) });
      }
    } finally {
      setSaving(false);
    }
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
          <h2>Main scans of {scope.name}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Close the rules" onClick={p.onClose}>
          <Icon name="x" />
        </button>
      </div>

      <div className="ms-effect" aria-busy={p.mapBusy} aria-label="What saving changes">
        <span className="eyebrow">{dirty ? `If saved · ${roleWord(role)}` : `Saved · ${roleWord(role)}`}</span>
        <span className="ms-effect-line">{!dirty ? "No change yet" : effect ? effectWords(effect) : "Reading what it changes"}</span>
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

      <div className="ms-rules-body">
        <div className="chips" role="group" aria-label="Role">
          {p.roles.map((r) => (
            <button key={r} type="button" className={r === role ? "opt on" : "opt"} aria-pressed={r === role} onClick={() => p.onRole(r)}>
              {roleWord(r)}
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
              {shown.length === 0 && <p className="ms-none">No kind of this role here.</p>}
              {shown.map((k, i) => {
                const on = used(k);
                return (
                  <div key={k} className="ms-order-row">
                    <span className="ms-rank">{on ? ranked.indexOf(k) + 1 : ""}</span>
                    <span className="ms-order-name">
                      <KindTag kind={k} slot={p.slot} off={!on || !allowed(k)} />
                      {isNewKind(saved, k) && <span className="tag caution">new</span>}
                    </span>
                    <button type="button" className={on ? "opt on" : "opt"} aria-pressed={on} aria-label={`${k}: ${on ? "used" : "not used"}`} onClick={() => p.onChange(toggleKind(working, role, held, k))}>
                      {on ? "Used" : "Not used"}
                    </button>
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
              {hasContrastKinds(full) && (
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
            <button type="button" className="button quiet ms-text-toggle" aria-pressed={textOpen} onClick={() => setTextOpen((t) => !t)}>
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
      </div>

      <div className="ms-rules-foot">
        {maySave ? (
          <label className="ms-reason">
            Why this version
            <input type="text" value={reason} placeholder="the lesion study wants 3D T1 only" onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
          </label>
        ) : (
          <span className="ms-none">Saving a version needs work on Pipelines.</span>
        )}
        <div className="row ms-acts">
          {maySave && (
            <button type="button" className="button" disabled={!dirty || reason.trim() === "" || saving} onClick={() => void save()}>
              Save as version {version + 1}
            </button>
          )}
          <button type="button" className="button secondary" disabled={!dirty || saving} onClick={p.onRevert}>
            Back to version {version}
          </button>
        </div>
        {status &&
          (status.tone === "busy" ? (
            <Wait phase={status.words} since={status.since} />
          ) : (
            <p className={status.tone === "warn" ? "warn ms-status" : "ms-status"} role="status">
              {status.words}
            </p>
          ))}
        <span className="ms-versions">{versionsWords(doc.versions)}</span>
      </div>
    </aside>
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
