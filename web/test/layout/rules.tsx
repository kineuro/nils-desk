// SPDX-License-Identifier: AGPL-3.0-only
// The Rules page's layout check (record 56, sections 6.4 and 6.5): the real
// desk, its top bar and side, on Review, Rules against a fake engine whose
// doors answer as the contract has them: a pack of four axes, its quality
// (two pairs it cannot rank, three pairs of overrides, System 1 not served),
// three proposals (a scoped change breaking nothing, a pack edit that breaks
// three settled answers, one adopted and re-sorted), and a change's effect
// rehearsed. Adopting a proposal answers its re-sort's job; the proposal
// reads as re-sorting once, then as done with what the re-sort did. rules.pw.ts
// opens it at a laptop's width and a phone's. Every name and number here is
// made up.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import "../../src/shell.css";
import { GRANTS } from "../../src/grants";
import { BATCHES, EFFECT_RAW, PACK_RAW, PROPOSAL_ADOPTED, PROPOSAL_DOORS, PROPOSAL_FULL, PROPOSAL_SCOPED, PROPOSALS_LIST, QUALITY_RAW, SOURCES } from "../../src/review/rules.fixture";

const DOORS = ["GET /api/capabilities", ...PROPOSAL_DOORS];

const caps = {
  engine: { engine: { name: "nils", version: "1.0.0-alpha.81" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "token", principal: "astrid@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "1.2.0" }] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
};

const FULL: Record<number, Record<string, unknown>> = { 12: PROPOSAL_FULL, 13: PROPOSAL_SCOPED, 9: PROPOSAL_ADOPTED };
/** The proposals adopted here, and how often each was read since. */
const adopted = new Map<number, number>();

function proposal(id: number): Record<string, unknown> | null {
  const p = FULL[id];
  if (!p) return null;
  if (!adopted.has(id)) return p;
  const reads = (adopted.get(id) ?? 0) + 1;
  adopted.set(id, reads);
  const version = p.kind === "pack" ? { pack: "mri", version: "1.2.1", from: "1.2.0", tag: "pack-mri-v1.2.1", state: "to_release", kept: "packs.versions/mri/1.2.0", files: ["axes/base.yml"] } : null;
  if (reads < 2) return { ...p, status: "adopted", version, job: { id: 812, state: "running" }, applied: { state: "running", expected: { moved: 50 }, measured: null } };
  return {
    ...p,
    status: "adopted",
    version,
    job: { id: 812, state: "done" },
    applied: { state: "done", expected: { moved: 50 }, measured: { scope: ["pack"], stacks: 1003, moved: { stacks: 50, axes: { base: 50 } }, before: { base: { T2w: 300, FLAIR: 120 } }, after: { base: { T2w: 253, FLAIR: 170 } }, job: 812, at: "2026-10-14T19:00:00Z" } },
  };
}

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const method = init?.method ?? "GET";
  if (path === "/desk/capabilities") return json(200, caps);
  if (path === "/api/review/summary") return json(200, { by_kind: {}, cohorts: [], none: 0 });
  if (path === "/api/review") return json(200, { count: 0, items: [] });
  if (path === "/api/packs/mri") return json(200, PACK_RAW);
  if (path === "/api/packs/mri/quality") return json(200, QUALITY_RAW);
  if (path === "/api/packs/mri/disagreements") return json(200, QUALITY_RAW.disagreements);
  if (path === "/api/packs/mri/rehearse") return json(200, EFFECT_RAW);
  if (path === "/api/packs/mri/proposals" && method === "POST") return json(201, { ...PROPOSAL_FULL, id: 14 });
  if (path === "/api/packs/mri/proposals") {
    const status = url.searchParams.get("status");
    const dataset = url.searchParams.get("dataset");
    const all = PROPOSALS_LIST.proposals.filter((p) => (!status || (adopted.has(p.id as number) ? "adopted" : p.status) === status) && (!dataset || (p.datasets as string[]).includes(dataset)));
    return json(200, { ...PROPOSALS_LIST, count: all.length, counts: { proposed: 2 - adopted.size, adopted: 1 + adopted.size, rejected: 0 }, proposals: all });
  }
  const decide = /^\/api\/packs\/mri\/proposals\/(\d+)\/decide$/u.exec(path);
  if (decide) {
    adopted.set(Number(decide[1]), 0);
    return json(202, { proposal: Number(decide[1]), status: "adopted", job: 812, version: { pack: "mri", version: "1.2.1" }, scopes: ["pack"] });
  }
  const one = /^\/api\/packs\/mri\/proposals\/(\d+)$/u.exec(path);
  if (one) {
    const p = proposal(Number(one[1]));
    return p ? json(200, p) : json(404, { error: "no such proposal" });
  }
  if (path === "/api/sources") return json(200, SOURCES);
  if (path === "/api/batches") return json(200, BATCHES);
  if (path === "/api/overlays") return json(200, { overlays: [] });
  return json(404, { error: `the layout check's engine has no ${path}` });
}) as typeof fetch;

if (!location.hash) location.hash = "#review/rules";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
