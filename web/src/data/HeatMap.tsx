// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's main scans, visit by visit (Wave 7a, record 55 H3; picksHeat.ts):
// the role chosen as a key (only the chosen key in colour), its sessions
// picked, doubted and missing over the whole cohort on one line, and the
// subjects a page at a time, one row each, one cell a session, the cell's
// state its colour and a person's pick its border. A cell opens the cohort's
// Main scans, where picks are made. A layer (record 55, decision 6: body
// region, body part or post-contrast, as on the Main scans map) colours each
// cell by the value of the scan picked, filled, or by what most of the
// session's scans are, outlined; says whether the step that answers it has
// run over the cohort; and offers its Run where it has not.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { href, narrow } from "../routes";
import { LAYERS, layerName, layerSlot, layerStepWords, layerWord, visitLayerWords, type Layer } from "../review/mainScans";
import { cellWords, heatDrawn, picksDoors, totalsWords, type HeatPage } from "./picksHeat";
import { runControl, startedWords, stepRuns } from "./stepRun";
import { roleWord } from "./summary";
import "./heat.css";

/** The heatmap's layer keys: the picks themselves first. */
const HEAT_LAYERS: { key: Layer | null; words: string }[] = [{ key: null, words: "Picks" }, ...LAYERS.slice(1)];

const LAYER_KEY = "nils.heat.layer";

function keptLayer(): Layer | null {
  try {
    const v = sessionStorage.getItem(LAYER_KEY);
    return v === "body_region" || v === "body_part" || v === "post_contrast" ? v : null;
  } catch {
    return null;
  }
}

function keepLayer(l: Layer | null) {
  try {
    if (l) sessionStorage.setItem(LAYER_KEY, l);
    else sessionStorage.removeItem(LAYER_KEY);
  } catch {
    // a browser that keeps nothing keeps the layer for this page only
  }
}

