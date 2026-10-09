// SPDX-License-Identifier: AGPL-3.0-only
// The dataset viewer's browser, its layout check (Wave 7a, 2026-10-09): one
// dataset under the desk's top bar with the side folded away, as the shell
// shows the browser, against a fake engine whose scans have real pictures
// (grey JPEG planes drawn here), so dataset.pw.ts measures that the scan is
// the hero, the chrome stays two slim lines and a quiet tree, and a phone's
// width keeps one column with no sideways scroll.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
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
  ["Ax_T2w_2D_FLAIR_IR-TSE_ND", "acq-Ax+2D+FLAIR+IRTSE_T2w", "anat", "anat", { base: "T2w", technique: "IR-TSE", modifier: "FLAIR", disposition: "acquisition" }, ["base:missing"]],
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
window.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.origin);
  if (u.pathname === "/api/datasets/ms-a/scans") return json({ dataset: "ms-a", total: rows.length, count: rows.length, scans: rows, next: null });
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="desk">
      <header className="top">
        <span className="brandmark">NILS</span>
      </header>
      <div className="body browsing">
        <main className="page bare">
          <Browser scope={scope} view={view} grid={false} onSections={() => undefined} go={(v) => location.replace(viewHref(scope, { ...view, ...v }))} />
        </main>
      </div>
    </div>
  </StrictMode>,
);
