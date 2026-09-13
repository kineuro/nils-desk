// SPDX-License-Identifier: AGPL-3.0-only
// The Places page (Wave 5 section 10.2), as the chosen design draws it: every
// folder NILS reads or keeps data in, with its role, what was declared of it,
// what the engine measured and whether it stands up to its role. A place is
// added in a drawer; a source is looked inside first, the engine is started
// again to read it where a service keeps it running, and its folders are
// digested. An opened place has its guarantees changed or is retired. The
// engine checks every rule again at its doors.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served, holds } from "../deployment";
import { FolderTable } from "../home/FolderTable";
import { digests, placeName, rows as rowsOf, type FolderRow, type Pack } from "../home/look";
import { objects, type Place } from "../objects/client";
import { data } from "../ops/client";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { Acted, Head, messageOf, useActing } from "./common";
import { addFolderWords, keptRunning, reapplyByHand } from "./install";
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
import { supervise, type Install } from "./supervise";

type Drawer = { kind: "add" } | { kind: "change"; place: Place } | null;

function Tag({ tone, words }: { tone: Tone; words: string }) {
  return <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>{words}</span>;
}

export function PlacesPage({ caps, install, onChanged }: { caps: Capabilities; install: Install | null; onChanged: () => void }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [enforced, setEnforced] = useState(true);
  const [why, setWhy] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const measure = useActing();
  const operator = holds(caps, "operator");
  const containers = install !== null && (install.runtime === "docker" || install.runtime === "podman");

  const load = (probe = false) =>
    objects
      .places(probe)
      .then((d) => {
        setPlaces(d.places);
        setEnforced(d.enforced ?? true);
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(messageOf(e)));

  useEffect(() => {
    void load();
    if (served(caps, "GET /api/packs"))
      data
        .packs()
        .then((p) => setPacks(p.packs))
        .catch(() => setPacks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; a change reads again
  }, []);

  const shown = (places ?? []).filter((p) => role === null || p.role === role);
  const done = () => {
    setDrawer(null);
    void load();
    onChanged();
  };

  return (
    <div className="settings">
      <div className="places-head">
        <Head title="Places" lede="Every folder NILS reads or keeps data in is a place with a role, and the rules are checked on every write." />
        {operator && (
          <button type="button" className="button" onClick={() => setDrawer({ kind: "add" })}>
            <Icon name="plus" />
            Add a place
          </button>
        )}
      </div>
      {why && <p className="warn">{why}</p>}
      {places === null && !why && <Wait phase="reading the places" since={Date.now()} />}
      {places !== null && (
        <>
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
                  const open = () => operator && setDrawer({ kind: "change", place: p });
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
            <button type="button" className="button secondary small" disabled={measure.working} onClick={() => measure.act("measuring every place again", () => load(true).then(() => "Every place is measured again."))}>
              Measure again
            </button>
            <Acted acting={measure.acting} />
          </div>
        </>
      )}
      {drawer?.kind === "add" && places !== null && <AddDrawer caps={caps} install={install} places={places} packs={packs} onClose={() => setDrawer(null)} onDone={done} />}
      {drawer?.kind === "change" && places !== null && <ChangeDrawer place={drawer.place} places={places} onClose={() => setDrawer(null)} onDone={done} />}
    </div>
  );
}

/** A drawer over the page: its head, what it asks, and its buttons; Escape closes it. */
function DrawerFrame(props: { title: string; icon: "folder" | "pencil"; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  const { title, icon, onClose, children, foot } = props;
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <Icon name={icon} size="lg" />
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        <div className="drawer-foot">{foot}</div>
      </aside>
    </>
  );
}

type Seen = { kind: "idle" } | { kind: "looking"; since: number } | { kind: "seen"; rows: FolderRow[]; partial: boolean } | { kind: "failed"; why: string };
type Act = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

function AddDrawer(props: { caps: Capabilities; install: Install | null; places: Place[]; packs: Pack[]; onClose: () => void; onDone: () => void }) {
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
    <DrawerFrame title={source ? "Add a source" : `Add a ${d.role} place`} icon="folder" onClose={onClose} foot={foot}>
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
          <div className="input mono grow">
            <input
              id="place-path"
              value={d.path}
              placeholder="/srv/imaging/2026-cohort"
              spellCheck={false}
              disabled={working}
              onChange={(e) => {
                setD({ ...d, path: e.target.value });
                setSeen({ kind: "idle" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && source) look();
              }}
            />
          </div>
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
    </DrawerFrame>
  );
}

function ChangeDrawer({ place, places, onClose, onDone }: { place: Place; places: Place[]; onClose: () => void; onDone: () => void }) {
  const said = (k: string) => place.guarantees?.[k] === true;
  const [g, setG] = useState({ snapshots: said("snapshots"), protected: said("protected"), fast: said("fast") });
  const [backup, setBackup] = useState<string | null>(typeof place.guarantees?.["backup"] === "string" ? (place.guarantees["backup"] as string) : null);
  const [retiring, setRetiring] = useState(false);
  const saving = useActing();
  const retired = place.retired_at !== null;
  const probed = place.probed ?? {};
  const backups = places.filter((p) => p.role === "backup" && p.retired_at === null && p.id !== place.id);
  const changed = g.snapshots !== said("snapshots") || g.protected !== said("protected") || g.fast !== said("fast") || (place.role === "registry" && backup !== (place.guarantees?.["backup"] ?? null));

  const save = () =>
    saving.act(`changing ${place.name}`, async () => {
      await objects.placeSet(place.id, { guarantees: { ...place.guarantees, ...g, backup: place.role === "registry" ? backup : (place.guarantees?.["backup"] ?? null) } });
      onDone();
      return `${place.name} is changed.`;
    });

  const retire = () =>
    saving.act(`retiring ${place.name}`, async () => {
      await objects.placeSet(place.id, { retired: true });
      onDone();
      return `${place.name} is retired.`;
    });

  const foot = (
    <>
      <Acted acting={saving.acting} />
      {!retired && (
        <div className="row actions">
          <button type="button" className="button" disabled={!changed || saving.working} onClick={save}>
            Save
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
    <DrawerFrame title={place.name} icon="pencil" onClose={onClose} foot={foot}>
      <dl className="facts">
        <dt>role</dt>
        <dd>{place.role}</dd>
        <dt>holds</dt>
        <dd>{ROLE_WORDS[place.role].holds}</dd>
        <dt>must have</dt>
        <dd>{ROLE_WORDS[place.role].must}</dd>
        <dt>path</dt>
        <dd>
          <span className="path">{place.path}</span>
        </dd>
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
    </DrawerFrame>
  );
}
