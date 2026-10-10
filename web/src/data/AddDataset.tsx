// SPDX-License-Identifier: AGPL-3.0-only
// Add a dataset (Wave 7a, the tries of 2026-10-08): a finder, never a list
// of every folder, since a root may hold thousands. Pick the root (skipped
// when there is one), type part of a folder's name or browse, fifty at a
// time; pick one folder, and NILS looks inside it once: whether it holds
// DICOM, its two folders, and the state the dataset would get. One Add
// button; a folder with no DICOM asks "Add anyway?" first. Anonymised data
// says its IDs on the way in (record 55): what PatientID holds and how
// subjects are found, one select each, set to the subject code and made
// from the ID, so it is read as soon as it is added. Identified data asks the
// one question that decides its pseudonymise step (the design of
// 2026-10-09): what its PatientID holds, a personnummer, which the key codes
// with no map, or an ID of a type, whose codes a map gives. Without a root
// yet, the root's own form stands here instead.

import { useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import { messageOf } from "../settings/common";
import type { Install } from "../settings/supervise";
import { door as served } from "../deployment";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Wait } from "../ui/Wait";
import { RootForm } from "./AddRoot";
import { linkage, type IdentityRule, type LinkageType, type Subjects } from "./datasets";
import { writable } from "./FinishDataset";
import { plainError } from "./plain";
import { typeName } from "./pseudonyms";
import { asksIdentity, asksIds, dicomWord, roots as rootsDoor, rootsOf, wouldBe, type FolderLook, type RootFolder } from "./steps";

type Found = { kind: "idle" } | { kind: "looking" } | { kind: "found"; folders: RootFolder[]; count: number; next: string | null } | { kind: "failed"; why: string };
type Seen = { kind: "looking"; name: string } | { kind: "seen"; look: FolderLook } | { kind: "failed"; name: string; why: string };

/** What a folder holds, in a few short facts. */
function seenFacts(l: FolderLook): { k: string; v: string }[] {
  const out = [{ k: "DICOM", v: dicomWord(l) }];
  if (l.layout) {
    out.push({ k: "identified folder", v: l.layout.originals ? "yes" : "no" });
    out.push({ k: "anonymised folder", v: l.layout.anon || l.layout.raw ? "yes" : "no" });
    const loose = l.layout.loose_dicom?.length ?? 0;
    if (loose > 0) out.push({ k: "loose with DICOM", v: loose.toLocaleString("en-US") });
  }
  const word = wouldBe(l.layout?.state);
  if (word) out.push({ k: "would be", v: word });
  return out;
}

/** A refusal as one plain line, the engine's words behind a "?". */
function Refused({ why }: { why: string }) {
  return (
    <p className="warn">
      {plainError(why).words}
      <Hint text={why} />
    </p>
  );
}

