// SPDX-License-Identifier: AGPL-3.0-only
// Install a missing tool from where its absence is said (2026-10-12): beside a
// failed run's reason, a refused pre-flight's and on Settings, Parts, an
// admin presses Install dcm2niix; the engine installs its pinned build, and
// the version is said with the run's Run again. Anyone else reads a sentence
// asking an admin. An install that fails (offline, say) shows the engine's
// reason and the way by hand. Nothing shows where the engine has no door.

import { useState, useSyncExternalStore } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { firstSentence, INSTALLABLE, refusalOf, type Failure } from "./failure";
import { installServed, mayInstall, tools, toolStatus, type ToolStatus } from "./tools";

/** The tools installed from this page since it loaded: every place that offered Install then says the tool is there. */
const installedNow = new Map<string, ToolStatus>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function noteInstalled(s: ToolStatus) {
  installedNow.set(s.tool, s);
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
export function useInstall(caps: Capabilities, tool: string | null, again: (() => Promise<string>) | null = null, onInstalled: ((s: ToolStatus) => void) | null = null, quiet = false): { button: React.ReactNode; said: React.ReactNode } {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [rerun, setRerun] = useState<Again>({ kind: "idle", said: null });
  const snapshot = () => (tool === null ? null : (installedNow.get(tool) ?? null));
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (tool === null || !installServed(caps, tool)) return { button: null, said: null };
  const present = toolStatus(caps, tool);
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
            {tool} {there.version && <span className="path">{there.version}</span>} is installed{there.path ? <span className="meta"> at {there.path}</span> : null}.
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
  if (!mayInstall(caps, tool)) return { button: null, said: <p className="meta tool-said">Ask an admin to install {tool}.</p> };
  const go = () => {
    setState({ kind: "busy" });
    tools.install(tool).then(
      (s) => {
        setState({ kind: "idle" });
        noteInstalled(s);
        onInstalled?.(s);
      },
      (e: unknown) => setState({ kind: "failed", f: refusalOf(e) }),
    );
  };
  const busy = state.kind === "busy";
  return {
    button: (
      <button type="button" className={quiet || state.kind === "failed" ? "button secondary small" : "button small"} disabled={busy} onClick={go}>
        {busy ? `Installing ${tool}…` : state.kind === "failed" ? "Try again" : `Install ${tool}`}
      </button>
    ),
    said:
      state.kind === "failed" ? (
        <div className="tool-said">
          <span className="warn" title={state.f.error}>
            {tool} was not installed: {firstSentence(state.f.error)}
          </span>
          <span className="meta">{state.f.todo ?? INSTALLABLE[tool]?.manual ?? ""}</span>
        </div>
      ) : null,
  };
}

/** The install for a failure about a tool the engine installs: the button, and under it what it said; nothing for any other failure. */
export function InstallFor({ caps, f, again = null, onInstalled = null }: { caps: Capabilities; f: Failure; again?: (() => Promise<string>) | null; onInstalled?: ((s: ToolStatus) => void) | null }) {
  const { button, said } = useInstall(caps, f.tool, again, onInstalled);
  return (
    <>
      {button && <div className="tool-act">{button}</div>}
      {said}
    </>
  );
}

/** The tools the engine installs, on Settings, Parts: each with its version and where it is, or Install for an admin where it is missing. */
export function ToolsSection({ caps, onChanged }: { caps: Capabilities; onChanged: () => void }) {
  const shown = Object.keys(INSTALLABLE).filter((t) => toolStatus(caps, t) !== null || installServed(caps, t));
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
              <ToolRow key={t} caps={caps} tool={t} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ToolRow({ caps, tool, onChanged }: { caps: Capabilities; tool: string; onChanged: () => void }) {
  const [installed, setInstalled] = useState<ToolStatus | null>(null);
  const s = installed ?? toolStatus(caps, tool);
  const missing = s === null ? null : s.present === false;
  const { button, said } = useInstall(caps, missing === false ? null : tool, null, (now) => {
    setInstalled(now);
    onChanged();
  });
  // once installed, the row says it: its version and where, and nothing under it
  return (
    <>
      <tr className={said && !installed ? "has-fail" : undefined}>
        <td>
          <b>{tool}</b>
        </td>
        <td>{s?.version ? <span className="path">{s.version}</span> : missing ? <span className="tag caution">missing</span> : <span className="meta">not said</span>}</td>
        <td className="path">{s?.path ?? ""}</td>
        <td className="acts">{button}</td>
      </tr>
      {said && !installed && (
        <tr className="fail-row">
          <td colSpan={4}>{said}</td>
        </tr>
      )}
    </>
  );
}
