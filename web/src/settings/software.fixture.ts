// SPDX-License-Identifier: AGPL-3.0-only
// The software place's doors as the engine answers them (openapi v7, record
// 57 P5, Wave 7b spec 6.7), for the tests and the layout check. Every name,
// path and number here is made up.

import type { SoftwarePackage, SoftwarePlace } from "../ops/client";

const NOW = new Date("2026-10-20T09:30:00Z");
export const FIXTURE_NOW = NOW;
const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString().replace(/\.\d+Z$/u, "Z");

const DIGEST = `sha256:${"3f".repeat(32)}`;
const PRINT = `sha256:${"a1b2c3d4e5f6".repeat(5)}abcd`;

const ok = (said: string) => ({ ran: true, passed: true, said });

export const SAMSEG: SoftwarePackage = {
  app: "freesurfer",
  version: "8.1.0",
  spec: "freesurfer@8.1.0",
  kind: "image",
  how: "installed",
  managed: true,
  status: "installed",
  image: `docker.io/freesurfer/freesurfer@${DIGEST}`,
  source: `docker.io/freesurfer/freesurfer@${DIGEST}`,
  digest: DIGEST,
  digest_asked: DIGEST,
  size_bytes: 9_800_000_000,
  runtime: "podman",
  by: "astrid@site",
  at: at(60 * 26),
  fingerprint: DIGEST,
  verified_at: at(60 * 26),
  verification: { probe: ok("freesurfer 8.1.0"), fingerprint: ok("as recorded"), test: ok("the test input made what it should") },
  pipelines: ["samseg-lesions@2", "synthseg@1"],
  licence: {
    spdx: "LicenseRef-FreeSurfer",
    redistributable: false,
    terms: { address: "https://surfer.nmr.mgh.harvard.edu/registration.html", version: "2024" },
    accept: true,
    accepted: null,
    site_file: { env: "FS_LICENSE", mount: "/license.txt", name: "license.txt" },
    file: { present: false, name: null },
  },
  needs: [
    { check: "runtime", ok: true, state: "ok", said: "podman 5.4.2" },
    { check: "licence", ok: false, state: "missing", said: "the terms of freesurfer@8.1.0 are not accepted: an administrator accepts them at https://surfer.nmr.mgh.harvard.edu/registration.html" },
  ],
  install: { door: "POST /api/software/install", command: "nils software install freesurfer@8.1.0", grant: "install:work" },
};

export const PYMENT: SoftwarePackage = {
  app: "pyment",
  version: "5.1.0",
  spec: "pyment@5.1.0",
  kind: "sandbox",
  how: "registered",
  managed: false,
  status: "registered",
  path: "/srv/shared/software/pyment/5.1.0",
  size_bytes: 2_100_000_000,
  by: "astrid@site",
  at: at(60 * 50),
  fingerprint: PRINT,
  verified_at: at(60 * 50),
  verification: { probe: ok("5.1.0"), fingerprint: ok("key files as recorded"), test: { ran: false, passed: null, said: "the pack names no test" } },
  pipelines: ["brain-age@1"],
  licence: {
    spdx: "CC-BY-NC-4.0",
    redistributable: false,
    terms: { address: "https://creativecommons.org/licenses/by-nc/4.0/", version: "4.0" },
    accept: true,
    accepted: { by: "astrid@site", at: at(60 * 49), terms: { address: "https://creativecommons.org/licenses/by-nc/4.0/", version: "4.0" }, file: null },
    site_file: null,
    file: null,
  },
  needs: [{ check: "runtime", ok: true, state: "ok", said: "apptainer 1.4.1" }],
};

export const SEGCSVD: SoftwarePackage = {
  app: "segcsvd",
  version: "1.0",
  spec: "segcsvd@1.0",
  kind: "sif",
  how: "installed",
  managed: true,
  status: "failed verification",
  path: "/srv/nils/software/segcsvd/1.0/image",
  size_bytes: 4_300_000_000,
  by: "astrid@site",
  at: at(60 * 3),
  fingerprint: `sha256:${"9e".repeat(32)}`,
  verified_at: at(20),
  verification: { probe: ok("segcsvd rc03"), fingerprint: { ran: true, passed: false, said: "the image changed since it was installed: sha256 9e9e9e9e9e9e… was 7c7c7c7c7c7c…" }, test: ok("the test input made what it should") },
  pipelines: ["segcsvd@1"],
  licence: { spdx: "GPL-3.0-only", redistributable: true, terms: null, accept: false, accepted: null, site_file: null, file: null },
  needs: [
    { check: "runtime", ok: true, state: "ok", said: "apptainer 1.4.1" },
    { check: "gpu", ok: true, state: "warn", said: "no GPU here; it runs on the CPU, slower" },
  ],
};

export const SYNTHSEG: SoftwarePackage = {
  app: "synthseg",
  version: "2.0",
  spec: "synthseg@2.0",
  kind: "image",
  how: null,
  managed: true,
  status: "missing",
  pinned: [`docker.io/example/synthseg@sha256:${"4c".repeat(32)}`],
  pipelines: ["synthseg@2"],
  licence: { spdx: "Apache-2.0", redistributable: true, terms: null, accept: false, accepted: null, site_file: null, file: null },
  needs: [{ check: "image", ok: false, state: "missing", said: "the image is not in the software place yet" }],
  install: { door: "POST /api/software/install", command: "nils software install synthseg@2.0", grant: "install:work" },
};

export const DCM2NIIX: SoftwarePackage = {
  app: "dcm2niix",
  version: "v1.0.20260724",
  spec: "dcm2niix@v1.0.20260724",
  kind: "binary",
  how: "installed",
  managed: true,
  status: "installed",
  path: "/srv/nils/software/dcm2niix/v1.0.20260724/bin/dcm2niix",
  size_bytes: 2_400_000,
  by: "astrid@site",
  at: at(60 * 24 * 6),
  fingerprint: `sha256:${"5e".repeat(32)}`,
  verified_at: at(60 * 24 * 6),
  verification: { probe: ok("v1.0.20260724"), fingerprint: ok("as recorded"), test: { ran: false, passed: null, said: "no test" } },
  pipelines: [],
  licence: { spdx: "BSD-2-Clause", redistributable: true, terms: null, accept: false, accepted: null, site_file: null, file: null },
  needs: [],
  install: { door: "POST /api/tools/dcm2niix/install", command: "nils software install dcm2niix", grant: "install:work" },
};

export const PLACE: SoftwarePlace = {
  place: { path: "/srv/nils/software", declared: "software" },
  packages: [SAMSEG, SEGCSVD, SYNTHSEG, PYMENT, DCM2NIIX],
  runtime: { name: "podman", version: "5.4.2" },
};

export const SOFTWARE_DOORS = [
  "GET /api/software",
  "POST /api/software/install",
  "POST /api/software/register",
  "POST /api/software/{app}/{version}/verify",
  "POST /api/software/{app}/{version}/accept",
  "POST /api/software/{app}/{version}/forget",
  "DELETE /api/software/{app}/{version}",
  "POST /api/tools/dcm2niix/install",
  "GET /api/tools",
];
