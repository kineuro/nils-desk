// SPDX-License-Identifier: AGPL-3.0-only
// The walk of the side's desk and engine (record 55 H2, round 4; gate T31:
// every section is reachable from the side), shared by walk.tsx, which draws
// the real desk over them in a browser, and src/sideWalk.test.tsx: one person
// who holds every grant, an engine that serves every door in
// walk.doors.json (Data's Clinical among them) and holds nothing, so each
// page draws its empty state.

import { GRANTS } from "../../src/grants";
import DOORS from "./walk.doors.json";

export { DOORS as WALK_DOORS };

export const WALK_CAPS = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.90" },
    contracts: { openapi: "7" },
    doors: DOORS,
    policy: [],
    auth: "token",
    principal: "admin@site",
    roles: ["admin"],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.9.0" }],
  },
  kvasir: { version: "1.0.0-alpha.8", contracts: {}, models: [], health: {} },
  assistant: { stations: [{ id: "concierge" }] },
  apps: [],
  person: { subject: "admin@site", display_name: "admin", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

/** What an engine that holds nothing answers at a door that lists, by the list's key; null where the walk does not know it, which answers 404 as a door that is not there would. */
export function empty(path: string): unknown {
  const list = (key: string, more: Record<string, unknown> = {}) => ({ [key]: [], count: 0, total: 0, matching: 0, next: null, ...more });
  const now = new Date().toISOString();
  const place = (id: number, name: string, role: string, guarantees: Record<string, unknown> = {}, dataset: unknown = null) => ({ id, name, role, path: `/srv/nils/${name}`, guarantees, probed: null, probed_at: null, retired_at: null, dataset });
  const table: [RegExp, () => unknown][] = [
    // an install that is set up: a root of dataset folders, the registry with its backup place, and a backup this week
    [/^\/api\/places$/u, () => ({ places: [place(1, "scans", "source", {}, { kind: "root" }), place(2, "registry", "registry", { backup: "backups" }), place(3, "backups", "backup"), place(4, "working", "working")] })],
    [/^\/api\/backups$/u, () => ({ dir: "/srv/nils/backups", place: null, count: 1, archives: [{ name: "nils-1.tar", created_at: now, seconds: 2, bytes: 1024, files: 3, epoch: 4, schema_version: 7, backend: "sqlite", ours: true, checked: { ok: true } }], schedule: { every: "day", at: "02:00", day: null, keep: 7, timezone: "UTC", next: null, next_local: null, last: now } })],
    [/^\/api\/jobs$/u, () => list("jobs")],
    [/^\/api\/sources$/u, () => list("sources")],
    [/^\/api\/cohorts$/u, () => list("cohorts")],
    [/^\/api\/review$/u, () => list("items")],
    [/^\/api\/campaigns$/u, () => list("campaigns")],
    [/^\/api\/label-sets$/u, () => list("label_sets")],
    [/^\/api\/models$/u, () => list("models")],
    [/^\/api\/models\/tasks$/u, () => list("tasks")],
    [/^\/api\/pipelines$/u, () => list("pipelines", { names: [], capability: { enabled: true, runtime: { name: "docker", gpu: false } } })],
    [/^\/api\/pipeline-runs$/u, () => list("runs")],
    [/^\/api\/releases$/u, () => list("releases")],
    [/^\/api\/ask\/handles$/u, () => list("handles")],
    [/^\/api\/ask\/selections$/u, () => list("selections")],
    [/^\/api\/ask\/documents$/u, () => list("documents")],
    [/^\/api\/audit$/u, () => list("rows")],
    [/^\/api\/overlays$/u, () => list("overlays")],
    [/^\/api\/linkage\/types$/u, () => list("types")],
    [/^\/api\/linkage\/held$/u, () => list("held")],
    [/^\/api\/review\/rounds$/u, () => ({ current: { pack: "mri", pack_version: "0.9.0", model: null, confirmed: false }, rounds: [] })],
    [/^\/api\/derivatives$/u, () => list("derivatives")],
    [/^\/api\/summary$/u, () => ({ subjects: { total: 0 }, sessions: { total: 0 }, stacks: { total: 0 }, epoch: 4 })],
    [/^\/api\/subjects$/u, () => ({ subjects: [], totals: { subjects: 0, visits: 0, scans: 0, look: 0 }, matched: 0, next: null })],
    // the setup a site does before its pipelines run, and the session schemes (record 55 H2, round 4)
    [/^\/api\/pipelines\/lane$/u, () => ({ cores: 48, memory_gb: 512, gpu_card: 0, places: { output: null, scratch: null } })],
    [/^\/api\/pipelines\/secrets$/u, () => ({ secrets: [{ id: "fs_licence", declared_by: ["recon-all@1"], optional: false, set: false }] })],
    [/^\/api\/session-schemes$/u, () => ({ schemes: [], default: "default" })],
    // the clinical vocabulary, empty until one is loaded (gate T31, step 22.8)
    [/^\/api\/clinical\/vocabulary$/u, () => ({ diseases: [], observation_types: [] })],
  ];
  const hit = table.find(([re]) => re.test(path));
  return hit ? hit[1]() : null;
}
