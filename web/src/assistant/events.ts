// SPDX-License-Identifier: AGPL-3.0-only
// One chat (2026-10-09): the shapes the one agent and the desk agree on, in
// one place. The assistant side is built against this comment, so it says
// exactly what the desk reads and nothing more.
//
// THE AGENT
//   Every new chat talks to one agent, id "nils". While the assistant does not
//   serve "nils" yet, a new chat goes to the concierge (else ask-help), as
//   before. A chat started on another station keeps it for life.
//
// THE STREAM (Flue's conversation stream, reference/streaming-protocol.md)
//   GET /assistant/agents/<agent>/<id>?view=updates&offset=<o>&live=sse
//     event: data     data: ConversationStreamChunk[]
//     event: control  data: {"streamNextOffset": string, "upToDate"?: true}
//   Chunks are deduped by `position` ({batch, index}, compared in that order).
//   When the assistant answers anything but text/event-stream, the desk falls
//   back to `live=long-poll` for the rest of the page's life.
//
// TOOL CALLS (chunk types tool-input, tool-output, tool-output-error)
//   The desk reads a tool's name, never its arguments or output, with one
//   exception: `activate_skill`'s `input.name`, which names the skill shown in
//   the status line. Names the desk turns into words (steps.ts):
//     registry_*        "Looking in the registry"
//     query_*           "Writing the query"
//     jobs_read         "Reading the jobs"
//     run_read          "Reading a run"
//     plan_update       "Planning"
//     ask_user          "Asking you"
//     propose_change    "Preparing a change for you"
//     activate_skill    the skill's plain name (SKILL_WORDS below)
//   `settle` and `advance` are never shown.
//
// DATA PARTS (chunk type data-part, written with Flue's useDataWriter(kind);
// the channel name equals data.kind, as today's move_proposal and choice):
//   {kind: "progress", call: string | null, text: string}
//       A tool's own log line in plain words while it runs ("Reading 12 of 40
//       datasets"). `call` is the toolCallId; null means the running call.
//   {kind: "plan_update", items: {text: string, status: PlanStatus}[]}
//       The whole plan each time (no deltas). The panel shows while a plan of
//       two or more items exists and is not all done.
//   {kind: "approval", id: string, change: ChangeKind, title?: string,
//    sentence: string, lines?: string[], ref?: {document?: number,
//    parent?: number | null, plan?: string}}
//       One pending change from `propose_change`. The model never applies it.
//       query_version (with ref.document) is decided as a move_proposal is
//       today: POST /assistant/conversations/<id>/feedback. Every other kind:
//       POST /assistant/changes/<id>/decide {"verdict": "approved" | "declined"},
//       and the assistant applies it in application code.
//   {kind: "clarification", question: string,
//    options: {label: string, count?: number | null}[]}
//       From `ask_user`; the turn ends there. A click sends the label as the
//       person's next message; the box stays open for other words.
//   Today's parts stay as they are: move_proposal and choice map onto the
//   approval and clarification cards, and a job plan from the inbox (today's
//   Confirm card) maps onto the approval card.
//
// No part names an agent, a station or a phase; the desk shows none.

import type { Capabilities } from "../capabilities";
import type { Plan } from "./client";
import type { Change, Proposal } from "./parts";
import { stationOf, stationsServed } from "./stations";

/** The one agent every new chat talks to. */
export const ONE_AGENT = "nils";

/** The agent a new chat goes to: the one agent when served, else today's concierge (or ask-help). */
export function agentFor(caps: Capabilities): string {
  return stationsServed(caps).includes(ONE_AGENT) ? ONE_AGENT : stationOf(caps);
}

export type PlanStatus = "pending" | "running" | "done" | "failed" | "skipped";
export interface PlanItem {
  text: string;
  status: PlanStatus;
}

export type ChangeKind = "query_version" | "job_plan" | "sorting_words" | "identity_merge";

export type OneChatPart =
  | { kind: "progress"; call: string | null; text: string }
  | { kind: "plan_update"; items: PlanItem[] }
  | {
      kind: "approval";
      id: string;
      change: ChangeKind;
      title: string | null;
      sentence: string;
      lines: string[];
      ref: { document?: number; parent?: number | null; plan?: string };
    }
  | { kind: "clarification"; question: string; options: { label: string; count: number | null }[] };

