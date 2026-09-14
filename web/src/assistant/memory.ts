// SPDX-License-Identifier: AGPL-3.0-only
// Memory (the chat, slice 6), as the desk asks the assistant for it: what a
// person asked it to keep, the notes kept from their work, whether memory is
// paused, and the install's instructions, which an admin writes and every
// new conversation reads. Nothing here holds a person's data: the assistant
// refuses a memory that looks like a code, an identifier or a date of birth.

const H = { "content-type": "application/json", "X-Nils-Desk": "1" };

export type MemoryKind = "person" | "study" | "correction" | "reference";
export type MemorySource = "said" | "accepted" | "page" | "work";

export interface MemoryItem {
  id: number;
  kind: MemoryKind;
  text: string;
  source: MemorySource | null;
  station: string;
  at: string;
  edited_at: string | null;
  used_at: string | null;
}

export interface Instructions {
  version: number;
  text: string;
  author: string;
  at: string;
}

export interface MemoryState {
  paused: boolean;
  items: MemoryItem[];
  instructions: Instructions | null;
}

export interface InstructionsState {
  current: Instructions | null;
  history: { version: number; author: string; at: string; chars: number }[];
}

/** The most one memory holds, and the most the install's instructions hold. */
export const MEMORY_CHARS = 300;
export const INSTRUCTION_CHARS = 4000;

/** The most of what a person asked to keep a new conversation reads, in characters (the chat, slice 13). */
export const MEMORY_BUDGET = 3000;

export class MemoryRefused extends Error {
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
    throw new MemoryRefused(r.status, typeof e?.error === "string" ? e.error : `the assistant answered ${r.status}`);
  }
  return body as T;
}

const one = (id: number) => `/assistant/memory/${id}`;

export const memory = {
  read: () => fetch("/assistant/memory").then((r) => answer<MemoryState>(r)),
  /** Keep something: typed on the Memory page, said in a conversation, or a memory the assistant offered and the person accepted. */
  add: (text: string, source: "said" | "accepted" | "page" = "page") =>
    fetch("/assistant/memory", { method: "POST", headers: H, body: JSON.stringify({ text, source }) }).then((r) => answer<MemoryItem>(r)),
  edit: (id: number, text: string) => fetch(one(id), { method: "PATCH", headers: H, body: JSON.stringify({ text }) }).then((r) => answer<MemoryItem>(r)),
  remove: (id: number) => fetch(one(id), { method: "DELETE", headers: H }).then((r) => answer<{ deleted: boolean }>(r)),
  pause: (paused: boolean) =>
    fetch("/assistant/memory/pause", { method: "PUT", headers: H, body: JSON.stringify({ paused }) }).then((r) => answer<{ paused: boolean }>(r)),
  /** Everything the assistant keeps about the person, deleted. */
  reset: () => fetch("/assistant/memory", { method: "DELETE", headers: H }).then((r) => answer<{ deleted: number }>(r)),
  instructions: () => fetch("/assistant/instructions").then((r) => answer<InstructionsState>(r)),
  /** A new version of the install's instructions; an admin's. */
  writeInstructions: (text: string) =>
    fetch("/assistant/instructions", { method: "PUT", headers: H, body: JSON.stringify({ text }) }).then((r) => answer<{ current: Instructions }>(r)),
};

/** What the person asked the assistant to keep. */
export function asked(items: MemoryItem[]): MemoryItem[] {
  return items.filter((i) => i.kind === "person");
}

/** The notes kept from the person's work: the queries they settled, the proposals they disregarded. */
export function fromWork(items: MemoryItem[]): MemoryItem[] {
  return items.filter((i) => i.kind !== "person");
}

/** How a memory came to be kept, in words. */
export function sourceWords(i: MemoryItem): string {
  if (i.source === "said") return "you asked in a conversation";
  if (i.source === "accepted") return "you accepted it";
  if (i.source === "page") return "you added it here";
  if (i.kind === "study") return "from a query you settled";
  if (i.kind === "correction") return "from a proposal you disregarded";
  return "kept from your work";
}

/** How many characters are left in a memory being written. */
export function charsLeft(text: string, max = MEMORY_CHARS): number {
  return max - text.trim().length;
}

/** How much of what a person asked to keep a new conversation reads (the chat, slice 13): all of it within the budget, else what is closest to its first message. */
export function budgetWords(items: MemoryItem[]): string {
  const chars = asked(items).reduce((sum, i) => sum + i.text.length, 0);
  const n = (x: number) => x.toLocaleString("en-US");
  return chars <= MEMORY_BUDGET
    ? `${n(chars)} of ${n(MEMORY_BUDGET)} characters: a new conversation reads all of it.`
    : `${n(chars)} characters, past the ${n(MEMORY_BUDGET)} a new conversation reads: it reads what is closest to your first message, and the assistant looks up the rest when you refer to it.`;
}
