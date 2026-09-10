// SPDX-License-Identifier: AGPL-3.0-only
// Places (Wave 5 section 10.2): every place, its role, its guarantees and
// which paths are bound to it; an operator adds, binds and retires places.
// The rules are checked, not documented: the form refuses a registry place
// without a backup before the door does.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { objects, type Place } from "../objects/client";
import { door as served, holds } from "../sections";
import { Empty } from "../ui/Empty";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { guaranteeWords, placeRule, ROLES } from "./console";

export function Places({ caps }: { caps: Capabilities }) {
  const has = served(caps, "GET /api/places");
  const operator = holds(caps, "operator");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [enforced, setEnforced] = useState<boolean | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const [draft, setDraft] = useState<{ name: string; role: Place["role"]; path: string; backup: string | null; snapshots: boolean; protected: boolean; fast: boolean }>({ name: "", role: "working", path: "", backup: null, snapshots: false, protected: false, fast: false });
  const [why, setWhy] = useState<string | null>(null);
  const load = useCallback((probe = false) => {
    if (!has) return;
    setSince(Date.now());
    objects
      .places(probe)
      .then((p) => {
        setPlaces(p.places);
        setEnforced(p.enforced ?? null);
        setFailed(null);
      })
      .catch((e: unknown) => setFailed(classify(e)));
  }, [has]);
  useEffect(() => {
    load();
  }, [load]);
  if (!has) return <p className="meta">This engine names no places yet; its paths are the flags it was started with. The rules of places arrive with the door.</p>;
  const rule = placeRule(draft, places ?? []);
  const add = () => {
    if (rule) return setWhy(rule);
    const guarantees: Record<string, unknown> = { snapshots: draft.snapshots, protected: draft.protected, fast: draft.fast };
    if (draft.backup) guarantees.backup = draft.backup;
    objects
      .placeAdd({ name: draft.name.trim(), role: draft.role, path: draft.path.trim(), guarantees })
      .then(() => {
        setWhy(null);
        setDraft({ name: "", role: "working", path: "", backup: null, snapshots: false, protected: false, fast: false });
        load();
      })
      .catch((e: Error) => setWhy(e.message));
  };
  const retire = (p: Place) => objects.placeSet(p.id, { retired: true }).then(() => load()).catch((e: Error) => setWhy(e.message));
  return (
    <div className="places">
      {failed && <Failure failed={failed} action={{ label: "Try again", onClick: () => load() }} />}
      {!failed && places === null && <Wait phase="reading the places" since={since} size="panel" />}
      {places && (
        <>
          <p className="meta">
            {enforced === true ? "The rules are enforced at every door that takes a path." : enforced === false ? "No path is bound yet; the rules wait for the first binding." : ""}{" "}
            <button type="button" onClick={() => load(true)}>Probe again</button>
          </p>
          {places.length === 0 ? (
            <Empty what="No place is declared." />
          ) : (
            <table className="thin places-table">
              <thead>
                <tr>
                  <th>place</th>
                  <th>role</th>
                  <th>path</th>
                  <th>guarantees</th>
                  <th>bound</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p.id} className={p.retired_at ? "off" : ""}>
                    <td>{p.name}{p.retired_at && <span className="meta"> (retired)</span>}</td>
                    <td>
                      <span className="tag">{p.role}</span>
                    </td>
                    <td>
                      <code>{p.path}</code>
                    </td>
                    <td>{guaranteeWords(p)}</td>
                    <td>{(p.bound ?? []).join(", ")}</td>
                    <td>{operator && !p.retired_at && <button type="button" onClick={() => retire(p)}>Retire</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {operator && places && (
        <div className="panel">
          <h3>Add a place</h3>
          <div className="row">
            <label>
              name <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} size={14} />
            </label>
            <label>
              role{" "}
              <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Place["role"] })}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              path <input value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="a directory on the engine's host" size={32} />
            </label>
          </div>
          <div className="row">
            <label>
              <input type="checkbox" checked={draft.snapshots} onChange={(e) => setDraft({ ...draft, snapshots: e.target.checked })} /> snapshots
            </label>
            <label>
              <input type="checkbox" checked={draft.protected} onChange={(e) => setDraft({ ...draft, protected: e.target.checked })} /> protected storage
            </label>
            <label>
              <input type="checkbox" checked={draft.fast} onChange={(e) => setDraft({ ...draft, fast: e.target.checked })} /> fast
            </label>
            {draft.role === "registry" && (
              <label>
                backed up to{" "}
                <select value={draft.backup ?? ""} onChange={(e) => setDraft({ ...draft, backup: e.target.value || null })}>
                  <option value="">choose a backup place</option>
                  {places.filter((p) => p.role === "backup" && !p.retired_at).map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="row">
            <button type="button" className="on" disabled={rule !== null} onClick={add} title={rule ?? ""}>Add</button>
            <span className="reason">{rule ?? "the engine probes the path and records what it finds"}</span>
          </div>
          {why && <p className="warn">{why}</p>}
        </div>
      )}
    </div>
  );
}
