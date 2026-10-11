// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's mask (record 55 H3, job type 3, slice D1): a result's layer
// read for the stack the viewer shows, drawn as a labelmap on the stack view
// and on the three planes (mask.ts), and its look set as it changes without
// a read. Kept apart from Viewer.tsx, which hands it what it built: the
// rendering engine, the viewports' ids, the level the stack view reads and
// the plan the planes end on.

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as cs from "@cornerstonejs/core";
import type { Manifest } from "./doors";
import { levelShape } from "./doors";
import { fitsScan, layerKey, layerManifest, useLayerState, type LayerManifest, type LayerRef } from "./layer";
import { attachLayer, decoder, detachLayer, imageId, labelPlane, labelsDrawn } from "./loader";
import { drawLabels, dropLabels, labelImageId, labelsLanded, labelVolume, labelVolumeId, lookLabels, segmentationIdOf, tableOf, undrawLabels, type Drawn } from "./mask";
import { DEFAULT_LOOK, type MaskLook, type Tone } from "./maskLook";
import { PLANES, type Plane } from "./prefetch";
import type { VolumePlan } from "./ring";

/** A result's mask over the scan a viewer shows. */
export interface MaskProp {
  layer: LayerRef;
  look?: MaskLook;
  /** The parts' tones by label; the one in focus is outlined thicker. */
  tones?: ReadonlyMap<number, Tone>;
  /** The largest label the layer holds: a components set's count, a label map's largest value. */
  max?: number;
  /** A labels set's values in their order, which gives each its colour. */
  labels?: readonly number[];
}

/** What the viewer's mask is doing, for the page and its tests. */
export type MaskState = "none" | "building" | "ready" | "failed" | "refused";

/** The planes' volume as the viewer built it: the plan they end on, the plane they fill from, and a count of the times their volumes were set. */
export interface PlanesBuilt {
  plan: VolumePlan;
  at: number;
  epoch: number;
}

