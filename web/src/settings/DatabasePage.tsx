// SPDX-License-Identifier: AGPL-3.0-only
// The Database page (Wave 5 section 10.3), as the chosen design draws it:
// where the registry is kept and whether it passes the rule, its backups with
// the schedule and each archive's last check, the key that is in no backup,
// what was fixed when the registry was made, and its calendar. A backup and a
// rehearsal are jobs the engine's queue runs; the page follows each until it
// is over, with the command a person would run by hand beside the buttons.

import { useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { objects, type Place } from "../objects/client";
import { ops, type CustodyStore } from "../ops/client";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { Acted, Head, messageOf, useActing } from "./common";
import {
  backupByHand,
  backupsTag,
  checkedTag,
  database,
  draftBody,
  draftChanged,
  draftOf,
  draftRule,
  keepWords,
  keptBy,
  livesNote,
  madeWords,
  nextWords,
  registryRule,
  rehearseByHand,
  scheduleWords,
  sizeWords,
  tookWords,
  type Backups,
  type Calendar,
  type RegistryStatus,
  type ScheduleDraft,
  type Tone,
} from "./database";
import type { Install } from "./supervise";

const KEEPS: (number | null)[] = [null, 7, 14, 30, 90];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SHOWN = 20;

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A job the engine's queue runs, followed until it is over. */
async function over(id: number, limitMs = 60 * 60_000): Promise<JobRow> {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    try {
      const job = await ops.job(id);
      if (job.state === "done" || job.state === "failed" || job.state === "cancelled") return job;
    } catch {
      // the engine may be busy with the job itself; ask again
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error("It is still running; the list shows its archive once it is done.");
}

function Tag({ tone, words }: { tone: Tone; words: string }) {
  return (
    <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>
      {tone === "ok" && <Icon name="check" />}
      {tone === "blocked" && <Icon name="alert" />}
      {words}
    </span>
  );
}

export function DatabasePage({ caps, install, onChanged }: { caps: Capabilities; install: Install | null; onChanged: () => void }) {
  const [backups, setBackups] = useState<Backups | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [stores, setStores] = useState<CustodyStore[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const backup = useActing();
  const rehearsal = useActing();
  const schedule = useActing();
  const change = useActing();

  const load = () => {
    if (served(caps, "GET /api/backups"))
      database
        .backups()
        .then((b) => {
          setBackups(b);
          setDraft((d) => d ?? draftOf(b.schedule));
        })
        .catch((e: unknown) => setWhy(messageOf(e)));
    if (served(caps, "GET /api/settings"))
      database
        .calendar()
        .then((c) => {
          setCalendar(c);
          setTimezone((t) => t ?? c.timezone);
          setWeekStart((w) => w ?? c.week_start);
        })
        .catch(() => setCalendar(null));
    if (served(caps, "GET /api/status"))
      database
        .status()
        .then((s) => setStatus(s.registry))
        .catch(() => setStatus(null));
    if (served(caps, "GET /api/places"))
      objects
        .places()
        .then((p) => setPlaces(p.places))
        .catch(() => setPlaces(null));
    if (served(caps, "GET /api/custody"))
      ops
        .custody()
        .then((c) => setStores(c.stores))
        .catch(() => setStores(null));
  };

  // read again when the registry moves
  const epoch = caps.engine?.registry.epoch ?? null;
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the epoch is what moves
  }, [epoch]);

  const now = new Date();
  const newest = backups?.archives.find((a) => a.ours) ?? null;
  const own = places?.find((p) => p.role === "registry" && p.retired_at === null) ?? null;
  const keys = stores?.find((s) => s.store === "key store")?.where ?? null;
  const kept = stores?.find((s) => s.store === "registry")?.where ?? null;
  const rule = places ? registryRule(places) : null;
  const refused = draft ? draftRule(draft) : null;

  const backUp = () =>
    backup.act("backing up, then rehearsing a restore of the archive", async () => {
      const keep = backups?.schedule.keep ?? null;
      const { job } = await ops.enqueue(["backup", "--rehearse", ...(keep !== null ? ["--keep", String(keep)] : [])], "backup from the desk");
      const ended = await over(job);
      load();
      if (ended.state !== "done") throw new Error("The backup did not finish cleanly; the list says how its archive stands.");
      const result = (ended.result ?? {}) as { archive?: string; pruned?: string[] };
      const pruned = result.pruned?.length ?? 0;
      const removed = pruned === 0 ? "" : pruned === 1 ? ", and one older archive was removed" : `, and ${pruned} older archives were removed`;
      return `${result.archive ?? "The archive"} is written and every store in it opens${removed}.`;
    });

  const rehearse = () => {
    if (!newest) return;
    rehearsal.act(`rehearsing a restore of ${newest.name}`, async () => {
      const { job } = await ops.enqueue(["verify", newest.name, "--rehearse"], "rehearsal from the desk");
      const ended = await over(job);
      load();
      if (ended.state !== "done") throw new Error(`${newest.name} did not pass; the list says what stopped it.`);
      return `${newest.name} passes: every file matches its manifest, and every store opens.`;
    });
  };

  const saveSchedule = () => {
    if (!draft || !backups || refused) return;
    schedule.act("saving the schedule", async () => {
      const saved = await database.setSchedule(draftBody(draft));
      setBackups((b) => (b ? { ...b, schedule: saved } : b));
      setDraft(draftOf(saved));
      const next = nextWords(saved, new Date());
      return `Saved: ${scheduleWords(saved).toLowerCase()}${next ? `, ${next}` : ""}.`;
    });
  };

  const changeCalendar = () => {
    if (timezone === null || weekStart === null) return;
    change.act("changing the registry's calendar", async () => {
      const c = await database.setCalendar({ timezone, week_start: weekStart });
      setCalendar(c);
      onChanged();
      load();
      return `Dates are read in ${c.timezone} now, and a week starts on ${capitalised(c.week_start)}.`;
    });
  };

  const nothing = !backups && !calendar && !status;
  return (
    <div className="settings">
      <Head title="Database" lede="Where the registry is kept, how it is backed up, and what was fixed when it was made." />
      {why && <p className="warn">{why}</p>}
      {nothing && !why && <p className="meta">Reading the registry.</p>}
      <div className="db-grid">
        <div className="db-col">
          {status && (
            <section className="panel card">
              <div className="row card-head">
                <Icon name="data" size="lg" />
                <h2>Where it lives</h2>
                {rule && <Tag tone={rule.tone} words={rule.words} />}
              </div>
              <dl className="facts">
                <dt>kept by</dt>
                <dd>{keptBy(status, install)}</dd>
                <dt>its data</dt>
                <dd>
                  {status.backend === "sqlite" ? (
                    <>
                      <span className="path">{status.home}/registry.db</span>, with <span className="path">linkage.db</span> beside it
                    </>
                  ) : (
                    (kept ?? (
                      <>
                        schema <span className="path">{status.schema}</span>
                      </>
                    ))
                  )}
                </dd>
                {own && (
                  <>
                    <dt>registry place</dt>
                    <dd>
                      <span className="path">{own.path}</span>
                      {keys?.startsWith(own.path) ? ", holding its configuration and its key" : ", holding its configuration"}
                    </dd>
                  </>
                )}
                <dt>registry</dt>
                <dd className="num">
                  epoch {status.epoch.toLocaleString("en-GB")} · schema {status.schema_version}
                </dd>
              </dl>
              {install && (
                <div className="note">
                  <Icon name="info" />
                  <div className="note-body">
                    <p className="note-lead">{livesNote(install).lead}</p>
                    <p className="note-detail">{livesNote(install).detail}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {backups && draft && (
            <section className="panel card">
              <div className="row card-head">
                <Icon name="shield" size="lg" />
                <h2>Backups</h2>
                <Tag {...backupsTag(backups)} />
              </div>
              {backups.dir === null ? (
                <div className="note caution">
                  <Icon name="alert" />
                  <div className="note-body">
                    <p className="note-lead">The engine has no backup directory, so a backup from the desk is refused.</p>
                    <p className="note-detail">Running setup again gives the engine the backup place the registry names.</p>
                    <Command text="nils setup" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="fields3">
                    <div className="field">
                      <span className="label">Place</span>
                      <div className="input static">
                        <span className="path">{backups.place?.name ?? "not a place"}</span>
                      </div>
                      <span className="meta">
                        <span className="path">{backups.dir}</span>
                      </span>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="backup-every">
                        When
                      </label>
                      <div className="row schedule-when">
                        <div className="input">
                          <select id="backup-every" value={draft.every} onChange={(e) => setDraft({ ...draft, every: e.target.value as ScheduleDraft["every"] })}>
                            <option value="off">Off</option>
                            <option value="day">Every day</option>
                            <option value="week">Every week</option>
                          </select>
                        </div>
                        {draft.every === "week" && (
                          <div className="input">
                            <select aria-label="The day" value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>
                              {DAYS.map((d) => (
                                <option key={d} value={d}>
                                  {capitalised(d)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {draft.every !== "off" && (
                          <div className="input time">
                            <input type="time" aria-label="The time of day" value={draft.at} onChange={(e) => setDraft({ ...draft, at: e.target.value })} />
                          </div>
                        )}
                      </div>
                      <span className="meta">
                        {backups.schedule.every === "off" ? "nothing starts a backup on its own" : `${nextWords(backups.schedule, now) ?? ""}, ${backups.schedule.timezone}`}
                      </span>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="backup-keep">
                        Keep
                      </label>
                      <div className="input">
                        <select id="backup-keep" value={draft.keep ?? ""} onChange={(e) => setDraft({ ...draft, keep: e.target.value === "" ? null : Number(e.target.value) })}>
                          {KEEPS.map((k) => (
                            <option key={k ?? "every"} value={k ?? ""}>
                              {keepWords(k, backups).label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span className="meta">{keepWords(draft.keep, backups).meta}</span>
                    </div>
                  </div>
                  {draftChanged(draft, backups.schedule) && (
                    <div className="row actions">
                      <button type="button" className="button small" disabled={schedule.working || refused !== null} onClick={saveSchedule}>
                        Save the schedule
                      </button>
                      <button type="button" className="button quiet small" onClick={() => setDraft(draftOf(backups.schedule))}>
                        Leave it as it was
                      </button>
                      {refused && <span className="warn">{refused}</span>}
                    </div>
                  )}
                  <Acted acting={schedule.acting} />
                  <div className="table-wrap">
                    <table className="thin">
                      <thead>
                        <tr>
                          <th>Archive</th>
                          <th className="num">Size</th>
                          <th className="num">Took</th>
                          <th>Checked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backups.archives.length === 0 && (
                          <tr>
                            <td colSpan={4} className="meta">
                              No archive yet.
                            </td>
                          </tr>
                        )}
                        {backups.archives.slice(0, SHOWN).map((a) => (
                          <tr key={a.name}>
                            <td>
                              <span className="path">{a.name}</span>
                              {!a.ours && <div className="meta">another registry's</div>}
                            </td>
                            <td className="num">{sizeWords(a.bytes)}</td>
                            <td className="num">{tookWords(a.seconds)}</td>
                            <td>
                              <Tag {...checkedTag(a)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {backups.archives.length > SHOWN && <p className="meta">and {backups.archives.length - SHOWN} older</p>}
                  <div className="row actions">
                    <button type="button" className="button" disabled={backup.working} onClick={backUp}>
                      Back up now
                    </button>
                    <button type="button" className="button secondary" disabled={rehearsal.working || newest === null} onClick={rehearse}>
                      Rehearse a restore
                    </button>
                    <span className="meta">A rehearsal checks the newest archive and opens every store in it, without applying it.</span>
                  </div>
                  <Acted acting={backup.acting} />
                  <Acted acting={rehearsal.acting} />
                  <div className="row actions">
                    <span className="meta">By hand</span>
                    <Command text={backupByHand(backups.schedule.keep)} />
                    {newest && <Command text={rehearseByHand(backups.dir, newest.name)} />}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <div className="db-col">
          {status && (
            <section className="note caution db-key">
              <Icon name="key" size="lg" />
              <div className="note-body">
                <p className="note-lead">The key is in no backup</p>
                <p className="note-detail">
                  The pseudonym key <span className="path">{status.pseudonym_key}</span> gives each subject the same code every time, and reads the identifiers the linkage store keeps; a registry restored without it can do neither. The key
                  is the passphrase given when it was added. Keep that where you keep passwords, away from this machine, and this makes the key again from it:
                </p>
                <Command text={`nils key add ${status.pseudonym_key}`} />
              </div>
            </section>
          )}

          {status && (
            <section className="panel card">
              <div className="row card-head">
                <Icon name="lock" />
                <h2>Fixed when it was made</h2>
              </div>
              <dl className="facts">
                <dt>backend</dt>
                <dd>{status.backend === "sqlite" ? "SQLite" : "Postgres"}</dd>
                <dt>pseudonyms</dt>
                <dd>
                  {status.pseudonym_scheme}, key <span className="path">{status.pseudonym_key}</span>
                </dd>
                <dt>codes shown</dt>
                <dd>{status.display_length} characters</dd>
                <dt>made</dt>
                <dd>{madeWords(status.created_at)}</dd>
              </dl>
              <p className="meta">These keep every code the same for the life of the registry.</p>
            </section>
          )}

          {calendar && timezone !== null && weekStart !== null && (
            <section className="panel card">
              <div className="row card-head">
                <Icon name="clock" />
                <h2>The registry's calendar</h2>
              </div>
              <div className="field">
                <label className="label" htmlFor="registry-timezone">
                  Timezone
                </label>
                <div className="input">
                  <select id="registry-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {calendar.timezones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="registry-week">
                  Week starts on
                </label>
                <div className="input">
                  <select id="registry-week" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
                    {calendar.week_starts.map((d) => (
                      <option key={d} value={d}>
                        {capitalised(d)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {(timezone !== calendar.timezone || weekStart !== calendar.week_start) && (
                <div className="row actions">
                  <button type="button" className="button small" disabled={change.working} onClick={changeCalendar}>
                    Change the calendar
                  </button>
                  <button
                    type="button"
                    className="button quiet small"
                    onClick={() => {
                      setTimezone(calendar.timezone);
                      setWeekStart(calendar.week_start);
                    }}
                  >
                    Leave it as it was
                  </button>
                </div>
              )}
              <Acted acting={change.acting} />
              <p className="meta">Every answer's dates use these, never the browser's. A change moves the registry's epoch.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
