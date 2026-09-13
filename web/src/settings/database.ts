// SPDX-License-Identifier: AGPL-3.0-only
// The Database page's doors and words (Wave 5 section 10.3), as the chosen
// design draws them: where the registry is kept and whether it passes the
// rule, its backups with their schedule and each archive's last check, what
// was fixed when it was made, and its calendar. Every word is read from a
// door; the page never says what the engine did not.

import { door } from "../ask/client";
import type { Place } from "../objects/client";
import type { Install } from "./supervise";

export interface Check {
  at: string;
  ok: boolean;
  rehearsed: boolean;
  files?: { name: string; state: string }[] | null;
  opened?: { name: string; state: string }[] | null;
}

export interface Archive {
  name: string;
  created_at: string | null;
  seconds: number | null;
  bytes: number;
  files: number;
  epoch: number | null;
  schema_version: number | null;
  backend: string | null;
  /** Whether the archive is this registry's; a directory may hold another's. */
  ours: boolean;
  checked: Check | null;
}

export interface BackupSchedule {
  every: "off" | "day" | "week";
  at: string;
  day: string | null;
  keep: number | null;
  timezone: string;
  next: string | null;
  /** When it next comes round, as the registry's clock reads it: `YYYY-MM-DDTHH:MM`. */
  next_local: string | null;
  last: string | null;
}

export interface Backups {
  dir: string | null;
  place: { id: number; name: string; guarantees: Record<string, unknown> } | null;
  count: number;
  archives: Archive[];
  schedule: BackupSchedule;
}

export interface Calendar {
  timezone: string;
  week_start: string;
  epoch: number;
  week_starts: string[];
  timezones: string[];
}

export interface RegistryStatus {
  home: string;
  backend: string;
  schema: string | null;
  registry_id: string;
  schema_version: number;
  epoch: number;
  created_at: string;
  pseudonym_scheme: string;
  pseudonym_key: string;
  display_length: number;
}

export const database = {
  backups: () => door<Backups>("GET", "/api/backups"),
  setSchedule: (body: { every: string; at: string; day: string | null; keep: number | null }) => door<BackupSchedule>("PUT", "/api/backups/schedule", body),
  calendar: () => door<Calendar>("GET", "/api/settings"),
  setCalendar: (body: { timezone: string; week_start: string }) => door<Calendar>("PUT", "/api/settings", body),
  status: () => door<{ registry: RegistryStatus }>("GET", "/api/status"),
};

export type Tone = "ok" | "caution" | "blocked" | "neutral";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Bytes as a person reads them. */
export function sizeWords(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** How long an archive took to write. */
export function tookWords(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 1) return "under a second";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

/** An archive's last check, as a tag. */
export function checkedTag(a: Archive): { tone: Tone; words: string } {
  const c = a.checked;
  if (!c) return { tone: "neutral", words: "not checked" };
  if (c.ok) return { tone: "ok", words: c.rehearsed ? "rehearsed" : "verified" };
  const differs = (c.files ?? []).some((f) => f.state !== "ok");
  return { tone: "blocked", words: differs ? "differs from its manifest" : "a store does not open" };
}

/** How the newest archive of this registry stands, for the head of the backups. */
export function backupsTag(b: Backups): { tone: Tone; words: string } {
  const newest = b.archives.find((a) => a.ours);
  if (!newest) return { tone: "caution", words: b.dir ? "no backup yet" : "no backup directory" };
  const t = checkedTag(newest);
  if (t.tone === "ok") return { tone: "ok", words: newest.checked?.rehearsed ? "last one rehearsed" : "last one verified" };
  if (t.tone === "blocked") return { tone: "blocked", words: "the last one failed its check" };
  return { tone: "caution", words: "last one not checked" };
}

/** A schedule as a person says it. */
export function scheduleWords(s: { every: string; at: string; day: string | null }): string {
  if (s.every === "off") return "Off";
  if (s.every === "week" && s.day) return `Every ${cap(s.day)} at ${s.at}`;
  return `Every day at ${s.at}`;
}

function dateIn(at: Date, timezone: string): string {
  const format = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  try {
    return format(timezone);
  } catch {
    return format("UTC");
  }
}

/** When the schedule next comes round, by the registry's own clock. */
export function nextWords(s: BackupSchedule, now: Date): string | null {
  if (s.every === "off" || !s.next_local) return null;
  const [date, time] = s.next_local.split("T");
  const today = dateIn(now, s.timezone);
  const tomorrow = dateIn(new Date(now.getTime() + 86_400_000), s.timezone);
  const on = date === today ? "today" : date === tomorrow ? "tomorrow" : `on ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}`;
  return `next ${on} at ${time}`;
}

/** What keeping so many archives means, from the newest one's size. */
export function keepWords(keep: number | null, b: Backups): { label: string; meta: string | null } {
  if (keep === null) return { label: "Every archive", meta: "until one is removed by hand" };
  const newest = b.archives.find((a) => a.ours);
  return { label: `The last ${keep}`, meta: newest ? `about ${sizeWords(newest.bytes * keep)}` : null };
}

export interface ScheduleDraft {
  every: "off" | "day" | "week";
  at: string;
  day: string;
  keep: number | null;
}

export function draftOf(s: BackupSchedule): ScheduleDraft {
  return { every: s.every, at: s.at, day: s.day ?? "sunday", keep: s.keep };
}

/** A schedule checked before the door is asked, so the refusal is one sentence on the form; the engine checks it again. */
export function draftRule(d: ScheduleDraft): string | null {
  if (d.every === "off") return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.at)) return "a time of day is HH:MM, such as 02:00";
  return null;
}

