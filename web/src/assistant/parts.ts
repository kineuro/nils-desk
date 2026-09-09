// SPDX-License-Identifier: AGPL-3.0-only
// The desk seam (Wave 4c sections 7.7 and 9.8): the closed union of typed
// parts the assistant emits, and the one reducer that decides what each may
// touch. A part of any other shape is dropped here and nowhere else. The
// assistant never calls a desk function and never navigates the desk.

export type Part =
  | { kind: "move_proposal"; document: number; parent: number | null; sentence: string }
  | { kind: "choice"; question: string; options: { label: string; count: number | null }[] }
  | { kind: "note"; text: string }
  | { kind: "todo"; text: string }
  | { kind: "lookup"; level: string; field: string; values: string[] }
  | { kind: "handle_ref"; handle: number }
  | { kind: "funnel"; rows: { set: string; stage: string; rows: number; subjects: number }[] }
  | { kind: "status"; phase: string; text: string };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** The guard of the closed union: a value of exactly one of the eight shapes, or null. */
export function asPart(v: unknown): Part | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.kind) {
    case "move_proposal":
      return isNum(o.document) && (o.parent === null || isNum(o.parent)) && isStr(o.sentence)
        ? { kind: "move_proposal", document: o.document, parent: o.parent as number | null, sentence: o.sentence }
        : null;
    case "choice": {
      if (!isStr(o.question) || !Array.isArray(o.options)) return null;
      const options = o.options.flatMap((x) => {
        const c = x as Record<string, unknown>;
        return isStr(c?.label) ? [{ label: c.label, count: isNum(c.count) ? c.count : null }] : [];
      });
      return { kind: "choice", question: o.question, options };
    }
    case "note":
    case "todo":
      return isStr(o.text) ? { kind: o.kind, text: o.text } : null;
    case "lookup":
      return isStr(o.level) && isStr(o.field) && Array.isArray(o.values)
        ? { kind: "lookup", level: o.level, field: o.field, values: o.values.filter(isStr) }
        : null;
    case "handle_ref":
      return isNum(o.handle) ? { kind: "handle_ref", handle: o.handle } : null;
    case "funnel":
      return Array.isArray(o.rows)
        ? {
            kind: "funnel",
            rows: o.rows.flatMap((x) => {
              const r = x as Record<string, unknown>;
              return isStr(r?.set) && isStr(r.stage) && isNum(r.rows) && isNum(r.subjects) ? [{ set: r.set, stage: r.stage, rows: r.rows, subjects: r.subjects }] : [];
            }),
          }
        : null;
    case "status":
      return isStr(o.phase) && isStr(o.text) ? { kind: "status", phase: o.phase, text: o.text } : null;
    default:
      return null;
  }
}

export interface Tool {
  id: string;
  name: string;
  state: "running" | "done" | "failed";
}

export interface Turn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  done: boolean;
  tools: Tool[];
}

export interface Proposal {
  document: number;
  parent: number | null;
  sentence: string;
  /** The assistant turn that made it. */
  turn: string;
  decided: null | "accepted" | "rejected";
}

export interface PaneState {
  turns: Turn[];
  /** The stream offset the next read starts from. */
  offset: string;
  /** A submission is in flight: the assistant has started and not settled. */
  busy: boolean;
  proposals: Proposal[];
  choice: { question: string; options: { label: string; count: number | null }[]; turn: string } | null;
  status: { phase: string; text: string } | null;
  handles: number[];
  aside: Extract<Part, { kind: "note" | "todo" | "lookup" | "funnel" }>[];
  settled: null | { outcome: string; error?: string };
}

export const empty = (offset = "-1"): PaneState => ({
  turns: [],
  offset,
  busy: false,
  proposals: [],
  choice: null,
  status: null,
  handles: [],
  aside: [],
  settled: null,
});

/** One chunk of the conversation stream, as the assistant's runtime encodes it. */
export interface Chunk {
  type: string;
  [key: string]: unknown;
}

function turn(state: PaneState, id: string): Turn | undefined {
  return state.turns.find((t) => t.id === id);
}

function withTurn(state: PaneState, id: string, f: (t: Turn) => Turn): PaneState {
  return { ...state, turns: state.turns.map((t) => (t.id === id ? f(t) : t)) };
}

