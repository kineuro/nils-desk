// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's boxes without a stack: the view tabs, the three planes and the
// numbers, with the real viewer's classes, so the layout check lays the
// pictures out as the desk does: the plane the stack was acquired in (the
// fixture's is sagittal) leads, the numbers open on `i`, and Space or a
// double click enlarges a plane to the whole side (viewer/keys.ts).

import { useEffect, useRef, useState } from "react";
import { viewerKey } from "../../src/viewer/keys";
import "../../src/viewer/viewer.css";

type Plane = "axial" | "coronal" | "sagittal";

export function Viewer({ view: initial = "stack", onView, keys = false }: { stack: number; level?: number | null; view?: "stack" | "planes"; onView?: (v: "stack" | "planes") => void; keys?: boolean }) {
  const [view, setView] = useState(initial);
  const [numbers, setNumbers] = useState(false);
  const [big, setBig] = useState<Plane | null>(null);
  const hovered = useRef<Plane | null>(null);
  const keyed = useRef({ view, big });
  keyed.current = { view, big };
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      const act = viewerKey(e.key, { view: keyed.current.view, enlarged: keyed.current.big !== null, target: e.target as HTMLElement | null, modifier: e.altKey || e.metaKey || e.ctrlKey });
      if (!act || e.defaultPrevented) return;
      e.preventDefault();
      if (act.kind === "enlarge") setBig(hovered.current ?? "sagittal");
      else if (act.kind === "restore") setBig(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys]);
  const choose = (v: "stack" | "planes") => {
    setView(v);
    onView?.(v);
  };
  return (
    <div className="viewer">
      <div className="viewer-axes" role="tablist" aria-label="view">
        <button type="button" role="tab" aria-selected={view === "stack"} className={view === "stack" ? "on" : ""} onClick={() => choose("stack")}>
          the stack
        </button>
        <button type="button" role="tab" aria-selected={view === "planes"} className={view === "planes" ? "on" : ""} onClick={() => choose("planes")}>
          three planes
        </button>
        <button type="button" className={numbers ? "viewer-numbers-toggle on" : "viewer-numbers-toggle"} aria-expanded={numbers} aria-label="the viewer's numbers" onClick={() => setNumbers((n) => !n)}>
          i
        </button>
      </div>
      <div className="viewer-stage" hidden={view !== "stack"} />
      <div className={big ? "viewer-planes enlarged" : "viewer-planes"} hidden={view !== "planes"}>
        {(["axial", "coronal", "sagittal"] as const).map((p) => (
          <div
            key={p}
            className={["viewer-plane", p === "sagittal" ? "own" : "", big === p ? "big" : ""].filter(Boolean).join(" ")}
            data-plane={p}
            onPointerEnter={() => (hovered.current = p)}
            onPointerLeave={() => hovered.current === p && (hovered.current = null)}
            onDoubleClick={() => setBig((b) => (b ? null : p))}
          >
            <div className="viewer-element" />
            <span className="viewer-plane-name">{p}</span>
            <button type="button" className="viewer-plane-grow" aria-pressed={big === p} aria-label={big === p ? "the three planes" : `enlarge the ${p} plane`} onClick={() => setBig((b) => (b ? null : p))} />
          </div>
        ))}
      </div>
      {numbers && <p className="viewer-foot meta">first image 212 ms; 60 fps; 11.4 MB moved; 176 planes decoded at 3 ms each; level 0 of 2; plane 88 of 176; 240 by 256 at 1 mm; planes at level 0, whole, 22 MB; wheel scrolls, left windows, right zooms</p>}
    </div>
  );
}
