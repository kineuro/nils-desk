// SPDX-License-Identifier: AGPL-3.0-only
// Teaching (Wave 5 section 9.5; gate T31, walkthrough step 17.4): what the
// group corrected becomes a set, a set a fine-tune job, the job a candidate
// model, and a candidate reaches the purposes only once the admission suite
// and the bench are both green. Four screens, one list and one action each:
// the corrections (make a set), the sets (fine-tune one), the jobs (followed
// while one runs) and the models (the next gate, promotion, or rolling a
// promotion back). An administrator's page; each act names the grant the
// assistant asks for it.

import { useEffect, useState } from "react";
import { teaching, gateWords, jobWords, kindWords, nextStep, promotionWords, RECIPE_DRAFT, recipeOf, rollbackWords, running, SCREEN_WORDS, SCREENS, type Candidate, type Correction, type CuratedSet, type FineTuneJob, type RecipeDraft, type Screen } from "../assistant/teaching";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { Dialog } from "../ui/Dialog";
import { Empty } from "../ui/Empty";
import { Wait } from "../ui/Wait";
import { whenWords } from "./audit";
import { Acted, Head, Health, messageOf, useActing } from "./common";

/** How often the jobs are read again while one runs. */
export const JOBS_EVERY_MS = 5_000;

type Said = (words: string, then?: Screen) => void;

export function TeachingPage({ caps }: { caps: Capabilities }) {
  const [screen, setScreen] = useState<Screen>("corrections");
  const [words, setWords] = useState<string | null>(null);
  const said: Said = (w, then) => {
    setWords(w);
    if (then) setScreen(then);
  };
  return (
    <div className="settings">
      <Head title="Teaching" under lede="What the group corrected becomes a set, a set a fine-tuned model, and a model reaches the purposes only once the admission suite and the bench are both green." />
      {!may(caps, "assistant:use") ? (
        <p className="warn">The desk passes the assistant's doors only to a person holding assistant:use.</p>
      ) : (
        <>
          <div className="chart-tabs" role="tablist" aria-label="Teaching">
            {SCREENS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={screen === s}
                className={screen === s ? "on" : ""}
                onClick={() => {
                  setWords(null);
                  setScreen(s);
                }}
              >
                {SCREEN_WORDS[s]}
              </button>
            ))}
          </div>
          {words && <p className="ok-words">{words}</p>}
          {screen === "corrections" && <Corrections caps={caps} said={said} />}
          {screen === "sets" && <Sets caps={caps} said={said} />}
          {screen === "jobs" && <Jobs />}
          {screen === "models" && <Models caps={caps} said={said} />}
        </>
      )}
    </div>
  );
}

/** A list read once on mount and again on demand: null while it is read. */
function useList<T>(read: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    let alive = true;
    read().then(
      (v) => {
        if (!alive) return;
        setValue(v);
        setFailed(null);
      },
      (e: unknown) => alive && setFailed(messageOf(e)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again on each turn only
  }, [turn]);
  const again = () => {
    setSince(Date.now());
    setTurn((t) => t + 1);
  };
  return { value, failed, since, again };
}

function Reading({ what, since, failed }: { what: string; since: number; failed: string | null }) {
  return failed ? <p className="warn">{failed}</p> : <Wait phase={`reading ${what}`} since={since} size="panel" />;
}

