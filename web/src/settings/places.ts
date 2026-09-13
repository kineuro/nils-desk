// SPDX-License-Identifier: AGPL-3.0-only
// The Places page's words and its one flow (Wave 5 sections 10.2 and 12.5):
// every place with its role, what was declared of it and what the engine
// measured, whether it stands up to what its role must have, and a place
// added, with a source started again in the engine and digested. The engine
// checks every rule again at its doors; the page only says them first.

import { day } from "../home/tiles";
import { objects, type Place } from "../objects/client";
import { ops } from "../ops/client";
import { placeRule } from "./console";
import { sizeWords } from "./database";
import { followRun, supervise } from "./supervise";

export type Tone = "ok" | "caution" | "blocked" | "neutral";
export type Role = Place["role"];

export const ROLES: Role[] = ["source", "registry", "working", "export", "share", "exchange", "backup"];

/** What each role holds and what it must have, as the engine lists them. */
export const ROLE_WORDS: Record<Role, { holds: string; must: string }> = {
  source: { holds: "the original data, read only for the engine", must: "protected storage with snapshots; never written by the engine" },
  registry: { holds: "the registry, the linkage store, the keys", must: "protected storage and a routine backup elsewhere" },
  working: { holds: "digests in flight, viewing pyramids, rehearsals", must: "fast; may be lost" },
  export: { holds: "releases and BIDS trees", must: "protected storage with snapshots" },
  share: { holds: "subsets a question wrote out, results handed to a colleague", must: "reachable by the group" },
  exchange: { holds: "what leaves or arrives through a bridge", must: "its own rules" },
  backup: { holds: "the engine's archives", must: "protected, elsewhere from the registry" },
};

const live = (places: Place[]) => places.filter((p) => p.retired_at === null);
const mount = (p: Place | undefined | null): string | null => (typeof p?.probed?.["mount"] === "string" ? (p.probed["mount"] as string) : null);
const said = (p: Place, key: string) => p.guarantees?.[key] === true;

/** How many places of each role, the retired ones with them, as the chips above the table say. */
export function roleCounts(places: Place[]): { role: Role; count: number }[] {
  return ROLES.map((role) => ({ role, count: places.filter((p) => p.role === role).length })).filter((r) => r.count > 0);
}

/** The registry place a backup place backs up, if one names it. */
function backedUp(p: Place, places: Place[]): Place | undefined {
  return live(places).find((r) => r.role === "registry" && r.guarantees?.["backup"] === p.name);
}

/** What was declared of a place, on one line. */
export function guaranteeLine(p: Place, places: Place[]): string {
  const parts: string[] = [];
  if (p.role === "registry" && typeof p.guarantees?.["backup"] === "string") parts.push(`backed up to ${p.guarantees["backup"] as string}`);
  if (said(p, "snapshots")) parts.push("snapshots");
  if (said(p, "protected")) parts.push("protected");
  if (said(p, "fast")) parts.push("fast");
  if (p.role === "working") parts.push("may be lost");
  if (p.role === "backup") {
    const registry = backedUp(p, places);
    if (registry && mount(p) !== null && mount(registry) !== null && mount(p) !== mount(registry)) parts.push("another disk");
  }
  return parts.length > 0 ? parts.join(" · ") : "none declared";
}

/** Whether a place stands up to what its role must have, as far as the declaration and the engine's measure can say. */
export function placeState(p: Place, places: Place[], containers: boolean): { tone: Tone; words: string } {
  if (p.retired_at !== null) return { tone: "neutral", words: `retired ${day(p.retired_at)}` };
  const probed = p.probed ?? {};
  if (probed["exists"] === false) return { tone: "blocked", words: "not there" };
  if (probed["directory"] === false) return { tone: "blocked", words: "not a folder" };
  if (said(p, "snapshots") && probed["snapshots_seen"] === false) return { tone: "caution", words: "snapshots not seen" };
  switch (p.role) {
    case "source":
      if (!said(p, "snapshots") && !said(p, "protected")) return { tone: "caution", words: "needs snapshots" };
      return { tone: "ok", words: containers ? "mounted read only" : "passes" };
    case "export":
      if (!said(p, "snapshots")) return { tone: "caution", words: "needs snapshots" };
      break;
    case "registry": {
      const named = p.guarantees?.["backup"];
      const backup = typeof named === "string" ? live(places).find((b) => b.name === named) : undefined;
      if (!backup || backup.role !== "backup" || backup.path === p.path) return { tone: "caution", words: "needs a backup elsewhere" };
      break;
    }
    case "backup": {
      const registry = backedUp(p, places);
      if (registry && mount(p) !== null && mount(p) === mount(registry)) return { tone: "caution", words: "on the registry's disk" };
      break;
    }
  }
  return { tone: "ok", words: "passes" };
}

