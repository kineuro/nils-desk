// SPDX-License-Identifier: AGPL-3.0-only
// Settings' pure parts (Wave 5 section 10): the parts table generated from
// the capabilities document, the rules of a place checked before the door
// is asked, the words of an update's closure, and the audit filters.

import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";

export interface Part {
  id: string;
  title: string;
  version: string | null;
  contracts: Record<string, string>;
  health: "ok" | "warming" | "absent" | "unknown";
  /** A newer release on the channel, when the supervisor names one. */
  newer: string | null;
}

export interface Installed {
  part: string;
  version: string;
  contracts?: Record<string, string>;
  health?: string;
  newer?: { version: string; contracts?: Record<string, string> } | null;
}

/** Every part the deployment has, from the capabilities document each part already publishes; never hand-built. */
export function parts(caps: Capabilities, installed: Installed[] = []): Part[] {
  const newerOf = (id: string) => installed.find((i) => i.part === id)?.newer?.version ?? null;
  const out: Part[] = [];
  out.push({ id: "engine", title: "Engine", version: caps.engine?.engine.version ?? null, contracts: caps.engine?.contracts ?? {}, health: caps.engine ? "ok" : "absent", newer: newerOf("engine") });
  out.push({ id: "desk", title: "Desk", version: caps.desk.version, contracts: caps.desk.contracts, health: "ok", newer: newerOf("desk") });
  if (caps.assistant !== null) {
    const a = caps.assistant as { version?: unknown; contracts?: Record<string, string> };
    out.push({ id: "assistant", title: "Assistant", version: typeof a.version === "string" ? a.version : null, contracts: a.contracts ?? {}, health: "ok", newer: newerOf("assistant") });
  }
  if (caps.kvasir !== null) {
    const k = caps.kvasir as { version?: unknown; health?: { warming?: boolean }; contracts?: Record<string, string> };
    out.push({ id: "kvasir", title: "Kvasir", version: typeof k.version === "string" ? k.version : null, contracts: k.contracts ?? {}, health: k.health?.warming ? "warming" : "ok", newer: newerOf("kvasir") });
  }
  for (const app of caps.apps) {
    const c = app.capabilities as { version?: unknown; contracts?: Record<string, string> } | null;
    out.push({ id: `app:${app.id}`, title: app.title ?? app.id, version: typeof c?.version === "string" ? c.version : null, contracts: c?.contracts ?? {}, health: c ? "ok" : "absent", newer: newerOf(app.id) });
  }
  return out;
}

/** The words of an update's closure: what changes, contract by contract, and who else speaks the old one. */
export function updateWords(part: Part, newer: { version: string; contracts?: Record<string, string> }, all: Part[]): string[] {
  const lines: string[] = [`${part.title} ${part.version ?? "?"} to ${newer.version}.`];
  for (const [name, v] of Object.entries(newer.contracts ?? {})) {
    const was = part.contracts[name];
    if (was !== undefined && was !== v) {
      const others = all.filter((p) => p.id !== part.id && p.contracts[name] !== undefined && p.contracts[name] === was);
      lines.push(`changes the ${name} contract from ${was} to ${v}${others.length > 0 ? `; ${others.map((o) => o.title).join(", ")} ${others.length === 1 ? "speaks" : "speak"} ${was}` : ""}.`);
    }
  }
  if (lines.length === 1) lines.push("No contract changes.");
  return lines;
}

export const ROLES: Place["role"][] = ["source", "registry", "working", "export", "share", "exchange", "backup"];

/** The rules of section 10.2, checked before the door is asked so the refusal is one sentence on the form; the engine checks them again. */
export function placeRule(draft: { name: string; role: Place["role"]; path: string; backup: string | null }, existing: Place[]): string | null {
  if (!draft.name.trim()) return "a place has a name";
  if (!draft.path.trim()) return "a place has a path";
  if (existing.some((p) => p.name === draft.name.trim() && p.retired_at === null)) return `a place named ${draft.name.trim()} exists`;
  if (draft.role === "registry") {
    if (!draft.backup) return "the registry role is refused on a place without a backup";
    const b = existing.find((p) => p.name === draft.backup && p.retired_at === null);
    if (!b) return `no place named ${draft.backup}`;
    if (b.role !== "backup") return `${draft.backup} is a ${b.role} place, not a backup`;
    if (b.path === draft.path.trim()) return "a backup elsewhere: the same path is not elsewhere";
  }
  return null;
}

/** What the probe says beside what was declared, one line. */
export function guaranteeWords(p: Place): string {
  const g = p.guarantees ?? {};
  const probed = p.probed ?? {};
  const parts: string[] = [];
  if (g.snapshots === true) parts.push(probed.snapshots_seen === true ? "snapshots, seen" : probed.snapshots_seen === false ? "snapshots declared, not seen" : "snapshots declared");
  if (g.protected === true) parts.push("protected");
  if (g.fast === true) parts.push("fast");
  if (typeof g.backup === "string") parts.push(`backed up to ${g.backup}`);
  if (typeof probed.free_bytes === "number") parts.push(`${(probed.free_bytes / 1e12).toFixed(2)} TB free`);
  if (probed.writable === false) parts.push("not writable");
  return parts.length > 0 ? parts.join(", ") : "nothing declared";
}

export interface AuditFilter {
  principal: string;
  action: string;
  object: string;
  month: string;
}

/** The audit door's query from the filters: a month becomes since its first day; object and door are matched on the desk. */
export function auditQuery(f: AuditFilter): { principal?: string; action?: string; since?: string; limit: number } {
  const q: { principal?: string; action?: string; since?: string; limit: number } = { limit: 500 };
  if (f.principal.trim()) q.principal = f.principal.trim();
  if (f.action.trim()) q.action = f.action.trim();
  if (/^\d{4}-\d{2}$/.test(f.month)) q.since = `${f.month}-01T00:00:00Z`;
  return q;
}
