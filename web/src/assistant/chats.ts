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

/** How full a conversation's context is, as the assistant last saw it (the chat, slice 3). */
export interface ChatContext {
  tokens: number | null;
  window: number | null;
  compactions: number;
  compacted_at: string | null;
}

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
  /** The message a version was sent instead of (the chat, slice 4); null for a conversation of its own. */
  fork_slot?: string | null;
  /** From an assistant that keeps it; an older one sends none. */
  context?: ChatContext;
}

/** A place in a conversation sent more than one way, and the conversation each way continues in (the chat, slice 4). */
export interface ChatVersions {
  slot: string;
  versions: { conversation: string; message: string }[];
}

/** The person's verdict on one answer. */
export interface Rating {
  message: string;
  verdict: "up" | "down";
  reason: string | null;
  at: string;
}

/** One conversation as the assistant returns it: its proposals and their decisions, its versions and the verdicts on its answers. */
export type ChatDetail = Chat & { proposals: StoredProposal[]; versions?: ChatVersions[]; ratings?: Rating[] };

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
  get: (id: string) => fetch(one(id)).then((r) => answer<ChatDetail>(r)),
  /** Renamed, pinned or archived, every version alike; `current` makes the version named the one the lists show and open. */
  patch: (id: string, p: { title?: string | null; pinned?: boolean; archived?: boolean; current?: boolean }) =>
    fetch(one(id), { method: "PATCH", headers: H, body: JSON.stringify(p) }).then((r) => answer<Chat>(r)),
  remove: (id: string) => fetch(one(id), { method: "DELETE", headers: H }).then((r) => answer<{ deleted: string }>(r)),
  /** A new conversation that reads what this one read before the message named, to send into instead of it; with no message, a copy of the whole conversation. */
  fork: (id: string, before?: string) =>
    fetch(`${one(id)}/fork`, { method: "POST", headers: H, body: JSON.stringify(before ? { before } : {}) }).then((r) =>
      answer<Chat & { fork: { from: string; before: string | null; slot: string | null } }>(r),
    ),
  /** The person's verdict on one answer, up or down with a reason; null takes it back. */
  rate: (id: string, message: string, verdict: "up" | "down" | null, reason?: string) =>
    fetch(`${one(id)}/ratings`, { method: "POST", headers: H, body: JSON.stringify({ message, verdict, reason: reason ?? null }) }).then((r) =>
      answer<{ message: string; verdict: "up" | "down" | null; reason: string | null }>(r),
    ),
};

/** Where a message stands among the ways its place was sent: which of how many, and the conversations either side. */
export function versionAt(all: ChatVersions[] | undefined, message: string): { index: number; count: number; prev: string | null; next: string | null } | null {
  for (const s of all ?? []) {
    const i = s.versions.findIndex((v) => v.message === message);
    if (i === -1) continue;
    return {
      index: i,
      count: s.versions.length,
      prev: i > 0 ? s.versions[i - 1].conversation : null,
      next: i < s.versions.length - 1 ? s.versions[i + 1].conversation : null,
    };
  }
  return null;
}

/** The person's latest conversations, as the side and the pages read them. */
export const chatsKept = keeper(() => chats.list({ limit: 50 }));

/** The meter's reading: the share of the window the context holds, amber from 70%; none while the size or the window is unknown. */
export function meterOf(c: ChatContext | null | undefined): { percent: number; words: string; tone: "plain" | "caution"; title: string } | null {
  if (!c || c.tokens === null || !c.window) return null;
  const percent = Math.min(100, Math.round((100 * c.tokens) / c.window));
  const size = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}k` : String(n));
  return {
    percent,
    words: `${percent}% of ${size(c.window)}`,
    tone: percent >= 70 ? "caution" : "plain",
    title: `The conversation holds ${c.tokens.toLocaleString("en-US")} of the model's ${c.window.toLocaleString("en-US")} tokens. Earlier turns are summarized before it fills.`,
  };
}

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
    get?: (id: string) => Promise<ChatDetail>;
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