export function AddDataset(props: { caps: Capabilities; install: Install | null; places: Place[]; onClose: () => void; onDone: (words: string) => void }) {
  const { caps, install, places, onClose, onDone } = props;
  const all = rootsOf(places);
  const [rootId, setRootId] = useState<number | null>(all[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found>({ kind: "idle" });
  const [seen, setSeen] = useState<Seen | null>(null);
  const [anyway, setAnyway] = useState(false);
  const [adding, setAdding] = useState<{ since: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  /** What PatientID holds (`subject-code` or `id-type:<name>`) and how subjects are found, for anonymised data. */
  const [patientId, setPatientId] = useState("subject-code");
  const [subjects, setSubjects] = useState<Subjects>("generated");
  const [types, setTypes] = useState<LinkageType[]>([]);
  /** What an identified folder's PatientID holds: a personnummer, or an ID of a type; asked, never assumed. */
  const [holds, setHolds] = useState<"personnummer" | "type" | null>(null);
  const [holdsType, setHoldsType] = useState("");
  const asked = useRef(0);
  const root = all.find((r) => r.id === rootId) ?? null;

  const search = (text: string, after: string | null = null) => {
    if (!root) return;
    const mine = ++asked.current;
    if (!after) setFound({ kind: "looking" });
    rootsDoor.folders(root.id, text.trim(), after).then(
      (r) => {
        if (asked.current !== mine) return;
        setFound((was) => ({ kind: "found", folders: after && was.kind === "found" ? [...was.folders, ...r.folders] : r.folders, count: r.matching ?? r.count, next: r.next }));
      },
      (e: unknown) => asked.current === mine && setFound({ kind: "failed", why: messageOf(e) }),
    );
  };

  // typing searches, a moment after the last key
  useEffect(() => {
    if (q.trim() === "") return;
    const t = setTimeout(() => search(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the words typed are what search
  }, [q, rootId]);

  // the ID types a PatientID may hold, beside the subject code, once
  useEffect(() => {
    if (!served(caps, "GET /api/linkage/types")) return;
    let alive = true;
    linkage
      .types()
      .then((r) => {
        if (!alive) return;
        setTypes(writable(r.types));
        setHoldsType((t) => t || (writable(r.types)[0]?.name ?? ""));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  // the folder looked at last is the one shown: a look at another folder that answers late is let go
  const looks = useRef(0);
  const pick = (f: RootFolder) => {
    if (!root) return;
    setAnyway(false);
    setWhy(null);
    setSeen({ kind: "looking", name: f.name });
    const mine = ++looks.current;
    rootsDoor.folder(root.id, f.name).then(
      (look) => mine === looks.current && setSeen({ kind: "seen", look }),
      (e: unknown) => mine === looks.current && setSeen({ kind: "failed", name: f.name, why: messageOf(e) }),
    );
  };

  const add = () => {
    if (!root || seen?.kind !== "seen") return;
    if (seen.look.holds_dicom === "no" && !anyway) return setAnyway(true);
    setAdding({ since: Date.now() });
    setWhy(null);
    const ids = asksIds(seen.look) ? { patient_id: patientId, subjects } : asksIdentity(seen.look) && identity !== null ? { identity } : {};
    rootsDoor.addDataset(root.name, seen.look.name, ids).then(
      (d) => onDone(`${d.name} is a dataset.`),
      (e: unknown) => {
        setAdding(null);
        setWhy(messageOf(e));
      },
    );
  };

  const look = seen?.kind === "seen" ? seen.look : null;
  // the rule the identified folder's originals are read under: PatientID, as what the person said it holds
  const identity: IdentityRule | null =
    holds === "personnummer" ? { id_type: "personnummer", from: [{ field: "PatientID" }] } : holds === "type" && typeName(holdsType) !== "" ? { id_type: typeName(holdsType), from: [{ field: "PatientID" }] } : null;
  const unanswered = look !== null && !look.added && asksIdentity(look) && identity === null;
  const foot = look ? (
    <div className="row actions">
      <button type="button" className="button secondary" disabled={adding !== null} onClick={() => (anyway ? setAnyway(false) : setSeen(null))}>
        Back
      </button>
      {!look.added && (
        <button type="button" className="button" disabled={adding !== null || unanswered} onClick={add}>
          {anyway ? "Add anyway" : "Add"}
        </button>
      )}
    </div>
  ) : seen ? (
    // a folder still being looked at, or one that could not be: back to the folders
    <div className="row actions">
      <button type="button" className="button secondary" onClick={() => setSeen(null)}>
        Back
      </button>
    </div>
  ) : (
    <div className="row actions">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <Dialog title="Add a dataset" icon="folder" onClose={onClose} foot={foot}>
      {all.length === 0 ? (
        <RootForm caps={caps} install={install} places={places} onAdded={onDone} />
      ) : seen ? (
        <div className="field">
          <span className="label">{seen.kind === "seen" ? seen.look.name : seen.name}</span>
          {seen.kind === "looking" && <Wait phase="looking inside the folder" since={Date.now()} />}
          {seen.kind === "failed" && <Refused why={seen.why} />}
          {look && (
            <>
              <span className="meta path">{look.path}</span>
              <div className="values">
                {seenFacts(look).map((c) => (
                  <div key={c.k}>
                    <span className="k">{c.k}</span>
                    <span className="v">{c.v}</span>
                  </div>
                ))}
              </div>
              {!look.added && asksIds(look) && (
                <>
                  <div className="field">
                    <label className="label" htmlFor="dataset-patient-id">
                      PatientID holds
                      <Hint text="What the files' PatientID is: the subject code, or an ID such as a study number." />
                    </label>
                    <div className="input">
                      <select id="dataset-patient-id" value={patientId} disabled={adding !== null} onChange={(e) => setPatientId(e.target.value)}>
                        <option value="subject-code">Subject code</option>
                        {types.map((t) => (
                          <option key={t.name} value={`id-type:${t.name}`}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="dataset-subjects">
                      Subjects
                      <Hint text={look.layout?.settings?.subjects ? `Made from the ID: ${look.layout.settings.subjects.generated}. From a map: ${look.layout.settings.subjects.map}.` : "Made from the ID, or from a map of subject codes to the IDs."} />
                    </label>
                    <div className="input">
                      <select id="dataset-subjects" value={subjects} disabled={adding !== null} onChange={(e) => setSubjects(e.target.value as Subjects)}>
                        <option value="generated">Made from the ID</option>
                        <option value="map">From a map</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              {!look.added && asksIdentity(look) && (
                <div className="field">
                  <span className="label">
                    PatientID holds
                    <Hint text="What the files' PatientID is. A personnummer is coded by the key, with no map. An ID such as a study ID gets its code from a map, or a generated one." />
                  </span>
                  <div className="choices" role="radiogroup" aria-label="PatientID holds">
                    <label className="radio-row">
                      <input type="radio" name="dataset-holds" checked={holds === "personnummer"} disabled={adding !== null} onChange={() => setHolds("personnummer")} />
                      <span>
                        <b>A personnummer</b>
                        <Hint text="Coded by the key: no map, no step to wait on." />
                      </span>
                    </label>
                    <label className="radio-row">
                      <input type="radio" name="dataset-holds" checked={holds === "type"} disabled={adding !== null} onChange={() => setHolds("type")} />
                      <span>
                        <b>An ID</b>
                        <Hint text="Its codes come from a map of ID and subject code, given on the dataset's pseudonymise step." />
                      </span>
                    </label>
                  </div>
                  {holds === "type" && (
                    <div className="field-row">
                      {types.length > 0 ? (
                        <div className="input">
                          <select value={holdsType} aria-label="Which ID" disabled={adding !== null} onChange={(e) => setHoldsType(e.target.value)}>
                            {types.map((t) => (
                              <option key={t.name} value={t.name} title={t.description ?? undefined}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="input mono">
                          <input value={holdsType} placeholder="study-id" aria-label="Which ID" spellCheck={false} disabled={adding !== null} onChange={(e) => setHoldsType(e.target.value)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {look.added && <p className="meta">Already a dataset.</p>}
              {!look.added && look.holds_dicom === "no" && <p className="warn">{anyway ? "No DICOM found here. Add anyway?" : "No DICOM found here."}</p>}
            </>
          )}
          {adding && <Wait phase="adding" since={adding.since} />}
          {why && <Refused why={why} />}
        </div>
      ) : (
        <>
          {all.length > 1 && (
            <div className="field">
              <label className="label" htmlFor="dataset-root">
                Root folder
              </label>
              <div className="input">
                <select
                  id="dataset-root"
                  value={rootId ?? ""}
                  onChange={(e) => {
                    setRootId(Number(e.target.value));
                    setFound({ kind: "idle" });
                  }}
                >
                  {all.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="field-row">
            <div className="input grow">
              <input id="dataset-find" type="search" value={q} placeholder="Part of the folder's name" aria-label="Find a folder" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setQ("");
                search("");
              }}
            >
              Browse
            </button>
          </div>
          {found.kind === "looking" && <Wait phase="finding folders" since={Date.now()} />}
          {found.kind === "failed" && <Refused why={found.why} />}
          {found.kind === "found" && found.folders.length === 0 && <p className="meta">No folder found.</p>}
          {found.kind === "found" && found.folders.length > 0 && (
            <ul className="folder-results" aria-label="Folders found">
              {found.folders.map((f) => (
                <li key={f.path}>
                  <button type="button" className="link-button" onClick={() => pick(f)}>
                    {f.name}
                  </button>
                  {f.added && <span className="tag ok">dataset</span>}
                </li>
              ))}
            </ul>
          )}
          {found.kind === "found" && found.next && (
            <button type="button" className="button quiet small" onClick={() => search(q, found.next)}>
              More ({found.count.toLocaleString("en-US")} in all)
            </button>
          )}
        </>
      )}
    </Dialog>
  );
}
