// SPDX-License-Identifier: AGPL-3.0-only
// The tools the engine runs beside itself (2026-10-12, Nima: "make it easy
// for user to install it (like engine pull it down and install it)"):
// dcm2niix, which a BIDS release and a run with a bids input convert with.
// GET /api/tools and the capabilities' `tools` say whether each is here,
// where, how it was found and which version, beside the build this engine
// pins; its install, an admin's door the engine audits, fetches the pinned
// build into the registry's tools folder.

import { door, type Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { isGrant, may, mayAny } from "../grants";
import { SLICE, type Fix } from "./failure";

/** One tool as GET /api/tools and the capabilities answer it. */
export interface ToolEntry {
  name: string;
  /** Found, and answering its version. */
  present: boolean;
  path: string | null;
  /** given, setup-given, path, beside, setup or tools: where it was found. */
  found_by: string | null;
  version: string | null;
  /** The build this engine takes, and whether the one found is it. */
  pinned: string | null;
  current: boolean | null;
  /** Why one found does not run. */
  problem: string | null;
  install: { door: string; command: string | null; grant: string | null; available: boolean; into: string | null; source: string | null; sha256: string | null; why: string | null } | null;
}

const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** A tool's entry from whatever holds one, or null where it names none. */
export function toolOf(v: unknown, name: string | null = null): ToolEntry | null {
  const t = obj(v);
  const called = text(t.name) ?? name;
  if (!called) return null;
  const i = obj(t.install);
  const door = text(i.door);
  return {
    name: called,
    present: t.present === true,
    path: text(t.path),
    found_by: text(t.found_by),
    version: text(t.version),
    pinned: text(t.pinned),
    current: typeof t.current === "boolean" ? t.current : null,
    problem: text(t.problem),
    install: door ? { door, command: text(i.command), grant: text(i.grant), available: i.available === true, into: text(i.into), source: text(i.source), sha256: text(i.sha256), why: text(i.why) } : null,
  };
}

/** The tools as the capabilities name them. */
export function toolsInCaps(caps: Capabilities): ToolEntry[] {
  return Object.entries(obj(caps.engine?.[SLICE.toolsInCaps])).flatMap(([name, v]) => toolOf(v, name) ?? []);
}

/** One tool as the capabilities say it; null where they say nothing of it. */
export function toolStatus(caps: Capabilities, name: string): ToolEntry | null {
  return toolsInCaps(caps).find((t) => t.name === name) ?? null;
}

/** Where a tool was found, in words. */
export function foundByWords(by: string | null): string | null {
  if (by === null) return null;
  return ({ given: "as given", "setup-given": "as the site gave it to setup", path: "on the engine's search path", beside: "beside nils", setup: "where setup put it", tools: "in the registry's tools folder" } as Record<string, string>)[by] ?? by;
}

/** Whether the list of tools is served to this person. */
export function mayListTools(caps: Capabilities): boolean {
  return served(caps, SLICE.tools) && mayAny(caps, "install:see", "pipelines:see");
}

/** Whether this person may press an install: its door served and its grant held. */
export function mayInstall(caps: Capabilities, fix: Pick<Fix, "door" | "grant"> | null): boolean {
  if (!fix || !served(caps, fix.door)) return false;
  const grant = fix.grant ?? "install:work";
  return isGrant(grant) && may(caps, grant);
}

/** A tool's install as the fix a failure would offer. */
export function fixOfTool(t: ToolEntry): Fix | null {
  return t.install ? { tool: t.name, door: t.install.door, command: t.install.command, grant: t.install.grant } : null;
}

/** What the install door answered: whether it installed, the tool as it stands now, and why where it left one alone. */
export interface Installed {
  installed: boolean;
  tool: ToolEntry | null;
  why: string | null;
}

export const tools = {
  list: () => door<{ tools: unknown[] }>("GET", SLICE.tools.split(" ")[1]).then((r) => (Array.isArray(r.tools) ? r.tools : []).flatMap((t) => toolOf(t) ?? [])),
  /** The fix's door, as the engine names it: `POST /api/tools/dcm2niix/install`. */
  install: (fix: Fix): Promise<Installed> => {
    const [method, path] = fix.door.split(/\s+/u);
    return door<Json>(method === "PUT" ? "PUT" : "POST", path).then((a) => ({ installed: a.installed === true, tool: toolOf(a.tool, fix.tool), why: text(a.why) }));
  },
};
