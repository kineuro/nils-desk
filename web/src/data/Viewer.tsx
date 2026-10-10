// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer (Wave 7a, the desk redesign of 2026-10-09): a dataset,
// or a cohort over its members from any dataset, as a grid or as a browser,
// switched by Grid | Browser on every level or by g. The address keeps the
// view and the place in it, #data/datasets/NAME/view?mode=grid&subject=12
// &visit=s34, so back and forward work and a place can be passed on. The
// subjects' search is held in memory instead (searchOf), since what a person
// types there can be an identifier. Opened from a dataset's or a cohort's
// View.

import { useSyncExternalStore } from "react";
import type { Capabilities } from "../capabilities";
import { Browser } from "./DatasetView";
import { Grid } from "./Grid";
import { mayBrowse, mayGrid, onSearch, parseView, searchOf, setSearch, viewHref, type Scope, type ViewState } from "./viewer";

/** A scope's search as held in memory, read again whenever it changes. */
export function useSearch(scope: Scope): string {
  return useSyncExternalStore(onSearch, () => searchOf(scope));
}

export function Viewer({ caps, scope, query, onSections }: { caps: Capabilities; scope: Scope; query?: Record<string, string>; onSections: () => void }) {
  const q = useSearch(scope);
  const view: ViewState = { ...parseView(query), q };
  const grid = mayGrid(caps, scope);
  if (!mayBrowse(caps, scope)) {
    return (
      <section className="state">
        <h1>Nothing to view here</h1>
        <p className="meta">Viewing needs Data reading, and an engine that lists a {scope.kind}'s scans.</p>
      </section>
    );
  }
  /** The view moved: a new step of history, or the same step changed (a scan turned, a filter set). */
  const go = (v: Partial<ViewState>, replace = false) => {
    if (v.q !== undefined) setSearch(scope, v.q);
    const to = viewHref(scope, { ...view, ...v });
    if (to === location.hash) return;
    if (replace) location.replace(to);
    else location.hash = to;
  };
  if (!grid || view.mode === "browser") return <Browser caps={caps} scope={scope} view={view} go={go} onSections={onSections} grid={grid} />;
  return <Grid caps={caps} scope={scope} view={view} go={go} />;
}

/** Whether the address shows the browser, where the side folds away. */
export function browsing(caps: Capabilities, scope: Scope, query?: Record<string, string>): boolean {
  return mayBrowse(caps, scope) && (parseView(query).mode === "browser" || !mayGrid(caps, scope));
}
