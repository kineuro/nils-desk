// SPDX-License-Identifier: AGPL-3.0-only
// The controls the comparison pages share (the post-contrast study: pair
// mode and anchored reading): one window for every panel or each its own,
// and the jumps to the places contrast shows first.

import type { SharedWindow } from "./window";
import { normWords } from "./window";
import { REGIONS, type Region } from "./regions";

/** One window across the panels, or each its own; the shared one by default, back to its opening with a click. */
export function WindowControl({ w, keyHint = "w" }: { w: SharedWindow; keyHint?: string }) {
  const shared = w.mode === "shared";
  const words = !shared ? "each its own window" : w.ready ? "one window" : `one window: ${w.why ?? "waiting"}`;
  return (
    <span className="compare-window" role="group" aria-label="the window">
      <button
        type="button"
        className={shared && w.ready ? "tag compare-toggle on" : "tag compare-toggle"}
        aria-pressed={shared}
        onClick={() => w.setMode(shared ? "own" : "shared")}
        title={`every picture scaled by its own reference tissue (the head's central median) and shown under one window, which a drag on any picture moves for all; or each picture its own window (${keyHint})${shared && w.norm ? `. Now ${normWords(w.norm)}` : ""}`}
      >
        {words}
      </button>
      {shared && w.ready && (
        <button type="button" className="tag compare-reset" onClick={w.reset} title="the window the pages open at">
          reset
        </button>
      )}
    </span>
  );
}

/** The jumps, each to the plane nearest an estimated place; approximate, and said so. */
export function RegionJumps({ onJump, disabled, why }: { onJump: (r: Region) => void; disabled: boolean; why: string | null }) {
  return (
    <span className="compare-regions" role="group" aria-label="jump to, approximately">
      <span className="meta compare-approx" title="estimated from the head's extent by fixed fractions of an adult head, with no segmentation: they put you near the place">
        ≈ jump
      </span>
      {REGIONS.map((r) => (
        <button key={r.id} type="button" className="tag compare-region" disabled={disabled} onClick={() => onJump(r)} title={disabled && why ? why : `${r.title} (${r.key})`}>
          <kbd>{r.key}</kbd>
          {r.label}
        </button>
      ))}
    </span>
  );
}
