// SPDX-License-Identifier: AGPL-3.0-only
// The Audit page's words (Wave 4a section 9.2): each act on one line, when it
// was done, who did it and for whom, and what it touched, as the registry's
// audit log keeps it.

/** When an act was done, in UTC, which is how the log keeps it. */
export function whenWords(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
}

/** Who acted for the principal: a person, the assistant, or a model; nothing where nobody was named. */
export function actorWords(actor: unknown): string | null {
  if (!actor || typeof actor !== "object") return null;
  const a = actor as { kind?: string; name?: string; model?: string };
  if (!a.kind || a.kind === "absent") return null;
  if (a.kind === "person") return a.name ?? null;
  return [a.kind === "agent" ? "the assistant" : a.kind, a.name, a.model].filter(Boolean).join(", ");
}

/** What an act touched, on one line: its first few fields. */
export function scopeWords(scope: unknown): string {
  if (scope === null || scope === undefined) return "";
  if (typeof scope !== "object") return String(scope);
  const entries = Object.entries(scope as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
  const shown = entries.slice(0, 5).map(([k, v]) => `${k.replace(/_/g, " ")} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  if (entries.length > 5) shown.push(`and ${entries.length - 5} more`);
  return shown.join(" · ");
}

/** The acts the rows name, for the filter's choices. */
export function actionsOf(rows: { action?: string }[]): string[] {
  return [...new Set(rows.map((r) => r.action).filter((a): a is string => Boolean(a)))].sort();
}
