// SPDX-License-Identifier: AGPL-3.0-only
// The viewer (Wave 5 section 8.2, grown by record 45 S2): the stack in
// cornerstone3D's stack viewport over the `nils:` loader, the level whose
// plane fits the viewport, the server's render as the first picture until the
// decoded plane lands; and the three planes, a cornerstone3D volume filled
// from the slab door at the level the budget allows (volume.ts), each plane
// lettered from the stack's orientation in its manifest. When the volume
// path is not taken (no WebGL2, over the budget, a failure) the planes are
// the server's render, and below detail quasi the render is all there is.
// The footer carries the viewer's own numbers: first image, frames per second
// over the last second, bytes moved, the volume's level and fill.

import { useCallback, useEffect, useRef, useState } from "react";
import * as cs from "@cornerstonejs/core";
import * as tools from "@cornerstonejs/tools";
import { DoorError } from "../ask/client";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { doors, levelShape, type Manifest } from "./doors";
import { cameraLabels, geometry, type EdgeLabels, type Vec3 } from "./geometry";
import { close, counters, imageId, open, register, viewWindow } from "./loader";
import { PLANES, serverPlane as serverPlaneOf, type Plane } from "./prefetch";
import { Letters, RenderPlane } from "./RenderPlane";
import { fps, levelFor } from "./ring";
import { dropVolume, fillVolume, volumePath, type Filling } from "./volume";
import "./viewer.css";

export { PLANES, type Plane } from "./prefetch";

/** The ids a page watching the viewer (the bench) finds its viewports by. */
export function viewerIds(stack: number): { engine: string; stack: string; planes: Record<Plane, string> } {
  return { engine: `re-${stack}`, stack: `vp-${stack}`, planes: { axial: `vp-${stack}-axial`, coronal: `vp-${stack}-coronal`, sagittal: `vp-${stack}-sagittal` } };
}

export type ViewerEvent =
  | { kind: "first-image"; ms: number; level: number }
  | { kind: "volume"; level: number; stride: number; bytes: number; filled: number; depth: number; done: boolean }
  | { kind: "fallback"; why: string };

export interface ViewerProps {
  stack: number;
  /** The level the rule read, when the item names one; else the level the viewport picks. */
  level?: number | null;
  /** The view it opens on. */
  view?: "stack" | "planes";
  /** The planes' budget in bytes, 256 MB when absent; a stack over it has the server's planes. */
  budget?: number;
  /** What the viewer did, for a page that watches it. */
  onEvent?: (e: ViewerEvent) => void;
  /** The view the person chose, for a page that keeps it for the next stack. */
  onView?: (view: "stack" | "planes") => void;
}

interface Numbers {
  firstImageMs: number | null;
  fps: number;
  bytes: number;
  planes: number;
  decodeMs: number;
  level: number;
  z: number;
}

interface VolumeState {
  level: number;
  stride: number;
  bytes: number;
  filled: number;
  depth: number;
  done: boolean;
}

const ORIENT: Record<Plane, cs.Enums.OrientationAxis> = {
  axial: cs.Enums.OrientationAxis.AXIAL,
  coronal: cs.Enums.OrientationAxis.CORONAL,
  sagittal: cs.Enums.OrientationAxis.SAGITTAL,
};

let inited: Promise<void> | null = null;
function initOnce(): Promise<void> {
  if (!inited) {
    inited = (async () => {
      await cs.init();
      tools.init();
      tools.addTool(tools.StackScrollTool);
      tools.addTool(tools.WindowLevelTool);
      tools.addTool(tools.ZoomTool);
      tools.addTool(tools.PanTool);
      register();
    })();
  }
  return inited;
}

/** The wheel scrolls, the left button windows, the right zooms, the middle pans. */
function toolGroup(id: string): tools.Types.IToolGroup {
  let group = tools.ToolGroupManager.getToolGroup(id);
  if (!group) {
    group = tools.ToolGroupManager.createToolGroup(id)!;
    group.addTool(tools.StackScrollTool.toolName);
    group.addTool(tools.WindowLevelTool.toolName);
    group.addTool(tools.ZoomTool.toolName);
    group.addTool(tools.PanTool.toolName);
    group.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] });
    group.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
    group.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }] });
    group.setToolActive(tools.PanTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Auxiliary }] });
  }
  return group;
}

