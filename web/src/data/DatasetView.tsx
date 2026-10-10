// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's browser (Wave 7a, the desk redesign of 2026-10-09,
// the canvas's Browser): the tree and one scan filling the page, for a
// dataset or a cohort's members. The side folds away behind one button; one
// slim bar above says where the scan sits and turns to the grid, and one
// below says what NILS says it is. The tree reads as BIDS folders read,
// subject, session, datatype and scan, quiet but for the chosen scan and an
// orange name where a scan needs a look. Keyboard first: the arrows walk the
// tree and each scan the cursor lands on opens at once (its pictures read
// ahead in the tree's order); with the tree left, up and down turn the
// images and left and right the scans; 3 shows three planes, / filters, n
// switches the names, g turns to the grid at the same place and Esc goes
// back up to it. The scan open is in the address, so back and forward work.
// Under the filter, how many scans it leaves, and keeping them as a
// selection or a cohort (Keep.tsx).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href, narrow } from "../routes";
import { messageOf } from "../settings/common";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { ModeSwitch, NamesSwitch, type Go } from "./Grid";
import { KeepActions } from "./Keep";
import { browserKept } from "./keep";
import { markOpen, ScanViewer } from "./ScanViewer";
import { needsLook, questionWords, type Scan, type ScanPage } from "./scans";
import "./datasetView.css";
import { buildTree, factsOf, filterTree, filterWords, folderOf, matches, pathOf, rowsOf, sessionLabel, treeOrder, type Row } from "./tree";
import {
  goUp,
  heldValue,
  inDialog,
  keep,
  kept,
  KEPT,
  keptText,
  lastScanKey,
  paramsWords,
  scansKey,
  scopeHome,
  scopeList,
  setLastAt,
  sideOpen,
  viewerDoors,
  viewHref,
  visitOfScan,
  visitsKey,
  type Scope,
  type ViewState,
  type VisitsPage,
} from "./viewer";

/** How many scans are read on their own before the rest waits for a press: the tree reads its pages one after the other up to this. */
export const READ_ON_OWN = 5000;

type Names = "nils" | "bids";

const n = (v: number) => v.toLocaleString("en-US");

/** The name a scan is shown by, in the style chosen: BIDS's where it has one, else NILS's. */
export function shownName(s: Scan, names: Names): string {
  return names === "bids" && s.bids ? s.bids : s.name;
}

/** The visits held for a subject under the person's kept choices, where the grid read them. */
function heldVisits(scope: Scope, subject: number, filter: string[]): VisitsPage | null {
  const ask = { name: kept(KEPT.visits, ["date", "number", "days"] as const, "date"), show: keptText(KEPT.show, "code"), filter };
  return heldValue<VisitsPage>(visitsKey(scope, subject, ask));
}

/** The scans to show first, so the scan the address names opens at once: its visit's, else the subject's first visit's. */
async function seedOf(scope: Scope, view: ViewState): Promise<Scan[]> {
  let visit = view.visit;
  if (visit === null && view.subject !== null) {
    const visits = heldVisits(scope, view.subject, view.vfilter) ?? (await viewerDoors.visits(scope, view.subject, { name: "date", show: "code", filter: [] }));
    visit = visits.visits[0]?.key ?? null;
  }
  if (visit === null) return [];
  const held = heldValue<ScanPage>(scansKey(scope, visit));
  return (held ?? (await viewerDoors.visit(scope, visit, false))).scans;
}