function Corrections({ caps, said }: { caps: Capabilities; said: Said }) {
  const list = useList(teaching.corrections);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const work = may(caps, "review:work");
  if (!list.value) return <Reading what="the corrections" since={list.since} failed={list.failed} />;
  const rows = list.value.corrections;
  const flip = (id: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const all = rows.length > 0 && rows.every((r) => chosen.has(r.id));
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Corrections</h2>
        <span className="meta">{chosen.size > 0 ? `${chosen.size} of ${rows.length} chosen` : `${rows.length} corrections`}</span>
        <span className="grow" />
        {!work && <span className="meta">needs review:work</span>}
        <button type="button" className="button small" disabled={!work || chosen.size === 0} onClick={() => setNaming(true)}>
          Make a set
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty what="Nobody has corrected the assistant, a station or the pack yet." />
      ) : (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Choose every correction" checked={all} onChange={() => setChosen(all ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
                <th>Kind</th>
                <th>Correction</th>
                <th>Why</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CorrectionRow key={r.id} r={r} chosen={chosen.has(r.id)} onFlip={() => flip(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {naming && (
        <MakeSet
          ids={[...chosen]}
          onClose={() => setNaming(false)}
          onMade={(s) => {
            setNaming(false);
            setChosen(new Set());
            said(`Set ${s.id}, ${s.name}, holds ${s.count === 1 ? "one correction" : `${s.count} corrections`}.`, "sets");
          }}
        />
      )}
    </section>
  );
}

function CorrectionRow({ r, chosen, onFlip }: { r: Correction; chosen: boolean; onFlip: () => void }) {
  return (
    <tr>
      <td>
        <input type="checkbox" aria-label={`Choose ${r.id}`} checked={chosen} onChange={onFlip} />
      </td>
      <td>
        <span className="tag">{kindWords(r.kind)}</span>
        <div className="meta">{r.station}</div>
      </td>
      <td>{r.correction}</td>
      <td className="meta">{r.why ?? ""}</td>
      <td className="meta">{whenWords(r.at)}</td>
    </tr>
  );
}

function MakeSet({ ids, onClose, onMade }: { ids: string[]; onClose: () => void; onMade: (s: CuratedSet) => void }) {
  const [name, setName] = useState("");
  const { acting, act, working } = useActing();
  const make = () =>
    act("making the set", async () => {
      onMade(await teaching.curate(name.trim(), ids));
      return "";
    });
  return (
    <Dialog
      title="Make a set"
      icon="plus"
      eyebrow={ids.length === 1 ? "one correction" : `${ids.length} corrections`}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={working || !name.trim()} onClick={make}>
            Make the set
          </button>
        </div>
      }
    >
      <div className="field">
        <label className="label" htmlFor="teaching-set-name">
          Name
        </label>
        <div className="input">
          <input id="teaching-set-name" value={name} autoComplete="off" disabled={working} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      {acting.kind !== "done" && <Acted acting={acting} />}
    </Dialog>
  );
}

function Sets({ caps, said }: { caps: Capabilities; said: Said }) {
  const list = useList(teaching.sets);
  const [tuning, setTuning] = useState<CuratedSet | null>(null);
  const work = may(caps, "kvasir:work");
  if (!list.value) return <Reading what="the sets" since={list.since} failed={list.failed} />;
  const sets = list.value.sets;
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Sets</h2>
        <span className="meta">{sets.length === 1 ? "one set" : `${sets.length} sets`}</span>
        <span className="grow" />
        {!work && <span className="meta">fine-tuning needs kvasir:work</span>}
      </div>
      {sets.length === 0 ? (
        <Empty what="No set yet: choose corrections and make one." />
      ) : (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Set</th>
                <th>Corrections</th>
                <th>Made</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    <div className="meta">
                      set {s.id} · <span className="path">{s.digest.slice(0, 12)}</span>
                    </div>
                  </td>
                  <td className="num">{s.count.toLocaleString("en-GB")}</td>
                  <td className="meta">
                    {whenWords(s.created_at)}
                    <div>{s.subject}</div>
                  </td>
                  <td>
                    <button type="button" className="button small" disabled={!work} onClick={() => setTuning(s)}>
                      Fine-tune
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tuning && (
        <FineTune
          caps={caps}
          set={tuning}
          onClose={() => setTuning(null)}
          onStarted={(j) => {
            setTuning(null);
            said(`Fine-tune job ${j.id} started on set ${tuning.name}.`, "jobs");
          }}
        />
      )}
    </section>
  );
}

/** The models Kvasir serves, offered as bases. */
function kvasirModels(caps: Capabilities): string[] {
  const models = (caps.kvasir?.["models"] as { id?: unknown }[] | undefined) ?? [];
  return models.map((m) => m.id).filter((id): id is string => typeof id === "string");
}

function FineTune({ caps, set, onClose, onStarted }: { caps: Capabilities; set: CuratedSet; onClose: () => void; onStarted: (j: FineTuneJob) => void }) {
  const bases = kvasirModels(caps);
  const [d, setD] = useState<RecipeDraft>({ base: bases[0] ?? "", ...RECIPE_DRAFT });
  const { acting, act, working } = useActing();
  const recipe = recipeOf(d);
  const refused = "refused" in recipe ? recipe.refused : null;
  const start = () => {
    if ("refused" in recipe) return;
    act("starting the job", async () => {
      onStarted(await teaching.fineTune(set.id, recipe));
      return "";
    });
  };
  const field = (k: keyof RecipeDraft, label: string, extra: { list?: string; inputMode?: "numeric" | "decimal" } = {}) => (
    <div className="field">
      <label className="label" htmlFor={`teaching-${k}`}>
        {label}
      </label>
      <div className={k === "base" ? "input mono" : "input"}>
        <input id={`teaching-${k}`} value={d[k]} autoComplete="off" spellCheck={false} disabled={working} list={extra.list} inputMode={extra.inputMode} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
      </div>
    </div>
  );
  return (
    <Dialog
      title="Fine-tune"
      icon="branch"
      eyebrow={`${set.name}, ${set.count === 1 ? "one correction" : `${set.count} corrections`}`}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={working || refused !== null} onClick={start}>
            Start
          </button>
        </div>
      }
    >
      <p className="lede">A LoRA fine-tune of the base on this set. It ends as a candidate model, which is not used until it passes both gates and is promoted.</p>
      {field("base", "Base model", { list: "teaching-bases" })}
      <datalist id="teaching-bases">
        {bases.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {field("steps", "Steps", { inputMode: "numeric" })}
      {field("rank", "Rank", { inputMode: "numeric" })}
      {field("lr", "Learning rate", { inputMode: "decimal" })}
      {refused && <p className="meta">{refused}</p>}
      {acting.kind !== "done" && <Acted acting={acting} />}
    </Dialog>
  );
}

function Jobs() {
  const list = useList(teaching.jobs);
  const busy = list.value !== null && running(list.value);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(list.again, JOBS_EVERY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per reading, while a job runs
  }, [list.value]);
  if (!list.value) return <Reading what="the jobs" since={list.since} failed={list.failed} />;
  const jobs = list.value;
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Jobs</h2>
        <span className="meta">{busy ? "read again every few seconds while one runs" : jobs.length === 1 ? "one job" : `${jobs.length} jobs`}</span>
      </div>
      {list.failed && <p className="warn">{list.failed}</p>}
      {jobs.length === 0 ? (
        <Empty what="No fine-tune job yet: start one from a set." />
      ) : (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Job</th>
                <th>State</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const w = jobWords(j);
                return (
                  <tr key={j.id}>
                    <td>
                      job {j.id}
                      <div className="meta">
                        set {j.set_id} · {j.recipe.base}, {j.recipe.steps} steps, rank {j.recipe.rank}
                      </div>
                    </td>
                    <td>
                      <Health tone={w.tone} words={w.state} />
                    </td>
                    <td className="meta">
                      {whenWords(j.started_at)}
                      <div>{j.subject}</div>
                    </td>
                    <td className="meta">{j.finished_at ? whenWords(j.finished_at) : ""}</td>
                    <td className={j.state === "failed" ? "warn" : ""}>{w.result}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const STATE_TONE: Record<Candidate["state"], "ok" | "caution" | "neutral" | "brand"> = { registered: "neutral", admitted: "brand", promoted: "ok", retired: "neutral" };

function Models({ caps, said }: { caps: Capabilities; said: Said }) {
  const list = useList(teaching.candidates);
  const [asking, setAsking] = useState<Candidate | null>(null);
  const { acting, act, working } = useActing();
  const work = may(caps, "kvasir:work");
  if (!list.value) return <Reading what="the models" since={list.since} failed={list.failed} />;
  const { candidates, promoted } = list.value;
  const gate = (c: Candidate, verb: "admit" | "bench") =>
    act(verb === "admit" ? "running the admission suite" : "running the bench", async () => {
      try {
        if (verb === "admit") {
          const { candidate } = await teaching.admit(c.id);
          return candidate.admission?.passed ? `Candidate ${c.id} passed the admission suite.` : `Candidate ${c.id} failed the admission suite: ${candidate.admission?.failed.join(", ") || "no record"}.`;
        }
        const b = await teaching.bench(c.id);
        return `Candidate ${c.id} benched ${b.passed} of ${b.of}${b.dry ? ", recorded, not live" : ""}.`;
      } finally {
        list.again();
      }
    });
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Models</h2>
        <span className="meta">
          {promoted.map((p) => (p.model ? `${p.backend} routes to ${p.model}` : `${p.backend} routes to its configured model`)).join(" · ")}
        </span>
        <span className="grow" />
        {!work && <span className="meta">needs kvasir:work</span>}
      </div>
      <Acted acting={acting} />
      {candidates.length === 0 ? (
        <Empty what="No candidate model yet: a fine-tune job registers one when it ends." />
      ) : (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Model</th>
                <th>State</th>
                <th>Admission</th>
                <th>Bench</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const g = gateWords(c);
                const step = nextStep(c, work);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="path">{c.model}</span>
                      <div className="meta">
                        candidate {c.id} on {c.backend} · {c.source.kind === "fine-tune" ? `from job ${c.source.job}` : "added by hand"}
                      </div>
                    </td>
                    <td>
                      <Health tone={STATE_TONE[c.state]} words={c.state} />
                    </td>
                    <td className="meta">{g.admission}</td>
                    <td className="meta">{g.bench}</td>
                    <td>
                      {step && (
                        <>
                          <button
                            type="button"
                            className={step.verb === "retire" ? "button secondary small" : "button small"}
                            disabled={working || step.reason !== null}
                            title={step.reason ?? undefined}
                            onClick={() => (step.verb === "admit" || step.verb === "bench" ? gate(c, step.verb) : setAsking(c))}
                          >
                            {step.label}
                          </button>
                          {step.reason && <div className="meta">{step.reason}</div>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {asking && (
        <Confirm
          c={asking}
          promoted={promoted}
          onClose={() => setAsking(null)}
          onDone={(w) => {
            setAsking(null);
            said(w);
            list.again();
          }}
        />
      )}
    </section>
  );
}

/** Promotion, or rolling a promotion back: what it changes, said before it is done. */
function Confirm({ c, promoted, onClose, onDone }: { c: Candidate; promoted: { backend: string; model: string | null }[]; onClose: () => void; onDone: (words: string) => void }) {
  const back = c.state === "promoted";
  const { acting, act, working } = useActing();
  const lines = back ? rollbackWords(c) : promotionWords(c, promoted);
  const go = () =>
    act(back ? "rolling back" : "promoting", async () => {
      if (back) {
        const r = await teaching.retire(c.id);
        const now = r.promoted.find((p) => p.backend === c.backend)?.model ?? null;
        onDone(`${c.model} is retired; ${c.backend} routes to ${now ?? "its configured model"}.`);
      } else {
        await teaching.promote(c.id, `desk-${Date.now().toString(36)}`);
        onDone(`${c.model} is promoted on ${c.backend}.`);
      }
      return "";
    });
  return (
    <Dialog
      title={back ? "Roll back" : "Promote"}
      icon={back ? "restart" : "check"}
      eyebrow={`candidate ${c.id}`}
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={working} onClick={go}>
            {back ? "Roll back" : "Promote"}
          </button>
        </div>
      }
    >
      {lines.map((l, i) => (
        <p key={l} className={i === 0 ? "lede" : "meta"}>
          {l}
        </p>
      ))}
      {acting.kind !== "done" && <Acted acting={acting} />}
    </Dialog>
  );
}
