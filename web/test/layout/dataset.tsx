// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's browser, its layout check (Wave 7a, 2026-10-09): one
// dataset under the desk's top bar with the side folded away, as the shell
// shows the browser, against a fake engine whose scans have real pictures
// (grey JPEG planes drawn here), so dataset.pw.ts measures that the scan is
// the hero, the chrome stays two slim lines and a quiet tree, and a phone's
// width keeps one column with no sideways scroll; and that the line keeping
// what the filter leaves sits under it within the tree's width. Review round
// 1 (record 56 section 6.3, DR3): a scan whose rules and System 1 disagree
// carries its question under it, answered with the grid's keys; what the
// answer door was sent is kept on the window. UX round 2: each fact says
// where it came from (the origins door): the first scan's weighting a
// decision not sorted yet, the second's a person's decision from a
// campaign, the contrast of the third a model's, the rest the rules'.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import type { Capabilities } from "../../src/capabilities";
import { Browser } from "../../src/data/DatasetView";
import { parseView, viewHref } from "../../src/data/viewer";
import { framesBody, previewBody } from "../../src/data/pictures.fixture";

const PLANES = 24;
const SIZE = 256;

/** One grey plane as a JPEG: a disc whose size follows the plane, so moving through them shows. */
async function plane(z: number, stack: number): Promise<Uint8Array> {
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(0,0,0)";
  g.fillRect(0, 0, SIZE, SIZE);
  const r = 40 + 70 * Math.sin((Math.PI * (z + 1)) / (PLANES + 1));
  const v = 120 + ((stack * 37) % 100);
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.beginPath();
  g.ellipse(SIZE / 2, SIZE / 2, r, r * 1.2, 0, 0, Math.PI * 2);
  g.fill();
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return new Uint8Array(await blob.arrayBuffer());
}
async function dataUrl(z: number, stack: number): Promise<string> {
  const bytes = await plane(z, stack);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(s)}`;
}

const NAMES: [string, string | null, string, string, Record<string, string>, string[]][] = [
  ["Sag_T1w_3D_MPRAGE_ND", "acq-Sag+3D+MPRAGE_T1w", "anat", "anat", { base: "T1w", technique: "MPRAGE", construct: "ND", disposition: "acquisition" }, []],
  ["Ax_T2w_2D_FLAIR_IR-TSE_ND", "acq-Ax+2D+FLAIR+IRTSE_T2w", "anat", "anat", { base: "T2w", technique: "IR-TSE", modifier: "FLAIR", disposition: "acquisition" }, ["base:disagree"]],
  ["Sag_T1w_3D_MPRAGE_ND_CE", "acq-Sag+3D+MPRAGE_ce-contrast_T1w", "anat", "anat", { base: "T1w", technique: "MPRAGE", post_contrast: "1", disposition: "acquisition" }, []],
  ["Ax_SWI_3D_GRE_MinIP", null, "anat", "anat", { base: "SWI", technique: "GRE", construct: "MinIP", provenance: "ProjectionDerived", disposition: "scanner_derived" }, []],
  ["Ax_T1w_2D_MDME_SyntheticT1w", "acq-Ax+2D+MDME_rec-SyMRI_T1w", "anat", "anat/SyMRI", { base: "T1w", technique: "MDME", provenance: "SyMRI", disposition: "scanner_derived" }, []],
  ["Ax_DWI_2D_DWI-EPI_ND_b1000_30dir", "acq-Ax+2D+DWIEPI_dwi", "dwi", "dwi", { base: "DWI", technique: "DWI-EPI", disposition: "acquisition" }, []],
  ["Ax_DWI_2D_DWI-EPI_ADC_b1000", "acq-Ax+2D+DWIEPI_rec-DTIRecon_ADC", "dwi", "dwi", { base: "DWI", technique: "DWI-EPI", construct: "ADC", disposition: "scanner_derived" }, ["base:conflict"]],
  ["Ax_T1w_2D_GRE_ND", null, "other", "localizer", { disposition: "scout" }, []],
];
const rows: unknown[] = [];
let stack = 100;
for (let u = 0; u < 6; u++)
  for (let s = 0; s < (u % 2 === 0 ? 2 : 1); s++)
    NAMES.forEach(([name, bids, datatype, folder, axes, questions], i) => {
      stack += 1;
      const day = `202${4 + s}-0${1 + u}-1${s}`;
      rows.push({ stack, subject: { id: u + 1, code: `9f3c${u}a7e1b2d4c0${u}` }, session: { id: 10 * u + s, label: day.replaceAll("-", "") }, series_description: `series ${i}`, orientation: "AXIAL", images: PLANES, day, name, bids, datatype, folder, axes, series_number: i + 1, questions: u === 0 || u === 3 ? questions : [] });
    });

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const posted: unknown[] = [];
(window as unknown as { posted: unknown[] }).posted = posted;
const BASE = ["DWI", "SWI", "T2*w", "T2w", "PDw", "T1w"].map((v) => ({ value: v, name: v === "T2*w" ? "T2starw" : v, label: null }));
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.origin);
  if (u.pathname === "/api/datasets/ms-a/scans") return json({ dataset: "ms-a", total: rows.length, count: rows.length, scans: rows, next: null });
  // record 56 section 6.3: the questions that ask a scan, and an answer for it alone
  if (u.pathname === "/api/review/questions") {
    const stack = Number(u.searchParams.get("stack"));
    const asked = (rows as { stack: number; questions: string[] }[]).find((r) => r.stack === stack)?.questions.includes("base:disagree");
    return json({
      scope: { kind: "dataset", name: "ms-a", id: 3 },
      scans: 2,
      questions: asked ? [{ key: "base:PDw|T2w", axis: "base", shape: "pair", values: ["T2w", "PDw"], words: "T2w or PDw?", reason: "The rules and System 1 disagree.", scans: 2, staged: 0, kinds: { "base:disagree": 2 } }] : [],
      vocabularies: { base: BASE },
      elsewhere: [],
      held: { scans: 0, campaigns: [] },
    });
  }
  if (u.pathname.endsWith("/answer")) {
    const body = JSON.parse(String(init?.body)) as { stacks: number[] };
    posted.push(body);
    return json({ key: "base:PDw|T2w", axis: "base", answered: 1, decisions: [{ stack: body.stacks[0], value: "PDw", decision: 7 }], skipped: [], staged: false, blind: 0, resort: { job: 5, state: "done", stacks: 1 }, left: 1 });
  }
  // keeping what the browser shows: the question counted before anything is kept
  if (u.pathname === "/api/ask/diagnose") {
    // the scans the words left, by their ids, else the dataset's
    const where = (JSON.parse(String(init?.body ?? "{}")) as { document: { sets: { scans: { where: unknown[][] } } } }).document.sets.scans.where;
    const ids = where.find((c) => c[0] === "in")?.[3] as number[] | undefined;
    return json({ valid: true, issues: [], funnel: [{ set: "scans", grain: "stack", stage: "where", rows: ids?.length ?? rows.length, subjects: 6 }] });
  }
  // UX round 2: where each label came from, for the visit asked
  if (u.pathname === "/api/origins") {
    const session = Number(u.searchParams.get("session"));
    const sorted = { pack: "mri", version: "1.4.0", overlay: null, job: 3, at: "2026-11-01T08:00:00Z" };
    const decided = { id: 77, kind: "person", value: "T2w", values: ["T2w"], by: "anna@site", at: "2026-11-05T14:02:00Z", campaign: { id: 6, name: "curate", status: "closed", item: 412, position: 3 } };
    const stacks = (rows as { stack: number; session: { id: number }; series_number: number; axes: Record<string, string> }[])
      .filter((r) => r.session.id === session)
      .map((r) => ({
        stack: r.stack,
        sorted,
        unsorted: r.series_number === 1,
        axes: Object.entries(r.axes).map(([axis, value]) => {
          const plain = { axis, values: value.split(","), confidence: 0.9, tier: "keyword", origin: "rules", line: "", state: "current", words: null, rules: [{ rule_set: axis, rule: `${axis}_words`, source: "series_description", matched: value }], decided: null };
          if (r.series_number === 1 && axis === "base") return { ...plain, state: "unsorted", words: "decided T2w; sorted before the decision", decided };
          if (r.series_number === 2 && axis === "base") return { ...plain, tier: "decision", origin: "decision", rules: [], from: { kind: "person", by: "anna@site", campaign: 6, scope: "stack" }, decided: { ...decided, value: value, values: [value] } };
          if (r.series_number === 3 && axis === "post_contrast") return { ...plain, tier: "decision", origin: "model", rules: [], from: { kind: "model", by: "post-contrast@1.2", model: { id: 4, name: "post-contrast", version: "1.2", label: "post-contrast@1.2" } }, decided: { id: 90, kind: "model", value, values: [value], by: "post-contrast@1.2", committed_by: "astrid@site", model: { id: 4, label: "post-contrast@1.2", p: 0.94, run: 31 } } };
          return plain;
        }),
      }));
    return json({ count: stacks.length, unsorted: stacks.filter((s) => s.unsorted).length, stacks });
  }
  if (u.pathname === "/api/origins/resort") {
    posted.push(JSON.parse(String(init?.body)));
    return json({ resort: { state: "done", stacks: 1, sorted: 1, jobs: [9], words: "1 of 1 scan(s) re-sorted" }, origins: { count: 0, unsorted: 0, stacks: [] } });
  }
  if (u.pathname === "/api/cohorts") return json([]);
  if (u.pathname === "/api/picks/summary") return json({});
  const pv = /^\/api\/instances\/(\d+)\/preview$/.exec(u.pathname);
  if (pv) return json(previewBody(PLANES, { axial: await dataUrl(PLANES / 2, Number(pv[1])) }, { stack: Number(pv[1]), shape: [PLANES, SIZE, SIZE], frames: { count: PLANES, width: SIZE, height: SIZE, bytes: 1, url: "" } }));
  const pl = /^\/api\/instances\/(\d+)\/preview\/planes$/.exec(u.pathname);
  if (pl) {
    const from = Number(u.searchParams.get("from"));
    const to = Number(u.searchParams.get("to"));
    const frames = [];
    for (let z = from; z < to; z++) frames.push({ plane: z, bytes: await plane(z, Number(pl[1])) });
    return new Response(framesBody(frames, SIZE, SIZE));
  }
  return json({ error: `no door ${u.pathname}` }, 404);
}) as typeof fetch;

const scope = { kind: "dataset" as const, name: "ms-a" };
const view = parseView({ mode: "browser" });
/** A person who may keep what the browser shows, as a selection or a cohort. */
const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.80" },
    contracts: { openapi: "7" },
    doors: ["GET /api/datasets/{name}/scans", "POST /api/ask/diagnose", "POST /api/ask/documents", "POST /api/ask/run", "PUT /api/ask/selections/{name}", "POST /api/ask/handles/{id}/promote", "GET /api/cohorts", "GET /api/review/questions", "GET /api/review/questions/{key}/scans", "POST /api/review/questions/{key}/answer", "GET /api/origins", "POST /api/origins/resort"],
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
  person: { subject: "astrid@site", display_name: "Astrid", grants: ["data:see", "data:work", "query:see", "query:work", "review:see", "review:work", "pipelines:work"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="desk">
      <header className="top">
        <span className="brandmark">NILS</span>
      </header>
      <div className="body browsing">
        <main className="page bare">
          <Browser caps={caps} scope={scope} view={view} grid={false} onSections={() => undefined} go={(v) => location.replace(viewHref(scope, { ...view, ...v }))} />
        </main>
      </div>
    </div>
  </StrictMode>,
);
