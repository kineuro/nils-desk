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
//     analysis_table    "Putting the rows in the workspace"
//     bash              "Analysing the rows"
//     read              "Reading a result"
//     write             "Writing a file"
//     activate_skill    the skill's plain name (SKILL_WORDS in steps.ts)
//   bash, read and write are Flue's own tools, at work in the analysis
//   workspace, where analysis_table puts the rows they work on.
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
//    parent?: number | null, plan?: string, proposal?: number, pack?: string}}
//       One pending change from `propose_change`. The model never applies it.
//       query_version (with ref.document) is decided as a move_proposal is
//       today: POST /assistant/conversations/<id>/feedback. Every other kind:
//       POST /assistant/changes/<id>/decide {"verdict": "approved" | "declined"},
//       and the assistant applies it in application code. The assistant's
//       analysis_plan arrives as job_plan and its overlay as sorting_words; an
//       identity_rule is only recorded on approval, and the card then points to
//       the dataset's page, where the rule is changed. rule_change (record 56,
//       added 2026-10-14) carries ref.proposal, a proposed rule change the
//       agent made through POST /api/packs/{name}/proposals (ref.pack names
//       the pack, the engine's first when absent): the card is the Rules
//       page's own, read from the engine's proposal, and only a person decides
//       it there, through the engine's decide door, never through the
//       assistant's; a rule_change without ref.proposal is not shown.
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
// WHERE A CHANGE STANDS (2026-11-13)
//   A card is drawn from what the assistant keeps, never from what this page
//   remembers. The desk reads each change of a conversation when it opens:
//     GET /assistant/changes/<id>
//       {state: "open" | "approved" | "declined" | "failed" | "expired",
//        decided?: "approved" | "declined" | null, outcome?: string | null}
//   and the decide door answers the same view (on a refusal, beside `error`,
//   as `change`). Only an open change waits for the person. `outcome` is one
//   sentence of what happened; an assistant before 1.0.0-alpha.34 sends none.
//   A view with neither `state` nor `decided` says nothing, and the card
//   then stands as the page left it.
//   A job_plan's approval names its plan (`ref.plan`), and each plan of
//   GET /assistant/inbox may carry `change: {id, state, outcome} | null`, the
//   change whose card proposed it. The two are one proposal and one card: the
//   approval card, which once approved lists the plan's steps as the inbox
//   says them (waiting with the reason, queued, running, done with the job's
//   number, failed with the reason). A plan no approval card names keeps a
//   card of its own. The plan's confirm door answers the plan and, where the
//   assistant settles them together, `change`.
//
// No part names an agent, a station or a phase; the desk shows none.

import type { Capabilities } from "../capabilities";
import { LIST_WORDS } from "../ask/held";
import type { Plan, Step } from "./client";
import { href } from "../routes";
import { plainReason } from "./ladder";
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

export type ChangeKind = "query_version" | "job_plan" | "sorting_words" | "identity_merge" | "identity_rule" | "rule_change";

/** Where a change stands, as the assistant keeps it. Only an open one waits for the person. */
export type ChangeState = "open" | "approved" | "declined" | "failed" | "expired";

/** What the assistant says of a change: where it stands, and what happened in one sentence where it says so. */
export interface ChangeSeen {
  state: ChangeState;
  outcome: string | null;
}

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
      ref: { document?: number; parent?: number | null; plan?: string; proposal?: number; pack?: string };
    }
  | { kind: "clarification"; question: string; options: { label: string; count: number | null }[] }
  | { kind: "replaced" }
  | { kind: "chart"; items: ChartItem[] }
  | { kind: "file"; items: FileItem[] };

const STATUSES: PlanStatus[] = ["pending", "running", "done", "failed", "skipped"];
const CHANGES: ChangeKind[] = ["query_version", "job_plan", "sorting_words", "identity_merge", "identity_rule", "rule_change"];
const CHANGE_STATES: ChangeState[] = ["open", "approved", "declined", "failed", "expired"];
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
      const ref: { document?: number; parent?: number | null; plan?: string; proposal?: number; pack?: string } = {};
      if (isNum(r.document)) ref.document = r.document;
      if (r.parent === null || isNum(r.parent)) ref.parent = r.parent as number | null;
      if (isStr(r.plan)) ref.plan = r.plan;
      if (isNum(r.proposal)) ref.proposal = r.proposal;
      if (isStr(r.pack) && r.pack !== "") ref.pack = r.pack;
      if (o.change === "query_version" && ref.document === undefined) return null;
      // a rule change is the engine's proposal, decided on its own card; without one there is nothing to decide
      if (o.change === "rule_change" && ref.proposal === undefined) return null;
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

/**
 * A change as the assistant answers it, at its own door, from the decide door or on a plan of the inbox: its
 * `state`, else the person's verdict (`decided`), and its `outcome`. Null where it says neither, as an assistant
 * that keeps no state does: the card then stands as the page left it.
 */
