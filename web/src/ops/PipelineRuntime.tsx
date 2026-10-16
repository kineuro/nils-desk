// SPDX-License-Identifier: AGPL-3.0-only
// The Catalog's runtime and starters (gate T31, walkthrough step 15.8), and
// a run's seeds: what runs pipelines and which runtime is chosen, whether
// the engine seeds its starter catalog at its start and seeding it now, and
// the scans a run suggests curating, saved as a selection. Each change is
// install work; a person who may only look sees the line.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { maySave, selectionName } from "../query/selections";
import { door } from "../ask/client";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Wait } from "../ui/Wait";
import { CHOICE_WORDS, runtime, runtimeActs, runtimeWords, seedsAsk, seedsWords, startersWords, type RuntimeChoice, type Seeds, type Starters } from "./pipelineSetup";

/** What runs pipelines: the line, and Change for a person with install work. */
export function RuntimePanel({ caps }: { caps: Capabilities }) {
  const acts = runtimeActs(caps);
  const [rt, setRt] = useState<RuntimeChoice | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (acts.seeRuntime) runtime.get().then(setRt, (e: unknown) => setWhy(messageOf(e)));
  }, [acts.seeRuntime]);
  if (!acts.seeRuntime) return null;
  return (
    <div className="section-head rule-top setup-row">
      <h2>Runtime</h2>
      {rt === null && !why && <span className="meta">reading</span>}
      {why && <span className="warn">{why}</span>}
      {rt && <span className="meta grow">{runtimeWords(rt)}</span>}
      {rt && acts.runtime && (
        <button type="button" className="button quiet small" onClick={() => setEditing(true)}>
          Change
        </button>
      )}
      {editing && rt && (
        <RuntimeDialog
          rt={rt}
          onClose={() => setEditing(false)}
          onDone={(r) => {
            setRt(r);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function RuntimeDialog({ rt, onClose, onDone }: { rt: RuntimeChoice; onClose: () => void; onDone: (r: RuntimeChoice) => void }) {
  const [choice, setChoice] = useState(rt.choice);
  const [image, setImage] = useState(rt.apptainer_image);
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const change = { ...(choice !== rt.choice ? { choice } : {}), ...(image !== rt.apptainer_image ? { apptainer_image: image } : {}) };
  const save = () => {
    setBusy(Date.now());
    setWhy(null);
    runtime.set(change).then(onDone, (e: unknown) => {
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
      <button type="button" className="button" disabled={Object.keys(change).length === 0 || busy !== null} onClick={save}>
        Save
      </button>
    </div>
  );
  return (
    <Dialog title="Pipeline runtime" icon="sliders" onClose={onClose} foot={foot}>
      <label className="field">
        <span className="label">
          Runs under
          <Hint text="Docker is taken only when chosen here. Off stops every new run until another choice." />
        </span>
        <span className="input">
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {rt.choices.map((c) => (
              <option key={c} value={c}>
                {CHOICE_WORDS[c] ?? c}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="field">
        <span className="label">
          Apptainer keeps an image as
          <Hint text="sif, one file; sandbox, a folder, where the machine has no /dev/fuse." />
        </span>
        <span className="input">
          <select value={image} onChange={(e) => setImage(e.target.value)}>
            {rt.apptainer_images.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </span>
      </label>
    </Dialog>
  );
}

/** The starter catalog: the line, seeding at start on or off, and Seed now, for a person with install work. */
export function StartersPanel({ caps }: { caps: Capabilities }) {
  const acts = runtimeActs(caps);
  const [st, setSt] = useState<Starters | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (acts.seeStarters) runtime.starters().then(setSt, (e: unknown) => setWhy(messageOf(e)));
  }, [acts.seeStarters]);
  if (!acts.seeStarters) return null;
  const act = (work: Promise<Starters>, words: (s: Starters) => string | null) => {
    setBusy(true);
    setWhy(null);
    setSaid(null);
    work.then(
      (s) => {
        setSt(s);
        setSaid(words(s));
        setBusy(false);
      },
      (e: unknown) => {
        setWhy(messageOf(e));
        setBusy(false);
      },
    );
  };
  const lacking = st ? st.starters.some((s) => !s.state.startsWith("in the catalog")) : false;
  return (
    <>
      <div className="section-head rule-top setup-row">
        <h2>Starters</h2>
        {st === null && !why && <span className="meta">reading</span>}
        {st && <span className="meta grow">{startersWords(st)}</span>}
        {st && acts.seed && lacking && (
          <button type="button" className="button quiet small" disabled={busy} onClick={() => act(runtime.seed(), (s) => (s.added?.length ? `Added ${s.added.map((a) => a.label).join(", ")}.` : "Nothing was lacking."))}>
            Seed now
          </button>
        )}
        {st && acts.starters && (
          <button type="button" className="button quiet small" disabled={busy} onClick={() => act(runtime.seeding(st.seeding === "off"), () => null)}>
            {st.seeding === "on" ? "Stop seeding at start" : "Seed at start"}
          </button>
        )}
      </div>
      {why && <p className="warn">{why}</p>}
      {said && <p className="ok-words">{said}</p>}
    </>
  );
}

/** A run's seeds: what it suggests curating, and Save as a selection, which a campaign starts from. */
export function RunSeeds({ caps, run, suggested }: { caps: Capabilities; run: number; suggested: boolean }) {
  const acts = runtimeActs(caps);
  const [seeds, setSeeds] = useState<Seeds | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (acts.seeds && suggested) runtime.seeds(run).then(setSeeds, (e: unknown) => setWhy(messageOf(e)));
  }, [acts.seeds, suggested, run]);
  if (!acts.seeds || !suggested) return null;
  const saves = maySave(caps) && seeds !== null && seeds.selection.stacks.length > 0;
  return (
    <>
      <div className="section-head rule-top">
        <h2>Suggested to curate</h2>
        {seeds && <span className="meta grow">{seedsWords(seeds)}</span>}
        {saves && (
          <button type="button" className="button quiet small" onClick={() => setSaving(true)}>
            Save as a selection
          </button>
        )}
      </div>
      {seeds === null && !why && <p className="meta">reading</p>}
      {why && <p className="warn">{why}</p>}
      {said && <p className="ok-words">{said}</p>}
      {saving && seeds && (
        <SaveSeeds
          run={run}
          stacks={seeds.selection.stacks}
          onClose={() => setSaving(false)}
          onDone={(w) => {
            setSaving(false);
            setSaid(w);
          }}
        />
      )}
    </>
  );
}

function SaveSeeds({ run, stacks, onClose, onDone }: { run: number; stacks: number[]; onClose: () => void; onDone: (words: string) => void }) {
  const [typed, setTyped] = useState(`run-${run}-to-curate`);
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const name = selectionName(typed);
  const save = () => {
    if (!name) return;
    setBusy(Date.now());
    setWhy(null);
    door<{ name: string; version: number }>("PUT", `/api/ask/selections/${encodeURIComponent(name)}`, { document: seedsAsk(stacks), note: `the stacks pipeline run ${run} suggests curating` }).then(
      (s) => onDone(`Saved as selection ${s.name}, version ${s.version}; a campaign starts from it on Review.`),
      (e: unknown) => {
        setBusy(null);
        setWhy(messageOf(e));
      },
    );
  };
  const foot = (
    <div className="row actions">
      {busy !== null && <Wait phase="saving" since={busy} />}
      {why && <span className="warn">{why}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!name || busy !== null} onClick={save}>
        Save
      </button>
    </div>
  );
  return (
    <Dialog title="Save as a selection" icon="branch" eyebrow={`${stacks.length} ${stacks.length === 1 ? "scan" : "scans"}`} onClose={onClose} foot={foot}>
      <label className="field">
        <span className="label">Name</span>
        <span className="input mono">
          <input value={typed} spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </span>
      </label>
    </Dialog>
  );
}