export function Browser({ caps, scope, view, go, onSections, grid }: { caps?: Capabilities; scope: Scope; view: ViewState; go: Go; onSections: () => void; grid: boolean }) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [seed, setSeed] = useState<Scan[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [reading, setReading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const [more, setMore] = useState(0);

  // the scans the address names first, then every page in the door's order (subject, day), the tree growing as they come
  useEffect(() => {
    let live = true;
    seedOf(scope, view).then(
      (s) => live && setSeed(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the place the browser opened on
  }, [scope.kind, scope.name]);
  useEffect(() => {
    let live = true;
    setScans([]);
    setTotal(null);
    setFailed(null);
    setReading(true);
    let got = 0;
    const page = (after: number | null) =>
      viewerDoors.tree(scope, after).then(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new scope is what reads again
  }, [scope.kind, scope.name]);

  // a press reads the rest after the first READ_ON_OWN
  useEffect(() => {
    if (more === 0 || next === null) return;
    let live = true;
    setReading(true);
    const page = (after: number) =>
      viewerDoors.tree(scope, after).then(
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

  // the pages in their order, a scan read first but not yet on a page after them; a picture the seed brought is kept
  const all = useMemo(() => {
    if (seed.length === 0) return scans;
    const bySeed = new Map(seed.map((s) => [s.id, s]));
    const paged = new Set(scans.map((s) => s.id));
    const merged = scans.map((s) => {
      const p = bySeed.get(s.id)?.picture;
      return p && !s.picture ? { ...s, picture: p } : s;
    });
    return [...merged, ...seed.filter((s) => !paged.has(s.id))];
  }, [scans, seed]);

  const [names, setNamesState] = useState<Names>(() => kept(KEPT.names, ["nils", "bids"] as const, "nils"));
  const setNames = (v: Names) => {
    setNamesState(v);
    keep(KEPT.names, v);
  };
  const [filter, setFilter] = useState("");
  const words = useMemo(() => filterWords(filter), [filter]);
  const whole = useMemo(() => buildTree(all), [all]);
  const filtering = words.length > 0;
  const tree = useMemo(() => (filtering ? filterTree(whole, (s) => matches(s, words)) : whole), [whole, words, filtering]);
  const order = useMemo(() => treeOrder(tree), [tree]);

  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [chosen, setChosen] = useState<number | null>(view.scan);
  const [cursor, setCursor] = useState<string | null>(view.scan !== null ? `x${view.scan}` : null);

  // the address's scan, as back and forward move it
  useEffect(() => {
    if (view.scan !== null && view.scan !== chosen) {
      setChosen(view.scan);
      setCursor(`x${view.scan}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the address is what moves it
  }, [view.scan]);

  /** The visit of a scan as the address names it. */
  const visitOf = useCallback((s: Scan) => visitOfScan(s, heldVisits(scope, s.subjectId, view.vfilter)?.visits ?? null), [scope, view.vfilter]);

  /** A scan opened: chosen, its branches opened, the cursor on it, and the address following without a step of history. */
  const choose = useCallback(
    (s: Scan, by: "click" | "next" = "click") => {
      markOpen(s.id, by);
      setChosen(s.id);
      setCursor(`x${s.id}`);
      setOpen((was) => {
        const path = pathOf(whole, s.id);
        return path.every((k) => was.has(k)) ? was : new Set([...was, ...path]);
      });
      const visit = visitOf(s);
      if (visit !== null) setLastAt(lastScanKey(scope, visit), String(s.id));
      go({ mode: "browser", scan: s.id, subject: s.subjectId, visit }, true);
    },
    [whole, go, visitOf, scope],
  );

  // the scan the address names opens as soon as it is read, its branches open; else the first of its visit or subject, else the first
  useEffect(() => {
    if (order.length === 0) return;
    if (chosen !== null && order.some((s) => s.id === chosen)) {
      setOpen((was) => {
        const path = pathOf(whole, chosen);
        return path.every((k) => was.has(k)) ? was : new Set([...was, ...path]);
      });
      return;
    }
    // the named scan may still be on its way
    if (chosen !== null && reading && !filtering) return;
    const pick =
      (view.visit !== null ? order.find((s) => visitOf(s) === view.visit) : undefined) ??
      (view.subject !== null ? order.find((s) => s.subjectId === view.subject) : undefined) ??
      (reading && (view.visit !== null || view.subject !== null) && !filtering ? undefined : order[0]);
    if (pick) choose(pick, chosen === null ? "click" : "next");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what is read decides
  }, [order, chosen, reading]);

  const rows = useMemo(() => rowsOf(tree, open, filtering), [tree, open, filtering]);
  const at = chosen === null ? -1 : order.findIndex((s) => s.id === chosen);
  const scan = at >= 0 ? order[at] : null;
  const shown = useMemo(() => order.map((s) => (names === "bids" && s.bids ? { ...s, name: s.bids } : s)), [order, names]);

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
  // the chosen row kept in view as the scans turn
  useLayoutEffect(() => {
    if (chosen === null) return;
    treeBox.current?.querySelector<HTMLElement>(`[data-key="x${chosen}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [chosen, rows]);

  /** The grid at the place of the scan shown: its visit, the cursor on it. */
  const gridHere = () => viewHref(scope, { ...view, mode: "grid", subject: scan?.subjectId ?? view.subject, visit: scan ? visitOf(scan) : view.visit, scan: scan?.id ?? null });
  const toGrid = () => {
    if (grid) location.hash = gridHere();
  };
  const back = () => {
    // an open side takes its own Esc
    if (sideOpen()) return;
    if (grid) goUp(gridHere());
    else location.hash = scopeHome(scope);
  };

  // the page's own keys, wherever the focus is but a field: / filters, n the names, g the grid, Esc back
  const filterBox = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inDialog(e.target)) return;
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
      } else if (e.key === "g" && grid) {
        e.preventDefault();
        toGrid();
      } else if (e.key === "Escape" && scan === null) {
        back();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // the viewer's next and previous walk the tree's order, the cursor following
  const onAt = useCallback((i: number) => order[i] && choose(order[i], "next"), [order, choose]);

  const facts = scan ? factsOf(scan).filter((f) => f.what !== "Images") : [];
  const timing = scan ? [paramsWords(scan), scan.images !== null ? `${n(scan.images)} ${scan.images === 1 ? "image" : "images"}` : ""].filter(Boolean).join(" · ") : "";
  const list0 = scopeList(scope);
  const looks = scan ? needsLook(scan) : false;

  return (
    <div className="dview" aria-label={scope.name}>
      <header className="dview-top">
        <button type="button" className="dview-sections" aria-label="Show the sections" onClick={onSections}>
          <Icon name="menu" />
        </button>
        <nav className="dview-where" aria-label="Where">
          <a href={list0.href}>{list0.label}</a>
          <span className="sep">/</span>
          <a href={grid ? viewHref(scope, { mode: "grid", filter: view.filter }) : scopeHome(scope)}>{scope.name}</a>
          {scan && (
            <>
              <span className="sep">/</span>
              <span className="dview-path">{`sub-${scan.subject} / ${sessionLabel(scan)} / ${folderOf(scan)} /`}</span>
              <b title={(names === "bids" ? scan.name : scan.bids) ?? undefined}>{shownName(scan, names)}</b>
            </>
          )}
        </nav>
        {grid && <ModeSwitch mode="browser" onMode={(m) => m === "grid" && toGrid()} />}
        <NamesSwitch names={names} onNames={setNames} />
      </header>
      <div className="dview-body">
        <aside className="dview-side" aria-label="Tree">
          <label className="dview-filter">
            <span className="sr-only">Filter the scans</span>
            <input ref={filterBox} type="search" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <span className="vw-key" aria-hidden="true">
              /
            </span>
          </label>
          {caps && total !== null && total > 0 && (
            <div className="dview-keep">
              <span className="meta num" aria-label={`${filtering ? `${n(order.length)} of ${n(all.length)}` : n(total)} scans`}>
                {filtering ? `${n(order.length)} of ${n(all.length)}` : n(total)}
              </span>
              <KeepActions caps={caps} ready={!failed && order.length > 0} kept={() => browserKept(scope, words, order, { read: all.length, total })} />
            </div>
          )}
          {failed && <p className="warn">The scans could not be read: {failed}</p>}
          {all.length === 0 && reading && <Wait phase="reading the scans" since={since} size="panel" />}
          {!reading && all.length === 0 && !failed && <p className="meta dview-none">No scans yet</p>}
          <div ref={treeBox} className="dview-tree" role="tree" aria-label={`the scans of ${scope.name}`} onKeyDown={onTreeKey}>
            {rows.map((r) =>
              r.kind === "family" ? (
                <div key={r.key} className="dview-family">
                  {r.label}
                </div>
              ) : (
                <TreeRow
                  key={r.key}
                  row={r}
                  names={names}
                  cursor={cursor === r.key}
                  chosen={r.kind === "scan" && r.scan.id === chosen}
                  onClick={() => {
                    setCursor(r.key);
                    if (r.kind === "scan") choose(r.scan);
                    else if (!filtering) toggle(r.key);
                  }}
                />
              ),
            )}
            {filtering && rows.length === 0 && all.length > 0 && <p className="meta dview-none">Nothing matches</p>}
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
                {facts.map((f) => (
                  <span key={f.what} className="dview-fact" title={f.what}>
                    {f.value}
                  </span>
                ))}
                {timing !== "" && <span className="dview-timing">{timing}</span>}
                {looks && scope.kind === "dataset" && (
                  <a className="dview-fact look" href={narrow(href("review"), { dataset: scope.name })} title={`Needs a look: ${questionWords(scan)}`}>
                    needs a look
                  </a>
                )}
                {looks && scope.kind === "cohort" && (
                  <a className="dview-fact look" href={narrow(href("review"), { cohort: scope.name })} title={`Needs a look: ${questionWords(scan)}`}>
                    needs a look
                  </a>
                )}
                <span className="grow" />
                <span className="dview-keys" aria-hidden="true">
                  ↑↓ images · ←→ scans · 3 three planes{grid ? " · g grid" : ""} · Esc back
                </span>
              </footer>
            </>
          ) : (
            !reading && all.length > 0 && <p className="meta dview-none">No scan chosen</p>
          )}
        </main>
      </div>
    </div>
  );
}

function TreeRow({ row: r, names, cursor, chosen, onClick }: { row: Exclude<Row, { kind: "family" }>; names: Names; cursor: boolean; chosen: boolean; onClick: () => void }) {
  if (r.kind === "scan") {
    const look = needsLook(r.scan);
    return (
      <div
        role="treeitem"
        aria-level={r.depth + 1}
        aria-selected={chosen}
        tabIndex={cursor ? 0 : -1}
        data-key={r.key}
        data-depth={r.depth}
        className={`dview-row scan${chosen ? " on" : ""}${look ? " look" : ""}`}
        title={[r.scan.description, look ? `needs a look: ${questionWords(r.scan)}` : ""].filter(Boolean).join(" · ") || undefined}
        onClick={onClick}
      >
        <span className="dview-name">{shownName(r.scan, names)}</span>
      </div>
    );
  }
  return (
    <div role="treeitem" aria-level={r.depth + 1} aria-expanded={r.open} aria-selected={false} tabIndex={cursor ? 0 : -1} data-key={r.key} data-depth={r.depth} className={`dview-row ${r.kind}`} onClick={onClick}>
      <span className="dview-name grow">
        {r.label}
        {r.kind === "type" && !r.open && <span className="dview-folded"> · {n(r.count)}</span>}
      </span>
      {r.kind !== "type" && r.look > 0 && (
        <span className="dview-n look num" title={`${r.look} need a look`}>
          {n(r.look)}
        </span>
      )}
      {r.kind !== "type" && <span className="dview-n num">{n(r.count)}</span>}
    </div>
  );
}
