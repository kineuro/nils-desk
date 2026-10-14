// SPDX-License-Identifier: AGPL-3.0-only
// Session schemes in the desk (record 55 H2, rounds 3 and 4): the choice in
// the release form, where New scheme makes one in place, and Release's
// Session schemes page that lists them.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { schemeActs, schemeOf, schemes, schemeWords, type KeptScheme, type SchemeForm } from "./schemes";

const NEW = "\u0000new";

/** The release form's choice: the registry's own scheme, a kept one, or New scheme, which makes one and chooses it. */
export function SchemePicker({ caps, value, onChange }: { caps: Capabilities; value: string; onChange: (name: string) => void }) {
  const acts = schemeActs(caps);
  const [kept, setKept] = useState<KeptScheme[] | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  useEffect(() => {
    if (acts.see)
      schemes.list().then(
        (r) => {
          setKept(r.schemes);
          setFallback(r.default);
        },
        () => setKept([]),
      );
  }, [acts.see]);
  if (!acts.see) {
    return (
      <span className="input scheme">
        <input value={value} placeholder="the registry's scheme" onChange={(e) => onChange(e.target.value)} aria-label="Session scheme" />
      </span>
    );
  }
  return (
    <>
      <span className="input scheme">
        <select value={value} aria-label="Session scheme" onChange={(e) => (e.target.value === NEW ? setMaking(true) : onChange(e.target.value))}>
          <option value="">{fallback ? `the registry's own, ${fallback}` : "the registry's own"}</option>
          {(kept ?? []).map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}: {schemeWords(s.scheme)}
            </option>
          ))}
          {acts.add && <option value={NEW}>New scheme…</option>}
        </select>
      </span>
      {making && (
        <NewSchemeDialog
          onClose={() => setMaking(false)}
          onDone={(s) => {
            setKept((k) => [...(k ?? []), s]);
            onChange(s.name);
            setMaking(false);
          }}
        />
      )}
    </>
  );
}

/** New scheme: a name, how sessions are named, and how close studies are to be one session. */
export function NewSchemeDialog({ onClose, onDone }: { onClose: () => void; onDone: (s: KeptScheme) => void }) {
  const [form, setForm] = useState<SchemeForm>({ name: "", naming: "months", cadence: "0, 6, 12, 24", tolerance: "1.5", window: "0" });
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const made = schemeOf(form);
  const problem = why ?? (typeof made === "string" && form.name.trim() !== "" ? made : null);
  const save = () => {
    if (typeof made === "string") return;
    setBusy(Date.now());
    setWhy(null);
    schemes.add(made.name, made.scheme).then(onDone, (e: unknown) => {
      setBusy(null);
      setWhy(messageOf(e));
    });
  };
  const foot = (
    <div className="row actions">
      {busy !== null && <Wait phase="keeping" since={busy} />}
      {problem && <span className="warn">{problem}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={typeof made === "string" || busy !== null} onClick={save}>
        Keep it
      </button>
    </div>
  );
  return (
    <Dialog title="New session scheme" icon="calendar" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="scheme-name">
          Name
          <Hint text="A kept name is never replaced; a release names the scheme it used." />
        </label>
        <div className="input mono">
          <input id="scheme-name" value={form.name} placeholder="baseline-months" spellCheck={false} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <span className="label">Sessions are named</span>
        <div className="chips">
          {(
            [
              ["months", "Months from the first"],
              ["date", "By date"],
              ["ordinal", "In order"],
            ] as const
          ).map(([k, words]) => (
            <button key={k} type="button" className={form.naming === k ? "opt on" : "opt"} aria-pressed={form.naming === k} onClick={() => setForm({ ...form, naming: k })}>
              {words}
            </button>
          ))}
        </div>
      </div>
      {form.naming === "months" && (
        <div className="fields2">
          <div className="field">
            <label className="label" htmlFor="scheme-cadence">
              Visit months
              <Hint text="The nominal visits, M00, M06 and so on; a session close to one takes its label." />
            </label>
            <div className="input mono">
              <input id="scheme-cadence" value={form.cadence} spellCheck={false} onChange={(e) => setForm({ ...form, cadence: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="scheme-tolerance">
              Within, months
              <Hint text="How far from a visit month a session may sit and still take its label." />
            </label>
            <div className="input mono">
              <input id="scheme-tolerance" value={form.tolerance} spellCheck={false} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
            </div>
          </div>
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="scheme-window">
          One session within, days
          <Hint text="A study joins a session when it falls within this many days of its first study; 0 is the same day." />
        </label>
        <div className="input mono">
          <input id="scheme-window" value={form.window} spellCheck={false} onChange={(e) => setForm({ ...form, window: e.target.value })} />
        </div>
      </div>
    </Dialog>
  );
}

/** Release's Session schemes: the kept schemes, and New scheme. */
export function SchemesPage({ caps }: { caps: Capabilities }) {
  const acts = schemeActs(caps);
  const [load, setLoad] = useState<{ kind: "loading"; since: number } | { kind: "ready"; rows: KeptScheme[]; fallback: string | null } | { kind: "failed"; why: string }>(() => ({ kind: "loading", since: Date.now() }));
  const [making, setMaking] = useState(false);
  const read = () => schemes.list().then((r) => setLoad({ kind: "ready", rows: r.schemes, fallback: r.default }), (e: unknown) => setLoad({ kind: "failed", why: messageOf(e) }));
  useEffect(() => {
    read();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once
  }, []);
  return (
    <section className="data release">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Release</span>
          <h1>Session schemes</h1>
          <p className="lede">How a subject&apos;s studies become sessions, and what each is called.</p>
        </div>
        {acts.add && (
          <button type="button" className="button" onClick={() => setMaking(true)}>
            <Icon name="plus" />
            New scheme
          </button>
        )}
      </div>
      {load.kind === "loading" && <Wait phase="reading the schemes" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The schemes could not be read: {load.why}</p>}
      {load.kind === "ready" && load.rows.length === 0 && <p className="meta">No scheme kept yet. Releases use the registry&apos;s own{acts.add ? "; New scheme makes one." : "."}</p>}
      {load.kind === "ready" && load.rows.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Scheme</th>
                <th>Sessions</th>
                <th>Kept</th>
              </tr>
            </thead>
            <tbody>
              {load.rows.map((s) => (
                <tr key={s.name}>
                  <td className="mono">
                    {s.name}
                    {s.name === load.fallback && <span className="tag"> the registry&apos;s own</span>}
                  </td>
                  <td>{schemeWords(s.scheme)}</td>
                  <td className="meta">{s.added_at ? whenWords(s.added_at) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {making && (
        <NewSchemeDialog
          onClose={() => setMaking(false)}
          onDone={() => {
            setMaking(false);
            read();
          }}
        />
      )}
    </section>
  );
}
