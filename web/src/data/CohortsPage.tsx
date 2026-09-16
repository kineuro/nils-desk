// SPDX-License-Identifier: AGPL-3.0-only
// Data / Cohorts: who belongs to what. One card per cohort with what waits on
// it, where its members come from, its counts and its releases; a new cohort
// from here, and the three ways a subject joins: a dataset feeds it, a query
// card promotes them, a hand adds them from a list.

import { useEffect, useState } from "react";
import type React from "react";
import { needsWork } from "../access";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { objects } from "../objects/client";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { cohorts, cohortState, membersBody, metaWords, provenanceLine, sessionsWords, type Cohort } from "./cohorts";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Cohort[] };

const n = (v: number) => v.toLocaleString("en-US");

export function CohortsPage({ caps }: { caps: Capabilities }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [making, setMaking] = useState<{ list: boolean } | null>(null);
  // record 26: every count of sessions is of the session cache as it stands, so the page says the window it was built under
  const [windowDays, setWindowDays] = useState<number | null>(null);
  useEffect(() => {
    cohorts
      .list()
      .then((list) => setLoad({ kind: "ready", list }))
      .catch((e: Error) => setLoad({ kind: "failed", why: e.message }));
  }, []);
  useEffect(() => {
    if (served(caps, "GET /api/summary")) objects.summary().then((s) => setWindowDays(s.sessions.window_days ?? null), () => undefined);
  }, [caps]);
  return (
    <CohortsBody caps={caps} list={load.kind === "ready" ? load.list : null} since={load.kind === "loading" ? load.since : null} why={load.kind === "failed" ? load.why : null} windowDays={windowDays} onNew={(list) => setMaking({ list })}>
      {making && <NewCohortDialog caps={caps} fromList={making.list} taken={load.kind === "ready" ? load.list.map((c) => c.name) : []} onClose={() => setMaking(null)} />}
    </CohortsBody>
  );
}

export interface CohortsBodyProps {
  caps: Capabilities;
  /** What the page read, or null while it reads. */
  list: readonly Cohort[] | null;
  since?: number | null;
  why: string | null;
  now?: number;
  /** The window the session cache was built under, where the summary said; null where it did not. */
  windowDays?: number | null;
  onNew: (fromList: boolean) => void;
  children?: React.ReactNode;
}

/** Why making a cohort is not offered, or null when it is. */
export function makingRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/cohorts")) return "This engine has no door for making a cohort.";
  return needsWork(caps, "Making a cohort", [["data:work", "the Data page"]]);
}

