// SPDX-License-Identifier: AGPL-3.0-only
// A count as a page shows it: in figures, or "held back" where the engine
// held it back (record 55 K7, small counts at plain), with why on hover.

import { type Count, countText, countUnit, HELD_WHY } from "../ask/held";

export function CountText({ value, unit, why, className = "num" }: { value: Count; unit?: string; why?: string | null; className?: string }) {
  const words = unit === undefined ? countText(value) : countUnit(value, unit);
  if (value !== null) return <span className={className}>{words}</span>;
  return (
    <span className={`${className} held`} title={why || HELD_WHY}>
      {words}
    </span>
  );
}
