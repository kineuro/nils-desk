// SPDX-License-Identifier: AGPL-3.0-only
// Home, as the chosen design draws it (option A): what is installed and how
// it answers, the steps that make the install ready for real work, and the
// four tiles of what the registry holds, what needs you, what is running and
// what changed since you were last here. Every line is read from a door; a
// door this deployment does not serve, or that this person may not open,
// takes its part of the page with it.

import { useCallback, useEffect, useState } from "react";
import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served, holds } from "../deployment";
import { objects, type Place, type Summary } from "../objects/client";
import { data, ops } from "../ops/client";
import { kvasir } from "../settings/kvasir";
import type { Install } from "../settings/supervise";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { BringInStep } from "./BringIn";
import type { Pack } from "./look";
import { headline, lede, next, steps, type Purpose, type Step } from "./steps";
import { holdsTile, lastVisit, markVisit, needsTile, runningTile, sinceTile, tilesOffered, type Tile, type TileId } from "./tiles";

interface Loaded {
  summary: Summary | null;
  since: Summary | null;
  open: number | null;
  jobs: JobRow[] | null;
  places: Place[] | null;
  batches: number | null;
  backups: JobRow[] | null;
  purposes: Purpose[] | null;
  packs: Pack[] | null;
}

const NOTHING: Loaded = { summary: null, since: null, open: null, jobs: null, places: null, batches: null, backups: null, purposes: null, packs: null };

/** A door's answer, or null where it failed: Home shows what it could read. */
function quietly<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null);
}

export function Home({ caps, install, onChanged }: { caps: Capabilities; install: Install | null; onChanged: () => void }) {
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);
  const [last] = useState<string | null>(() => lastVisit());

  const load = useCallback(() => {
    const has = (d: string) => served(caps, d);
    void Promise.all([
      has("GET /api/summary") ? quietly(objects.summary()) : null,
      has("GET /api/summary") && last ? quietly(objects.summary(last)) : null,
      has("GET /api/review") && holds(caps, "reviewer") ? quietly(ops.review("open", undefined, 500)).then((r) => r?.count ?? null) : null,
      has("GET /api/jobs") ? quietly(ops.jobs(false, 50)).then((r) => r?.jobs ?? null) : null,
      has("GET /api/places") ? quietly(objects.places()).then((r) => r?.places ?? null) : null,
      has("GET /api/batches") ? quietly(data.batches(1000)).then((r) => r?.count ?? null) : null,
      has("GET /api/jobs")
        ? quietly(ops.jobs(true, 200)).then(
            (r) => r?.jobs.filter((j) => j.kind === "backup" && j.state === "done").sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? "")) ?? null,
          )
        : null,
      caps.kvasir !== null ? quietly(kvasir.purposes()).then((r) => r?.purposes.map((p) => ({ purpose: p.purpose, content: p.content, backend: p.backend })) ?? null) : null,
      has("GET /api/packs") ? quietly(data.packs()).then((r) => r?.packs ?? null) : null,
    ]).then(([summary, since, open, jobs, places, batches, backups, purposes, packs]) =>
      setLoaded({ summary, since, open, jobs, places, batches, backups, purposes, packs }),
    );
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

  const all = steps({ caps, install, places: loaded.places, batches: loaded.batches, backups: loaded.backups, purposes: loaded.purposes });
  const opens = next(all);
  const band = holds(caps, "operator") && opens !== null;
  const tiles = tilesOffered(caps)
    .map((id) => tile(id, loaded, caps, last))
    .filter((t): t is Tile => t !== null);

  return (
    <div className="home">
      <div className="home-head">
        <span className="eyebrow">Home</span>
        <h1>{band ? headline(all) : "What NILS holds, and what needs you"}</h1>
        {band && <p className="lede">{lede(all)}</p>}
      </div>
      <PartsStrip caps={caps} install={install} />
      {band && (
        <section className="band" aria-label="get this install ready">
          <div className="band-head rule-top">
            <h2>Get this install ready</h2>
            <span className="meta">This band leaves Home once every step is done.</span>
          </div>
          {all.map((s, i) =>
            s.id === "dicom" && s === opens ? (
              <BringInStep
                key={s.id}
                n={i + 1}
                step={s}
                caps={caps}
                install={install}
                places={loaded.places ?? []}
                packs={loaded.packs ?? []}
                onDone={() => {
                  load();
                  onChanged();
                }}
              />
            ) : (
              <StepRow key={s.id} n={i + 1} step={s} next={s === opens} />
            ),
          )}
        </section>
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

function StepNo({ n, step }: { n: number; step: Step }) {
  if (step.state === "done")
    return (
      <span className="stepno done" title="done">
        <Icon name="check" />
      </span>
    );
  if (step.state === "attention")
    return (
      <span className="stepno attention" title="needs a decision">
        <Icon name="alert" />
      </span>
    );
  return <span className={`stepno${step.state === "now" ? " now" : ""}`}>{n}</span>;
}

function StepRow({ n, step, next: isNext }: { n: number; step: Step; next: boolean }) {
  return (
    <div className="step">
      <StepNo n={n} step={step} />
      <div className="step-body">
        <h3>{step.title}</h3>
        <p className="meta">{step.words}</p>
        {step.tags.length > 0 && (
          <div className="tags">
            {step.tags.map((t) => (
              <span key={t.text} className={`tag${t.tone === "caution" ? " caution" : ""}`}>
                {t.tone === "caution" && <Icon name="alert" />}
                {t.text}
              </span>
            ))}
          </div>
        )}
        {step.id === "model" && step.state !== "done" && (
          <p className="meta">
            To choose the model, run <Command text="nils setup" /> again on this machine; it asks what the assistant talks to.
          </p>
        )}
      </div>
      {isNext ? <span className="tag brand">next</span> : <span />}
    </div>
  );
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
  if (caps.kvasir !== null || listed("kvasir")) items.push({ name: "gateway", meta: caps.kvasir === null ? "does not answer" : warming ? "warming" : null, tone: caps.kvasir === null ? "blocked" : warming ? "caution" : "ok" });
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
