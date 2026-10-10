// SPDX-License-Identifier: AGPL-3.0-only
// Pseudonyms, under Data (Wave 7a, the design of 2026-10-09): what spans
// datasets, and nothing of one dataset alone. The ID types the site files its
// IDs under, with how many IDs and subjects each holds; a map given for every
// dataset at once, since a map once filed holds wherever the IDs arrive; and
// the subjects that may be one subject twice, which wait on Review. A
// dataset's own pseudonymisation is its step, opened in place on the Data
// page, and the address that named a page of it opens that step.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import { href } from "../routes";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import {
  csvRefusal,
  guessRole,
  importColumns,
  linkage,
  lookAt,
  mapRefusal,
  MAX_MAP_ROWS,
  reportOf,
  parseCsv,
  reportLines,
  typeName,
  type ColumnLook,
  type ColumnRole,
  type Csv,
  type Dataset,
  type Guess,
  type IdType,
  type ImportReport,
} from "./pseudonyms";

const n = (v: number) => v.toLocaleString("en-US");

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; types: IdType[] };

export function PseudonymsPage({ caps, onChanged }: { caps: Capabilities; onChanged?: () => void }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [opened, setOpened] = useState<"map" | "type" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const works = may(caps, "data:work");
  const maps = works && served(caps, "POST /api/linkage/imports");
  const makes = works && served(caps, "POST /api/linkage/types");

  const read = useCallback(() => {
    if (!served(caps, "GET /api/linkage/types")) return setLoad({ kind: "ready", types: [] });
    linkage
      .types()
      .then((r) => setLoad({ kind: "ready", types: r.types }))
      .catch((e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })));
  }, [caps]);
  useEffect(() => {
    read();
  }, [read]);

  const done = (words: string) => {
    setOpened(null);
    setSaid(words);
    read();
    onChanged?.();
  };
  const types = load.kind === "ready" ? load.types : [];

  return (
    <section className="data ps-page">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Pseudonyms</h1>
        </div>
        {makes && (
          <button type="button" className="button secondary" onClick={() => setOpened("type")}>
            Add an ID type
          </button>
        )}
        {maps && (
          <button type="button" className="button" onClick={() => setOpened("map")}>
            <Icon name="upload" />
            Give a map
          </button>
        )}
      </div>
      {said && <p className="meta">{said}</p>}
      <div className="dp-band-head">
        <span className="eyebrow">ID types</span>
        <span className="meta">what the IDs of every dataset are filed under</span>
      </div>
      {load.kind === "loading" && <Wait phase="reading the ID types" since={load.since} size="panel" />}
      {load.kind === "failed" && (
        <p className="warn">
          The ID types could not be read.
          <Hint text={load.why} />
        </p>
      )}
      {load.kind === "ready" && types.length === 0 && <p className="meta">No ID type yet.</p>}
      {types.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Type</th>
                <th>What it is</th>
                <th className="num">IDs</th>
                <th className="num">Subjects</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.name}>
                  <td className="path">{t.name}</td>
                  <td className="meta">{t.description ?? ""}</td>
                  <td className="num">{typeof t.identifiers === "number" ? n(t.identifiers) : ""}</td>
                  <td className="num">{typeof t.subjects === "number" ? n(t.subjects) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {may(caps, "review:see") && (
        <a className="tail" href={href("review", "identifiers")}>
          Subjects that may be one subject twice, on Review
          <Icon name="chevron-right" />
        </a>
      )}
      {opened === "map" && <MapDialog caps={caps} types={types} onClose={() => setOpened(null)} onFiled={done} />}
      {opened === "type" && <TypeDialog onClose={() => setOpened(null)} onMade={(name) => done(`${name} is an ID type.`)} />}
    </section>
  );
}

