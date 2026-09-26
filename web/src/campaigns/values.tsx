// SPDX-License-Identifier: AGPL-3.0-only
// One colour per value of an axis (record 50, after the first gold
// campaign: "beside number which is convenient do also color code. easy for
// batch selection"). A value takes the slot of its place in the axis's
// values, so it keeps its colour on every page, in the gallery and on the
// reader's rows alike; the colours are the theme's `--n-value-<slot>`
// tokens, legible in both themes. Colour alone never tells a value apart: a
// shape of its own stands beside it, and its number key stays.

/** How many colours and shapes there are, one per number key; a value past them has neither, as it has no key. */
export const SLOTS = 10;

/** One shape per slot, told apart without colour. */
export const SHAPES = ["●", "■", "▲", "◆", "★", "✚", "⬟", "▼", "◐", "✱"];

/** A value's slot, 1 to SLOTS, by its place among the axis's values; null for a value the axis does not have or one past the tenth. */
export function slotOf(values: string[], value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = values.indexOf(value);
  return n < 0 || n >= SLOTS ? null : n + 1;
}

/** The shape of a slot. */
export const shapeOf = (slot: number): string => SHAPES[(slot - 1) % SLOTS];

/** The attributes that colour an element by a value: its slot for the theme's rule, nothing for no value. */
export function valueTone(values: string[], value: string | null | undefined): { "data-slot"?: number } {
  const s = slotOf(values, value);
  return s === null ? {} : { "data-slot": s };
}

/** A value's mark: its shape in its colour, beside its name and key. Hidden from a screen reader, which reads the name. */
export function ValueMark({ values, value }: { values: string[]; value: string | null | undefined }) {
  const s = slotOf(values, value);
  if (s === null) return null;
  return (
    <span className="vmark" data-slot={s} aria-hidden="true">
      {shapeOf(s)}
    </span>
  );
}
