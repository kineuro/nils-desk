// SPDX-License-Identifier: AGPL-3.0-only
// The numbers at the head of the Places, Database and Identity pages.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import type { Backups } from "./database";
import { databaseStats, identityStats, placeStats } from "./stats";

function place(over: Partial<Place>): Place {
  return { id: 1, name: "p", role: "source", path: "/srv/p", guarantees: {}, probed: { exists: true, directory: true }, probed_at: null, retired_at: null, ...over };
}

describe("the Places page's numbers", () => {
  it("count the places, the sources and those needing attention, and name the least room", () => {
    const stats = placeStats(
      [
        place({ id: 1, name: "scans", probed: { exists: true, directory: true, free_bytes: 5e9 } }),
        place({ id: 2, name: "exports", role: "export", guarantees: { snapshots: true }, probed: { exists: true, directory: true, free_bytes: 2e9 } }),
        place({ id: 3, name: "old", role: "export", retired_at: "2026-09-01T00:00:00Z" }),
      ],
      false,
    );
    expect(stats).toEqual([
      { label: "Places", value: "2" },
      { label: "Sources", value: "1" },
      { label: "Need attention", value: "1", tone: "caution" },
      { label: "Least room", value: "2.0 GB, exports" },
    ]);
  });
});

describe("the Database page's numbers", () => {
  const now = new Date("2026-09-13T12:00:00Z");
  const backups: Backups = {
    dir: "/data/backups",
    place: null,
    count: 1,
    archives: [{ name: "a", created_at: "2026-09-13T11:00:00Z", seconds: 2, bytes: 4_000_000, files: 4, epoch: 1, schema_version: 37, backend: "sqlite", ours: true, checked: { at: "2026-09-13T11:00:03Z", ok: true, rehearsed: true } }],
    schedule: { every: "week", at: "03:00", day: "sunday", keep: 8, timezone: "UTC", next: null, next_local: null, last: null },
  };
  it("say what keeps the registry, the last backup, the schedule and the archives", () => {
    expect(databaseStats(backups, "sqlite", now)).toEqual([
      { label: "Kept by", value: "SQLite" },
      { label: "Last backup", value: "an hour ago", tone: "ok" },
      { label: "Schedule", value: "Every Sunday at 03:00" },
      { label: "Archives", value: "1, 4.0 MB" },
    ]);
    expect(databaseStats({ ...backups, archives: [] }, null, now)[1]).toEqual({ label: "Last backup", value: "none yet", tone: "caution" });
    expect(databaseStats(null, "postgres", now)).toEqual([{ label: "Kept by", value: "Postgres" }]);
  });
});

describe("the Identity page's numbers", () => {
  const desk = (mode: "off" | "local" | "oidc", origin: string): Capabilities["desk"] => ({
    version: "1.0.0-alpha.16",
    mode,
    contracts: {},
    engine_reachable: true,
    contract_mismatch: null,
    login: null,
    signed_in: true,
    settings: { origin, engine_url: "", kvasir_url: null, assistant_url: null, session_hours: 12, token_minutes: 15, cli_token_hours: 24, export: "off", store: "", retention: "", engine_flags: null },
  });
  const caps = (d: Capabilities["desk"]) => ({ desk: d }) as Capabilities;
  it("say how people sign in, who they are, and a desk open to the network with nobody signing in", () => {
    expect(identityStats(caps(desk("local", "https://desk.example.org")), { users: [], entitlements: [], sessions_open: 3 })).toEqual([
      { label: "Sign-in", value: "Local accounts", tone: undefined },
      { label: "People", value: "0" },
      { label: "Signed in now", value: "3" },
      { label: "The desk answers", value: "The network", tone: undefined },
    ]);
    expect(identityStats(caps(desk("off", "https://desk.example.org")), null)).toEqual([
      { label: "Sign-in", value: "No sign-in", tone: "caution" },
      { label: "The desk answers", value: "The network", tone: "caution" },
    ]);
  });
});
