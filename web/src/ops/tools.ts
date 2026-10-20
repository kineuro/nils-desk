// SPDX-License-Identifier: AGPL-3.0-only
// The tools the engine runs beside itself (2026-10-12, Nima: "make it easy
// for user to install it (like engine pull it down and install it)"):
// dcm2niix, which a BIDS release and a run with a bids input convert with.
// GET /api/tools and the capabilities' `tools` say whether each is here,
// where, how it was found and which version, beside the build this engine
// pins; its install, an admin's door the engine audits, fetches the pinned
// build into the registry's tools folder. Where the engine cannot reach the
// releases (gate T31, step 15.7), its install from a file takes the archive
// the person fetched on a machine that can: the status and the refusal name
// that file (its name, the release's address and its sha256) and its door.

import { door, DoorError, type Json } from "../ask/client";
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
  install: { door: string; command: string | null; grant: string | null; available: boolean; into: string | null; source: string | null; sha256: string | null; why: string | null; file: ToolFile | null } | null;
}

/** The archive to fetch where the engine cannot reach the releases, and the door that takes it (gate T31, step 15.7); absent from an engine that has no such door. */
export interface ToolFile {
  /** `POST /api/tools/dcm2niix/install-file`: the archive as the body. */
  door: string;
  command: string | null;
  /** The archive's name, as the release names it. */
  archive: string;
  /** The release's own address of it. */
  url: string | null;
  sha256: string | null;
  /** The most bytes the door takes. */
  max_bytes: number | null;
}

const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The archive a status or a refusal names, or null where it names none; its address only where it is a web one, as it becomes a link. */
export function fileOf(v: unknown): ToolFile | null {
  const f = obj(v);
  const door = text(f.door);
  const archive = text(f.archive);
  if (!door || !archive) return null;
  const url = text(f.url);
  return { door, command: text(f.command), archive, url: url && /^https?:\/\//iu.test(url) ? url : null, sha256: text(f.sha256), max_bytes: typeof f.max_bytes === "number" && f.max_bytes > 0 ? f.max_bytes : null };
}

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
    install: door ? { door, command: text(i.command), grant: text(i.grant), available: i.available === true, into: text(i.into), source: text(i.source), sha256: text(i.sha256), why: text(i.why), file: fileOf(i.file) } : null,
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

/** Whether this person may give the engine the archive: the file door served and the install's grant held. */
export function mayInstallFile(caps: Capabilities, fix: Pick<Fix, "grant"> | null, file: ToolFile | null): boolean {
  return fix !== null && file !== null && mayInstall(caps, { door: file.door, grant: fix.grant });
}

/** The archive a refused install offers to take instead: as the engine names it beside its refusal, else, where the releases could not be reached, as the tool's status names it. */
export function fileOfRefusal(e: unknown, known: ToolFile | null): ToolFile | null {
  const body: Json = e instanceof DoorError ? e.body : {};
  return fileOf(body.file) ?? (body.offline === true ? known : null);
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
    return door<Json>(method === "PUT" ? "PUT" : "POST", path, path === "/api/software/install" ? (fix.version ? { spec: `${fix.tool}@${fix.version}` } : { app: fix.tool }) : undefined).then((a) => ({ installed: a.installed === true, tool: toolOf(a.tool, fix.tool), why: text(a.why) }));
  },
  /** The install from a file: the archive the person picked, sent as it stands to the door the status names. */
  installFile: async (file: ToolFile, tool: string, archive: Blob): Promise<Installed> => {
    const [method, path] = file.door.split(/\s+/u);
    const r = await fetch(path, { method: method === "PUT" ? "PUT" : "POST", headers: { "content-type": "application/zip", "X-Nils-Desk": "1" }, body: archive });
    const words = await r.text();
    let a: Json;
    try {
      a = words ? (JSON.parse(words) as Json) : {};
    } catch {
      a = { error: words };
    }
    if (!r.ok) throw new DoorError(r.status, a);
    return { installed: a.installed === true, tool: toolOf(a.tool, tool), why: text(a.why) };
  },
};
