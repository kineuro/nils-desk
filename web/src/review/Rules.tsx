// SPDX-License-Identifier: AGPL-3.0-only
// How scans are sorted (record 26): the pack in a strip, the scope a rule
// change is scoped to, the axes in the order they are decided, the chosen
// axis's values with their words and flags and how they fared in the scope,
// a word added to a list and tried on real stacks before it is proposed, the
// proposals with what adopting each would move, and the keyword-tune station
// started on the chosen scope and axis.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Json } from "../ask/client";
import { StationRun } from "../assistant/StationRun";
import { stationsServed } from "../assistant/stations";
import type { Verdict } from "../assistant/stations";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { data, ops, type Batch, type OverlayRow, type ReviewItem, type Signals } from "../ops/client";
import { assistantOffered } from "../sections";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import {
  acts,
  axisCounts,
  axisWords,
  closureWords,
  familyOf,
  originsOf,
  overlayChange,
  refusalWords,
  review,
  scopeString,
  scopeWords,
  siteWords,
  tryWords,
  valueCounts,
  wordOverlay,
  type Closure,
  type OverlayDoc,
  type PackAxis,
  type PackDoc,
  type Scope,
  type TryResult,
} from "./client";

const n = (v: number) => v.toLocaleString("en-US");

/** Where a word is added: the axis and the value, in a scope, on a pack. */
export interface WordAt {
  axis: string;
  value: string;
  scope: Scope;
  pack: string | null;
}

export interface RulesProps {
  caps: Capabilities;
  items: ReviewItem[];
  /** Add a word opened from elsewhere, prefilled. */
  wordAt: WordAt | null;
  onWordClose: () => void;
  onChanged: (words: string) => void;
}

