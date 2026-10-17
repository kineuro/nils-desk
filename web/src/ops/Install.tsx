// SPDX-License-Identifier: AGPL-3.0-only
// Install a missing tool from where its absence is said (2026-10-12): beside a
// failed run's reason, a refused pre-flight's and on Settings, Parts, an
// admin presses Install dcm2niix where the failure's `fix` names the engine's
// install; the engine fetches its pinned build, and the version is said with
// the run's Run again. Anyone else reads a sentence asking an admin. An
// install that fails (offline, say) shows the engine's reason whole, which
// says the way by hand. Nothing shows where the engine offers no fix. Since
// 2026-10-12 Run again opens the run's pre-flight first (./RunAgain), which
// says what it queued. Gate T31, step 15.7: where the install failed because
// the engine could not reach the releases, Install from a file sits beside
// Try again, with the archive to fetch (its name, link and sha256); the
// person picks the archive they fetched elsewhere and the engine checks it
// against the pinned sha256 before it installs it. The command line's twin,
// which fails the same way, is printed only by an engine without that door.

import { useEffect, useState, useSyncExternalStore } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { mayAny } from "../grants";
import { Icon } from "../ui/Icon";
import { failureWords, refusalOf, type Failure, type Fix } from "./failure";
import { fileOfRefusal, fixOfTool, foundByWords, mayInstall, mayInstallFile, mayListTools, tools, toolsInCaps, toolStatus, type ToolEntry, type ToolFile } from "./tools";

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

type State = { kind: "idle" } | { kind: "busy"; words: string } | { kind: "failed"; f: Failure; file: ToolFile | null };

/** A size in megabytes, to one decimal. */
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * The install, as two pieces a page places: the button, beside the reason,
 * and what it said, under it. Once the tool is there (installed from here, or
 * present as the capabilities say) the line says its version, with Run again
 * where `again` is given: it opens the run's pre-flight, which takes it up
 * again. `onInstalled` lets a page read again; `quiet` draws the button as a
 * secondary one, for a table of several; `known` is the tool as a page read
 * it, where the capabilities may not say it.
 */
export function useInstall(caps: Capabilities, fix: Fix | null, again: (() => void) | null = null, onInstalled: ((t: ToolEntry) => void) | null = null, quiet = false, known: ToolEntry | null = null): { button: React.ReactNode; said: React.ReactNode } {
  const [state, setState] = useState<State>({ kind: "idle" });
  const snapshot = () => (fix === null ? null : (installedNow.get(fix.tool) ?? null));
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (fix === null || !served(caps, fix.door)) return { button: null, said: null };
  const present = toolStatus(caps, fix.tool);
  const statusFile = (known ?? present)?.install?.file ?? null;
  const there = now ?? (present?.present ? present : null);
  if (there) {
    return {
      button: null,
      said: (
        <div className="tool-said">
          <span>
            {fix.tool} {there.version && <span className="path">{there.version}</span>} is installed{there.path ? <span className="meta"> at {there.path}</span> : null}.
          </span>
          {again && (
            <button type="button" className="button small" onClick={again}>
              Run again
            </button>
          )}
        </div>
      ),
    };
  }
  if (!mayInstall(caps, fix)) return { button: null, said: <p className="meta tool-said">Ask an admin to install {fix.tool}.</p> };
  const done = (a: { tool: ToolEntry | null }) => {
    const t = a.tool ?? { ...(present ?? { name: fix.tool, path: null, found_by: null, version: null, pinned: null, current: null, problem: null, install: null }), present: true };
    setState({ kind: "idle" });
    noteInstalled(t);
    onInstalled?.(t);
  };
  const go = () => {
    setState({ kind: "busy", words: `Installing ${fix.tool}…` });
    tools.install(fix).then(done, (e: unknown) => setState({ kind: "failed", f: refusalOf(e), file: fileOfRefusal(e, statusFile) }));
  };
  // the archive the person fetched, sent to the engine's install from a file, which checks it against the pinned sha256
  const give = (file: ToolFile, picked: File) => {
    if (file.max_bytes !== null && picked.size > file.max_bytes) {
      setState({ kind: "failed", f: failureWords(`${picked.name} is ${mb(picked.size)}, larger than any ${file.archive}: pick the ${file.archive} fetched from its release`), file });
      return;
    }
    setState({ kind: "busy", words: `Installing from ${picked.name}…` });
    tools.installFile(file, fix.tool, picked).then(done, (e: unknown) => setState({ kind: "failed", f: refusalOf(e), file: fileOfRefusal(e, file) }));
  };
  const busy = state.kind === "busy";
  const failed = state.kind === "failed" ? state : null;
  // the install from a file, where the failure names the archive and this person may give it
  const file = failed && mayInstallFile(caps, fix, failed.file) ? failed.file : null;
  // an engine with the install from a file never needs the command line's twin, which fails the same way
  const fileDoor = failed?.file?.door ?? statusFile?.door ?? null;
  const twin = fix.command !== null && (fileDoor === null || !served(caps, fileDoor));
  const tryAgain = (
    <button type="button" className={quiet || failed ? "button secondary small" : "button small"} disabled={busy} onClick={go}>
      {busy ? state.words : failed ? "Try again" : `Install ${fix.tool}`}
    </button>
  );
  return {
    button: file ? (
      <>
        {tryAgain}
        <label className="button secondary small">
          <Icon name="upload" />
          Install from a file
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            aria-label={`The ${file.archive} fetched`}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) give(file, picked);
            }}
          />
        </label>
      </>
    ) : (
      tryAgain
    ),
    said: failed ? (
      <div className="tool-said">
        {/* the engine's reason whole: offline, it says the way by hand (the archive, its sha256 and where the binary goes) */}
        <span className="warn">
          {fix.tool} was not installed: {failed.f.error}
        </span>
        {file ? (
          <span className="meta tool-file">
            Fetch {file.url ? <a href={file.url} target="_blank" rel="noreferrer">{file.archive}</a> : <span className="path">{file.archive}</span>} on a machine that reaches it, and give it here with Install from a file
            {file.sha256 && (
              <>
                ; its sha256 is <code>{file.sha256}</code>
              </>
            )}
            .
          </span>
        ) : (
          twin && (
            <span className="meta">
              At the command line: <code>{fix.command}</code>
            </span>
          )
        )}
      </div>
    ) : null,
  };
}

/** The install for a failure whose fix the engine offers: the button, and under it what it said; nothing for any other failure. */
export function InstallFor({ caps, f, again = null, onInstalled = null }: { caps: Capabilities; f: Failure; again?: (() => void) | null; onInstalled?: ((t: ToolEntry) => void) | null }) {
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
  const { button, said } = useInstall(
    caps,
    offered,
    null,
    (n) => {
      setNow(n);
      onInstalled();
    },
    false,
    t,
  );
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
