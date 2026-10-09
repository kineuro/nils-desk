// SPDX-License-Identifier: AGPL-3.0-only
// The chosen dataset's scans (Wave 7a): a compact list grouped by subject and
// session, a page at a time, and the viewer beside it for the scan clicked;
// its picture is prepared when first opened. Pick main scans sits beside the
// list, where a person looks for it.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { StackView } from "../campaigns/StackView";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import type { Dataset } from "./datasets";
import { PickRun } from "./PickRun";
import { groupScans, mayListScans, SCANS_PAGE, scanDoors, scanFacts, type Scan, type ScanPage } from "./scans";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; at: ScanPage };

const n = (v: number) => v.toLocaleString("en-US");

export function Scans({ caps, dataset: d, onSaid }: { caps: Capabilities; dataset: Dataset; onSaid?: (words: string) => void }) {
  const sorted = d.totals.stacks > 0;
  const lists = mayListScans(caps) && sorted;
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [open, setOpen] = useState<Scan | null>(null);
  // the cursor each page read so far was read after; the first page's is null
  const [afters, setAfters] = useState<(number | null)[]>([null]);

  const read = (after: number | null, done: () => void, live: () => boolean = () => true) => {
    setLoad({ kind: "loading", since: Date.now() });
    scanDoors.page(d.name, after).then(
      (at) => {
        if (!live()) return;
        done();
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
  }, [lists, d.name]);

  const page = afters.length - 1;
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
  return (
    <section className="stack roomy" aria-label={`the scans of ${d.name}`}>
      <div className="section-head rule-top">
        <h2>Scans of {d.name}</h2>
        {at && <span className="meta">{n(at.total)}</span>}
        {sorted && <PickRun caps={caps} of={{ dataset: d.name }} onQueued={onSaid} />}
      </div>
      {!sorted && <p className="meta">No scans yet</p>}
      {lists && load.kind === "loading" && <Wait phase="reading the scans" since={load.since} size="panel" />}
      {lists && load.kind === "failed" && <p className="warn">The scans could not be read: {load.why}</p>}
      {at && at.scans.length === 0 && <p className="meta">No scans yet</p>}
      {at && at.scans.length > 0 && (
        <div className={open ? "scans open" : "scans"}>
          <div className="scan-list">
            {groupScans(at.scans).map((g) => (
              <div key={g.key} className="scan-subject">
                <b>{g.subject}</b>
                {g.sessions.map((s) => (
                  <div key={s.key} className="scan-session">
                    <span className="meta">{s.day ?? "no date"}</span>
                    <ul>
                      {s.scans.map((sc) => (
                        <li key={sc.id}>
                          <button type="button" className={open?.id === sc.id ? "scan-row on" : "scan-row"} aria-pressed={open?.id === sc.id} onClick={() => setOpen(sc)}>
                            <span className="scan-name">{sc.name}</span>
                            <span className="meta">{scanFacts(sc)}</span>
                          </button>
                        </li>
                      ))}
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
          {open && (
            <div className="scan-view">
              <div className="row">
                <b className="grow">{open.name}</b>
                <button type="button" className="icon-button" aria-label="Close the scan" onClick={() => setOpen(null)}>
                  <Icon name="x" />
                </button>
              </div>
              <StackView stack={open.id} view="planes" keys />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
