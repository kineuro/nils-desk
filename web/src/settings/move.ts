// SPDX-License-Identifier: AGPL-3.0-only
// A place moved to another folder: which roles may move that way, the rule
// checked before the door is asked, and what the move does, said before it is
// made. The engine records the new path and checks it again.

import type { Place } from "../objects/client";
import { plainPath } from "./folders";

/** Whether a place's folder is changed on its page. The registry moves with a backup and a restore; the engine's backups go where it was started. */
export function movable(role: Place["role"]): boolean {
  return role !== "registry" && role !== "backup";
}

/** Why a place's folder cannot move there, or null when it can. */
export function moveRefusal(to: string, place: Place, places: Place[]): string | null {
  const path = plainPath(to);
  if (path === null) return "a folder is a whole path, from /";
  if (path === place.path) return "that is the folder it is in now";
  const other = places.find((p) => p.id !== place.id && p.retired_at === null && p.path === path);
  if (other) return `${other.name} is that folder already`;
  return null;
}

/** What moving a place does, in the words said beside the field. */
export function moveWords(role: Place["role"]): string {
  if (role === "source") return "The engine reads the new folder once it starts again. What was digested before still names the folder it was read from.";
  return "What is written from now on goes to the new folder; what is in the old one stays where it is.";
}

/** The folders the desk knows, offered where a folder is chosen: every place in force, and where the install keeps its files. */
export function knownFolders(places: Place[], dir: string | null): { path: string; label: string }[] {
  const out = places.filter((p) => p.retired_at === null).map((p) => ({ path: p.path, label: `${p.name}, the ${p.role} place` }));
  if (dir && !out.some((k) => k.path === dir)) out.push({ path: dir, label: "where this install keeps its files" });
  return out;
}

/** Why a place's folder is not changed on its page. */
export function fixedWords(role: Place["role"]): string | null {
  if (role === "registry") return "The registry moves with a backup and a restore into the new folder.";
  if (role === "backup") return "The engine writes its backups to the folder it was started with; nils setup changes it.";
  return null;
}
