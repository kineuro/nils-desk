// SPDX-License-Identifier: AGPL-3.0-only
// An undeclared place, as every page shows it (Wave 7a, H2 round 1): plainly
// not read until someone says how its files arrive, with the one button into
// Add a dataset that says it. The button is there for a person who may
// declare it; anyone else reads the line alone.

import { NOT_READ, SAY_HOW } from "./layout";

export function Undeclared({ name, onDeclare }: { name: string; onDeclare: (() => void) | null }) {
  return (
    <div className="row undeclared" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="tag caution">{NOT_READ}</span>
      {onDeclare && (
        <button type="button" className="button secondary small" aria-label={`${SAY_HOW}: ${name}`} onClick={onDeclare}>
          {SAY_HOW}
        </button>
      )}
    </div>
  );
}
