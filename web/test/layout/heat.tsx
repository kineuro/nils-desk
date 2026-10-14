// SPDX-License-Identifier: AGPL-3.0-only
// A cohort's main scans, visit by visit (Wave 7a, record 55 H3), on a page of
// the desk's shell, against a fake picks door: 600 made-up members, a page
// of 24, each with one to twelve sessions, three roles, some sessions
// doubted, missing or picked by a person. heat.pw.ts measures it at a
// laptop's width and a phone's. Every name and number here is made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import { HeatMap } from "../../src/data/HeatMap";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const ROLES = ["t1w", "flair", "t2w"];
const state = (r: () => number) => {
  const x = r();
  return x < 0.07 ? "missing" : x < 0.1 ? "doubted" : "picked";
};
function page(after: number | null) {
  const r = rng(20261013 + (after ?? 0));
  const start = after === null ? 0 : after - 1000 + 1;
  const subjects = Array.from({ length: 24 }, (_, i) => ({
    id: 1000 + start + i,
    code: (0x7c3e9a10 + (start + i) * 7919).toString(16) + "f2a41b0c",
    sessions: Array.from({ length: 1 + Math.floor(r() * r() * 12) }, (_, j) => ({
      session: 5000 + (start + i) * 20 + j,
      studies: [9000 + j],
      label: `ses-20${18 + j}0301`,
      number: j + 1,
      roles: Object.fromEntries(ROLES.map((role) => [role, (() => { const s = state(r); return { state: s, stack: s === "missing" ? null : 1, by: s === "missing" ? null : r() < 0.05 ? "person" : "rules" }; })()])),
    })),
  }));
  return { cohort: { name: "ms-followup", id: 4 }, detail: "quasi", roles: ROLES, totals: { t1w: { picked: 2870, doubted: 61, missing: 204 }, flair: { picked: 2511, doubted: 12, missing: 612 }, t2w: { picked: 2003, doubted: 0, missing: 1132 } }, total: 600, count: 24, subjects, next: start + 24 < 600 ? 1000 + start + 23 : null };
}
window.fetch = ((input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const after = url.searchParams.get("after");
  return Promise.resolve(new Response(JSON.stringify(page(after ? Number(after) : null)), { status: 200, headers: { "content-type": "application/json" } }));
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="page">
      <section className="data">
        <h3 className="eyebrow">Main scans, visit by visit</h3>
        <HeatMap cohort="ms-followup" />
      </section>
    </main>
  </StrictMode>,
);
