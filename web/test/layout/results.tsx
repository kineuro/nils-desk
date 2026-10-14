// SPDX-License-Identifier: AGPL-3.0-only
// A finished run and what it made (2026-10-13): the real desk, its top bar
// and side, on Pipelines against a fake engine with a SAMSEG-like run over
// three sessions, two of which made a label map (a lesions set and a
// structures set) and a table, the third its table alone. The Jobs page
// holds the run's job, which opens the run; the Catalog's row says its
// newest run, which opens it; the run's page lists the files by session and
// offers View on the two with a mask, which draws the mask over its scan.
// The engine answers the scan's picture doors and the mask's layer doors as
// the engine serves them (a label pyramid of the scan's own shape), so the
// page draws the real thing where the viewer is the desk's own; the layout
// check swaps it for its stand-in. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/pipelines",
  "GET /api/pipeline-runs",
  "GET /api/pipeline-runs/{id}",
  "GET /api/derivatives",
  "GET /api/derivatives/{id}/parts",
  "GET /api/derivatives/{id}/layers/{stack}/{set}/manifest",
  "GET /api/derivatives/{id}/layers/{stack}/{set}/tiles/{level}/{z}",
  "GET /api/derivatives/{id}/layers/{stack}/{set}/slab/{level}/{z0}-{z1}",
  "GET /api/jobs",
  "GET /api/jobs/{id}",
  "POST /api/jobs",
  "POST /api/jobs/{id}/cancel",
];

const engine = (): Record<string, unknown> => ({
  engine: { name: "nils", version: "1.0.0-alpha.80" },
  contracts: { openapi: "7" },
  doors: DOORS,
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4 },
  packs: [{ name: "mri", version: "1.0.1", main_roles: ["t1w", "flair", "t2w"] }],
  pipelines: { enabled: true },
});
const caps = () => ({
  engine: engine(),
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
});

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");

const IMAGE = `ghcr.io/kineuro/nils-pipelines@sha256:${"4b".repeat(32)}`;
const PIPELINES = [
  { id: 7, name: "samseg-lesions", version: "3", label: "samseg-lesions@3", description: "White matter lesions and brain structures from a T1 and a FLAIR, by SAMSEG.", image: IMAGE, layout: "bids", level: "session", state: "active", standing: "current", parameters: [], inputs: [], outputs: [{ id: "segmentation", kind: "mask" }, { id: "volumes", kind: "table" }], needs: { gpu: "none" }, proposals: [], roles: ["t1w", "flair"] },
  { id: 4, name: "n4-bias-correction", version: "1", label: "n4-bias-correction@1", description: "N4 bias field correction of a T1.", image: IMAGE, layout: "bids", level: "session", state: "active", standing: "current", parameters: [], inputs: [], outputs: [{ id: "corrected", kind: "image" }], needs: { gpu: "none" }, proposals: [] },
];

const UNITS = ["sub-7a8b9c0d_ses-20240312", "sub-1e2f3a4b_ses-20240605", "sub-5c6d7e8f_ses-20250114"];
const unit = (u: string, i: number) => ({ unit: u, state: "over", status: "succeeded", attempts: 1, device: "cpu", cores: 4, memory_mb: 16384, exit_code: 0, started_at: ago(60 - i * 10), finished_at: ago(50 - i * 10) });
const RUN = {
  id: 16,
  pipeline_id: 7,
  pipeline: "samseg-lesions@3",
  job_id: 73,
  handle_id: 25,
  selection: "main@dataset:study-anon",
  status: "done",
  started_at: ago(62),
  finished_at: ago(20),
  runtime: "podman",
  device: "cpu",
  results_digest: "c4",
  summary: { units: { total: 3, succeeded: 3, failed: 0, skipped: 0, unreported: 0 }, derivatives: 5 },
  made: { units: 3, made: 3, failed: 0, skipped: 0, left: 0, nothing: false, line: "3 of 3 made", why: [] },
  error: null,
  units_run: UNITS.map(unit),
};
const N4_RUN = { ...RUN, id: 12, pipeline_id: 4, pipeline: "n4-bias-correction@1", job_id: 60, status: "failed", started_at: ago(3000), finished_at: ago(2990), made: null, summary: { units: { total: 0 } }, error: "the release of the input failed", units_run: [] };
const RUNS = [RUN, N4_RUN];

