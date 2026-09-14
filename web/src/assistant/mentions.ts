// SPDX-License-Identifier: AGPL-3.0-only
// Naming a card, a cohort or a result in a message (the chat, slice 12). Typing
// @ in the message box offers the query cards, cohorts and results the person can
// open; one picked is written into the words as @[its name](card:12),
// @[its name](cohort:MS) or @[its name](result:45), so the mention travels in the
// words the assistant reads, and in the history, a share and an export. A mention
// grants nothing: the assistant reads what is named with its own tools, under its
// own roles.

import { results } from "../ask/client";
import { cohortNames, objects } from "../objects/client";

export type MentionKind = "card" | "cohort" | "result";

/** What each kind is called in the menu. */
export const MENTION_KIND: Record<MentionKind, string> = { card: "Card", cohort: "Cohort", result: "Result" };

export interface Mentionable {
  kind: MentionKind;
  id: string;
  name: string;
  /** A few words beside the name in the menu: a card's versions, a result's rows. */
  detail?: string;
}

/** A mention in the words: @[name](kind:id), the name's brackets escaped and the id encoded. */
const TOKEN = /@\[((?:\\.|[^\]\\])+)\]\((card|cohort|result):([^)\s]+)\)/gu;

/** An @ at the start of the text or after a space, and the word typed after it so far. */
const TYPING = /(?:^|\s)@([^\s@[\]()]*)$/u;

/** The word being typed after an @ at the end of the text, or null when none is. */
export function mentionAt(text: string): string | null {
  const m = TYPING.exec(text);
  return m ? (m[1] as string) : null;
}

const escapeName = (name: string) => name.replace(/[\\[\]]/gu, (c) => `\\${c}`);

/** A mention as it is written into the words. */
export function mentionToken(m: Mentionable): string {
  return `@[${escapeName(m.name)}](${m.kind}:${encodeURIComponent(m.id)})`;
}

/** The text with the @word being typed replaced by the mention picked, and a space after it. */
export function withMention(text: string, m: Mentionable): string {
  const typing = TYPING.exec(text);
  if (!typing) return text;
  const start = typing.index + typing[0].indexOf("@");
  return `${text.slice(0, start)}${mentionToken(m)} `;
}

const KINDS: MentionKind[] = ["card", "cohort", "result"];

/** What the menu offers for the word typed: at most eight names holding it, the kinds taking turns so none is crowded out, grouped by kind in the order given. */
export function mentionables(query: string, all: Mentionable[], limit = 8): Mentionable[] {
  const q = query.trim().toLowerCase();
  const byKind = KINDS.map((k) => all.filter((m) => m.kind === k && m.name.toLowerCase().includes(q)));
  const picked = new Set<Mentionable>();
  for (let i = 0; picked.size < limit && byKind.some((l) => i < l.length); i++) for (const l of byKind) if (i < l.length && picked.size < limit) picked.add(l[i]);
  return byKind.flat().filter((m) => picked.has(m));
}

export type Said = { kind: "words"; text: string } | { kind: "mention"; mention: Mentionable };

const decoded = (id: string) => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

/** A message's words and the mentions in them, in order, so the mentions can be drawn as chips. */
export function saidWithMentions(text: string): Said[] {
  const out: Said[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "words", text: text.slice(last, at) });
    out.push({
      kind: "mention",
      mention: { kind: m[2] as MentionKind, id: decoded(m[3] as string), name: (m[1] as string).replace(/\\(.)/gu, "$1") },
    });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "words", text: text.slice(last) });
  return out;
}

/** The words with each mention read as its name alone: what is copied, and what names a new conversation. */
export function plainMentions(text: string): string {
  return saidWithMentions(text)
    .map((s) => (s.kind === "words" ? s.text : s.mention.name))
    .join("");
}

/** What a person can name: their query cards, the registry's cohorts and the results kept for them. A list they cannot read is left out. */
export async function loadMentionables(): Promise<Mentionable[]> {
  const [docs, summary, handles] = await Promise.all([
    objects.documents().catch(() => null),
    objects.summary().catch(() => null),
    results.handles().catch(() => null),
  ]);
  return [
    ...(docs?.documents ?? []).map((d) => ({ kind: "card" as const, id: String(d.document), name: d.name?.trim() || `Query ${d.root}`, detail: d.versions === 1 ? "1 version" : `${d.versions} versions` })),
    ...(summary ? cohortNames(summary) : []).map((c) => ({ kind: "cohort" as const, id: c, name: c })),
    ...(handles?.handles ?? []).filter((h) => h.kept).map((h) => ({ kind: "result" as const, id: String(h.id), name: h.name?.trim() || `Result ${h.id}`, detail: `${h.row_count.toLocaleString("en-US")} ${h.grain} rows` })),
  ];
}