/** The chosen axis's values as a table: value, words with the site's on top, flag, decided, unsure. */
export function AxisTable(props: { axis: PackAxis; signals: Signals | null; overlays: OverlayRow[]; may: boolean; all: boolean; onAll: () => void; onAdd: (value: string) => void }) {
  const { axis, signals, overlays, may, all, onAll, onAdd } = props;
  const shadowed = new Set(signals?.shadowed_keywords ?? []);
  const rows = all ? axis.values : axis.values.slice(0, 8);
  const more = axis.values.slice(8);
  const counts = axisCounts(signals, axis.axis);
  return (
    <div className="table-wrap">
      <table className="thin rules">
        <thead>
          <tr>
            <th>{axis.axis}</th>
            <th>Words</th>
            <th>Flag</th>
            <th className="num">Decided</th>
            <th className="num">Unsure</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const site = siteWords(overlays, axis.axis, v.value);
            const c = valueCounts(signals, axis.axis, v.value);
            const shadow = v.keywords.find((k) => shadowed.has(k));
            const under = [v.label && v.label !== v.value ? `shown as ${v.label}` : null, v.family ? `family ${v.family}` : null].filter(Boolean).join(" · ");
            return (
              <tr key={v.value}>
                <td>
                  <b>{v.value}</b>
                  {under && <div className="meta">{under}</div>}
                </td>
                <td className="words">
                  <span className="path">{v.keywords.join(", ")}</span>
                  {site.adopted.map((s, i) => (
                    <span key={`a${i}`} className="tag ok">
                      + {s.word} for {s.scope}
                    </span>
                  ))}
                  {site.proposed.map((s, i) => (
                    <span key={`p${i}`} className="tag brand">
                      + {s.word} proposed
                    </span>
                  ))}
                  {shadow && (
                    <span className="meta">
                      {" "}
                      · <span className="path">{shadow}</span> shadowed behind an earlier word
                    </span>
                  )}
                  {v.keywords.length === 0 && site.adopted.length === 0 && site.proposed.length === 0 && <span className="meta">no words; {v.flag ? "a flag decides" : "a rule decides"}</span>}
                </td>
                <td className="meta">{v.flag ?? ""}</td>
                <td className="num">{c ? n(c.decided) : ""}</td>
                <td className="num">{c ? n(c.unsure) : ""}</td>
                <td className="acts">
                  {may && (
                    <button type="button" className="button quiet small" onClick={() => onAdd(v.value)}>
                      Add a word
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {!all && more.length > 0 && (
            <tr>
              <td colSpan={6} className="meta">
                {n(more.length)} more {more.length === 1 ? "value" : "values"}: {more.slice(0, 6).map((v) => v.value).join(", ")}
                {more.length > 6 ? ", and more" : ""} ·{" "}
                <button type="button" className="link-button" onClick={onAll}>
                  show all
                </button>
              </td>
            </tr>
          )}
          {axis.values.length === 0 && (
            <tr>
              <td colSpan={6} className="meta">
                {axis.counted > 0 ? `${n(axis.counted)} values; this engine lists their words with its next release.` : "This axis has no values of its own; a route sets them."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {counts && !signals?.by_value && (
        <p className="meta">
          On this axis in the scope: {n(counts.sorted)} stacks sorted, {n(counts.unsure)} unsure. This engine counts by axis; by value comes with its next release.
        </p>
      )}
    </div>
  );
}

export function RulesPage({ caps, items, wordAt, onWordClose, onChanged }: RulesProps) {
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [packWhy, setPackWhy] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [overlays, setOverlays] = useState<OverlayRow[]>([]);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [scope, setScope] = useState<Scope | null>(null);
  const [axis, setAxis] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState<WordAt | null>(null);
  const [tuning, setTuning] = useState(false);
  const [since] = useState(() => Date.now());
  const may = acts(caps);
  const readsSignals = served(caps, "GET /api/classify/signals") && may.decide;

  const reload = useCallback(() => {
    if (served(caps, "GET /api/overlays")) ops.overlays().then((r) => setOverlays(r.overlays), () => setOverlays([]));
  }, [caps]);

  useEffect(() => {
    let alive = true;
    if (!served(caps, "GET /api/packs/{name}")) {
      setPackWhy("this engine serves no pack door");
      return;
    }
    const name = caps.engine?.packs[0]?.name;
    (name ? Promise.resolve([{ name }]) : data.packs().then((r) => r.packs))
      .then((packs) => (packs[0] ? review.pack(packs[0].name) : Promise.reject(new Error("no pack is loaded"))))
      .then((p) => alive && setPack(p))
      .catch((e: Error) => alive && setPackWhy(e.message));
    data.batches(12).then((r) => alive && setBatches(r.batches), () => undefined);
    reload();
    return () => {
      alive = false;
    };
  }, [caps, reload]);

  const everything: Scope = useMemo(() => ({ kind: "everything", pack: pack?.pack ?? "", version: pack?.version ?? caps.engine?.packs[0]?.version ?? "" }), [pack, caps]);
  const current: Scope = scope ?? (batches[0] ? { kind: "batch", id: batches[0].id, name: batches[0].name } : everything);
  const key = scopeString(current);
  useEffect(() => {
    if (!readsSignals) return;
    let alive = true;
    setSignals(null);
    ops.signals(key).then((s) => alive && setSignals(s), () => alive && setSignals(null));
    return () => {
      alive = false;
    };
  }, [key, readsSignals]);

  const chosen = pack?.axes.find((a) => a.axis === axis) ?? pack?.axes.find((a) => a.values.some((v) => v.keywords.length > 0)) ?? pack?.axes[0] ?? null;
  const lists = pack ? pack.axes.reduce((s, a) => s + a.values.filter((v) => v.keywords.length > 0).length, 0) : 0;
  const first = pack?.axes[0] ? axisCounts(signals, pack.axes[0].axis) : null;
  const unsureOpen = signals ? Object.values(signals.open_review ?? {}).reduce((s, v) => s + v, 0) : items.filter((i) => i.status === "open" && familyOf(i.kind) === "unsure").length;
  const adopted = overlays.filter((o) => o.status === "adopted");
  const proposed = overlays.filter((o) => o.status === "proposed");
  const adoptedWords = adopted.reduce((s, o) => s + overlayChange(o).reduce((t, c) => t + (c.words.match(/\+ ([^-]+)/u)?.[1].split(",").length ?? 0), 0), 0);
  const origins = originsOf(signals);
  const tunable = assistantOffered(caps) && stationsServed(caps).includes("keyword-tune") && may.decide;

  useEffect(() => {
    if (wordAt) setAdding(wordAt);
  }, [wordAt]);

  return (
    <>
      <div className="strip small four">
        <div className="done">
          <span className="k">pack</span>
          <span className="v">{pack ? `${pack.pack} ${pack.version}` : packWhy ? "none" : ""}</span>
          <span className="meta">{pack ? `contract ${pack.contract} · ${pack.axes.length} axes · ${n(pack.flags)} flags · ${n(lists)} word lists` : (packWhy ?? "reading the pack")}</span>
        </div>
        <div className={first ? "done" : ""}>
          <span className="k">sorted by it</span>
          <span className="v">
            {first ? n(first.sorted) : ""}
            {first && <small> stacks</small>}
          </span>
          <span className="meta">{first ? `in ${scopeWords(current)}` : readsSignals ? "counted once the signals are read" : "the signals need Review: Work"}</span>
        </div>
        <div className={unsureOpen > 0 ? "wait" : "done"}>
          <span className="k">unsure</span>
          <span className="v">{n(unsureOpen)}</span>
          <span className="meta">below the pack's confidence · on the queue</span>
        </div>
        <div className="done">
          <span className="k">site words</span>
          <span className="v">
            {n(adoptedWords)}
            <small> adopted</small>
          </span>
          <span className="meta">
            across {n(adopted.length)} {adopted.length === 1 ? "overlay" : "overlays"} · {n(proposed.length)} proposed
          </span>
        </div>
      </div>

      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>Axes</h2>
          <span className="meta">in the order they are decided; an axis may read one before it</span>
          <span className="chips">
            {batches.slice(0, 3).map((b) => (
              <button key={b.id} type="button" className={current.kind === "batch" && current.id === b.id ? "opt on" : "opt"} onClick={() => setScope({ kind: "batch", id: b.id, name: b.name })}>
                batch {b.name}
              </button>
            ))}
            {origins.slice(0, 3).map((o) => (
              <button key={o} type="button" className={current.kind === "origin" && current.name === o ? "opt on" : "opt"} onClick={() => setScope({ kind: "origin", name: o })}>
                scanner {o}
              </button>
            ))}
            <button type="button" className={current.kind === "everything" ? "opt on" : "opt"} onClick={() => setScope(everything)}>
              everything
            </button>
          </span>
        </div>
        {!pack && !packWhy && <Wait phase="reading the pack" since={since} size="panel" />}
        {packWhy && <p className="warn">The pack could not be read: {packWhy}</p>}
        {pack && (
          <div className="chips axes">
            {pack.axes.map((a) => (
              <button key={a.axis} type="button" className={chosen?.axis === a.axis ? "opt on" : "opt"} aria-pressed={chosen?.axis === a.axis} onClick={() => { setAxis(a.axis); setAll(false); }}>
                {a.axis}
                {axisWords(a) && <b>{axisWords(a)}</b>}
              </button>
            ))}
          </div>
        )}
        {chosen && <AxisTable axis={chosen} signals={signals} overlays={overlays} may={may.decide && served(caps, "POST /api/classify/try")} all={all} onAll={() => setAll(true)} onAdd={(value) => setAdding({ axis: chosen.axis, value, scope: current, pack: pack?.pack ?? null })} />}
        <span className="meta">A word is matched against the pack's normalised text of the series description, protocol and sequence names. The flags and physics, and the order values are tried in, stay the pack's; a change to them is a new pack version.</span>
      </section>

      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>Proposals</h2>
          <span className="meta">tried on real stacks; adopting re-sorts the scope</span>
          {tunable && (
            <button type="button" className="button secondary small" onClick={() => setTuning(true)}>
              <Icon name="assistant" />
              Tune with the assistant
            </button>
          )}
        </div>
        <ProposalsTable caps={caps} overlays={overlays} onChanged={(w) => { reload(); onChanged(w); }} />
      </section>

      <div className="note gated">
        <Icon name="lock" />
        <div className="note-body">
          <p className="note-detail">
            Adopting needs Review: Work and Data: Work, since it changes how data is sorted; it says first what it moves and which cards stop reproducing. A decision on one scan is different: it overrides the rules for that scan, series, subject or scanner and survives re-sorting.
          </p>
        </div>
      </div>

      {adding && (
        <AddWordDialog
          caps={caps}
          at={adding}
          pack={pack && (adding.pack === null || adding.pack === pack.pack) ? pack : null}
          onClose={() => { setAdding(null); onWordClose(); }}
          onProposed={(w) => { setAdding(null); onWordClose(); reload(); onChanged(w); }}
        />
      )}
      {tuning && chosen && (
        <TuneDialog caps={caps} scope={current} axis={chosen.axis} onClose={() => setTuning(false)} onChanged={(w) => { reload(); onChanged(w); }} />
      )}
    </>
  );
}

/** The proposals: what each changes, its scope, its rehearsal, who, and Adopt with the closure or Refuse. */
export function ProposalsTable({ caps, overlays, onChanged }: { caps: Capabilities; overlays: OverlayRow[]; onChanged: (words: string) => void }) {
  const may = acts(caps);
  const [closures, setClosures] = useState<Record<number, Closure | null>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const proposed = overlays.filter((o) => o.status === "proposed").map((o) => o.id).join(",");
  const readsClosure = served(caps, "GET /api/depends/{kind}/{id}");
  useEffect(() => {
    if (!readsClosure || !may.adopt) return;
    for (const o of overlays) {
      if (o.status !== "proposed" || o.id in closures) continue;
      review.closure(o.id).then(
        (c) => setClosures((was) => ({ ...was, [o.id]: c })),
        () => setClosures((was) => ({ ...was, [o.id]: null })),
      );
    }
  }, [proposed, readsClosure]); // eslint-disable-line react-hooks/exhaustive-deps

  const adopt = (o: OverlayRow) => {
    setBusy(o.id);
    setWhy(null);
    ops
      .overlayAdopt(o.id)
      .then((r) => {
        setBusy(null);
        onChanged(`Adopted ${o.name}; job ${r.job} re-sorts its scope.`);
      })
      .catch((e: unknown) => {
        setBusy(null);
        setWhy(refusalWords(e));
      });
  };
  const refuse = (o: OverlayRow) => {
    setBusy(o.id);
    setWhy(null);
    ops
      .overlay(o.id)
      .then((full) => {
        const item = typeof full.review_item === "number" ? full.review_item : null;
        if (item === null) throw new Error("this engine keeps no review item beside the overlay to refuse it on");
        return ops.reviewAccept(item, `refused the overlay ${o.name}`);
      })
      .then(() => {
        setBusy(null);
        onChanged(`Refused ${o.name}; it stays proposed in the registry, its item closed.`);
      })
      .catch((e: unknown) => {
        setBusy(null);
        setWhy(refusalWords(e));
      });
  };
  const rows = [...overlays].sort((a, b) => (a.status === b.status ? b.id - a.id : a.status === "proposed" ? -1 : 1));
  return (
    <div className="table-wrap">
      <table className="thin proposals">
        <thead>
          <tr>
            <th>Change</th>
            <th>Scope</th>
            <th>Rehearsed</th>
            <th>By</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const change = overlayChange(o);
            const tried = o.tried as Json | undefined;
            const t = tried && Array.isArray(tried.moves) ? (tried as unknown as TryResult) : null;
            const c = closures[o.id] ?? null;
            const who = typeof o.actor === "object" && o.actor && typeof (o.actor as Json).name === "string" ? `the assistant, asked by ${o.author ?? "someone"}` : (o.author ?? "");
            return (
              <tr key={o.id}>
                <td>
                  {change.length === 0 && <b>{o.name}</b>}
                  {change.map((ch, i) => (
                    <div key={i}>
                      <b>{ch.title}</b> {ch.words}
                    </div>
                  ))}
                  <div className="meta">
                    {o.name} {o.version ?? ""}
                  </div>
                </td>
                <td>{o.scope ?? "everything"}</td>
                <td>{t ? tryWords(t) : (o.why ?? "")}</td>
                <td>
                  {who}
                  {o.status === "adopted" && <div className="meta">adopted</div>}
                </td>
                <td className="acts">
                  {o.status === "proposed" ? (
                    <span className="row-actions">
                      {may.adopt && (
                        <button type="button" className="button small" disabled={busy !== null} title={c ? closureWords(c).note : undefined} onClick={() => adopt(o)}>
                          {c ? closureWords(c).act : "Adopt"}
                        </button>
                      )}
                      {may.decide && (
                        <button type="button" className="button quiet small" disabled={busy !== null} onClick={() => refuse(o)}>
                          Refuse
                        </button>
                      )}
                    </span>
                  ) : (
                    <span className={o.status === "adopted" ? "tag ok" : "tag"}>
                      {o.status === "adopted" && <Icon name="check" />}
                      {o.status}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="meta">
                No overlay yet. Add a word to a list above, or tune with the assistant.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {why && <p className="warn">{why}</p>}
      {Object.values(closures).some((c) => c && c.handles.length > 0) && (
        <p className="meta">{Object.values(closures).filter((c): c is Closure => c !== null && c.handles.length > 0).map(closureWords).map((w) => w.note).join(" ")}</p>
      )}
    </div>
  );
}

/** Add a word: the word, the scope, then the rehearsal through the try door, then the proposal. */
export function AddWordDialog({ caps, at, pack: given, onClose, onProposed }: { caps: Capabilities; at: WordAt; pack: PackDoc | null; onClose: () => void; onProposed: (words: string) => void }) {
  const [pack, setPack] = useState<PackDoc | null>(given);
  const [words, setWords] = useState("");
  const [scope, setScope] = useState<Scope>(at.scope);
  const [tried, setTried] = useState<{ overlay: OverlayDoc; result: TryResult } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const packName = at.pack ?? caps.engine?.packs[0]?.name ?? null;
  useEffect(() => {
    if (given || !packName) return;
    let alive = true;
    review.pack(packName).then((p) => alive && setPack(p), (e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
  }, [given, packName]);
  const value = pack?.axes.find((a) => a.axis === at.axis)?.values.find((v) => v.value === at.value) ?? null;
  const everything: Scope = { kind: "everything", pack: pack?.pack ?? "", version: pack?.version ?? "" };
  const list = words.split(/[,\n]/u).map((w) => w.trim()).filter((w) => w !== "");
  const name = `site-${at.axis}-${at.value}`.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/-+/gu, "-");
  const proposable = served(caps, "POST /api/overlays") && acts(caps).decide;

  const tryIt = () => {
    if (!pack) return;
    const made = wordOverlay(pack, at.axis, at.value, list, [], scope, name);
    if (!made.overlay) {
      setWhy(made.why);
      return;
    }
    setBusy(true);
    setWhy(null);
    const overlay = made.overlay;
    review
      .try(overlay, scopeString(scope))
      .then((result) => setTried({ overlay, result }))
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };
  const propose = () => {
    if (!tried) return;
    setBusy(true);
    setWhy(null);
    review
      .propose(name, tried.overlay, scopeString(scope), reason.trim() || `adds ${list.join(", ")} to ${at.axis} ${at.value}`)
      .then((r) => onProposed(`Proposed ${name} as overlay ${r.overlay}; it waits on the queue for someone with Data: Work to adopt.`))
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusalWords(e));
      });
  };
  return (
    <Dialog
      title={`Add a word to ${at.axis} ${at.value}`}
      icon="pencil"
      onClose={onClose}
      foot={
        <div className="row actions">
          {tried ? (
            proposable && (
              <button type="button" className="button" disabled={busy} onClick={propose}>
                Propose it
              </button>
            )
          ) : (
            <button type="button" className="button" disabled={busy || list.length === 0 || !pack} onClick={tryIt}>
              Try it on {scopeWords(scope)}
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            {tried ? "Close" : "Cancel"}
          </button>
          {busy && <Wait phase={tried ? "proposing" : "rehearsing"} since={Date.now()} />}
          {why && <span className="warn">{why}</span>}
        </div>
      }
    >
      {value && (
        <p className="meta">
          {at.value}
          {value.label && value.label !== at.value ? ` (${value.label})` : ""} matches today: <span className="path">{value.keywords.join(", ") || "no word"}</span>
        </p>
      )}
      <div className="field">
        <span className="label">The word, or words separated by commas</span>
        <span className="input mono">
          <input value={words} placeholder="as it appears in the series description" aria-label="The word" disabled={tried !== null} onChange={(e) => setWords(e.target.value)} />
        </span>
      </div>
      <div className="field">
        <span className="label">For</span>
        <span className="chips">
          {at.scope.kind !== "everything" && (
            <button type="button" className={scope.kind !== "everything" ? "opt on" : "opt"} disabled={tried !== null} onClick={() => setScope(at.scope)}>
              {scopeWords(at.scope)}
            </button>
          )}
          <button type="button" className={scope.kind === "everything" ? "opt on" : "opt"} disabled={tried !== null} onClick={() => setScope(everything)}>
            everything
          </button>
        </span>
      </div>
      {tried && (
        <div className="field">
          <span className="label">Rehearsed on {scopeWords(scope)}, writing nothing</span>
          <p>{tryWords(tried.result)}</p>
          {tried.result.moves.length > 0 && (
            <ul className="tried-list">
              {tried.result.moves.slice(0, 6).map((m, i) => (
                <li key={i} className="meta">
                  {m.axis}: {m.from ?? "nothing"} to {m.to ?? "nothing"} on {n(m.stacks)} {m.stacks === 1 ? "stack" : "stacks"}
                </li>
              ))}
            </ul>
          )}
          {tried.result.moves.some((m) => m.axis !== at.axis) && <p className="warn">Another axis moved too; a word should move one axis.</p>}
          <span className="input">
            <input value={reason} placeholder="why, in a few words" aria-label="Why" onChange={(e) => setReason(e.target.value)} />
          </span>
        </div>
      )}
      <p className="meta">
        {proposable
          ? "Proposing puts an overlay on the queue beside a review item; adopting it needs Data: Work as well and re-sorts the scope."
          : "Trying writes nothing. Proposing needs work on the Review page."}
      </p>
    </Dialog>
  );
}

/** The keyword-tune station on the chosen scope and axis, with Adopt and Refuse as the person's acts. */
export function TuneDialog({ caps, scope, axis, onClose, onChanged }: { caps: Capabilities; scope: Scope; axis: string; onClose: () => void; onChanged: (words: string) => void }) {
  const [closure, setClosure] = useState<Closure | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const may = acts(caps);
  const message = `Tune ${axis} for ${scopeString(scope)}: survey the signals of the scope ${scopeString(scope)} and the open review items on ${axis}, write one hypothesis, rehearse it, and propose the overlay if the diff reads keep.`;
  const overlayOf = (v: Verdict) => {
    const p = v.proposals.find((x) => x.kind === "overlay") ?? null;
    const id = p && typeof p.ref.id === "number" ? p.ref.id : null;
    const item = p && typeof p.ref.review_item === "number" ? p.ref.review_item : null;
    return { id, item, name: typeof v.result.name === "string" ? v.result.name : `tune-${axis}` };
  };
  const settled = (v: Verdict | null) => {
    const o = v ? overlayOf(v) : { id: null, item: null, name: "" };
    if (o.id !== null && may.adopt && served(caps, "GET /api/depends/{kind}/{id}")) review.closure(o.id).then(setClosure, () => setClosure(null));
  };
  const adopt = (v: Verdict) => {
    const o = overlayOf(v);
    if (o.id === null) return;
    setBusy(true);
    ops
      .overlayAdopt(o.id)
      .then((r) => {
        setDone(`Adopted; job ${r.job} re-sorts ${scopeWords(scope)}.`);
        onChanged(`Adopted ${o.name}; job ${r.job} re-sorts ${scopeWords(scope)}.`);
      })
      .catch((e: unknown) => setWhy(refusalWords(e)))
      .finally(() => setBusy(false));
  };
  const refuse = (v: Verdict) => {
    const o = overlayOf(v);
    if (o.item === null) {
      setWhy("The station left no review item to refuse it on; the overlay stays proposed.");
      return;
    }
    setBusy(true);
    ops
      .reviewAccept(o.item, `refused the overlay ${o.name} proposed by keyword-tune`)
      .then(() => {
        setDone("Refused; the overlay stays proposed in the registry, its item closed.");
        onChanged(`Refused ${o.name}.`);
      })
      .catch((e: unknown) => setWhy(refusalWords(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Dialog
      title={`Tune ${axis} for ${scopeWords(scope)}`}
      icon="assistant"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
          {done && <span className="ok-words">{done}</span>}
          {why && <span className="warn">{why}</span>}
        </div>
      }
    >
      <StationRun
        caps={caps}
        station="keyword-tune"
        message={message}
        title={`Tune ${axis} for ${scopeWords(scope)}`}
        onSettled={settled}
        acts={(v) => {
          const o = overlayOf(v);
          if (o.id === null || done) return null;
          return (
            <>
              {may.adopt && (
                <button type="button" className="button" disabled={busy} title={closure ? closureWords(closure).note : undefined} onClick={() => adopt(v)}>
                  {closure ? closureWords(closure).act : "Adopt"}
                </button>
              )}
              {may.decide && (
                <button type="button" className="button secondary" disabled={busy} onClick={() => refuse(v)}>
                  Refuse
                </button>
              )}
            </>
          );
        }}
        aside={(v) => (typeof v.result.left === "number" && v.result.left > 0 ? `${n(v.result.left)} more unsure stacks share no word; they stay on the queue` : null)}
      />
      {closure && (
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-lead">Adopting is yours</p>
            <p className="note-detail">{closureWords(closure).note} Needs Review: Work and Data: Work.</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