const NAMES: Record<string, string> = { "2": "Left-Cerebral-White-Matter", "3": "Left-Cerebral-Cortex", "4": "Left-Lateral-Ventricle", "41": "Right-Cerebral-White-Matter", "42": "Right-Cerebral-Cortex", "43": "Right-Lateral-Ventricle" };
const dir = (u: string) => `derivatives/samseg-lesions/16/${u}/${u.split("_")[0]}/${u.split("_")[1]}/anat`;
const mask = (id: number, u: string, stack: number, lesions: number) => ({
  id,
  kind: "mask",
  scope: "session",
  bytes: 101_426 + id,
  sha256: `${id}`.padStart(64, "a"),
  media_type: "application/x-nifti+gzip",
  path: `${dir(u)}/${u}_acq-Sag+3D+MPRAGE_desc-samseg_dseg.nii.gz`,
  run_id: 16,
  check: null,
  grid_link: "same",
  grid_stack_id: stack,
  part_sets: [
    { key: "lesions", words: "Lesions", kind: "components", labels: [99], count: lesions, connectivity: 26 },
    { key: "structures", words: "Structures", kind: "labels", labels: "nonzero", count: 6, names: NAMES },
  ],
});
const table = (id: number, u: string) => ({ id, kind: "table", scope: "session", bytes: 1457 + id, sha256: `${id}`.padStart(64, "b"), media_type: "application/json", path: `${dir(u)}/${u}_acq-Sag+3D+MPRAGE_desc-samseg_volumes.json`, run_id: 16, check: null, grid_link: null, grid_stack_id: null, part_sets: null });
const FILES = [mask(5, UNITS[0], 18, 3), table(6, UNITS[0]), mask(7, UNITS[1], 23, 3), table(8, UNITS[1]), table(10, UNITS[2])];

const JOBS = [
  {
    id: 73,
    kind: "pipeline",
    name: "samseg-lesions@3",
    state: "done",
    started_at: ago(62),
    heartbeat_at: null,
    finished_at: ago(20),
    progress: { run: 16, phase: "run", units: 3, over: 3 },
    error: null,
    failure: null,
    args: { pipeline: "samseg-lesions@3", select: "main@dataset:study-anon", principal: "astrid@site", run: 16, argv: ["run", "samseg-lesions@3", "--select", "main@dataset:study-anon"] },
    result: { run: 16, status: "done", summary: RUN.summary, results_digest: "c4" },
    made: RUN.made,
    taken_up: null,
  },
  {
    id: 74,
    kind: "pipeline",
    name: "samseg-lesions@3",
    state: "running",
    started_at: ago(4),
    heartbeat_at: ago(0),
    finished_at: null,
    progress: { run: 17, phase: "run", units: 3, over: 1, running: 1, done: 1, of: 3 },
    error: null,
    failure: null,
    args: { pipeline: "samseg-lesions@3", select: "main@dataset:ms-2026", principal: "astrid@site", run: 17, argv: ["run", "samseg-lesions@3", "--select", "main@dataset:ms-2026"] },
    result: null,
    made: null,
    taken_up: null,
  },
];

// ---------------------------------------------------------------- the scans and the layers

const TILE = 256;
const LEVELS = 2;
const SHAPE: [number, number, number] = [64, 128, 128];
const ORIGIN = [-64, -64, -32];
const levelShape = (level: number): [number, number, number] => [SHAPE[0], Math.ceil(SHAPE[1] / 2 ** level), Math.ceil(SHAPE[2] / 2 ** level)];

/** The scan's grey: a head-like disc, brighter inside, so a mask has a picture under it. */
function grey(level: number, z: number): Uint16Array {
  const [, ny, nx] = levelShape(level);
  const out = new Uint16Array(nx * ny);
  const f = 2 ** level;
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const r = Math.hypot(x * f - 64, y * f - 64) / 64 + Math.abs(z - 32) / 64;
      out[y * nx + x] = r > 0.9 ? 40 : r > 0.8 ? 700 : r > 0.55 ? 520 + ((x + y) % 7) * 6 : 380 + ((x * 3 + y) % 9) * 5;
    }
  return out;
}

/** What a layer holds at a voxel of level 0: three lesions, or six structures (each side's white matter, cortex and ventricle). */
function at(set: string, x: number, y: number, z: number): number {
  const r = Math.hypot(x - 64, y - 64) / 64 + Math.abs(z - 32) / 64;
  if (set === "lesions") {
    const blobs = [
      [44, 52, 30, 5],
      [80, 60, 34, 4],
      [70, 82, 28, 3],
    ];
    const i = blobs.findIndex(([bx, by, bz, br]) => Math.hypot(x - bx, y - by, (z - bz) * 1.5) <= br);
    return i + 1;
  }
  if (r > 0.8) return 0;
  const left = x < 64;
  const vent = Math.hypot(x - (left ? 54 : 74), (y - 64) * 0.6) < 7 && Math.abs(z - 32) < 14;
  if (vent) return left ? 4 : 43;
  if (r > 0.55) return left ? 3 : 42;
  return left ? 2 : 41;
}

function layerPlane(set: string, level: number, z: number): Uint16Array {
  const [, ny, nx] = levelShape(level);
  const out = new Uint16Array(nx * ny);
  const f = 2 ** level;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) out[y * nx + x] = at(set, x * f, y * f, z);
  return out;
}

