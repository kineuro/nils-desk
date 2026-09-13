// SPDX-License-Identifier: AGPL-3.0-only
// Settings (Wave 5 section 10), as the chosen design draws it: a nav of its
// pages beside the side, and the page it opens. Every page reads the
// capabilities document and, for an admin, the supervisor on this host; a
// button that acts on the install has the command a person would run by hand
// beside it, and what it does goes on apart from the call.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";
import { href } from "../routes";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { Acted, Head, Health, useRun } from "./common";
import { AuditPage } from "./AuditPage";
import { DatabasePage } from "./DatabasePage";
import { GatewayPage } from "./GatewayPage";
import { IdentityPage } from "./IdentityPage";
import { PlacesPage } from "./PlacesPage";
import { keptRunning, reapplyByHand } from "./install";
import { kvasir, type AdmissionRecord } from "./kvasir";
import { settingsPage, settingsPages } from "./pages";
import { checkedWords, contractWords, keptByWords, partName, partRows, partTitle, restartByHand, runtimeWords, updateWords, uptimeWords } from "./parts";
import { supervise, type Install } from "./supervise";

interface PageProps {
  caps: Capabilities;
  install: Install | null;
  checkedAt: number | null;
  onChanged: () => void;
}

export function Settings(props: PageProps & { page: string | null }) {
  const pages = settingsPages(props.caps);
  switch (settingsPage(pages, props.page)?.id) {
    case "parts":
      return <PartsPage {...props} built={pages.map((p) => p.id)} />;
    case "engine":
      return <EnginePage {...props} />;
    case "desk":
      return <DeskPage {...props} />;
    case "assistant":
      return <AssistantPage {...props} />;
    case "gateway":
      return <GatewayPage caps={props.caps} install={props.install} />;
    case "places":
      return <PlacesPage caps={props.caps} install={props.install} onChanged={props.onChanged} />;
    case "database":
      return <DatabasePage caps={props.caps} install={props.install} onChanged={props.onChanged} />;
    case "identity":
      return <IdentityPage caps={props.caps} />;
    case "audit":
      return <AuditPage />;
    default:
      return null;
  }
}

type RestartPart = Parameters<typeof supervise.restart>[0];

/** A part's restart: the button where the supervisor keeps the install running, and the command beside it either way. */
function RestartPart({ caps, install, part, onChanged }: { caps: Capabilities; install: Install | null; part: RestartPart; onChanged: () => void }) {
  const restart = useRun();
  if (!install || !holds(caps, "admin") || !install.services.some((s) => s.part === part)) return null;
  return (
    <div className="note">
      <Icon name="restart" />
      <div className="note-body">
        <p className="note-lead">A change to {partName(part)} takes effect once it starts again.</p>
        <div className="restart-row">
          {keptRunning(install) && (
            <button
              type="button"
              className="button secondary small"
              disabled={restart.working}
              onClick={() =>
                restart.start(`restarting ${partName(part)}`, () => supervise.restart(part), () => {
                  onChanged();
                  return `${partTitle(part)} is running again.`;
                })
              }
            >
              <Icon name="restart" />
              Restart {partName(part)}
            </button>
          )}
          <Command text={restartByHand(install, part)} />
        </div>
        <Acted acting={restart.acting} />
      </div>
    </div>
  );
}

