// SPDX-License-Identifier: AGPL-3.0-only
// A person's conversations, kept by the assistant (the chat, slice 2): listed
// under the Assistant in the side and on the page of all conversations,
// renamed, pinned, archived and deleted there, and read again whenever
// something changes them. The browser keeps none of them. The list an older
// desk kept in this browser is offered to the assistant once, which keeps the
// conversations that were the person's.

import { keeper } from "../ui/kept";
import { type Conversation, conversations as keptHere } from "./client";

const H = { "content-type": "application/json", "X-Nils-Desk": "1" };

/** The stations a person talks to, by what they do. */
export const STATION_WORDS: Record<string, string> = {
  concierge: "Asks about the registry",
  "ask-help": "Builds queries",
  operator: "Plans work",
};

/** A conversation as the assistant lists it. */
export interface Chat {
  id: string;
  station: string;
  title: string | null;
  title_by: "model" | "person" | null;
  lineage: number | null;
  document: number | null;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  archived: boolean;
  forked_from: string | null;
}

/** A proposal as the assistant keeps it, with the person's decision. */
export interface StoredProposal {
  document: number;
  parent: number | null;
  sentence: string;
  at: string;
  decided: "accepted" | "rejected" | null;
  why: string | null;
  decided_at: string | null;
  stale: boolean;
}

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function answer<T>(r: Response): Promise<T> {
  const text = await r.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!r.ok) {
    const e = body as { error?: unknown } | null;
    throw new ChatError(r.status, typeof e?.error === "string" ? e.error : `the assistant answered ${r.status}`);
  }
  return body as T;
}

const one = (id: string) => `/assistant/conversations/${encodeURIComponent(id)}`;

export const chats = {
  /** The person's own conversations, pinned first, then the latest used; the archived when asked. */
  list: (o: { q?: string; archived?: boolean; before?: string | null; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (o.q) p.set("q", o.q);
    if (o.archived) p.set("archived", "1");
    if (o.before) p.set("before", o.before);
    if (o.limit) p.set("limit", String(o.limit));
    const qs = p.toString();
    return fetch(`/assistant/conversations${qs ? `?${qs}` : ""}`).then((r) => answer<{ conversations: Chat[]; next: string | null }>(r));
  },
  /** A new conversation, named by the assistant and the person's. */
  create: (o: { station: string; title?: string | null; document?: number | null; lineage?: number | null }) =>
    fetch("/assistant/conversations", { method: "POST", headers: H, body: JSON.stringify(o) }).then((r) => answer<Chat>(r)),
  /** One conversation, with its proposals and the decisions on them. */
  get: (id: string) => fetch(one(id)).then((r) => answer<Chat & { proposals: StoredProposal[] }>(r)),
  patch: (id: string, p: { title?: string | null; pinned?: boolean; archived?: boolean }) =>
    fetch(one(id), { method: "PATCH", headers: H, body: JSON.stringify(p) }).then((r) => answer<Chat>(r)),
  remove: (id: string) => fetch(one(id), { method: "DELETE", headers: H }).then((r) => answer<{ deleted: string }>(r)),
};

/** The person's latest conversations, as the side and the pages read them. */
export const chatsKept = keeper(() => chats.list({ limit: 50 }));

/** A conversation's name, or plain words while it has none. */
export function chatTitle(c: { title: string | null }): string {
  return c.title?.trim() || "A conversation";
}

export interface ChatGroup {
  label: string;
  chats: Chat[];
}

/** The groups a person scans: the pinned, then today, yesterday, this week and earlier, by the browser's own days. */
export function groupsOf(rows: Chat[], now: Date = new Date()): ChatGroup[] {
  const [y, m, d] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const today = new Date(y, m, d).getTime();
  const yesterday = new Date(y, m, d - 1).getTime();
  const week = new Date(y, m, d - 6).getTime();
  const labels = ["Pinned", "Today", "Yesterday", "This week", "Earlier"];
  const by = new Map<string, Chat[]>();
  for (const c of rows) {
    const at = new Date(c.updated_at).getTime();
    const label = c.pinned ? "Pinned" : at >= today ? "Today" : at >= yesterday ? "Yesterday" : at >= week ? "This week" : "Earlier";
    by.set(label, [...(by.get(label) ?? []), c]);
  }
  return labels.filter((l) => by.has(l)).map((label) => ({ label, chats: by.get(label) ?? [] }));
}

/** The side's conversations under the Assistant: the pinned, then the latest. */
export function sidePages(rows: Chat[], recent = 8): { id: string; title: string; depth: 1 }[] {
  const pinned = rows.filter((c) => c.pinned);
  const latest = rows.filter((c) => !c.pinned && !c.archived).slice(0, recent);
  return [...pinned, ...latest].map((c) => ({ id: c.id, title: chatTitle(c), depth: 1 as const }));
}

const IMPORTED = "nils-desk.assistant.imported";

/** The conversations an older desk kept in this browser that have not been offered to the assistant yet. */
export function toImport(local: Conversation[], done: string[]): Conversation[] {
  return local.filter((c) => !done.includes(c.id));
}

/**
 * Offer this browser's older list to the assistant, once per conversation: one
 * the assistant says is the person's keeps the name it had here; one it does
 * not know is forgotten. A conversation the assistant could not be asked about
 * is offered again next time.
 */
export async function importHere(
  o: {
    local?: () => Conversation[];
    storage?: Pick<Storage, "getItem" | "setItem">;
    get?: (id: string) => Promise<Chat & { proposals: StoredProposal[] }>;
    patch?: (id: string, p: { title?: string | null }) => Promise<Chat>;
  } = {},
): Promise<number> {
  let storage = o.storage ?? null;
  if (!storage) {
    try {
      storage = localStorage;
    } catch {
      return 0;
    }
  }
  let done: string[] = [];
  try {
    const raw = storage.getItem(IMPORTED);
    done = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    done = [];
  }
  const get = o.get ?? chats.get;
  const patch = o.patch ?? chats.patch;
  let claimed = 0;
  for (const c of toImport((o.local ?? keptHere)(), done)) {
    try {
      const row = await get(c.id);
      claimed += 1;
      if (!row.title && c.title) await patch(c.id, { title: c.title });
    } catch (e) {
      // the assistant did not answer: ask again next time
      if (!(e instanceof ChatError)) continue;
    }
    done.push(c.id);
  }
  try {
    storage.setItem(IMPORTED, JSON.stringify(done));
  } catch {
    // a private window keeps nothing
  }
  return claimed;
}
