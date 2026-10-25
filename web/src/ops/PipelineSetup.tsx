// SPDX-License-Identifier: AGPL-3.0-only
// The Catalog's setup (record 55 H2, round 4: no command line inside a
// flow): Add a pipeline from its descriptor, where pipelines run (the lane),
// and the secret files pipelines declare. Each is install work; a person who
// may only look sees the lane and which secrets are set, never a secret.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { addedWords, laneChange, laneWords, setup, setupActs, type Lane, type Secret } from "./pipelineSetup";

/** Text typed, pasted or read from a file the person picks. */
export function TextOrFile({ id, value, placeholder, accept, onChange }: { id: string; value: string; placeholder: string; accept: string; onChange: (text: string) => void }) {
  return (
    <>
      <div className="input mono">
        <textarea id={id} className="setup-text" rows={10} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      </div>
      <label className="button quiet small file-pick">
        <Icon name="upload" />
        Read a file
        <input type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0]?.text().then(onChange)} />
      </label>
    </>
  );
}

/** Add a pipeline: its nils.job.yml, pasted or read from a file; the engine refuses an image not pinned by digest and says so. */
export function AddPipelineDialog({ onClose, onDone }: { onClose: () => void; onDone: (words: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const add = () => {
    setBusy(Date.now());
    setWhy(null);
    setup.add(text).then(
      (a) => onDone(addedWords(a)),
      (e: unknown) => {
        setBusy(null);
        setWhy(messageOf(e));
      },
    );
  };
  const foot = (
    <div className="row actions">
      {busy !== null && <Wait phase="adding" since={busy} />}
      {why && <span className="warn">{why}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={text.trim() === "" || busy !== null} onClick={add}>
        Add
      </button>
    </div>
  );
  return (
    <Dialog title="Add a pipeline" icon="branch" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="pipeline-descriptor">
          Its nils.job.yml
          <Hint text="The descriptor names the image by its digest, the inputs, outputs and parameters. The same descriptor again is the version it is; one that differs is the next version." />
        </label>
        <TextOrFile id="pipeline-descriptor" value={text} placeholder="name: … image: …@sha256:…" accept=".yml,.yaml,.json,text/yaml" onChange={setText} />
      </div>
    </Dialog>
  );
}

/** Where pipelines run: the lane in a line, and Change for a person with install work. */
export function LanePanel({ caps }: { caps: Capabilities }) {
  const acts = setupActs(caps);
  const [lane, setLane] = useState<Lane | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (acts.seeLane) setup.lane().then(setLane, (e: unknown) => setWhy(messageOf(e)));
  }, [acts.seeLane]);
  if (!acts.seeLane) return null;
  return (
    <div className="section-head rule-top setup-row">
      <h2>Where they run</h2>
      {lane === null && !why && <span className="meta">reading</span>}
      {why && <span className="warn">{why}</span>}
      {lane && <span className="meta grow">{laneWords(lane)}</span>}
      {lane && acts.lane && (
        <button type="button" className="button quiet small" onClick={() => setEditing(true)}>
          Change
        </button>
      )}
      {editing && lane && (
        <LaneDialog
          lane={lane}
          onClose={() => setEditing(false)}
          onDone={(l) => {
            setLane(l);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function LaneDialog({ lane, onClose, onDone }: { lane: Lane; onClose: () => void; onDone: (l: Lane) => void }) {
  const places = "error" in lane.places ? { output: null, scratch: null } : lane.places;
  const [form, setForm] = useState({ cores: String(lane.cores), memory: String(lane.memory_gb), card: lane.gpu_card === null ? "none" : String(lane.gpu_card), output: places.output ?? "", scratch: places.scratch ?? "" });
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const change = laneChange(lane, form);
  const problem = why ?? (typeof change === "string" ? change : null);
  const save = () => {
    if (typeof change === "string") return;
    setBusy(Date.now());
    setWhy(null);
    setup.setLane(change).then(onDone, (e: unknown) => {
      setBusy(null);
      setWhy(messageOf(e));
    });
  };
  const field = (key: keyof typeof form, label: string, hint: string, placeholder = "") => (
    <div className="field">
      <label className="label" htmlFor={`lane-${key}`}>
        {label}
        <Hint text={hint} />
      </label>
      <div className="input mono">
        <input id={`lane-${key}`} value={form[key]} placeholder={placeholder} spellCheck={false} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </div>
    </div>
  );
  const foot = (
    <div className="row actions">
      {busy !== null && <Wait phase="saving" since={busy} />}
      {problem && <span className="warn">{problem}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={typeof change === "string" || Object.keys(change).length === 0 || busy !== null} onClick={save}>
        Save
      </button>
    </div>
  );
  return (
    <Dialog title="Where pipelines run" icon="sliders" onClose={onClose} foot={foot}>
      <div className="fields2">
        {field("cores", "Cores", "The cores the units of every run hold together.")}
        {field("memory", "Memory, GB", "The memory they hold together; never more than this machine offers.")}
      </div>
      {field("card", "GPU card", "The card a GPU unit leases, by its index, or none.", "none")}
      <div className="fields2">
        {field("output", "Outputs to", "A working place by name; empty for the first one.", "the first working place")}
        {field("scratch", "Scratch to", "A working place by name; empty for the first one.", "the first working place")}
      </div>
    </Dialog>
  );
}

/** The secret files pipelines declare: which are set, Set and Unset for a person with install work; a secret's contents never show. */
export function SecretsPanel({ caps }: { caps: Capabilities }) {
  const acts = setupActs(caps);
  const [rows, setRows] = useState<Secret[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [setting, setSetting] = useState<Secret | null>(null);
  const read = () => setup.secrets().then((r) => setRows(r.secrets), (e: unknown) => setWhy(messageOf(e)));
  useEffect(() => {
    if (acts.seeSecrets) read();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once the grant and door allow
  }, [acts.seeSecrets]);
  if (!acts.seeSecrets || (rows !== null && rows.length === 0 && !why)) return null;
  return (
    <>
      <div className="section-head rule-top">
        <h2>Secrets</h2>
        <span className="meta">files a pipeline reads, such as a licence; never shown</span>
      </div>
      {why && <p className="warn">{why}</p>}
      {rows !== null && rows.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Secret</th>
                <th>For</th>
                <th>State</th>
                <th className="acts" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id}</td>
                  <td className="meta">{s.declared_by.join(", ")}</td>
                  <td>{s.set ? <span className="tag ok">set</span> : <span className={s.optional ? "tag" : "tag caution"}>{s.optional ? "not set, optional" : "not set"}</span>}</td>
                  <td className="acts">
                    {acts.secrets && (
                      <button type="button" className="button quiet small" onClick={() => setSetting(s)}>
                        {s.set ? "Replace" : "Set"}
                      </button>
                    )}
                    {acts.secrets && s.set && (
                      <button type="button" className="button quiet small" onClick={() => setup.unsetSecret(s.id).then(read, (e: unknown) => setWhy(messageOf(e)))}>
                        Unset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {setting && (
        <SecretDialog
          secret={setting}
          onClose={() => setSetting(null)}
          onDone={() => {
            setSetting(null);
            read();
          }}
        />
      )}
    </>
  );
}

function SecretDialog({ secret, onClose, onDone }: { secret: Secret; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const save = () => {
    setBusy(Date.now());
    setWhy(null);
    setup.setSecret(secret.id, text).then(onDone, (e: unknown) => {
      setBusy(null);
      setWhy(messageOf(e));
    });
  };
  const foot = (
    <div className="row actions">
      {busy !== null && <Wait phase="saving" since={busy} />}
      {why && <span className="warn">{why}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={text.trim() === "" || busy !== null} onClick={save}>
        Save
      </button>
    </div>
  );
  return (
    <Dialog title={`Secret ${secret.id}`} icon="key" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="secret-content">
          Its contents
          <Hint text="Kept by the engine in a file only it reads. It never shows again, here or anywhere." />
        </label>
        <TextOrFile id="secret-content" value={text} placeholder="the licence file's text" accept="*/*" onChange={setText} />
      </div>
    </Dialog>
  );
}