export function asChangeSeen(v: unknown): ChangeSeen | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const state = CHANGE_STATES.includes(o.state as ChangeState) ? (o.state as ChangeState) : o.decided === "approved" || o.decided === "declined" ? o.decided : null;
  if (state === null) return null;
  return { state, outcome: isStr(o.outcome) && o.outcome.trim() ? o.outcome.trim() : null };
}

/** One step of an approved plan on its card: what it does, where it stands, its job, and why it waits or failed. */
export interface CardStep {
  n: number;
  words: string;
  /** Where it stands, in a word: waiting, queued, running, done, failed; asks you for a step only a person takes. */
  state: string;
  job: number | null;
  /** The job's log, where the person reads logs. */
  href: string | null;
  /** Why it waits or failed, in the assistant's own words. */
  reason: string | null;
}

/** What a stored question's job made, as the engine's job row says it: the kept result and its rows. */
export interface Ran {
  /** The stored question it ran, where the job's line names it. */
  document: number | null;
  handle: number | null;
  /** The rows of the answer; null where the list is held back or the job did not say. */
  rows: number | null;
  grain: string | null;
  /** The list is held back whole (a small list at plain): no length, no file. */
  held: boolean;
}

/** The plan a change's card stands for, and what the page knows beside it. */
export interface PlanSeen {
  plan: Plan;
  /** What each finished question's job made, by job, where the engine was asked. */
  ran?: Record<number, Ran>;
  /** Where the card may lead: a job's log, the kept results. */
  links?: { logs?: boolean; exports?: boolean };
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
  state: "open" | "approved" | "declined" | "stale" | "failed" | "expired";
  /** Why it cannot be decided here, when it is decided elsewhere. */
  elsewhere?: string;
  approve: string;
  decline: string;
  /** What the card says once approved: approved, kept, recorded, done; and how it failed: not applied, failed. */
  done: string;
  /** An approved plan's steps, each with where it stands now; drawn in place of the lines. */
  steps?: CardStep[];
  /** What happened, where the card's one word does not say it: why an approval was not applied, why nothing is left to approve. */
  note?: { words: string; warn: boolean };
  /** What an approved plan made, in a sentence: a finished question's rows and the result that keeps them. */
  made?: string;
  /** Where the person goes on once it is approved: an identity rule is changed on its dataset's page, a finished question's rows are saved from Exports. */
  next?: { href: string; words: string };
}

/** What each kind of change is called on its card when the agent gave no title. */
export const CHANGE_TITLES: Record<ChangeKind, string> = {
  query_version: "A new version of the query",
  job_plan: "A plan to run",
  sorting_words: "New sorting words",
  identity_merge: "Two identities as one person",
  identity_rule: "A new identity rule",
  rule_change: "A change to the rules",
};

