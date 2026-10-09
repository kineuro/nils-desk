// SPDX-License-Identifier: AGPL-3.0-only
// One dataset, the whole page (Wave 7a, the try of 2026-10-09: "when you
// click on a card i expect to viewer be the full page"). The scan is the
// hero: it fills the page, and the chrome around it is one line above (the
// way back and where the scan sits, as a BIDS path) and one line below (what
// NILS says it is). On the left a quiet tree, subject, session, datatype and
// scan, read as BIDS folders read: no boxes, no colour but the chosen scan's
// frame and an orange name where a scan needs a look. Keyboard first: the
// arrows walk the tree and every scan the cursor lands on opens at once
// (its pictures read ahead in the tree's order); with the tree left, up and
// down turn the planes and left and right turn the scans; / filters, n
// switches the names, 3 shows three planes, Esc goes back to Data.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href, narrow } from "../routes";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { maySeePicks, pickLineWords, picksSummary, type PickLine } from "./picks";
import { markOpen, ScanViewer } from "./ScanViewer";
import { mayListScans, questionWords, scanDoors, type Scan } from "./scans";
import "./datasetView.css";
import { buildTree, factsOf, FAMILY_SLOT, filterTree, filterWords, folderOf, matches, pathOf, rowsOf, sessionLabel, treeOrder, type Row } from "./tree";

/** How many scans are read on their own before the rest waits for a press: the tree reads its pages one after the other up to this. */
export const READ_ON_OWN = 5000;

type Names = "nils" | "bids";

const n = (v: number) => v.toLocaleString("en-US");

/** The name a scan is shown by, in the style chosen: BIDS's where it has one, else NILS's. */
export function shownName(s: Scan, names: Names): string {
  return names === "bids" && s.bids ? s.bids : s.name;
}

const KEPT_NAMES = "nils.dataset-view.names";
function keptNames(): Names {
  try {
    return localStorage.getItem(KEPT_NAMES) === "bids" ? "bids" : "nils";
  } catch {
    return "nils";
  }
}

/** Back to Data, the dataset's card chosen. */
function back(): void {
  location.hash = href("data", "datasets");
}

export function DatasetView({ caps, name }: { caps: Capabilities; name: string }) {
  return mayListScans(caps) ? <View caps={caps} name={name} /> : null;
}

