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
//       and the assistant applies it in application code. The assistant's
//       analysis_plan arrives as job_plan and its overlay as sorting_words; an
//       identity_rule is only recorded on approval, and the card then points to
//       the dataset's page, where the rule is changed.
//   {kind: "clarification", question: string,
//    options: {label: string, count?: number | null}[]}
//       From `ask_user`; the turn ends there. A click sends the label as the
//       person's next message; the box stays open for other words.
//   {kind: "replaced"}
//       The words the turn wrote so far are replaced by the answer it writes
//       next: a check before the turn settled sent it back (2026-10-11). Live
//       it arrives before the next step starts; in a history it sits right
//       after the parts of the step it replaces. Once words follow it, the
//       words before it are not shown; a turn that writes none after it keeps
//       them.
//   {kind: "chart", items: {call: string | null, name: string, title: string,
//    media: "image/svg+xml" | "image/png", encoding: "utf8" | "base64",
//    data: string, bytes: number}[]}
//       The charts the turn wrote under the analysis workspace's /out. A PNG
//       is base64; an SVG is utf8 (base64 is read too) and at most 300,000
//       characters. Each is drawn in the turn as an image with its own light
//       surface, the same in either theme, from a data URL and never inlined
//       into the page; `title` is its caption, and it saves under `name`.
//   {kind: "file", items: {call: string | null, name: string,
//    media: "text/csv" | "text/tab-separated-values" | "text/plain" |
//    "application/json" | "text/markdown", encoding: "utf8", data: string,
//    bytes: number, rows: number | null}[]}
//       The files the turn wrote there, each at most 600,000 characters,
//       offered as a download. `rows` counts a CSV's or TSV's data rows, the
//       header left out; null otherwise.
//   In both, `call` is the toolCallId that wrote it, `name` a bare file name
//   (no slash, no ".."), and `bytes` its size. Each write carries the turn's
//   whole list so far, as plan_update carries the whole plan: Flue keeps one
//   part per name per response and a rewrite replaces it in place, so the desk
//   replaces the turn's list with the latest write, live and in a history
//   alike. An item of any other shape is dropped, and a turn keeps eight of
//   each at most.
//   Today's parts stay as they are: move_proposal and choice map onto the
//   approval and clarification cards, and a job plan from the inbox (today's
//   Confirm card) maps onto the approval card.
//
// No part names an agent, a station or a phase; the desk shows none.

import type { Capabilities } from "../capabilities";
import type { Plan } from "./client";
import { href } from "../routes";
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

export type ChangeKind = "query_version" | "job_plan" | "sorting_words" | "identity_merge" | "identity_rule";

export type FileMedia = "text/csv" | "text/tab-separated-values" | "text/plain" | "application/json" | "text/markdown";

/** A chart a turn wrote under the workspace's /out: an SVG in utf8 or base64, a PNG in base64. */
export interface ChartItem {
  call: string | null;
  name: string;
  /** Its caption; the file's name where the agent gave none. */
  title: string;
  media: "image/svg+xml" | "image/png";
  encoding: "utf8" | "base64";
  data: string;
  bytes: number;
}

/** A file a turn wrote there, offered as a download. */
export interface FileItem {
  call: string | null;
  name: string;
  media: FileMedia;
  encoding: "utf8";
  data: string;
  bytes: number;
  /** A CSV's or TSV's data rows, the header left out; null for any other file. */
  rows: number | null;
}

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
  | { kind: "clarification"; question: string; options: { label: string; count: number | null }[] }
  | { kind: "replaced" }
  | { kind: "chart"; items: ChartItem[] }
  | { kind: "file"; items: FileItem[] };

const STATUSES: PlanStatus[] = ["pending", "running", "done", "failed", "skipped"];
const CHANGES: ChangeKind[] = ["query_version", "job_plan", "sorting_words", "identity_merge", "identity_rule"];
const FILE_MEDIA: FileMedia[] = ["text/csv", "text/tab-separated-values", "text/plain", "application/json", "text/markdown"];
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The most charts and the most files a turn keeps, and the longest an SVG and a file may be, in characters. */
export const OUTPUTS_KEPT = 8;
export const SVG_MOST = 300_000;
export const FILE_MOST = 600_000;

