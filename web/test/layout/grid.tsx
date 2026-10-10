// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's grid, its layout check (Wave 7a, 2026-10-09): the
// three levels in the desk's shell (the top bar, the side, the page) against
// a fake engine, the address naming the level, so grid.pw.ts measures that
// the cards fill rows on a laptop and that a phone's width keeps every level
// in one column with no sideways scroll; and that the actions keeping what a
// level shows, and their dialog, fit both.

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import type { Capabilities } from "../../src/capabilities";
import { Viewer } from "../../src/data/Viewer";
import { parse } from "../../src/routes";

const SIZE = 128;

/** A grey disc as a JPEG data URL, a little different for each scan. */
async function picture(stack: number): Promise<string> {
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(0,0,0)";
  g.fillRect(0, 0, SIZE, SIZE);
  const v = 110 + ((stack * 37) % 120);
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.beginPath();
  g.ellipse(SIZE / 2, SIZE / 2, 40, 48, 0, 0, Math.PI * 2);
  g.fill();
  const bytes = new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(s)}`;
}

const subjects = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  code: `${(0x9f3c0a7e + i * 977).toString(16)}b2d4c0${i}`,
  label: null as string | null,
  visits: 1 + (i % 3),
  scans: 6 + i * 2,
  look: i % 4 === 0 ? 3 + i : 0,
  regions: i % 3 === 0 ? ["brain", "spine"] : ["brain"],
  makers: [["Siemens", "GE", "Philips"][i % 3]],
  main: i % 5 === 0 ? ["t1w"] : ["t1w", "flair", "t2w"],
})).map((s) => ({ ...s, label: s.code }));
const visits = [0, 418, 909].map((day, i) => ({
  session: 30 + i,
  studies: [5 + i],
  label: `ses-20${19 + i}0913`,
  first: `20${19 + i}-09-13`,
  day: String(day),
  number: i + 1,
  scans: 12 - i * 3,
  look: i === 0 ? 4 : 0,
  regions: i === 0 ? ["brain", "spine"] : ["brain"],
  kinds: [
    { kind: "T1w", scans: 3 },
    { kind: "FLAIR", scans: 1 },
    { kind: "T2w", scans: 2 },
    { kind: "DWI", scans: 1 },
    { kind: "SyMRI", scans: 3 },
  ],
  contrast: i === 0,
  symri: 3,
  main: [
    { role: "t1w", stack: 101, name: "Sag_T1w_3D_MPRAGE_ND" },
    { role: "flair", stack: 102, name: "Sag_T2w_3D_FLAIR_SPACE_ND" },
  ],
}));
const SCANS: [string, string, string, Record<string, string>, string[], string[]][] = [
  ["Sag_T1w_3D_MPRAGE_ND", "anat", "plain", { base: "T1w" }, ["t1w"], []],
  ["Sag_T2w_3D_FLAIR_SPACE_ND", "anat", "plain", { base: "T2w", modifier: "FLAIR" }, ["flair"], []],
  ["Ax_T2w_2D_TSE_ND", "anat", "plain", { base: "T2w" }, ["t2w"], []],
  ["Ax_T2starw_3D_FLASH_Magnitude_ND", "anat", "plain", { base: "T2starw" }, [], ["base:conflict"]],
  ["Ax_T1w_3D_MPRAGE_ND_CE", "anat", "plain", { base: "T1w", post_contrast: "1" }, [], []],
  ["Ax_T1w_2D_MDME_SyntheticT1w", "anat", "symri", { base: "T1w", provenance: "SyMRI" }, [], ["body_part:low_confidence"]],
  ["Ax_T2w_2D_MDME_SyntheticT2w", "anat", "symri", { base: "T2w", provenance: "SyMRI" }, [], []],
  ["Ax_FLAIR_2D_MDME_SyntheticFLAIR", "anat", "symri", { base: "T2w", modifier: "FLAIR", provenance: "SyMRI" }, [], []],
  ["SC_Sag_T2w_2D_TSE_ND", "anat", "body", { base: "T2w", body_part: "spine" }, [], []],
  ["SC_Sag_T1w_2D_TSE_ND", "anat", "body", { base: "T1w", body_part: "spine" }, [], []],
  ["Ax_DWI_2D_DWI-EPI_ND_b1000", "dwi", "plain", { base: "DWI" }, [], []],
  ["Ax_T1w_2D_GRE_Localizer", "other", "plain", { disposition: "scout" }, [], []],
];
const rows = await Promise.all(
  SCANS.map(async ([name, datatype, family, axes, main, questions], i) => ({
    stack: 101 + i,
    subject: { id: 1, code: subjects[0].code },
    session: { id: 30, label: "20190913" },
    study: 5,
    series_description: `series ${i}`,
    orientation: i % 3 === 0 ? "SAGITTAL" : "AXIAL",
    images: 24 + i * 8,
    day: "2019-09-13",
    name,
    bids: null,
    datatype,
    folder: datatype,
    axes,
    series_number: i + 1,
    questions,
    family,
    te: 2.26 + i * 10,
    tr: 2300,
    ti: i % 2 === 0 ? 900 : null,
    fa: 8,
    main,
    picture: { data: await picture(101 + i), width: SIZE, height: SIZE, digest: null, held: false },
  })),
);

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const scope = { kind: "dataset", name: "ms-a", id: 7 };
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.origin);
  if (u.pathname === "/api/datasets/ms-a/subjects")
    return json({
      scope,
      detail: "quasi",
      show: "code",
      order: "look",
      totals: { subjects: subjects.length, visits: 28, scans: 280, look: 40 },
      matched: subjects.length,
      count: subjects.length,
      subjects,
      next: null,
      facets: { makers: [{ name: "GE", subjects: 5 }, { name: "Philips", subjects: 4 }, { name: "Siemens", subjects: 5 }], regions: [{ name: "brain", subjects: 14 }], roles: [{ name: "t1w", subjects: 14 }, { name: "flair", subjects: 11 }], id_types: [] },
    });
  if (/^\/api\/datasets\/ms-a\/subjects\/\d+\/visits$/.test(u.pathname))
    return json({ scope, detail: "quasi", name: "date", show: "code", subject: { id: 1, code: subjects[0].code, label: subjects[0].code }, totals: { visits: 3, scans: 27, look: 4, span: "909" }, matched: 3, visits });
  if (u.pathname === "/api/datasets/ms-a/scans") return json({ scope, total: rows.length, count: rows.length, scans: rows, next: null, pictures: { shown: true, why: null, missing: 0, partial: 0 } });
  // keeping what a level shows: the question counted, kept, saved or run and promoted
  if (u.pathname === "/api/ask/diagnose") {
    const out = (JSON.parse(String(init?.body ?? "{}")) as { document: { out: { set: string } } }).document.out.set;
    const count = out === "subjects" ? subjects.length : out === "visits" ? visits.length : rows.length;
    return json({ valid: true, issues: [], funnel: [{ set: out, grain: "subject", stage: "where", rows: count, subjects: out === "subjects" ? count : 1 }] });
  }
  if (u.pathname === "/api/cohorts") return json([{ name: "ms-all", subjects: 120, retired_at: null }]);
  return json({ error: `no door ${u.pathname}` }, 404);
}) as typeof fetch;

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.80" },
    contracts: { openapi: "7" },
    doors: [
      "GET /api/datasets/{name}/scans",
      "GET /api/datasets/{name}/subjects",
      "GET /api/datasets/{name}/subjects/{subject}/visits",
      "POST /api/ask/diagnose",
      "POST /api/ask/documents",
      "POST /api/ask/run",
      "PUT /api/ask/selections/{name}",
      "POST /api/ask/handles/{id}/promote",
      "GET /api/cohorts",
    ],
    policy: [],
    auth: "token",
    principal: "astrid@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid@site", display_name: "Astrid", grants: ["data:see", "data:work", "query:see", "query:work"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

/** The page the address names, drawn again as it moves. */
function Page() {
  const [route, setRoute] = useState(() => parse(location.hash || "#data/datasets/ms-a/view"));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return <Viewer caps={caps} scope={{ kind: "dataset", name: "ms-a" }} query={route.query} onSections={() => undefined} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="desk">
      <header className="top">
        <span className="brandmark">NILS</span>
      </header>
      <div className="body with-side">
        <nav className="side" aria-label="sections" />
        <main className="page">
          <Page />
        </main>
      </div>
    </div>
  </StrictMode>,
);
