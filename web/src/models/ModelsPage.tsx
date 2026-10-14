// SPDX-License-Identifier: AGPL-3.0-only
// Models (record 45 S6; record 55 D4, spec sections 10.2 and 13.1), a page
// under Pipelines since Wave 7a: each task and slot with its models side by
// side as their cards (what each was tested on, with the evidence run, its
// speed on CPU and on GPU, what it needs of a GPU, its CPU and GPU
// equivalence stated and measured, the label set it was trained on, and
// whether the card is complete), the one chosen there marked, and why it
// answers. An admin chooses another model, or goes back to the default,
// after a panel that says what changes. One model's own page keeps its card,
// its encoders, the label set and its history. Under models:work a model is
// registered, admitted by a check, promoted or retired; promotion retires
// nothing since Wave 7a. What the engine refuses is shown in its own words.
// Record 55 ruling 22 (b): a model's card says whether a certificate names
// it, and with what; a person records one that cites the graded run that
// measured the model, under their own sign-in.

import { useCallback, useEffect, useState } from "react";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { certifiedWords, certifyAct, checkOf, choosable, chosenOf, chosenWords, citeBody, EMPTY_FORM, encodersOf, equivalenceWords, fittedBy, gpuOf, label, missingWords, modelActs, models, openActs, percentWords, rateWords, refusedModels, shortDigest, speedOf, stateTag, tasksOf, testedOf, trainedOn, type CertifyForm, type Model, type RunRow, type TaskEntry } from "./client";
import "../review/grown.css";
import "./models.css";