/** A new ID type: its name and, in a few words, what one of them is. */
function TypeDialog({ onClose, onMade }: { onClose: () => void; onMade: (name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const plain = typeName(name);
  const ready = plain !== "" && description.trim() !== "" && !saving;
  const save = () => {
    setSaving(true);
    setWhy(null);
    linkage
      .addType(plain, description.trim())
      .then(() => onMade(plain))
      .catch((e: unknown) => {
        setSaving(false);
        setWhy(messageOf(e));
      });
  };
  const foot = (
    <div className="row actions">
      <span className="grow" />
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={!ready} onClick={save}>
        Add
      </button>
    </div>
  );
  return (
    <Dialog title="Add an ID type" icon="key" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="type-name">
          Name
          <Hint text="Lower case letters, digits and hyphens, like study-id." />
        </label>
        <div className="input mono">
          <input id="type-name" value={name} placeholder="study-id" spellCheck={false} disabled={saving} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="type-description">
          What one is
        </label>
        <div className="input">
          <input id="type-description" value={description} placeholder="the number a study gives each participant" disabled={saving} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Provide a map */

type Rehearsal = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "report"; report: ImportReport } | { kind: "filed"; job: number } | { kind: "failed"; why: string };

interface Column {
  header: string;
  look: ColumnLook;
  guess: Guess;
  /** The first values under the header, as the file has them. */
  first: string[];
  /** The description of a new type, typed here. */
  description: string;
}

/** What a column can be, in the order the select offers them. The engine takes these four and no others. */
const ROLES: { value: ColumnRole; words: string }[] = [
  { value: "identifier", words: "an identifier" },
  { value: "canonical", words: "the number the code comes from" },
  { value: "code", words: "the code itself" },
  { value: "ignore", words: "not read" },
];

/** Whether a column of this role files under a type of the site's. */
function typed(role: ColumnRole): boolean {
  return role === "identifier" || role === "canonical";
}

/** The type a column files under, as the type select names it. */
function typeValue(g: Guess): string {
  return g.id_type !== null ? `type:${g.id_type}` : "new";
}

export function MapDialog({ caps, dataset, types, onClose, onFiled }: { caps: Capabilities; dataset?: Dataset; types: IdType[]; onClose: () => void; onFiled: (words: string) => void }) {
  const [file, setFile] = useState<{ name: string; csv: Csv } | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [rehearsal, setRehearsal] = useState<Rehearsal>({ kind: "idle" });
  const sensitive = sees(caps, "sensitive");
  const makesTypes = served(caps, "POST /api/linkage/types");

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setWhy(null);
    setRehearsal({ kind: "idle" });
    f.text()
      .then((text) => {
        const csv = parseCsv(text);
        // what the engine will not read is said here, before a row of it is posted anywhere
        const refused = csvRefusal(csv);
        if (refused !== null) {
          setFile(null);
          setColumns([]);
          setWhy(refused);
          return;
        }
        setFile({ name: f.name, csv });
        setColumns(
          csv.header.map((h, i) => {
            const values = csv.rows.map((r) => r[i] ?? "");
            const look = lookAt(h, values);
            return { header: h, look, guess: guessRole(h, look, types), first: values.filter((v) => v.trim() !== "").slice(0, 3), description: "" };
          }),
        );
      })
      .catch((err: unknown) => setWhy(messageOf(err)));
  };

  // a column changed, so what the rehearsal said no longer stands for these columns: it is asked again before anything can be filed
  const change = (i: number, patch: (c: Column) => Column) => {
    setRehearsal({ kind: "idle" });
    setColumns((was) => was.map((c, j) => (j === i ? patch(c) : c)));
  };

  const setRole = (i: number, role: ColumnRole) =>
    change(i, (c) => {
      if (!typed(role)) return { ...c, guess: { role, id_type: null, new_type: null } };
      if (c.guess.id_type !== null || c.guess.new_type !== null) return { ...c, guess: { ...c.guess, role } };
      const g = guessRole(c.header, c.look, types);
      return { ...c, guess: { role, id_type: g.id_type, new_type: g.new_type ?? (typeName(c.header) || "identifier") } };
    });

  const setType = (i: number, value: string) =>
    change(i, (c) =>
      value === "new" ? { ...c, guess: { ...c.guess, id_type: null, new_type: typeName(c.header) || "identifier" } } : { ...c, guess: { ...c.guess, id_type: value.slice(5), new_type: null } },
    );

  const guesses = columns.map((c) => c.guess);
  const refusal = columns.length > 0 ? mapRefusal(guesses) : null;
  const newTypes = columns.filter((c) => typed(c.guess.role) && c.guess.new_type !== null);
  const newTypeRefusal =
    newTypes.length === 0
      ? null
      : !makesTypes
        ? "This engine makes no new types; choose one the site already has."
        : newTypes.some((c) => c.description.trim() === "")
          ? "A new type is made with a description: say in a few words what one of them is."
          : null;
  // the types a column names that the site has not got are made by the import itself; without that word the engine refuses the whole file rather than reading it
  const body = (dryRun: boolean) => ({
    ...(dataset ? { place: dataset.name } : {}),
    columns: importColumns(columns.map((c) => c.header), guesses),
    rows: file?.csv.rows ?? [],
    dry_run: dryRun,
    make_types: newTypes.length > 0,
  });

  const rehearse = () => {
    setRehearsal({ kind: "working", phase: "rehearsing the map", since: Date.now() });
    linkage
      .import(body(true))
      .then((r) => setRehearsal({ kind: "report", report: reportOf(r) }))
      .catch((e: unknown) => setRehearsal({ kind: "failed", why: messageOf(e) }));
  };

  const apply = async () => {
    setRehearsal({ kind: "working", phase: "filing the map", since: Date.now() });
    try {
      for (const c of newTypes) await linkage.addType(c.guess.new_type!, c.description.trim());
      const r = await linkage.import(body(false));
      const job = typeof r.job === "number" ? r.job : null;
      setRehearsal({ kind: "filed", job: job ?? 0 });
      onFiled(job !== null ? `The map is filed as job ${job}; held files it names are pseudonymised and brought in after.` : "The map is filed.");
    } catch (e) {
      setRehearsal({ kind: "failed", why: messageOf(e) });
    }
  };

  const report = rehearsal.kind === "report" ? rehearsal.report : null;
  const conflicts = report === null ? 0 : report.conflicts.length;
  const working = rehearsal.kind === "working";
  const ready = file !== null && refusal === null && newTypeRefusal === null && !working;

  const foot = (
    <div className="row actions">
      <span className="meta grow">{sensitive ? "Read on this machine, posted once, and recorded as filed by you." : "Filing a map means reading identifiers, and you are not cleared to; the engine will refuse it."}</span>
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      {report === null ? (
        <button type="button" className="button" disabled={!ready} onClick={rehearse}>
          See what it will do
        </button>
      ) : (
        <button type="button" className="button" disabled={conflicts > 0 || working} onClick={apply}>
          File the map
        </button>
      )}
    </div>
  );

  return (
    <Dialog title={dataset ? `Provide a map for ${dataset.name}` : "Give a map"} icon="file" onClose={onClose} foot={foot}>
      <div className="mapsteps">
        <div className="field">
          <span className="label">1 &middot; The file</span>
          <div className="field-row">
            {file ? (
              <>
                <span className="chip">
                  <Icon name="file" />
                  {file.name}
                </span>
                <span className="meta">
                  {n(file.csv.rows.length)} rows &middot; {n(file.csv.header.length)} columns
                </span>
              </>
            ) : (
              <span className="meta">A CSV: commas, one header row naming the columns, and a row for each person or identifier.</span>
            )}
            <input type="file" accept=".csv,text/csv,text/plain" onChange={pick} aria-label="Choose a CSV" />
          </div>
          <span className="meta">Up to {n(MAX_MAP_ROWS)} rows at once. It is read here in the browser and posted once to the engine; nothing of it is kept on this machine.</span>
          {why && <p className="warn">{why}</p>}
        </div>

        {columns.length > 0 && (
          <div className="field">
            <span className="label">2 &middot; What each column is</span>
            <MapColumns columns={columns} types={types} working={working} onRole={setRole} onType={setType} onDescription={(i, text) => change(i, (x) => ({ ...x, description: text }))} />
            <span className="meta">
              Several identifier columns in one row are several identifiers of one person. One column at most is the code and one at most is the number the code comes from; the rest are identifiers or
              are not read. Every identifier column files under a type of the site&rsquo;s{types.length > 0 ? ` (${types.map((t) => t.name).join(", ")})` : ""}, or under a new one made here with a
              description.
            </span>
            {refusal && <p className="warn">{refusal}</p>}
            {!refusal && newTypeRefusal && <p className="warn">{newTypeRefusal}</p>}
          </div>
        )}

        {columns.length > 0 && (
          <div className="field">
            <span className="label">3 &middot; The rehearsal</span>
            {rehearsal.kind === "idle" && (
              <span className="meta">
                The engine reads the whole file and writes nothing: how many subjects it knows and how many are new, the identifiers it would file, the held files it would release, and every conflict.
                Nothing can be filed until it has run and come back clean.
              </span>
            )}
            {rehearsal.kind === "working" && <Wait phase={rehearsal.phase} since={rehearsal.since} />}
            {rehearsal.kind === "failed" && <p className="warn">{rehearsal.why}</p>}
            {report && (
              <>
                <dl className="facts">
                  {reportLines(report).map((l) => (
                    <div key={l.label} className="facts-pair">
                      <dt>{l.label}</dt>
                      <dd className={l.tone === "caution" ? "warn" : undefined}>{l.words}</dd>
                    </div>
                  ))}
                </dl>
                {conflicts > 0 && (
                  <div className="table-wrap">
                    <table className="thin">
                      <thead>
                        <tr>
                          <th className="num">Row</th>
                          <th>Conflict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.conflicts.slice(0, 50).map((c) => (
                          <tr key={`${c.row}-${c.why}`}>
                            <td className="num">{c.row}</td>
                            <td>{c.why}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {report.conflicts.length > 50 && <span className="meta">The first 50 of {n(report.conflicts.length)}.</span>}
                  </div>
                )}
                <span className="meta">
                  {conflicts > 0
                    ? "The map is read whole and applied whole: while one conflict stands, nothing at all is written. Mend those rows and rehearse it again."
                    : "The map is read whole and applied whole, so what is above is what will happen. Filing it queues the work; held files it names are pseudonymised and brought in after."}
                </span>
              </>
            )}
          </div>
        )}

        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-detail">
              The identifiers go to the sealed store beside the registry, never into the registry itself, and filing a map is recorded against you. From now on any of these identifiers arriving in any
              dataset lands on the same person, with no map at all.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The columns the file was found to have, each with the first values under it
 * and what it means. The roles are written out one by one rather than looped
 * over: a select whose children come out of a loop as a fragment is not laid
 * out as options everywhere, and a role the engine does not take would be a
 * refusal of the whole file.
 */
export function MapColumns({
  columns,
  types,
  working,
  onRole,
  onType,
  onDescription,
}: {
  columns: Column[];
  types: IdType[];
  working: boolean;
  onRole: (i: number, role: ColumnRole) => void;
  onType: (i: number, value: string) => void;
  onDescription: (i: number, text: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="thin map-cols">
        <thead>
          <tr>
            <th>Column</th>
            <th className="col-look">Looks like</th>
            <th>Means</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr key={c.header}>
              <td>
                <span className="path">{c.header}</span>
                <div className="col-first">{c.first.length > 0 ? c.first.join(", ") : "empty"}</div>
              </td>
              <td className="meta col-look">{c.look.words}</td>
              <td>
                <div className="column-role">
                  <div className="input">
                    <select value={c.guess.role} disabled={working} onChange={(e) => onRole(i, e.target.value as ColumnRole)} aria-label={`What ${c.header} means`}>
                      <option value="identifier">{ROLES[0].words}</option>
                      <option value="canonical">{ROLES[1].words}</option>
                      <option value="code">{ROLES[2].words}</option>
                      <option value="ignore">{ROLES[3].words}</option>
                    </select>
                  </div>
                  {typed(c.guess.role) && (
                    <div className="input">
                      <select value={typeValue(c.guess)} disabled={working} onChange={(e) => onType(i, e.target.value)} aria-label={`The type of ${c.header}`}>
                        {types.map((t) => (
                          <option key={t.name} value={`type:${t.name}`}>
                            of type {t.name}
                          </option>
                        ))}
                        <option value="new">a new type: {c.guess.new_type ?? (typeName(c.header) || "identifier")}</option>
                      </select>
                    </div>
                  )}
                  {typed(c.guess.role) && c.guess.new_type !== null && (
                    <div className="input">
                      <input
                        value={c.description}
                        placeholder={`What a ${c.guess.new_type} is`}
                        disabled={working}
                        aria-label={`Describe the type ${c.guess.new_type}`}
                        onChange={(e) => onDescription(i, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
