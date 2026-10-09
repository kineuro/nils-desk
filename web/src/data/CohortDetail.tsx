// SPDX-License-Identifier: AGPL-3.0-only
// A chosen cohort, under the bands of the Data page (Wave 7a, the design of
// 2026-10-09): its actions with the next step as the one primary button;
// how it grew, the joins from which read of which dataset with its releases
// marked on one line; where its subjects come from, the datasets that feed
// it and the ones that only hold some of them; what its subjects have, a
// main scan per role and their clinical coverage; and its log and releases.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href, narrow } from "../routes";
import { MoreMenu } from "../settings/cards";
import { Icon } from "../ui/Icon";
import { cohortActs, MembersDialog, RenameDialog, RetireDialog } from "./CohortPage";
import { cohorts, type Cohort, type CohortDetail as Detail, type CohortRelease } from "./cohorts";
import { maySeePicks, picksSummary, PICKS_SUMMARY_DOOR, type PickLine } from "./picks";
import { clock, fedWords, growth, joinTitle, roleOrder, roleWord, slotOf, type Holding } from "./summary";

const n = (v: number) => v.toLocaleString("en-US");

type Act = "members" | "rename" | "retire";

export interface CohortDetailProps {
  caps: Capabilities;
  /** The cohort as the list door answered it, drawn at once; its own door's answer fills in the rest. */
  cohort: Cohort;
  /** The datasets on the page, in order, for each one's colour. */
  datasets: string[];
  onChanged: (words: string) => void;
  onRenamed: (name: string) => void;
  onRetired: (name: string) => void;
}

/** The actions of a cohort's head: the ones offered, and which is the primary, the next step. */
export function cohortActions(caps: Capabilities, c: Pick<Cohort, "name" | "waiting" | "subjects" | "releases" | "retired_at">) {
  const acts = cohortActs(caps, c.name);
  const review = c.waiting > 0 && may(caps, "review:see") ? narrow(href("review"), { cohort: c.name }) : null;
  const release = acts.releasing === null && !c.retired_at ? href("release", "new", c.name) : null;
  const query = may(caps, "query:see") && may(caps, "data:work") && !c.retired_at ? href("query") : null;
  const view = href("data", "cohorts", c.name);
  const primary: "review" | "release" | "query" | null = review ? "review" : release && c.releases === 0 && c.subjects > 0 ? "release" : query ? "query" : release ? "release" : null;
  return { acts, review, release, query, view, primary };
}

