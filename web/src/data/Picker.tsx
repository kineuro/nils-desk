// SPDX-License-Identifier: AGPL-3.0-only
// Bringing DICOM in from the engine's own ingest locations, for a person with
// work on Data: the locations to start from, the folders inside a folder at
// any depth, a page at a time and filtered by name, each on screen with what a
// look inside it found, and the folders chosen from anywhere, each queued as a
// digest of its own. A digest reads only under a source place, so a folder no
// source place holds is added as a source first, which asks for work on the
// Places page too. The engine lists nothing outside its locations.
//
// It chooses one folder as readily as many (record 27, R2b): with
// `choose="one"` a row is picked rather than ticked, the folder picked is the
// caller's to hold, and the list that queues a digest each is not drawn, since
// Add a dataset declares the folder itself rather than digesting it.

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { placeName } from "../home/look";
import { objects, type Place } from "../objects/client";
import { placesKept } from "../objects/kept";
import { ops } from "../ops/client";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { ingest, type FolderEntry, type FolderPage, type IngestRoot, type LookedFolder } from "./browse";
import {
  childAt,
  chosenNote,
  crumbsOf,
  digestPlan,
  digestWords,
  folderNote,
  held,
  heldBy,
  insideOf,
  listWords,
  lookNames,
  lookWords,
  mergePage,
  parentAt,
  pathInside,
  queuedWords,
  rootWords,
  toggleChosen,
  type Chosen,
} from "./picker";

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

