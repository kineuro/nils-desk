// SPDX-License-Identifier: AGPL-3.0-only
// A capabilities document for the tests of wave 45's pages: an engine serving
// the doors named, and a person holding the grants named, so each page can be
// drawn against an engine with and without each door it reads.

import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";

export function capsWith(doors: string[], grants: Grant[], packs: { name: string; version: string }[] = [{ name: "mri", version: "0.4.0" }]): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.38" },
      contracts: { openapi: "7", suite: "3" },
      doors: ["GET /api/capabilities", ...doors],
      policy: [],
      auth: "off",
      principal: "someone",
      roles: [],
      registry: { epoch: 1 },
      packs,
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants, detail: "quasi", groups: [] },
    desk: { version: "1.0.0-alpha.38", mode: "off", contracts: { openapi: "7", suite: "3" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}
