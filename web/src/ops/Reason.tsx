// SPDX-License-Identifier: AGPL-3.0-only
// A failure as the desk draws it (2026-10-12): one line under a run's row,
// the kind as a value tag and what to do, else the error's first sentence,
// the whole error a hover away; on the run's page and in the run form's
// pre-flight the whole of it in a note. What a person can do about it sits
// beside the line.

import type React from "react";
import { Icon } from "../ui/Icon";
import type { Failure } from "./failure";

/** The kind as a value tag: framed and barred in its own value's colour, as the desk draws a value. */
export function KindTag({ kind, cause = null }: { kind: string; cause?: string | null }) {
  return (
    <span className="value-tag kind-tag" data-kind={kind} title={cause && cause !== kind ? cause.replace(/_/gu, " ") : undefined}>
      {kind}
    </span>
  );
}

/** The one line: the kind, what to do, and what can be done, the whole error in its title. */
export function FailLine({ f, children }: { f: Failure; children?: React.ReactNode }) {
  return (
    <div className="fail-line">
      {f.kind && <KindTag kind={f.kind} cause={f.cause} />}
      <span className="fail-words" title={f.error}>
        {f.line}
      </span>
      {children}
    </div>
  );
}

/** The whole of it: the line as the lead, the error under it where the line is not all of it. */
export function FailNote({ f, lead = null, children }: { f: Failure; lead?: string | null; children?: React.ReactNode }) {
  return (
    <div className="note caution fail-note">
      <Icon name="alert" />
      <div className="note-body">
        {lead && <p className="note-lead">{lead}</p>}
        <p className={lead ? "fail-said" : "note-lead fail-said"}>
          {f.kind && <KindTag kind={f.kind} cause={f.cause} />}
          <span>{f.line}</span>
        </p>
        {f.error !== f.line && <p className="note-detail">{f.error}</p>}
        {children}
      </div>
    </div>
  );
}
