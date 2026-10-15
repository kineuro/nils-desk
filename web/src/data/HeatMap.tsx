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

import { useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { href, narrow } from "../routes";
import { keepLayer, keptLayer, LAYERS, layerName, layerSlot, layerStepWords, layerWord, stepNow, visitLayerWords, type Layer } from "../review/mainScans";
import { cellWords, heatDrawn, picksDoors, totalsWords, type HeatPage } from "./picksHeat";
import { runControl, startedWords, stepRuns } from "./stepRun";
import { roleWord, type SummaryStep } from "./summary";
import "./heat.css";

/** The heatmap's layer keys: the picks themselves first. */
const HEAT_LAYERS: { key: Layer | null; words: string }[] = [{ key: null, words: "Picks" }, ...LAYERS.slice(1)];

const LAYER_KEY = "nils.heat.layer";

/** How often the layer's step is read again while it waits or runs, in milliseconds. */
const STEP_POLL = 15_000;

export function HeatMap({ cohort, caps }: { cohort: string; caps?: Capabilities }) {
  // the pages read, with the layer they were asked for: cleared when the cohort or the layer changes
  const [shown, setShown] = useState<{ layer: Layer | null; page: HeatPage } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [layer, setLayerState] = useState<Layer | null>(() => keptLayer(LAYER_KEY));
  const [reload, setReload] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // the layer's step as the cohort's door said it last, while it waits or runs
  const [liveStep, setLiveStep] = useState<{ layer: Layer; step: SummaryStep; at: number } | null>(null);
  const [tick, setTick] = useState(0);
  // which reading is current: an answer to an older one (another cohort, layer or reload) is dropped
  const reading = useRef(0);
  const setLayer = (l: Layer | null) => {
    setLayerState(l);
    setSaid(null);
    keepLayer(LAYER_KEY, l);
  };
  useEffect(() => {
    const at = ++reading.current;
    setShown(null);
    setWhy(null);
    setMore(false);
    setLiveStep(null);
    picksDoors.page(cohort, null, undefined, layer).then(
      (p) => at === reading.current && setShown({ layer, page: p }),
      (e: Error) => at === reading.current && setWhy(e.message),
    );
  }, [cohort, layer, reload]);
  // while the layer's step waits or runs, the step alone is read again from the cohort's door; once it is over the
  // first page is read again
  const pageStep = shown && layer !== null && shown.layer === layer ? (shown.page.layer?.step ?? null) : null;
  const step0 = liveStep !== null && liveStep.layer === layer ? liveStep.step : pageStep;
  const state = step0?.state ?? null;
  useEffect(() => {
    if (layer === null || (state !== "queued" && state !== "running")) return;
    const operation = layer === "post_contrast" ? "post_contrast" : "body_part";
    let alive = true;
    const t = setTimeout(() => {
      stepNow({ kind: "cohort", name: cohort }, operation).then(
        (st) => {
          if (!alive || st === null) return;
          if (st.state === "queued" || st.state === "running") setLiveStep({ layer, step: st, at: Date.now() });
          else setReload((x) => x + 1);
        },
        () => alive && setTick((x) => x + 1),
      );
    }, STEP_POLL);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [cohort, layer, state, liveStep?.at, tick]);
  if (why) return <p className="warn">The main scans could not be read: {why}</p>;
  if (!shown) return <p className="meta">Reading the main scans.</p>;
  const page = shown.page;
  if (page.roles.length === 0 || page.subjects.length === 0) return <HeatEmpty cohort={cohort} />;
  const on = role && page.roles.includes(role) ? role : page.roles[0];
  const open = narrow(href("review", "picks"), { cohort });
  // the layer, once the page is of the layer chosen
  const head = layer !== null && shown.layer === layer && page.layer?.layer === layer ? { ...page.layer, step: step0 } : null;
  const unanswered = layer !== null && shown.layer === layer && page.layer === undefined;
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
    const at = reading.current;
    const asked = shown.layer;
    setMore(true);
    picksDoors.page(cohort, page.next, undefined, asked).then(
      (p) => {
        // only onto the pages of the same reading: never a page of another layer, cohort or reload
        if (at !== reading.current) return;
        setShown((was) => (was && was.layer === asked ? { layer: asked, page: { ...was.page, subjects: [...was.page.subjects, ...p.subjects], next: p.next } } : was));
        setMore(false);
      },
      (e: Error) => {
        if (at !== reading.current) return;
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
