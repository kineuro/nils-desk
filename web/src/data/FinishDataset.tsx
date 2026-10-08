// SPDX-License-Identifier: AGPL-3.0-only
// Finishing a dataset (Wave 7a, H2 round 1): what is still needed before
// NILS reads a dataset whose structure it found. Its state is read from the
// folder, never chosen. An unknown dataset asks one thing: which tree its
// entries with DICOM go into, dcm-original (identified data) or dcm-anon
// (already anonymised). The engine answers that with the question, naming the
// entries and the tree, and the move is sent only once the person confirms
// what is shown. An anonymised dataset asks what its PatientID holds and how
// its subjects are found (a map, or generated from the ID), and every dataset
// may say what names each pseudonymised copy's folder. The panel stands in Add
// a source's list and on its own in a dialog from Data, Places and Setup.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import type { Place } from "../objects/client";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { linkage, look as lookDoor, places as placesDoor, type DatasetFields, type FolderNaming, type Layout, type LinkageType, type PlaceAnswer, type Subjects } from "./datasets";
import { dicomNamed, foundFacts, moveAskedOf, notReadOf, patientIdOf, questionWords, stateOf, stateWords, type MoveAsked } from "./layout";

/** A dataset place as the panel needs it: the places door's row, or a row Add a source just found. */
export type Finishing = Pick<Place, "id" | "name" | "path"> & { dataset?: Place["dataset"]; not_read?: string | null };

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "failed"; why: string };

/** A fact as its value: what it is in small letters, then the value alone. */
function Values({ cells }: { cells: { k: string; v: string }[] }) {
  return (
    <div className="values">
      {cells.map((c) => (
        <div key={c.k}>
          <span className="k">{c.k}</span>
          <span className="v">{c.v}</span>
        </div>
      ))}
    </div>
  );
}

/** The entries with DICOM by name, the first hundred, and how many more. */
function Entries({ layout }: { layout: Layout }) {
  const { names, more } = dicomNamed(layout);
  if (names.length === 0) return null;
  return (
    <ul className="report">
      {names.map((e) => (
        <li key={e} className="path">
          {e}
        </li>
      ))}
      {more > 0 && <li className="meta">and {more.toLocaleString("en-US")} more</li>}
    </ul>
  );
}

/**
 * The ID types a pseudonymised file's PatientID may hold: never a
 * personnummer, which the engine refuses there, and not the subject code,
 * which is the other choice.
 */
export function writable(types: LinkageType[]): LinkageType[] {
  return types.filter((t) => t.name !== "personnummer" && t.name !== "subject-code");
}

/** The place and layout a door answered, as the panel and its list keep them. */
export interface Finished {
  place: Finishing;
  layout: Layout | null;
}

