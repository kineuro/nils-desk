// SPDX-License-Identifier: AGPL-3.0-only
// Getting started (Wave 5 section 6.1): the steps that make an install ready
// for real work, each worked out from what the parts report and acted on
// where it stands, and beside them what each word of NILS means. Until every
// step the desk needs is done, an operator's Home is this page; Settings
// keeps it afterwards as Setup.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served, holds } from "../deployment";
import { objects, type Place } from "../objects/client";
import { placesKept } from "../objects/kept";
import { data, ops } from "../ops/client";
import { href } from "../routes";
import { Acted, useActing } from "../settings/common";
import { checkedTag, database, keptBy, scheduleWords, type Backups, type RegistryStatus } from "../settings/database";
import { MODES } from "../settings/identity";
import { AddPerson } from "../settings/IdentityPage";
import { keptRunning, where } from "../settings/install";
import { backupsKept, usersKept } from "../settings/kept";
import { kvasir } from "../settings/kvasir";
import type { Install } from "../settings/supervise";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { BringInForm } from "./BringIn";
import { CONCEPTS } from "./concepts";
import { placeName, type Pack } from "./look";
import { minimumMet, progressWords, setupSteps, type SetupId, type SetupStep } from "./setup";
import type { Purpose } from "./steps";
import { day } from "./tiles";

interface Extra {
  batches: number | null;
  jobs: JobRow[] | null;
  purposes: Purpose[] | null;
  packs: Pack[];
  status: RegistryStatus | null;
}

const NONE: Extra = { batches: null, jobs: null, purposes: null, packs: [], status: null };

/** A door's answer, or null where it failed: the page shows what it could read. */
function quietly<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null);
}

/** A job the engine's queue runs, followed until it is over. */
async function finished(id: number, limitMs = 60 * 60_000): Promise<JobRow> {
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
  throw new Error("It is still running; the Database page shows its archive once it is done.");
}

export function Setup({ caps, install, onChanged, onHome }: { caps: Capabilities; install: Install | null; onChanged: () => void; onHome?: () => void }) {
  const places = useKept(placesKept);
  const archives = useKept(backupsKept);
  const [extra, setExtra] = useState<Extra>(NONE);
  const [open, setOpen] = useState<SetupId | "none" | null>(null);
  const admin = holds(caps, "admin");
  const placesServed = served(caps, "GET /api/places");

  const load = useCallback(() => {
    const has = (d: string) => served(caps, d);
    if (has("GET /api/places")) void placesKept.refresh().catch(() => undefined);
    if (admin && has("GET /api/backups")) void backupsKept.refresh().catch(() => undefined);
    void Promise.all([
      has("GET /api/batches") ? quietly(data.batches(1000)).then((r) => r?.count ?? null) : null,
      has("GET /api/jobs")
        ? quietly(ops.jobs(true, 200)).then((r) => r?.jobs.filter((j) => j.kind === "backup" && j.state === "done").sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? "")) ?? null)
        : null,
      caps.kvasir !== null ? quietly(kvasir.purposes()).then((r) => r?.purposes.map((p) => ({ purpose: p.purpose, content: p.content, backend: p.backend })) ?? null) : null,
      has("GET /api/packs") ? quietly(data.packs()).then((r) => r?.packs ?? null) : null,
      admin && has("GET /api/status") ? quietly(database.status()).then((s) => s?.registry ?? null) : null,
    ]).then(([batches, jobs, purposes, packs, status]) => setExtra({ batches, jobs, purposes, packs: packs ?? [], status }));
  }, [caps, admin]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; each action reads again
  }, []);

  const all = setupSteps({ caps, install, places: placesServed ? (places.value?.places ?? null) : null, batches: extra.batches, backups: extra.jobs, archives: archives.value, purposes: extra.purposes });
  const next = all.find((s) => s.required && !s.met) ?? all.find((s) => !s.met) ?? null;
  const shown = open === null ? (next?.id ?? null) : open === "none" ? null : open;
  const done = minimumMet(all);
  const needed = all.filter((s) => s.required);
  const reading = placesServed && places.value === null && !places.error;
  const changed = () => {
    load();
    onChanged();
  };

  const body = (s: SetupStep): React.ReactNode => {
    const known = places.value?.places ?? [];
    switch (s.id) {
      case "installed":
        return <InstalledBody caps={caps} install={install} />;
      case "sources":
        return <SourcesBody caps={caps} install={install} places={known} packs={extra.packs} met={s.met} onDone={changed} />;
      case "backups":
        return <BackupsBody caps={caps} install={install} places={known} archives={archives.value} status={extra.status} onDone={changed} />;
      case "signin":
        return <SigninBody caps={caps} onDone={changed} />;
      case "model":
        return <ModelBody caps={caps} />;
    }
  };

  return (
    <div className="setup">
      <div className="setup-head">
        <span className="eyebrow">Get started</span>
        <div className="row setup-title">
          <h1>{done ? "NILS is ready" : "Set up NILS"}</h1>
          {done && onHome && (
            <button type="button" className="button" onClick={onHome}>
              Open Home
              <Icon name="arrow" />
            </button>
          )}
        </div>
        <p className="lede">
          {done
            ? "Every step the desk needs is done. What is left is worth doing when there is a moment."
            : "A few steps make this install ready for real work. Each checks itself from what the parts report, and turns green once it holds."}
        </p>
        {needed.length > 1 && !reading && (
          <div className="progress-row">
            <span className="progress" role="img" aria-label={progressWords(all)}>
              {needed.map((s) => (
                <span key={s.id} className={s.met ? "on" : undefined} />
              ))}
            </span>
            <span className="meta">{progressWords(all)}</span>
          </div>
        )}
      </div>
      <div className="setup-grid">
        {reading ? (
          <p className="meta">Reading the install.</p>
        ) : (
          <ol className="setup-steps">
            {all.map((s, i) => (
              <SetupCard key={s.id} n={i + 1} step={s} open={shown === s.id} onToggle={() => setOpen(shown === s.id ? "none" : s.id)}>
                {body(s)}
              </SetupCard>
            ))}
          </ol>
        )}
        <Concepts />
      </div>
    </div>
  );
}