/** The page as it draws from what it read. */
export function CohortsBody({ caps, list, since = null, why, now = Date.now(), windowDays = null, onNew, children }: CohortsBodyProps) {
  const making = makingRefusal(caps);
  const live = (list ?? []).filter((c) => !c.retired_at);
  const retired = (list ?? []).filter((c) => c.retired_at);
  return (
    <section className="data cohorts">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Cohorts</h1>
          <p className="lede">
            Who belongs to what. A cohort is a set of subjects and nothing else: make one, rename it, retire it, add or take out whom you like. Every join and leave is recorded with its reason: a dataset fed it, a query promoted it, or a hand did it.
          </p>
        </div>
        {making === null && (
          <button type="button" className="button" onClick={() => onNew(false)}>
            <Icon name="plus" />
            New cohort
          </button>
        )}
      </div>
      {list === null && !why && <Wait phase="reading the cohorts" since={since ?? now} size="panel" />}
      {why && <p className="warn">The cohorts could not be read: {why}</p>}
      {making !== null && list !== null && <p className="meta">{making}</p>}
      {list !== null && live.length === 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">No cohort yet.</p>
            <p className="note-detail">Set one on a dataset so every digest fills it, promote a query card's answer, or make one and paste a list of codes.</p>
          </div>
        </div>
      )}
      {list !== null && (live.length > 0 || making === null) && (
        <div className="sgrid">
          {live.map((c) => (
            <CohortCard key={c.name} cohort={c} now={now} />
          ))}
          {making === null && (
            <button type="button" className="ccard add" onClick={() => onNew(false)}>
              <Icon name="plus" size="lg" />
              <span>New cohort</span>
              <span className="meta">from a dataset, a query, or a list</span>
            </button>
          )}
        </div>
      )}
      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>Three ways a subject joins</h2>
          <span className="meta">each join is recorded with who, when and what brought it</span>
        </div>
        <div className="ways">
          <div className="way">
            <span className="sq brand">
              <Icon name="folder" />
            </span>
            <b>A dataset feeds it</b>
            <span className="meta">Set on the dataset. Every digest adds the new subjects it brings in, so a folder that grows keeps its cohort whole.</span>
            <div className="row">
              <a className="button secondary small" href={href("data")}>
                Set on a dataset
              </a>
            </div>
          </div>
          <div className="way">
            <span className="sq brand">
              <Icon name="search" />
            </span>
            <b>A query promotes them</b>
            <span className="meta">A complete answer becomes members, the subjects of its rows at any grain, with the query's version and epoch on each. A subset of any cohort is one query away.</span>
            <div className="row">
              <a className="button secondary small" href={href("query")}>
                From a query card
              </a>
            </div>
          </div>
          <div className="way">
            <span className="sq brand">
              <Icon name="pencil" />
            </span>
            <b>A hand adds them</b>
            <span className="meta">Paste codes, or take some out, with a reason. Leaving closes the membership; nothing is erased.</span>
            <div className="row">
              {making === null ? (
                <button type="button" className="button secondary small" onClick={() => onNew(true)}>
                  From a list
                </button>
              ) : (
                <span className="meta">needs work on the Data page</span>
              )}
            </div>
          </div>
        </div>
      </section>
      {retired.length > 0 && (
        <details className="retired">
          <summary className="meta">
            {retired.length} retired {retired.length === 1 ? "cohort keeps" : "cohorts keep"} its members and history
          </summary>
          <ul className="retired-list">
            {retired.map((c) => (
              <li key={c.name}>
                <a href={href("data", "cohorts", c.name)}>{c.name}</a>
                <span className="meta">
                  {n(c.subjects)} subjects · retired {new Date(c.retired_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="note gated">
        <Icon name="lock" />
        <div className="note-body">
          <p className="note-detail">
            Review, Release and the Query start from cohorts. A subject in two cohorts is counted in each and decided once. Sessions and stacks are never members: a cohort names people, and a query card names what of theirs. The sessions counted here are the ones the session cache holds{windowDays === null ? "" : `, built under a ${n(windowDays)}-day window`}; where nobody has built it they are not built yet, and a person builds them.
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CohortCard({ cohort: c, now }: { cohort: Cohort; now: number }) {
  const state = cohortState(c, now);
  const from = provenanceLine(c, new Date(now));
  return (
    <a className={state.tone === "brand" ? "ccard new" : "ccard"} href={href("data", "cohorts", c.name)}>
      <span className="name">
        <Icon name="users" />
        <span className="grow">{c.name}</span>
        <span className={state.tone === "neutral" ? "tag" : `tag ${state.tone}`}>
          {state.check && <Icon name="check" />}
          {state.words}
        </span>
      </span>
      <span className="from">
        <Icon name={from.icon} />
        <span className="from-words">
          {from.lead} {from.name && <b>{from.name}</b>}
          {from.tail && ` · ${from.tail}`}
        </span>
      </span>
      <span className="nums">
        <span>
          <b>{n(c.subjects)}</b>subjects
        </span>
        <span>
          <b>{sessionsWords(c.sessions)}</b>sessions
        </span>
        <span>
          <b>{n(c.stacks)}</b>stacks
        </span>
      </span>
      <span className="meta">{metaWords(c, new Date(now))}</span>
    </a>
  );
}

/** New cohort: its name, owner and why, and, from a list, the codes that join it at once. */
export function NewCohortDialog({ caps, fromList, taken, onClose }: { caps: Capabilities; fromList: boolean; taken: readonly string[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState(caps.person.display_name || caps.person.subject);
  const [why, setWhy] = useState("");
  const [codes, setCodes] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const trimmed = name.trim();
  const members = served(caps, "POST /api/cohorts/{name}/members");
  const listed = codes.trim() !== "";
  const refusal = trimmed === "" ? "a name" : taken.includes(trimmed) ? "another name; that one is taken" : !/^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u.test(trimmed) ? "a name of letters, digits, dots, dashes or underscores" : listed && !why.trim() ? "why; it is recorded on every membership" : null;
  const make = () => {
    setBusy(true);
    setFailed(null);
    cohorts
      .make({ name: trimmed, ...(owner.trim() ? { owner: owner.trim() } : {}), ...(why.trim() ? { description: why.trim() } : {}) })
      .then(async () => {
        if (listed && members) {
          const body = membersBody(codes, "", why);
          if (body.ok) await cohorts.members(trimmed, body.body);
        }
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
      title="New cohort"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal ? `Needs ${refusal}.` : "The cohort appears on Data / Cohorts at once."}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || refusal !== null} onClick={make}>
            Make the cohort
          </button>
        </div>
      }
    >
      <div className="fields2">
        <label className="field">
          <span className="label">Name</span>
          <span className="input mono">
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="north-7t" />
          </span>
        </label>
        <label className="field">
          <span className="label">Owner</span>
          <span className="input">
            <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </span>
        </label>
      </div>
      <label className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="what this cohort is for" />
        </span>
      </label>
      {members && (
        <details className="more-fields" open={fromList}>
          <summary>Subjects to add now, from a list</summary>
          <div className="more-body">
            <label className="field">
              <span className="label">Codes, one per line</span>
              <span className="input mono">
                <textarea value={codes} rows={5} onChange={(e) => setCodes(e.target.value)} />
              </span>
            </label>
            <p className="meta">Each joins by hand, with the why above as the reason. Codes the registry does not know are named back, not added.</p>
          </div>
        </details>
      )}
      <p className="meta">A cohort names people. Set it on a dataset so every digest fills it, or promote a query card's answer into it later.</p>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
