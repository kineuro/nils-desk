// SPDX-License-Identifier: AGPL-3.0-only
// The viewer (Wave 5 section 8.2, grown by record 45 S2): the stack in
// cornerstone3D's stack viewport over the `nils:` loader, the level whose
// plane fits the viewport, the server's render as the first picture until the
// decoded plane lands; and the three planes, a cornerstone3D volume filled
// from the slab door at the level the budget allows (volume.ts), each plane
// lettered from the stack's orientation in its manifest. When the volume
// path is not taken (no WebGL2, over the budget, a failure) the planes are
// the server's render, and below detail quasi the render is all there is.
// The viewer's own numbers (first image, frames per second over the last
// second, bytes moved, the volume's level and fill) open on a small `i`
// beside the views; they are not in a reader's way (record 48).
//
// An oblique stack (record 48, after the learners report) is cut in its own
// planes by default: each of the three is the volume axis nearest the
// patient's plane, turned the radiological way, so an axial planned along
// the AC-PC line shows its sagittal and coronal with the head as the
// operator aligned it rather than tilted by the planning angle. The
// scanner's axes are one click away and kept (geometry.ts, planeCameras).
//
// In the reader (after the first gold campaign) the pictures take the keys
// of keys.ts: Space or a double click enlarges one plane to the whole side
// and gives the three back, the arrows page the stack or a plane.
//
// A reader moves from stack to stack many times an hour, so the next
// stack's first picture must not wait on cornerstone. The page keeps one
// rendering engine (one WebGL context) for every viewer it shows, and a
// viewer that goes gives back its viewports rather than the context; the
// three planes open on the server's planes (which the reader warmed ahead,
// prefetch.ts) and the volume starts filling only once they are drawn; the
// stack's own viewport is built when the stack view is first shown.

import { useCallback, useEffect, useRef, useState } from "react";
import * as cs from "@cornerstonejs/core";
import * as tools from "@cornerstonejs/tools";
import { DoorError } from "../ask/client";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { cutsAcross, doors, levelShape, type Manifest } from "./doors";
import { cameraLabels, geometry, planeCameras, type EdgeLabels, type Planes, type Vec3 } from "./geometry";
import { close, counters, imageId, open, register, viewWindow } from "./loader";
import { PLANES, serverPlane as serverPlaneOf, type Plane } from "./prefetch";
import { Letters, RenderPlane } from "./RenderPlane";
import { fps, levelFor } from "./ring";
import { dropVolume, fillVolume, volumePath, type Filling } from "./volume";
import { viewerKey } from "./keys";
import "./viewer.css";

export { PLANES, type Plane } from "./prefetch";

/** The one rendering engine the page's viewers share: its WebGL context outlives each stack. */
export const ENGINE_ID = "nils-viewer";

/** The ids a page watching the viewer (the bench) finds its viewports by. */
export function viewerIds(stack: number): { engine: string; stack: string; planes: Record<Plane, string> } {
  return { engine: ENGINE_ID, stack: `vp-${stack}`, planes: { axial: `vp-${stack}-axial`, coronal: `vp-${stack}-coronal`, sagittal: `vp-${stack}-sagittal` } };
}

/** The shared engine, made at the first use; a destroyed one is made again. */
function sharedEngine(): cs.RenderingEngine {
  return (cs.getRenderingEngine(ENGINE_ID) as cs.RenderingEngine | undefined) ?? new cs.RenderingEngine(ENGINE_ID);
}

/** How long the volume waits for the server's planes before it starts anyway (one failed to load, say). */
export const VOLUME_WAITS_MS = 1500;

