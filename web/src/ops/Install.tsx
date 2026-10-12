// SPDX-License-Identifier: AGPL-3.0-only
// Install a missing tool from where its absence is said (2026-10-12): beside a
// failed run's reason, a refused pre-flight's and on Settings, Parts, an
// admin presses Install dcm2niix where the failure's `fix` names the engine's
// install; the engine fetches its pinned build, and the version is said with
// the run's Run again. Anyone else reads a sentence asking an admin. An
// install that fails (offline, say) shows the engine's reason whole, which
// says the way by hand. Nothing shows where the engine offers no fix.

import { useEffect, useState, useSyncExternalStore } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { mayAny } from "../grants";
import { refusalOf, type Failure, type Fix } from "./failure";
import { fixOfTool, foundByWords, mayInstall, mayListTools, tools, toolsInCaps, toolStatus, type ToolEntry } from "./tools";

/** The tools installed from this page since it loaded: every place that offered Install then says the tool is there. */
const installedNow = new Map<string, ToolEntry>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function noteInstalled(t: ToolEntry) {
  installedNow.set(t.name, t);
  for (const l of listeners) l();
}

/** For the tests: a page loaded afresh, nothing installed from it. */
export function forgetInstalled() {
  installedNow.clear();
}

type State = { kind: "idle" } | { kind: "busy" } | { kind: "failed"; f: Failure };
type Again = { kind: "idle" | "busy" | "done"; said: string | null };

/**
 * The install, as two pieces a page places: the button, beside the reason,
 * and what it said, under it. Once the tool is there (installed from here, or
 * present as the capabilities say) the line says its version, with Run again
 * where `again` is given: it takes the run up again and says what it queued.
 * `onInstalled` lets a page read again; `quiet` draws the button as a
 * secondary one, for a table of several.
 */
export function useInstall(caps: Capabilities, fix: Fix | null, again: (() => Promise<string>) | null = null, onInstalled: ((t: ToolEntry) => void) | null = null, quiet = false): { button: React.ReactNode; said: React.ReactNode } {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [rerun, setRerun] = useState<Again>({ kind: "idle", said: null });
  const snapshot = () => (fix === null ? null : (installedNow.get(fix.tool) ?? null));
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (fix === null || !served(caps, fix.door)) return { button: null, said: null };
  const present = toolStatus(caps, fix.tool);
  const there = now ?? (present?.present ? present : null);
  if (there) {
    const runAgain = () => {
      if (again === null) return;
      setRerun({ kind: "busy", said: null });
      again().then(
        (said) => setRerun({ kind: "done", said }),
        (e: unknown) => setRerun({ kind: "idle", said: refusalOf(e).line }),
      );
    };
    return {
      button: null,
      said: (
        <div className="tool-said">
          <span>
            {fix.tool} {there.version && <span className="path">{there.version}</span>} is installed{there.path ? <span className="meta"> at {there.path}</span> : null}.
          </span>
          {again && rerun.kind !== "done" && (
            <button type="button" className="button small" disabled={rerun.kind === "busy"} onClick={runAgain}>
              Run again
            </button>
          )}
          {rerun.said && <span className="meta">{rerun.said}</span>}
        </div>
      ),
    };
  }
  if (!mayInstall(caps, fix)) return { button: null, said: <p className="meta tool-said">Ask an admin to install {fix.tool}.</p> };
  const go = () => {
    setState({ kind: "busy" });
    tools.install(fix).then(
      (a) => {
        const t = a.tool ?? { ...(present ?? { name: fix.tool, path: null, found_by: null, version: null, pinned: null, current: null, problem: null, install: null }), present: true };
        setState({ kind: "idle" });
        noteInstalled(t);
        onInstalled?.(t);
      },
      (e: unknown) => setState({ kind: "failed", f: refusalOf(e) }),
    );
  };
  const busy = state.kind === "busy";
  return {
    button: (
      <button type="button" className={quiet || state.kind === "failed" ? "button secondary small" : "button small"} disabled={busy} onClick={go}>
        {busy ? `Installing ${fix.tool}…` : state.kind === "failed" ? "Try again" : `Install ${fix.tool}`}
      </button>
    ),
    said:
      state.kind === "failed" ? (
        <div className="tool-said">
          {/* the engine's reason whole: offline, it says the way by hand (the archive, its sha256 and where the binary goes) */}
          <span className="warn">
            {fix.tool} was not installed: {state.f.error}
          </span>
          {fix.command && (
            <span className="meta">
              At the command line: <code>{fix.command}</code>
            </span>
          )}
        </div>
      ) : null,
  };
}