function View({ caps, name }: { caps: Capabilities; name: string }) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [reading, setReading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const [more, setMore] = useState(0);

  // the scans, page after page in the door's order (subject, day), the tree growing as they come
  useEffect(() => {
    let live = true;
    setScans([]);
    setTotal(null);
    setFailed(null);
    setReading(true);
    let got = 0;
    const page = (after: number | null) =>
      scanDoors.tree(name, after).then(
        (p) => {
          if (!live) return;
          got += p.scans.length;
          setScans((was) => (after === null ? p.scans : [...was, ...p.scans]));
          setTotal(p.total);
          setNext(p.next);
          if (p.next !== null && got < READ_ON_OWN) void page(p.next);
          else setReading(false);
        },
        (e: unknown) => {
          if (!live) return;
          setFailed(messageOf(e));
          setReading(false);
        },
      );
    void page(null);
    return () => {
      live = false;
    };
  }, [name]);

  // a press reads the rest after the first READ_ON_OWN
  useEffect(() => {
    if (more === 0 || next === null) return;
    let live = true;
    setReading(true);
    const page = (after: number) =>
      scanDoors.tree(name, after).then(
        (p) => {
          if (!live) return;
          setScans((was) => [...was, ...p.scans]);
          setNext(p.next);
          if (p.next !== null) void page(p.next);
          else setReading(false);
        },
        (e: unknown) => {
          if (live) {
            setFailed(messageOf(e));
            setReading(false);
          }
        },
      );
    void page(next);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a press is what reads on
  }, [more]);

  // an empty dataset has nothing to show here: back to its card
  useEffect(() => {
    if (total === 0 && !failed) location.replace(href("data", "datasets"));
  }, [total, failed, name]);

  const [names, setNamesState] = useState<Names>(keptNames);
  const setNames = (v: Names) => {
    setNamesState(v);
    try {
      localStorage.setItem(KEPT_NAMES, v);
    } catch {
      // the choice holds for this visit
    }
  };
  const [filter, setFilter] = useState("");
  const [lookOnly, setLookOnly] = useState(false);
  const words = useMemo(() => filterWords(filter), [filter]);
  const whole = useMemo(() => buildTree(scans), [scans]);
  const filtering = words.length > 0 || lookOnly;
  const tree = useMemo(() => (filtering ? filterTree(whole, (s) => matches(s, words) && (!lookOnly || s.questions.length > 0)) : whole), [whole, words, lookOnly, filtering]);
  const order = useMemo(() => treeOrder(tree), [tree]);
  const looks = useMemo(() => scans.filter((s) => s.questions.length > 0).length, [scans]);

  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [chosen, setChosen] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  // the first scan opens as soon as it is read, its branches open
  useEffect(() => {
    if (chosen !== null || order.length === 0) return;
    const first = order[0];
    setChosen(first.id);
    setCursor(`x${first.id}`);
    markOpen(first.id);
    setOpen((was) => new Set([...was, ...pathOf(whole, first.id)]));
  }, [order, chosen, whole]);

  const rows = useMemo(() => rowsOf(tree, open, filtering), [tree, open, filtering]);
  const at = chosen === null ? -1 : order.findIndex((s) => s.id === chosen);
  const scan = at >= 0 ? order[at] : null;
  const shown = useMemo(() => order.map((s) => (names === "bids" && s.bids ? { ...s, name: s.bids } : s)), [order, names]);

  /** A scan opened: chosen, its branches opened, the cursor on it. */
  const choose = useCallback(
    (s: Scan, by: "click" | "next" = "click") => {
      markOpen(s.id, by);
      setChosen(s.id);
      setCursor(`x${s.id}`);
      setOpen((was) => {
        const path = pathOf(whole, s.id);
        return path.every((k) => was.has(k)) ? was : new Set([...was, ...path]);
      });
    },
    [whole],
  );

  // a filter that leaves the open scan out opens its first match
  useEffect(() => {
    if (chosen === null || order.length === 0 || order.some((s) => s.id === chosen)) return;
    choose(order[0], "next");
  }, [order, chosen, choose]);

  // the tree's keys: the arrows walk the rows and open what they land on
  const treeBox = useRef<HTMLDivElement | null>(null);
  const focusRow = useRef(false);
  const toggle = (key: string) =>
    setOpen((was) => {
      const s = new Set(was);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  const walk = (r: Row) => {
    setCursor(r.key);
    if (r.kind === "scan") choose(r.scan, "next");
  };
  const navigable = rows.filter((r) => r.kind !== "family");
  const onTreeKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const i = navigable.findIndex((r) => r.key === cursor);
    const r = i >= 0 ? navigable[i] : null;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
      focusRow.current = true;
    };
    switch (e.key) {
      case "ArrowDown":
        handled();
        if (i < navigable.length - 1) walk(navigable[i + 1]);
        return;
      case "ArrowUp":
        handled();
        if (i > 0) walk(navigable[i - 1]);
        return;
      case "Home":
        handled();
        if (navigable.length > 0) walk(navigable[0]);
        return;
      case "End":
        handled();
        if (navigable.length > 0) walk(navigable[navigable.length - 1]);
        return;
      case "ArrowRight":
        handled();
        if (!r) return;
        if (r.kind !== "scan" && !r.open && !filtering) toggle(r.key);
        else if (r.kind !== "scan" && i < navigable.length - 1) walk(navigable[i + 1]);
        return;
      case "ArrowLeft":
        handled();
        if (!r) return;
        if (r.kind !== "scan" && r.open && !filtering) toggle(r.key);
        else if (r.parent) setCursor(r.parent);
        return;
      case "Enter":
      case " ":
        handled();
        if (!r) return;
        if (r.kind === "scan") choose(r.scan);
        else if (!filtering) toggle(r.key);
        return;
    }
  };
  useLayoutEffect(() => {
    if (!focusRow.current) return;
    focusRow.current = false;
    treeBox.current?.querySelector<HTMLElement>(`[data-key="${cursor}"]`)?.focus();
  }, [cursor, rows]);

  // the page's own keys, wherever the focus is but a field: / filters, n the names, Esc back
  const filterBox = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const field = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (field) {
        if (e.key === "Escape" && t === filterBox.current) {
          e.preventDefault();
          if (filter !== "") setFilter("");
          else filterBox.current?.blur();
        }
        if (e.key === "Enter" && t === filterBox.current) {
          e.preventDefault();
          treeBox.current?.querySelector<HTMLElement>(`[data-key="${cursor}"]`)?.focus();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        filterBox.current?.focus();
      } else if (e.key === "n") {
        setNames(names === "bids" ? "nils" : "bids");
      } else if (e.key === "Escape" && scan === null) {
        back();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handler reads the state it names
  }, [filter, names, scan, cursor]);

  // the viewer's next and previous walk the tree's order, the cursor following
  const onAt = useCallback((i: number) => order[i] && choose(order[i], "next"), [order, choose]);

  const facts = scan ? factsOf(scan) : [];
  const where = scan ? [`sub-${scan.subject}`, sessionLabel(scan), folderOf(scan)] : [];
  const other = scan ? (names === "bids" ? scan.name : scan.bids) : null;

  return (
    <div className="dview" role="dialog" aria-modal="true" aria-label={name}>
      <header className="dview-top">
        <a className="dview-back" href={href("data", "datasets")} title="Back to Data (Esc)">
          <Icon name="chevron-left" />
          <span>{name}</span>
        </a>
        <nav className="dview-where grow" aria-label="where the scan sits">
          {where.map((w) => (
            <span key={w}>{w}</span>
          ))}
          {scan && (
            <b title={other ?? undefined}>{shownName(scan, names)}</b>
          )}
        </nav>
        <span className="dview-count meta num">
          {total !== null && `${n(total)} scans`}
          {looks > 0 && (
            <button type="button" className={lookOnly ? "dview-looks on" : "dview-looks"} aria-pressed={lookOnly} title="Show only the scans that need a look" onClick={() => setLookOnly((x) => !x)}>
              {n(looks)} need a look
            </button>
          )}
        </span>
        <div className="seg dview-names" role="group" aria-label="Names (n)">
          <button type="button" className={names === "nils" ? "on" : undefined} aria-pressed={names === "nils"} onClick={() => setNames("nils")}>
            Name
          </button>
          <button type="button" className={names === "bids" ? "on" : undefined} aria-pressed={names === "bids"} onClick={() => setNames("bids")}>
            BIDS
          </button>
        </div>
      </header>
      <div className="dview-body">
        <aside className="dview-side">
          <input
            ref={filterBox}
            className="dview-filter"
            type="search"
            placeholder="Filter  /"
            aria-label="Filter the scans"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {maySeePicks(caps) && <PickLines dataset={name} />}
          {failed && <p className="warn">The scans could not be read: {failed}</p>}
          {scans.length === 0 && reading && <Wait phase="reading the scans" since={since} size="panel" />}
          <div ref={treeBox} className="dview-tree" role="tree" aria-label={`the scans of ${name}`} onKeyDown={onTreeKey}>
            {rows.map((r) => (r.kind === "family" ? <div key={r.key} className="dview-family" style={{ paddingLeft: `${r.depth * 0.9 + 0.5}rem` }}>{r.label}</div> : <TreeRow key={r.key} row={r} names={names} cursor={cursor === r.key} chosen={r.kind === "scan" && r.scan.id === chosen} onClick={() => {
              setCursor(r.key);
              if (r.kind === "scan") choose(r.scan);
              else if (!filtering) toggle(r.key);
            }} />))}
            {filtering && rows.length === 0 && scans.length > 0 && <p className="meta dview-none">Nothing matches</p>}
          </div>
          {total !== null && scans.length < total && (
            <div className="dview-more meta">
              {n(scans.length)} of {n(total)} read
              {!reading && next !== null && (
                <button type="button" className="link-button" onClick={() => setMore((x) => x + 1)}>
                  Read the rest
                </button>
              )}
            </div>
          )}
        </aside>
        <main className="dview-main">
          {scan ? (
            <>
              <div className="dview-stage">
                <ScanViewer bare scans={shown} at={at} onAt={onAt} onClose={back} />
              </div>
              <footer className="dview-facts">
                <span className="dview-values">
                  {facts.map((f) => (
                    <span key={f.what} title={f.what}>
                      {f.value}
                    </span>
                  ))}
                </span>
                {scan.description && (
                  <span className="dview-scanner meta" title="What the scanner called it">
                    {scan.description}
                  </span>
                )}
                {scan.questions.length > 0 && (
                  <span className="dview-ask">
                    <span title={questionWords(scan)}>Needs a look: {questionWords(scan)}</span>
                    <a className="button small" href={narrow(href("review"), { dataset: name })}>
                      Review
                    </a>
                  </span>
                )}
                <span className="dview-keys meta grow" aria-hidden="true">
                  ↑↓ planes · ←→ scans · 3 planes · / filter · n names · Esc back
                </span>
              </footer>
            </>
          ) : (
            !reading && scans.length > 0 && <p className="meta dview-none">No scan chosen</p>
          )}
        </main>
      </div>
    </div>
  );
}

