// SPDX-License-Identifier: AGPL-3.0-only
// Home, as the chosen design draws it (option A): what is installed and how
// it answers, and the four tiles of what the registry holds, what needs you,
// what is running and what changed since you were last here. For an operator
// a line says how far setup is while a step is left, and opens it. Every line
// is read from a door; a door this deployment does not serve, or that this
// person may not open, takes its part of the page with it.

import { useCallback, useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served, holds } from "../deployment";
import { objects, type Summary } from "../objects/client";
import { placesKept } from "../objects/kept";
import { data, ops } from "../ops/client";
import { href } from "../routes";
import { backupsKept } from "../settings/kept";
import { kvasir } from "../settings/kvasir";
import type { Install } from "../settings/supervise";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { progressWords, setupSteps } from "./setup";
import type { Purpose } from "./steps";
import { holdsTile, lastVisit, markVisit, needsTile, runningTile, sinceTile, tilesOffered, type Tile, type TileId } from "./tiles";

interface Loaded {
  summary: Summary | null;
  since: Summary | null;
  open: number | null;
  jobs: JobRow[] | null;
  batches: number | null;
  backups: JobRow[] | null;
  purposes: Purpose[] | null;
}

const NOTHING: Loaded = { summary: null, since: null, open: null, jobs: null, batches: null, backups: null, purposes: null };

/** A door's answer, or null where it failed: Home shows what it could read. */
function quietly<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null);
}

export function Home({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);
  const [last] = useState<string | null>(() => lastVisit());
  const places = useKept(placesKept);
  const archives = useKept(backupsKept);

  const load = useCallback(() => {
    const has = (d: string) => served(caps, d);
    // the places and the backups are kept for every page that reads them
    if (has("GET /api/places")) void placesKept.refresh().catch(() => undefined);
    if (has("GET /api/backups") && holds(caps, "admin")) void backupsKept.refresh().catch(() => undefined);
    void Promise.all([
      has("GET /api/summary") ? quietly(objects.summary()) : null,
      has("GET /api/summary") && last ? quietly(objects.summary(last)) : null,
      has("GET /api/review") && holds(caps, "reviewer") ? quietly(ops.review("open", undefined, 500)).then((r) => r?.count ?? null) : null,
      has("GET /api/jobs") ? quietly(ops.jobs(false, 50)).then((r) => r?.jobs ?? null) : null,
      has("GET /api/batches") ? quietly(data.batches(1000)).then((r) => r?.count ?? null) : null,
      has("GET /api/jobs")
        ? quietly(ops.jobs(true, 200)).then(
            (r) => r?.jobs.filter((j) => j.kind === "backup" && j.state === "done").sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? "")) ?? null,
          )
        : null,
      caps.kvasir !== null ? quietly(kvasir.purposes()).then((r) => r?.purposes.map((p) => ({ purpose: p.purpose, content: p.content, backend: p.backend })) ?? null) : null,
    ]).then(([summary, since, open, jobs, batches, backups, purposes]) => setLoaded({ summary, since, open, jobs, batches, backups, purposes }));
  }, [caps, last]);

  // read again when the registry moves, and every half minute for what runs
  const epoch = caps.engine?.registry.epoch ?? null;
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the epoch is what moves
  }, [epoch]);

  // this visit counts once the page has been read for a moment
  useEffect(() => {
    const t = setTimeout(() => markVisit(new Date().toISOString()), 10_000);
    return () => clearTimeout(t);
  }, []);

  // how far setup is, for an operator, while a step is left
  const setup =
    holds(caps, "operator") && served(caps, "GET /api/places") && places.value
      ? setupSteps({ caps, install, places: places.value.places, batches: loaded.batches, backups: loaded.backups, archives: archives.value, purposes: loaded.purposes })
      : [];
  const left = setup.filter((s) => !s.met);
  const needed = left.some((s) => s.required);
  const tiles = tilesOffered(caps)
    .map((id) => tile(id, loaded, caps, last))
    .filter((t): t is Tile => t !== null);

  return (
    <div className="home">
      <div className="home-head">
        <span className="eyebrow">Home</span>
        <h1>What NILS holds, and what needs you</h1>
      </div>
      <PartsStrip caps={caps} install={install} />
      {left.length > 0 && (
        <a className={needed ? "setup-line caution" : "setup-line"} href={href("settings", "setup")}>
          <Icon name={needed ? "alert" : "check"} />
          <span className="grow">{progressWords(setup)}</span>
          <span className="setup-line-go">Setup</span>
          <Icon name="chevron-right" />
        </a>
      )}
      {tiles.length > 0 && (
        <section className="tiles rule-top" aria-label="the registry now">
          {tiles.map((t) => (
            <div key={t.id} className="tile">
              <span className="eyebrow">{t.eyebrow}</span>
              <span className="value num">{t.value}</span>
              <span className="meta">{t.meta}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function tile(id: TileId, l: Loaded, caps: Capabilities, last: string | null): Tile | null {
  switch (id) {
    case "holds":
      return l.summary ? holdsTile(l.summary, caps.engine?.registry.schema_version) : null;
    case "needs":
      return l.open !== null ? needsTile(l.open) : null;
    case "running":
      return l.jobs !== null ? runningTile(l.jobs) : null;
    case "since":
      return l.summary || last === null ? sinceTile(last, l.since) : null;
  }
}

/** The parts this deployment has, each with a dot for whether it answers and its version. */
function PartsStrip({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const stations = ((caps.assistant?.["stations"] as unknown[] | undefined) ?? []).length;
  const listed = (name: string) => install?.parts[name] !== undefined;
  const items: { name: string; meta: string | null; tone: "ok" | "caution" | "blocked" }[] = [
    { name: "engine", meta: caps.engine?.engine.version ?? "does not answer", tone: caps.engine ? "ok" : "blocked" },
    { name: "desk", meta: caps.desk.version, tone: "ok" },
  ];
  if (caps.kvasir !== null || listed("kvasir")) items.push({ name: "Kvasir", meta: caps.kvasir === null ? "does not answer" : warming ? "warming" : null, tone: caps.kvasir === null ? "blocked" : warming ? "caution" : "ok" });
  if (caps.assistant !== null || listed("assistant"))
    items.push({ name: "assistant", meta: caps.assistant === null ? "does not answer" : stations > 0 ? `${stations} ${stations === 1 ? "station" : "stations"}` : null, tone: caps.assistant === null ? "blocked" : "ok" });
  if (install) {
    const postgres = install.backend.startsWith("postgres");
    const service = install.services.find((s) => s.part === "postgres");
    items.push({ name: postgres ? "Postgres" : "SQLite", meta: install.parts["postgres"]?.version ?? null, tone: service && !service.running ? "blocked" : "ok" });
  }
  return (
    <section className="panel parts-strip" aria-label="what is installed">
      {items.map((p) => (
        <span key={p.name} className="row">
          <span className={`dot ${p.tone}`} />
          {p.name}
          {p.meta && <span className="meta">{p.meta}</span>}
        </span>
      ))}
    </section>
  );
}