/** What one part may touch: a proposal, the choice, the status line, a handle, or the aside. */
export function acceptPart(state: PaneState, turnId: string, raw: unknown): PaneState {
  const p = asPart(raw);
  if (!p) return state;
  switch (p.kind) {
    case "move_proposal":
      if (state.proposals.some((x) => x.document === p.document)) return state;
      return { ...state, proposals: [...state.proposals, { document: p.document, parent: p.parent, sentence: p.sentence, turn: turnId, decided: null }] };
    case "choice":
      return { ...state, choice: { question: p.question, options: p.options, turn: turnId } };
    case "status":
      return { ...state, status: { phase: p.phase, text: p.text } };
    case "handle_ref":
      return state.handles.includes(p.handle) ? state : { ...state, handles: [...state.handles, p.handle] };
    default:
      return { ...state, aside: [...state.aside, p] };
  }
}

/** The reducer over the live stream. Unknown chunk types are dropped. */
export function reduce(state: PaneState, c: Chunk): PaneState {
  switch (c.type) {
    case "conversation-reset":
      return fromHistory(c.snapshot as History, state);
    case "message-appended": {
      const m = c.message as { id: string; role: string; display?: string; parts?: { type: string; text?: string }[] };
      if (m.display && m.display !== "visible") return state;
      if (m.role !== "user" && m.role !== "system") return state;
      if (turn(state, m.id)) return state;
      const text = (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
      return { ...state, turns: [...state.turns, { id: m.id, role: m.role, text, done: true, tools: [] }] };
    }
    case "message-started": {
      const id = c.messageId as string;
      // a later step of the same response starts the same message again; only a new turn clears the old choice
      if (turn(state, id)) return { ...state, busy: true };
      return { ...state, busy: true, settled: null, choice: null, turns: [...state.turns, { id, role: "assistant", text: "", done: false, tools: [] }] };
    }
    case "message-delta":
      if (c.kind !== "text") return state;
      return withTurn(state, c.messageId as string, (t) => ({ ...t, text: t.text + String(c.delta ?? "") }));
    case "tool-input":
      return withTurn(state, c.messageId as string, (t) => ({
        ...t,
        tools: [...t.tools.filter((x) => x.id !== c.toolCallId), { id: String(c.toolCallId), name: String(c.toolName), state: "running" }],
      }));
    case "tool-output":
    case "tool-output-error": {
      const done = c.type === "tool-output" ? "done" : "failed";
      return { ...state, turns: state.turns.map((t) => ({ ...t, tools: t.tools.map((x) => (x.id === c.toolCallId ? { ...x, state: done } : x)) })) };
    }
    case "data-part":
      return acceptPart(state, String(c.messageId), c.data);
    case "message-completed":
      return withTurn(state, c.messageId as string, (t) => ({ ...t, done: true }));
    case "submission-settled":
      return { ...state, busy: false, settled: { outcome: String(c.outcome), ...(c.error ? { error: String(c.error) } : {}) } };
    default:
      return state;
  }
}

export interface History {
  offset?: string;
  messages: {
    id: string;
    role: string;
    display?: string;
    parts: { type: string; text?: string; data?: unknown; toolCallId?: string; toolName?: string; state?: string }[];
  }[];
  settlements?: { submissionId: string; outcome: string; error?: string }[];
}

/** The pane from a history snapshot: what the live reducer would have built, minus what the store keeps only once per kind. */
export function fromHistory(h: History, previous: PaneState = empty()): PaneState {
  let state: PaneState = { ...empty(h.offset ?? previous.offset), proposals: previous.proposals.filter((p) => p.decided !== null) };
  for (const m of h.messages) {
    if (m.display && m.display !== "visible") continue;
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") continue;
    const t: Turn = { id: m.id, role: m.role, text: "", done: true, tools: [] };
    for (const p of m.parts) {
      if (p.type === "text") t.text += p.text ?? "";
      else if (p.type === "dynamic-tool" && p.toolCallId)
        t.tools.push({ id: p.toolCallId, name: p.toolName ?? "", state: p.state === "output-error" ? "failed" : p.state === "output-available" ? "done" : "running" });
    }
    state = { ...state, turns: [...state.turns, t] };
    for (const p of m.parts) if (p.type.startsWith("data-")) state = acceptPart(state, m.id, p.data);
  }
  // decided proposals stay decided across a reload
  state.proposals = state.proposals.map((p) => {
    const before = previous.proposals.find((x) => x.document === p.document);
    return before ? { ...p, decided: before.decided } : p;
  });
  const last = h.settlements?.[h.settlements.length - 1];
  const open = state.turns.some((t) => t.role === "assistant" && !t.done);
  return { ...state, busy: open, settled: last ? { outcome: last.outcome, ...(last.error ? { error: last.error } : {}) } : null };
}
