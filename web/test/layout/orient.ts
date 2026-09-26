// SPDX-License-Identifier: AGPL-3.0-only
// Oblique stacks in cornerstone itself (record 48, after the learners
// report): a synthetic axial volume tilted `tilt` degrees about the
// patient's left-right axis, with bright bands along its planes and a bright
// cap at its head end, drawn in one plane of the reader's viewer through the
// cameras planeCameras gives, the viewport's pixels handed to the check.
//
//   orient.html?tilt=15&plane=sagittal&cut=acquisition

import * as cs from "@cornerstonejs/core";
import { geometry, planeCameras, type Planes, type Vec3 } from "../../src/viewer/geometry";

const q = new URLSearchParams(location.search);
const tilt = (Number(q.get("tilt") ?? 15) * Math.PI) / 180;
const plane = (q.get("plane") ?? "sagittal") as "axial" | "coronal" | "sagittal";
const cut = (q.get("cut") ?? "acquisition") as Planes;
const rot = (v: Vec3): Vec3 => [v[0], Math.cos(tilt) * v[1] - Math.sin(tilt) * v[2], Math.sin(tilt) * v[1] + Math.cos(tilt) * v[2]];

async function main() {
  await cs.init();
  const n = 96;
  const row = rot([1, 0, 0]);
  const col = rot([0, 1, 0]);
  const g = geometry({ codec: "htj2k", tile: 256, levels: 1, shape: [n, n, n], spacing: [1, 1, 1], dtype: "uint16", window: { center: 500, width: 1000 }, orientation: [...row, ...col], origin: [0, 0, 0], orientation_known: true });
  const data = new Uint16Array(n * n * n);
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        // bands two planes thick every eight planes, and the last twelve planes (the head end) bright
        const v = k >= n - 12 ? 1000 : k % 8 < 2 ? 700 : 100;
        data[k * n * n + j * n + i] = v;
      }
  const half = (n - 1) / 2;
  const origin = [0, 1, 2].map((a) => -(g.row[a] + g.col[a] + g.normal[a]) * half) as Vec3;
  cs.volumeLoader.createLocalVolume("oblique", {
    scalarData: data,
    dimensions: [n, n, n],
    spacing: [1, 1, 1],
    origin,
    direction: [...g.row, ...g.col, ...g.normal] as cs.Types.Mat3,
    metadata: { BitsAllocated: 16, BitsStored: 16, HighBit: 15, SamplesPerPixel: 1, PixelRepresentation: 0, PhotometricInterpretation: "MONOCHROME2", Modality: "OT", FrameOfReferenceUID: "oblique", ImageOrientationPatient: [...g.row, ...g.col], PixelSpacing: [1, 1], Rows: n, Columns: n, voiLut: [{ windowCenter: 500, windowWidth: 1000 }], VOILUTFunction: "LINEAR" } as unknown as cs.Types.Metadata,
  });
  const re = new cs.RenderingEngine("orient");
  const element = document.getElementById("vp") as HTMLDivElement;
  re.enableElement({ viewportId: "p", type: cs.Enums.ViewportType.ORTHOGRAPHIC, element, defaultOptions: { orientation: planeCameras(g, cut)[plane] as cs.Types.OrientationVectors } });
  await cs.setVolumesForViewports(re, [{ volumeId: "oblique" }], ["p"]);
  const vp = re.getViewport("p") as cs.VolumeViewport;
  vp.setProperties({ voiRange: { lower: 0, upper: 1000 } });
  vp.render();
  await new Promise((r) => setTimeout(r, 500));
  vp.render();
  await new Promise((r) => setTimeout(r, 300));
  const canvas = vp.getCanvas();
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grey: number[][] = [];
  for (let y = 0; y < canvas.height; y++) {
    const r: number[] = [];
    for (let x = 0; x < canvas.width; x++) r.push(img.data[(y * canvas.width + x) * 4]);
    grey.push(r);
  }
  (window as unknown as { orient: unknown }).orient = { grey, camera: vp.getCamera() };
}
main().catch((e) => ((window as unknown as { orient: unknown }).orient = { error: String(e) }));