function PartsPage({ caps, install, checkedAt, onChanged, built }: PageProps & { built: string[] }) {
  const admin = holds(caps, "admin");
  const supervised = admin && install !== null;
  const [admissions, setAdmissions] = useState<AdmissionRecord[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [part, setPart] = useState<RestartPart>("engine");
  const update = useRun();
  const restart = useRun();
  const local = ((caps.kvasir?.["backends"] as { locality?: string }[] | undefined) ?? []).some((b) => b.locality === "local");

  useEffect(() => {
    if (!local) return;
    let alive = true;
    kvasir
      .admission()
      .then((r) => alive && setAdmissions(r.records))
      .catch(() => alive && setAdmissions(null));
    return () => {
      alive = false;
    };
  }, [local]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows = partRows(caps, install, admissions, built);
  const checked = checkedWords(checkedAt, now);
  const services = install?.services ?? [];
  const chosen = services.some((s) => s.part === part) ? part : ((services.find((s) => s.part === "engine")?.part ?? services[0]?.part ?? "engine") as RestartPart);
  const missing = !admin
    ? "How each part runs, and updating it, are an admin's to see."
    : caps.desk.settings?.supervisor_url
      ? "The supervisor on this host did not answer, so how each part runs is not shown."
      : "This desk reaches no supervisor, so how each part runs is not shown.";

  return (
    <div className="settings">
      <Head title="Parts" lede="Everything this deployment runs, with its version and health, and what a newer release would change." />

      {install?.release.newer && (
        <section className="panel update" aria-label="a newer release">
          <div className="row update-head">
            <Icon name="update" size="lg" />
            <h2>{install.release.newer} is out</h2>
            {install.release.installed && <span className="meta">you run {install.release.installed}</span>}
          </div>
          <ul>
            {updateWords(install).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="update-foot">
            {supervised && (
              <button
                type="button"
                className="button"
                disabled={update.working}
                onClick={() =>
                  update.start("updating one part at a time", supervise.updateAll, () => {
                    // the desk that drew this page may be replaced, so the page is drawn again by the one that runs now
                    setTimeout(() => location.reload(), 1500);
                    return "Updated. This page loads again in a moment.";
                  })
                }
              >
                Update everything
              </button>
            )}
            <span className="meta">one part at a time; this page loads again when the desk is back</span>
            <span className="grow" />
            <Command text={install.release.command} />
          </div>
          <Acted acting={update.acting} />
        </section>
      )}

      <section className="stack">
        <div className="section-head rule-top">
          <h2>Installed</h2>
          {install?.release.error && !install.release.newer && <span className="meta">the newest release could not be read</span>}
          {checked && <span className="meta">{checked}</span>}
        </div>
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Part</th>
                <th>Version</th>
                {install && <th>Runs as</th>}
                <th>Health</th>
                {install && <th>Newer</th>}
                <th className="go">
                  <span className="sr-only">More</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="row part-name">
                      <Icon name={r.icon} />
                      <b>{r.title}</b>
                    </span>
                  </td>
                  <td>
                    {r.mono ? <span className="path">{r.version}</span> : r.version}
                    {r.meta && <div className="meta">{r.meta}</div>}
                  </td>
                  {install && <td>{r.runsAs && (r.runsAs.mono ? <span className="path">{r.runsAs.text}</span> : r.runsAs.text)}</td>}
                  <td>
                    <Health tone={r.health.tone} words={r.health.words} />
                  </td>
                  {install && <td>{r.newer && (r.newer.tag ? <span className="tag brand">{r.newer.text}</span> : <span className="meta">{r.newer.text}</span>)}</td>}
                  <td className="go">
                    {r.page && (
                      <a href={href("settings", r.page)} aria-label={`${r.title} settings`}>
                        <Icon name="chevron-right" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!install && <p className="meta">{missing}</p>}
      </section>

      {install && (
        <section className="pair">
          <div className="panel card">
            <h2>Keeping it running</h2>
            <dl className="facts">
              <dt>runtime</dt>
              <dd>{runtimeWords(install)}</dd>
              <dt>kept by</dt>
              <dd>{keptByWords(install)}</dd>
              <dt>directory</dt>
              <dd>
                <span className="path">{install.dir}</span>
              </dd>
            </dl>
            {supervised && keptRunning(install) && services.length > 0 && (
              <div className="restart-row">
                <label className="input">
                  <span className="sr-only">The part to restart</span>
                  <select value={chosen} disabled={restart.working} onChange={(e) => setPart(e.target.value as RestartPart)}>
                    {services.map((s) => (
                      <option key={s.part} value={s.part}>
                        {partTitle(s.part)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={restart.working}
                  onClick={() =>
                    restart.start(`restarting ${partName(chosen)}`, () => supervise.restart(chosen), () => {
                      onChanged();
                      return `${partTitle(chosen)} is running again.`;
                    })
                  }
                >
                  <Icon name="restart" />
                  Restart it
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={restart.working}
                  onClick={() =>
                    restart.start("restarting every part, in order", () => supervise.restart("all"), () => {
                      onChanged();
                      return "Every part is running again.";
                    })
                  }
                >
                  Restart everything
                </button>
              </div>
            )}
            <Acted acting={restart.acting} />
            <p className="meta">
              {keptRunning(install)
                ? "A restart keeps an order: Postgres, the engine, the desk, the gateway, then the assistant. By hand:"
                : "This install runs no services, so each part runs until whatever started it stops. To have them kept running, run setup again:"}
            </p>
            <Command text={restartByHand(install, keptRunning(install) ? chosen : "all")} />
          </div>
          <div className="panel card">
            <h2>Addresses</h2>
            <table className="thin">
              <tbody>
                {install.addresses.map((a) => (
                  <tr key={a.part}>
                    <td>{partTitle(a.part)}</td>
                    <td>
                      <span className="path">{a.address}</span>
                    </td>
                    <td className="meta">{a.reach}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

const AUTH: Record<string, string> = {
  off: "none: whoever reaches its address acts as the operator",
  token: "tokens the deployment named",
  oidc: "tokens from a trusted identity provider",
};

function EnginePage({ caps, install, onChanged }: PageProps) {
  const engine = caps.engine;
  const admin = holds(caps, "admin");
  const reapply = useRun();
  const unit = install?.services.find((s) => s.part === "engine") ?? null;
  if (!engine) {
    return (
      <div className="settings">
        <Head title="Engine" under lede="The engine keeps the registry and answers every door." />
        <p className="warn">The engine did not answer.</p>
      </div>
    );
  }
  const uptime = typeof engine["uptime_seconds"] === "number" ? uptimeWords(engine["uptime_seconds"] as number) : null;
  const roots = engine.ingest_roots ?? [];
  return (
    <div className="settings">
      <Head title="Engine" under lede="The engine keeps the registry and answers every door. What it may read and where it writes are set when it starts.">
        {uptime && <Health tone="ok" words={uptime} />}
      </Head>
      <section className="pair">
        <div className="panel card">
          <h2>What it is</h2>
          <dl className="facts">
            <dt>version</dt>
            <dd>
              <span className="path">nils {engine.engine.version}</span>
            </dd>
            <dt>contracts</dt>
            <dd>{contractWords(engine.contracts) || "none named"}</dd>
            <dt>registry</dt>
            <dd className="num">
              epoch {engine.registry.epoch.toLocaleString("en-GB")}
              {engine.registry.schema_version !== undefined ? ` · schema ${engine.registry.schema_version}` : ""}
            </dd>
            <dt>rule packs</dt>
            <dd>{engine.packs.length > 0 ? engine.packs.map((p) => `${p.name} ${p.version}`).join(", ") : "none"}</dd>
            {unit && (
              <>
                <dt>runs as</dt>
                <dd>
                  <span className="path">{unit.unit}</span>
                </dd>
              </>
            )}
          </dl>
        </div>
        <div className="panel card">
          <h2>What it reads and writes</h2>
          <dl className="facts">
            <dt>callers</dt>
            <dd>{AUTH[engine.auth] ?? engine.auth}</dd>
            <dt>folders a digest may name</dt>
            <dd>{roots.length > 0 ? roots.join(", ") : "none yet"}</dd>
            <dt>backups</dt>
            <dd>{engine.backup_dir ? "written to the backup directory it was given" : "no backup directory: a backup from the desk is refused"}</dd>
            {typeof engine.event_streams === "number" && (
              <>
                <dt>live views</dt>
                <dd>at most {engine.event_streams} open at once</dd>
              </>
            )}
          </dl>
        </div>
      </section>
      {install && admin && keptRunning(install) && unit && (
        <div className="note">
          <Icon name="folder" />
          <div className="note-body">
            <p className="note-lead">The engine learns the folders the registry names when it starts.</p>
            <p className="note-detail">Starting it again with them rewrites its service and restarts it; the desk, the gateway and the assistant keep running.</p>
            <div className="restart-row">
              <button
                type="button"
                className="button secondary small"
                disabled={reapply.working}
                onClick={() =>
                  reapply.start("starting the engine again with every folder", () => supervise.reapply("engine"), () => {
                    onChanged();
                    return "The engine is running with every folder the registry names.";
                  })
                }
              >
                Start it again with the folders
              </button>
              <Command text={reapplyByHand(install)} />
            </div>
            <Acted acting={reapply.acting} />
          </div>
        </div>
      )}
      <RestartPart caps={caps} install={install} part="engine" onChanged={onChanged} />
    </div>
  );
}

const MODE: Record<string, string> = {
  off: "nobody signs in: whoever opens the desk is the operator",
  local: "the desk keeps the people and their passwords",
  oidc: "an identity provider signs people in",
};

function DeskPage({ caps, install, onChanged }: PageProps) {
  const s = caps.desk.settings;
  const unit = install?.services.find((x) => x.part === "desk") ?? null;
  const reaches: [string, string | null | undefined][] = [
    ["the engine", s?.engine_url],
    ["the gateway", s?.kvasir_url],
    ["the assistant", s?.assistant_url],
    ["the supervisor", s?.supervisor_url],
  ];
  return (
    <div className="settings">
      <Head title="Desk" under lede="The desk signs people in, holds their sessions, and passes each call on to the part that answers it. Its settings live in its configuration file." />
      <section className="pair">
        <div className="panel card">
          <h2>What it is</h2>
          <dl className="facts">
            <dt>version</dt>
            <dd>
              <span className="path">{caps.desk.version}</span>
            </dd>
            <dt>contracts</dt>
            <dd>{contractWords(caps.desk.contracts) || "none named"}</dd>
            <dt>sign-in</dt>
            <dd>{MODE[caps.desk.mode] ?? caps.desk.mode}</dd>
            {s && (
              <>
                <dt>answers at</dt>
                <dd>
                  <span className="path">{s.origin}</span>
                </dd>
              </>
            )}
            {unit && (
              <>
                <dt>runs as</dt>
                <dd>
                  <span className="path">{unit.unit}</span>
                </dd>
              </>
            )}
          </dl>
        </div>
        {s && (
          <div className="panel card">
            <h2>Sessions and exports</h2>
            <dl className="facts">
              <dt>a session lasts</dt>
              <dd>{s.session_hours} hours</dd>
              <dt>a call's token lasts</dt>
              <dd>{s.token_minutes} minutes</dd>
              <dt>a command line sign-in lasts</dt>
              <dd>{s.cli_token_hours} hours</dd>
              <dt>may export a table</dt>
              <dd>{s.export === "off" ? "nobody" : `${s.export} and above`}</dd>
              <dt>kept in</dt>
              <dd>
                <span className="path">{s.store}</span>
              </dd>
            </dl>
            <p className="meta">{s.retention}</p>
          </div>
        )}
      </section>
      {s && (
        <section className="stack">
          <div className="section-head rule-top">
            <h2>What it reaches</h2>
          </div>
          <table className="thin">
            <tbody>
              {reaches
                .filter(([, url]) => Boolean(url))
                .map(([what, url]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    <td>
                      <span className="path">{url}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
      <RestartPart caps={caps} install={install} part="desk" onChanged={onChanged} />
    </div>
  );
}

interface Station {
  id: string;
  purpose?: string;
  content?: string;
  ceiling?: string;
  budget?: Record<string, number>;
  writes?: string[];
}

function AssistantPage({ caps, install, onChanged }: PageProps) {
  const doc = caps.assistant as {
    assistant?: { version?: string };
    runtime?: Record<string, string>;
    stations?: Station[];
    retention?: { days?: number };
    conversations?: number;
    telemetry?: { content?: string };
  } | null;
  if (!doc) return null;
  const stations = doc.stations ?? [];
  const unit = install?.services.find((s) => s.part === "assistant") ?? null;
  return (
    <div className="settings">
      <Head title="Assistant" under lede="Each station does one kind of work within its budget, and never reaches further than the person it acts for." />
      <section className="panel card">
        <dl className="facts">
          <dt>version</dt>
          <dd>
            <span className="path">{doc.assistant?.version ?? "not known"}</span>
          </dd>
          {doc.runtime && (
            <>
              <dt>built on</dt>
              <dd>
                {Object.entries(doc.runtime)
                  .map(([name, v]) => `${name} ${v}`)
                  .join(" · ")}
              </dd>
            </>
          )}
          {typeof doc.conversations === "number" && (
            <>
              <dt>conversations</dt>
              <dd className="num">
                {doc.conversations.toLocaleString("en-GB")}
                {doc.retention?.days ? `, each kept ${doc.retention.days} days` : ""}
              </dd>
            </>
          )}
          <dt>what it sends out</dt>
          <dd>{doc.telemetry?.content === "off" ? "no content of a conversation" : (doc.telemetry?.content ?? "not said")}</dd>
          {unit && (
            <>
              <dt>runs as</dt>
              <dd>
                <span className="path">{unit.unit}</span>
              </dd>
            </>
          )}
        </dl>
      </section>
      <section className="stack">
        <div className="section-head rule-top">
          <h2>Stations</h2>
          <span className="meta">{stations.length === 1 ? "one station" : `${stations.length} stations`}</span>
        </div>
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Station</th>
                <th>Carries</th>
                <th>Reaches at most</th>
                <th>A run may spend</th>
                <th>Writes</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.id}
                    {s.purpose && <div className="meta">{s.purpose}</div>}
                  </td>
                  <td>{s.content && <span className="tag">{s.content}</span>}</td>
                  <td>{s.ceiling}</td>
                  <td className="meta">
                    {Object.entries(s.budget ?? {})
                      .map(([k, v]) => `${v.toLocaleString("en-GB")} ${k.replace(/_/g, " ")}`)
                      .join(", ")}
                  </td>
                  <td className="meta">{s.writes && s.writes.length > 0 ? s.writes.join(", ") : "nothing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <RestartPart caps={caps} install={install} part="assistant" onChanged={onChanged} />
    </div>
  );
}