const STATUSES: PlanStatus[] = ["pending", "running", "done", "failed", "skipped"];
const CHANGES: ChangeKind[] = ["query_version", "job_plan", "sorting_words", "identity_merge"];
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The guard of the one chat's parts: one of the four shapes, or null. */
export function asOneChatPart(v: unknown): OneChatPart | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.kind) {
    case "progress":
      return isStr(o.text) && o.text.trim() ? { kind: "progress", call: isStr(o.call) ? o.call : null, text: o.text.trim() } : null;
    case "plan_update":
      if (!Array.isArray(o.items)) return null;
      return {
        kind: "plan_update",
        items: o.items.flatMap((x) => {
          const i = x as Record<string, unknown> | null;
          return i && isStr(i.text) ? [{ text: i.text, status: STATUSES.includes(i.status as PlanStatus) ? (i.status as PlanStatus) : "pending" }] : [];
        }),
      };
    case "approval": {
      if (!isStr(o.id) || !CHANGES.includes(o.change as ChangeKind) || !isStr(o.sentence)) return null;
      const r = (typeof o.ref === "object" && o.ref !== null ? o.ref : {}) as Record<string, unknown>;
      const ref: { document?: number; parent?: number | null; plan?: string } = {};
      if (isNum(r.document)) ref.document = r.document;
      if (r.parent === null || isNum(r.parent)) ref.parent = r.parent as number | null;
      if (isStr(r.plan)) ref.plan = r.plan;
      if (o.change === "query_version" && ref.document === undefined) return null;
      return {
        kind: "approval",
        id: o.id,
        change: o.change as ChangeKind,
        title: isStr(o.title) ? o.title : null,
        sentence: o.sentence,
        lines: Array.isArray(o.lines) ? o.lines.filter(isStr) : [],
        ref,
      };
    }
    case "clarification": {
      if (!isStr(o.question) || !Array.isArray(o.options)) return null;
      const options = o.options.flatMap((x) => {
        const c = x as Record<string, unknown> | null;
        return c && isStr(c.label) ? [{ label: c.label, count: isNum(c.count) ? c.count : null }] : [];
      });
      return { kind: "clarification", question: o.question, options };
    }
    default:
      return null;
  }
}

/** The one approval card, whatever asked for it: a query version, a job plan, sorting words or an identity merge. */
export interface ApprovalCard {
  /** Unique among the cards a turn shows. */
  key: string;
  change: ChangeKind;
  title: string;
  sentence: string;
  lines: string[];
  state: "open" | "approved" | "declined" | "stale";
  /** Why it cannot be decided here, when it is decided elsewhere (a query card above it). */
  elsewhere?: string;
  approve: string;
  decline: string;
}

/** What each kind of change is called on its card when the agent gave no title. */
export const CHANGE_TITLES: Record<ChangeKind, string> = {
  query_version: "A new version of the query",
  job_plan: "A plan to run",
  sorting_words: "New sorting words",
  identity_merge: "Two identities as one person",
};

/** A query version (today's move_proposal) on the approval card; decided here only where the page passes a decider, else where `elsewhere` says. */
export function cardOfProposal(p: Proposal, elsewhere?: string): ApprovalCard {
  return {
    key: `q${p.document}`,
    change: "query_version",
    title: CHANGE_TITLES.query_version,
    sentence: p.sentence,
    lines: p.stale ? ["The query moved on since; this version can no longer be taken."] : [],
    state: p.stale ? "stale" : p.decided === "accepted" ? "approved" : p.decided === "rejected" ? "declined" : "open",
    ...(elsewhere ? { elsewhere } : {}),
    approve: "Accept",
    decline: "Disregard",
  };
}

/** A change the one agent proposed, on the approval card. */
export function cardOfChange(c: Change): ApprovalCard {
  return {
    key: `c${c.id}`,
    change: c.change,
    title: c.title ?? CHANGE_TITLES[c.change],
    sentence: c.sentence,
    lines: c.lines,
    state: c.decided ?? "open",
    approve: c.change === "job_plan" ? "Confirm" : "Accept",
    decline: "Disregard",
  };
}

/** A job plan from the inbox (today's Confirm card) on the approval card: its steps as lines; declining means saying what to change. */
export function cardOfPlan(p: Plan): ApprovalCard {
  const open = !p.confirmed_at;
  return {
    key: `p${p.id}`,
    change: "job_plan",
    title: p.steps.length === 1 ? CHANGE_TITLES.job_plan : `${CHANGE_TITLES.job_plan}, in ${p.steps.length} steps`,
    sentence: p.instruction,
    lines: p.steps.map((s) => (open ? s.words : `${s.words}: ${s.state}${s.reason ? `, ${s.reason}` : ""}`)),
    state: open ? "open" : "approved",
    approve: "Confirm",
    decline: "Change it",
  };
}

/** Whether the plan panel shows: a plan of two or more items exists and not all of it is done. */
export function planShown(plan: PlanItem[] | null): plan is PlanItem[] {
  return plan !== null && plan.length >= 2 && plan.some((i) => i.status === "pending" || i.status === "running");
}

/** The one clarification card: a question and its options, each answered with a click. */
export interface ClarificationCard {
  question: string;
  options: { label: string; count: number | null }[];
}

/** One event on the SSE wire: its name and its data line(s). */
export interface SseEvent {
  event: string;
  data: string;
}

/** Splits what an event stream sent so far into whole events and the rest still arriving; comments (heartbeats) are dropped. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const text = buffer.replace(/\r\n?/g, "\n");
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue;
      const at = line.indexOf(":");
      const field = at < 0 ? line : line.slice(0, at);
      const value = at < 0 ? "" : line.slice(at + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/** A chunk's place in the stream, for dropping what a reconnect sends twice. */
export type Position = { batch: number; index: number };

export function positionOf(c: object): Position | null {
  const p = (c as { position?: unknown }).position as Partial<Position> | undefined;
  return p && isNum(p.batch) && isNum(p.index) ? { batch: p.batch, index: p.index } : null;
}

/** Whether a position comes after another (null is before everything). */
export function after(p: Position, last: Position | null): boolean {
  return last === null || p.batch > last.batch || (p.batch === last.batch && p.index > last.index);
}
