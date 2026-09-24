// SPDX-License-Identifier: AGPL-3.0-only
// A capabilities document for the tests beside the Campaigns pages: an
// engine at OpenAPI 7 with the campaign doors of record 42, and a person whose
// grants and principal each test chooses. The campaign fixtures under
// test/fixtures/campaigns were read from an engine of that version over a
// synthetic registry (nils synth): three people, alice and bob rating, carol
// adjudicating and closing.

import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";

export const DOORS = [
  "GET /api/campaigns",
  "POST /api/campaigns",
  "GET /api/campaigns/{id}",
  "GET /api/campaigns/{id}/answers",
  "POST /api/campaigns/{id}/claim",
  "POST /api/campaigns/{id}/assignments/{assignment}/answer",
  "POST /api/campaigns/{id}/assignments/{assignment}/release",
  "POST /api/campaigns/{id}/items/{item}/metric",
  "POST /api/campaigns/{id}/close",
  "POST /api/campaigns/{id}/export",
  "GET /api/label-sets",
  "POST /api/label-sets",
  "GET /api/label-sets/{id}",
  "POST /api/decisions/commit",
];

export const RATER: Grant[] = ["campaigns:see", "campaigns:work", "review:see", "review:work", "data:see", "query:see"];
export const ADMIN: Grant[] = [...RATER, "pipelines:see", "models:see"];

export function capsFor(opts: { grants?: Grant[]; principal?: string; doors?: string[]; detail?: "plain" | "quasi" | "sensitive"; apps?: Capabilities["apps"]; engine?: Record<string, unknown> } = {}): Capabilities {
  const principal = opts.principal ?? "carol@walk";
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.37" },
      contracts: { openapi: "7" },
      doors: opts.doors ?? DOORS,
      policy: [],
      auth: "token",
      principal,
      roles: [],
      registry: { epoch: 4 },
      packs: [{ name: "mri", version: "0.4.0" }],
      ...(opts.engine ?? {}),
    },
    kvasir: null,
    assistant: null,
    apps: opts.apps ?? [],
    person: { subject: principal, display_name: principal.split("@")[0], grants: opts.grants ?? ADMIN, detail: opts.detail ?? "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}
