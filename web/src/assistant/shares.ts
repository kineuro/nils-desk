// SPDX-License-Identifier: AGPL-3.0-only
// Sharing a conversation (the chat, slice 5), as the desk asks the assistant
// for it: a conversation's share with the people it names or everyone on the
// desk, what others share with the person, one share opened as a snapshot of
// what was said, and a share continued as a conversation of the reader's own.
// The people to name come from the desk itself.

import { keeper } from "../ui/kept";
import type { Chat } from "./chats";
import type { Proposal, Turn } from "./parts";

const H = { "content-type": "application/json", "X-Nils-Desk": "1" };

/** The class a share guards: a person who does not see it in records is refused. */
export interface ShareGuard {
  class: "quasi_identifying" | "sensitive";
  words: string;
}

export interface ShareRead {
  subject: string;
  display: string | null;
  first_at: string;
  last_at: string;
  count: number;
}

export interface Share {
  id: string;
  conversation: string;
  title: string | null;
  owner: string;
  /** The owner's subject on the desk, to name them from the desk's own directory. */
  owner_subject?: string;
  audience: "desk" | "people";
  people: { subject: string; display: string | null }[];
  guards: ShareGuard | null;
  created_at: string;
  updated_at: string;
  /** Who opened it; only its owner is told. */
  reads?: ShareRead[];
}

export interface SharedWithMe extends Share {
  /** Whether the person's roles reach what the conversation could have read. */
  readable: boolean;
}

export interface SnapshotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: { name: string; failed: boolean }[];
  proposals: { document: number; parent: number | null; sentence: string; decided: "accepted" | "rejected" | null }[];
}

export interface ShareOpened extends Share {
  mine: boolean;
  snapshot: { v: 1; messages: SnapshotMessage[] };
}

/** A person on this desk, as the desk names them. */
export interface DeskPerson {
  subject: string;
  display: string;
}

export class ShareRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The class the reader's roles do not reach, when that is why. */
    readonly guard: string | null,
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
    const e = body as { error?: unknown; class?: unknown } | null;
    throw new ShareRefused(r.status, typeof e?.error === "string" ? e.error : `the answer was ${r.status}`, typeof e?.class === "string" ? e.class : null);
  }
  return body as T;
}

const of = (conversation: string) => `/assistant/conversations/${encodeURIComponent(conversation)}/share`;
const one = (id: string) => `/assistant/shares/${encodeURIComponent(id)}`;

export const shares = {
  /** A conversation's share, while it stands, with who opened it. */
  of: (conversation: string) => fetch(of(conversation)).then((r) => answer<{ share: Share | null }>(r)),
  /** Share a conversation, or bring its share up to the latest turn. */
  put: (conversation: string, audience: "desk" | "people", people: DeskPerson[]) =>
    fetch(of(conversation), {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ audience, people: people.map((p) => ({ subject: p.subject, display: p.display })) }),
    }).then((r) => answer<{ share: Share }>(r)),
  stop: (conversation: string) => fetch(of(conversation), { method: "DELETE", headers: H }).then((r) => answer<{ revoked: boolean }>(r)),
  /** The person's own shares. */
  mine: () => fetch("/assistant/shares").then((r) => answer<{ shares: Share[] }>(r)),
  /** What others share with the person. */
  withMe: () => fetch("/assistant/shared").then((r) => answer<{ shared: SharedWithMe[] }>(r)),
  open: (id: string) => fetch(one(id)).then((r) => answer<ShareOpened>(r)),
  /** A share continued as a conversation of the person's own. */
  continue: (id: string) => fetch(`${one(id)}/continue`, { method: "POST", headers: H }).then((r) => answer<Chat & { continued: boolean }>(r)),
  /** The people on this desk a person may share with, never themselves. */
  people: () => fetch("/desk/people").then((r) => answer<{ people: DeskPerson[] }>(r)),
};

/** The people on this desk, kept between pages: the names a share's owner and readers are called by. */
export const peopleKept = keeper(async () => (await shares.people()).people);

/** A person's name from the desk's directory, or the name the assistant gave, or their subject. */
export function namesOf(people: DeskPerson[] | null | undefined): (subject: string, given?: string | null) => string {
  const by = new Map((people ?? []).map((p) => [p.subject, p.display]));
  return (subject, given) => by.get(subject) || given || subject;
}

const listed = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`);

/** Who a share reaches, in words. */
export function audienceWords(s: Pick<Share, "audience" | "people">): string {
  if (s.audience === "desk") return "everyone on this desk";
  return listed(s.people.map((p) => p.display || p.subject)) || "nobody";
}

/** Who opened a share, in words. */
export function readsWords(reads: ShareRead[] | undefined, name: (subject: string, given?: string | null) => string = (s, g) => g || s): string {
  if (!reads || reads.length === 0) return "Nobody has opened it yet";
  return `Opened by ${listed(reads.map((r) => name(r.subject, r.display)))}`;
}

/** The class a share guards, as its owner and its readers are told. */
export function guardWords(g: ShareGuard | null): string | null {
  return g ? `It may have read ${g.words}; a person who does not see them in records is refused.` : null;
}

/** The people whose name or subject holds what was typed. */
export function matching(people: DeskPerson[], q: string): DeskPerson[] {
  const t = q.trim().toLowerCase();
  return t ? people.filter((p) => p.display.toLowerCase().includes(t) || p.subject.toLowerCase().includes(t)) : people;
}

/** A snapshot as the thread draws it: its turns, done, with their steps by name, and the proposals by the turn that made them. */
export function turnsOf(messages: SnapshotMessage[]): { turns: Turn[]; proposals: Proposal[] } {
  return {
    turns: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      done: true,
      tools: m.steps.map((s, i) => ({ id: `${m.id}-${i}`, name: s.name, state: s.failed ? ("failed" as const) : ("done" as const) })),
    })),
    proposals: messages.flatMap((m) => m.proposals.map((p) => ({ document: p.document, parent: p.parent, sentence: p.sentence, turn: m.id, decided: p.decided }))),
  };
}