/** The install for a failure whose fix the engine offers: the button, and under it what it said; nothing for any other failure. */
export function InstallFor({ caps, f, again = null, onInstalled = null }: { caps: Capabilities; f: Failure; again?: (() => Promise<string>) | null; onInstalled?: ((t: ToolEntry) => void) | null }) {
  const { button, said } = useInstall(caps, f.fix, again, onInstalled);
  return (
    <>
      {button && <div className="tool-act">{button}</div>}
      {said}
    </>
  );
}

/** The tools the engine runs beside itself, on Settings, Parts: each with its version and where it is, or missing with Install for an admin. */
export function ToolsSection({ caps, onChanged }: { caps: Capabilities; onChanged: () => void }) {
  const lists = mayListTools(caps);
  const [listed, setListed] = useState<ToolEntry[] | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!lists) return;
    let alive = true;
    tools.list().then(
      (l) => alive && setListed(l),
      () => alive && setListed(null),
    );
    return () => {
      alive = false;
    };
  }, [lists, asked]);
  const shown = listed ?? (mayAny(caps, "install:see", "pipelines:see") ? toolsInCaps(caps) : []);
  if (shown.length === 0) return null;
  return (
    <section className="stack">
      <div className="section-head rule-top">
        <h2>Tools</h2>
        <span className="meta">what a run needs beside its image</span>
      </div>
      <div className="table-wrap">
        <table className="thin tools">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Version</th>
              <th>Where</th>
              <th className="acts" />
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <ToolRow
                key={t.name}
                caps={caps}
                tool={t}
                onInstalled={() => {
                  setAsked((k) => k + 1);
                  onChanged();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ToolRow({ caps, tool, onInstalled }: { caps: Capabilities; tool: ToolEntry; onInstalled: () => void }) {
  const [now, setNow] = useState<ToolEntry | null>(null);
  const t = now ?? tool;
  const offered = !t.present && t.install?.available ? fixOfTool(t) : null;
  const { button, said } = useInstall(caps, offered, null, (n) => {
    setNow(n);
    onInstalled();
  });
  // under the row: why one found does not run, why no build is offered here, or what the install said
  const under = t.present ? null : t.problem ? (
    <div className="tool-said">
      <span className="warn">{t.problem}</span>
    </div>
  ) : t.install && !t.install.available ? (
    <div className="tool-said">
      <span className="meta">{t.install.why}</span>
    </div>
  ) : (
    said
  );
  return (
    <>
      <tr className={under ? "has-fail" : undefined}>
        <td>
          <b>{t.name}</b>
        </td>
        <td>
          {t.present && t.version ? <span className="path">{t.version}</span> : <span className="tag caution">missing</span>}
          {t.pinned && t.current === false && <div className="meta">this engine pins {t.pinned}</div>}
        </td>
        <td>
          {t.path && <span className="path">{t.path}</span>}
          {t.path && t.found_by && <div className="meta">{foundByWords(t.found_by)}</div>}
        </td>
        <td className="acts">{button}</td>
      </tr>
      {under && (
        <tr className="fail-row">
          <td colSpan={4}>{under}</td>
        </tr>
      )}
    </>
  );
}
