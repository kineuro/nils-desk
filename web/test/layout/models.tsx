// SPDX-License-Identifier: AGPL-3.0-only
// Models under Pipelines (record 55 D4, spec sections 10.2 and 13.1): the real
// desk, its top bar and side, on Pipelines, Models against a fake engine that
// serves body part's task with three models side by side (the cascade an
// admin chose, its head promoted beside it and an older version retired), the
// coarse mode's task answered by a certificate, and a registered model whose
// card lacks fields. Choose and Back to default go through the fake door,
// which moves the pointer as the engine's does. Record 55 ruling 22 (b): a
// System 1 task whose model a certificate citing its graded run names, and
// a newer one a person certifies through the fake certificate door. Every
// name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = ["GET /api/capabilities", "GET /api/jobs", "GET /api/pipelines", "GET /api/models", "GET /api/models/tasks", "GET /api/models/{id}", "POST /api/models", "POST /api/models/{id}/admit", "POST /api/models/{id}/promote", "POST /api/models/{id}/retire", "POST /api/models/choose", "GET /api/review", "POST /api/certificates"];

const engine = (): Record<string, unknown> => ({
  engine: { name: "nils", version: "1.0.0-alpha.80" },
  contracts: { openapi: "7" },
  doors: DOORS,
  policy: [],
  auth: "token",
  principal: "astrid@site",
  roles: [],
  registry: { epoch: 4 },
  packs: [{ name: "mri", version: "1.0.1" }],
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

const D = (c: string) => `sha256:${c.repeat(64)}`;
const GOLD = { label_set: D("c"), name: "bodypart-gold-r7", rows: 3659 };
const CLAIMS = [
  { claim: "fine E1 against the certified model", value: 0.99746, bound: 0.99674, n: 17709, evidence: "ims-a522a-bp" },
  { claim: "coarse E1 against the certified model", value: 0.99836, bound: 0.99777, n: 17709, evidence: "ims-a522a-bp" },
  { claim: "fine error where it answers", value: 0.0119, bound: 0.0169, n: 253, evidence: "bodypart-r7-read" },
];
const model = (id: number, name: string, version: string, task: string, state: string, card: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  id,
  name,
  version,
  kind: "head",
  digest: D(String(id)),
  task,
  slot: "site",
  state,
  card: { name, version, task, ...card },
  threshold: 0.897,
  registered_by: "astrid@site",
  registered_at: "2026-10-10T09:00:00Z",
  admitted_at: state === "registered" ? null : "2026-10-11T09:00:00Z",
  promoted_at: state === "promoted" ? "2026-10-12T09:00:00Z" : null,
  retired_at: state === "retired" ? "2026-10-12T09:00:00Z" : null,
  complete: true,
  missing: [],
  equivalence_measured: null,
  events: [{ transition: "registered", by: "astrid@site", at: "2026-10-10T09:00:00Z" }],
  ...more,
});
const MODELS = [
  model(1, "bodypart-fusion", "r6", "axis:body_part", "retired", { gpu: "none", tested: CLAIMS.slice(2), speed: { cpu: { stacks_per_second: 7.3, hardware: "64 cores", evidence: "bp1h-thru" }, gpu: null }, trained_on: { ...GOLD, name: "bodypart-gold-r6" } }),
  model(2, "bodypart-fusion", "r7", "axis:body_part", "promoted", { gpu: "none", tested: CLAIMS.slice(2), speed: { cpu: { stacks_per_second: 7.3, hardware: "64 cores", evidence: "bp1h-thru" }, gpu: null }, trained_on: GOLD }),
  model(3, "bodypart-cascade", "r7-fast", "axis:body_part", "admitted", { kind: "pass", gpu: "optional", tested: CLAIMS.slice(0, 2), speed: { cpu: { stacks_per_second: 34.3, hardware: "64 cores", evidence: "ims-a523e-bp" }, gpu: { stacks_per_second: 117.2, hardware: "one 96 GB card", evidence: "ims-a523e-bp" } }, equivalence: { class: "I", tolerance: 0.001, set: "four blocks", evidence: "ims-a523e-bp" }, trained_on: GOLD }, { kind: "pass", equivalence_measured: { class: "I", tolerance: 0.001, n: 2453, changes: 0, flips: 0, max_difference: 0, set: "block 1" } }),
  model(4, "bodypart-fusion-coarse", "r7", "axis:body_region", "promoted", { gpu: "none", tested: [{ claim: "coarse accuracy", value: 0.9827, bound: 0.9655, n: 294, evidence: "bodypart-r8-read" }], speed: { cpu: { stacks_per_second: 7.3, hardware: "64 cores", evidence: "bp1h-thru" }, gpu: null }, trained_on: GOLD }),
  model(5, "bodypart-coarse-next", "r8", "axis:body_region", "registered", { gpu: "optional" }, { complete: false, missing: ["trained_on", "tested", "speed", "equivalence", "intended_use", "limits"] }),
  model(6, "s1c", "allow-2", "system1", "admitted", { kind: "pass", gpu: "none", tested: [{ claim: "wrong among accepted stacks under held-out damage", value: 0.00018, bound: 0.00087, n: 5482, evidence: "s1-grade-7" }] }, { kind: "pass" }),
  model(7, "s1c", "allow-3", "system1", "admitted", { kind: "pass", gpu: "none" }, { kind: "pass" }),
];
type Cert = { id: number; sample: string; model_ids: number[]; result: Record<string, unknown>; created_by: string; created_at: string; cites: string; evidence: Record<string, unknown>; unseals: boolean; words: string };
const cite = (id: number, m: (typeof MODELS)[number], evidence: Record<string, unknown>, result: Record<string, unknown>): Cert => ({
  id,
  sample: `evidence:${String(evidence.run)}`,
  model_ids: [m.id],
  result: { ...result, confidence: 0.95, method: "exact one-sided Clopper-Pearson", passes: true },
  created_by: "astrid@site",
  created_at: "2026-10-14T18:00:00Z",
  cites: "evidence",
  evidence,
  unseals: false,
  words: `certificate ${id} cites the graded run ${String(evidence.run)} (manifest ${String(evidence.manifest_sha256).slice(0, 19)}, plan ${String(evidence.plan_commit).slice(0, 12)}): ${String(result.errors)} of ${String(result.n)} wrong, bound 0.087 % at bar 1.00 %`,
});
const certs: Record<number, Cert> = {
  6: cite(4, MODELS[5], { run: "s1-grade-7", manifest_sha256: D("7"), plan_commit: "83a75e5875ce4e1b", model_digest: D("6"), equivalence: { run: "s1-serve-2", manifest_sha256: D("8"), class: "I" } }, { bar: 0.01, n: 5482, errors: 1, bound: 0.000865, coverage: 0.892, test: "T19" }),
};
let chosen: Record<string, { model_id: number; by: string; certificate_id?: number; chosen_by?: string; chosen_at?: string; why?: string }> = {
  "axis:body_part": { model_id: 3, by: "site", chosen_by: "astrid@site", chosen_at: "2026-10-13T09:00:00Z", why: "the fast path" },
  "axis:body_region": { model_id: 4, by: "certificate", certificate_id: 3 },
  system1: { model_id: 6, by: "certificate", certificate_id: 4 },
};
const DEFAULTS: typeof chosen = { "axis:body_part": { model_id: 2, by: "promoted" }, "axis:body_region": { model_id: 4, by: "certificate", certificate_id: 3 } };
const withChosen = (m: (typeof MODELS)[number]) => ({ ...m, chosen: chosen[m.task]?.model_id === m.id, certificate: certs[m.id] ?? null });
const entry = (task: string) => ({ task, slot: "site", chosen: chosen[task] ?? null, models: MODELS.filter((m) => m.task === task).map(withChosen).reverse() });

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  if (path === "/desk/capabilities") return json(200, caps());
  if (path === "/api/capabilities") return json(200, engine());
  if (path === "/api/models") return json(200, { count: MODELS.length, models: MODELS.map(withChosen) });
  if (path === "/api/models/tasks") return json(200, { tasks: ["axis:body_part", "axis:body_region", "system1"].map(entry) });
  if (path === "/api/certificates" && method === "POST") {
    // the door's own checks, in short: one model, its own artifact, a result under its bar
    const m = MODELS.find((x) => x.id === (body.models as number[] | undefined)?.[0]);
    const evidence = body.evidence as Record<string, unknown> | undefined;
    const result = body.result as Record<string, unknown> | undefined;
    if (!m || !evidence || !result) return json(400, { error: "sample: the sealed sample it measured; or evidence: the graded run it cites" });
    if (evidence.model_digest !== m.digest) return json(400, { error: "a certificate citing a graded run certifies the one model whose artifact the run graded" });
    if (Number(result.errors) * 100 > Number(result.n)) return json(409, { error: `${String(result.errors)} wrong of ${String(result.n)} gives a bound above the bar ${String(result.bar)}: a run that missed its bar certifies nothing` });
    const c = cite(5, m, evidence, result);
    certs[m.id] = c;
    return json(201, c);
  }
  if (path === "/api/models/choose" && method === "POST") {
    if (body.model === null) {
      const task = String(body.task);
      chosen = { ...chosen, [task]: DEFAULTS[task] };
      return json(200, entry(task));
    }
    const m = MODELS.find((x) => x.id === body.model);
    if (!m) return json(404, { error: `no model ${String(body.model)}` });
    if (m.state !== "admitted" && m.state !== "promoted") return json(409, { error: `model ${m.id} (${m.name}@${m.version}) is ${m.state}; only an admitted or promoted model is chosen` });
    chosen = { ...chosen, [m.task]: { model_id: m.id, by: "site", chosen_by: "astrid@site", chosen_at: new Date().toISOString(), why: typeof body.why === "string" ? body.why : undefined } };
    return json(200, entry(m.task));
  }
  const one = /^\/api\/models\/(\d+)$/u.exec(path);
  if (one) {
    const m = MODELS.find((x) => x.id === Number(one[1]));
    return m ? json(200, withChosen(m)) : json(404, { error: "no such model" });
  }
  if (path === "/api/jobs") return json(200, { count: 0, jobs: [] });
  if (path === "/api/pipelines") return json(200, { pipelines: [], capability: { enabled: true } });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
