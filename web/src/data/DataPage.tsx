// SPDX-License-Identifier: AGPL-3.0-only
// The Data page: where scans come from. Each source place is a card with how
// what comes in through it is handled, what it holds and how often it has
// been read; the chosen source lists its digests, newest first, each with its
// four stages: walked, digested, classified, reviewed. A digest of what is
// new is queued from here, a source's handling is declared here, and the
// setup's bring-in flow opens in a dialog.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served, holds } from "../deployment";
import { BringInForm } from "../home/BringIn";
import type { Pack } from "../home/look";
import { placesKept } from "../objects/kept";
import { data, ops } from "../ops/client";
import { href } from "../routes";
import type { Install } from "../settings/supervise";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { digestMarks, fileWords, handlingWords, sourceState, sources, whenWords, type Handling, type Source } from "./sources";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Source[] };

const n = (v: number) => v.toLocaleString("en-US");

export function DataPage({ caps, install, onChanged }: { caps: Capabilities; install: Install | null; onChanged: () => void }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [chosen, setChosen] = useState<string | null>(null);
  const [handlingOf, setHandlingOf] = useState<Source | null>(null);
  const [bringing, setBringing] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const places = useKept(placesKept);
  const operator = holds(caps, "operator");

  const read = useCallback(() => {
    sources
      .list()
      .then((r) => setLoad({ kind: "ready", list: r.sources }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  }, []);

  useEffect(() => {
    read();
    if (served(caps, "GET /api/places")) void placesKept.ensure();
    if (served(caps, "GET /api/packs")) data.packs().then((r) => setPacks(r.packs as Pack[]), () => setPacks([]));
  }, [read, caps]);

  // while a digest reads, the page reads again every twenty seconds
  const reading = load.kind === "ready" && load.list.some((s) => s.digests.recent.some((d) => d.state === "running"));
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(read, 20_000);
    return () => clearInterval(t);
  }, [reading, read]);

  const list = load.kind === "ready" ? load.list : [];
  const current = list.find((s) => s.name === chosen) ?? list[0] ?? null;

  const digestNew = (s: Source) => {
    setSaid(null);
    ops
      .enqueue(["digest", `@${s.name}`], `${s.name}-${new Date().toISOString().slice(0, 10)}`)
      .then((j) => {
        setSaid(`A digest of ${s.name} is queued as job ${j.job}; the page shows it once it starts.`);
        read();
      })
      .catch((e: Error) => setSaid(e.message));
  };

  return (
    <section className="data">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Sources</h1>
          <p className="lede">Where scans come from. A source keeps every digest of it: each time files land, a digest reads what is new or changed.</p>
        </div>
        <a className="button secondary" href={href("settings", "places")}>
          <Icon name="folder" />
          Add a source
        </a>
        {operator && (
          <button type="button" className="button" onClick={() => setBringing(true)}>
            <Icon name="plus" />
            Bring DICOM in
          </button>
        )}
      </div>
      {load.kind === "loading" && <Wait phase="reading the sources" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The sources could not be read: {load.why}</p>}
      {load.kind === "ready" && list.length === 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">No source yet.</p>
            <p className="note-detail">A source is a folder of DICOM that NILS reads and never writes to. Bring DICOM in to add one and read it.</p>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="source-cards">
          {list.map((s) => (
            <SourceCard key={s.id} source={s} on={current?.id === s.id} onPick={() => setChosen(s.name)} />
          ))}
        </div>
      )}
      {current && (
        <Digests
          source={current}
          operator={operator}
          said={said}
          onDigest={() => digestNew(current)}
          onHandling={() => setHandlingOf(current)}
        />
      )}
      {handlingOf && (
        <HandlingDialog
          source={handlingOf}
          onClose={() => setHandlingOf(null)}
          onSaved={() => {
            setHandlingOf(null);
            read();
          }}
        />
      )}
      {bringing && (
        <Dialog title="Bring DICOM in" icon="folder" onClose={() => setBringing(false)} foot={<span className="meta">Each folder you tick becomes a digest of its own.</span>}>
          <BringInForm
            caps={caps}
            install={install}
            places={places.value?.places ?? []}
            packs={packs}
            onDone={() => {
              setBringing(false);
              void placesKept.refresh().catch(() => undefined);
              onChanged();
              read();
            }}
          />
        </Dialog>
      )}
    </section>
  );
}

function SourceCard({ source: s, on, onPick }: { source: Source; on: boolean; onPick: () => void }) {
  const state = sourceState(s);
  const handled = handlingWords(s.handling);
  return (
    <button type="button" className={on ? "source-card on" : "source-card"} aria-pressed={on} onClick={onPick}>
      <span className="source-name">
        <Icon name="folder" />
        <span className="grow">{s.name}</span>
        <span className={`tag ${state.tone === "neutral" ? "" : state.tone}`}>{state.words}</span>
      </span>
      <span className="source-path">{s.path}</span>
      <span className={s.handling.arrives === "identified" ? "source-handling gated" : "source-handling ok"}>
        <Icon name={s.handling.arrives === "identified" ? "lock" : "shield"} />
        {handled.arrives}
      </span>
      <span className="source-nums">
        <span>
          <b>{n(s.totals.subjects)}</b>subjects
        </span>
        <span>
          <b>{n(s.totals.sessions)}</b>sessions
        </span>
        <span>
          <b>{n(s.totals.stacks)}</b>stacks
        </span>
      </span>
      <span className="meta">
        {s.digests.count === 0 ? "not read yet" : `${s.digests.count} ${s.digests.count === 1 ? "digest" : "digests"} · last ${whenWords(s.digests.last?.started_at ?? null)}`}
      </span>
    </button>
  );
}

