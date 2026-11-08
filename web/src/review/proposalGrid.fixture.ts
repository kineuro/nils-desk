// SPDX-License-Identifier: AGPL-3.0-only
// Fixtures of the batch accept grid's doors (UX round 5), in the shapes the
// engine answers: a body-part model's unsure proposals, three values (neck,
// spine, brain) over a band below its threshold, paged; and what the accept
// door says. The pictures are small grey discs. Every value is made up.

import type { Json } from "../ask/client";
import { picture } from "./questions.fixture";

export const MODEL = { id: 12, name: "bodypart-cascade", version: "r7-fast", digest: "sha256:ab12", state: "admitted" };

/** The counts by value in the band below the threshold. */
export const VALUES: Record<string, number> = { neck: 41212, spine: 30180, brain: 2740 };

/** Ten bands over the model's range, most of the mass in the middle. */
export function bands(value: string | null): Json[] {
  const total = value ? VALUES[value] ?? 0 : Object.values(VALUES).reduce((a, b) => a + b, 0);
  const weights = [2, 5, 9, 14, 17, 16, 13, 10, 8, 6];
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.floor((total * w) / sum));
  counts[counts.length - 1] += total - counts.reduce((a, b) => a + b, 0);
  return counts.map((count, i) => ({ from: Math.round((0.3 + i * 0.059) * 1e4) / 1e4, to: Math.round((0.3 + (i + 1) * 0.059) * 1e4) / 1e4, count }));
}

/** One scan proposed `value` at a probability that falls as `k` grows. */
export function gscan(stack: number, value: string, k: number, over: Json = {}): Json {
  return {
    stack,
    item: 900 + (stack % 7),
    proposed: value,
    probability: Math.round((0.9 - (k % 500) * 0.0006) * 1e4) / 1e4,
    status: "open",
    run: 184,
    now: k % 9 === 0 ? null : k % 4 === 0 ? "brain" : value,
    decided: false,
    subject: { id: 1 + (stack % 40), code: `9f3c${(stack % 40).toString(16).padStart(2, "0")}a7e1b2d4` },
    session: { id: 100 + (stack % 40), label: "20240131" },
    day: "2024-01-31",
    series_description: `ax t2 tse ${stack}`,
    name: `Ax_T2w_2D_TSE_${stack}`,
    bids: null,
    axes: { technique: "TSE" },
    picture: { data: picture(stack), width: 128, height: 128, digest: null, held: false, partial: false },
    ...over,
  };
}

/** A page of the scans door: `size` scans of `value` (the first decided by a person), or of every value where none is asked. */
export function gpage(opts: { value?: string | null; min?: number | null; max?: number | null; page?: number; size?: number; total?: number } = {}): Json {
  const value = opts.value ?? null;
  const size = opts.size ?? 500;
  const page = opts.page ?? 1;
  const total = opts.total ?? (value ? VALUES[value] ?? 0 : Object.values(VALUES).reduce((a, b) => a + b, 0));
  const pages = Math.max(1, Math.ceil(total / size));
  const shown = Math.max(0, Math.min(size, total - (page - 1) * size));
  const names = Object.keys(VALUES);
  return {
    model: MODEL,
    label: `${MODEL.name}@${MODEL.version}`,
    axis: "body_part",
    value,
    min: opts.min ?? null,
    max: opts.max ?? null,
    threshold: 0.9,
    thresholds: [0.9],
    range: { low: 0.3, high: 0.89 },
    values: names.map((v) => ({ value: v, count: VALUES[v] })),
    bands: bands(value),
    total,
    page,
    pages,
    size,
    asked: 0,
    withheld_sealed: 0,
    pictures: { shown: true, why: null, missing: 0, partial: 0 },
    scans: Array.from({ length: shown }, (_, k) => {
      const i = (page - 1) * size + k;
      const stack = 1000 + i;
      return gscan(stack, value ?? names[i % 3], i, k === 0 && page === 1 ? { decided: true, now: "brain" } : {});
    }),
  };
}

/** What the accept door says after a page. */
export function accepted(body: { seen: number[]; except: number[]; value: string }, job = 356): Json {
  const written = body.seen.filter((s) => !body.except.includes(s) && s !== 1000);
  return {
    model: MODEL,
    label: `${MODEL.name}@${MODEL.version}`,
    axis: "body_part",
    value: body.value,
    decided: written.length,
    decisions: written.map((s, i) => ({ stack: s, decision: 7000 + i })),
    closed: written.length > 0 ? [903] : [],
    left_in_items: 12,
    kept_decided: body.seen.includes(1000) && !body.except.includes(1000) ? 1 : 0,
    left_out_sealed: 0,
    set_apart: body.except.length,
    resort: written.length > 0 ? { job, state: "queued", stacks: written.length } : { job: null, state: "done", stacks: 0 },
  };
}
