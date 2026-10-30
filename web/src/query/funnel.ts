// SPDX-License-Identifier: AGPL-3.0-only
// The yield funnel of a selection through a pipeline or family (record 58
// P4, Wave 7b spec section 15): the engine's `GET /api/funnel`, the same
// numbers `nils funnel` prints. Each row is the subjects, sessions and stacks
// left after the selection's filters and the pack's hard needs, broken down
// by year, base and 2D or 3D; the last line is the error-budget line. Counts
// only: the desk shows what the door says and works nothing out itself.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";

export const FUNNEL_DOOR = "GET /api/funnel";

export interface FunnelGroup {
  value: string;
  subjects: number;
  sessions: number;
  stacks: number;
}

export interface FunnelRow {
  row: number;
  kind: "selection" | "filter" | "units" | "inputs" | "need";
  what: string;
  subjects: number;
  sessions: number;
  stacks: number;
  units?: number;
  axes?: string[];
  need?: string;
  cannot_tell?: number;
  removed?: { subjects: number; sessions: number; stacks: number };
  lacking?: { why: string; units: number }[];
  left_out?: { why: string; stacks: number }[];
  by_year: FunnelGroup[];
  by_base: FunnelGroup[];
  by_dimension: FunnelGroup[];
}

export interface Budget {
  certificate: number | null;
  certificate_words?: string | null;
  at_most: number | null;
  words: string;
  terms: { row: number; axis: string; bound: number | null; bound_from: "axis" | "stack"; stacks: number; product: number | null }[];
}

export interface Funnel {
  selection: string;
  pipeline?: string;
  family?: string;
  unit: string;
  rows: FunnelRow[];
  monotone: boolean;
  budget: Budget;
}

export const funnel = {
  of: (selection: string, pipeline: string) => door<Funnel>("GET", `/api/funnel?${new URLSearchParams({ selection, pipeline }).toString()}`),
};

/** Whether the funnel is served to this person: the Pipelines page's reading grant, and the door. */
export function mayFunnel(caps: Capabilities | undefined): boolean {
  return !!caps && may(caps, "pipelines:see") && served(caps, FUNNEL_DOOR);
}

const n = (v: number) => v.toLocaleString("en-US");

/** A row's first words: what kept it. */
export function stepWords(r: FunnelRow, unit: string): string {
  switch (r.kind) {
    case "selection":
      return "Start";
    case "filter":
      return r.what;
    case "units":
      return `In a ${unit}`;
    case "inputs":
      return "Has its inputs";
    case "need":
      return r.need ?? r.what;
  }
}

/** What a row dropped, in a few words, or nothing. */
export function droppedWords(r: FunnelRow): string {
  if (!r.removed || r.removed.stacks === 0) return "";
  return `−${n(r.removed.stacks)}`;
}

/** A breakdown in one line: "2022 4 · 2023 2". */
export function groupWords(groups: FunnelGroup[]): string {
  return groups.map((g) => `${g.value} ${n(g.stacks)}`).join(" · ");
}
