// SPDX-License-Identifier: AGPL-3.0-only
// A dataset that is not read yet, as every page shows it (Wave 7a, H2 round
// 1): plainly not read, with the engine's reason, and the one button that
// finishes it. The button is there for a person who may finish it; anyone
// else reads the line alone.

import { FINISH, NOT_READ } from "./layout";

export function NotRead({ name, why, onFinish }: { name: string; why: string; onFinish: (() => void) | null }) {
  return (
    <div className="row not-read" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="tag caution">{NOT_READ}</span>
      <span className="meta grow">{why}</span>
      {onFinish && (
        <button type="button" className="button secondary small" aria-label={`${FINISH}: ${name}`} onClick={onFinish}>
          {FINISH}
        </button>
      )}
    </div>
  );
}