function Digests(props: { source: Source; operator: boolean; said: string | null; onDigest: () => void; onHandling: () => void }) {
  const { source: s, operator, said, onDigest, onHandling } = props;
  const handled = handlingWords(s.handling);
  return (
    <section className="panel digests">
      <div className="digests-head">
        <div className="grow">
          <h2>Digests of {s.name}</h2>
          <p className="meta">
            {handled.arrives}; {handled.release}
            {s.totals.refused_files > 0 ? ` · ${n(s.totals.refused_files)} files refused` : ""}
          </p>
        </div>
        {operator && (
          <button type="button" className="button secondary small" onClick={onHandling}>
            <Icon name="pencil" />
            Handling
          </button>
        )}
        {operator && (
          <button type="button" className="button small" onClick={onDigest}>
            <Icon name="play" />
            Digest what is new
          </button>
        )}
      </div>
      {said && <p className="meta digests-said">{said}</p>}
      {s.digests.recent.length === 0 && <p className="meta digests-said">Nothing has read this source yet.</p>}
      {s.digests.recent.map((d) => (
        <div key={d.id} className="digest-row">
          <span className="num digest-when">{whenWords(d.started_at)}</span>
          <div className="digest-name">
            <span className="path">{d.name}</span>
            <span className="meta">{d.state === "running" ? `reading: ${n(d.files.seen)} files so far` : fileWords(d)}</span>
          </div>
          <div className="marks" aria-label="walked, digested, classified, reviewed">
            {digestMarks(d).map((m) => (
              <span key={m.name} className="mark-cell" title={`${m.name}: ${m.words}`}>
                <i className={`mark ${m.mark}`} />
                <span className="meta">{m.words}</span>
              </span>
            ))}
          </div>
          <span className="digest-state">
            {d.state === "running" ? <span className="tag brand">reading</span> : (d.to_sort ?? 0) > 0 ? <span className="tag caution">{n(d.to_sort ?? 0)} to sort</span> : d.state === "done" ? <span className="tag ok">sorted</span> : <span className="tag">{d.state}</span>}
          </span>
        </div>
      ))}
      {s.digests.count > s.digests.recent.length && <p className="meta digests-said">The {s.digests.recent.length} newest of {s.digests.count} digests.</p>}
    </section>
  );
}

function HandlingDialog({ source: s, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const [h, setH] = useState<Handling>(s.handling);
  const [why, setWhy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refused = h.on_release.dates !== "keep" && h.on_release.uids === "preserve";
  const release = (patch: Partial<Handling["on_release"]>) => setH((was) => ({ ...was, on_release: { ...was.on_release, ...patch } }));
  const save = () => {
    setSaving(true);
    setWhy(null);
    sources
      .setHandling(s.id, h)
      .then(onSaved)
      .catch((e: Error) => {
        setSaving(false);
        setWhy(e.message);
      });
  };
  const choice = (name: string, checked: boolean, onPick: () => void, words: string) => (
    <label className="choice">
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      {words}
    </label>
  );
  return (
    <Dialog
      title={`How ${s.name} is handled`}
      icon="lock"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={saving || refused} onClick={save}>
            Save
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {why && <span className="warn">{why}</span>}
        </div>
      }
    >
      <div className="field">
        <span className="label">What comes in</span>
        {choice("arrives", h.arrives === "identified", () => setH({ ...h, arrives: "identified" }), "Identified, as the scanners send it")}
        {choice("arrives", h.arrives === "deidentified", () => setH({ ...h, arrives: "deidentified" }), "Already de-identified")}
      </div>
      <div className="field">
        <span className="label">Dates, when it is released</span>
        {choice("dates", h.on_release.dates === "keep", () => release({ dates: "keep" }), "Kept as recorded")}
        {choice("dates", h.on_release.dates === "shift", () => release({ dates: "shift" }), "Shifted, by one offset per subject")}
        {choice("dates", h.on_release.dates === "year", () => release({ dates: "year" }), "Cut to the year")}
      </div>
      <div className="field">
        <span className="label">UIDs, when it is released</span>
        {choice("uids", h.on_release.uids === "remap", () => release({ uids: "remap" }), "Remapped")}
        {choice("uids", h.on_release.uids === "preserve", () => release({ uids: "preserve" }), "Preserved")}
      </div>
      <label className="choice">
        <input type="checkbox" checked={h.on_release.deface} onChange={(e) => release({ deface: e.target.checked })} />
        Faces removed before it leaves
      </label>
      {refused && <p className="warn">Dates that move cannot keep the original UIDs. Remap the UIDs, or keep the dates.</p>}
      <p className="meta">Subject codes are pseudonymous in every source. A release reads this handling; defacing is a pipeline still to be built, so for now the choice is kept for it.</p>
    </Dialog>
  );
}