/** The engine's own words for a refusal, as its door said them. */
export function engineWords(e: unknown): string {
  if (e instanceof DoorError) return typeof e.body.error === "string" && e.body.error !== "" ? e.body.error : `the engine answered ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/** A model's own address, under Pipelines. */
export const modelHref = (id: number | string) => href("pipelines", "models", String(id));

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Model[]; tasks: TaskEntry[] | null };

/** Models under Pipelines: every task, or one model where the address names it (#pipelines/models/<id>). */
export function ModelsPage({ caps, id = null }: { caps: Capabilities; id?: number | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  const tasksServed = served(caps, "GET /api/models/tasks");
  const read = useCallback(() => {
    Promise.all([models.list(), tasksServed ? models.tasks().then((r) => r.tasks) : Promise.resolve(null)]).then(
      ([r, tasks]) => setLoad({ kind: "ready", list: r.models, tasks }),
      (e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: engineWords(e) })),
    );
  }, [tasksServed]);
  useEffect(read, [read]);
  const changed = (words: string) => {
    setSaid(words);
    read();
  };
  return (
    <>
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {load.kind === "loading" && <Wait phase="reading the models" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The models could not be read: {load.why}</p>}
      {load.kind === "ready" && id === null && <ModelsBody caps={caps} list={load.list} tasks={load.tasks} onChanged={changed} />}
      {load.kind === "ready" && id !== null && <ModelPage caps={caps} id={id} onChanged={changed} />}
    </>
  );
}

/** Every task and slot with its models side by side, as the page draws them from what it read. */
export function ModelsBody({ caps, list, tasks = null, onChanged }: { caps: Capabilities; list: Model[]; tasks?: TaskEntry[] | null; onChanged: (words: string) => void }) {
  const acts = modelActs(caps);
  const [registering, setRegistering] = useState(false);
  const entries = tasksOf(list, tasks);
  return (
    <section className="data models">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Pipelines</span>
          <h1>Models</h1>
          <p className="lede">One model answers each task: the one chosen there.</p>
        </div>
        {acts.register && (
          <button type="button" className="button secondary" onClick={() => setRegistering(true)}>
            <Icon name="plus" />
            Register
          </button>
        )}
      </div>
      {entries.length === 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">No model yet.</p>
            <p className="note-detail">A train run registers what it fitted; a card from elsewhere is registered here.</p>
          </div>
        </div>
      )}
      {entries.map((t) => (
        <TaskModels key={`${t.task} ${t.slot}`} caps={caps} t={t} onChanged={onChanged} />
      ))}
      {registering && <RegisterDialog caps={caps} onClose={() => setRegistering(false)} onDone={(w) => { setRegistering(false); onChanged(w); }} />}
    </section>
  );
}

type Choosing = { m: Model } | { m: null };

/** One task and slot: what answers it and why, and its models side by side. */
export function TaskModels({ caps, t, onChanged }: { caps: Capabilities; t: TaskEntry; onChanged: (words: string) => void }) {
  const acts = modelActs(caps);
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const on = chosenOf(t);
  return (
    <section className="stack roomy task-models" data-task={t.task}>
      <div className="section-head rule-top">
        <h2>{t.task}</h2>
        <span className="meta">
          {t.slot === "site" ? "" : `slot ${t.slot} · `}
          {on ? `${label(on)} answers · ${chosenWords(t.chosen)}` : chosenWords(null)}
        </span>
        {acts.choose && t.chosen?.by === "site" && (
          <button type="button" className="button quiet small" onClick={() => setChoosing({ m: null })}>
            Back to default
          </button>
        )}
      </div>
      <div className="model-cards">
        {t.models.map((m) => (
          <ModelCard key={m.id} m={m} chosen={on?.id === m.id} onChoose={acts.choose && choosable(m) && on?.id !== m.id ? () => setChoosing({ m }) : null} />
        ))}
      </div>
      {choosing && <ChooseDialog t={t} m={choosing.m} onClose={() => setChoosing(null)} onDone={(w) => { setChoosing(null); onChanged(w); }} />}
    </section>
  );
}

/** One model as a card beside the others of its task: chosen by its border, its card's numbers in lines. */
export function ModelCard({ m, chosen, onChoose = null }: { m: Model; chosen: boolean; onChoose?: (() => void) | null }) {
  const claims = testedOf(m);
  const speed = speedOf(m);
  const gpu = gpuOf(m);
  const trained = trainedOn(m);
  const missing = missingWords(m);
  return (
    <article className={["model-card", chosen ? "on" : "", m.state === "retired" ? "retired" : ""].filter(Boolean).join(" ")} aria-current={chosen ? "true" : undefined}>
      <div className="model-card-head">
        <a href={modelHref(m.id)}>{label(m)}</a>
        {chosen ? <span className="tag brand">answers</span> : <span className="meta">{m.state}</span>}
      </div>
      <dl className="facts card-facts">
        <div className="facts-pair">
          <dt>tested</dt>
          <dd>{claims.length === 0 ? "nothing stated" : `${claimWords(claims[0])}${claims.length > 1 ? ` · ${claims.length - 1} more` : ""}`}</dd>
        </div>
        <div className="facts-pair">
          <dt>CPU</dt>
          <dd title={speed.cpu?.hardware}>{rateWords(speed.cpu)}</dd>
        </div>
        <div className="facts-pair">
          <dt>GPU</dt>
          <dd title={speed.gpu?.hardware}>{gpu === "none" ? "not used" : `${rateWords(speed.gpu)}${gpu ? ` · ${gpu}` : ""}`}</dd>
        </div>
        <div className="facts-pair">
          <dt>CPU = GPU</dt>
          <dd>{equivalenceWords(m)}</dd>
        </div>
        <div className="facts-pair">
          <dt>trained on</dt>
          <dd title={trained?.digest}>{trained ? (trained.name ?? shortDigest(trained.digest)) : "no label set"}</dd>
        </div>
        {m.certificate !== undefined && (
          <div className="facts-pair">
            <dt>certified</dt>
            <dd title={m.certificate?.words}>{m.certificate ? certifiedWords(m.certificate) : "no certificate"}</dd>
          </div>
        )}
      </dl>
      <div className="model-card-foot">
        <span className={missing ? "meta warn-text" : "meta"}>{missing ?? "card complete"}</span>
        {onChoose && (
          <button type="button" className="button secondary small" onClick={onChoose}>
            Choose
          </button>
        )}
      </div>
    </article>
  );
}

/** A claim in a line: what, its value, its bound, and the evidence run it cites. */
export function claimWords(c: { claim: string; value: string; bound: string | null; evidence: string }): string {
  return `${c.claim} ${c.value}${c.bound ? ` (bound ${c.bound})` : ""}${c.evidence ? ` · ${c.evidence}` : ""}`;
}

/** Choose a task's model, or go back to the default, after the panel that says what changes. */
export function ChooseDialog({ t, m, onClose, onDone }: { t: TaskEntry; m: Model | null; onClose: () => void; onDone: (words: string) => void }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const now = chosenOf(t);
  const go = () => {
    setBusy(true);
    setRefused(null);
    const reason = why.trim() || undefined;
    const body = m ? { model: m.id, why: reason } : { task: t.task, slot: t.slot, model: null, why: reason };
    models.choose(body).then(
      (after) => {
        const answers = chosenOf(after);
        onDone(m ? `${label(m)} answers ${t.task}.` : answers ? `${t.task} is back to the default: ${label(answers)} answers.` : `${t.task} is back to the default: nothing answers.`);
      },
      (e: unknown) => {
        setBusy(false);
        setRefused(engineWords(e));
      },
    );
  };
  return (
    <Dialog
      title={m ? `Choose ${label(m)}` : `Default for ${t.task}`}
      icon="check"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy} onClick={go}>
            {m ? "Choose" : "Use the default"}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      <p className="lede">
        {m
          ? `${label(m)} answers ${t.task}${t.slot === "site" ? "" : ` in slot ${t.slot}`}${now ? `, instead of ${label(now)}` : ""}. Past answers keep naming their model.`
          : `The certified model answers ${t.task}, else the one promoted last, else the newest admitted.`}
      </p>
      <div className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} placeholder="kept in the audit" aria-label="Why" onChange={(e) => setWhy(e.target.value)} />
        </span>
      </div>
      {refused && (
        <div className="note caution" role="alert">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">The engine refused</p>
            <p className="note-detail">{refused}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

type One = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; m: Model };

export function ModelPage({ caps, id, onChanged }: { caps: Capabilities; id: number; onChanged: (words: string) => void }) {
  const [one, setOne] = useState<One>(() => ({ kind: "loading", since: Date.now() }));
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let alive = true;
    models.get(id).then(
      (m) => alive && setOne({ kind: "ready", m }),
      (e: unknown) => alive && setOne({ kind: "failed", why: engineWords(e) }),
    );
    return () => {
      alive = false;
    };
  }, [id, asked]);
  if (one.kind === "loading") return <Wait phase="reading the model" since={one.since} size="panel" />;
  if (one.kind === "failed") return <p className="warn">Model {id} could not be read: {one.why}</p>;
  return (
    <ModelBody
      caps={caps}
      m={one.m}
      onChanged={(w) => {
        setAsked((n) => n + 1);
        onChanged(w);
      }}
    />
  );
}

type Act = "admit" | "promote" | "retire" | "certify";

/** One model as the page draws it. */
export function ModelBody({ caps, m, onChanged }: { caps: Capabilities; m: Model; onChanged: (words: string) => void }) {
  const acts = modelActs(caps);
  const open = openActs(m);
  const [act, setAct] = useState<Act | null>(null);
  const tag = stateTag(m.state);
  const trained = trainedOn(m);
  const encoders = encodersOf(m);
  const claims = testedOf(m);
  const speed = speedOf(m);
  const gpu = gpuOf(m);
  const missing = missingWords(m);
  const events = [...(m.events ?? [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return (
    <section className="data model">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("pipelines", "models")}>Models</a> · {m.task}
          </span>
          <h1>{label(m)}</h1>
          <p className="lede">
            <span className={`tag ${tag.tone}`}>{tag.words}</span> {m.kind}
            {m.slot === "site" ? "" : ` in slot ${m.slot}`}
            {m.chosen ? " · answers its task" : ""}
          </p>
        </div>
        {acts.admit && open.admit && (
          <button type="button" className="button secondary" onClick={() => setAct("admit")}>
            Admit
          </button>
        )}
        {acts.promote && open.promote && (
          <button type="button" className={m.state === "admitted" ? "button" : "button secondary"} onClick={() => setAct("promote")}>
            Promote
          </button>
        )}
        {acts.retire && open.retire && (
          <button type="button" className="button quiet" onClick={() => setAct("retire")}>
            Retire
          </button>
        )}
        {certifyAct(caps) && m.state !== "retired" && (
          <button type="button" className="button secondary" onClick={() => setAct("certify")}>
            Record a certificate
          </button>
        )}
      </div>
      <Values
        cells={[
          { k: "digest", v: shortDigest(m.digest), title: m.digest },
          { k: "threshold", v: m.threshold != null ? m.threshold.toFixed(2) : "none" },
          { k: "registered by", v: m.registered_by },
          { k: "check", v: m.check ? `${m.check.suite}, ${m.check.passed ? "passed" : "failed"}` : "none" },
        ]}
      />
      <div className="section-head rule-top">
        <h2>Card</h2>
      </div>
      <dl className="facts">
        <div className="facts-pair">
          <dt>trained on</dt>
          <dd>{trained ? `${trained.name ?? "a label set"} · ${shortDigest(trained.digest)}${trained.rows !== null ? ` · ${trained.rows.toLocaleString("en-US")} rows` : ""}${trained.sealed ? " · sealed draw" : ""}` : "no label set"}</dd>
        </div>
        <div className="facts-pair">
          <dt>encoders</dt>
          <dd>
            {encoders.length === 0
              ? "none"
              : encoders.map((e, i) => (
                  <span key={i}>
                    {i > 0 ? ", " : ""}
                    {e.id !== null ? <a href={modelHref(e.id)}>{e.words}</a> : e.words}
                  </span>
                ))}
          </dd>
        </div>
        <div className="facts-pair">
          <dt>speed</dt>
          <dd>
            CPU {rateWords(speed.cpu)}
            {speed.cpu?.hardware ? ` on ${speed.cpu.hardware}` : ""} · GPU {gpu === "none" ? "not used" : `${rateWords(speed.gpu)}${speed.gpu?.hardware ? ` on ${speed.gpu.hardware}` : ""}`}
          </dd>
        </div>
        <div className="facts-pair">
          <dt>GPU</dt>
          <dd>{gpu ?? "not stated"}</dd>
        </div>
        <div className="facts-pair">
          <dt>CPU = GPU</dt>
          <dd>{equivalenceWords(m)}</dd>
        </div>
        <div className="facts-pair">
          <dt>card</dt>
          <dd className={missing ? "warn-text" : undefined}>{missing ?? "complete"}</dd>
        </div>
        {typeof m.card.pack_version === "string" && (
          <div className="facts-pair">
            <dt>pack</dt>
            <dd>{m.card.pack_version}</dd>
          </div>
        )}
      </dl>
      <CertificateFacts m={m} />
      {claims.length > 0 && (
        <>
          <div className="section-head rule-top">
            <h2>Tested</h2>
          </div>
          <ul className="claims">
            {claims.map((c, i) => (
              <li key={i}>
                {c.claim} <strong>{c.value}</strong>
                {c.bound ? <span className="meta"> bound {c.bound}</span> : null}
                {c.n !== null ? <span className="meta"> · n {c.n.toLocaleString("en-US")}</span> : null}
                {c.evidence ? <span className="meta path"> · {c.evidence}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {m.check && m.check.checks.length > 0 && (
        <Says head={`The check: ${m.check.suite}`}>
          {m.check.checks.map((c) => `${c.name} ${c.passed ? "passed" : "failed"}${c.value != null ? ` at ${c.value}` : ""}${c.threshold != null ? ` (threshold ${c.threshold})` : ""}`).join("; ")}.
        </Says>
      )}
      <div className="section-head rule-top">
        <h2>History</h2>
      </div>
      <ol className="model-events">
        {events.map((e, i) => (
          <li key={i} className="meta">
            {whenWords(e.at)} · {e.transition.replace(/_/g, " ")} by {e.by}
            {e.detail && typeof e.detail.why === "string" ? `: ${e.detail.why}` : ""}
          </li>
        ))}
        {events.length === 0 && <li className="meta">Registered {whenWords(m.registered_at)} by {m.registered_by}.</li>}
      </ol>
      {m.task.startsWith("axis:") && may(caps, "review:see") && served(caps, "GET /api/review") && (
        <p className="meta">
          What it proposed waits in <a href={href("review", "proposals")}>Review, Proposals</a>, staged until a person commits it.
        </p>
      )}
      {act === "admit" && <AdmitDialog m={m} onClose={() => setAct(null)} onDone={(w) => { setAct(null); onChanged(w); }} />}
      {act === "certify" && <CertifyDialog m={m} onClose={() => setAct(null)} onDone={(w) => { setAct(null); onChanged(w); }} />}
      {(act === "promote" || act === "retire") && <MoveDialog act={act} m={m} onClose={() => setAct(null)} onDone={(w) => { setAct(null); onChanged(w); }} />}
    </section>
  );
}

/** The certificate that names a model, as its page shows it: the run it cites or the sample it measured, and what it found. */
export function CertificateFacts({ m }: { m: Model }) {
  const c = m.certificate;
  if (!c) return null;
  const r = c.result ?? {};
  const e = c.evidence ?? null;
  return (
    <>
      <div className="section-head rule-top">
        <h2>Certified</h2>
        <span className="meta">
          certificate {c.id} · {c.created_by} · {whenWords(c.created_at)}
        </span>
      </div>
      <dl className="facts">
        {e ? (
          <>
            <div className="facts-pair">
              <dt>graded run</dt>
              <dd>{e.run}</dd>
            </div>
            <div className="facts-pair">
              <dt>manifest</dt>
              <dd title={e.manifest_sha256}>{shortDigest(e.manifest_sha256)}</dd>
            </div>
            <div className="facts-pair">
              <dt>plan</dt>
              <dd title={e.plan ?? undefined}>{e.plan_commit.slice(0, 12)}</dd>
            </div>
            <div className="facts-pair">
              <dt>artifact</dt>
              <dd title={e.model_digest}>{shortDigest(e.model_digest)}</dd>
            </div>
            {e.equivalence && (
              <div className="facts-pair">
                <dt>served as</dt>
                <dd title={e.equivalence.manifest_sha256}>
                  {e.equivalence.run} · class {e.equivalence.class}
                </dd>
              </div>
            )}
          </>
        ) : (
          <div className="facts-pair">
            <dt>sealed sample</dt>
            <dd>{c.sample}</dd>
          </div>
        )}
        <div className="facts-pair">
          <dt>found</dt>
          <dd>
            {typeof r.errors === "number" && typeof r.n === "number" ? `${r.errors.toLocaleString("en-US")} of ${r.n.toLocaleString("en-US")} wrong` : "?"}
            {typeof r.bound === "number" ? ` · bound ${percentWords(r.bound)}` : ""}
            {typeof r.bar === "number" ? ` · bar ${percentWords(r.bar)}` : typeof r.risk === "number" ? ` · risk ${percentWords(r.risk)}` : ""}
            {typeof r.coverage === "number" ? ` · coverage ${percentWords(r.coverage)}` : ""}
          </dd>
        </div>
        {typeof r.test === "string" && (
          <div className="facts-pair">
            <dt>test</dt>
            <dd>{r.test}</dd>
          </div>
        )}
      </dl>
    </>
  );
}

/** The fields of Record a certificate, in order, each with its label and hint. */
const CITE_FIELDS: { k: keyof CertifyForm; label: string; hint: string; wide?: boolean }[] = [
  { k: "run", label: "Graded run", hint: "the evidence run" },
  { k: "manifest", label: "Manifest sha256", hint: "of its MANIFEST.json", wide: true },
  { k: "commit", label: "Plan commit", hint: "that registered the plan" },
  { k: "bar", label: "Bar", hint: "0.01 for 1 %" },
  { k: "n", label: "Graded", hint: "stacks" },
  { k: "errors", label: "Wrong", hint: "of those" },
  { k: "bound", label: "Bound", hint: "as the run reported it" },
  { k: "coverage", label: "Coverage", hint: "the share accepted" },
  { k: "test", label: "Test", hint: "such as T19" },
  { k: "claim", label: "Claim", hint: "in words", wide: true },
  { k: "eqRun", label: "Served as run", hint: "if repackaged" },
  { k: "eqManifest", label: "Served as sha256", hint: "of that run's MANIFEST.json", wide: true },
  { k: "eqClass", label: "Class", hint: "I, II or III" },
];

/** Record a certificate that cites the graded run that measured this model (record 55 ruling 22 b), under the person's own sign-in. */
export function CertifyDialog({ m, onClose, onDone }: { m: Model; onClose: () => void; onDone: (words: string) => void }) {
  const [form, setForm] = useState<CertifyForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const built = citeBody(m, form);
  const wrong = "wrong" in built ? built.wrong : [];
  const go = () => {
    if (!("body" in built)) return;
    setBusy(true);
    setRefused(null);
    models.certify(built.body).then(
      (c) => onDone(c.evidence ? `${label(m)} is certified by the graded run ${c.evidence.run}.` : `${label(m)} is certified: ${certifiedWords(c)}.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(engineWords(e));
      },
    );
  };
  return (
    <Dialog
      title="Record a certificate"
      eyebrow={label(m)}
      icon="check"
      className="certify"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || wrong.length > 0} onClick={go}>
            Record
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      <p className="lede">The graded run that measured this model, for artifact {shortDigest(m.digest)}.</p>
      <p className="meta">Yours alone, under your sign-in: it unseals nothing, so no second person is needed. The engine works the bound out again from the counts.</p>
      <div className="cite-fields">
        {CITE_FIELDS.map((f) => (
          <label key={f.k} className={f.wide ? "field wide" : "field"}>
            <span className="label">{f.label}</span>
            <span className="input">
              <input value={form[f.k]} placeholder={f.hint} aria-label={f.label} onChange={(e) => setForm((was) => ({ ...was, [f.k]: e.target.value }))} />
            </span>
          </label>
        ))}
      </div>
      {refused && (
        <div className="note caution" role="alert">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">The engine refused</p>
            <p className="note-detail">{refused}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Admit: a check, whose passed the rows decide, recorded on the model. */
export function AdmitDialog({ m, onClose, onDone }: { m: Model; onClose: () => void; onDone: (words: string) => void }) {
  const [suite, setSuite] = useState("heldout");
  const [rows, setRows] = useState([{ name: "", passed: true, value: "", threshold: "" }]);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const check = checkOf(suite, rows);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((was) => was.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const go = () => {
    setBusy(true);
    setRefused(null);
    models.admit(m.id, check).then(
      (after) => onDone(after.state === "admitted" ? `${label(m)} is admitted by ${check.suite}.` : `The check was kept; ${label(m)} is still ${after.state}.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(engineWords(e));
      },
    );
  };
  return (
    <Dialog
      title={`Admit ${label(m)}`}
      icon="check"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || check.suite === "" || check.checks.length === 0} onClick={go}>
            Record the check
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">{check.checks.length === 0 ? "Name what was checked." : check.passed ? "Every check passed: the model is admitted." : "A check failed: it is kept as an event and admits nothing."}</p>
      <div className="field">
        <span className="label">Suite</span>
        <span className="input">
          <input value={suite} aria-label="Suite" onChange={(e) => setSuite(e.target.value)} />
        </span>
      </div>
      <div className="checks-edit">
        {rows.map((r, i) => (
          <div key={i} className="field-row">
            <span className="input">
              <input value={r.name} placeholder="check, such as ece" aria-label="Check" onChange={(e) => set(i, { name: e.target.value })} />
            </span>
            <span className="input">
              <input value={r.value} placeholder="value" aria-label="Value" onChange={(e) => set(i, { value: e.target.value })} />
            </span>
            <span className="input">
              <input value={r.threshold} placeholder="threshold" aria-label="Threshold" onChange={(e) => set(i, { threshold: e.target.value })} />
            </span>
            <label className="choice">
              <input type="checkbox" checked={r.passed} onChange={(e) => set(i, { passed: e.target.checked })} />
              passed
            </label>
          </div>
        ))}
        <button type="button" className="button quiet small" onClick={() => setRows((was) => [...was, { name: "", passed: true, value: "", threshold: "" }])}>
          Another check
        </button>
      </div>
    </Dialog>
  );
}

/** Promote or retire, after the panel that says what else it moves. */
export function MoveDialog({ act, m, onClose, onDone }: { act: "promote" | "retire"; m: Model; onClose: () => void; onDone: (words: string) => void }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setRefused(null);
    const work =
      act === "promote"
        ? models.promote(m.id, why.trim() || undefined).then(() => `${label(m)} is promoted for ${m.task}.`)
        : models.retire(m.id, why.trim() || undefined).then(() => `${label(m)} is retired; its decisions stay and keep naming it.`);
    work.then(onDone, (e: unknown) => {
      setBusy(false);
      setRefused(engineWords(e));
    });
  };
  return (
    <Dialog
      title={`${act === "promote" ? "Promote" : "Retire"} ${label(m)}`}
      icon={act === "promote" ? "arrow" : "x"}
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy} onClick={go}>
            {act === "promote" ? "Promote" : "Retire"}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      {act === "promote" ? (
        <p className="lede">
          {label(m)} is promoted in {m.task}{m.slot === "site" ? "" : `, slot ${m.slot}`}. Nothing is retired; the model chosen there keeps answering.
          {m.state === "registered" ? " It is not admitted yet." : ""}
        </p>
      ) : (
        <p className="lede">{label(m)} answers no more. Its decisions stay and keep naming it.</p>
      )}
      <div className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} placeholder="kept on the model's history" aria-label="Why" onChange={(e) => setWhy(e.target.value)} />
        </span>
      </div>
      {refused && (
        <div className="note caution" role="alert">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">The engine refused</p>
            <p className="note-detail">{refused}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Register: what train runs fitted, registered by the run already, or a card posted as it is. */
export function RegisterDialog({ caps, onClose, onDone }: { caps: Capabilities; onClose: () => void; onDone: (words: string) => void }) {
  const acts = modelActs(caps);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [card, setCard] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (!acts.runs) return;
    models.runs(50).then(
      (r) => setRuns(r.runs.filter((x) => fittedBy(x).length > 0 || refusedModels(x).length > 0)),
      () => setRuns([]),
    );
  }, [acts.runs]);
  const go = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(card);
    } catch (e) {
      setRefused(`Not JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setBusy(true);
    setRefused(null);
    models.register(parsed as Record<string, unknown>).then(
      (m) => onDone(`${label(m)} is registered; admit it with a check before choosing it.`),
      (e: unknown) => {
        setBusy(false);
        setRefused(engineWords(e));
      },
    );
  };
  return (
    <Dialog
      title="Register a model"
      icon="plus"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || card.trim() === ""} onClick={go}>
            Register the card
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      {acts.runs && (
        <div className="field">
          <span className="label">From a run</span>
          {runs === null && <span className="meta">Reading the runs.</span>}
          {runs !== null && runs.length === 0 && <span className="meta">No run fitted a model yet.</span>}
          {runs !== null && runs.length > 0 && <RunsFitted runs={runs} />}
        </div>
      )}
      <div className="field">
        <span className="label">A card from elsewhere</span>
        <span className="input">
          <textarea rows={6} value={card} placeholder='{"name": "...", "version": "...", "kind": "head", "digest": "sha256:...", "task": "axis:body_part"}' aria-label="The card" onChange={(e) => setCard(e.target.value)} />
        </span>
      </div>
      <Says head="What registering does">
        A train run registers the model it fitted from the card beside it, trained on the label set the run was given. A card posted here is registered as it is, neither admitted nor promoted; the engine checks its encoder and label set exist.
      </Says>
    </Dialog>
  );
}

/** The models runs fitted: each registered by its run, or refused in the engine's words. */
export function RunsFitted({ runs }: { runs: RunRow[] }) {
  return (
    <ul className="tried-list">
      {runs.map((r) => (
        <li key={r.id}>
          run {r.id} · {r.pipeline}
          {fittedBy(r).map((f) => (
            <span key={f.output} className="meta">
              {" "}
              · {f.model} registered
            </span>
          ))}
          {refusedModels(r).map((w) => (
            <span key={w} className="warn">
              {" "}
              · {w}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

