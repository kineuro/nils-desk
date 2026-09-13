// SPDX-License-Identifier: AGPL-3.0-only
// The Places page (Wave 5 section 10.2), as the chosen design draws it: every
// folder NILS reads or keeps data in, with its role, what was declared of it,
// what the engine measured and whether it stands up to its role. A place is
// added in a dialog, its folder typed or chosen by clicking through this
// machine's folders: a source is looked inside first, the engine is started
// again to read it where a service keeps it running, and its folders are
// digested. An opened place moves to another folder, has its guarantees
// changed, or is retired. The engine checks every rule again at its doors.
// The places read last are drawn at once, and read again when asked or
// after a change.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served, holds } from "../deployment";
import { FolderTable } from "../home/FolderTable";
import { digests, placeName, rows as rowsOf, type FolderRow, type Pack } from "../home/look";
import { objects, type Place } from "../objects/client";
import { placesKept } from "../objects/kept";
import { data } from "../ops/client";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { agoWords, useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { Acted, Head, messageOf, Stats, useActing } from "./common";
import { plainPath } from "./folders";
import { addFolderWords, keptRunning, reapplyByHand } from "./install";
import { fixedWords, knownFolders, movable, moveRefusal, moveWords } from "./move";
import { PathField } from "./PathField";
import {
  EMPTY,
  ROLE_WORDS,
  ROLES,
  addPlace,
  draftRefusal,
  freeWords,
  guaranteeLine,
  guaranteesOf,
  pathNote,
  placeState,
  roleCounts,
  wholeDigest,
  type PlaceDraft,
  type Role,
  type Tone,
} from "./places";
import { placeStats } from "./stats";
import { followRun, supervise, type Install } from "./supervise";

type Opened = { kind: "add" } | { kind: "change"; place: Place } | null;

function Tag({ tone, words }: { tone: Tone; words: string }) {
  return <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>{words}</span>;
}

export function PlacesPage({ caps, install, onChanged }: { caps: Capabilities; install: Install | null; onChanged: () => void }) {
  const kept = useKept(placesKept);
  const places = kept.value?.places ?? null;
  const enforced = kept.value?.enforced ?? true;
  const [role, setRole] = useState<Role | null>(null);
  const [opened, setOpened] = useState<Opened>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const measure = useActing();
  const operator = holds(caps, "operator");
  const containers = install !== null && (install.runtime === "docker" || install.runtime === "podman");

  useEffect(() => {
    placesKept.ensure();
    if (served(caps, "GET /api/packs"))
      data
        .packs()
        .then((p) => setPacks(p.packs))
        .catch(() => setPacks([]));
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; a change reads again
  }, []);

  const readAgain = () => void placesKept.refresh().catch(() => undefined);
  const shown = (places ?? []).filter((p) => role === null || p.role === role);
  const done = () => {
    setOpened(null);
    readAgain();
    onChanged();
  };
  const failed = kept.error ? messageOf(kept.error) : null;

  return (
    <div className="settings">
      <div className="places-head">
        <Head title="Places" lede="Every folder NILS reads or keeps data in, with its role." />
        {operator && (
          <button type="button" className="button" onClick={() => setOpened({ kind: "add" })}>
            <Icon name="plus" />
            Add a place
          </button>
        )}
      </div>
      {failed && places === null && <p className="warn">{failed}</p>}
      {places === null && !failed && <Wait phase="reading the places" since={since} />}
      {places !== null && (
        <>
          <Stats items={placeStats(places, containers)} />
          <div className="row places-bar">
            {places.length > 0 && (
              <div className="chips" role="group" aria-label="show the places of one role">
                <button type="button" className={role === null ? "tag brand" : "tag"} aria-pressed={role === null} onClick={() => setRole(null)}>
                  all {places.length}
                </button>
                {roleCounts(places).map((r) => (
                  <button key={r.role} type="button" className={role === r.role ? "tag brand" : "tag"} aria-pressed={role === r.role} onClick={() => setRole(role === r.role ? null : r.role)}>
                    {r.role} {r.count}
                  </button>
                ))}
              </div>
            )}
            <span className="kept-at">
              <span className="meta">{kept.reading ? "reading them again" : kept.at !== null ? `read ${agoWords(kept.at, now)}` : ""}</span>
              <button type="button" className="icon-button" title="Read the places again" aria-label="Read the places again" disabled={kept.reading} onClick={readAgain}>
                <Icon name="restart" />
              </button>
            </span>
          </div>
          {failed && <p className="warn">Reading them again failed: {failed}</p>}
          <div className="table-wrap">
            <table className="thin places">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Role</th>
                  <th>Path</th>
                  <th>Guarantees</th>
                  <th className="num">Free</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {places.length === 0 && (
                  <tr>
                    <td colSpan={6} className="meta">
                      No place is declared yet.
                    </td>
                  </tr>
                )}
                {shown.map((p) => {
                  const note = pathNote(p);
                  const open = () => operator && setOpened({ kind: "change", place: p });
                  return (
                    <tr
                      key={p.id}
                      className={operator ? "openable" : undefined}
                      tabIndex={operator ? 0 : undefined}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") open();
                      }}
                    >
                      <td>
                        <b>{p.name}</b>
                        <div className="meta place-path">{p.path}</div>
                      </td>
                      <td>
                        <span className="tag">{p.role}</span>
                      </td>
                      <td>
                        <span className="path">{p.path}</span>
                        {note && <div className="meta">{note}</div>}
                      </td>
                      <td className="meta">{guaranteeLine(p, places)}</td>
                      <td className="num">{freeWords(p)}</td>
                      <td>
                        <Tag {...placeState(p, places, containers)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="note">
            <Icon name="info" />
            <div className="note-body">
              <p className="note-detail">
                Nothing is written under a source. A release goes only to an export place. The registry needs a backup place on other storage. Guarantees are yours to declare; NILS measures what it can.
                {!enforced && " No place is declared yet, so no rule is enforced; the first place declared starts them."}
              </p>
            </div>
          </div>
          <div className="row actions">
            <button
              type="button"
              className="button secondary small"
              disabled={measure.working}
              onClick={() => measure.act("measuring every place again", () => placesKept.refresh(() => objects.places(true)).then(() => "Every place is measured again."))}
            >
              Measure again
            </button>
            <Acted acting={measure.acting} />
          </div>
        </>
      )}
      {opened?.kind === "add" && places !== null && <AddDialog caps={caps} install={install} places={places} packs={packs} onClose={() => setOpened(null)} onDone={done} />}
      {opened?.kind === "change" && places !== null && <ChangeDialog caps={caps} install={install} place={opened.place} places={places} onClose={() => setOpened(null)} onDone={done} />}
    </div>
  );
}

type Seen = { kind: "idle" } | { kind: "looking"; since: number } | { kind: "seen"; rows: FolderRow[]; partial: boolean } | { kind: "failed"; why: string };
type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

function AddDialog(props: { caps: Capabilities; install: Install | null; places: Place[]; packs: Pack[]; onClose: () => void; onDone: () => void }) {
  const { caps, install, places, packs, onClose, onDone } = props;
  const [d, setD] = useState<PlaceDraft>(EMPTY);
  const [named, setNamed] = useState(false);
  const [seen, setSeen] = useState<Seen>({ kind: "idle" });
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [act, setAct] = useState<Act>({ kind: "idle" });
  const folder = d.path.trim().replace(/\/+$/, "");
  const name = named ? d.name : folder ? placeName(folder, places.map((p) => p.name)) : "";
  const draft = { ...d, path: folder, name };
  const refusal = draftRefusal(draft, places);
  const source = d.role === "source";
  const supervised = install !== null && holds(caps, "admin");
  const restarts = source && supervised && install !== null && keptRunning(install);
  const working = act.kind === "working";
  const backups = places.filter((p) => p.role === "backup" && p.retired_at === null);
  const chosen = seen.kind === "seen" ? seen.rows.filter((r) => r.dicom && ticked.has(r.name)) : [];
  const words = source && install ? addFolderWords(install) : null;

  const look = () => {
    if (!folder.startsWith("/") || !supervised) return;
    setSeen({ kind: "looking", since: Date.now() });
    supervise
      .look(folder)
      .then((l) => {
        if (!l.exists) return setSeen({ kind: "failed", why: "Nothing is there on this machine." });
        if (!l.directory) return setSeen({ kind: "failed", why: "That is a file, not a folder." });
        if (!l.readable) return setSeen({ kind: "failed", why: "The folder is there, and this account cannot read it." });
        const rows = rowsOf(l, packs);
        setTicked(new Set(rows.filter((r) => r.dicom).map((r) => r.name)));
        setSeen({ kind: "seen", rows, partial: l.partial });
      })
      .catch((e: unknown) => setSeen({ kind: "failed", why: messageOf(e) }));
  };

  const add = () => {
    if (refusal) return;
    const queue = !restarts || seen.kind !== "seen" ? [] : d.each ? digests(name, chosen) : chosen.length > 0 ? [wholeDigest(name)] : [];
    const say = (phase: string) => setAct({ kind: "working", phase, since: Date.now() });
    addPlace({ name, role: d.role, path: folder, guarantees: guaranteesOf(draft), restart: restarts, digests: queue }, say)
      .then((words) => {
        setAct({ kind: "done", words });
        onDone();
      })
      .catch((e: unknown) => setAct({ kind: "failed", why: messageOf(e) }));
  };

  const check = (key: keyof PlaceDraft["guarantees"], label: string) => (
    <label className="choice">
      <input type="checkbox" checked={d.guarantees[key]} disabled={working} onChange={(e) => setD({ ...d, guarantees: { ...d.guarantees, [key]: e.target.checked } })} />
      {label}
    </label>
  );

  const foot = (
    <>
      {words && install && (
        <div className="note">
          <Icon name="restart" />
          <div className="note-body">
            <p className="note-lead">{words.lead}</p>
            <p className="note-detail">{words.detail}</p>
            <Command text={reapplyByHand(install)} />
          </div>
        </div>
      )}
      {act.kind === "working" && <Wait phase={act.phase} since={act.since} />}
      {act.kind === "failed" && <p className="warn">{act.why}</p>}
      {refusal && (folder || named) && <p className="warn">{refusal}</p>}
      <div className="row actions">
        <button type="button" className="button" disabled={refusal !== null || working} onClick={add}>
          {restarts ? "Add and restart the engine" : "Add the place"}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={source ? "Add a source" : `Add a ${d.role} place`} icon="folder" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="place-role">
          Role
        </label>
        <div className="input">
          <select id="place-role" value={d.role} disabled={working} onChange={(e) => setD({ ...d, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <span className="meta">
          Holds {ROLE_WORDS[d.role].holds}; must have {ROLE_WORDS[d.role].must}.
        </span>
      </div>
      <div className="field">
        <label className="label" htmlFor="place-path">
          Folder
        </label>
        <div className="row path-row">
          <PathField
            id="place-path"
            value={d.path}
            placeholder="/srv/imaging/2026-cohort"
            disabled={working}
            browse={supervised}
            known={knownFolders(places, install?.dir ?? null)}
            onChange={(path) => {
              setD({ ...d, path });
              setSeen({ kind: "idle" });
            }}
            onEnter={() => source && look()}
          />
          {source && supervised && (
            <button type="button" className="button secondary" disabled={!folder.startsWith("/") || seen.kind === "looking" || working} onClick={look}>
              Look inside
            </button>
          )}
        </div>
        {source && <span className="meta">{supervised ? "NILS looks inside before anything changes." : "The supervisor on this host looks inside a folder for an admin."}</span>}
      </div>
      <div className="field">
        <label className="label" htmlFor="place-name">
          Name
        </label>
        <div className="input mono">
          <input
            id="place-name"
            value={name}
            spellCheck={false}
            disabled={working}
            onChange={(e) => {
              setNamed(true);
              setD({ ...d, name: e.target.value });
            }}
          />
        </div>
      </div>
      {seen.kind === "looking" && <Wait phase="looking inside the folder" since={seen.since} />}
      {seen.kind === "failed" && <p className="warn">{seen.why}</p>}
      {seen.kind === "seen" && source && (
        <>
          <div className="field">
            <span className="label">How to digest it</span>
            <div className="choices" role="radiogroup">
              <label className="choice">
                <input type="radio" name="digest-how" checked={d.each} disabled={working} onChange={() => setD({ ...d, each: true })} />A batch for each folder inside, each with its own rules
              </label>
              <label className="choice">
                <input type="radio" name="digest-how" checked={!d.each} disabled={working} onChange={() => setD({ ...d, each: false })} />
                One batch for the whole folder
              </label>
            </div>
            {!restarts && <span className="meta">The digests are queued once the engine reads the folder, which it does once it starts again.</span>}
          </div>
          <FolderTable
            rows={seen.rows}
            ticked={ticked}
            disabled={working}
            ticks={d.each}
            onToggle={(n) =>
              setTicked((t) => {
                const next = new Set(t);
                if (next.has(n)) next.delete(n);
                else next.add(n);
                return next;
              })
            }
          />
          {seen.partial && <p className="meta">The look stopped before the end, so some folders are not listed.</p>}
        </>
      )}
      {d.role === "registry" && (
        <div className="field">
          <label className="label" htmlFor="place-backup">
            Its backup place
          </label>
          <div className="input">
            <select id="place-backup" value={d.backup ?? ""} disabled={working} onChange={(e) => setD({ ...d, backup: e.target.value || null })}>
              <option value="">Choose a backup place</option>
              {backups.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}, {b.path}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="field">
        <span className="label">What this storage guarantees</span>
        <div className="checks">
          {check("snapshots", "Snapshots")}
          {check("protected", "Protected")}
          {check("fast", "Fast")}
        </div>
      </div>
      {act.kind === "done" && <p className="ok-words">{act.words}</p>}
    </Dialog>
  );
}

function ChangeDialog(props: { caps: Capabilities; install: Install | null; place: Place; places: Place[]; onClose: () => void; onDone: () => void }) {
  const { caps, install, place, places, onClose, onDone } = props;
  const said = (k: string) => place.guarantees?.[k] === true;
  const [g, setG] = useState({ snapshots: said("snapshots"), protected: said("protected"), fast: said("fast") });
  const [backup, setBackup] = useState<string | null>(typeof place.guarantees?.["backup"] === "string" ? (place.guarantees["backup"] as string) : null);
  const [retiring, setRetiring] = useState(false);
  const [moving, setMoving] = useState(false);
  const [to, setTo] = useState(place.path);
  const saving = useActing();
  const retired = place.retired_at !== null;
  const probed = place.probed ?? {};
  const backups = places.filter((p) => p.role === "backup" && p.retired_at === null && p.id !== place.id);
  const supervised = install !== null && holds(caps, "admin");
  // a source moved is read at its new folder once the engine starts again, which the supervisor does where a service keeps it running
  const restarts = place.role === "source" && supervised && install !== null && keptRunning(install);
  const guaranteesChanged = g.snapshots !== said("snapshots") || g.protected !== said("protected") || g.fast !== said("fast") || (place.role === "registry" && backup !== (place.guarantees?.["backup"] ?? null));
  const target = moving ? plainPath(to) : null;
  const refusal = moving ? moveRefusal(to, place, places) : null;
  const moves = moving && target !== null && refusal === null;

  const save = () =>
    saving.act(moves ? `moving ${place.name}` : `changing ${place.name}`, async () => {
      await objects.placeSet(place.id, {
        ...(moves && target ? { path: target } : {}),
        ...(guaranteesChanged ? { guarantees: { ...place.guarantees, ...g, backup: place.role === "registry" ? backup : (place.guarantees?.["backup"] ?? null) } } : {}),
      });
      if (moves && restarts) {
        const run = await supervise.reapply("engine");
        const ended = await followRun(run.id, () => undefined);
        if (ended === null || ended.state !== "done") {
          void placesKept.refresh().catch(() => undefined);
          if (ended === null) throw new Error(`${place.name} is in ${target} now; the engine is still starting, so look again in a moment.`);
          throw new Error(`${place.name} is in ${target} now, and the engine did not start again: ${ended.tail?.slice(-1)[0] ?? ended.state}`);
        }
      }
      onDone();
      if (!moves) return `${place.name} is changed.`;
      if (place.role !== "source" || restarts) return `${place.name} is in ${target} now.`;
      return `${place.name} is in ${target} now; the engine reads it there once it starts again.`;
    });

  const retire = () =>
    saving.act(`retiring ${place.name}`, async () => {
      await objects.placeSet(place.id, { retired: true });
      onDone();
      return `${place.name} is retired.`;
    });

  const fixed = fixedWords(place.role);
  const foot = (
    <>
      <Acted acting={saving.acting} />
      {!retired && (
        <div className="row actions">
          <button type="button" className="button" disabled={(!guaranteesChanged && !moves) || (moving && refusal !== null && to.trim() !== place.path) || saving.working} onClick={save}>
            {moves ? (restarts ? "Move it and restart the engine" : "Move it") : "Save"}
          </button>
          {retiring ? (
            <>
              <button type="button" className="button secondary" disabled={saving.working} onClick={retire}>
                Retire {place.name}
              </button>
              <span className="meta">Nothing more is written to it; what it holds stays where it is.</span>
            </>
          ) : (
            <button type="button" className="button quiet" disabled={saving.working} onClick={() => setRetiring(true)}>
              Retire it
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <Dialog title={place.name} icon="pencil" onClose={onClose} foot={foot}>
      <dl className="facts">
        <dt>role</dt>
        <dd>{place.role}</dd>
        <dt>holds</dt>
        <dd>{ROLE_WORDS[place.role].holds}</dd>
        <dt>must have</dt>
        <dd>{ROLE_WORDS[place.role].must}</dd>
        {retired && (
          <>
            <dt>path</dt>
            <dd>
              <span className="path">{place.path}</span>
            </dd>
          </>
        )}
        {typeof probed["free_bytes"] === "number" && (
          <>
            <dt>free</dt>
            <dd>{freeWords(place)}</dd>
          </>
        )}
        {typeof probed["mount"] === "string" && (
          <>
            <dt>on the disk at</dt>
            <dd>
              <span className="path">{probed["mount"] as string}</span>
            </dd>
          </>
        )}
        {typeof probed["writable"] === "boolean" && (
          <>
            <dt>writable</dt>
            <dd>{probed["writable"] ? "yes" : "no"}</dd>
          </>
        )}
        {retired && (
          <>
            <dt>retired</dt>
            <dd>{place.retired_at}</dd>
          </>
        )}
      </dl>
      {!retired && (
        <>
          <div className="field">
            <span className="label">Folder</span>
            {moving ? (
              <PathField
                value={to}
                onChange={setTo}
                label="The folder to move it to"
                disabled={saving.working}
                browse={supervised}
                known={knownFolders(places, install?.dir ?? null).filter((k) => k.path !== place.path)}
              />
            ) : (
              <div className="row folder-now">
                <span className="path grow">{place.path}</span>
                {movable(place.role) && (
                  <button type="button" className="button secondary small" disabled={saving.working} onClick={() => setMoving(true)}>
                    Move to another folder
                  </button>
                )}
              </div>
            )}
            {moving && <span className={refusal && to.trim() !== place.path ? "warn" : "meta"}>{refusal && to.trim() !== place.path ? refusal : moveWords(place.role)}</span>}
            {moving && restarts && <span className="meta">Moving it starts the engine again; the desk, the gateway and the assistant keep running.</span>}
            {!moving && fixed && <span className="meta">{fixed}</span>}
          </div>
          {place.role === "registry" && (
            <div className="field">
              <label className="label" htmlFor="change-backup">
                Its backup place
              </label>
              <div className="input">
                <select id="change-backup" value={backup ?? ""} disabled={saving.working} onChange={(e) => setBackup(e.target.value || null)}>
                  <option value="">None</option>
                  {backups.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}, {b.path}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="field">
            <span className="label">What this storage guarantees</span>
            <div className="checks">
              {(["snapshots", "protected", "fast"] as const).map((k) => (
                <label key={k} className="choice">
                  <input type="checkbox" checked={g[k]} disabled={saving.working} onChange={(e) => setG({ ...g, [k]: e.target.checked })} />
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </label>
              ))}
            </div>
            <span className="meta">Guarantees are yours to declare; NILS measures what it can.</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
