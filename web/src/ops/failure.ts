// SPDX-License-Identifier: AGPL-3.0-only
// Why a run failed, as a person reads it (2026-10-12): the engine's error, and
// since its failure slice the kind of failure (dependency, resource, input or
// pipeline) and one plain sentence of what to do, beside the error in a run's
// answer, a unit's and a pre-flight's refusal. The line a person reads first
// is that sentence; an engine that says neither gets the error's first
// sentence. A missing tool the engine can install itself (dcm2niix) is
// installed from the desk by an admin, and its status read from the
// capabilities.
//
// The names those answers give live in SLICE and nowhere else: when the
// engine's slice reports its names, only SLICE changes.

import { DoorError, type Json } from "../ask/client";

/** The engine's names, each a dotted path into the answer it is read from. */
export const SLICE = {
  /** A run's, a unit's or a refusal's error, as every engine says it. */
  error: "error",
  /** Beside it: the kind of failure, one of KINDS. */
  kind: "error_kind",
  /** Beside it: one plain sentence of what to do. */
  todo: "what_to_do",
  /** Beside it, on a dependency: the tool it is about. */
  tool: "dependency",
  /** The door that installs a pinned tool, admin only and audited; `{tool}` is the tool's name. */
  install: "POST /api/tools/{tool}/install",
  /** Where the capabilities say whether a tool is present, where and which version; `{tool}` likewise. */
  status: "tools.{tool}",
  /** The fields of that status, and of the install door's answer. */
  present: "present",
  path: "path",
  version: "version",
} as const;

/** The kinds the engine sorts a failure into. */
export const KINDS = ["dependency", "resource", "input", "pipeline"] as const;

/** The tools the engine installs itself, each with the way by hand where it cannot. */
export const INSTALLABLE: Record<string, { manual: string }> = {
  dcm2niix: { manual: "By hand: install a current build from github.com/rordenlab/dcm2niix where the engine runs, on its path." },
};

/** A value at a dotted path, where every step is an object. */
export function at(answer: unknown, path: string): unknown {
  let v: unknown = answer;
  for (const k of path.split(".")) {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
    v = (v as Json)[k];
  }
  return v;
}

const said = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The first sentence of an engine's words: up to the first stop followed by a space, the whole when there is none. */
export function firstSentence(words: string): string {
  const t = words.trim();
  const m = /^.*?[.!?](?=\s|$)/su.exec(t);
  return m ? m[0] : t;
}

export interface Failure {
  /** The engine's error, whole. */
  error: string;
  /** The kind, where the engine says it. */
  kind: string | null;
  /** What to do, where the engine says it. */
  todo: string | null;
  /** The one line a person reads first: what to do, else the error's first sentence. */
  line: string;
  /** The tool the failure is about, where it is one the engine installs. */
  tool: string | null;
}

/** The failure an answer holds, read by the engine's names; null where it holds no error. */
export function failureOf(answer: unknown): Failure | null {
  const error = said(at(answer, SLICE.error));
  const todo = said(at(answer, SLICE.todo));
  if (error === null && todo === null) return null;
  const kind = said(at(answer, SLICE.kind));
  const named = said(at(answer, SLICE.tool));
  const whole = error ?? todo!;
  // a tool the engine installs: named by the slice, else found in the words of a dependency, or of an engine that sorts nothing
  const found = kind === null || kind === "dependency" ? (Object.keys(INSTALLABLE).find((t) => new RegExp(`\\b${t}\\b`, "iu").test(whole)) ?? null) : null;
  const tool = named !== null ? (Object.keys(INSTALLABLE).find((t) => t === named.toLowerCase()) ?? null) : found;
  return { error: whole, kind, todo, line: todo ?? firstSentence(whole), tool };
}

/** A refused door's failure: the engine's answer read as one, else the error's own words. */
export function refusalOf(e: unknown): Failure {
  const body = e instanceof DoorError ? e.body : null;
  const words = e instanceof DoorError ? `the engine answered ${e.status}` : e instanceof Error ? e.message : String(e);
  return failureOf(body) ?? failureOf({ [SLICE.error]: words })!;
}

/** A refusal held as words only, as an older page keeps it. */
export function failureWords(words: string): Failure {
  return failureOf({ [SLICE.error]: words }) ?? { error: words, kind: null, todo: null, line: words, tool: null };
}
