// SPDX-License-Identifier: AGPL-3.0-only
// The query panel beside the chat (the Assistant redesign, 2026-10-09): Open
// on a query card puts its version here, and the chat narrows on the left.
// The panel holds the question's conditions as chips to take away or add to,
// the answer's funnel as steps to choose, its charts (scan kinds, by a field,
// subjects, clinical, pictures) whose bars narrow the question when clicked,
// the versions, Save as a selection and Keep. Every change here is a move the
// engine offered and makes the next version; saying it in the chat makes one
// too, and the panel follows the conversation's latest.

import { Fragment, useEffect, useState } from "react";
import { ask, type Json, type Profile } from "../ask/client";
import { landing } from "../ask/start";
import type { Capabilities } from "../capabilities";
import { Thumb } from "../campaigns/Thumb";
import { MoveForm, useProfile, useStackFields } from "../query/CardParts";
import { argsOf, chartOf, tabsOf, type Bar } from "../query/cards";
import { SaveSelection } from "../query/SaveSelection";
import { maySave } from "../query/selections";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { beforeWords, type ChartKey, conditionsOf, funnelOf, levelSet, listingMove, narrowing, type Narrowing, pathOf, stacksOf } from "./inplay";
import { BarRows, titleOfDocument } from "./QueryCard";
import { reads } from "./reads";
import type { Playing } from "./useInPlay";

type Tab = ChartKey | "pictures";

const TAB_WORDS: Record<Tab, string> = {
  stacks: "Scan kinds",
  field: "By a field",
  people: "Subjects",
  clinical: "Clinical",
  pictures: "Pictures",
};

