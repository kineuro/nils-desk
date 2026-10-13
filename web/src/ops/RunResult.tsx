// SPDX-License-Identifier: AGPL-3.0-only
// A run's result, one unit at a time (2026-10-13; Nima: "there is no way for
// me to see the samseg result! why?"): the scan a unit's mask is on, the mask
// drawn over it as the check reader draws it, read only. Each part set is a
// chip (Lesions, Structures), the mask's keys are the reader's (o hides it,
// f fill and outline, [ and ] its opacity), the pictures take their own
// keys, and Previous and Next step through the run's units with a mask. The
// unit's files are listed under it, by name, kind and size.

import { useEffect, useState } from "react";
import { StackView } from "../campaigns/StackView";
import { engineWords } from "../models/ModelsPage";
import { href, narrow } from "../routes";
import { Wait } from "../ui/Wait";
import { DEFAULT_LOOK, useMaskKeys, type MaskLook } from "../viewer/maskLook";
import type { MaskProp } from "../viewer/useMask";
import { fileName, filesByUnit, labelsOf, layersOf, layerWords, shortName, sizeWords, viewableUnits, type ResultLayer } from "./results";
import { runs, type Derivative, type RunDetail } from "./runs";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; run: RunDetail; files: Derivative[] };

/** The page: the run and its files read once, then the unit's result. */
export function RunResultPage({ id, unit }: { id: number; unit: string }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    let alive = true;
    Promise.all([runs.get(id), runs.derivatives(id)]).then(
      ([run, d]) => alive && setLoad({ kind: "ready", run, files: d.derivatives }),
      (e: unknown) => alive && setLoad({ kind: "failed", why: engineWords(e) }),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  if (load.kind === "loading") return <Wait phase="reading the run's files" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">Run {id}&apos;s files could not be read: {load.why}</p>;
  return <ResultView key={unit} run={load.run} files={load.files} unit={unit} />;
}

/** The address of a unit's result on its run's page. */
export const resultHref = (run: number, unit: string): string => narrow(href("pipelines", "runs", String(run)), { view: unit });

/** The mask a layer is drawn as: its layer on the scan, the look, and every value's colour. */
export function maskOf(l: ResultLayer, look: MaskLook, labels: number[] | null): MaskProp {
  const values = l.labels ?? labels;
  return {
    layer: { derivative: l.derivative, set: l.set },
    look,
    max: l.kind === "labels" ? Math.max(1, ...(values ?? [l.max])) : l.max,
    labels: l.kind === "labels" && values ? values : undefined,
  };
}

/** One unit's result as the page draws it from what it read. */
export function ResultView({ run, files, unit }: { run: RunDetail; files: Derivative[]; unit: string }) {
  const units = (run.units_run ?? []).map((u) => u.unit).filter((u): u is string => typeof u === "string");
  const mine = filesByUnit(files, units).units.get(unit) ?? [];
  const layers = layersOf(mine, unit);
  const order = viewableUnits(files, units);
  const at = order.indexOf(unit);
  const [chosen, setChosen] = useState(0);
  const [look, setLook] = useState<MaskLook>(DEFAULT_LOOK);
  useMaskKeys(setLook, layers.length > 0);
  const l = layers[chosen] ?? layers[0] ?? null;
  // a label map whose names the file does not carry: its values from its parts door, for their colours
  const [read, setRead] = useState<Record<string, number[]>>({});
  const readKey = l ? `${l.derivative}/${l.set}` : "";
  const needs = l !== null && l.kind === "labels" && l.labels === null && !(readKey in read);
  useEffect(() => {
    if (!needs || !l) return;
    let alive = true;
    labelsOf(l.derivative, l.set).then(
      (v) => alive && setRead((was) => ({ ...was, [readKey]: v })),
      () => alive && setRead((was) => ({ ...was, [readKey]: [] })),
    );
    return () => {
      alive = false;
    };
  }, [needs, readKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const many = new Set(layers.map((x) => x.derivative)).size > 1;
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  return (
    <section className="stack run-result">
      <div className="row actions result-head">
        <b className="path result-unit">{unit}</b>
        {l && <span className="meta">on scan {l.stack}</span>}
        <span className="grow" />
        {order.length > 1 && (
          <span className="meta num">
            {at + 1} of {order.length}
          </span>
        )}
        {prev && (
          <a className="button quiet small" href={resultHref(run.id, prev)}>
            Previous
          </a>
        )}
        {next && (
          <a className="button quiet small" href={resultHref(run.id, next)}>
            Next
          </a>
        )}
        <a className="button secondary small" href={href("pipelines", "runs", String(run.id))}>
          Back to run {run.id}
        </a>
      </div>
      {l === null ? (
        <p className="meta">This unit made no mask to draw.</p>
      ) : (
        <>
          <div className="row result-tools">
            <div className="chips" role="group" aria-label="what is drawn">
              {layers.map((x, i) => (
                <button key={`${x.derivative}/${x.set}`} type="button" className={x === l ? "tag brand" : "tag"} aria-pressed={x === l} onClick={() => setChosen(i)}>
                  {layerWords(x, many)}
                </button>
              ))}
            </div>
            <span className="grow" />
            <button type="button" className={look.shown ? "button secondary small on" : "button secondary small"} aria-pressed={look.shown} title="the mask on and off; held down, hidden until let go (o); fill and outline (f); opacity ([ and ])" onClick={() => setLook((v) => ({ ...v, shown: !v.shown }))}>
              Mask <kbd>o</kbd>
            </button>
          </div>
          {needs ? <Wait phase="reading the label map's values" since={Date.now()} size="panel" /> : <StackView stack={l.stack} view="stack" keys mask={maskOf(l, look, read[readKey] ?? null)} />}
        </>
      )}
      {mine.length > 0 && (
        <div className="table-wrap">
          <table className="thin run-files">
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th className="num">Size</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((f) => (
                <tr key={f.id}>
                  <td className="path run-file" title={`file ${f.id} · ${fileName(f)}`}>
                    {shortName(fileName(f), unit)}
                  </td>
                  <td>{f.kind}</td>
                  <td className="num">{sizeWords(f.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