/** What the door takes: a day only for a week. */
export function draftBody(d: ScheduleDraft): { every: string; at: string; day: string | null; keep: number | null } {
  return { every: d.every, at: d.at, day: d.every === "week" ? d.day : null, keep: d.keep };
}

export function draftChanged(d: ScheduleDraft, s: BackupSchedule): boolean {
  const a = draftBody(d);
  return a.every !== s.every || (a.every !== "off" && a.at !== s.at) || a.day !== (s.every === "week" ? s.day : null) || a.keep !== s.keep;
}

/** The commands a person runs by hand for the buttons. */
export function backupByHand(keep: number | null): string {
  return `nils backup --rehearse${keep !== null ? ` --keep ${keep}` : ""}`;
}

export function rehearseByHand(dir: string | null, name: string): string {
  return `nils verify ${dir ? `${dir}/${name}` : name} --rehearse`;
}

/** Whether the registry has a place with a backup place elsewhere, as section 10.2 rules. */
export function registryRule(places: Place[]): { tone: Tone; words: string } {
  const live = places.filter((p) => p.retired_at === null);
  const own = live.find((p) => p.role === "registry");
  if (!own) return { tone: "caution", words: "no registry place" };
  const named = own.guarantees?.["backup"];
  const backup = typeof named === "string" ? live.find((p) => p.name === named) : undefined;
  if (!backup || backup.role !== "backup" || backup.path === own.path) return { tone: "blocked", words: "no backup place elsewhere" };
  return { tone: "ok", words: "passes the rule" };
}

/** What keeps the registry. */
export function keptBy(status: RegistryStatus, install: Install | null): string {
  if (status.backend === "sqlite") return "SQLite, in files of the registry place";
  const postgres = install?.parts["postgres"];
  if (!postgres) return "Postgres, a server of your own";
  const unit = install?.services.find((s) => s.part === "postgres")?.unit;
  return `Postgres ${postgres.version}, set up here${unit ? `, as ${unit}` : ""}`;
}

/** Whether making a container again or updating keeps the registry, for how this install runs. */
export function livesNote(install: Install): { lead: string; detail: string } {
  const gone = `Deleting ${install.dir} deletes it.`;
  if (install.runtime === "docker" || install.runtime === "podman") {
    return {
      lead: "Kept on this machine, outside every container",
      detail: `The registry's folders are mounted into the containers, so making a container again, taking a new image or updating keeps the registry. ${gone}`,
    };
  }
  return { lead: "Kept in files on this machine", detail: `Updating replaces the programs and keeps the registry. ${gone}` };
}

/** A registry's timestamp as a date a person reads. */
export function madeWords(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