/** After the browser has painted what is on the page: the next frame, then a task. */
function afterPaint(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
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
  /** The pictures take their keys (keys.ts): the reader's page, where one viewer is the page's. */
  keys?: boolean;
  /**
   * Pair mode (the post-contrast study): the plane the stack view shows, set
   * by a page that keeps two viewers on one slice. A plane set so is not
   * told back through `onSlice`, so two viewers never chase each other.
   */
  slice?: number | null;
  /** The plane the person moved the stack view to (wheel, keys), for a page that keeps another viewer beside it. */
  onSlice?: (z: number) => void;
  /** The stack's manifest once it is read, for a page that matches two stacks' geometry. */
  onManifest?: (m: Manifest) => void;
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

// how the planes are cut, kept for the next stack and the next visit
const PLANES_KEY = "nils.viewer.planes";
function planesRemembered(): Planes {
  try {
    return localStorage.getItem(PLANES_KEY) === "patient" ? "patient" : "acquisition";
  } catch {
    return "acquisition";
  }
}
function rememberPlanes(p: Planes): void {
  try {
    localStorage.setItem(PLANES_KEY, p);
  } catch {
    // a private window keeps nothing; the viewer works the same
  }
}

/** Whether a stack lies off the scanner's axes: a row, a column or the normal more than about a degree from every axis. */
export function isOblique(g: { row: Vec3; col: Vec3; normal: Vec3; known: boolean }): boolean {
  return g.known && [g.row, g.col, g.normal].some((v) => Math.max(...v.map(Math.abs)) < 0.9998);
}

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

export function Viewer({ stack, level: ruleLevel = null, view: initialView = "stack", budget, onEvent, onView, keys = false, slice = null, onSlice, onManifest }: ViewerProps) {
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
  const [stackOpened, setStackOpened] = useState(initialView === "stack");
  // the server's planes drawn (or given up on): the volume waits for them, so the first picture is not held behind its work
  const [painted, setPainted] = useState(0);
  const [waited, setWaited] = useState(false);
  const stackMounted = useRef(false);
  const drawn = useRef(new Set<Plane>());
  const [volume, setVolume] = useState<VolumeState | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [labels, setLabels] = useState<Partial<Record<Plane | "stack", EdgeLabels>>>({});
  const [touched, setTouched] = useState<Partial<Record<Plane, boolean>>>({});
  const [serverPos, setServerPos] = useState<Record<Plane, number>>({ axial: 0.5, coronal: 0.5, sagittal: 0.5 });
  const [cut, setCut] = useState<Planes>(planesRemembered);
  const cutRef = useRef(cut);
  cutRef.current = cut;
  const [numbersOpen, setNumbersOpen] = useState(false);
  // one plane enlarged to the whole side, and the plane under the pointer, which Space and the arrows act on
  const [big, setBig] = useState<Plane | null>(null);
  const hovered = useRef<Plane | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const stamps = useRef<number[]>([]);
  const engine = useRef<cs.RenderingEngine | null>(null);
  const filling = useRef<Filling | null>(null);
  const levelRef = useRef(0);
  const zRef = useRef(0);
  const tell = useRef(onEvent);
  tell.current = onEvent;
  const toldSlice = useRef(onSlice);
  toldSlice.current = onSlice;
  const toldManifest = useRef(onManifest);
  toldManifest.current = onManifest;
  // pair mode: the plane asked for, and whether the next new image is that ask's, not the person's
  const asked = useRef<number | null>(slice);
  asked.current = slice;
  const following = useRef(false);
  // the stack view built with its images, so a plane asked for before it was can be shown once it is
  const [stackReady, setStackReady] = useState(false);

  // the manifest, or the reason there is none: a 403 is the gated case, the render path alone is tried
  useEffect(() => {
    let alive = true;
    setFailed(null);
    open(stack)
      .then((m) => {
        if (!alive) return;
        // the planes fill from the middle until the stack view names a plane
        zRef.current = Math.floor(m.shape[0] / 2);
        // one plane has nothing to cut across: its own plane, and the view chosen kept for the next stack
        if (!cutsAcross(m)) {
          setView("stack");
          setStackOpened(true);
          setPlanesOpened(false);
        }
        setManifest(m);
        toldManifest.current?.(m);
      })
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
    if (!manifest || !el.current || !stackOpened || stackMounted.current) return;
    stackMounted.current = true;
    await initOnce();
    const width = el.current.clientWidth || 512;
    const level = ruleLevel ?? levelFor(width, manifest.shape[2], manifest.levels);
    levelRef.current = level;
    const [nz] = levelShape(manifest, level);
    const z0 = asked.current !== null ? Math.min(nz - 1, Math.max(0, asked.current)) : Math.floor(nz / 2);
    zRef.current = z0;
    // the first picture: the server's render, replaced when the decoded plane lands
    setFirstUrl(doors.renderUrl(stack, Math.min(manifest.levels - 1, level + 1), z0, manifest.window.width, manifest.window.center));
    const re = engine.current ?? sharedEngine();
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
      if (following.current) following.current = false;
      else toldSlice.current?.(zRef.current);
    });
    el.current.addEventListener(cs.Enums.Events.CAMERA_MODIFIED, () => letter("stack", vp));
    await vp.setStack(imageIds, z0);
    vp.setProperties(viewWindow(manifest));
    vp.render();
    setStackReady(true);
    toolGroup(`tg-${stack}`).addViewport(ids.stack, re.id);
    setNumbers((n) => ({ ...n, level, z: z0 }));
  }, [manifest, stack, ruleLevel, since, ids.stack, stackOpened, stamp, letter]);

  // a stack that goes gives back its viewports, its tools and its volume; the engine and its context stay for the next
  useEffect(
    () => () => {
      filling.current?.close();
      const vid = filling.current?.volumeId;
      filling.current = null;
      stackMounted.current = false;
      setStackReady(false);
      drawn.current = new Set();
      setPainted(0);
      setWaited(false);
      const re = engine.current;
      if (re) {
        for (const id of [ids.stack, ...PLANES.map((p) => ids.planes[p])]) {
          try {
            if (re.getViewport(id)) re.disableElement(id);
          } catch {
            // the element is already gone
          }
        }
        try {
          tools.ToolGroupManager.destroyToolGroup(`tg-${stack}`);
          tools.ToolGroupManager.destroyToolGroup(`tg-${stack}-planes`);
          tools.SynchronizerManager.destroySynchronizer(`voi-${stack}`);
        } catch {
          // already gone
        }
        engine.current = null;
      }
      if (vid) dropVolume(vid);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stack],
  );

  useEffect(() => {
    mount().catch((e: unknown) => setFailed(classify(e)));
  }, [mount]);

  // pair mode: the plane the page asks for, where the stack view is built and shows another
  useEffect(() => {
    if (slice === null || !stackReady) return;
    const vp = engine.current?.getViewport(ids.stack) as cs.StackViewport | undefined;
    if (!vp || typeof vp.getCurrentImageIdIndex !== "function") return;
    const n = vp.getImageIds().length;
    const z = Math.min(n - 1, Math.max(0, slice));
    if (z === vp.getCurrentImageIdIndex()) return;
    following.current = true;
    vp.setImageIdIndex(z).catch(() => {
      following.current = false;
    });
  }, [slice, stackReady, ids.stack]);

  // the volume waits for the server's planes, or for a while when one of them does not come
  useEffect(() => {
    if (!planesOpened || !manifest) return;
    const t = setTimeout(() => setWaited(true), VOLUME_WAITS_MS);
    return () => clearTimeout(t);
  }, [planesOpened, manifest]);
  const planesDrawn = painted >= PLANES.length || waited;

  // the three planes: the volume at the level the budget allows, filled from the current plane outwards
  const mountPlanes = useCallback(async () => {
    if (!manifest || !planesOpened || filling.current || fallback) return;
    const path = volumePath(manifest, budget);
    if (!("why" in path) && !planesDrawn) return;
    if ("why" in path) {
      setFallback(path.why);
      tell.current?.({ kind: "fallback", why: path.why });
      return;
    }
    const { plan } = path;
    // the server's planes are on the screen before the volume's work takes the thread
    await afterPaint();
    await initOnce();
    // another call got here first, or the stack went while the frame was painted
    if (filling.current || !planeEls.current.axial) return;
    const re = engine.current ?? sharedEngine();
    engine.current = re;
    const planeIds = PLANES.map((p) => ids.planes[p]);
    const cams = planeCameras(geometry(manifest), cutRef.current);
    for (const p of PLANES) {
      const element = planeEls.current[p];
      if (!element) throw new Error("the planes' elements are not on the page");
      re.enableElement({ viewportId: ids.planes[p], type: cs.Enums.ViewportType.ORTHOGRAPHIC, element, defaultOptions: { orientation: cams[p] as cs.Types.OrientationVectors } });
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
  }, [manifest, planesOpened, planesDrawn, fallback, budget, stack, ids.planes, letter, stamp]);

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

  // a hidden element has no size: tell cornerstone when a view comes back, or a plane grows or gives its room back
  useEffect(() => {
    engine.current?.resize(true, true);
  }, [view, big]);

  // the pictures' keys (keys.ts), where the page gives them: Space enlarges, the arrows page
  const keyed = useRef({ view, big, manifest, fallback, own: "axial" as Plane });
  keyed.current = { view, big, manifest, fallback, own: PLANES.find((p) => p === manifest?.plane) ?? "axial" };
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (e.defaultPrevented || !k.manifest) return;
      const act = viewerKey(e.key, { view: k.view, enlarged: k.big !== null, target: e.target as HTMLElement | null, modifier: e.altKey || e.metaKey || e.ctrlKey });
      if (!act) return;
      e.preventDefault();
      if (act.kind === "enlarge") setBig(hovered.current ?? k.own);
      else if (act.kind === "restore") setBig(null);
      else if (k.view === "planes" && k.fallback) {
        const p = k.big ?? hovered.current ?? k.own;
        const along = Math.max(2, k.manifest.shape[0]);
        setServerPos((s) => ({ ...s, [p]: Math.min(1, Math.max(0, s[p] + act.delta / (along - 1))) }));
      } else {
        const p = k.big ?? hovered.current ?? k.own;
        const vp = engine.current?.getViewport(k.view === "stack" ? ids.stack : ids.planes[p]) as Parameters<typeof cs.utilities.scroll>[0] | undefined;
        if (!vp) return;
        if (k.view === "planes") setTouched((t) => (t[p] ? t : { ...t, [p]: true }));
        try {
          cs.utilities.scroll(vp, { delta: act.delta });
        } catch {
          // the viewport is being built or taken down; the next key finds it
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, ids.stack, ids.planes]);

  // the pictures grow with the window: cornerstone is told when the viewer's box changes
  useEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const seen = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try {
          engine.current?.resize(true, true);
        } catch {
          // the engine is being taken down
        }
      });
    });
    seen.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
    };
  }, [manifest]);

  // the planes cut the other way: each viewport turned to its new camera
  useEffect(() => {
    const re = engine.current;
    if (!re || !manifest || !filling.current) return;
    const cams = planeCameras(geometry(manifest), cut);
    for (const p of PLANES) {
      const vp = re.getViewport(ids.planes[p]) as cs.VolumeViewport | undefined;
      if (!vp) continue;
      vp.setOrientation(cams[p] as cs.Types.OrientationVectors);
      letter(p, vp);
    }
    re.renderViewports(PLANES.map((p) => ids.planes[p]));
  }, [cut, manifest, ids.planes, letter]);

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
  const serverPlane = (p: Plane, pos: number, onLoad?: () => void) => {
    const s = serverPlaneOf(stack, manifest, g, p, pos);
    return <RenderPlane src={s.src} axes={s.axes} known={s.known} onLoad={onLoad} />;
  };
  const firstDrawn = (p: Plane) => () => {
    if (drawn.current.has(p)) return;
    drawn.current.add(p);
    setPainted(drawn.current.size);
  };
  const volumeDone = volume?.done ?? false;
  const oblique = isOblique(g);
  // the plane the stack was acquired in leads the three
  const own = PLANES.find((p) => p === manifest.plane) ?? "axial";
  const chooseCut = (c: Planes) => {
    rememberPlanes(c);
    setCut(c);
  };
  return (
    <div className="viewer" ref={root}>
      <div className="viewer-axes" role="tablist" aria-label="view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "stack"}
          className={view === "stack" ? "on" : ""}
          onClick={() => {
            setView("stack");
            setStackOpened(true);
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
          disabled={!cutsAcross(manifest)}
          title={cutsAcross(manifest) ? undefined : "one plane: nothing to cut across"}
          onClick={() => {
            setView("planes");
            setPlanesOpened(true);
            onView?.("planes");
          }}
        >
          three planes
        </button>
        {view === "planes" && oblique && !fallback && (
          <span className="viewer-cut" role="group" aria-label="how the planes are cut">
            <button type="button" className={cut === "acquisition" ? "on" : ""} aria-pressed={cut === "acquisition"} onClick={() => chooseCut("acquisition")} title="the stack's own planes: the head as the operator aligned it, no tilt">
              stack's planes
            </button>
            <button type="button" className={cut === "patient" ? "on" : ""} aria-pressed={cut === "patient"} onClick={() => chooseCut("patient")} title="the scanner's axes: the head as it lay, tilted by the planning angle">
              scanner axes
            </button>
          </span>
        )}
        {(manifest.annotation?.burned_in || manifest.held) && <span className="tag caution">burned-in annotation held</span>}
        {!g.regular && <span className="tag caution">planes not evenly spaced</span>}
        <button type="button" className={numbersOpen ? "viewer-numbers-toggle on" : "viewer-numbers-toggle"} aria-expanded={numbersOpen} aria-label="the viewer's numbers" title="the viewer's numbers: loading, frames, bytes" onClick={() => setNumbersOpen((o) => !o)}>
          i
        </button>
      </div>
      <div className="viewer-stage" hidden={view !== "stack"}>
        <div ref={el} className="viewer-element" />
        {firstUrl && !decodedOnce && <img className="viewer-first" src={firstUrl} alt="" />}
        {decodedOnce && <Letters labels={labels.stack ?? null} unknown={!g.known} />}
      </div>
      {planesOpened && !fallback && (
        <div className={big ? "viewer-planes enlarged" : "viewer-planes"} hidden={view !== "planes"}>
          {PLANES.map((p) => (
            <div
              key={p}
              className={planeClass(p, own, big)}
              onWheelCapture={() => setTouched((t) => (t[p] ? t : { ...t, [p]: true }))}
              onPointerDownCapture={() => setTouched((t) => (t[p] ? t : { ...t, [p]: true }))}
              onPointerEnter={() => (hovered.current = p)}
              onPointerLeave={() => hovered.current === p && (hovered.current = null)}
              onDoubleClick={() => setBig((b) => (b ? null : p))}
            >
              <div
                ref={(node) => {
                  planeEls.current[p] = node;
                }}
                className="viewer-element"
                data-plane={p}
              />
              {!volumeDone && !touched[p] && <div className="viewer-first">{serverPlane(p, 0.5, firstDrawn(p))}</div>}
              {(volumeDone || touched[p]) && <Letters labels={labels[p] ?? null} unknown={!g.known} />}
              <span className="viewer-plane-name">{p}</span>
              <GrowButton plane={p} big={big === p} onClick={() => setBig((b) => (b ? null : p))} />
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
        <div className={big ? "viewer-planes enlarged" : "viewer-planes"} hidden={view !== "planes"}>
          {PLANES.map((p) => (
            <div key={p} className={`${planeClass(p, own, big)} viewer-plane-server`} onPointerEnter={() => (hovered.current = p)} onPointerLeave={() => hovered.current === p && (hovered.current = null)} onDoubleClick={() => setBig((b) => (b ? null : p))}>
              {serverPlane(p, serverPos[p])}
              <span className="viewer-plane-name">{p}</span>
              <GrowButton plane={p} big={big === p} onClick={() => setBig((b) => (b ? null : p))} />
              <input type="range" min={0} max={1} step={0.001} value={serverPos[p]} onChange={(e) => setServerPos((s) => ({ ...s, [p]: Number(e.target.value) }))} aria-label={`${p} position`} />
            </div>
          ))}
        </div>
      )}
      {numbersOpen && (
        <p className="viewer-foot meta">
          {numbers.firstImageMs !== null ? `first image ${numbers.firstImageMs} ms` : "first image pending"}; {numbers.fps} fps; {(numbers.bytes / 1e6).toFixed(1)} MB moved; {numbers.planes} planes decoded
          {numbers.planes > 0 && ` at ${Math.round(numbers.decodeMs / numbers.planes)} ms each`}; level {numbers.level} of {manifest.levels}; plane {numbers.z + 1} of {nz}; {nx} by {ny} at {manifest.spacing[2]} mm
          {volume && `; planes at level ${volume.level}${volume.stride > 1 ? `, every ${volume.stride} planes` : ""}, ${volume.done ? "whole" : `${volume.filled} of ${volume.depth}`}, ${Math.round(volume.bytes / 1e6)} MB`}
          {fallback && `; planes from the server: ${fallback}`}; wheel scrolls, left windows, right zooms
        </p>
      )}
    </div>
  );
}

/** A plane's classes: the one the stack was acquired in leads, and one may be enlarged to the whole side. */
function planeClass(p: Plane, own: Plane, big: Plane | null): string {
  return ["viewer-plane", p === own ? "own" : "", big === p ? "big" : ""].filter(Boolean).join(" ");
}

/** The corner button that enlarges a plane to the whole side and gives the three back (Space does the same). */
function GrowButton({ plane, big, onClick }: { plane: Plane; big: boolean; onClick: () => void }) {
  return (
    <button type="button" className="viewer-plane-grow" aria-pressed={big} aria-label={big ? "the three planes" : `enlarge the ${plane} plane`} title={big ? "the three planes (Space or Esc)" : "enlarge (Space, or a double click)"} onClick={onClick} onDoubleClick={(e) => e.stopPropagation()}>
      <Icon name={big ? "shrink" : "grow"} />
    </button>
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