/** A bare file name: no folder, no way up, nothing unprintable. */
const bare = (v: unknown): v is string => isStr(v) && v.trim() !== "" && !/[\/\\]|\.\.|[\u0000-\u001f\u007f]/u.test(v);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
/** A PNG's bytes in base64 begin with its signature. */
const PNG_BASE64 = /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u;

/** The size the item said, or what its data holds where it said none. */
function sized(said: unknown, data: string, encoding: "utf8" | "base64"): number {
  if (isNum(said) && said >= 0) return said;
  if (encoding === "utf8") return new TextEncoder().encode(data).length;
  return Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
}

function asChart(v: unknown): ChartItem | null {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  if (!bare(o.name) || !isStr(o.data)) return null;
  const name = o.name;
  const head = { call: isStr(o.call) ? o.call : null, name, title: isStr(o.title) && o.title.trim() ? o.title.trim() : name };
  // base64 may come wrapped in lines; a data URL takes it whole
  const packed = o.encoding === "base64" ? o.data.replace(/\s+/gu, "") : o.data;
  if (o.media === "image/png" && o.encoding === "base64" && PNG_BASE64.test(packed))
    return { ...head, media: "image/png", encoding: "base64", data: packed, bytes: sized(o.bytes, packed, "base64") };
  if (o.media !== "image/svg+xml" || packed.length > SVG_MOST) return null;
  if (o.encoding === "utf8" && /<svg[\s>]/iu.test(packed)) return { ...head, media: "image/svg+xml", encoding: "utf8", data: packed, bytes: sized(o.bytes, packed, "utf8") };
  if (o.encoding === "base64" && BASE64.test(packed)) return { ...head, media: "image/svg+xml", encoding: "base64", data: packed, bytes: sized(o.bytes, packed, "base64") };
  return null;
}

function asFile(v: unknown): FileItem | null {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  if (!bare(o.name) || !FILE_MEDIA.includes(o.media as FileMedia) || o.encoding !== "utf8" || !isStr(o.data) || o.data.length > FILE_MOST) return null;
  return {
    call: isStr(o.call) ? o.call : null,
    name: o.name,
    media: o.media as FileMedia,
    encoding: "utf8",
    data: o.data,
    bytes: sized(o.bytes, o.data, "utf8"),
    rows: isNum(o.rows) && Number.isInteger(o.rows) && o.rows >= 0 ? o.rows : null,
  };
}

/** A turn's whole list as one write carries it: what is malformed dropped, eight kept at most. */
function listOf<T>(items: unknown, one: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(items)) return null;
  return items
    .flatMap((x) => {
      const item = one(x);
      return item ? [item] : [];
    })
    .slice(0, OUTPUTS_KEPT);
}

/** The guard of the one chat's parts: one of the seven shapes, or null. */
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
    case "replaced":
      return { kind: "replaced" };
    case "chart": {
      const items = listOf(o.items, asChart);
      return items ? { kind: "chart", items } : null;
    }
    case "file": {
      const items = listOf(o.items, asFile);
      return items ? { kind: "file", items } : null;
    }
    default:
      return null;
  }
}

/** The one approval card, whatever asked for it: a query version, a job plan, sorting words, an identity merge or an identity rule. */
export interface ApprovalCard {
  /** Unique among the cards a turn shows. */
  key: string;
  change: ChangeKind;
  /** What kind of change it is, over the card in small capitals: Plan, Sorting words, Identities. */
  kind: string;
  /** Its line: the agent's title, else what it will do. */
  title: string;
  /** What it will do, under a title the agent gave; empty when the title says it. */
  sentence: string;
  lines: string[];
  /** The lines are steps in order (a plan), numbered. */
  numbered: boolean;
  state: "open" | "approved" | "declined" | "stale";
  /** Why it cannot be decided here, when it is decided elsewhere. */
  elsewhere?: string;
  approve: string;
  decline: string;
  /** What the card says once approved: approved, kept, recorded. */
  done: string;
  /** Where the person goes on once it is approved, when approving only records it (an identity rule is changed on its dataset's page). */
  next?: { href: string; words: string };
}

