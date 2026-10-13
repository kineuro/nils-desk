// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's main scans, visit by visit (Wave 7a, record 55 H3; picksHeat.ts):
// the role chosen as a key (only the chosen key in colour), its sessions
// picked, doubted and missing over the whole cohort on one line, and the
// subjects a page at a time, one row each, one cell a session, the cell's
// state its colour and a person's pick its border. A cell opens the cohort's
// Main scans, where picks are made.

import { useEffect, useState } from "react";
import { href, narrow } from "../routes";
import { cellWords, picksDoors, totalsWords, type HeatPage } from "./picksHeat";
import { roleWord } from "./summary";
import "./heat.css";

export function HeatMap({ cohort }: { cohort: string }) {
  const [page, setPage] = useState<HeatPage | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let alive = true;
    setPage(null);
    setWhy(null);
    picksDoors.page(cohort).then(
      (p) => alive && setPage(p),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [cohort]);
  if (why) return <p className="warn">The main scans could not be read: {why}</p>;
  if (!page) return <p className="meta">Reading the main scans.</p>;
  if (page.roles.length === 0 || page.subjects.length === 0) return <HeatEmpty cohort={cohort} />;
  const on = role && page.roles.includes(role) ? role : page.roles[0];
  const open = narrow(href("review", "picks"), { cohort });
  const next = () => {
    if (page.next === null) return;
    setMore(true);
    picksDoors.page(cohort, page.next).then(
      (p) => {
        setPage({ ...page, subjects: [...page.subjects, ...p.subjects], next: p.next });
        setMore(false);
      },
      (e: Error) => {
        setWhy(e.message);
        setMore(false);
      },
    );
  };
  return (
    <div className="heat">
      <div className="heat-head">
        <span className="chips" role="group" aria-label="Role">
          {page.roles.map((r) => (
            <button key={r} type="button" className={r === on ? "opt on" : "opt"} aria-pressed={r === on} onClick={() => setRole(r)}>
              {roleWord(r)}
            </button>
          ))}
        </span>
        <span className="meta heat-totals">{totalsWords(page.totals[on])} sessions</span>
      </div>
      <ol className="heat-rows" aria-label={`Main ${roleWord(on)} by visit`}>
        {page.subjects.map((s) => (
          <li key={s.id} className="heat-row">
            <span className="heat-code mono" title={s.code}>
              {s.code}
            </span>
            <span className="heat-cells">
              {s.sessions.map((v) => {
                const c = v.roles[on];
                return <a key={`${v.session ?? v.studies.join(".")}`} className={`heat-cell ${c?.state ?? "missing"}${c?.by === "person" ? " by-person" : ""}`} href={open} title={cellWords(v, on)} aria-label={cellWords(v, on)} />;
              })}
            </span>
          </li>
        ))}
      </ol>
      <div className="heat-foot">
        <span className="heat-key">
          <i className="heat-cell picked" aria-hidden="true" /> picked <i className="heat-cell doubted" aria-hidden="true" /> doubted <i className="heat-cell missing" aria-hidden="true" /> missing{" "}
          <i className="heat-cell picked by-person" aria-hidden="true" /> a person&apos;s pick
        </span>
        <span className="meta">
          {page.subjects.length.toLocaleString("en-US")} of {page.total.toLocaleString("en-US")} subjects
        </span>
        {page.next !== null && (
          <button type="button" className="button quiet small" disabled={more} onClick={next}>
            {more ? "Reading" : "More subjects"}
          </button>
        )}
        <a className="button secondary small" href={open}>
          Main scans
        </a>
      </div>
    </div>
  );
}

function HeatEmpty({ cohort }: { cohort: string }) {
  return (
    <p className="meta">
      No main scan picked yet. <a href={narrow(href("review", "picks"), { cohort })}>Main scans</a> picks them by the cohort&apos;s rules.
    </p>
  );
}
