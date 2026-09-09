// SPDX-License-Identifier: AGPL-3.0-only
// The assistant through the desk's proxy (Wave 4c section 7.7): a prompt is
// admitted, the conversation stream is read by long poll from an offset,
// proposals go back as feedback, and the desk pushes the person's token
// itself, since a browser never holds one.

import type { Chunk, History } from "./parts";

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
  /** Admit one prompt; the answer is the offset the stream continues from. */
  async send(station: string, id: string, message: string): Promise<{ offset: string; submission: string }> {
    const r = await fetch(`/assistant/agents/${station}/${encodeURIComponent(id)}`, { method: "POST", headers: H, body: JSON.stringify({ kind: "user", body: message }) });
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
  feedback: (id: string, accepted: { document: number; sentence: string }[], rejected: { document: number; sentence: string }[]) =>
    fetch(`/assistant/conversations/${encodeURIComponent(id)}/feedback`, { method: "POST", headers: H, body: JSON.stringify({ accepted, rejected }) }).then((r) => (r.ok ? undefined : fail(r))),
  /** The desk mints or refreshes the person's token and hands it to the assistant for this conversation. */
  token: (id: string) => fetch(`/desk/assistant/conversations/${encodeURIComponent(id)}/token`, { method: "POST", headers: H }).then((r) => (r.ok ? undefined : fail(r))),
};

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
