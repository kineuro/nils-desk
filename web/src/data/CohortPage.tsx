// SPDX-License-Identifier: AGPL-3.0-only
// One cohort's page (record 27, R5c): its four tiles, its members over time,
// and the join log as a table of when, what, how many, who and why. A retired
// cohort reads as retired from its tag and its lede, without a paragraph
// about it. Beside it: the datasets holding its people, its releases and the
// queries to start from it. Add or take out members with a reason, rename it,
// retire it, or release it.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { needsWork } from "../access";
import { ask, type Json } from "../ask/client";
import { startBody } from "../ask/start";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { objects } from "../objects/client";
import { keepingRefusal } from "../query/cards";
import { href, narrow } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says } from "../ui/Says";
import { Wait } from "../ui/Wait";
import { chartLabels, cohorts, delta, ledeWords, membersBody, sessionsMeta, sessionsWords, stepChart, type CohortDetail, type Join } from "./cohorts";
import { whenWords } from "./sources";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; cohort: CohortDetail };

const n = (v: number) => v.toLocaleString("en-US");

export type Act = "members" | "rename" | "retire";

export function CohortPage({ caps, name }: { caps: Capabilities; name: string }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [open, setOpen] = useState<Act | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ phase: string; since: number } | null>(null);

  const read = useCallback(() => {
    cohorts
      .get(name)
      .then((cohort) => setLoad({ kind: "ready", cohort }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  }, [name]);

  useEffect(() => {
    setLoad({ kind: "loading", since: Date.now() });
    setSaid(null);
    read();
  }, [read]);

  // record 26: the sessions are counted out of the session cache, so the strip says the window it was built under
  const [windowDays, setWindowDays] = useState<number | null>(null);
  useEffect(() => {
    if (served(caps, "GET /api/summary")) objects.summary().then((s) => setWindowDays(s.sessions.window_days ?? null), () => undefined);
  }, [caps]);

  // a query started from this cohort: counted by the start door, kept as a card, and opened
  const start = () => {
    setBusy({ phase: "starting a query", since: Date.now() });
    setSaid(null);
    ask
      .start(startBody({ kind: "cohorts", cohorts: [name] }))
      .then((s) => ask.store(s.document as Json))
      .then((d) => {
        location.hash = href("query", String(d.document));
      })
      .catch((e: Error) => {
        setBusy(null);
        setSaid(e.message);
      });
  };

  const done = (words: string) => {
    setOpen(null);
    setSaid(words);
    read();
  };

  const cohort = load.kind === "ready" ? load.cohort : null;
  return (
    <CohortBody caps={caps} cohort={cohort} since={load.kind === "loading" ? load.since : null} why={load.kind === "failed" ? load.why : null} said={said} busy={busy} windowDays={windowDays} onAct={setOpen} onStart={start}>
      {cohort && open === "members" && <MembersDialog cohort={cohort} onClose={() => setOpen(null)} onDone={done} />}
      {cohort && open === "rename" && <RenameDialog cohort={cohort} onClose={() => setOpen(null)} />}
      {cohort && open === "retire" && <RetireDialog cohort={cohort} onClose={() => setOpen(null)} onDone={done} />}
    </CohortBody>
  );
}

export interface CohortBodyProps {
  caps: Capabilities;
  cohort: CohortDetail | null;
  since?: number | null;
  why: string | null;
  said?: string | null;
  busy?: { phase: string; since: number } | null;
  now?: number;
  /** The window the session cache was built under, where the summary said; null where it did not. */
  windowDays?: number | null;
  onAct: (act: Act) => void;
  onStart: () => void;
  children?: React.ReactNode;
}

/** Whether the cohort page's acts are open to this person, or why not. */
export function cohortActs(caps: Capabilities, name: string) {
  const changing = served(caps, "PUT /api/cohorts/{name}") ? needsWork(caps, "Changing a cohort", [["data:work", "the Data page"]]) : "This engine has no door for changing a cohort.";
  const members = served(caps, "POST /api/cohorts/{name}/members") ? needsWork(caps, "Adding or taking out members", [["data:work", "the Data page"]]) : "This engine has no door for changing members by hand.";
  const releasing = served(caps, "POST /api/releases") && may(caps, "release:work") ? null : "Releasing needs work on the Release page.";
  const starting = served(caps, "POST /api/ask/start") ? keepingRefusal(caps) : "This engine has no start door.";
  return { changing, members, releasing, starting, release: href("release", "new", name) };
}

/** The page as it draws from what it read. */
export function CohortBody({ caps, cohort: c, since = null, why, said = null, busy = null, now = Date.now(), windowDays = null, onAct, onStart, children }: CohortBodyProps) {
  const today = new Date(now);
  const acts = c ? cohortActs(caps, c.name) : null;
  const chart = c ? stepChart(c.joins) : null;
  const joinedToday = c ? c.joins.filter((j) => delta(j) > 0 && new Date(j.when).toDateString() === today.toDateString()).reduce((a, j) => a + delta(j), 0) : 0;
  const left = c ? c.joins.filter((j) => delta(j) < 0).reduce((a, j) => a - delta(j), 0) : 0;
  const audits = may(caps, "audit:see");
  return (
    <section className="cpage">
      <div className="main">
        <div className="trail">
          <Icon name="data" />
          <a href={href("data")}>Data</a>
          <span>/</span>
          <a href={href("data", "cohorts")}>Cohorts</a>
          <span>/</span>
          <span>{c?.name ?? ""}</span>
        </div>
        {c === null && !why && <Wait phase="reading the cohort" since={since ?? now} size="panel" />}
        {why && <p className="warn">The cohort could not be read: {why}</p>}
        {c && acts && (
          <>
            <div className="data-head">
              <div className="grow">
                <h1>
                  {c.name}
                  {c.retired_at && <span className="tag"> retired</span>}
                </h1>
                <p className="lede">{ledeWords(c, today)}</p>
              </div>
              {acts.members === null && !c.retired_at && (
                <button type="button" className="button secondary" onClick={() => onAct("members")}>
                  <Icon name="pencil" />
                  Add or remove
                </button>
              )}
              {acts.changing === null && (
                <>
                  <button type="button" className="button secondary" onClick={() => onAct("rename")}>
                    Rename
                  </button>
                  <button type="button" className="button quiet" onClick={() => onAct("retire")}>
                    {c.retired_at ? "Bring back" : "Retire"}
                  </button>
                </>
              )}
              {acts.releasing === null && !c.retired_at && (
                <a className="button" href={acts.release}>
                  <Icon name="release" />
                  Release
                </a>
              )}
            </div>
            {busy && <Wait phase={busy.phase} since={busy.since} />}
            {said && <p className="ok-words">{said}</p>}
            {(acts.members !== null || acts.changing !== null) && !c.retired_at && <p className="meta">{acts.members ?? acts.changing}</p>}
            <div className="cohort-strip">
              <div className="done">
                <span className="k">subjects</span>
                <span className="v">{n(c.subjects)}</span>
                <span className="meta">{joinedToday > 0 ? `${n(joinedToday)} joined today` : c.last_joined ? `last joined ${whenWords(c.last_joined, today)}` : "nobody yet"}{left > 0 ? ` · ${n(left)} left` : ""}</span>
              </div>
              <div className="done">
                <span className="k">sessions</span>
                <span className="v">{sessionsWords(c.sessions)}</span>
                <span className="meta">{sessionsMeta(c.sessions, windowDays)}</span>
              </div>
              <div className="done">
                <span className="k">stacks</span>
                <span className="v">{n(c.stacks)}</span>
                <span className="meta">{c.waiting > 0 ? `${n(Math.max(0, c.stacks - c.waiting))} sorted` : c.stacks > 0 ? "all sorted" : "none yet"}</span>
              </div>
              <div className={c.waiting > 0 ? "wait" : "done"}>
                <span className="k">waiting</span>
                <span className="v">{n(c.waiting)}</span>
                <span className="meta">{c.waiting > 0 ? "on Review" : "nothing waits"}</span>
                {c.waiting > 0 && may(caps, "review:see") && (
                  <a className="tail" href={narrow(href("review"), { cohort: c.name })}>
                    Open on Review
                    <Icon name="chevron-right" />
                  </a>
                )}
              </div>
            </div>
            <section className="panel card">
              <div className="row card-head">
                <h2>Members over time</h2>
              </div>
              {chart ? <StepChartView chart={chart} now={today} /> : <p className="meta">Nobody has joined yet.</p>}
            </section>
            <section className="stack roomy">
              <div className="section-head rule-top">
                <h2>How they joined</h2>
                <span className="meta">newest first</span>
              </div>
              {c.joins.length === 0 ? (
                <p className="meta">Nothing yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="thin joins">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>What</th>
                        <th className="num">Subjects</th>
                        <th>By</th>
                        <th className="acts">
                          <span className="sr-only">Open</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...c.joins]
                        .sort((a, b) => Date.parse(b.when) - Date.parse(a.when))
                        .map((j, i) => (
                          <tr key={i}>
                            <td className="num nowrap">{whenWords(j.when, today)}</td>
                            <td>{j.what}</td>
                            <td className="num nowrap">{joinWords(j)}</td>
                            <td>{j.by}</td>
                            <td className="acts">
                              {typeof j.batch === "number" && (
                                <a className="tail" href={href("data", "batch", String(j.batch))}>
                                  The batch
                                  <Icon name="chevron-right" />
                                </a>
                              )}
                              {typeof j.handle === "number" && (
                                <a className="tail" href={href("query")}>
                                  The card
                                  <Icon name="chevron-right" />
                                </a>
                              )}
                              {j.batch == null && j.handle == null && j.actor && audits && (
                                <a className="tail" href={href("settings", "audit")}>
                                  Audit
                                  <Icon name="chevron-right" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {c && acts && (
        <div className="aside">
          <section className="panel card">
            <div className="row card-head">
              <Icon name="folder" size="lg" />
              <h2>Datasets</h2>
            </div>
            {c.sources_holding.length === 0 ? (
              <p className="meta">No dataset holds files of these subjects yet.</p>
            ) : (
              <dl className="facts">
                {c.sources_holding.map((s) => (
                  <div key={s.name} className="facts-pair">
                    <dt>{s.name}</dt>
                    <dd>{holdingWords(s)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="panel card">
            <div className="row card-head">
              <Icon name="release" size="lg" />
              <h2>Releases</h2>
            </div>
            {c.releases.length === 0 ? (
              <p className="meta">No release yet{acts.releasing === null && !c.retired_at ? "; the first takes every member" : ""}.</p>
            ) : (
              <dl className="facts">
                {c.releases.map((r) => (
                  <div key={r.name} className="facts-pair">
                    <dt>{r.name}</dt>
                    <dd>{[r.layout ?? null, r.subjects !== null ? `${n(r.subjects)} subjects` : null, r.withdrawn_at ? "withdrawn" : r.handed_over ? "handed over" : "not handed over"].filter(Boolean).join(" · ")}</dd>
                  </div>
                ))}
              </dl>
            )}
            {c.releases.length > 0 && may(caps, "release:see") && (
              <a className="tail" href={href("release")}>
                Every release
                <Icon name="chevron-right" />
              </a>
            )}
          </section>
          <section className="panel card">
            <div className="row card-head">
              <Icon name="search" size="lg" />
              <h2>Start a query</h2>
            </div>
            {acts.starting === null ? (
              <>
                {["Everyone in " + c.name, "Their sessions", "Their stacks"].map((words) => (
                  <button key={words} type="button" className="tail link-button" disabled={busy !== null} onClick={onStart}>
                    {words}
                    <Icon name="chevron-right" />
                  </button>
                ))}
              </>
            ) : (
              <p className="meta">{acts.starting}</p>
            )}
          </section>
        </div>
      )}
      {children}
    </section>
  );
}

/** A join's count with its direction. */
export function joinWords(j: Join): string {
  const d = delta(j);
  return d < 0 ? `${n(-d)} left` : `${n(d)} joined`;
}

/** What a dataset holding files of the cohort's subjects says beside its name. */
export function holdingWords(s: CohortDetail["sources_holding"][number]): string {
  const parts = [s.feeds ? "feeds this cohort" : `holds ${n(s.subjects)} of these subjects too`];
  if (s.arrives) parts.push(s.arrives === "identified" ? "arrives identified" : s.arrives === "coded" ? "arrives coded" : "arrives de-identified");
  if (typeof s.batches === "number") parts.push(`${n(s.batches)} ${s.batches === 1 ? "batch" : "batches"}`);
  return parts.join(" · ");
}

function StepChartView({ chart, now }: { chart: NonNullable<ReturnType<typeof stepChart>>; now: Date }) {
  // the dates under the steps and the members above them, thinned so no two labels draw over each other
  const labels = chartLabels(chart, now);
  return (
    <svg className="chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`members over time, ${chart.points[chart.points.length - 1].total} now`}>
      <line className="axis" x1="30" y1={chart.base} x2={chart.width - 10} y2={chart.base} />
      <polygon className="area" points={chart.area} />
      <polyline className="line" points={chart.line} />
      <circle className="end" cx={chart.end.x} cy={chart.end.y} r="3" />
      {labels
        .filter((l) => l.kind === "step")
        .map((l) => (
          <text key={`v${l.x}`} className="val" x={l.x + 4} y={Math.max(9, l.y - 6)}>
            {n(l.total)}
          </text>
        ))}
      {labels.map((l) => (
        <text key={`l${l.kind}${l.x}`} className="lab" x={l.x} y={chart.base + 14} textAnchor={l.anchor}>
          {l.words}
        </text>
      ))}
    </svg>
  );
}

/** Add or take out members by hand: the codes, which way, and the reason recorded on every membership. */
function MembersDialog({ cohort: c, onClose, onDone }: { cohort: CohortDetail; onClose: () => void; onDone: (words: string) => void }) {
  const [way, setWay] = useState<"add" | "remove">("add");
  const [codes, setCodes] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const built = membersBody(way === "add" ? codes : "", way === "remove" ? codes : "", why);
  const go = () => {
    if (!built.ok) return;
    setBusy(true);
    setFailed(null);
    cohorts
      .members(c.name, built.body)
      .then((r) => {
        const unknown = Array.isArray(r.unknown) ? (r.unknown as unknown[]).length : 0;
        onDone(`${built.summary} in ${c.name}${unknown > 0 ? `; ${unknown} ${unknown === 1 ? "code" : "codes"} the registry does not know left out` : ""}.`);
      })
      .catch((e: Error) => {
        setBusy(false);
        setFailed(e.message);
      });
  };
  return (
    <Dialog
      title={`Add or remove in ${c.name}`}
      icon="pencil"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{built.ok ? built.summary : `Needs ${built.why}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || !built.ok} onClick={go}>
            {way === "add" ? "Add them" : "Take them out"}
          </button>
        </div>
      }
    >
      <div className="field">
        <span className="label">Which way</span>
        <label className="choice">
          <input type="radio" name="way" checked={way === "add"} onChange={() => setWay("add")} />
          Add these subjects
        </label>
        <label className="choice">
          <input type="radio" name="way" checked={way === "remove"} onChange={() => setWay("remove")} />
          Take these subjects out
        </label>
      </div>
      <label className="field">
        <span className="label">Codes, one per line</span>
        <span className="input mono">
          <textarea value={codes} rows={6} autoFocus onChange={(e) => setCodes(e.target.value)} />
        </span>
      </label>
      <label className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="consent withdrawn, from the grant's list" />
        </span>
      </label>
      <Says head="What is recorded">
        Every membership records who did it, when and why. Leaving closes the membership and erases nothing. A code the registry does not know is named back, not added.
      </Says>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

function RenameDialog({ cohort: c, onClose }: { cohort: CohortDetail; onClose: () => void }) {
  const [name, setName] = useState(c.name);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const trimmed = name.trim();
  const same = trimmed === c.name;
  const go = () => {
    setBusy(true);
    setFailed(null);
    cohorts
      .set(c.name, { name: trimmed })
      .then(() => {
        location.hash = href("data", "cohorts", trimmed);
        onClose();
      })
      .catch((e: Error) => {
        setBusy(false);
        setFailed(e.message);
      });
  };
  return (
    <Dialog
      title={`Rename ${c.name}`}
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">Its members, history and releases keep to it.</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || same || trimmed === ""} onClick={go}>
            Rename
          </button>
        </div>
      }
    >
      <label className="field">
        <span className="label">Name</span>
        <span className="input mono">
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </span>
      </label>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

function RetireDialog({ cohort: c, onClose, onDone }: { cohort: CohortDetail; onClose: () => void; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const back = c.retired_at !== null;
  const go = () => {
    setBusy(true);
    setFailed(null);
    cohorts
      .set(c.name, { retired: !back })
      .then(() => {
        if (back) onDone(`${c.name} is back in the lists.`);
        else {
          location.hash = href("data", "cohorts");
          onClose();
        }
      })
      .catch((e: Error) => {
        setBusy(false);
        setFailed(e.message);
      });
  };
  return (
    <Dialog
      title={back ? `Bring ${c.name} back` : `Retire ${c.name}`}
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{back ? "It returns with the members and history it kept." : "Its members and history stay."}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy} onClick={go}>
            {back ? "Bring it back" : "Retire it"}
          </button>
        </div>
      }
    >
      <Says head={back ? "What coming back changes" : "What retiring changes"}>
        {back
          ? "It returns to the lists, and Review, Release and the Query offer it again."
          : "A retired cohort leaves the lists: Review, Release and the Query no longer offer it. Nothing is erased, and it can be brought back from its page."}
      </Says>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