function SetupCard({ n, step, open, onToggle, children }: { n: number; step: SetupStep; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const need = step.met ? "done" : step.required ? "needed" : "worth doing";
  return (
    <li className={["panel", "setup-card", open ? "open" : null, step.met ? "met" : null].filter(Boolean).join(" ")}>
      <button type="button" className="setup-card-head" aria-expanded={open} onClick={onToggle}>
        <span className={`setup-mark ${step.met ? "met" : step.tone}`} aria-hidden="true">
          {step.met ? <Icon name="check" /> : step.tone === "caution" ? <Icon name="alert" /> : n}
        </span>
        <span className="setup-card-title">
          <span className="row">
            <b>{step.title}</b>
            <span className={`setup-need ${step.met ? "done" : step.required ? "needed" : "later"}`}>{need}</span>
          </span>
          <span className="setup-summary">{step.words}</span>
        </span>
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="setup-card-body">
          {step.tags.length > 0 && (
            <div className="chips">
              {step.tags.map((t) => (
                <span key={t.text} className={t.tone === "caution" ? "tag caution" : "tag"}>
                  {t.tone === "caution" && <Icon name="alert" />}
                  {t.text}
                </span>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
    </li>
  );
}

function InstalledBody({ caps, install }: { caps: Capabilities; install: Install | null }) {
  return (
    <dl className="facts">
      <dt>engine</dt>
      <dd>
        <span className="path">nils {caps.engine?.engine.version ?? ""}</span>
      </dd>
      <dt>desk</dt>
      <dd>
        <span className="path">{caps.desk.version}</span>
      </dd>
      {install && (
        <>
          <dt>runs</dt>
          <dd>
            {where(install)}, {keptRunning(install) ? "back after a restart" : "started by hand"}
          </dd>
          <dt>its files</dt>
          <dd>
            <span className="path">{install.dir}</span>
          </dd>
        </>
      )}
    </dl>
  );
}

function SourcesBody(props: { caps: Capabilities; install: Install | null; places: Place[]; packs: Pack[]; met: boolean; onDone: () => void }) {
  const { caps, install, places, packs, met, onDone } = props;
  const [adding, setAdding] = useState(!met);
  const sources = places.filter((p) => p.role === "source" && p.retired_at === null);
  return (
    <>
      {sources.length > 0 && (
        <ul className="source-list">
          {sources.map((p) => (
            <li key={p.id}>
              <Icon name="folder" />
              <b>{p.name}</b>
              <span className="path">{p.path}</span>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <BringInForm caps={caps} install={install} places={places} packs={packs} onDone={onDone} />
      ) : (
        <div className="row actions">
          <button type="button" className="button secondary small" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add another folder
          </button>
          <a className="button quiet small" href={href("settings", "places")}>
            The Places page
          </a>
        </div>
      )}
    </>
  );
}

function BackupsBody(props: { caps: Capabilities; install: Install | null; places: Place[]; archives: Backups | null; status: RegistryStatus | null; onDone: () => void }) {
  const { caps, install, places, archives, status, onDone } = props;
  const acting = useActing();
  if (!holds(caps, "admin")) return <p className="meta">An admin names where the registry's backups go, and when they run, on the Database page.</p>;
  const live = places.filter((p) => p.retired_at === null);
  const registry = live.find((p) => p.role === "registry") ?? null;
  const named = registry?.guarantees?.["backup"];
  const backup = typeof named === "string" ? (live.find((p) => p.name === named && p.role === "backup") ?? null) : null;
  const dir = archives?.dir ?? null;
  const newest = archives?.archives.find((a) => a.ours) ?? null;

  const nameDir = () =>
    acting.act("naming the registry's backup place", async () => {
      if (!dir) throw new Error("the engine has no backup folder");
      const taken = live.map((p) => p.name);
      const there = live.find((p) => p.role === "backup" && p.path === dir);
      const name = there?.name ?? placeName("/backups", taken);
      if (!there) await objects.placeAdd({ name, role: "backup", path: dir, guarantees: { backup: null, snapshots: false, protected: false, fast: false } });
      if (registry) await objects.placeSet(registry.id, { guarantees: { ...registry.guarantees, backup: name } });
      else if (status) await objects.placeAdd({ name: placeName("/registry", [...taken, name]), role: "registry", path: status.home, guarantees: { backup: name, snapshots: false, protected: false, fast: false } });
      else throw new Error("the desk does not know the registry's folder; name its backup place on the Places page");
      onDone();
      return `The registry's backups go to ${name}.`;
    });

  const daily = () =>
    acting.act("setting the schedule", async () => {
      await database.setSchedule({ every: "day", at: "02:00", day: null, keep: 14 });
      onDone();
      return "A backup runs every day at 02:00, and the last 14 are kept.";
    });

  const backUp = () =>
    acting.act("backing up, then rehearsing a restore of the archive", async () => {
      const { job } = await ops.enqueue(["backup", "--rehearse", "--keep", String(archives?.schedule.keep ?? 14)], "backup from setup");
      const ended = await finished(job);
      onDone();
      if (ended.state !== "done") throw new Error("The backup did not finish cleanly; the Database page says how its archive stands.");
      return "The first archive is written, and every store in it opens.";
    });

  return (
    <>
      <dl className="facts">
        <dt>registry</dt>
        <dd>{status ? keptBy(status, install) : "kept by the engine"}</dd>
        <dt>backup place</dt>
        <dd>
          {backup ? (
            <>
              <b>{backup.name}</b>, <span className="path">{backup.path}</span>
            </>
          ) : (
            "none named yet"
          )}
        </dd>
        {archives && (
          <>
            <dt>schedule</dt>
            <dd>{archives.schedule.every === "off" ? "none" : scheduleWords(archives.schedule)}</dd>
            <dt>last backup</dt>
            <dd>{newest?.created_at ? `${day(newest.created_at)}, ${checkedTag(newest).words}` : "none yet"}</dd>
          </>
        )}
      </dl>
      {archives !== null && dir === null && (
        <div className="note caution">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">The engine has no backup folder, so a backup from the desk is refused.</p>
            <p className="note-detail">Running setup again gives the engine one.</p>
            <Command text="nils setup" />
          </div>
        </div>
      )}
      <div className="row actions">
        {!backup && dir && (
          <button type="button" className="button" disabled={acting.working} onClick={nameDir}>
            Back up to the engine's backup folder
          </button>
        )}
        {backup && archives && archives.schedule.every === "off" && (
          <button type="button" className="button" disabled={acting.working} onClick={daily}>
            Back up every day at 02:00
          </button>
        )}
        {backup && archives && dir && !newest && (
          <button type="button" className={archives.schedule.every === "off" ? "button secondary" : "button"} disabled={acting.working} onClick={backUp}>
            Back up now
          </button>
        )}
        <a className="button quiet small" href={href("settings", "database")}>
          The Database page
        </a>
      </div>
      {!backup && dir && (
        <p className="meta">
          The engine writes its archives to <span className="path">{dir}</span>. Naming it the registry's backup place records that; storage other than the registry's is better, and setup moves it.
        </p>
      )}
      <Acted acting={acting.acting} />
    </>
  );
}

function SigninBody({ caps, onDone }: { caps: Capabilities; onDone: () => void }) {
  const mode = caps.desk.mode;
  const admin = holds(caps, "admin");
  const users = useKept(usersKept);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (mode === "local" && admin) usersKept.ensure();
  }, [mode, admin]);

  return (
    <>
      <div className="mode-lines">
        {MODES.map((m) => (
          <div key={m.id} className={m.id === mode ? "mode-line on" : "mode-line"}>
            <span className={m.id === mode ? "radio on" : "radio"} aria-hidden="true" />
            <b>{m.title}</b>
            <span className="meta">{m.words}</span>
          </div>
        ))}
      </div>
      {mode === "local" && admin && (
        <div className="row actions">
          <button type="button" className="button secondary small" disabled={!users.value} onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add a person
          </button>
          {users.value && <span className="meta">{users.value.users.length === 1 ? "one person so far" : `${users.value.users.length} people so far`}</span>}
          <a className="button quiet small" href={href("settings", "identity")}>
            The Identity page
          </a>
        </div>
      )}
      <p className="meta">How people sign in is chosen when NILS is set up, and changed by running setup again, which restarts the desk and the engine:</p>
      <Command text="nils setup" />
      {adding && users.value && (
        <AddPerson
          users={users.value.users}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void usersKept.refresh().catch(() => undefined);
            onDone();
          }}
        />
      )}
    </>
  );
}

function ModelBody({ caps }: { caps: Capabilities }) {
  return (
    <>
      <p className="meta">The assistant's model is chosen when NILS is set up, and running setup again changes it.</p>
      <div className="row actions">
        <Command text="nils setup" />
        {caps.kvasir !== null && (
          <a className="button quiet small" href={href("settings", "gateway")}>
            The Gateway and models page
          </a>
        )}
      </div>
    </>
  );
}

/** What each word of NILS means, and how many of it an install has. */
function Concepts() {
  return (
    <aside className="panel concepts" aria-label="what is what in NILS">
      <h2>What is what</h2>
      <ol className="flow">
        <li>
          <Icon name="folder" />
          <b>Sources</b>
          <span>your DICOM, read only</span>
        </li>
        <li>
          <Icon name="data" />
          <b>Registry</b>
          <span>what NILS learned</span>
        </li>
        <li>
          <Icon name="release" />
          <b>Exports</b>
          <span>answers, releases</span>
        </li>
      </ol>
      <p className="meta">A digest reads a source into the registry. Questions, reviews and releases read the registry, and a backup copies it to its backup place.</p>
      <dl className="concept-list">
        {CONCEPTS.map((c) => (
          <div key={c.term} className="concept">
            <Icon name={c.icon} />
            <dt>
              {c.term}
              <span className="count">{c.count}</span>
            </dt>
            <dd>{c.words}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
