// SPDX-License-Identifier: AGPL-3.0-only
// The viewer (Wave 5 section 8.2, built on what the viewer study chose):
// cornerstone3D's stack viewport over the `nils:` loader, the level whose
// plane fits the viewport, the server's render as the first picture until
// the decoded plane lands, window and level on the GPU, MPR as the server's
// render of the other two axes, and a footer of the viewer's own numbers:
// first image, frames per second over the last second, bytes moved.

import { useCallback, useEffect, useRef, useState } from "react";
import * as cs from "@cornerstonejs/core";
import * as tools from "@cornerstonejs/tools";
import { DoorError } from "../ask/client";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";
import { doors, levelShape, type Manifest } from "./doors";
import { close, counters, imageId, open, register } from "./loader";
import { fps, levelFor } from "./ring";

export interface ViewerProps {
  stack: number;
  /** The level the rule read, when the item names one; else the level the viewport picks. */
  level?: number | null;
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

const BENCH = typeof location !== "undefined" && /[?&]bench=1/.test(location.search);
function bench(measure: string, value: unknown, extra: Record<string, unknown> = {}): void {
  if (BENCH) console.log(JSON.stringify({ viewer: "nils", measure, value, ...extra }));
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

export function Viewer({ stack, level: ruleLevel = null }: ViewerProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [gated, setGated] = useState(false);
  const [since] = useState(() => performance.now());
  const [numbers, setNumbers] = useState<Numbers>({ firstImageMs: null, fps: 0, bytes: 0, planes: 0, decodeMs: 0, level: 0, z: 0 });
  const [firstUrl, setFirstUrl] = useState<string | null>(null);
  const [decodedOnce, setDecodedOnce] = useState(false);
  const [axis, setAxis] = useState<"z" | "y" | "x">("z");
  const [mprPos, setMprPos] = useState(0.5);
  const stamps = useRef<number[]>([]);
  const engine = useRef<cs.RenderingEngine | null>(null);
  const levelRef = useRef(0);
  const zRef = useRef(0);
  const vpId = `vp-${stack}`;
  const groupId = `tg-${stack}`;

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

  // the viewport, once the manifest is here and the element is on the page
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
    const re = engine.current ?? new cs.RenderingEngine(`re-${stack}`);
    engine.current = re;
    re.enableElement({ viewportId: vpId, type: cs.Enums.ViewportType.STACK, element: el.current });
    const vp = re.getViewport(vpId) as cs.StackViewport;
    const ids = Array.from({ length: nz }, (_, z) => imageId(stack, level, z));
    let first = true;
    const onRendered = () => {
      const now = performance.now();
      stamps.current.push(now);
      if (stamps.current.length > 240) stamps.current.splice(0, stamps.current.length - 240);
      if (first) {
        first = false;
        setDecodedOnce(true);
        const ms = Math.round(now - since);
        bench("time_to_first_image_ms", ms, { level });
        setNumbers((n) => ({ ...n, firstImageMs: ms }));
      }
    };
    el.current.addEventListener(cs.Enums.Events.IMAGE_RENDERED, onRendered);
    el.current.addEventListener(cs.Enums.Events.STACK_NEW_IMAGE, () => {
      zRef.current = vp.getCurrentImageIdIndex();
    });
    await vp.setStack(ids, z0);
    vp.setProperties({ voiRange: { lower: manifest.window.center - manifest.window.width / 2, upper: manifest.window.center + manifest.window.width / 2 } });
    vp.render();
    // the tools: the wheel scrolls, the left button windows, the right zooms, the middle pans
    let group = tools.ToolGroupManager.getToolGroup(groupId);
    if (!group) {
      group = tools.ToolGroupManager.createToolGroup(groupId)!;
      group.addTool(tools.StackScrollTool.toolName);
      group.addTool(tools.WindowLevelTool.toolName);
      group.addTool(tools.ZoomTool.toolName);
      group.addTool(tools.PanTool.toolName);
      group.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] });
      group.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
      group.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }] });
      group.setToolActive(tools.PanTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Auxiliary }] });
    }
    group.addViewport(vpId, re.id);
    setNumbers((n) => ({ ...n, level, z: z0 }));
  }, [manifest, stack, ruleLevel, since, vpId, groupId]);

  useEffect(() => {
    mount().catch((e: unknown) => setFailed(classify(e)));
    return () => {
      const re = engine.current;
      if (re) {
        try {
          tools.ToolGroupManager.getToolGroup(groupId)?.removeViewports(re.id, vpId);
          re.disableElement(vpId);
          re.destroy();
        } catch {
          // the element is already gone
        }
        engine.current = null;
      }
    };
  }, [mount, groupId, vpId]);

  // the footer's numbers, once a second
  useEffect(() => {
    const t = setInterval(() => {
      setNumbers((n) => ({ ...n, fps: fps(stamps.current, performance.now()), bytes: counters.bytes, planes: counters.planesDecoded, decodeMs: counters.decodeMs, level: levelRef.current, z: zRef.current }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // the bench: a scripted scroll through every plane, then the numbers
  useEffect(() => {
    if (!BENCH || !manifest || !decodedOnce) return;
    let stop = false;
    (async () => {
      const vp = engine.current?.getViewport(vpId) as cs.StackViewport | undefined;
      if (!vp) return;
      const [nz] = levelShape(manifest, levelRef.current);
      const lat: number[] = [];
      const raf = () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())));
      const step = Math.max(1, Math.floor(nz / 600));
      for (let z = 0; z < nz && !stop; z += step) {
        const a = performance.now();
        await vp.setImageIdIndex(z);
        vp.render();
        await raf();
        lat.push(performance.now() - a);
      }
      const s = [...lat].sort((a, b) => a - b);
      const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      bench("scroll_ms_median", at(0.5), { p95: at(0.95), slices: s.length, level: levelRef.current });
      bench("bytes_moved", counters.bytes, { planes: counters.planesDecoded, decode_ms_per_plane: counters.planesDecoded ? Math.round(counters.decodeMs / counters.planesDecoded) : null });
      bench("memory_peak_mb", (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory ? Math.round((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1e6) : null);
      bench("done", true);
    })();
    return () => {
      stop = true;
    };
  }, [manifest, decodedOnce, vpId]);

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
  const mprIndex = Math.round(mprPos * ((axis === "y" ? ny : nx) - 1));
  return (
    <div className="viewer">
      <div className="viewer-axes" role="tablist" aria-label="axis">
        {(["z", "y", "x"] as const).map((a) => (
          <button key={a} type="button" className={axis === a ? "on" : ""} onClick={() => setAxis(a)}>
            {a === "z" ? "axial, the stack" : a === "y" ? "coronal" : "sagittal"}
          </button>
        ))}
        {manifest.annotation?.burned_in && <span className="tag caution">burned-in annotation held</span>}
      </div>
      <div className="viewer-stage" hidden={axis !== "z"}>
        <div ref={el} className="viewer-element" />
        {firstUrl && !decodedOnce && <img className="viewer-first" src={firstUrl} alt="" />}
      </div>
      {axis !== "z" && (
        <div className="viewer-mpr">
          <img src={doors.renderUrl(stack, Math.min(manifest.levels - 1, 2), mprIndex, manifest.window.width, manifest.window.center, axis)} alt="" />
          <input type="range" min={0} max={1} step={0.001} value={mprPos} onChange={(e) => setMprPos(Number(e.target.value))} aria-label={`${axis} position`} />
        </div>
      )}
      <p className="viewer-foot meta">
        {numbers.firstImageMs !== null ? `first image ${numbers.firstImageMs} ms` : "first image pending"}; {numbers.fps} fps; {(numbers.bytes / 1e6).toFixed(1)} MB moved; {numbers.planes} planes decoded
        {numbers.planes > 0 && ` at ${Math.round(numbers.decodeMs / numbers.planes)} ms each`}; level {numbers.level} of {manifest.levels}; plane {numbers.z + 1} of {nz}; {nx} by {ny} at {manifest.spacing[2]} mm; wheel scrolls, left windows, right zooms
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
