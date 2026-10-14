// SPDX-License-Identifier: AGPL-3.0-only
// The real desk on a lab engine (T32, record 55 H3): the desk's own pages in
// a real browser, their engine doors proxied to a lab engine over a
// throwaway registry with the lab person's token (vite.layout.config.ts,
// LAB_ENGINE and LAB_TOKEN), and the desk's capabilities made from the
// engine's own. lab.pw.ts opens Review's one list, the make dialog, Browse
// and a cohort's heatmap on it and takes their pictures; it is skipped
// unless a lab is named.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";

const real = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.origin);
  if (u.pathname === "/desk/capabilities") {
    const engine = (await (await real("/api/capabilities")).json()) as { principal: string; grants: string[]; detail: string };
    return new Response(
      JSON.stringify({
        engine,
        kvasir: null,
        assistant: null,
        apps: [],
        // the lab registry has no places, so the install's setup is left out of the look: the person is not shown Setup
        person: { subject: engine.principal, display_name: engine.principal.split("@")[0], grants: engine.grants.filter((g) => !g.startsWith("install:")), detail: engine.detail, groups: [] },
        desk: { version: "lab", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (u.pathname.startsWith("/desk/")) return new Response(JSON.stringify({ error: "no desk server in the lab look" }), { status: 404 });
  return real(input, init);
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