export function HeatMap({ cohort, caps }: { cohort: string; caps?: Capabilities }) {
  const [page, setPage] = useState<HeatPage | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [layer, setLayerState] = useState<Layer | null>(keptLayer);
  const [reload, setReload] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const setLayer = (l: Layer | null) => {
    setLayerState(l);
    setSaid(null);
    keepLayer(l);
  };
  useEffect(() => {
    let alive = true;
    setWhy(null);
    picksDoors.page(cohort, null, undefined, layer).then(
      (p) => alive && setPage(p),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [cohort, layer, reload]);
  // while the layer's step waits or runs over the cohort, the page is read again now and then
  const state = layer !== null && page?.layer?.layer === layer ? (page.layer.step?.state ?? null) : null;
  useEffect(() => {
    if (state !== "queued" && state !== "running") return;
    const t = setTimeout(() => setReload((x) => x + 1), 15_000);
    return () => clearTimeout(t);
  }, [state, reload]);
  if (why) return <p className="warn">The main scans could not be read: {why}</p>;
  if (!page) return <p className="meta">Reading the main scans.</p>;
  if (page.roles.length === 0 || page.subjects.length === 0) return <HeatEmpty cohort={cohort} />;
  const on = role && page.roles.includes(role) ? role : page.roles[0];
  const open = narrow(href("review", "picks"), { cohort });
  // the layer, once the page is of the layer chosen
  const head = layer !== null && page.layer?.layer === layer ? page.layer : null;
  const unanswered = layer !== null && page.layer === undefined;
  const scope = { kind: "cohort" as const, name: cohort };
  const step = head ? layerStepWords(head.layer, scope, head.step) : null;
  const control = caps && head?.step && head.step.state !== "done" ? runControl(caps, "cohorts", head.step) : null;
  const run = () => {
    const st = head?.step?.step;
    if (st !== "body_part" && st !== "post_contrast") return;
    setRunning(true);
    setSaid(null);
    stepRuns.start("cohorts", cohort, st).then(
      () => {
        setRunning(false);
        setSaid(startedWords(cohort, st));
        setReload((x) => x + 1);
      },
      (e: unknown) => {
        setRunning(false);
        setSaid(`Not started: ${messageOf(e)}`);
      },
    );
  };
  const next = () => {
    if (page.next === null) return;
    setMore(true);
    picksDoors.page(cohort, page.next, undefined, layer).then(
      (p) => {
        setPage({ ...page, subjects: [...page.subjects, ...p.subjects], next: p.next });
        setMore(false);
      },
      (e: Error) => {
        setWhy(e.message);
        setMore(false);
      },
    );
  };
  return (
    <div className="heat">
      <div className="heat-head">
        <span className="chips" role="group" aria-label="Role">
          {page.roles.map((r) => (
            <button key={r} type="button" className={r === on ? "opt on" : "opt"} aria-pressed={r === on} onClick={() => setRole(r)}>
              {roleWord(r)}
            </button>
          ))}
        </span>
        <span className="meta heat-totals">{totalsWords(page.totals[on])} sessions</span>
        <span className="chips heat-layers" role="group" aria-label="Layer">
          {HEAT_LAYERS.map((l) => (
            <button key={l.words} type="button" className={l.key === layer ? "opt on" : "opt"} aria-pressed={l.key === layer} onClick={() => setLayer(l.key)}>
              {l.words}
            </button>
          ))}
        </span>
      </div>
      {unanswered && <p className="meta">This engine does not draw layers on the heatmap yet.</p>}
      {head && step && (
        <div className="heat-step">
          <span className={step.ran ? "meta" : "meta heat-not-run"}>{step.words}</span>
          {control && (
            <button type="button" className="button secondary small" disabled={control.disabled || running} title={control.why ?? undefined} onClick={run}>
              {control.label}
            </button>
          )}
        </div>
      )}
      {said && (
        <p className="meta" role="status">
          {said}
        </p>
      )}
      <ol className="heat-rows" aria-label={`Main ${roleWord(on)} by visit`}>
        {page.subjects.map((s) => (
          <li key={s.id} className="heat-row">
            <span className="heat-code mono" title={s.code}>
              {s.code}
            </span>
            <span className="heat-cells">
              {s.sessions.map((v) => {
                const c = v.roles[on];
                const key = `${v.session ?? v.studies.join(".")}`;
                if (head) {
                  const d = heatDrawn(v, on);
                  const slot = d ? layerSlot(head.layer, d.value) : null;
                  const words = `${cellWords(v, on)}; ${d ? `${layerName(head.layer).toLowerCase()} ${layerWord(head.layer, d.value)}${d.taken ? "" : ", none picked"}` : "no answer"}${v.layer ? ` (${visitLayerWords(head.layer, v.layer)})` : ""}`;
                  return <a key={key} className={`heat-cell layered${d === null ? " none" : d.taken ? "" : " held"}`} href={open} title={words} aria-label={words} {...(slot !== null ? { "data-slot": slot } : {})} />;
                }
                return <a key={key} className={`heat-cell ${c?.state ?? "missing"}${c?.by === "person" ? " by-person" : ""}`} href={open} title={cellWords(v, on)} aria-label={cellWords(v, on)} />;
              })}
            </span>
          </li>
        ))}
      </ol>
      <div className="heat-foot">
        {head ? (
          <span className="heat-key">
            {head.values.map((v) => {
              const slot = layerSlot(head.layer, v);
              return (
                <span key={v} className="value-tag heat-value" {...(slot !== null ? { "data-slot": slot } : {})}>
                  {layerWord(head.layer, v)}
                </span>
              );
            })}
            <span>filled: the scan picked · outlined: none picked, what most scans are</span>
          </span>
        ) : (
          <span className="heat-key">
            <i className="heat-cell picked" aria-hidden="true" /> picked <i className="heat-cell doubted" aria-hidden="true" /> doubted <i className="heat-cell missing" aria-hidden="true" /> missing{" "}
            <i className="heat-cell picked by-person" aria-hidden="true" /> a person&apos;s pick
          </span>
        )}
        <span className="meta">
          {page.subjects.length.toLocaleString("en-US")} of {page.total.toLocaleString("en-US")} subjects
        </span>
        {page.next !== null && (
          <button type="button" className="button quiet small" disabled={more} onClick={next}>
            {more ? "Reading" : "More subjects"}
          </button>
        )}
        <a className="button secondary small" href={open}>
          Main scans
        </a>
      </div>
    </div>
  );
}

function HeatEmpty({ cohort }: { cohort: string }) {
  return (
    <p className="meta">
      No main scan picked yet. <a href={narrow(href("review", "picks"), { cohort })}>Main scans</a> picks them by the cohort&apos;s rules.
    </p>
  );
}