export function IngestPicker(props: {
  places: Place[];
  /** The words of what was queued, in the many-folder choice. */
  onDone?: (words: string) => void;
  outside?: React.ReactNode;
  adding: string | null;
  /** Many folders, each a digest of its own (the default), or one folder for the caller to hold. */
  choose?: "many" | "one";
  /** The folder picked, in the single choice. */
  picked?: Chosen | null;
  onPick?: (folder: Chosen) => void;
}) {
  // `adding`: why a folder may not be added as a source here, in words, or null when it may
  const { places, onDone, outside, adding, picked = null, onPick } = props;
  const one = props.choose === "one";
  // the folder open, or null for the locations
  const [at, setAt] = useState<string | null>(null);
  const [roots, setRoots] = useState<IngestRoot[] | null>(null);
  const [page, setPage] = useState<FolderPage | null>(null);
  const [rows, setRows] = useState<FolderEntry[]>([]);
  const [reading, setReading] = useState<{ since: number; more: boolean } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [filter, setFilter] = useState("");
  const [reload, setReload] = useState(0);
  // what a look found, by the folder's @root/relative
  const [looks, setLooks] = useState<Record<string, LookedFolder>>({});
  const [visible, setVisible] = useState<string[]>([]);
  const [looking, setLooking] = useState(false);
  const [stalled, setStalled] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [act, setAct] = useState<Act>({ kind: "idle" });
  // an answer to a read made before the person moved on is dropped
  const view = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLElement>(null);
  const working = act.kind === "working";

  // the name typed filters the folders once typing pauses
  useEffect(() => {
    const t = setTimeout(() => setFilter(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    const mine = ++view.current;
    setWhy(null);
    setStalled(null);
    setVisible([]);
    setReading({ since: Date.now(), more: false });
    const failed = (e: unknown) => {
      if (view.current !== mine) return;
      setWhy(messageOf(e));
      setReading(null);
    };
    if (at === null) {
      ingest.roots().then((r) => {
        if (view.current !== mine) return;
        setRoots(r.roots);
        setReading(null);
      }, failed);
      return;
    }
    ingest.folders(at, filter, null).then((p) => {
      if (view.current !== mine) return;
      setPage(p);
      setRows(p.folders);
      setReading(null);
    }, failed);
  }, [at, filter, reload]);

  // the trail shows the folder open, however long the way to it
  useEffect(() => {
    const t = trailRef.current;
    if (t) t.scrollLeft = t.scrollWidth;
  }, [at]);

  // the folders on screen, which are the ones looked inside
  useEffect(() => {
    const box = listRef.current;
    if (!box) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(rows.map((r) => r.name));
      return;
    }
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const name = (e.target as HTMLElement).dataset["name"];
          if (name === undefined) continue;
          if (e.isIntersecting) seen.add(name);
          else seen.delete(name);
        }
        setVisible([...seen]);
      },
      { root: box, rootMargin: "160px 0px" },
    );
    box.querySelectorAll<HTMLElement>("[data-name]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rows]);

  // one look at a time, for the folders on screen it has not reached yet
  useEffect(() => {
    if (at === null || looking || stalled !== null) return;
    const names = lookNames(at, rows, visible, looks);
    if (names.length === 0) return;
    const here = at;
    const mine = view.current;
    const t = setTimeout(() => {
      setLooking(true);
      ingest
        .look(here, names)
        .then((l) => {
          if (view.current !== mine) return;
          const found: Record<string, LookedFolder> = {};
          for (const f of l.folders) found[childAt(here, f.name)] = f;
          setLooks((was) => ({ ...was, ...found }));
          // a look that reached no folder is not asked again by itself
          if (!l.folders.some((f) => f.looked)) setStalled("The look inside reached no folder in its time.");
        })
        .catch((e: unknown) => {
          if (view.current === mine) setStalled(`The look inside did not answer: ${messageOf(e)}`);
        })
        .finally(() => setLooking(false));
    }, 200);
    return () => clearTimeout(t);
  }, [at, rows, visible, looks, looking, stalled]);

  const go = (next: string | null) => {
    setTyped("");
    setFilter("");
    setRows([]);
    setPage(null);
    setAt(next);
  };

  const more = () => {
    if (at === null || !page?.next) return;
    const mine = view.current;
    setReading({ since: Date.now(), more: true });
    ingest.folders(at, filter, page.next).then(
      (p) => {
        if (view.current !== mine) return;
        setRows((r) => mergePage(r, p.folders));
        setPage(p);
        setReading(null);
      },
      (e: unknown) => {
        if (view.current !== mine) return;
        setWhy(messageOf(e));
        setReading(null);
      },
    );
  };

  const tick = (item: Chosen) => setChosen((c) => toggleChosen(c, item));

  const addSource = (item: Chosen) => {
    const name = placeName(item.path, places.map((p) => p.name));
    setAct({ kind: "working", phase: `adding ${name} as a source`, since: Date.now() });
    objects
      .placeAdd({ name, role: "source", path: item.path, guarantees: { backup: null, snapshots: false, protected: false, fast: false } })
      .then((p) => {
        setChosen((c) => heldBy(c, item.at, { name: p.name, role: "source" }));
        setAct({ kind: "done", words: `${p.name} is a source now, so the folders in it can be digested.` });
        void placesKept.refresh().catch(() => undefined);
        setReload((r) => r + 1);
      })
      .catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
  };

  const queue = async () => {
    const plan = digestPlan(chosen);
    const queued: { name: string; job: number }[] = [];
    setAct({ kind: "working", phase: plan.length === 1 ? "queueing the digest" : `queueing ${plan.length} digests`, since: Date.now() });
    try {
      for (const d of plan) {
        const j = await ops.enqueue(d.command, d.name);
        queued.push({ name: d.name, job: j.job });
      }
    } catch (e: unknown) {
      // what was queued before the refusal leaves the list, so it is not queued twice
      const done = new Set(plan.slice(0, queued.length).map((d) => d.at));
      setChosen((c) => c.filter((x) => !done.has(x.at)));
      setAct({ kind: "failed", why: queued.length > 0 ? `${queuedWords(queued)} Then: ${messageOf(e)}` : messageOf(e) });
      return;
    }
    const words = queuedWords(queued);
    setChosen([]);
    setAct({ kind: "done", words });
    onDone?.(words);
  };

  const chosenAt = new Set(chosen.map((c) => c.at));
  const note = page ? folderNote(page) : null;
  const counts = page ? listWords(page, rows.length, filter) : null;
  const unheld = chosen.filter((c) => !held(c)).length;
  const current: Chosen | null = page && page.exists !== false && page.directory !== false && page.readable !== false ? { at: page.at, path: page.path, place: page.place } : null;

  return (
    <div className="step-form">
      <div className="browser">
        <div className="browser-head">
          <button type="button" className="icon-button" title="Up one folder" aria-label="Up one folder" disabled={at === null} onClick={() => go(at === null ? null : parentAt(at))}>
            <Icon name="arrow-up" />
          </button>
          <nav ref={trailRef} className="crumbs" aria-label="the folders above this one">
            {at === null ? (
              <span className="crumb" aria-current="location">
                locations
              </span>
            ) : (
              <button type="button" className="crumb" title="The ingest locations" onClick={() => go(null)}>
                locations
              </button>
            )}
            {at !== null &&
              crumbsOf(at).map((c, i, all) => (
                <span key={c.at} className="crumb-step">
                  <span className="crumb-sep" aria-hidden="true">
                    <Icon name="chevron-right" />
                  </span>
                  {i === all.length - 1 ? (
                    <span className="crumb" aria-current="location">
                      {c.name}
                    </span>
                  ) : (
                    <button type="button" className="crumb" onClick={() => go(c.at)}>
                      {c.name}
                    </button>
                  )}
                </span>
              ))}
          </nav>
        </div>
        {at !== null && (
          <div className="picker-filter">
            <div className="input">
              <Icon name="search" />
              <input value={typed} placeholder="Filter by name" aria-label="Filter the folders by name" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
            </div>
          </div>
        )}
        {note && <p className={`browser-note ${note.tone}`}>{note.words}</p>}
        {page?.timed_out && (
          <p className="browser-note caution">
            The folder did not answer within 5 seconds, so these are the folders read by then.
            <button type="button" className="button quiet small" onClick={() => setReload((r) => r + 1)}>
              Try again
            </button>
          </p>
        )}
        <div ref={listRef} className="browser-list picker-list">
          {reading && !reading.more && <Wait phase={at === null ? "reading the locations" : "reading the folder"} since={reading.since} />}
          {why && <p className="warn">{why}</p>}
          {at === null && roots !== null && roots.length === 0 && <p className="meta browser-files">The engine was started with no ingest location, so there is nothing here to choose from.</p>}
          {at === null &&
            (roots ?? []).map((r) => {
              const item: Chosen = { at: `@${r.name}`, path: r.path, place: r.place };
              const on = chosenAt.has(item.at);
              return (
                <div key={r.name} className={one ? (picked?.at === item.at ? "picker-row on" : "picker-row") : on ? "picker-row on" : "picker-row"}>
                  {one ? (
                    <input type="radio" name="picked-folder" checked={picked?.at === item.at} onChange={() => onPick?.(item)} aria-label={`Choose ${item.at}`} />
                  ) : (
                    <input type="checkbox" checked={on} disabled={working} onChange={() => tick(item)} aria-label={`Choose ${item.at}`} />
                  )}
                  <button type="button" className="picker-open" onClick={() => go(item.at)}>
                    <Icon name="disk" />
                    <span className="picker-label">
                      <span className="picker-name">{r.name}</span>
                      <span className="picker-what">{rootWords(r)}</span>
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                </div>
              );
            })}
          {at !== null &&
            page &&
            rows.map((f) => {
              const item: Chosen = { at: childAt(at, f.name), path: pathInside(page.path, f.name), place: f.place };
              const found = lookWords(looks[item.at]);
              const on = chosenAt.has(item.at);
              const locked = f.readable === false;
              return (
                <div key={f.name} data-name={f.name} className={one ? (picked?.at === item.at ? "picker-row on" : "picker-row") : on ? "picker-row on" : "picker-row"}>
                  {one ? (
                    <input type="radio" name="picked-folder" checked={picked?.at === item.at} disabled={locked} onChange={() => onPick?.(item)} aria-label={`Choose ${item.at}`} />
                  ) : (
                    <input type="checkbox" checked={on} disabled={working || locked} onChange={() => tick(item)} aria-label={`Choose ${item.at}`} />
                  )}
                  <button type="button" className="picker-open" disabled={locked} onClick={() => go(item.at)}>
                    <Icon name={locked ? "lock" : "folder"} />
                    <span className="picker-label">
                      <span className="picker-name">{f.name}</span>
                      <span className={`picker-what ${found.tone}`}>{locked ? "no access" : found.words}</span>
                    </span>
                    {!locked && <Icon name="chevron-right" />}
                  </button>
                </div>
              );
            })}
          {page?.next && (
            <button type="button" className="button quiet small picker-more" disabled={reading !== null} onClick={more}>
              Show more
            </button>
          )}
          {reading?.more && <Wait phase="reading more folders" since={reading.since} />}
          {counts && <p className="meta browser-files">{counts}</p>}
        </div>
        {current && (
          <div className="browser-foot picker-foot">
            <span className="path browser-path">{current.at}</span>
            {!one && !held(current) && adding === null && (
              <button type="button" className="button quiet small" disabled={working} onClick={() => addSource(current)}>
                Add this folder as a source
              </button>
            )}
            {!one && !held(current) && adding !== null && !chosenAt.has(current.at) && <span className="meta">{adding}</span>}
            <button
              type="button"
              className="button secondary small"
              disabled={working || (one && picked?.at === current.at)}
              onClick={() => (one ? onPick?.(current) : tick(current))}
            >
              {one ? (picked?.at === current.at ? "This folder is chosen" : "Choose this folder") : chosenAt.has(current.at) ? "Leave this folder out" : "Choose this folder"}
            </button>
          </div>
        )}
      </div>
      {stalled && (
        <div className="row picker-stalled">
          <span className="meta">{stalled}</span>
          <button type="button" className="button quiet small" onClick={() => setStalled(null)}>
            Look again
          </button>
        </div>
      )}
      {!one && (
      <div className="field">
        <span className="label">Chosen</span>
        {chosen.length === 0 ? (
          <p className="meta">Nothing yet. Tick folders at any depth; each becomes a digest of its own.</p>
        ) : (
          <ul className="chosen-list">
            {chosen.map((c) => (
              <li key={c.at} className="chosen-item">
                <span className="path chosen-at">{c.at}</span>
                <span className={held(c) ? "meta chosen-note" : "meta chosen-note warn"}>{chosenNote(c, insideOf(chosen, c.at))}</span>
                {!held(c) && adding === null && (
                  <button type="button" className="button secondary small" disabled={working} onClick={() => addSource(c)}>
                    Add as a source
                  </button>
                )}
                <button type="button" className="icon-button" title="Leave it out" aria-label={`Leave out ${c.at}`} disabled={working} onClick={() => tick(c)}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
      {!one && unheld > 0 && (
        <p className="meta">
          {adding === null ? "A digest reads only under a source place: add each folder marked as a source first, or a folder they are inside." : `A digest reads only under a source place, and a folder marked is under none. ${adding}`}
        </p>
      )}
      {(!one || outside) && (
        <div className="row actions">
          {!one && (
            <button type="button" className="button" disabled={chosen.length === 0 || unheld > 0 || working} onClick={() => void queue()}>
              <Icon name="play" />
              {digestWords(chosen.length)}
            </button>
          )}
          {outside}
        </div>
      )}
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "done" && <p className="ok-words">{act.words}</p>}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
    </div>
  );
}
