// SPDX-License-Identifier: AGPL-3.0-only
// The controls the comparison pages share (the post-contrast study: pair
// mode and anchored reading): one window for every panel or each its own,
// and the jumps to the places contrast shows first.

import { Icon } from "../ui/Icon";
import type { SharedWindow } from "./window";
import { normWords } from "./window";
import { REGIONS, type Region } from "./regions";

/** One window across the panels, or each its own; the shared one by default, back to its opening with a click. */
export function WindowControl({ w, keyHint = "w" }: { w: SharedWindow; keyHint?: string }) {
  const shared = w.mode === "shared";
  const words = !shared ? "each its own window" : w.ready ? "one window" : "one window…";
  return (
    <span className="compare-window" role="group" aria-label="the window">
      <button
        type="button"
        className={shared && w.ready ? "tool compare-toggle on" : "tool compare-toggle"}
        aria-pressed={shared}
        onClick={() => w.setMode(shared ? "own" : "shared")}
        title={`every picture scaled by its own reference tissue (the head's central median) and shown under one window, which a drag on any picture moves for all; or each picture its own window (${keyHint})${shared && !w.ready && w.why ? `. Now ${w.why}` : ""}${shared && w.norm ? `. Now ${normWords(w.norm)}` : ""}`}
      >
        <span className="tool-label">{words}</span>
        <kbd>{keyHint}</kbd>
      </button>
      <button type="button" className="tool compare-reset" onClick={w.reset} disabled={!(shared && w.ready)} title="back to the window the pictures opened at">
        <Icon name="restart" />
        <span className="tool-label">reset</span>
      </button>
    </span>
  );
}

/** The jumps, each to the plane nearest an estimated place; approximate, and said so. */
export function RegionJumps({ onJump, disabled, why }: { onJump: (r: Region) => void; disabled: boolean; why: string | null }) {
  return (
    <span className="compare-regions" role="group" aria-label="jump to, approximately">
      <span className="meta compare-approx" title="estimated from the head's extent by fixed fractions of an adult head, with no segmentation: they put you near the place">
        ≈
      </span>
      {REGIONS.map((r) => (
        <button key={r.id} type="button" className="tool compare-region" disabled={disabled} onClick={() => onJump(r)} title={disabled && why ? why : `${r.title} (${r.key})`}>
          <span className="tool-label">{r.label}</span>
          <kbd>{r.key}</kbd>
        </button>
      ))}
    </span>
  );
}
