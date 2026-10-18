// SPDX-License-Identifier: AGPL-3.0-only
// The import dialogs' layout check (Wave 7b, section 18): the real desk, its
// top bar and side, on Data > Pseudonyms and Data > Clinical against a fake
// engine, so mapdialog.pw.ts can choose a made-up file in each dialog and
// measure that the columns of a map are shown by their shape and counts at a
// laptop's width and at a phone's, and that no value of the file is on the
// page. The fake engine words its refusals as the real one does, with the
// file's own cell in them, to show the desk draws none of them. Every name
// and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";

const DOORS = [
  "GET /api/capabilities",
  "GET /api/jobs",
  "GET /api/sources",
  "GET /api/linkage/types",
  "POST /api/linkage/types",
  "POST /api/linkage/imports",
  "GET /api/clinical/vocabulary",
  "POST /api/clinical/vocabulary",
  "POST /api/clinical/import",
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
  packs: [{ name: "mri", version: "1.0.1" }],
});
const caps = () => ({
  engine: engine(),
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
});

const TYPES = [
  { id: 1, name: "personnummer", label: "ID that is the same everywhere", description: "the national number", identifying: true, identifiers: 4836, subjects: 4836 },
  { id: 2, name: "study-id", description: "the study's own number", identifiers: 420, subjects: 420 },
  { id: 3, name: "patient-id", description: "what PatientID holds", identifiers: 1208, subjects: 1190 },
];

const VOCABULARY = {
  diseases: [{ id: 1, name: "MS", code: "G35", description: null, types: [] }],
  observation_types: [{ id: 1, name: "EDSS", category: "scale", value_type: "numeric", unit: null, primary: true, sensitive: false }],
};

/** The engine's refusals of rows, worded as it words them: with the cell that did not read, and the name that was not found. */
const REFUSED = {
  "scan_date: 2021-13-45 is not a day of the calendar": 1,
  "scan_date: 2019-02-31 is not a day of the calendar": 1,
  "edss: 7.5x is not a number": 1,
  "labno: 12ab4 is not an integer": 2,
  "a subject the registry does not know": 3,
  "no cohort named Zephyr clinic": 2,
};

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  if (path === "/desk/capabilities") return json(200, caps());
  if (path === "/api/capabilities") return json(200, engine());
  if (path === "/api/linkage/types") return json(200, TYPES);
  if (path === "/api/linkage/imports" && method === "POST") {
    const rows = Array.isArray(body.rows) ? body.rows.length : 0;
    return json(200, {
      rows,
      subjects: { named: 420, known: 380, new: 40 },
      identifiers: { filed: 1260, known: 1180, new: 80, types_new: 0 },
      held_released: { released: 0, of: 0 },
      merges: [],
      conflicts: [],
    });
  }
  if (path === "/api/clinical/vocabulary" && method === "GET") return json(200, VOCABULARY);
  if (path === "/api/clinical/import" && method === "POST") {
    // as the engine does: a column the mapping names must be in the file's first line, and the refusal lists that line as it is
    const first = String(body.csv).split("\n", 1)[0].split(",").map((h) => h.trim());
    if (!first.includes("scan_date")) return json(400, { error: `csv: the file has no column scan_date; its columns are ${first.join(", ")}` });
    return json(200, {
      target: "event",
      applied: false,
      rows: 1300,
      added: 1180,
      skipped: 100,
      updated: 0,
      superseded: 0,
      reviewed: 0,
      refused: REFUSED,
      changes: 1180,
      samples: [{ row: 5, subject: "3e1b77c0a9d2f400", verdict: "refused", detail: "scan_date: 2021-13-45 is not a day of the calendar" }],
    });
  }
  if (path === "/api/sources") return json(200, { count: 0, window_days: 30, sources: [], rates: null });
  if (path === "/api/jobs") return json(200, { count: 0, jobs: [] });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