export function CohortDetail({ caps, cohort: row, datasets, onChanged, onRenamed, onRetired }: CohortDetailProps) {
  const [doc, setDoc] = useState<Detail | null>(null);
  const [picks, setPicks] = useState<{ members: number | null; lines: PickLine[] } | null>(null);
  const [open, setOpen] = useState<Act | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  // what the list said of it: the cohort's own door is read again when it moves
  const moved = `${row.name}:${row.subjects}:${row.stacks}:${row.waiting}:${row.releases}:${row.last_joined ?? ""}`;

  useEffect(() => {
    let alive = true;
    cohorts
      .get(row.name)
      .then((d) => alive && setDoc(d))
      .catch(() => alive && setDoc(null));
    return () => {
      alive = false;
    };
  }, [row.name, moved, asked]);
  useEffect(() => {
    if (!maySeePicks(caps) || !served(caps, PICKS_SUMMARY_DOOR)) return;
    let alive = true;
    picksSummary
      .cohort(row.name)
      .then((p) => alive && setPicks(p))
      .catch(() => alive && setPicks(null));
    return () => {
      alive = false;
    };
  }, [caps, row.name, moved, asked]);

  const c = { ...row, ...(doc ?? {}) } as Cohort & Partial<Detail>;
  const a = cohortActions(caps, row);
  const holding: Holding[] = (doc?.datasets ?? row.datasets ?? []).filter((h) => h.subjects > 0 || h.feeds);
  const members = row.subjects;
  const releases: CohortRelease[] = Array.isArray(doc?.releases) ? doc.releases : [];
  const today = new Date();

  const secondary = [
    a.query && a.primary !== "query" ? (
      <a key="query" className="button secondary" href={a.query}>
        Add subjects from a query
      </a>
    ) : null,
    a.release && a.primary !== "release" ? (
      <a key="release" className="button secondary" href={a.release}>
        Release
      </a>
    ) : null,
    <a key="view" className="button secondary" href={a.view}>
      View
    </a>,
  ];
  const primary =
    a.primary === "review" && a.review ? (
      <a className="button" href={a.review}>
        Review {n(row.waiting)}
      </a>
    ) : a.primary === "release" && a.release ? (
      <a className="button" href={a.release}>
        Release
      </a>
    ) : a.primary === "query" && a.query ? (
      <a className="button" href={a.query}>
        Add subjects from a query
      </a>
    ) : null;
  const menu = !row.retired_at && a.acts.members === null ? ["members"] : [];
  if (a.acts.changing === null) menu.push("rename", "retire");

  return (
    <section className="dp-detail" aria-label={row.name}>
      <div className="dp-detail-head">
        <Icon name="users" size="lg" />
        <span className="dp-detail-name">{row.name}</span>
        <span className="tag">{fedWords(row)}</span>
        <span className="dp-detail-say">{[row.description, row.owner ? `owner ${row.owner}` : null].filter(Boolean).join(" · ")}</span>
        <span className="dp-acts">
          {secondary}
          {primary}
          {menu.length > 0 && (
            <MoreMenu label={`More for ${row.name}`}>
              {menu.includes("members") && (
                <button type="button" onClick={() => setOpen("members")}>
                  Add or take out by hand
                </button>
              )}
              {menu.includes("rename") && (
                <button type="button" onClick={() => setOpen("rename")}>
                  Rename
                </button>
              )}
              {menu.includes("retire") && (
                <button type="button" onClick={() => setOpen("retire")}>
                  {row.retired_at ? "Bring back" : "Retire"}
                </button>
              )}
            </MoreMenu>
          )}
        </span>
      </div>
      {said && <p className="dp-said meta">{said}</p>}

      <div className="dp-sec">
        <h3 className="eyebrow">How it grew</h3>
        {doc ? <Grew joins={doc.joins} releases={releases} /> : <p className="meta">Reading how it grew.</p>}
      </div>

      <div className="dp-cols">
        <div className="dp-col">
          <h3 className="eyebrow">Where its subjects come from</h3>
          {holding.length === 0 && <p className="meta">No dataset holds its subjects yet.</p>}
          {holding.map((h) => (
            <div key={h.name} className="dp-src">
              <div className="dp-src-line">
                <i className={`dp-sw dp-c${slotOf({ from: "dataset", dataset: h.name }, datasets)}`} aria-hidden="true" />
                <span className="grow">{h.name}</span>
                <span className={h.feeds ? "tag brand" : "tag"}>{h.feeds ? "feeds it" : "holds some"}</span>
                <span className="dp-src-n">{n(h.subjects)} subjects</span>
              </div>
              <span className="dp-track">
                <i className={`dp-c${slotOf({ from: "dataset", dataset: h.name }, datasets)}`} style={{ width: `${members > 0 ? Math.round((h.subjects / members) * 100) : 0}%` }} />
              </span>
            </div>
          ))}
          <div className="meta">A dataset that feeds it adds subjects at every read; one that holds some gives scans.</div>
        </div>
        <div className="dp-col">
          <h3 className="eyebrow">What its subjects have</h3>
          <div className="dp-funnel" aria-label="subjects, visits and scans">
            <span>
              <b>{n(members)}</b> subjects
            </span>
            <span className="arrow">→</span>
            <span>
              <b>{row.sessions === null ? "?" : n(row.sessions)}</b> visits
            </span>
            <span className="arrow">→</span>
            <span>
              <b>{n(row.stacks)}</b> scans
            </span>
          </div>
          <Have members={picks?.members ?? members} lines={picks?.lines ?? null} />
          <Clinical coverage={doc?.clinical ?? []} members={members} waiting={row.waiting} />
        </div>
        <div className="dp-col">
          <div className="dp-col-head">
            <h3 className="eyebrow">Its log</h3>
          </div>
          <CohortLog cohort={c} releases={releases} now={today} />
          {releases.length > 0 && (
            <>
              <h3 className="eyebrow dp-gap">Releases</h3>
              {releases.map((r) => (
                <div key={r.id ?? r.name} className="dp-release">
                  <Icon name="release" />
                  <span className="grow">{r.name}</span>
                  <span className="meta">
                    {[r.layout ? r.layout.toUpperCase() : null, typeof r.subjects === "number" ? `${n(r.subjects)} subjects` : null, clock(r.finished_at ?? r.started_at ?? null, today)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {open === "members" && (
        <MembersDialog
          cohort={row}
          onClose={() => setOpen(null)}
          onDone={(words) => {
            setOpen(null);
            setSaid(words);
            setAsked((x) => x + 1);
            onChanged(words);
          }}
        />
      )}
      {open === "rename" && <RenameDialog cohort={row} onClose={() => setOpen(null)} onRenamed={onRenamed} />}
      {open === "retire" && (
        <RetireDialog
          cohort={row}
          onClose={() => setOpen(null)}
          onDone={(words) => {
            setOpen(null);
            onChanged(words);
          }}
          onRetired={() => onRetired(row.name)}
        />
      )}
    </section>
  );
}

/** How a cohort grew: its joins and its releases on one line, oldest first. */
function Grew({ joins, releases }: { joins: Detail["joins"]; releases: CohortRelease[] }) {
  const events = growth(joins, releases);
  if (events.length === 0) return <p className="meta">Nobody has joined yet.</p>;
  return (
    <ol className="dp-grew">
      {events.map((e, i) => (
        // the newest sits at the end of the line, its words to the left of it, so nothing runs past the edge
        <li
          key={`${e.when} ${i}`}
          className={i > 0 && i === events.length - 1 ? `dp-ev ${e.kind} end` : `dp-ev ${e.kind}`}
          style={i > 0 && i === events.length - 1 ? { right: 0 } : { left: `${e.left}%` }}
        >
          <span className="mark" aria-hidden="true" />
          <span className="when">{e.when.slice(0, 10)}</span>
          <span className="title">{e.title}</span>
          <span className="what">{e.what}</span>
        </li>
      ))}
    </ol>
  );
}

/** How many members have a main scan of each role. */
function Have({ members, lines }: { members: number; lines: PickLine[] | null }) {
  const roles = [...(lines ?? [])].filter((l) => l.subjects !== null || l.picked > 0).sort((a, b) => roleOrder(a.role, b.role));
  if (roles.length === 0) return <p className="meta">No main scans picked yet.</p>;
  return (
    <>
      <div className="dp-line">Subjects with a main scan of each kind</div>
      <div className="dp-kinds">
        {roles.map((l) => {
          const have = l.subjects ?? 0;
          return (
            <div key={l.role} className="dp-kind wide">
              <span>{roleWord(l.role)}</span>
              <span className="dp-track">
                <i style={{ width: `${members > 0 ? Math.round((have / members) * 100) : 0}%` }} />
              </span>
              <span className="count">
                {n(have)} of {n(members)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The members' clinical coverage, the primary kinds first, and what waits on Review. */
function Clinical({ coverage, members, waiting }: { coverage: { kind: string; primary: boolean; subjects: number }[]; members: number; waiting: number }) {
  const shown = coverage.slice(0, 2);
  if (shown.length === 0 && waiting === 0) return null;
  return (
    <div className="meta">
      {shown.length > 0 && <>Clinical: {shown.map((k) => `${k.kind} for ${n(k.subjects)} of ${n(members)}`).join(", ")}</>}
      {shown.length > 0 && waiting > 0 && " · "}
      {waiting > 0 && <span className="warn">{n(waiting)} wait on Review</span>}
    </div>
  );
}

/** A cohort's log: who joined and left, its releases, and when it was made, newest first. */
function CohortLog({ cohort: c, releases, now }: { cohort: Cohort & Partial<Detail>; releases: CohortRelease[]; now: Date }) {
  const lines: { at: number; when: string; what: string; how: string }[] = [];
  for (const j of c.joins ?? []) {
    const w = joinTitle(j);
    lines.push({ at: Date.parse(j.when), when: clock(j.when, now), what: w.title, how: w.what });
  }
  for (const r of releases) {
    const when = r.finished_at ?? r.started_at ?? null;
    if (!when) continue;
    lines.push({ at: Date.parse(when), when: clock(when, now), what: "Released", how: [r.name, r.handed_over ? "handed over" : null].filter(Boolean).join(", ") });
  }
  lines.push({
    at: Date.parse(c.created_at),
    when: clock(c.created_at, now),
    what: "Made",
    how: [c.owner ? `by ${c.owner}` : null, c.feeds.length > 0 ? `fed by ${c.feeds.join(", ")}` : null].filter(Boolean).join(", "),
  });
  const shown = lines
    .filter((l) => Number.isFinite(l.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  return (
    <div className="dp-log">
      {shown.map((l, i) => (
        <div key={i} className="dp-log-row">
          <span className="at">{l.when}</span>
          <span>
            <span className="what">{l.what}</span> <span className="how">{l.how}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
