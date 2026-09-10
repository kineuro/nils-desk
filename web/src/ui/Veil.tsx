// SPDX-License-Identifier: AGPL-3.0-only
// The stale veil and the blocked control (Wave 5 section 6.6, from the
// reading of Metabase). A stale answer is veiled behind the affordance that
// leads to the document; the veil is inert and out of the tab order. A
// blocked control keeps its button and carries its one reason.

import type React from "react";

export function Veil({ why, lead, children }: { why: string; lead: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div className="veiled">
      {/* @ts-expect-error inert is a real attribute; React's typings lag the platform */}
      <div className="veil-under" inert="">
        {children}
      </div>
      <div className="veil" role="note">
        <p>{why}</p>
        <a className="button" href={lead.href}>
          {lead.label}
        </a>
      </div>
    </div>
  );
}

export interface Control {
  enabled: boolean;
  reason: string | null;
}

/** A button that stays a button when it may not act, with its one reason beside it. */
export function Blocked({ control, label, onClick, hint }: { control: Control; label: string; onClick: () => void; hint?: string | null }) {
  return (
    <span className="blocked">
      <button type="button" disabled={!control.enabled} aria-describedby={control.enabled ? undefined : `why-${label}`} onClick={onClick}>
        {label}
      </button>
      <span id={`why-${label}`} className="reason">
        {control.enabled ? hint ?? "" : control.reason}
      </span>
    </span>
  );
}
