// SPDX-License-Identifier: AGPL-3.0-only
// The stations a provider does not answer, on the Kvasir page once an admin
// has added the provider (record 24). A station with no row in the table stays
// in your systems, so none goes to a provider until it is moved there. Each
// line says what a move needs, and a station that may move has its Change
// beside it, which opens the same dialog as Where each station goes.

import { Icon } from "../ui/Icon";
import { closedLead, closedTo } from "./gateway";
import type { Backend, PurposeRow } from "./kvasir";

export function ClosedStations({ provider, purposes, onChange }: { provider: Backend; purposes: PurposeRow[]; onChange: (p: PurposeRow) => void }) {
  const lines = closedTo(provider, purposes);
  if (lines.length === 0) return null;
  return (
    <div className="note gated">
      <Icon name="lock" />
      <div className="note-body">
        <p className="note-lead">{closedLead(provider, purposes)}</p>
        <ul className="closed-list">
          {lines.map((l) => (
            <li key={l.purpose.purpose}>
              <span>{l.words}</span>
              {l.needs !== "never" && (
                <button type="button" className="button quiet small" aria-label={`Change where ${l.station} goes`} onClick={() => onChange(l.purpose)}>
                  Change
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
