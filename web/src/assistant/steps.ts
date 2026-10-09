// SPDX-License-Identifier: AGPL-3.0-only
// What the assistant did, as a person reads it: one short line per tool call,
// from the tool's name alone (and a skill's name, which says what it is
// doing). A tool's arguments and outputs never reach the page, since they can
// carry rows and sampled values. While a turn runs, one live line says what
// it is doing; once it has answered, the steps sit behind a small "?".

import type { PaneState, Tool } from "./parts";

const WORDS: Record<string, string> = {
  // the one agent's tools (events.ts)
  jobs_read: "Reading the jobs",
  run_read: "Reading a run",
  plan_update: "Planning",
  ask_user: "Asking you",
  propose_change: "Preparing a change for you",
  activate_skill: "Getting ready",
  // the stations' tools, for the chats that still talk to one
  nils_draft: "Writing the query",
  nils_values: "Looking up the values of a field",
  nils_document: "Reading the query",
  nils_diagnose: "Checking where the counts drop",
  nils_preview: "Previewing the first rows",
  nils_describe: "Reading what the query says",
  nils_handle: "Reading a result",
  nils_rows: "Reading rows of a result",
  nils_batches: "Reading the batches",
  nils_documents: "Reading the saved queries",
  nils_jobs: "Reading the jobs",
  nils_capabilities: "Looking in the registry",
  delegate: "Looking into it",
  delegation_status: "Looking into it",
  plan: "Planning",
  remember: "Noting something to keep",
  forget: "Forgetting something kept",
  search_conversations: "Searching your earlier conversations",
  recall_memory: "Looking up something kept",
};

/** The calls a person never sees: how a turn ends or moves on inside. */
const HIDDEN = new Set(["settle", "advance"]);

/** A skill's plain name, by its id. */
export const SKILL_WORDS: Record<string, string> = {
  "find-data": "Finding the data",
  "plan-work": "Planning the work",
  "plan-analysis": "Planning an analysis",
  "read-run": "Reading a run",
  "tune-sorting-words": "Tuning the sorting words",
  "check-identities": "Checking identities",
};

function skillWords(skill: string): string {
  const known = SKILL_WORDS[skill];
  if (known) return known;
  const plain = skill.replace(/[-_]+/g, " ").trim();
  return plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : WORDS.activate_skill;
}

/** The line for one tool call: known tools by what they do, families by their prefix, others by name. */
export function toolWords(name: string, skill?: string | null): string {
  if (name === "activate_skill" && skill) return skillWords(skill);
  if (WORDS[name]) return WORDS[name];
  if (name.startsWith("registry_")) return "Looking in the registry";
  if (name.startsWith("query_")) return "Writing the query";
  return `Using ${name.replace(/^nils_/, "").replace(/_/g, " ")}`;
}

export interface StepLine {
  id: string;
  words: string;
  state: Tool["state"];
}

/** The steps of a turn, in order, each once, with how it ended. */
export function stepLines(tools: Tool[]): StepLine[] {
  return tools.filter((t) => !HIDDEN.has(t.name)).map((t) => ({ id: t.id, words: t.words ?? toolWords(t.name), state: t.state }));
}

/** What the "?" shows first: the last three steps, and whether there are more. */
export function lastSteps(tools: Tool[], all = false): { lines: StepLine[]; more: number } {
  const lines = stepLines(tools);
  if (all || lines.length <= 3) return { lines, more: 0 };
  return { lines: lines.slice(-3), more: lines.length - 3 };
}

/** The one live line while a turn runs: what the running tool is doing, in its own log words when it gave some, else "Thinking". Null once the answer arrives or nothing runs. */
export function liveLine(pane: PaneState): string | null {
  if (!pane.busy) return null;
  const turn = [...pane.turns].reverse().find((t) => t.role === "assistant");
  if (turn && !turn.done) {
    const running = [...turn.tools].reverse().find((t) => t.state === "running" && !HIDDEN.has(t.name));
    if (running) return running.log ?? running.words ?? toolWords(running.name);
    // the answer is arriving: the line has done its work
    if (turn.text) return null;
  }
  return "Thinking";
}
