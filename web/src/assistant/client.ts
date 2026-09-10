// SPDX-License-Identifier: AGPL-3.0-only
// The assistant through the desk's proxy (Wave 4c section 7.7): a prompt is
// admitted, the conversation stream is read by long poll from an offset,
// proposals go back as feedback, and the desk pushes the person's token
// itself, since a browser never holds one.

import type { Chunk, History } from "./parts";
import type { PageContext } from "../ui/context";

const H = { "content-type": "application/json", "X-Nils-Desk": "1" };

async function fail(r: Response): Promise<never> {
  const text = await r.text();
  let why = `the assistant answered ${r.status}`;
  try {
    const j = JSON.parse(text) as { error?: unknown };
    if (typeof j.error === "string") why = j.error;
    else if (j.error && typeof j.error === "object" && typeof (j.error as { message?: unknown }).message === "string") why = (j.error as { message: string }).message;
  } catch {
    // not JSON: the status is the message
  }
  throw new Error(why);
}

export const assistant = {
  /** Admit one prompt with the page's typed context, the lineage and the document (Wave 5 section 9.2, 7.4); the answer is the offset the stream continues from. */
  async send(station: string, id: string, message: string, beside: { context?: PageContext; lineage?: number | null; document?: number | null } = {}): Promise<{ offset: string; submission: string }> {
    const payload: Record<string, unknown> = { kind: "user", body: message };
    if (beside.context) payload.context = beside.context;
    if (typeof beside.lineage === "number") payload.lineage = beside.lineage;
    if (typeof beside.document === "number") payload.document = beside.document;
    const r = await fetch(`/assistant/agents/${station}/${encodeURIComponent(id)}`, { method: "POST", headers: H, body: JSON.stringify(payload) });
    if (!r.ok) await fail(r);
    const body = (await r.json()) as { submissionId?: string; offset?: string };
    return { offset: r.headers.get("Stream-Next-Offset") ?? body.offset ?? "-1", submission: body.submissionId ?? "" };
  },
  /** One long poll from an offset: the chunks since it and the next offset. */
  async updates(station: string, id: string, offset: string, signal?: AbortSignal): Promise<{ chunks: Chunk[]; next: string }> {
    const r = await fetch(`/assistant/agents/${station}/${encodeURIComponent(id)}?view=updates&offset=${encodeURIComponent(offset)}&live=long-poll`, { signal });
    if (r.status === 404) return { chunks: [], next: offset };
    if (!r.ok) await fail(r);
    const chunks = (await r.json()) as Chunk[];
    return { chunks: chunks.filter((c) => c.type !== "stream-checkpoint"), next: r.headers.get("Stream-Next-Offset") ?? offset };
  },
  /** The conversation so far; null when it has not started. */
  async history(station: string, id: string): Promise<History | null> {
    const r = await fetch(`/assistant/agents/${station}/${encodeURIComponent(id)}?view=history`);
    if (r.status === 404) return null;
    if (!r.ok) await fail(r);
    return (await r.json()) as History;
  },
  abort: (station: string, id: string) => fetch(`/assistant/agents/${station}/${encodeURIComponent(id)}/abort`, { method: "POST", headers: H }).then(() => undefined),
  /** A proposal's verdict, with the document the person is on; a stale accept comes back as a StaleProposal, never recorded. */
  feedback: async (id: string, accepted: FeedbackRow[], rejected: FeedbackRow[]): Promise<void> => {
    const r = await fetch(`/assistant/conversations/${encodeURIComponent(id)}/feedback`, { method: "POST", headers: H, body: JSON.stringify({ accepted, rejected }) });
    if (r.status === 409) {
      const j = (await r.json().catch(() => ({}))) as { stale?: boolean; document?: number; base?: number; moved_to?: number; error?: string };
      if (j.stale) throw new StaleProposal(j.document ?? 0, j.base ?? null, j.moved_to ?? null, j.error ?? "the question moved on");
    }
    if (!r.ok) await fail(r);
  },
  /** The conversations of a lineage, newest first, with what was proposed, decided and produced (section 7.4). */
  lineage: async (root: number): Promise<Lineage | null> => {
    const r = await fetch(`/assistant/conversations?lineage=${root}`);
    if (r.status === 404) return null;
    if (!r.ok) await fail(r);
    return (await r.json()) as Lineage;
  },
  /** The delegations of a conversation, from the assistant's store (section 9.12). */
  delegations: async (id: string): Promise<Delegation[]> => {
    const r = await fetch(`/assistant/conversations/${encodeURIComponent(id)}/delegations`);
    if (!r.ok) await fail(r);
    return ((await r.json()) as { tasks?: Delegation[] }).tasks ?? [];
  },
  /** Wave 5 section 9.4: the person's inbox, what the assistant and the engine did for them. */
  inbox: async (): Promise<Inbox> => {
    const r = await fetch("/assistant/inbox");
    if (!r.ok) await fail(r);
    return (await r.json()) as Inbox;
  },
  /** Section 9.3: a plan restated is confirmed once; the scheduler fires what is due. */
  confirmPlan: async (id: string): Promise<Plan> => {
    const r = await fetch(`/assistant/plans/${encodeURIComponent(id)}/confirm`, { method: "POST", headers: H });
    if (!r.ok) await fail(r);
    return (await r.json()) as Plan;
  },
  /** A rung-three proposal decided by the person, after the desk's own closure panel performed or declined the act. */
  decideProposal: async (plan: string, n: number, verdict: "accepted" | "rejected"): Promise<void> => {
    const r = await fetch(`/assistant/plans/${encodeURIComponent(plan)}/proposals/${n}/decide`, { method: "POST", headers: H, body: JSON.stringify({ verdict }) });
    if (!r.ok) await fail(r);
  },
  /** Section 9.1: standing grants, per person and per verb, revocable. */
  grants: async (all = false): Promise<Grants> => {
    const r = await fetch(`/assistant/grants${all ? "?all=1" : ""}`);
    if (!r.ok) await fail(r);
    return (await r.json()) as Grants;
  },
  grant: async (door: string): Promise<Grant> => {
    const r = await fetch("/assistant/grants", { method: "POST", headers: H, body: JSON.stringify({ door }) });
    if (!r.ok) await fail(r);
    return (await r.json()) as Grant;
  },
  revoke: async (id: number): Promise<void> => {
    const r = await fetch(`/assistant/grants/${id}`, { method: "DELETE", headers: H });
    if (!r.ok) await fail(r);
  },
  /** The desk mints or refreshes the person's token and hands it to the assistant for this conversation. */
  token: (id: string) => fetch(`/desk/assistant/conversations/${encodeURIComponent(id)}/token`, { method: "POST", headers: H }).then((r) => (r.ok ? undefined : fail(r))),
};