function tileOf(plane: Uint16Array, nx: number, ny: number): Uint8Array {
  const b = new ArrayBuffer(8 + nx * ny * 2);
  const v = new DataView(b);
  v.setUint32(0, nx, true);
  v.setUint32(4, ny, true);
  for (let i = 0; i < nx * ny; i++) v.setUint16(8 + i * 2, plane[i], true);
  return new Uint8Array(b);
}

/** [u32 count][u32 offset...][parts...], each offset from the container's start. */
function pack(parts: Uint8Array[]): Uint8Array {
  const head = 4 + 4 * parts.length;
  const out = new Uint8Array(head + parts.reduce((a, p) => a + p.byteLength, 0));
  const v = new DataView(out.buffer);
  v.setUint32(0, parts.length, true);
  let o = head;
  parts.forEach((p, i) => {
    v.setUint32(4 + i * 4, o, true);
    out.set(p, o);
    o += p.byteLength;
  });
  return out;
}

const slab = (level: number, z0: number, z1: number, of: (level: number, z: number) => Uint16Array): Uint8Array => {
  const [, ny, nx] = levelShape(level);
  return pack(Array.from({ length: z1 - z0 }, (_, i) => pack([tileOf(of(level, z0 + i), nx, ny)])));
};

const levelShapes = Array.from({ length: LEVELS }, (_, level) => ({ level, shape: levelShape(level), tiles: [1, 1] }));
const manifestOf = (stack: number) => ({ codec: "htj2k", tile: TILE, levels: LEVELS, shape: SHAPE, spacing: [1, 1, 1], dtype: "uint16", window: { center: 450, width: 800 }, orientation: [1, 0, 0, 0, 1, 0], orientation_known: true, origin: ORIGIN, frame: true, plane: "axial", oblique: false, step: [0, 0, 1], level_shapes: levelShapes, stack });
const layerManifestOf = (derivative: number, stack: number, set: string) => ({ stack, derivative, sha256: "f".repeat(64), set, kind: set === "lesions" ? "components" : "labels", values: set === "lesions" ? "part" : "label", link: "same", codec: "htj2k", tile: TILE, levels: LEVELS, shape: SHAPE, level_shapes: levelShapes, dtype: "uint16", voxels: 1, built_at: "", scan_built_at: "", grid_stack: stack });

// ---------------------------------------------------------------- the doors

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const bin = (b: Uint8Array) => Promise.resolve(new Response(b, { status: 200, headers: { "content-type": "application/x-nils-tiles", "X-Nils-Codec": "htj2k" } }));
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  if (!path.startsWith("/api/") && !path.startsWith("/desk/")) return realFetch(input, init);
  let m: RegExpExecArray | null;
  if (path === "/desk/capabilities") return json(200, caps());
  if (path === "/api/capabilities") return json(200, engine());
  if (path === "/api/pipelines") return json(200, { pipelines: PIPELINES, capability: { enabled: true, runtime: { name: "podman", version: "5.4" } } });
  if (path === "/api/pipeline-runs") return json(200, { runs: RUNS, limit: 50 });
  if ((m = /^\/api\/pipeline-runs\/(\d+)$/u.exec(path))) {
    const r = RUNS.find((x) => x.id === Number(m![1]));
    return r ? json(200, r) : json(404, { error: "no such run" });
  }
  if (path === "/api/derivatives") return json(200, { derivatives: url.searchParams.get("run") === "16" ? FILES : [] });
  if ((m = /^\/api\/jobs\/(\d+)$/u.exec(path))) return json(200, JOBS.find((j) => j.id === Number(m![1])) ?? { id: Number(m[1]), state: "done", started_at: ago(62) });
  if (path === "/api/jobs") {
    const listed = url.searchParams.has("all") ? JOBS : JOBS.filter((j) => j.state === "running" || j.state === "queued");
    return json(200, { count: listed.length, jobs: listed });
  }
  if ((m = /^\/api\/instances\/(\d+)\/manifest$/u.exec(path))) return json(200, manifestOf(Number(m[1])));
  if ((m = /^\/api\/instances\/\d+\/slab\/(\d+)\/(\d+)-(\d+)$/u.exec(path))) return bin(slab(Number(m[1]), Number(m[2]), Number(m[3]), grey));
  if ((m = /^\/api\/derivatives\/(\d+)\/layers\/(\d+)\/([a-z]+)\/manifest$/u.exec(path))) return json(200, layerManifestOf(Number(m[1]), Number(m[2]), m[3]));
  if ((m = /^\/api\/derivatives\/\d+\/layers\/\d+\/([a-z]+)\/slab\/(\d+)\/(\d+)-(\d+)$/u.exec(path))) {
    const set = m[1];
    return bin(slab(Number(m[2]), Number(m[3]), Number(m[4]), (level, z) => layerPlane(set, level, z)));
  }
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
