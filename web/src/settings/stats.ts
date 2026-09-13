// SPDX-License-Identifier: AGPL-3.0-only
// The few numbers at the head of a Settings page: what a person looks for
// first, before the tables and the forms. Each is worked out from what the
// page already read.

import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import { agoWords } from "../ui/kept";
import { checkedTag, scheduleWords, sizeWords, type Backups } from "./database";
import { reachWords, type Users } from "./identity";
import { placeState } from "./places";

export interface Stat {
  label: string;
  value: string;
  tone?: "ok" | "caution" | "blocked";
}

/** The Places page: how many, the sources, how many need attention, and the place with least room. */
export function placeStats(places: Place[], containers: boolean): Stat[] {
  const live = places.filter((p) => p.retired_at === null);
  const need = live.filter((p) => {
    const tone = placeState(p, places, containers).tone;
    return tone === "caution" || tone === "blocked";
  }).length;
  const free = (p: Place) => p.probed?.["free_bytes"];
  const tightest = live.filter((p) => typeof free(p) === "number").sort((a, b) => (free(a) as number) - (free(b) as number))[0];
  return [
    { label: "Places", value: String(live.length) },
    { label: "Sources", value: String(live.filter((p) => p.role === "source").length) },
    { label: "Need attention", value: String(need), tone: need > 0 ? "caution" : "ok" },
    { label: "Least room", value: tightest ? `${sizeWords(free(tightest) as number)}, ${tightest.name}` : "not measured" },
  ];
}

/** The Database page: what keeps the registry, the last backup and how it checked, the schedule, and the archives kept. */
export function databaseStats(b: Backups | null, backend: string | null, now: Date): Stat[] {
  const out: Stat[] = [{ label: "Kept by", value: backend === null ? "the engine" : backend.startsWith("postgres") ? "Postgres" : "SQLite" }];
  if (!b) return out;
  const ours = b.archives.filter((a) => a.ours);
  const newest = ours[0];
  const at = newest?.created_at ? Date.parse(newest.created_at) : Number.NaN;
  const checked = newest ? checkedTag(newest).tone : null;
  out.push({ label: "Last backup", value: Number.isNaN(at) ? "none yet" : agoWords(at, now.getTime()), tone: !newest ? "caution" : checked === "ok" ? "ok" : checked === "blocked" ? "blocked" : undefined });
  out.push({ label: "Schedule", value: b.schedule.every === "off" ? "Off" : scheduleWords(b.schedule) });
  out.push({ label: "Archives", value: ours.length === 0 ? "none" : `${ours.length}, ${sizeWords(ours.reduce((n, a) => n + a.bytes, 0))}` });
  return out;
}

/** The Identity page: how people sign in, how many the desk keeps and how many are signed in, and where the desk answers. */
export function identityStats(caps: Capabilities, users: Users | null): Stat[] {
  const mode = caps.desk.mode;
  const origin = caps.desk.settings?.origin ?? "";
  const local = origin === "" || reachWords(origin).local;
  const open = mode === "off" && !local ? "caution" : undefined;
  const out: Stat[] = [{ label: "Sign-in", value: mode === "local" ? "Local accounts" : mode === "oidc" ? "Single sign-on" : "No sign-in", tone: open }];
  if (mode === "local" && users) {
    out.push({ label: "People", value: String(users.users.length) });
    if (typeof users.sessions_open === "number") out.push({ label: "Signed in now", value: String(users.sessions_open) });
  }
  out.push({ label: "The desk answers", value: local ? "This machine" : "The network", tone: open });
  return out;
}
