// SPDX-License-Identifier: AGPL-3.0-only
// The tools a run needs beside its image that the engine installs itself
// (2026-10-12, Nima: "make it easy for user to install it (like engine pull
// it down and install it)"): dcm2niix, pinned, through an admin-only door the
// engine audits, and whether it is present, where and which version, as the
// capabilities say. The names are SLICE's (failure.ts).

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { at, SLICE } from "./failure";

export interface ToolStatus {
  tool: string;
  /** Null where the engine does not say. */
  present: boolean | null;
  path: string | null;
  version: string | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The install door's name, as the engine lists it among its doors. */
export function installDoor(tool: string): string {
  return SLICE.install.replace("{tool}", tool);
}

/** A tool's status from an answer that holds it: the capabilities' entry, or the install door's answer. */
export function statusOf(tool: string, answer: unknown): ToolStatus {
  const present = at(answer, SLICE.present);
  const version = text(at(answer, SLICE.version));
  return { tool, present: typeof present === "boolean" ? present : version !== null ? true : null, path: text(at(answer, SLICE.path)), version };
}

/** The tool's status as the capabilities say it; null where the engine says nothing of it. */
export function toolStatus(caps: Capabilities, tool: string): ToolStatus | null {
  const s = at(caps.engine, SLICE.status.replace("{tool}", tool));
  return s !== null && typeof s === "object" && !Array.isArray(s) ? statusOf(tool, s) : null;
}

/** Whether this engine installs the tool at all: its door served. */
export function installServed(caps: Capabilities, tool: string): boolean {
  return served(caps, installDoor(tool));
}

/** Whether this person may install it: the door served, and the grant its policy row names held (install work where it names none). */
export function mayInstall(caps: Capabilities, tool: string): boolean {
  if (!installServed(caps, tool)) return false;
  const need = caps.engine?.policy?.find((p) => p.door === installDoor(tool))?.grant ?? "install:work";
  return Array.isArray(need) ? need.some((g) => may(caps, g)) : may(caps, need);
}

export const tools = {
  install: (tool: string) => {
    const [method, path] = installDoor(tool).split(/\s+/u);
    return door<Json>(method as "POST", path, {}).then((a) => statusOf(tool, a));
  },
};