/** The profile of the version a version was made from, for how many it held. */
function useBefore(parent: number | null, epoch: number | null): Profile | null {
  const [p, setP] = useState<{ id: number; profile: Profile } | null>(null);
  useEffect(() => {
    if (parent === null) return;
    let alive = true;
    reads.profile(parent, epoch).then(
      (profile) => alive && setP({ id: parent, profile }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [parent, epoch]);
  return p && p.id === parent ? p.profile : null;
}

export function QueryPanel({ play, caps, keeping, epoch, onClose }: { play: Playing; caps: Capabilities; keeping: string | null; epoch: number | null; onClose: () => void }) {
  const { card, display, proposal } = play;
  const loaded = card.doc !== null && card.doc.document === display ? card.doc : null;
  const doc = (loaded?.ask ?? null) as Json | null;
  const answer = ((doc?.out as Json | undefined)?.set as string | undefined) ?? null;
  const [tab, setTab] = useState<Tab>("stacks");
  const [field, setField] = useState("manufacturer");
  const fields = useStackFields();
  const profile = useProfile(loaded ? display : null, answer, field, loaded);
  const before = useBefore(play.parent, epoch);
  const [level, setLevel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // another version shown: what was being added there is let go
  useEffect(() => {
    setAdding(false);
    setTyped({});
    setSaved(null);
  }, [display]);

  const label = display === null ? null : (play.versions.get(display)?.label ?? null);
  const steps = funnelOf(profile.profile, before);
  const answerGrain = profile.profile?.grain ?? (answer ? pathOf(doc)[0]?.grain : null) ?? null;
  const chosen = level ?? answerGrain;
  // a new condition goes to the step chosen in the funnel, else to the answer
  const target = (chosen ? levelSet(doc, chosen) : null) ?? answer;
  const addMove = target ? landing(card.options, target) : null;
  const conditions = loaded ? conditionsOf(card.steps, card.options, pathOf(doc).map((s) => s.set)) : [];
  const grainOf = (set: string | null) => (set ? (pathOf(doc).find((s) => s.set === set)?.grain ?? card.steps.find((s) => s.set === set)?.grain ?? "") : "");
  const subjects = levelSet(doc, "subject");

  const tabs: Tab[] = [...tabsOf(profile.profile).map((t) => t.id), ...(answerGrain === "stack" ? (["pictures"] as Tab[]) : [])];
  const open: Tab | null = tabs.includes(tab) ? tab : (tabs[0] ?? null);

  const narrow = (n: Narrowing | null) => (n && !play.busy ? () => void play.apply(n.set, n.move, n.args) : null);
  const pick = (chart: ChartKey, set: string | null) => (b: Bar) => narrow(narrowing(chart, b.value, set, set ? (card.options[set] ?? null) : null, field));

  const kept = proposal?.decided === "accepted";
  const keepable = proposal !== null && proposal.decided === null && !proposal.stale;
  const title = titleOfDocument(card.doc);
  return (
    <aside className="qpanel" aria-label="Query">
      <div className="qpanel-head">
        <div className="qpanel-name">
          <span className="eyebrow">Query</span>
          <h2 className="qpanel-title">{title}</h2>
        </div>
        {play.line.length > 0 && (
          <div className="qversions" role="group" aria-label="Versions">
            {play.line.map((v) => (
              <button key={v.document} type="button" className={v.document === display ? "qversion on" : "qversion"} aria-pressed={v.document === display} onClick={() => play.show(v.document)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        {maySave(caps) && display !== null && (
          <button type="button" className="button secondary" disabled={!loaded} onClick={() => setSaving(true)}>
            Save as a selection
          </button>
        )}
        {keepable && keeping === null && (
          <button type="button" className="button" disabled={play.busy} onClick={() => play.keep(proposal)}>
            Keep {label ?? "it"}
          </button>
        )}
        {kept && <span className="tag ok">kept</span>}
        {proposal?.stale && <span className="tag">moved on</span>}
        {display !== null && (
          <a className="icon-button qpanel-quiet" href={href("query", String(display))} aria-label="Open on the Query page" title="Open on the Query page">
            <Icon name="external" />
          </a>
        )}
        <button type="button" className="icon-button qpanel-quiet" aria-label="Close the query" title="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="qpanel-body">
        {play.why && <p className="warn">{play.why}</p>}
        {card.why && <p className="warn">The query could not be read: {card.why}</p>}
        {saved && <p className="ok-words">{saved}</p>}
        {keepable && keeping !== null && <p className="meta">{keeping}</p>}
        {!loaded && !card.why && <p className="meta">Reading the query</p>}
        {loaded && (
          <div className="qconds" aria-label="Conditions">
            {conditions.map((c, i) => (
              <span key={`${c.set}${i}`} className="qcond" title={`In ${c.set}`}>
                {c.words}
                {c.remove && (
                  <button type="button" className="icon-button" aria-label={`Take away ${c.words}`} disabled={play.busy} onClick={() => c.remove && void play.apply(c.set, c.remove.move, c.remove.args)}>
                    <Icon name="x" />
                  </button>
                )}
              </span>
            ))}
            {addMove && target && !adding && (
              <button type="button" className="qcond-add" disabled={play.busy} onClick={() => setAdding(true)}>
                <Icon name="plus" />
                Add a condition
              </button>
            )}
          </div>
        )}
        {adding && addMove && target && (
          <MoveForm
            move={addMove}
            grain={grainOf(target)}
            typed={typed}
            busy={play.busy}
            onType={(k, v) => setTyped((t) => ({ ...t, [k]: v }))}
            onApply={() => {
              const { args, missing } = argsOf(addMove, typed);
              if (missing.length > 0) return;
              void play.apply(target, addMove, args).then((ok) => {
                if (!ok) return;
                setAdding(false);
                setTyped({});
              });
            }}
            onCancel={() => {
              setAdding(false);
              setTyped({});
            }}
          />
        )}
        {steps.length > 0 && (
          <div className="qfunnel qsteps" aria-label="The answer, step by step">
            {steps.map((s, i) => {
              const at = levelSet(doc, s.grain);
              const was = beforeWords(s);
              return (
                <Fragment key={s.grain}>
                  {i > 0 && <Icon name="arrow" />}
                  <button
                    type="button"
                    className={s.grain === chosen ? "qstep on" : "qstep"}
                    aria-pressed={s.grain === chosen}
                    disabled={at === null}
                    title={at ? `Choose ${s.word}: a new condition goes here` : undefined}
                    onClick={() => {
                      setLevel(s.grain);
                      setAdding(false);
                      if (s.grain === "subject" && tabs.includes("people")) setTab("people");
                      if (s.grain === "stack" && tabs.includes("stacks")) setTab("stacks");
                    }}
                  >
                    <b>{s.word}</b>
                    {s.hint && <span className="qstep-hint">{s.hint}</span>}
                    <span className="num">{s.n.toLocaleString("en-US")}</span>
                    {was && <span className="qstep-hint">{was}</span>}
                  </button>
                </Fragment>
              );
            })}
          </div>
        )}
        {profile.why && <p className="warn">The charts could not be counted: {profile.why}</p>}
        {tabs.length > 0 && open && (
          <div className="qtabs" role="tablist" aria-label="Charts">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === open} className={t === open ? "on" : ""} onClick={() => setTab(t)}>
                {TAB_WORDS[t]}
              </button>
            ))}
          </div>
        )}
        {profile.profile && open && (
          <div className="qchart" aria-busy={profile.loading}>
            {open === "stacks" && <Chart chart={chartOf(profile.profile.stack_types, "base")} unit="scans" onPick={pick("stacks", answer)} />}
            {open === "field" && (
              <>
                <label className="field qchart-field">
                  <span className="label">Count the scans by</span>
                  <span className="input">
                    <select value={field} onChange={(e) => setField(e.target.value)}>
                      {(fields.includes(field) ? fields : [field, ...fields]).map((f) => (
                        <option key={f} value={f}>
                          {f.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <Chart chart={chartOf(profile.profile.field)} unit="scans" onPick={pick("field", answer)} />
                {profile.profile.field?.truncated && <p className="meta">The first 60 values are shown.</p>}
              </>
            )}
            {open === "people" && <Subjects profile={profile.profile} onPick={pick("people", subjects)} />}
            {open === "clinical" && (
              <>
                <Chart chart={chartOf(profile.profile.clinical, "plain", "No clinical events are recorded for these subjects.")} unit="events" />
                {profile.profile.clinical && "sensitive_withheld" in profile.profile.clinical && profile.profile.clinical.sensitive_withheld && (
                  <p className="meta">Some kinds of event are left out, since you do not see everything in records.</p>
                )}
              </>
            )}
            {open === "pictures" && display !== null && (
              <Pictures document={display} grain={answerGrain} listing={listingMove(answer ? (card.options[answer] ?? null) : null, answer)} busy={play.busy} onList={(n) => void play.apply(n.set, n.move, n.args)} />
            )}
          </div>
        )}
        {loaded && <p className="meta qpanel-hint">A bar narrows the question; a step of the funnel is where a new condition goes. Saying it in the chat works too.</p>}
      </div>
      {saving && display !== null && (
        <SaveSelection
          documentId={display}
          title={title}
          onClose={() => setSaving(false)}
          onSaved={(words) => {
            setSaving(false);
            setSaved(words);
          }}
        />
      )}
    </aside>
  );
}

function Chart({ chart, unit, onPick }: { chart: ReturnType<typeof chartOf>; unit: string; onPick?: (b: Bar) => (() => void) | null }) {
  if (chart.kind === "none") return null;
  if (chart.kind === "words") return <p className="meta">{chart.words}</p>;
  return <BarRows bars={chart.bars} unit={unit} three={unit === "subjects"} onPick={onPick} />;
}

/** The subjects of the answer: their sex, whose bars narrow the question to it, and their age at each visit. */
function Subjects({ profile, onPick }: { profile: Profile; onPick: (b: Bar) => (() => void) | null }) {
  const d = profile.demographics;
  if (!d) return null;
  if ("withheld" in d) return <Chart chart={chartOf(d)} unit="subjects" />;
  return (
    <div className="qpair">
      <div>
        <h3>Sex</h3>
        <Chart chart={chartOf(d.sex, "sex")} unit="subjects" onPick={onPick} />
      </div>
      <div>
        <h3>Age at the visit</h3>
        <Chart chart={chartOf(d.age_decades, "decade")} unit="visits" />
      </div>
    </div>
  );
}

/** The answer's scans as pictures: an answer that lists its scans shows the first of them; one that counts offers to list them as its next version. */
function Pictures({ document, grain, listing, busy, onList }: { document: number; grain: string | null; listing: Narrowing | null; busy: boolean; onList: (n: Narrowing) => void }) {
  const [stacks, setStacks] = useState<number[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setStacks(null);
    setWhy(null);
    ask.preview(document, 24).then(
      (p) => alive && setStacks(stacksOf(p, grain)),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [document, grain]);
  if (why) return <p className="warn">The scans could not be read: {why}</p>;
  if (stacks === null) return <p className="meta">Reading the scans</p>;
  if (stacks.length > 0)
    return (
      <div className="qpictures">
        {stacks.map((s) => (
          <span key={s} className="qpicture">
            <Thumb src={`/api/instances/${s}/thumb`} loading="lazy" />
          </span>
        ))}
      </div>
    );
  return (
    <div className="row qpictures-none">
      <p className="meta">The pictures show once the answer lists its scans.</p>
      {listing && (
        <button type="button" className="button quiet small" disabled={busy} onClick={() => onList(listing)}>
          List the scans
        </button>
      )}
    </div>
  );
}