export function useMask(o: {
  stack: number;
  manifest: Manifest | null;
  mask: MaskProp | null;
  engine: RefObject<cs.RenderingEngine | null>;
  ids: { stack: string; planes: Record<Plane, string> };
  stackEl: RefObject<HTMLDivElement | null>;
  stackReady: boolean;
  level: () => number;
  planes: PlanesBuilt | null;
  landed?: (where: "stack" | "planes") => void;
}): { state: MaskState; layer: LayerManifest | null; why: string | null } {
  const { stack, manifest, mask } = o;
  const ref = mask?.layer ?? null;
  const key = ref ? layerKey(stack, ref) : null;
  const [layer, setLayer] = useState<LayerManifest | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const waiting = useLayerState(key);
  const told = useRef(o.landed);
  told.current = o.landed;

  // the layer's manifest, once the scan's is read; a layer of another shape is not drawn
  useEffect(() => {
    setLayer(null);
    setWhy(null);
    if (!ref || !manifest) return;
    let alive = true;
    layerManifest(stack, ref)
      .then((lm) => {
        if (!alive) return;
        if (!fitsScan(lm, manifest)) return setWhy("the mask was built on another picture of this scan");
        setLayer(lm);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, manifest]);

  const look = mask?.look ?? DEFAULT_LOOK;
  const tonesKey = mask?.tones ? [...mask.tones].map(([l, t]) => `${l}${t[0]}`).join(",") : "";
  const labelsKey = mask?.labels?.join(",") ?? "";
  const table = useMemo(() => (layer ? tableOf(layer, mask?.max ?? 0, mask?.labels, mask?.tones) : null), [layer, mask?.max, labelsKey, tonesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = mask?.tones ? ([...mask.tones].find(([, t]) => t === "focus")?.[0] ?? null) : null;
  const lookNow = useRef({ look, table, focus });
  lookNow.current = { look, table, focus };
  const drawn = useRef<{ stack: Drawn | null; planes: Drawn | null }>({ stack: null, planes: null });

  // the stack view's labelmap at the level it reads, drawn once; let go with the layer or the viewer
  const stackDrawn = useRef<{ d: Drawn; level: number } | null>(null);
  const undrawStack = () => {
    if (!stackDrawn.current) return;
    undrawLabels(stackDrawn.current.d);
    stackDrawn.current = null;
    drawn.current.stack = null;
  };
  const drawStack = (level: number): Drawn | null => {
    if (!layer || !ref || !manifest) return null;
    if (stackDrawn.current?.level === level) return stackDrawn.current.d;
    undrawStack();
    const zs = Array.from({ length: levelShape(manifest, level)[0] }, (_, z) => z);
    const now = lookNow.current;
    const d = drawLabels(segmentationIdOf(stack, ref, "stack", level), { imageIds: zs.map((k) => labelImageId(stack, ref, level, k)), referencedImageIds: zs.map((k) => imageId(stack, level, k)) }, [o.ids.stack], now.table!, now.look, now.focus);
    stackDrawn.current = { d, level };
    drawn.current.stack = d;
    labelsDrawn(stack);
    return d;
  };
  const drawing = useRef(drawStack);
  drawing.current = drawStack;

  // the layer attached to the stack's planes as soon as it is known, so the planes the stack view reads come with their
  // labels; with the layer or the viewer, the labelmap taken off and the labels let go
  useEffect(() => {
    if (layer && ref) attachLayer(stack, ref, layer);
    return () => {
      undrawStack();
      detachLayer(stack);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  // the stack view: once the plane on the screen has its labels (made where it was decoded before the layer came), its
  // labelmap is drawn, so cornerstone never looks for labels that are not there; a plane paged to has its own made
  useEffect(() => {
    if (!layer || !ref || !o.stackReady || !manifest) return;
    const vp = o.engine.current?.getViewport(o.ids.stack) as cs.StackViewport | undefined;
    if (!vp || typeof vp.getCurrentImageIdIndex !== "function") return;
    const level = o.level();
    let alive = true;
    let first = true;
    const current = () => {
      const z = vp.getCurrentImageIdIndex();
      labelPlane(stack, level, z)
        .then((labels) => {
          if (!alive || labels === "none") return;
          const had = stackDrawn.current?.level === level;
          const d = drawing.current(level);
          if (!d) return;
          if (had && labels === "made") labelsLanded(d);
          if (first) {
            first = false;
            told.current?.("stack");
          }
        })
        .catch(() => undefined);
    };
    current();
    const element = o.stackEl.current;
    element?.addEventListener(cs.Enums.Events.STACK_NEW_IMAGE, current);
    return () => {
      alive = false;
      element?.removeEventListener(cs.Enums.Events.STACK_NEW_IMAGE, current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, o.stackReady, manifest]);

  // the three planes: the labelmap volume on the grid the planes end on, drawn on the three
  const planKey = o.planes ? `${o.planes.plan.level}/${o.planes.plan.stride}` : null;
  useEffect(() => {
    if (!layer || !ref || !manifest || !o.planes) return;
    const re = o.engine.current;
    const planeIds = PLANES.map((p) => o.ids.planes[p]).filter((id) => re?.getViewport(id));
    if (!re || planeIds.length === 0) return;
    const f = labelVolume(stack, ref, manifest, layer, o.planes.plan, decoder(), { at: o.planes.at });
    const now = lookNow.current;
    const d = drawLabels(segmentationIdOf(stack, ref, "planes", o.planes.plan.level, o.planes.plan.stride), { volumeId: f.volumeId }, planeIds, now.table!, now.look, now.focus);
    drawn.current.planes = d;
    let first = true;
    const tellOnce = () => {
      if (!first) return;
      first = false;
      told.current?.("planes");
    };
    const land = (planes?: number[]) => {
      labelsLanded(d, planes);
      tellOnce();
    };
    // labels that landed before are drawn with the volume (and told again once its actors are there)
    if (f.done || f.filled > 0) tellOnce();
    f.tell.add(land);
    return () => {
      f.tell.delete(land);
      undrawLabels(d);
      drawn.current.planes = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, manifest, planKey, o.planes?.epoch]);

  // the volume is let go with the stack, the layer or the plan, not when the planes' volumes are set again
  useEffect(() => {
    if (!layer || !ref || !o.planes) return;
    const plan = o.planes.plan;
    return () => {
      dropLabels(labelVolumeId(stack, ref, plan));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, planKey]);

  // the look: shown or hidden, fill, outline, opacity, tones; nothing is read
  useEffect(() => {
    if (!table) return;
    for (const d of [drawn.current.stack, drawn.current.planes]) if (d) lookLabels(d, look, table, focus);
  }, [look.shown, look.fill, look.outline, look.opacity, table, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const state: MaskState = !ref ? "none" : layer ? "ready" : why ? "refused" : waiting?.kind === "failed" ? "failed" : waiting?.kind === "refused" ? "refused" : "building";
  return { state, layer, why: why ?? (waiting?.kind === "refused" ? waiting.why : waiting?.kind === "failed" ? waiting.reason : null) };
}