function TreeRow({ row: r, names, cursor, chosen, onClick }: { row: Exclude<Row, { kind: "family" }>; names: Names; cursor: boolean; chosen: boolean; onClick: () => void }) {
  const pad = { paddingLeft: `${r.depth * 0.9 + 0.5}rem` };
  if (r.kind === "scan") {
    const look = r.scan.questions.length > 0;
    const slot = FAMILY_SLOT[r.family];
    return (
      <div
        role="treeitem"
        aria-level={r.depth + 1}
        aria-selected={chosen}
        tabIndex={cursor ? 0 : -1}
        data-key={r.key}
        data-slot={chosen && slot !== null ? slot : undefined}
        className={`dview-row scan${chosen ? " on" : ""}${look ? " look" : ""}`}
        style={pad}
        title={[r.scan.description, look ? `needs a look: ${questionWords(r.scan)}` : ""].filter(Boolean).join(" · ") || undefined}
        onClick={onClick}
      >
        <span className="dview-name">{shownName(r.scan, names)}</span>
      </div>
    );
  }
  return (
    <div role="treeitem" aria-level={r.depth + 1} aria-expanded={r.open} aria-selected={false} tabIndex={cursor ? 0 : -1} data-key={r.key} className={`dview-row ${r.kind}`} style={pad} onClick={onClick}>
      <span className="dview-fold" aria-hidden="true">
        <Icon name={r.open ? "chevron-down" : "chevron-right"} />
      </span>
      <span className="dview-name grow">{r.label}</span>
      {r.look > 0 && <span className="dview-n look num" title={`${r.look} need a look`}>{n(r.look)}</span>}
      <span className="dview-n num">{n(r.count)}</span>
    </div>
  );
}

/** What picking main scans found here, a line a role, where the pick run left a summary. */
function PickLines({ dataset }: { dataset: string }) {
  const [lines, setLines] = useState<PickLine[]>([]);
  useEffect(() => {
    setLines([]);
    let live = true;
    picksSummary.read(dataset).then(
      (l) => live && setLines(l),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [dataset]);
  if (lines.length === 0) return null;
  return (
    <div className="pick-lines dview-picks">
      {lines.map((l) => (
        <div key={l.role} className="row pick-line">
          <span>{pickLineWords(l)}</span>
          {l.review > 0 && (
            <a className="link-button" href={narrow(href("review", "picks"), { dataset })}>
              Review {n(l.review)}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
