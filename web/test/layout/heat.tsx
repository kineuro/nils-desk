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
// a layer (record 55, decision 6): each session's scans by value, the value of each role's scan picked, made up
const VALUES: Record<string, string[]> = { body_region: ["head", "spine"], body_part: ["brain", "brain-neck", "spine"], post_contrast: ["pre", "post", "undetermined"] };
function layered(p: ReturnType<typeof page>, layer: string) {
  const values = VALUES[layer];
  return {
    ...p,
    subjects: p.subjects.map((s) => ({
      ...s,
      sessions: s.sessions.map((v) => {
        const r = rng(v.session);
        const main = values[r() < 0.85 ? 0 : 1 + Math.floor(r() * (values.length - 1))];
        const scans: Record<string, number> = { [main]: 4 + Math.floor(r() * 8) };
        if (r() < 0.3) scans[values[values.length - 1]] = 1;
        return {
          ...v,
          layer: { scans, none: r() < 0.2 ? 1 : 0, ...(layer === "post_contrast" ? { prior_72h: 0 } : {}) },
          roles: Object.fromEntries(Object.entries(v.roles).map(([role, c]) => [role, { ...c, layer: c.state === "missing" || r() < 0.05 ? null : main }])),
        };
      }),
    })),
    layer: { layer, operation: layer === "post_contrast" ? "post_contrast" : "body_part", values, step: { step: layer === "post_contrast" ? "post_contrast" : "body_part", state: "waiting", job: null, run: null, started_at: null, finished_at: null, progress: null, served: true, answered: 0, look: 0, of: 9000, jobs: [], refusal: null } },
  };
}
window.fetch = ((input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const after = url.searchParams.get("after");
  const layer = url.searchParams.get("layer");
  const p = page(after ? Number(after) : null);
  return Promise.resolve(new Response(JSON.stringify(layer ? layered(p, layer) : p), { status: 200, headers: { "content-type": "application/json" } }));
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
