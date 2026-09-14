// SPDX-License-Identifier: AGPL-3.0-only
// What the assistant did, as a person reads it: one short line per tool call,
// from the tool's name alone. A tool's arguments and outputs never reach the
// page, since they can carry rows and sampled values; the name and its state
// say enough.

import type { Tool } from "./parts";

const WORDS: Record<string, string> = {
  nils_draft: "Drafted the query",
  nils_values: "Looked up the values of a field",
  nils_document: "Read the query",
  nils_diagnose: "Checked where the counts drop",
  nils_preview: "Previewed the first rows",
  nils_describe: "Read what the query says",
  nils_handle: "Read a result",
  nils_rows: "Read rows of a result",
  nils_batches: "Read the batches",
  nils_documents: "Read the saved queries",
  nils_jobs: "Read the jobs",
  delegate: "Handed the question to another station",
  delegation_status: "Checked on the handover",
  plan: "Planned the work",
  advance: "Moved on",
  settle: "Settled the answer",
  remember: "Noted something to keep",
  forget: "Forgot something kept",
  search_conversations: "Searched your earlier conversations",
};

/** The line for one tool call: known tools by what they do, others by name. */
export function toolWords(name: string): string {
  return WORDS[name] ?? `Used ${name.replace(/^nils_/, "").replace(/_/g, " ")}`;
}

/** The steps of a turn, in order, each once, with how it ended. */
export function stepLines(tools: Tool[]): { id: string; words: string; state: Tool["state"] }[] {
  return tools.filter((t) => t.name !== "settle").map((t) => ({ id: t.id, words: toolWords(t.name), state: t.state }));
}

/** The short line a folded list of steps shows: the last step, and how many came before it. */
export function foldedSteps(tools: Tool[]): { last: string; earlier: number } | null {
  const lines = stepLines(tools);
  if (lines.length === 0) return null;
  return { last: lines[lines.length - 1].words, earlier: lines.length - 1 };
}
