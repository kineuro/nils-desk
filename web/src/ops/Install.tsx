// SPDX-License-Identifier: AGPL-3.0-only
// Install a missing tool from where its absence is said (2026-10-12): beside a
// failed run's reason, a refused pre-flight's and on Settings, Parts, an
// admin presses Install dcm2niix; the engine installs its pinned build, and
// the version is said with the run's Run again. Anyone else reads a sentence
// asking an admin. An install that fails (offline, say) shows the engine's
// reason and the way by hand. Nothing shows where the engine has no door.

import { useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { firstSentence, INSTALLABLE, refusalOf, type Failure } from "./failure";
import { installServed, mayInstall, tools, toolStatus, type ToolStatus } from "./tools";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; s: ToolStatus; said: string | null; again: "idle" | "busy" | "done" } | { kind: "failed"; f: Failure };

/**
 * The install, as two pieces a page places: the button, beside the reason,
 * and what it said, under it. `again` takes the run up again once the tool is
 * there and says what it queued; `onInstalled` lets a page read again.
 */
export function useInstall(caps: Capabilities, tool: string | null, again: (() => Promise<string>) | null = null, onInstalled: ((s: ToolStatus) => void) | null = null): { button: React.ReactNode; said: React.ReactNode } {
  const [state, setState] = useState<State>({ kind: "idle" });
  if (tool === null || !installServed(caps, tool)) return { button: null, said: null };
  if (!mayInstall(caps, tool)) return { button: null, said: <p className="meta tool-said">Ask an admin to install {tool}.</p> };
  const go = () => {
    setState({ kind: "busy" });
    tools.install(tool).then(
      (s) => {
        setState({ kind: "done", s, said: null, again: "idle" });
        onInstalled?.(s);
      },
      (e: unknown) => setState({ kind: "failed", f: refusalOf(e) }),
    );
  };
  const runAgain = () => {
    if (state.kind !== "done" || again === null) return;
    setState({ ...state, again: "busy" });
    again().then(
      (said) => setState({ ...state, said, again: "done" }),
      (e: unknown) => setState({ ...state, said: refusalOf(e).line, again: "idle" }),
    );
  };
  if (state.kind === "done") {
    return {
      button: null,
      said: (
        <div className="tool-said">
          <span>
            {tool} <span className="path">{state.s.version ?? ""}</span> installed{state.s.path ? <span className="meta"> at {state.s.path}</span> : null}.
          </span>
          {again && state.again !== "done" && (
            <button type="button" className="button small" disabled={state.again === "busy"} onClick={runAgain}>
              Run again
            </button>
          )}
          {state.said && <span className="meta">{state.said}</span>}
        </div>
      ),
    };
  }
  const busy = state.kind === "busy";
  return {
    button: (
      <button type="button" className={state.kind === "failed" ? "button secondary small" : "button small"} disabled={busy} onClick={go}>
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
  return (
    <>
      <tr className={said ? "has-fail" : undefined}>
        <td>
          <b>{tool}</b>
        </td>
        <td>{s?.version ? <span className="path">{s.version}</span> : missing ? <span className="tag caution">missing</span> : <span className="meta">not said</span>}</td>
        <td className="path">{s?.path ?? ""}</td>
        <td className="acts">{button}</td>
      </tr>
      {said && (
        <tr className="fail-row">
          <td colSpan={4}>{said}</td>
        </tr>
      )}
    </>
  );
}
