// SPDX-License-Identifier: AGPL-3.0-only
// The two things a dataset may still need before it is read (Wave 7a, the
// tries of 2026-10-08), each its own small dialog from the dataset's one
// button. "Sort the files": a dataset whose files lie beside its two folders
// asks whether they are identified or already anonymised; the engine answers
// with the question, naming the entries and the folder, and they move only
// once the person confirms. "Set the IDs": what PatientID holds (the subject
// code, or a hospital or study ID, never an ID that is the same everywhere),
// how subjects are found (a map,
// or made from the ID), and what names each copy's folder. Explanations sit
// behind a "?".

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { sees } from "../grants";
import type { Place } from "../objects/client";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Wait } from "../ui/Wait";
import { linkage, look as lookDoor, places as placesDoor, type DatasetFields, type FolderNaming, type Layout, type LinkageType, type PlaceAnswer, type Subjects } from "./datasets";
import { dicomNamed, moveAskedOf, namesShown, patientIdOf, questionWords, stateOf, type MoveAsked } from "./layout";
import { SAME_EVERYWHERE, typeLabel } from "./pseudonyms";

/** A dataset place as the dialogs need it. */
export type Finishing = Pick<Place, "id" | "name" | "path"> & { dataset?: Place["dataset"]; not_read?: string | null };

type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "failed"; why: string };

/**
 * The hospital or study IDs a pseudonymised file's PatientID may hold:
 * never an ID that is the same everywhere, which the engine refuses there
 * and NILS never keeps, and not the subject code, which is the other choice.
 */
export function writable(types: LinkageType[]): LinkageType[] {
  return types.filter((t) => t.name !== SAME_EVERYWHERE && t.name !== "subject-code");
}

/**
 * The entries by name, the first hundred, and how many more, at the
 * sensitive detail level only: a raw export often names its folders after
 * the patient or by their personnummer (review of 2026-10-10). Below it the
 * count the dialog says is all that is shown.
 */
function Entries({ caps, layout }: { caps: Capabilities; layout: Layout }) {
  const { names, more } = dicomNamed(layout);
  if (names.length === 0 || !namesShown(layout, sees(caps, "sensitive"))) return null;
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

function Choice({ name, checked, disabled, onPick, label, hint }: { name: string; checked: boolean; disabled?: boolean; onPick: () => void; label: string; hint?: string }) {
  return (
    <label className="radio-row">
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onPick} />
      <span>
        <b>{label}</b>
        {hint && <Hint text={hint} />}
      </span>
    </label>
  );
}