/** The kind of change in a word or two, over its card. */
export const CHANGE_KINDS: Record<ChangeKind, string> = {
  query_version: "Query",
  job_plan: "Plan",
  sorting_words: "Sorting words",
  identity_merge: "Identities",
  identity_rule: "Identity rule",
  rule_change: "Rule change",
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

/** A server's sentence as the card says it: a capital first, a full stop last. */
function sentenceOf(words: string): string {
  const w = words.trim();
  if (w === "") return "";
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}${/[.!?]$/u.test(w) ? "" : "."}`;
}

/** The change a plan of the inbox says proposed it, where the assistant says so (its 1.0.0-alpha.34). */
function changeOfPlan(p: Plan): { id: string; seen: ChangeSeen | null } | null {
  const c = p.change;
  return c && typeof c === "object" && isStr(c.id) ? { id: c.id, seen: asChangeSeen(c) } : null;
}

/**
 * The plan a change's card stands for, among the conversation's plans: the one its approval names (`ref.plan`),
 * or the one that names the change. One proposal is then one card.
 */
export function planOfChange(c: Pick<Change, "id" | "plan">, plans: Plan[]): Plan | null {
  return plans.find((p) => (c.plan !== undefined && p.id === c.plan) || changeOfPlan(p)?.id === c.id) ?? null;
}

/** Whether a plan was confirmed, on either card. */
const confirmed = (p: Plan): boolean => Boolean(p.confirmed_at) || p.state === "confirmed" || p.state === "done";

/**
 * Where a change stands and what happened. A job plan whose plan is confirmed is approved, on whichever card the
 * person said so (an assistant before 1.0.0-alpha.34 leaves the change open, or declined, beside a plan confirmed
 * on the Plans page). Else the assistant's word, read at the change's own door or on its plan in the inbox, and a
 * word that it is settled is never taken back by an older "open". Where the assistant says nothing (it keeps no
 * state), the card stands as the page left it.
 */
export function changeSeen(c: Change, plan?: Plan | null): ChangeSeen {
  const onPlan = plan ? changeOfPlan(plan) : null;
  const onIt = onPlan?.id === c.id ? onPlan.seen : null;
  const told = [c.state, onIt?.state].filter((s): s is ChangeState => s !== undefined);
  const outcome = c.outcome ?? onIt?.outcome ?? null;
  if (c.change === "job_plan" && plan && confirmed(plan)) return { state: "approved", outcome };
  const settled = told.find((s) => s !== "open");
  if (settled) return { state: settled, outcome };
  if (told.length > 0) return { state: "open", outcome: null };
  return { state: c.decided ?? "open", outcome: null };
}

/** Why a step waits or failed, in the assistant's own words: "waiting" is not said twice. */
function reasonOf(s: Pick<Step, "reason">): string | null {
  const r = plainReason(s.reason ?? "").replace(/^waiting:\s*/u, "").trim();
  return r === "" ? null : r;
}

/** A plan's step as its card lists it once the plan is approved. */
export function cardStep(s: Step, logs = false): CardStep {
  const job = typeof s.job === "number" && Number.isFinite(s.job) ? s.job : null;
  const state = s.rung === 3 ? (s.decided === "accepted" ? "accepted" : s.decided === "rejected" ? "declined" : "asks you") : s.state;
  return { n: s.n, words: s.words, state, job, href: job !== null && logs ? href("pipelines", "logs", String(job)) : null, reason: state === "waiting" || state === "failed" ? reasonOf(s) : null };
}

/** What a finished question's job made, in a sentence, and whether its rows can be saved. */
function ranWords(r: Ran): { said: string; file: boolean } {
  const q = r.document !== null ? `Question ${r.document}` : "The question";
  if (r.held) return { said: `${q} ran. ${LIST_WORDS}`, file: false };
  if (r.rows === null) return { said: r.handle !== null ? `${q} ran, kept as Result ${r.handle}.` : `${q} ran.`, file: r.handle !== null };
  const rows = `${r.rows.toLocaleString("en-US")} ${r.grain ? `${r.grain} ` : ""}${r.rows === 1 ? "row" : "rows"}`;
  return { said: r.handle !== null ? `${q} ran: ${rows}, kept as Result ${r.handle}.` : `${q} ran: ${rows}.`, file: r.handle !== null && r.rows > 0 };
}

/** The steps of an approved plan that ran a stored question to its end as a job. */
export function ranSteps(p: Plan): (Step & { job: number })[] {
  return p.steps.filter((s): s is Step & { job: number } => s.rung === 2 && s.verb === "run" && s.state === "done" && typeof s.job === "number");
}

/**
 * A change the one agent proposed, on the approval card. A job plan's change is given its plan where the
 * conversation has it (2026-11-13): once approved, the one card lists the plan's steps as they stand, says what a
 * finished question made and leads to it, where a second card for the plan stood before.
 */
export function cardOfChange(c: Change, seen?: PlanSeen | null): ApprovalCard {
  const plan = seen?.plan ?? null;
  const { state, outcome } = changeSeen(c, plan);
  const card: ApprovalCard = {
    key: `c${c.id}`,
    change: c.change,
    kind: CHANGE_KINDS[c.change],
    ...said(c.title, c.sentence, c.change),
    lines: c.lines,
    numbered: c.change === "job_plan",
    state,
    approve: "Approve",
    decline: "Not now",
    done: state === "failed" ? "not applied" : c.change === "identity_rule" ? "recorded" : "approved",
    ...(c.change === "identity_rule" ? { next: ruleNext(c.lines) } : {}),
  };
  // approved by the person and not applied, or nothing left to approve: the assistant's sentence says which
  if (state === "failed") return { ...card, next: undefined, note: { words: sentenceOf(outcome ?? "approved, and not applied"), warn: true } };
  if (state === "expired") return { ...card, next: undefined, note: { words: sentenceOf(outcome ?? "the plan is no longer kept, so there is nothing left to approve"), warn: false } };
  if (state !== "approved" || !plan || !confirmed(plan) || plan.steps.length === 0) return card;
  // the approved plan, where a card of its own stood: its steps as they stand now
  const steps = plan.steps.map((s) => cardStep(s, seen?.links?.logs === true));
  const taken = plan.steps.filter((s) => s.rung === 2);
  const failed = taken.some((s) => s.state === "failed");
  const over = taken.length > 0 && taken.every((s) => s.state === "done");
  const made = ranSteps(plan).flatMap((s) => {
    const r = seen?.ran?.[s.job];
    return r ? [ranWords(r)] : [];
  });
  return {
    ...card,
    steps,
    state: failed ? "failed" : "approved",
    done: failed ? "failed" : over ? "done" : "approved",
    ...(made.length > 0 ? { made: made.map((m) => m.said).join(" ") } : {}),
    ...(made.some((m) => m.file) && seen?.links?.exports ? { next: { href: href("query", "exports"), words: "Download it on Exports" } } : {}),
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
