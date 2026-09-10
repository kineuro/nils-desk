// SPDX-License-Identifier: AGPL-3.0-only
// One failure component with five outcomes the engine chooses (Wave 5
// section 6.5): too long, unavailable, not permitted, invalid, internal.
// One sentence and at most one action each; the raw text behind a closed
// disclosure, shown only when the engine tagged it safe (section 12.6).

import type React from "react";
import { DoorError } from "../ask/client";

export type Outcome = "too_long" | "unavailable" | "not_permitted" | "invalid" | "internal";

export interface Failed {
  outcome: Outcome;
  /** The engine's sentence when it tagged the error safe; absent otherwise. */
  raw: string | null;
  disclosure: "safe" | "gated" | "internal" | null;
}

/** The outcome an error names: from the status, then the disclosure tag when the engine sent one. */
export function classify(e: unknown): Failed {
  if (e instanceof DoorError) {
    const body = (e.body ?? {}) as { error?: unknown; disclosure?: unknown };
    const disclosure = body.disclosure === "safe" || body.disclosure === "gated" || body.disclosure === "internal" ? body.disclosure : null;
    const raw = disclosure === "safe" && typeof body.error === "string" ? body.error : null;
    const s = e.status;
    const outcome: Outcome =
      s === 408 || s === 504 ? "too_long" : s === 502 || s === 503 || s === 0 ? "unavailable" : s === 401 || s === 403 ? "not_permitted" : s >= 400 && s < 500 ? "invalid" : "internal";
    return { outcome, raw, disclosure };
  }
  if (e instanceof TypeError) return { outcome: "unavailable", raw: null, disclosure: null };
  return { outcome: "internal", raw: null, disclosure: null };
}

export const SENTENCES: Record<Outcome, string> = {
  too_long: "This took longer than the engine allows in one go.",
  unavailable: "The engine did not answer.",
  not_permitted: "This is not open to you.",
  invalid: "The engine refused the request as it stands.",
  internal: "Something went wrong inside the engine, and it is recorded there.",
};

export function Failure({ failed, action }: { failed: Failed; action?: { label: string; onClick: () => void } | null }) {
  return (
    <div className="failure" role="alert">
      <p className="failure-sentence">{SENTENCES[failed.outcome]}</p>
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {failed.raw && (
        <details className="failure-raw">
          <summary>What the engine said</summary>
          <pre>{failed.raw}</pre>
        </details>
      )}
    </div>
  );
}

/** The sentence and the action for an error caught by a page, as a node. */
export function failureOf(e: unknown, action?: { label: string; onClick: () => void } | null): React.ReactNode {
  return <Failure failed={classify(e)} action={action} />;
}