export interface FeedbackRow {
  document: number;
  sentence: string;
  why?: string;
  /** The document the person is on when deciding; the assistant refuses an accept whose base moved. */
  current?: number;
}

export class StaleProposal extends Error {
  constructor(
    readonly document: number,
    readonly base: number | null,
    readonly movedTo: number | null,
    message: string,
  ) {
    super(message);
  }
}

export interface Lineage {
  lineage: number;
  head: number;
  conversations: {
    id: string;
    station: string;
    document: number | null;
    created_at: string;
    proposals: { document: number; parent: number | null; base_document: number | null; base_hash: string | null; sentence: string; at: string; decided: "accepted" | "rejected" | null; why: string | null; decided_at: string | null; stale: boolean }[];
    handles: { handle: number; operation: string; at: string }[];
  }[];
}

export interface Step {
  n: number;
  rung: 2 | 3;
  verb: string;
  door: string;
  words: string;
  state: string;
  reason?: string | null;
  job?: number | null;
  grant?: number | null;
  queued_at?: string | number | null;
  finished_at?: string | number | null;
  decided?: string | null;
  when?: unknown;
}

export interface Plan {
  id: string;
  conversation?: string;
  instruction: string;
  state: string;
  created_at?: string | number;
  confirmed_at?: string | number | null;
  steps: Step[];
  fired?: unknown[];
}

export interface InboxJob {
  id?: number;
  job?: number;
  kind?: string;
  name?: string | null;
  state?: string;
  started_at?: string;
  finished_at?: string | null;
  object?: { kind: string; id: number | string } | null;
  [k: string]: unknown;
}

export interface Inbox {
  subject: string;
  jobs: { queued: InboxJob[]; running: InboxJob[]; finished: InboxJob[]; failed: InboxJob[] };
  waiting: Step[];
  plans: Plan[];
  proposals: Step[];
  grants: Grant[];
}

export interface Grant {
  id: number;
  subject: string;
  door: string;
  created_at: string;
  revoked_at?: string | null;
}

export interface Grants {
  subject: string;
  grants: Grant[];
  ladder: { door: string; rung: 1 | 2 | 3; role: string }[];
}

export interface Delegation {
  task: string;
  station: string;
  state: "queued" | "running" | "settled" | "failed" | "aborted";
  result: { document: number | null; sentence: string | null } | null;
  error: string | null;
}

/** Conversations carry parent pointers from the start; the desk keeps its own list, in this browser. */
export interface Conversation {
  id: string;
  parent: string | null;
  /** The document it opened on. */
  document: number | null;
  at: string;
}

const KEY = "nils-desk.assistant.conversations";

export function conversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

export function remember(c: Conversation): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([c, ...conversations().filter((x) => x.id !== c.id)].slice(0, 50)));
  } catch {
    // a private window keeps nothing
  }
}

export function newConversation(document: number | null, parent: string | null): Conversation {
  const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const c = { id, parent, document, at: new Date().toISOString() };
  remember(c);
  return c;
}

/** The open conversation of a document: the latest one that opened on it or on a version of it, by the ids the caller knows. */
export function conversationFor(documents: number[]): Conversation | null {
  return conversations().find((c) => c.document !== null && documents.includes(c.document)) ?? null;
}
