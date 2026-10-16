// SPDX-License-Identifier: AGPL-3.0-only
// When the supervisor last looked at the releases, and the way to have it look
// again. The supervisor keeps its look for a quarter of an hour, so a release
// published since is not offered until it looks again: on 2026-10-16 the page
// named the release before the newest one minute after the newest was out,
// under "checked just now", which was only when the page itself was read.

import { lookedWords } from "./parts";

/**
 * The look's age, and Look again where the person may act on the install
 * (`onLook` is null where not). Nothing from an engine that does not say when
 * it looked, so the page reads as it did.
 */
export function ReleasesLook({ looked, now, working, onLook }: { looked: string | null | undefined; now: number; working: boolean; onLook: (() => void) | null }) {
  const words = lookedWords(looked, now);
  if (words === null) return null;
  return (
    <>
      <span className="meta">{words}</span>
      {onLook && (
        <button type="button" className="button secondary small" disabled={working} onClick={onLook}>
          Look again
        </button>
      )}
    </>
  );
}