/** What the engine does with a place today, from the paths it was started with. */
export function pathNote(p: Place): string | null {
  if (p.retired_at !== null) return null;
  const verbs = (p.bound ?? []).map((b) => b.verb);
  if (p.role === "source") return verbs.some((v) => v.includes("ingest-root")) ? "the engine reads it" : "the engine reads it once it starts again";
  if (p.role === "backup" && verbs.some((v) => v.includes("backup-dir"))) return "the engine writes its backups here";
  if (p.role === "registry" && verbs.includes("registry")) return "the engine's registry";
  return null;
}

/** What a place has left to write on, as the engine last measured it. */
export function freeWords(p: Place): string {
  const bytes = p.probed?.["free_bytes"];
  return typeof bytes === "number" ? sizeWords(bytes) : "";
}

export interface PlaceDraft {
  role: Role;
  path: string;
  name: string;
  guarantees: { snapshots: boolean; protected: boolean; fast: boolean };
  /** The backup place of a registry place. */
  backup: string | null;
  /** A batch for each folder inside, or one batch for the whole folder. */
  each: boolean;
}

export const EMPTY: PlaceDraft = { role: "source", path: "", name: "", guarantees: { snapshots: false, protected: false, fast: false }, backup: null, each: true };

/** The rules of section 10.2, said on the form before the door is asked. */
export function draftRefusal(d: PlaceDraft, places: Place[]): string | null {
  const path = d.path.trim();
  if (path && !path.startsWith("/")) return "a place is a whole path, from /";
  return placeRule({ name: d.name, role: d.role, path, backup: d.role === "registry" ? d.backup : null }, places);
}

/** The guarantees the door takes. */
export function guaranteesOf(d: PlaceDraft): Record<string, unknown> {
  return { backup: d.role === "registry" ? d.backup : null, ...d.guarantees };
}

/** The digest of a whole folder, as one batch named after its place. */
export function wholeDigest(name: string): { name: string; command: string[] } {
  return { name, command: ["digest", "--name", name, `@${name}`] };
}

/** A door asked again while the engine is still starting: a failed connection, or the desk saying the engine did not answer. */
export async function patiently<T>(f: () => Promise<T>, tries = 20): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      const starting = e instanceof TypeError || (e instanceof Error && /did not answer/.test(e.message));
      if (!starting || i >= tries) throw e;
      await new Promise((done) => setTimeout(done, 3000));
    }
  }
}

export interface AddPlan {
  name: string;
  role: Role;
  path: string;
  guarantees: Record<string, unknown>;
  /** Start the engine again, so it reads the new source: only where a service keeps it running. */
  restart: boolean;
  digests: { name: string; command: string[] }[];
}

/**
 * Add a place; for a source, start the engine again with it and queue its
 * digests. Says each phase as it begins, and answers the words of how it
 * ended.
 */
export async function addPlace(plan: AddPlan, phase: (words: string) => void): Promise<string> {
  phase(`adding ${plan.name} as a ${plan.role} place`);
  await objects.placeAdd({ name: plan.name, role: plan.role, path: plan.path, guarantees: plan.guarantees });
  if (plan.role !== "source") return `${plan.name} is a ${plan.role} place.`;
  if (!plan.restart) return `${plan.name} is a source. The engine reads it once it starts again.`;
  phase("starting the engine again with the folder");
  const run = await supervise.reapply("engine");
  const ended = await followRun(run.id, () => undefined);
  if (ended === null) throw new Error("the engine is still starting; look again in a moment");
  if (ended.state !== "done") throw new Error(`the engine did not start again: ${ended.tail?.slice(-1)[0] ?? ended.state}`);
  for (const [i, d] of plan.digests.entries()) {
    phase(`queueing digest ${i + 1} of ${plan.digests.length}`);
    await patiently(() => ops.enqueue(d.command, d.name));
  }
  const queued = plan.digests.length === 0 ? "" : plan.digests.length === 1 ? ", and one digest is queued" : `, and ${plan.digests.length} digests are queued`;
  return `${plan.name} is a source${queued}.`;
}