/** What each kind of change is called on its card when the agent gave no title. */
export const CHANGE_TITLES: Record<ChangeKind, string> = {
  query_version: "A new version of the query",
  job_plan: "A plan to run",
  sorting_words: "New sorting words",
  identity_merge: "Two identities as one person",
  identity_rule: "A new identity rule",
};

/** The kind of change in a word or two, over its card. */
export const CHANGE_KINDS: Record<ChangeKind, string> = {
  query_version: "Query",
  job_plan: "Plan",
  sorting_words: "Sorting words",
  identity_merge: "Identities",
  identity_rule: "Identity rule",
};

/** A card's line and what it will do: the title the agent gave over its sentence, or the sentence alone, or the kind's own title when it said nothing. */
function said(title: string | null, sentence: string, change: ChangeKind): { title: string; sentence: string } {
  const s = sentence.trim();
  const t = title?.trim() ?? "";
  if (t) return { title: t, sentence: s === t ? "" : s };
  return s ? { title: s, sentence: "" } : { title: CHANGE_TITLES[change], sentence: "" };
}

/** A query version (today's move_proposal) on the approval card; decided here only where the page passes a decider, else where `elsewhere` says. */
export function cardOfProposal(p: Proposal, elsewhere?: string): ApprovalCard {
  return {
    key: `q${p.document}`,
    change: "query_version",
    kind: CHANGE_KINDS.query_version,
    ...said(null, p.sentence, "query_version"),
    lines: p.stale ? ["The query moved on since; this version can no longer be kept."] : [],
    numbered: false,
    state: p.stale ? "stale" : p.decided === "accepted" ? "approved" : p.decided === "rejected" ? "declined" : "open",
    ...(elsewhere ? { elsewhere } : {}),
    approve: "Keep",
    decline: "Not now",
    done: "kept",
  };
}

/** A change the one agent proposed, on the approval card. */
export function cardOfChange(c: Change): ApprovalCard {
  return {
    key: `c${c.id}`,
    change: c.change,
    kind: CHANGE_KINDS[c.change],
    ...said(c.title, c.sentence, c.change),
    lines: c.lines,
    numbered: c.change === "job_plan",
    state: c.decided ?? "open",
    approve: "Approve",
    decline: "Not now",
    done: c.change === "identity_rule" ? "recorded" : "approved",
    ...(c.change === "identity_rule" ? { next: ruleNext(c.lines) } : {}),
  };
}

/** An identity rule is recorded on approval and changed on its dataset's page; the card's first line names the dataset. */
function ruleNext(lines: string[]): { href: string; words: string } {
  const name = lines.map((l) => /^dataset (.+?): /.exec(l)?.[1]).find((n) => n !== undefined);
  return name
    ? { href: href("data", "datasets", name), words: `Change it on ${name}'s page, then digest it again` }
    : { href: href("data", "datasets"), words: "Change it on the dataset's page, then digest it again" };
}

/** A job plan from the inbox (today's Confirm card) on the approval card: its steps in order; approving confirms it. */
export function cardOfPlan(p: Plan): ApprovalCard {
  const open = !p.confirmed_at;
  return {
    key: `p${p.id}`,
    change: "job_plan",
    kind: CHANGE_KINDS.job_plan,
    ...said(null, p.instruction, "job_plan"),
    lines: p.steps.map((s) => (open ? s.words : `${s.words}: ${s.state}${s.reason ? `, ${s.reason}` : ""}`)),
    numbered: true,
    state: open ? "open" : "approved",
    approve: "Approve",
    decline: "Not now",
    done: "approved",
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