/** Sort the files: which folder the entries beside the dataset's folders go into, moved only once confirmed. */
export function SortFilesDialog(props: { caps: Capabilities; place: Finishing; layout: Layout | null; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, place, onClose, onDone } = props;
  const [layout, setLayout] = useState<Layout | null>(props.layout);
  const [into, setInto] = useState<"originals" | "anon" | null>(null);
  const [asked, setAsked] = useState<MoveAsked | null>(null);
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const working = act.kind === "working";
  /** Why the folder could not be looked inside: said, never left as looking. */
  const [lookWhy, setLookWhy] = useState<string | null>(null);

  // what the folder holds, where the page that opened the dialog has not got it
  useEffect(() => {
    if (layout !== null) return;
    if (!served(caps, "POST /api/ingest/look")) {
      setLookWhy("This engine cannot look inside a folder from here.");
      return;
    }
    let alive = true;
    lookDoor
      .layout(place.path)
      .then((l) => {
        if (!alive) return;
        if (l.layout) setLayout(l.layout);
        else setLookWhy("The engine said nothing of what the folder holds.");
      })
      .catch((e: unknown) => alive && setLookWhy(`The folder could not be looked inside: ${messageOf(e)}`));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the dataset opened
  }, []);

  const move = (confirmed: boolean) => {
    if (into === null) return;
    setAct({ kind: "working", phase: confirmed ? "moving the files" : "asking what would move", since: Date.now() });
    const body: DatasetFields = confirmed ? { move_into: into, confirm_move: true } : { move_into: into };
    placesDoor
      .set(place.id, body)
      .then((answer) => {
        const m = answer.layout?.moved;
        onDone(m ? `${place.name}: ${m.entries.toLocaleString("en-US")} moved.` : `${place.name} is sorted.`);
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

  const count = layout?.move_into?.entries ?? 0;
  const question = asked && into !== null ? questionWords(asked, into) : null;
  const foot = question ? (
    <div className="row actions">
      <button type="button" className="button quiet" disabled={working} onClick={() => setAsked(null)}>
        Back
      </button>
      <button type="button" className="button" disabled={working} onClick={() => move(true)}>
        Move them
      </button>
    </div>
  ) : (
    <div className="row actions">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={into === null || count === 0 || working} onClick={() => move(false)}>
        Next
      </button>
    </div>
  );

  return (
    <Dialog title={`Sort the files: ${place.name}`} icon="folder" onClose={onClose} foot={foot}>
      {layout === null && lookWhy === null && <Wait phase="looking inside the folder" since={Date.now()} />}
      {layout === null && lookWhy !== null && <p className="warn">{lookWhy}</p>}
      {layout !== null && count === 0 && <p className="meta">No DICOM here to sort.</p>}
      {layout !== null && count > 0 && !question && (
        <>
          <p>
            {count.toLocaleString("en-US")} {count === 1 ? "entry" : "entries"} with DICOM. What are they?
          </p>
          {namesShown(layout, sees(caps, "sensitive")) && (
            <details className="says">
              <summary>Which entries</summary>
              <Entries caps={caps} layout={layout} />
            </details>
          )}
          <div className="choices" role="radiogroup" aria-label="What the files are">
            <Choice name="into" checked={into === "originals"} disabled={working} onPick={() => setInto("originals")} label="Identified" hint={layout.move_into?.originals ?? "names in the files; NILS pseudonymises them"} />
            <Choice name="into" checked={into === "anon"} disabled={working} onPick={() => setInto("anon")} label="Already anonymised" hint={layout.move_into?.anon ?? "read as they are"} />
          </div>
        </>
      )}
      {question && asked && (
        <div className="note caution" role="alertdialog" aria-label="Confirm the move">
          <div className="note-body">
            <p className="note-lead">{question.lead}</p>
            <p className="note-detail">
              <span className="path">{question.tree}</span> · nothing was written yet
            </p>
            <Entries caps={caps} layout={asked.layout} />
          </div>
        </div>
      )}
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
    </Dialog>
  );
}

/** Set the IDs: what PatientID holds, how subjects are found, and what names each copy's folder. */
export function SetIdsDialog(props: { caps: Capabilities; place: Finishing; layout: Layout | null; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, place, layout, onClose, onDone } = props;
  const d = place.dataset ?? {};
  const given = typeof d.patient_id === "string" ? d.patient_id : null;
  const [pidChoice, setPidChoice] = useState<"subject-code" | "id-type">(given?.startsWith("id-type:") ? "id-type" : "subject-code");
  const [pidType, setPidType] = useState(given?.startsWith("id-type:") ? given.slice("id-type:".length) : "");
  const [subjects, setSubjects] = useState<Subjects | null>(d.subjects ?? null);
  const [folder, setFolder] = useState<FolderNaming>(d.copy_folder ?? "subject-code");
  const [types, setTypes] = useState<LinkageType[] | null>(null);
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const working = act.kind === "working";
  const anonymised = d.kind === "legacy" || stateOf(place, layout) === "anonymised";
  const patientId = patientIdOf(pidChoice, pidType);

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

  const save = () => {
    const body: DatasetFields = { ...(patientId !== null ? { patient_id: patientId } : {}), ...(anonymised && subjects !== null ? { subjects } : {}), copy_folder: folder };
    setAct({ kind: "working", phase: "saving", since: Date.now() });
    placesDoor
      .set(place.id, body)
      .then((answer: PlaceAnswer) => onDone(`${answer.name}: IDs set.`))
      .catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
  };

  const ready = !working && patientId !== null && (!anonymised || subjects !== null) && (folder !== "id-type" || pidChoice === "id-type");
  const writableTypes = types ? writable(types) : null;
  const foot = (
    <div className="row actions">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!ready} onClick={save}>
        Save
      </button>
    </div>
  );

  return (
    <Dialog title={`Set the IDs: ${place.name}`} icon="folder" onClose={onClose} foot={foot}>
      <div className="field">
        <span className="label">
          PatientID holds
          <Hint text={anonymised ? "What the files' PatientID is: the subject code, or a hospital or study ID." : "What NILS writes into PatientID when it pseudonymises."} />
        </span>
        <div className="choices" role="radiogroup" aria-label="PatientID holds">
          <Choice name="pid" checked={pidChoice === "subject-code"} disabled={working} onPick={() => setPidChoice("subject-code")} label="Subject code" />
          <Choice name="pid" checked={pidChoice === "id-type"} disabled={working} onPick={() => setPidChoice("id-type")} label="A hospital or study ID" />
        </div>
        {pidChoice === "id-type" && (
          <div className="field-row">
            {writableTypes && writableTypes.length > 0 ? (
              <div className="input">
                <select value={pidType} aria-label="Which hospital or study ID" disabled={working} onChange={(e) => setPidType(e.target.value)}>
                  {writableTypes.map((t) => (
                    <option key={t.name} value={t.name} title={t.description ?? undefined}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="input mono">
                <input value={pidType} placeholder="study-id" aria-label="Which hospital or study ID" spellCheck={false} disabled={working} onChange={(e) => setPidType(e.target.value)} />
              </div>
            )}
          </div>
        )}
      </div>
      {anonymised && (
        <div className="field">
          <span className="label">Subjects</span>
          <div className="choices" role="radiogroup" aria-label="Subjects">
            <Choice name="subjects" checked={subjects === "map"} disabled={working} onPick={() => setSubjects("map")} label="From a map" hint={layout?.settings?.subjects?.map ?? "a map of subject codes to the IDs; files with an ID no map names wait"} />
            <Choice name="subjects" checked={subjects === "generated"} disabled={working} onPick={() => setSubjects("generated")} label="Made from the ID" hint={layout?.settings?.subjects?.generated ?? "the subject code generator makes each code from the ID"} />
          </div>
        </div>
      )}
      <div className="field">
        <span className="label">Folder names</span>
        <div className="choices" role="radiogroup" aria-label="Folder names">
          <Choice name="folder" checked={folder === "subject-code"} disabled={working} onPick={() => setFolder("subject-code")} label="Subject code" />
          <Choice name="folder" checked={folder === "id-type"} disabled={working || pidChoice !== "id-type"} onPick={() => setFolder("id-type")} label="The ID" hint="Only when PatientID holds an ID." />
        </div>
      </div>
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
    </Dialog>
  );
}
