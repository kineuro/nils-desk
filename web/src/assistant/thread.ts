// SPDX-License-Identifier: AGPL-3.0-only
// The thread's own rules (the chat, slice 4): the commands the message box
// understands, the reasons offered for an answer that missed, and which of the
// person's messages an edit or a retry starts again from.

import type { Turn } from "./parts";

export interface Command {
  name: string;
  words: string;
  /** What follows the name, when the command takes something. */
  takes?: string;
}

/** What the message box does by itself when a message starts with a slash. */
export const COMMANDS: Command[] = [
  { name: "new", words: "Start a new conversation" },
  { name: "fork", words: "Continue in a copy of this conversation" },
  { name: "share", words: "Share this conversation" },
  { name: "remember", words: "Keep something for your later conversations", takes: "what to keep" },
  { name: "export", words: "Save this conversation as a markdown file" },
  { name: "rename", words: "Rename this conversation", takes: "a name" },
  { name: "status", words: "Show the model, the station and how full the context is" },
  { name: "help", words: "List these commands" },
];

/** The message box's text read as a command, its name and the rest; null when it is words to send, as a path that starts with a slash is. */
export function commandOf(text: string): { name: string; rest: string; known: boolean } | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/u.exec(text.trim());
  if (!m) return null;
  return { name: m[1], rest: (m[2] ?? "").trim(), known: COMMANDS.some((c) => c.name === m[1]) };
}

/** The commands offered while a name after a slash is still being typed. */
export function commandsFor(text: string): Command[] {
  const m = /^\/([a-z]*)$/u.exec(text);
  return m ? COMMANDS.filter((c) => c.name.startsWith(m[1])) : [];
}

/** The person's message an answer replied to: what a retry sends again. */
export function askedBefore(turns: Turn[], answer: string): Turn | null {
  const i = turns.findIndex((t) => t.id === answer);
  for (let j = i - 1; j >= 0; j--) if (turns[j].role === "user") return turns[j];
  return null;
}

/** The person's last message: what the Up key opens for editing. */
export function lastAsked(turns: Turn[]): Turn | null {
  for (let j = turns.length - 1; j >= 0; j--) if (turns[j].role === "user") return turns[j];
  return null;
}

/** The reasons offered for an answer that missed; a person may also say it in words. */
export const MISSES = ["Wrong", "Not what I asked", "Too long", "Hard to follow"];
