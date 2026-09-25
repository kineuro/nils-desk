// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's boxes without a stack: the view tabs, the three planes and the
// footer, with the real viewer's classes, so the layout check lays the
// pictures out as the desk does. Each plane holds a square picture the size
// of a typical stack's.

import "../../src/viewer/viewer.css";

export function Viewer({ view = "stack" }: { stack: number; level?: number | null; view?: "stack" | "planes" }) {
  return (
    <div className="viewer">
      <div className="viewer-axes" role="tablist" aria-label="view">
        <button type="button" role="tab" aria-selected={view === "stack"} className={view === "stack" ? "on" : ""}>
          the stack
        </button>
        <button type="button" role="tab" aria-selected={view === "planes"} className={view === "planes" ? "on" : ""}>
          three planes
        </button>
      </div>
      <div className="viewer-stage" hidden={view !== "stack"} />
      <div className="viewer-planes" hidden={view !== "planes"}>
        {(["axial", "coronal", "sagittal"] as const).map((p) => (
          <div key={p} className="viewer-plane" data-plane={p}>
            <div className="viewer-element" />
            <span className="viewer-plane-name">{p}</span>
          </div>
        ))}
      </div>
      <p className="viewer-foot meta">first image 212 ms; 60 fps; 11.4 MB moved; 176 planes decoded at 3 ms each; level 0 of 2; plane 88 of 176; 240 by 256 at 1 mm; planes at level 0, whole, 22 MB; wheel scrolls, left windows, right zooms</p>
    </div>
  );
}
