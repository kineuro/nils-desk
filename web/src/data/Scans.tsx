// SPDX-License-Identifier: AGPL-3.0-only
// The chosen dataset's scans (Wave 7a, record 55 H2): their pictures in a
// grid by subject and session, fifty in one request, a coloured border only
// on a scan the sort is not sure of. A click opens the scan in place in the
// light viewer, picture first. What picking main scans found is one line a
// role above the grid; picking itself is a pipeline step, not a button here.

import { useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href, narrow } from "../routes";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import type { Dataset } from "./datasets";
import { maySeePicks, pickLineWords, picksSummary, type PickLine } from "./picks";
import { markOpen, ScanViewer } from "./ScanViewer";
import { fillPictures, groupScans, picturesToCome, mayListScans, questionWords, SCANS_PAGE, scanDoors, scanFacts, type ScanPage } from "./scans";

/** The pauses before the page is asked again while pictures are being made, in milliseconds. */
export const PICTURE_POLL = [700, 1500, 2500, 4000, 6000, 8000, 10000];

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; at: ScanPage };

const n = (v: number) => v.toLocaleString("en-US");

export function Scans({ caps, dataset: d }: { caps: Capabilities; dataset: Dataset }) {
  const sorted = d.totals.stacks > 0;
  const lists = mayListScans(caps) && sorted;
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [open, setOpen] = useState<number | null>(null);
  // the cursor each page read so far was read after; the first page's is null
  const [afters, setAfters] = useState<(number | null)[]>([null]);

  const read = (after: number | null, done: () => void, live: () => boolean = () => true) => {
    setLoad({ kind: "loading", since: Date.now() });
    scanDoors.page(d.name, after).then(
      (at) => {
        if (!live()) return;
        done();
        setOpen(null);
        setLoad({ kind: "ready", at });
      },
      (e: unknown) => live() && setLoad({ kind: "failed", why: messageOf(e) }),
    );
  };

  useEffect(() => {
    setOpen(null);
    setAfters([null]);
    if (!lists) return;
    let live = true;
    read(null, () => undefined, () => live);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new dataset is what reads again
  }, [lists, d.name]);

  const page = afters.length - 1;

  // pictures still being made: the page asked again after short and then
  // longer pauses for about half a minute, each picture that came filled in
  // its place; turning back to a page reads it again
  const latest = useRef(load);
  latest.current = load;
  const after = afters[page];
  // a partial picture (a first one while its preview is made) is waited for like a missing one
  const missing = load.kind === "ready" && load.at.pictures?.shown ? picturesToCome(load.at.pictures) : 0;
  const waiting = missing > 0;
  useEffect(() => {
    if (!waiting || !lists) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pauses = [...PICTURE_POLL];
    const tick = () => {
      const ms = pauses.shift();
      if (ms === undefined) return;
      timer = setTimeout(() => {
        scanDoors.page(d.name, after).then(
          (fresh) => {
            if (!alive) return;
            const was = latest.current;
            if (was.kind !== "ready") return;
            const at = fillPictures(was.at, fresh);
            if (at !== was.at) setLoad({ kind: "ready", at });
            if (picturesToCome(at.pictures) > 0) tick();
          },
          () => alive && tick(),
        );
      }, ms);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [waiting, lists, d.name, after]);
  const turn = (to: number) => {
    if (load.kind !== "ready") return;
    if (to > page && load.at.next !== null) {
      const after = load.at.next;
      read(after, () => setAfters((a) => [...a, after]));
    } else if (to < page) {
      read(afters[to], () => setAfters((a) => a.slice(0, to + 1)));
    }
  };

  const at = lists && load.kind === "ready" ? load.at : null;
  const pages = at ? Math.max(1, Math.ceil(at.total / SCANS_PAGE)) : 1;
  // the grid's order is the viewer's: next and previous follow what is on screen
  const groups = at ? groupScans(at.scans) : [];
  const order = groups.flatMap((g) => g.sessions.flatMap((s) => s.scans));
  const index = open === null ? -1 : order.findIndex((s) => s.id === open);
  return (
    <section className="stack roomy" aria-label={`the scans of ${d.name}`}>
      <div className="section-head rule-top">
        <h2>Scans of {d.name}</h2>
        {at && <span className="meta">{n(at.total)}</span>}
      </div>
      {sorted && <PickLines caps={caps} dataset={d.name} />}
      {!sorted && <p className="meta">No scans yet</p>}
      {lists && load.kind === "loading" && <Wait phase="reading the scans" since={load.since} size="panel" />}
      {lists && load.kind === "failed" && <p className="warn">The scans could not be read: {load.why}</p>}
      {at && at.scans.length === 0 && <p className="meta">No scans yet</p>}
      {at?.pictures && !at.pictures.shown && at.pictures.why && <p className="meta scan-pictures">No pictures: {at.pictures.why}</p>}
      {at?.pictures?.shown && missing > 0 && (
        <p className="meta scan-pictures">
          {n(missing)} {missing === 1 ? "picture" : "pictures"} being made
        </p>
      )}
      {at && at.scans.length > 0 && (
        <div className={index >= 0 ? "scans open" : "scans"}>
          <div className="scan-grid">
            {groups.map((g) => (
              <div key={g.key} className="scan-subject">
                <b>{g.subject}</b>
                {g.sessions.map((s) => (
                  <div key={s.key} className="scan-session">
                    <span className="meta">{s.day ?? "no date"}</span>
                    <ul>
                      {s.scans.map((sc) => {
                        const look = sc.questions.length > 0;
                        const on = open === sc.id;
                        return (
                          <li key={sc.id}>
                            <button
                              type="button"
                              className={`scan-tile${look ? " look" : ""}${on ? " on" : ""}`}
                              aria-pressed={on}
                              title={[scanFacts(sc), look ? questionWords(sc) : ""].filter(Boolean).join(" · ")}
                              onClick={() => {
                                markOpen(sc.id);
                                setOpen(sc.id);
                              }}
                            >
                              {sc.picture ? <img src={sc.picture} alt="" loading="lazy" decoding="async" /> : <span className={waiting ? "scan-blank making" : "scan-blank"} title={waiting ? "Picture being made" : undefined} />}
                              <span className="scan-name">{sc.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
            {pages > 1 && (
              <div className="row scan-pages">
                <button type="button" className="button quiet small" disabled={page === 0} aria-label="Previous page" onClick={() => turn(page - 1)}>
                  <Icon name="chevron-left" />
                </button>
                <span className="meta num">
                  {page + 1} / {pages}
                </span>
                <button type="button" className="button quiet small" disabled={at.next === null} aria-label="Next page" onClick={() => turn(page + 1)}>
                  <Icon name="chevron-right" />
                </button>
              </div>
            )}
          </div>
          {index >= 0 && <ScanViewer scans={order} at={index} onAt={(i) => setOpen(order[i].id)} onClose={() => setOpen(null)} />}
        </div>
      )}
    </section>
  );
}

/** What picking main scans found here, a line a role, where the pick run left a summary. */
function PickLines({ caps, dataset }: { caps: Capabilities; dataset: string }) {
  const [lines, setLines] = useState<PickLine[]>([]);
  const sees = maySeePicks(caps);
  useEffect(() => {
    setLines([]);
    if (!sees) return;
    let live = true;
    picksSummary.read(dataset).then(
      (l) => live && setLines(l),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [dataset, sees]);
  if (lines.length === 0) return null;
  return (
    <div className="pick-lines">
      {lines.map((l) => (
        <div key={l.role} className="row pick-line">
          <span>{pickLineWords(l)}</span>
          {l.review > 0 && (
            <a className="button secondary small" href={narrow(href("review", "picks"), { dataset })}>
              Review {n(l.review)}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