export function FinishPanel(props: { caps: Capabilities; place: Finishing; layout: Layout | null; onSaved: (next: Finished, words: string) => void; onBack?: (() => void) | null }) {
  const { caps, onSaved, onBack } = props;
  const [place, setPlace] = useState<Finishing>(props.place);
  const [layout, setLayout] = useState<Layout | null>(props.layout);
  const [looking, setLooking] = useState<number | null>(null);
  const [into, setInto] = useState<"originals" | "anon" | null>(null);
  const [asked, setAsked] = useState<MoveAsked | null>(null);
  const d = place.dataset ?? {};
  const given = typeof d.patient_id === "string" ? d.patient_id : null;
  const [pidChoice, setPidChoice] = useState<"subject-code" | "id-type">(given?.startsWith("id-type:") ? "id-type" : "subject-code");
  const [pidType, setPidType] = useState(given?.startsWith("id-type:") ? given.slice("id-type:".length) : "");
  const [subjects, setSubjects] = useState<Subjects | null>(d.subjects ?? null);
  const [folder, setFolder] = useState<FolderNaming>(d.folder ?? "subject-code");
  const [types, setTypes] = useState<LinkageType[] | null>(null);
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const working = act.kind === "working";
  const legacy = d.kind === "legacy" || layout?.legacy === true;
  const state = legacy ? "anonymised" : stateOf(place, layout);
  const anonymised = state === "anonymised";
  const notRead = notReadOf({ ...place, role: "source" });
  const patientId = patientIdOf(pidChoice, pidType);

  // what the folder holds, where the page that opened the panel has not got it
  useEffect(() => {
    if (layout !== null || legacy || !served(caps, "POST /api/ingest/look")) return;
    let alive = true;
    setLooking(Date.now());
    lookDoor
      .layout(place.path)
      .then((l) => alive && setLayout(l.layout ?? null))
      .catch(() => undefined)
      .finally(() => alive && setLooking(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the place opened
  }, []);

  // the registry's ID types, for what PatientID holds
  useEffect(() => {
    if (!served(caps, "GET /api/linkage/types")) return;
    let alive = true;
    linkage
      .types()
      .then((r) => {
        if (!alive) return;
        setTypes(r.types);
        setPidType((t) => t || writable(r.types)[0]?.name || "");
      })
      .catch(() => alive && setTypes([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  /** The place door's answer kept: the dataset as it stands now and the layout found. */
  const saved = (answer: PlaceAnswer, words: string) => {
    const next: Finishing = { id: answer.id, name: answer.name, path: answer.path, dataset: answer.dataset ?? place.dataset, not_read: answer.not_read };
    const l = answer.layout ?? layout;
    setPlace(next);
    setLayout(l);
    setAsked(null);
    setInto(null);
    setAct({ kind: "idle" });
    onSaved({ place: next, layout: l }, words);
  };

  const move = (confirmed: boolean) => {
    if (into === null) return;
    setAct({ kind: "working", phase: confirmed ? `moving the entries of ${place.name}` : "asking the engine what it would move", since: Date.now() });
    const body: DatasetFields = confirmed ? { move_into: into, confirm_move: true } : { move_into: into };
    placesDoor
      .set(place.id, body)
      .then((answer) => {
        const m = answer.layout?.moved;
        saved(answer, m ? `${place.name}: ${m.entries.toLocaleString("en-US")} ${m.entries === 1 ? "entry" : "entries"} moved into ${m.into}.` : `${place.name} is settled.`);
      })
      .catch((e: unknown) => {
        // the question is not a failure: nothing was written, and it is the person's to answer
        const question = confirmed ? null : moveAskedOf(e);
        if (question) {
          setLayout(question.layout);
          setAsked(question);
          setAct({ kind: "idle" });
          return;
        }
        setAct({ kind: "failed", why: messageOf(e) });
      });
  };

  const save = () => {
    if (patientId === null && (anonymised || pidChoice === "id-type")) return;
    const body: DatasetFields = { ...(patientId !== null ? { patient_id: patientId } : {}), ...(anonymised && subjects !== null ? { subjects } : {}), folder };
    setAct({ kind: "working", phase: `saving the settings of ${place.name}`, since: Date.now() });
    placesDoor
      .set(place.id, body)
      .then((answer) => saved(answer, `${place.name} is ${notReadOf({ ...answer, role: "source" }) === null ? "complete, and is read" : "saved"}.`))
      .catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
  };

  const question = asked && into !== null ? questionWords(asked, into) : null;
  const canSave = !working && (!anonymised || (patientId !== null && subjects !== null)) && (pidChoice !== "id-type" || patientId !== null) && (folder !== "id-type" || pidChoice === "id-type");

  return (
    <div className="finish">
      <div className="field">
        <span className="label">{place.name}</span>
        <Values cells={[{ k: "folder", v: place.path }, { k: "its structure says", v: stateWords(state, notRead === null, legacy) }]} />
        {notRead !== null && <span className="meta">Not read: {notRead}.</span>}
        {looking !== null && <Wait phase="looking inside the folder" since={looking} />}
      </div>

      {state === "unknown" && layout && (
        <div className="field">
          <span className="label">What the folder holds</span>
          <Values cells={foundFacts(layout)} />
          {(layout.move_into?.entries ?? 0) === 0 ? (
            <p className="meta">No entry beside derivatives/ holds DICOM, and there is no tree: there is nothing here to read. Put the DICOM in the folder and explore the source again.</p>
          ) : question ? (
            <div className="note caution" role="alertdialog" aria-label="Confirm the move">
              <Icon name="folder" />
              <div className="note-body">
                <p className="note-lead">{question.lead}</p>
                <p className="note-detail">{question.detail}</p>
                <Entries layout={asked!.layout} />
                <div className="row actions">
                  <button type="button" className="button quiet" disabled={working} onClick={() => setAsked(null)}>
                    Back
                  </button>
                  <button type="button" className="button" disabled={working} onClick={() => move(true)}>
                    Move them
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="meta">NILS does not know what these entries hold. Say which tree they go into; nothing moves until you confirm.</p>
              <details className="says">
                <summary>The entries with DICOM</summary>
                <Entries layout={layout} />
              </details>
              <div className="choices" role="radiogroup" aria-label="Which tree the entries go into">
                <label className="radio-row">
                  <input type="radio" name={`into-${place.id}`} checked={into === "originals"} disabled={working} onChange={() => setInto("originals")} />
                  <span>
                    <b>Into dcm-original: identified</b>
                    <span className="meta">{layout.move_into?.originals ?? "identified data: the pseudonymiser reads it and writes the anonymised copy"}</span>
                  </span>
                </label>
                <label className="radio-row">
                  <input type="radio" name={`into-${place.id}`} checked={into === "anon"} disabled={working} onChange={() => setInto("anon")} />
                  <span>
                    <b>Into dcm-anon: already anonymised</b>
                    <span className="meta">{layout.move_into?.anon ?? "already anonymised: the registry reads it"}</span>
                  </span>
                </label>
              </div>
              <div className="row actions">
                <button type="button" className="button" disabled={into === null || working} onClick={() => move(false)}>
                  Move the {(layout.move_into?.entries ?? 0).toLocaleString("en-US")} {(layout.move_into?.entries ?? 0) === 1 ? "entry" : "entries"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {state !== undefined && state !== "unknown" && (
        <>
          <div className="field">
            <span className="label">What PatientID holds{anonymised ? "" : " once pseudonymised"}</span>
            <div className="choices" role="radiogroup" aria-label="What PatientID holds">
              <label className="radio-row">
                <input type="radio" name={`pid-${place.id}`} checked={pidChoice === "subject-code"} disabled={working} onChange={() => setPidChoice("subject-code")} />
                <span>
                  <b>The subject's code</b>
                  <span className="meta">{anonymised ? "Taken as it is: the code the subject code generator makes." : "From the subject code generator, under this site's key."}</span>
                </span>
              </label>
              <label className="radio-row">
                <input type="radio" name={`pid-${place.id}`} checked={pidChoice === "id-type"} disabled={working} onChange={() => setPidChoice("id-type")} />
                <span>
                  <b>A value of an ID type</b>
                  <span className="meta">{anonymised ? "The ID the data was sent with, such as a study number." : "A file whose subject has no value of that type is held until a map gives one."}</span>
                </span>
              </label>
            </div>
            {pidChoice === "id-type" && (
              <div className="field-row">
                <TypeSelect value={pidType} types={types ? writable(types) : null} disabled={working} label="The ID type PatientID holds" onChange={setPidType} />
              </div>
            )}
          </div>
          {anonymised && (
            <div className="field">
              <span className="label">How its subjects are found</span>
              <div className="choices" role="radiogroup" aria-label="How its subjects are found">
                <label className="radio-row">
                  <input type="radio" name={`subjects-${place.id}`} checked={subjects === "map"} disabled={working} onChange={() => setSubjects("map")} />
                  <span>
                    <b>A map</b>
                    <span className="meta">{layout?.settings?.subjects?.map ?? "a map of subject codes to the dataset's ids; a file whose id no map names is held"}</span>
                  </span>
                </label>
                <label className="radio-row">
                  <input type="radio" name={`subjects-${place.id}`} checked={subjects === "generated"} disabled={working} onChange={() => setSubjects("generated")} />
                  <span>
                    <b>Generated from the ID</b>
                    <span className="meta">{layout?.settings?.subjects?.generated ?? "the subject code generator makes each code from the id"}</span>
                  </span>
                </label>
              </div>
              {subjects === "map" && <span className="meta">The map is given on the dataset's Pseudonymisation page; until then its files wait, held.</span>}
            </div>
          )}
          <div className="field">
            <span className="label">What names each copy's folder</span>
            <div className="choices" role="radiogroup" aria-label="What names each copy's folder">
              <label className="radio-row">
                <input type="radio" name={`folder-${place.id}`} checked={folder === "subject-code"} disabled={working} onChange={() => setFolder("subject-code")} />
                <span>
                  <b>The subject's code</b>
                </span>
              </label>
              <label className="radio-row">
                <input type="radio" name={`folder-${place.id}`} checked={folder === "id-type"} disabled={working || pidChoice !== "id-type"} onChange={() => setFolder("id-type")} />
                <span>
                  <b>The ID type's value</b>
                  <span className="meta">Only where PatientID holds an ID type.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="row actions">
            {onBack && (
              <button type="button" className="button quiet" disabled={working} onClick={onBack}>
                Back
              </button>
            )}
            <button type="button" className="button" disabled={!canSave} onClick={save}>
              Save
            </button>
          </div>
        </>
      )}
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
      {state === "unknown" && onBack && !asked && (
        <div className="row actions">
          <button type="button" className="button quiet" onClick={onBack}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

/** Finishing one dataset on its own, from Data, Places or Setup. */
export function FinishDialog(props: { caps: Capabilities; place: Finishing; layout: Layout | null; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, place, layout, onClose, onDone } = props;
  const [said, setSaid] = useState<string | null>(null);
  const foot = (
    <div className="row actions">
      {said && <span className="ok-words grow">{said}</span>}
      <button type="button" className="button secondary" onClick={() => (said ? onDone(said) : onClose())}>
        {said ? "Done" : "Close"}
      </button>
    </div>
  );
  return (
    <Dialog title={`Finish ${place.name}`} icon="folder" onClose={() => (said ? onDone(said) : onClose())} foot={foot}>
      <FinishPanel caps={caps} place={place} layout={layout} onSaved={(_, words) => setSaid(words)} />
    </Dialog>
  );
}

/** The ID type: one of the registry's where the engine lists them, else typed. */
function TypeSelect({ value, types, disabled, label, onChange }: { value: string; types: LinkageType[] | null; disabled: boolean; label: string; onChange: (t: string) => void }) {
  if (types && types.length > 0) {
    return (
      <div className="input">
        <select value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {!types.some((t) => t.name === value) && <option value={value}>{value || "choose a type"}</option>}
          {types.map((t) => (
            <option key={t.name} value={t.name} title={t.description ?? undefined}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="input mono">
      <input value={value} placeholder="study-id" aria-label={label} spellCheck={false} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
