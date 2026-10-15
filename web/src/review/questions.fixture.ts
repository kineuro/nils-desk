// SPDX-License-Identifier: AGPL-3.0-only
// Fixtures of Review round 1's doors (record 56 section 6.3), in the shapes
// the engine answers: a dataset's questions, a page of a question the rules
// left empty (seven scans, one answer staged by System 1, one read blind
// first) and a page of two values in dispute (twelve scans with System 1's
// answers, the four it agrees on stepping back). Every value is made up.

import type { Json } from "../ask/client";

export const VOCAB = [
  { value: "DWI", name: "DWI", label: null },
  { value: "SWI", name: "SWI", label: null },
  { value: "T2*w", name: "T2starw", label: "T2*w" },
  { value: "T2w", name: "T2w", label: null },
  { value: "PDw", name: "PDw", label: null },
  { value: "T1w", name: "T1w", label: null },
];

export const LIST: Json = {
  scope: { kind: "dataset", name: "ms-a", id: 3 },
  scans: 21,
  questions: [
    { key: "base:PDw|T2w", axis: "base", shape: "pair", values: ["T2w", "PDw"], words: "T2w or PDw?", reason: "The rules and System 1 disagree.", scans: 12, staged: 0, kinds: { "base:disagree": 12 } },
    { key: "base:missing", axis: "base", shape: "missing", values: ["T1w", "T2w"], words: "Which base?", reason: "The rules found no base for these scans.", scans: 7, staged: 1, kinds: { "base:missing": 7 } },
  ],
  vocabularies: { base: VOCAB },
  elsewhere: [{ kind: "classify.asked", scans: 2, words: "System 1 asks about a whole scan", page: "asked" }],
  held: { scans: 3, campaigns: [{ id: 6, name: "base-check" }] },
};

/** A small grey picture of a scan, as an inline image: a disc whose size and shade follow the stack. */
export function picture(stack: number): string {
  const r = 30 + (stack * 7) % 30;
  const g = 90 + (stack * 37) % 120;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="black"/><ellipse cx="64" cy="64" rx="${r}" ry="${r + 14}" fill="rgb(${g},${g},${g})"/><ellipse cx="64" cy="60" rx="${Math.round(r / 3)}" ry="${Math.round(r / 2)}" fill="rgb(${g - 50},${g - 50},${g - 50})"/></svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(svg) : Buffer.from(svg).toString("base64")}`;
}

const scanRow = (stack: number, over: Json = {}): Json => ({
  stack,
  items: [41],
  status: "open",
  mode: "routine",
  blind: false,
  subject: { id: 1 + (stack % 4), code: `9f3c${stack % 4}a7e1b2d4` },
  session: { id: 10 + (stack % 4), label: "20240131" },
  day: "2024-01-31",
  series_description: `ax t2 tse ${stack}`,
  series_number: 3,
  name: `Ax_T2w_2D_TSE_${stack}`,
  bids: null,
  axes: { technique: "TSE" },
  picture: { data: picture(stack), width: 128, height: 128, digest: null, held: false, partial: false },
  nils: null,
  other: null,
  rules: { axis: "base", value: null, set_by: { kind: "rule" }, decided: null, line: "base: (nothing)", overridden: [] },
  system1: null,
  staged: null,
  ...over,
});

/** `base:missing`: seven scans the rules found no base for; one with System 1's answer staged, one read blind first. */
export const PAGE_MISSING: Json = {
  key: "base:missing",
  axis: "base",
  shape: "missing",
  words: "Which base?",
  reason: "The rules found no base for these scans.",
  values: ["T1w", "T2w"],
  vocabulary: VOCAB,
  system1: { status: "not_confirmed", model: { id: 7, name: "s1c", version: "2026-10-09" }, why: "no recorded certificate names it" },
  total: 7,
  page: 1,
  pages: 1,
  limit: 50,
  pictures: { shown: true, why: null, missing: 0, partial: 0 },
  scans: [
    scanRow(201, { system1: { value: "T1w", p: 0.91, reliability: 0.4, agrees: false } }),
    scanRow(202, { system1: { value: "T1w", p: 0.88, reliability: 0.4, agrees: false } }),
    scanRow(203, { status: "staged", system1: { value: "T2w", p: 0.97, reliability: 0.6, agrees: false }, staged: { value: "T2w", decision: 90, author_kind: "model", actor: "s1c", model_id: 7 } }),
    scanRow(204, { system1: { value: "T1w", p: 0.64, reliability: 0.4, agrees: false } }),
    scanRow(205, { mode: "blind_first", blind: true, name: null, rules: null, system1: null }),
    scanRow(206, { system1: { value: "PDw", p: 0.52, reliability: 0.3, agrees: false } }),
    scanRow(207),
  ],
};

/** `base:PDw|T2w`: twelve scans the rules call T2w and System 1 PDw, but for four it agrees on. */
export const PAGE_PAIR: Json = {
  key: "base:PDw|T2w",
  axis: "base",
  shape: "pair",
  words: "T2w or PDw?",
  reason: "The rules and System 1 disagree.",
  values: ["T2w", "PDw"],
  vocabulary: VOCAB,
  system1: { status: "confirmed", model: { id: 7, name: "s1c", version: "2026-10-09" }, why: null },
  total: 12,
  page: 1,
  pages: 1,
  limit: 50,
  pictures: { shown: true, why: null, missing: 0, partial: 0 },
  scans: Array.from({ length: 12 }, (_, k) => {
    const agrees = k % 3 === 2;
    return scanRow(301 + k, {
      items: [60 + k],
      name: `Ax_T2w_2D_IR-TSE_${301 + k}`,
      nils: "T2w",
      other: "PDw",
      rules: {
        axis: "base",
        value: "T2w",
        set_by: { kind: "rule" },
        decided: { rule_set: "base", rule: "t2_by_name", clause: 0, tier: "name" },
        line: "base: T2w by base/t2_by_name (name)",
        overridden: k % 4 === 0 ? [{ rule_set: "physics", rule: "pd_by_te", value: "PDw", tier: "physics", rank: "rule_set_order" }] : [],
      },
      system1: agrees ? { value: "T2w", p: 0.96, reliability: 0.8, agrees: true } : { value: "PDw", p: 0.81 + (k % 5) / 50, reliability: 0.35, agrees: false },
    });
  }),
};

/** What the answer door says after a page. */
export function answered(key: string, stacks: number[], left: number, skipped: number[] = []): Json {
  return {
    key,
    axis: "base",
    answered: stacks.length - skipped.length,
    decisions: stacks.filter((s) => !skipped.includes(s)).map((s, i) => ({ stack: s, value: "T1w", decision: 500 + i, items: [41], staged: false })),
    closed: [41],
    skipped,
    staged: false,
    blind: 0,
    resort: { job: 88, state: "done", stacks: stacks.length - skipped.length, seconds: 0.4, questions: {}, gate: null, why: null },
    picks: { job: 89 },
    left,
  };
}