export function Viewer({ stack, level: ruleLevel = null, view: initialView = "stack", budget, onEvent, onView }: ViewerProps) {
  const ids = viewerIds(stack);
  const el = useRef<HTMLDivElement | null>(null);
  const planeEls = useRef<Record<Plane, HTMLDivElement | null>>({ axial: null, coronal: null, sagittal: null });
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [gated, setGated] = useState(false);
  const [since] = useState(() => performance.now());
  const [numbers, setNumbers] = useState<Numbers>({ firstImageMs: null, fps: 0, bytes: 0, planes: 0, decodeMs: 0, level: 0, z: 0 });
  const [firstUrl, setFirstUrl] = useState<string | null>(null);
  const [decodedOnce, setDecodedOnce] = useState(false);
  const [view, setView] = useState<"stack" | "planes">(initialView);
  const [planesOpened, setPlanesOpened] = useState(initialView === "planes");
  const [volume, setVolume] = useState<VolumeState | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [labels, setLabels] = useState<Partial<Record<Plane | "stack", EdgeLabels>>>({});
  const [touched, setTouched] = useState<Partial<Record<Plane, boolean>>>({});
  const [serverPos, setServerPos] = useState<Record<Plane, number>>({ axial: 0.5, coronal: 0.5, sagittal: 0.5 });
  const stamps = useRef<number[]>([]);
  const engine = useRef<cs.RenderingEngine | null>(null);
  const filling = useRef<Filling | null>(null);
  const levelRef = useRef(0);
  const zRef = useRef(0);
  const tell = useRef(onEvent);
  tell.current = onEvent;

  // the manifest, or the reason there is none: a 403 is the gated case, the render path alone is tried
  useEffect(() => {
    let alive = true;
    setFailed(null);
    open(stack)
      .then((m) => alive && setManifest(m))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof DoorError && (e.status === 403 || e.status === 401)) setGated(true);
        setFailed(classify(e));
      });
    return () => {
      alive = false;
      close(stack);
    };
  }, [stack]);

  const stamp = useCallback(() => {
    const now = performance.now();
    stamps.current.push(now);
    if (stamps.current.length > 240) stamps.current.splice(0, stamps.current.length - 240);
  }, []);

  const letter = useCallback((key: Plane | "stack", vp: { getCamera: () => cs.Types.ICamera }) => {
    const cam = vp.getCamera();
    if (!cam.viewUp || !cam.viewPlaneNormal) return;
    const next = cameraLabels(cam.viewUp as Vec3, cam.viewPlaneNormal as Vec3);
    setLabels((l) => (JSON.stringify(l[key]) === JSON.stringify(next) ? l : { ...l, [key]: next }));
  }, []);

  // the stack viewport, once the manifest is here and the element is on the page
  const mount = useCallback(async () => {
    if (!manifest || !el.current) return;
    await initOnce();
    const width = el.current.clientWidth || 512;
    const level = ruleLevel ?? levelFor(width, manifest.shape[2], manifest.levels);
    levelRef.current = level;
    const [nz] = levelShape(manifest, level);
    const z0 = Math.floor(nz / 2);
    zRef.current = z0;
    // the first picture: the server's render, replaced when the decoded plane lands
    setFirstUrl(doors.renderUrl(stack, Math.min(manifest.levels - 1, level + 1), z0, manifest.window.width, manifest.window.center));
    const re = engine.current ?? new cs.RenderingEngine(ids.engine);
    engine.current = re;
    re.enableElement({ viewportId: ids.stack, type: cs.Enums.ViewportType.STACK, element: el.current });
    const vp = re.getViewport(ids.stack) as cs.StackViewport;
    const imageIds = Array.from({ length: nz }, (_, z) => imageId(stack, level, z));
    let first = true;
    el.current.addEventListener(cs.Enums.Events.IMAGE_RENDERED, () => {
      stamp();
      if (first) {
        first = false;
        setDecodedOnce(true);
        const ms = Math.round(performance.now() - since);
        tell.current?.({ kind: "first-image", ms, level });
        setNumbers((n) => ({ ...n, firstImageMs: ms }));
        letter("stack", vp);
      }
    });
    el.current.addEventListener(cs.Enums.Events.STACK_NEW_IMAGE, () => {
      zRef.current = vp.getCurrentImageIdIndex();
    });
    el.current.addEventListener(cs.Enums.Events.CAMERA_MODIFIED, () => letter("stack", vp));
    await vp.setStack(imageIds, z0);
    vp.setProperties(viewWindow(manifest));
    vp.render();
    toolGroup(`tg-${stack}`).addViewport(ids.stack, re.id);
    setNumbers((n) => ({ ...n, level, z: z0 }));
  }, [manifest, stack, ruleLevel, since, ids.engine, ids.stack, stamp, letter]);

  useEffect(() => {
    mount().catch((e: unknown) => setFailed(classify(e)));
    return () => {
      filling.current?.close();
      const vid = filling.current?.volumeId;
      filling.current = null;
      const re = engine.current;
      if (re) {
        try {
          tools.ToolGroupManager.destroyToolGroup(`tg-${stack}`);
          tools.ToolGroupManager.destroyToolGroup(`tg-${stack}-planes`);
          tools.SynchronizerManager.destroySynchronizer(`voi-${stack}`);
          re.destroy();
        } catch {
          // the elements are already gone
        }
        engine.current = null;
      }
      if (vid) dropVolume(vid);
    };
  }, [mount, stack]);

  // the three planes: the volume at the level the budget allows, filled from the current plane outwards
  const mountPlanes = useCallback(async () => {
    if (!manifest || !planesOpened || filling.current || fallback) return;
    const path = volumePath(manifest, budget);
    if ("why" in path) {
      setFallback(path.why);
      tell.current?.({ kind: "fallback", why: path.why });
      return;
    }
    const { plan } = path;
    await initOnce();
    const re = engine.current ?? new cs.RenderingEngine(ids.engine);
    engine.current = re;
    const planeIds = PLANES.map((p) => ids.planes[p]);
    for (const p of PLANES) {
      const element = planeEls.current[p];
      if (!element) throw new Error("the planes' elements are not on the page");
      re.enableElement({ viewportId: ids.planes[p], type: cs.Enums.ViewportType.ORTHOGRAPHIC, element, defaultOptions: { orientation: ORIENT[p] } });
    }
    const render = () => re.renderViewports(planeIds);
    const report = (filled: number, done: boolean) => {
      const s = { level: plan.level, stride: plan.stride, bytes: plan.bytes, filled, depth: plan.dims[2], done };
      setVolume(s);
      tell.current?.({ kind: "volume", ...s });
    };
    const f = fillVolume(stack, manifest, plan, Math.floor(zRef.current / plan.stride), (filled) => {
      render();
      report(filled, filling.current?.done ?? false);
    });
    filling.current = f;
    report(0, false);
    await cs.setVolumesForViewports(re, [{ volumeId: f.volumeId }], planeIds);
    const shown = viewWindow(manifest);
    for (const p of PLANES) {
      const vp = re.getViewport(ids.planes[p]) as cs.VolumeViewport;
      vp.setProperties(shown);
      const element = planeEls.current[p]!;
      element.addEventListener(cs.Enums.Events.CAMERA_MODIFIED, () => letter(p, vp));
      element.addEventListener(cs.Enums.Events.IMAGE_RENDERED, stamp);
      letter(p, vp);
    }
    toolGroup(`tg-${stack}-planes`);
    for (const id of planeIds) tools.ToolGroupManager.getToolGroup(`tg-${stack}-planes`)!.addViewport(id, re.id);
    // window and level move together across the three planes
    const sync = tools.SynchronizerManager.getSynchronizer(`voi-${stack}`) ?? tools.synchronizers.createVOISynchronizer(`voi-${stack}`, { syncInvertState: false, syncColormap: false });
    for (const id of planeIds) sync.add({ renderingEngineId: re.id, viewportId: id });
    render();
    await f.ready;
    if (filling.current === f) report(f.filled, true);
  }, [manifest, planesOpened, fallback, budget, stack, ids.engine, ids.planes, letter, stamp]);

  useEffect(() => {
    mountPlanes().catch((e: unknown) => {
      console.warn("the volume path failed; the planes are the server's render", e);
      const why = e instanceof DoorError ? "the slab door refused" : "the volume did not open here";
      filling.current?.close();
      filling.current = null;
      setFallback(why);
      tell.current?.({ kind: "fallback", why });
    });
  }, [mountPlanes]);

  // a hidden element has no size: tell cornerstone when a view comes back
  useEffect(() => {
    engine.current?.resize(true, true);
  }, [view]);

  // the footer's numbers, once a second
  useEffect(() => {
    const t = setInterval(() => {
      setNumbers((n) => ({ ...n, fps: fps(stamps.current, performance.now()), bytes: counters.bytes, planes: counters.planesDecoded, decodeMs: counters.decodeMs, level: levelRef.current, z: zRef.current }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (failed && gated) {
    // the gated case: the person may see the picture but not carry the bytes; the server's render alone
    return (
      <div className="viewer gated">
        <Failure failed={failed} />
        <p className="meta">The render path is what disclosure allows here.</p>
        <GatedRender stack={stack} />
      </div>
    );
  }
  if (failed) return <Failure failed={failed} />;
  if (!manifest) return <Wait phase="reading the stack's manifest" since={Date.now()} size="panel" />;
  const [nz, ny, nx] = manifest.shape;
  const g = geometry(manifest);
  // the same addresses the reader warms ahead (prefetch.ts), so a warmed plane is drawn from the cache
  const serverPlane = (p: Plane, pos: number) => {
    const s = serverPlaneOf(stack, manifest, g, p, pos);
    return <RenderPlane src={s.src} axes={s.axes} known={s.known} />;
  };
  const volumeDone = volume?.done ?? false;
  return (
    <div className="viewer">
      <div className="viewer-axes" role="tablist" aria-label="view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "stack"}
          className={view === "stack" ? "on" : ""}
          onClick={() => {
            setView("stack");
            onView?.("stack");
          }}
        >
          the stack
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "planes"}
          className={view === "planes" ? "on" : ""}
          onClick={() => {
            setView("planes");
            setPlanesOpened(true);
            onView?.("planes");
          }}
        >
          three planes
        </button>
        {(manifest.annotation?.burned_in || manifest.held) && <span className="tag caution">burned-in annotation held</span>}
        {!g.regular && <span className="tag caution">planes not evenly spaced</span>}
      </div>
      <div className="viewer-stage" hidden={view !== "stack"}>
        <div ref={el} className="viewer-element" />
        {firstUrl && !decodedOnce && <img className="viewer-first" src={firstUrl} alt="" />}
        {decodedOnce && <Letters labels={labels.stack ?? null} unknown={!g.known} />}
      </div>
      {planesOpened && !fallback && (
        <div className="viewer-planes" hidden={view !== "planes"}>
          {PLANES.map((p) => (
            <div key={p} className="viewer-plane" onWheelCapture={() => setTouched((t) => (t[p] ? t : { ...t, [p]: true }))} onPointerDownCapture={() => setTouched((t) => (t[p] ? t : { ...t, [p]: true }))}>
              <div
                ref={(node) => {
                  planeEls.current[p] = node;
                }}
                className="viewer-element"
                data-plane={p}
              />
              {!volumeDone && !touched[p] && <div className="viewer-first">{serverPlane(p, 0.5)}</div>}
              {(volumeDone || touched[p]) && <Letters labels={labels[p] ?? null} unknown={!g.known} />}
              <span className="viewer-plane-name">{p}</span>
            </div>
          ))}
        </div>
      )}
      {view === "planes" && !fallback && volume && volume.stride > 1 && (
        <p className="meta viewer-note">
          Every {volume.stride === 2 ? "second" : volume.stride === 3 ? "third" : `${volume.stride}th`} plane: the stack is deeper than this card holds. The stack view has them all.
        </p>
      )}
      {planesOpened && fallback && (
        <div className="viewer-planes" hidden={view !== "planes"}>
          {PLANES.map((p) => (
            <div key={p} className="viewer-plane viewer-plane-server">
              {serverPlane(p, serverPos[p])}
              <span className="viewer-plane-name">{p}</span>
              <input type="range" min={0} max={1} step={0.001} value={serverPos[p]} onChange={(e) => setServerPos((s) => ({ ...s, [p]: Number(e.target.value) }))} aria-label={`${p} position`} />
            </div>
          ))}
        </div>
      )}
      <p className="viewer-foot meta">
        {numbers.firstImageMs !== null ? `first image ${numbers.firstImageMs} ms` : "first image pending"}; {numbers.fps} fps; {(numbers.bytes / 1e6).toFixed(1)} MB moved; {numbers.planes} planes decoded
        {numbers.planes > 0 && ` at ${Math.round(numbers.decodeMs / numbers.planes)} ms each`}; level {numbers.level} of {manifest.levels}; plane {numbers.z + 1} of {nz}; {nx} by {ny} at {manifest.spacing[2]} mm
        {volume && `; planes at level ${volume.level}${volume.stride > 1 ? `, every ${volume.stride} planes` : ""}, ${volume.done ? "whole" : `${volume.filled} of ${volume.depth}`}, ${Math.round(volume.bytes / 1e6)} MB`}
        {fallback && `; planes from the server: ${fallback}`}; wheel scrolls, left windows, right zooms
      </p>
    </div>
  );
}

/** The gated case: the server's render of the middle plane, nothing else in the browser. */
function GatedRender({ stack }: { stack: number }) {
  const [z, setZ] = useState(0.5);
  return (
    <div className="viewer-mpr">
      <img src={`/api/instances/${stack}/render/2/${Math.round(z * 1000)}?axis=z`} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
      <input type="range" min={0} max={1} step={0.001} value={z} onChange={(e) => setZ(Number(e.target.value))} aria-label="plane" />
    </div>
  );
}
