// SPDX-License-Identifier: AGPL-3.0-only
// Why is this a T2w (record 27, R5d): the explain door read for one stack,
// axis by axis with how sure the pack was and because of what, the whole
// evidence kept. A decision otherwise at a scope goes through the stack's
// review item; the way to teach the rules instead is a word for the site,
// tried on the batch first. On an engine without the door, the item's own
// evidence stands in.

import { useEffect, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { ops, type ReviewItem } from "../ops/client";
import { whenWords } from "../data/sources";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { acts, batchOf, becauseWords, membersOf, refusalWords, review, SCOPES, type Explain, type ExplainAxis, type Scope } from "./client";
import { kindOf } from "./triage";

const n = (v: number) => v.toLocaleString("en-US");

export interface ExplainProps {
  caps: Capabilities;
  stack: number;
  /** The review item that opened it, when one did: a decision goes through it. */
  item: ReviewItem | null;
  onClose: () => void;
  onLook: (stack: number) => void;
  onAddWord: (at: { axis: string; value: string; scope: Scope; pack: string | null }) => void;
  onDecided: (words: string) => void;
}

/** The table of the explanation: axis, value, how sure, because. */
export function ExplainTable({ axes, below }: { axes: ExplainAxis[]; below: number }) {
  return (
    <div className="table-wrap">
      <table className="thin">
        <thead>
          <tr>
            <th>Axis</th>
            <th>Value</th>
            <th className="num">Sure</th>
            <th>Because</th>
          </tr>
        </thead>
        <tbody>
          {axes.map((a) => {
            const unsure = a.value === null || a.confidence < below;
            return (
              <tr key={a.axis}>
                <td>{a.axis}</td>
                <td>
                  {unsure ? (
                    <>
                      <span className="tag caution">unsure</span> {a.value ? `${a.label ?? a.value}?` : "nothing"}
                    </>
                  ) : (
                    <b>{a.label ?? a.value}</b>
                  )}
                </td>
                <td className="num">{a.confidence.toFixed(2)}</td>
                <td className="meta">
                  {becauseWords(a)}
                  {a.value !== null && a.confidence < below && !a.decision ? ` · below ${below.toFixed(2)}, so it asked` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The explanation an older engine cannot give: the item's own evidence as axes. */
export function explainFromItem(item: ReviewItem, stack: number): Explain {
  const k = kindOf(item.kind);
  const ev = (item.evidence ?? {}) as Json;
  const value = typeof ev.value === "string" ? ev.value : typeof ev.guess === "string" ? ev.guess : null;
  const confidence = typeof ev.confidence === "number" ? ev.confidence : 0;
  const axes: ExplainAxis[] = k.classifier ? [{ axis: k.area, value, confidence, tier: typeof ev.tier === "string" ? ev.tier : k.what, evidence: null, decision: null }] : [];
  return { stack, pack: typeof ev.pack === "string" ? ev.pack : "", version: typeof ev.pack_version === "string" ? ev.pack_version : null, overlay: null, axes };
}

export function ExplainDialog({ caps, stack, item, onClose, onLook, onAddWord, onDecided }: ExplainProps) {
  const [explain, setExplain] = useState<Explain | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const has = served(caps, "GET /api/explain/{stack}");
  useEffect(() => {
    let alive = true;
    if (!has) {
      if (item) setExplain(explainFromItem(item, stack));
      else setWhy("This engine has no explain door yet; the queue's items still say what they found.");
      return;
    }
    review
      .explain(stack)
      .then((e) => alive && setExplain(e))
      .catch((e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
  }, [has, stack, item]);

  const may = acts(caps).decide && item !== null;
  const axes = explain?.axes ?? [];
  const unsureAxis = axes.find((a) => a.value === null || a.confidence < 0.65) ?? axes[0] ?? null;
  const [axis, setAxis] = useState<string | null>(null);
  const chosen = axes.find((a) => a.axis === axis) ?? unsureAxis;
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<(typeof SCOPES)[number]["scope"]>("stack");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const title = (() => {
    const named = axes.find((a) => a.axis === "role") ?? axes.find((a) => a.axis === "base") ?? axes[0];
    return named?.value ? `Why is this a ${named.label ?? named.value}?` : "Why was this judged so?";
  })();
  const batch = item ? batchOf(item) : { id: null, name: null };
  const pack = explain?.pack ?? null;
  const packName = pack ? pack.split("@")[0] : (caps.engine?.packs[0]?.name ?? null);
  const version = explain?.version ?? (pack?.includes("@") ? pack.split("@")[1] : (caps.engine?.packs[0]?.version ?? ""));
  const wordScope: Scope = batch.id !== null ? { kind: "batch", id: batch.id, name: batch.name } : { kind: "everything", pack: packName ?? "", version };

  const decide = () => {
    if (!item || !chosen) return;
    setBusy(true);
    setRefused(null);
    ops
      .reviewApply(item.id, { value: value.trim(), scope, why: `decided otherwise from Why is this, on stack ${stack}` })
      .then(() => onDecided(`Decided ${chosen.axis} is ${value.trim()} for ${SCOPES.find((s) => s.scope === scope)?.words ?? scope}.`))
      .catch((e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      });
  };

  return (
    <Dialog
      title={title}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          {chosen && packName && (
            <button type="button" className="button quiet" onClick={() => onAddWord({ axis: chosen.axis, value: chosen.value ?? "", scope: wordScope, pack: packName })}>
              <Icon name="pencil" />
              Add a word for the site
            </button>
          )}
          <span className="grow" />
          <button type="button" className="button secondary" onClick={() => onLook(stack)}>
            Look at it
          </button>
          {may && (
            <button type="button" className="button" disabled={busy || value.trim() === "" || !chosen} onClick={decide}>
              Decide
            </button>
          )}
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <dl className="facts">
        <dt>stack</dt>
        <dd>
          <span className="num">{n(stack)}</span>
          {item ? ` · ${n(membersOf(item))} ${membersOf(item) === 1 ? "stack" : "stacks alike"}` : ""}
          {batch.name || batch.id !== null ? (
            <>
              {" · batch "}
              <span className="path">{batch.name ?? batch.id}</span>
            </>
          ) : null}
        </dd>
        <dt>judged by</dt>
        <dd>
          {explain ? `${explain.pack}${explain.version ? ` ${explain.version}` : ""}` : "the pack"}
          {explain?.overlay ? (
            <>
              {" · under the site's words "}
              <span className="path">{explain.overlay}</span>
            </>
          ) : null}
          {item ? ` · ${whenWords(item.created_at)}` : ""}
        </dd>
      </dl>
      {!explain && !why && <Wait phase="reading why" since={since} size="panel" />}
      {why && <p className="warn">{why}</p>}
      {explain && axes.length === 0 && <p className="meta">The engine keeps no axis on this stack.</p>}
      {explain && axes.length > 0 && <ExplainTable axes={axes} below={0.65} />}
      {chosen && (
        <div className="field">
          <span className="label">Decide {chosen.axis}</span>
          <div className="field-row">
            {axes.length > 1 && (
              <span className="input select">
                <select value={chosen.axis} aria-label="The axis to decide" onChange={(e) => { setAxis(e.target.value); setValue(""); }}>
                  {axes.map((a) => (
                    <option key={a.axis} value={a.axis}>
                      {a.axis}
                    </option>
                  ))}
                </select>
              </span>
            )}
            <span className="input">
              <input value={value} placeholder={chosen.value ? `${chosen.value}, or another value` : `a value of ${chosen.axis}`} aria-label={`The value of ${chosen.axis}`} onChange={(e) => setValue(e.target.value)} disabled={!may} />
            </span>
            <span className="seg" role="radiogroup" aria-label="The decision's scope">
              {SCOPES.map((s) => (
                <button key={s.scope} type="button" role="radio" aria-checked={scope === s.scope} className={scope === s.scope ? "on" : ""} disabled={!may} onClick={() => setScope(s.scope)}>
                  {s.words}
                </button>
              ))}
            </span>
          </div>
          {item === null && <span className="meta">A decision goes through the stack&apos;s review item; none opened this.</span>}
          {item !== null && !acts(caps).decide && <span className="meta">Deciding needs work on the Review page.</span>}
        </div>
      )}
      <Says head="Decide it, or teach the rules">
        A person&apos;s decision outranks the rules and survives re-sorting. If the series description holds a word the pack should know, add it to one of the site&apos;s lists instead and try it on the
        batch first: that moves every stack the word reaches, not this one alone.
      </Says>
    </Dialog>
  );
}
