// SPDX-License-Identifier: AGPL-3.0-only
// Sheared, anisotropic and double oblique stacks in cornerstone itself: a
// head-like ellipsoid (radii 50, 65 and 80 mm, a bright cap at its top end)
// sampled at every voxel where the stack's planes really are (the origin,
// the row and column, and the planes' own step, which a sheared stack takes
// partly in its plane), held in the grid volumeGrid gives and written into
// it by shiftInto, exactly as the viewer's volume is, and drawn in the
// reader's three planes through the cameras planeCameras gives. The
// ellipsoid stands along the patient's axes (`frame=patient`) or the
// stack's (`frame=stack`). `noshear=1` holds the planes unshifted, the way
// the viewer did before it read the step, for the check that tells them
// apart.
//
//   shear.html?o=[...]&step=[...]&shape=[nz,ny,nx]&ps=[dy,dx]&cut=patient&frame=patient

import * as cs from "@cornerstonejs/core";
import type { Manifest } from "../../src/viewer/doors";
import { cross, dot, geometry, planeCameras, shiftInto, volumeGrid, type Planes, type Vec3 } from "../../src/viewer/geometry";

const q = new URLSearchParams(location.search);
const o = JSON.parse(q.get("o")!) as number[];
const step = JSON.parse(q.get("step")!) as Vec3;
const [nz, ny, nx] = JSON.parse(q.get("shape")!) as [number, number, number];
const [dy, dx] = JSON.parse(q.get("ps")!) as [number, number];
const cut = (q.get("cut") ?? "acquisition") as Planes;
const frame = q.get("frame") ?? "patient";
const noshear = q.get("noshear") === "1";

async function main() {
  await cs.init();
  const row = o.slice(0, 3) as Vec3;
  const col = o.slice(3, 6) as Vec3;
  const normal = cross(row, col);
  const dz = dot(step, normal);
  // the stack centred on the patient's origin: the middle plane's middle pixel
  const origin = [0, 1, 2].map((a) => -(row[a] * dx * (nx - 1) + col[a] * dy * (ny - 1) + step[a] * (nz - 1)) / 2) as Vec3;
  const m: Manifest = { codec: "htj2k", tile: 256, levels: 1, shape: [nz, ny, nx], spacing: [dz, dy, dx], dtype: "uint16", window: { center: 500, width: 1000 }, orientation: o, origin, orientation_known: true, frame: { parallel: true, evenly_spaced: true }, step: noshear ? null : step };
  const g = geometry(m);
  const grid = volumeGrid(g, [nz, ny, nx], m.spacing, 0);
  const [NX, NY] = grid.size;
  // the ellipsoid's axes, left-right, front-back and feet-head: the patient's, or the stack's axis
  // nearest each (the assignment of the stack's planes), signed the way the patient's runs
  const patient: [Vec3, Vec3, Vec3] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const own = [row, col, normal];
  const along = (p: Vec3): Vec3 => {
    const v = own.reduce((best, a) => (Math.abs(dot(a, p)) > Math.abs(dot(best, p)) ? a : best));
    return dot(v, p) >= 0 ? v : [-v[0], -v[1], -v[2]];
  };
  const axes = frame === "stack" ? (patient.map(along) as [Vec3, Vec3, Vec3]) : patient;
  const data = new Uint16Array(NX * NY * nz);
  const plane = new Uint16Array(nx * ny);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const p = [0, 1, 2].map((a) => origin[a] + row[a] * dx * i + col[a] * dy * j + step[a] * k) as Vec3;
        const [u, v, w] = axes.map((ax) => dot(p, ax));
        const e = (u / 50) ** 2 + (v / 65) ** 2 + (w / 80) ** 2;
        plane[j * nx + i] = e < 1 ? (w > 55 ? 1000 : 400) : 50;
      }
    const [ox, oy] = grid.shift(k);
    shiftInto(plane, nx, ny, data, k * NX * NY, NX, NY, ox, oy);
  }
  cs.volumeLoader.createLocalVolume("sheared", {
    scalarData: data,
    dimensions: [NX, NY, nz],
    spacing: grid.spacing,
    origin: grid.origin,
    direction: [...grid.direction[0], ...grid.direction[1], ...grid.direction[2]] as cs.Types.Mat3,
    metadata: { BitsAllocated: 16, BitsStored: 16, HighBit: 15, SamplesPerPixel: 1, PixelRepresentation: 0, PhotometricInterpretation: "MONOCHROME2", Modality: "OT", FrameOfReferenceUID: "sheared", ImageOrientationPatient: [...g.row, ...g.col], PixelSpacing: [grid.spacing[1], grid.spacing[0]], Rows: NY, Columns: NX, voiLut: [{ windowCenter: 500, windowWidth: 1000 }], VOILUTFunction: "LINEAR" } as unknown as cs.Types.Metadata,
  });
  const re = new cs.RenderingEngine("sheared");
  const cams = planeCameras(g, cut);
  const ids = ["axial", "coronal", "sagittal"] as const;
  for (const p of ids) re.enableElement({ viewportId: p, type: cs.Enums.ViewportType.ORTHOGRAPHIC, element: document.getElementById(p) as HTMLDivElement, defaultOptions: { orientation: cams[p] as cs.Types.OrientationVectors } });
  await cs.setVolumesForViewports(re, [{ volumeId: "sheared" }], [...ids]);
  for (const p of ids) (re.getViewport(p) as cs.VolumeViewport).setProperties({ voiRange: { lower: 0, upper: 1000 } });
  re.renderViewports([...ids]);
  await new Promise((r) => setTimeout(r, 500));
  re.renderViewports([...ids]);
  await new Promise((r) => setTimeout(r, 300));
  const out: Record<string, number[][]> = {};
  for (const p of ids) {
    const canvas = (re.getViewport(p) as cs.VolumeViewport).getCanvas();
    const img = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const grey: number[][] = [];
    for (let y = 0; y < canvas.height; y++) {
      const r: number[] = [];
      for (let x = 0; x < canvas.width; x++) r.push(img.data[(y * canvas.width + x) * 4]);
      grey.push(r);
    }
    out[p] = grey;
  }
  (window as unknown as { sheared: unknown }).sheared = { planes: out, grid: { size: grid.size, sheared: !!g.shear } };
}
main().catch((e) => ((window as unknown as { sheared: unknown }).sheared = { error: String(e) }));
