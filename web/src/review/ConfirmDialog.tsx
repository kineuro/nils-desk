// SPDX-License-Identifier: AGPL-3.0-only
// The confirm of one move in Review (UX round 5, finding 3): one paragraph
// in a person's words that says what happens, one button that goes quiet
// while the call is out, Cancel, and the engine's refusal under them. The
// dialog closes the moment the engine answers; what follows (a line, a job
// followed) is the page's. The commit at or above the threshold and the
// grid's accept of a whole band (UX round 6, item 5) are both this piece.

import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import type { IconName } from "../ui/Icon";
import { refusalWords } from "./client";

export function ConfirmDialog<T>({
  title,
  icon = "review",
  words,
  button,
  busyWords,
  go,
  onClose,
  onDone,
  onRefused = refusalWords,
}: {
  title: string;
  icon?: IconName;
  /** The one paragraph. */
  words: string;
  /** The button's words, and its words while the call is out. */
  button: string;
  busyWords: string;
  /** The call. */
  go: () => Promise<T>;
  onClose: () => void;
  /** The engine answered: the dialog is closed by the page. */
  onDone: (answer: T) => void;
  /** The engine refused: the words to show under the buttons, or null where the page took it over (and closes the dialog). */
  onRefused?: (e: unknown) => string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const run = () => {
    if (busy) return;
    setBusy(true);
    setRefused(null);
    go().then(
      (r) => onDone(r),
      (e: unknown) => {
        const said = onRefused(e);
        if (said === null) return;
        setBusy(false);
        setRefused(said);
      },
    );
  };
  return (
    <Dialog
      title={title}
      icon={icon}
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy} aria-busy={busy || undefined} onClick={run}>
            {busy ? busyWords : button}
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">{words}</p>
    </Dialog>
  );
}
