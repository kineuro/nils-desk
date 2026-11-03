// SPDX-License-Identifier: AGPL-3.0-only
// The software place's doors as the engine answers them (openapi v7, record
// 57 P5, Wave 7b spec 6.7), for the tests and the layout check. Every name,
// path and number here is made up.

import type { SoftwareFound, SoftwarePackage, SoftwarePlace } from "../ops/client";

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

/** The site's copy of synthseg's pinned image, a sandbox folder in the declared place: the synthseg row offers it before an install. */
export const SYNTHSEG_COPY: SoftwareFound = {
  path: "/srv/shared/software/synthseg/2.0/image",
  kind: "sandbox",
  base: "example/synthseg:2.0",
  base_digest: `sha256:${"4c".repeat(32)}`,
  matches: ["synthseg@2.0"],
  registered: false,
};

/** A sandbox no package of the catalog matches: the Found section offers to register it, the version suggested from its base. */
export const FREESURFER_COPY: SoftwareFound = {
  path: "/srv/shared/software/freesurfer/8.2.0/image",
  kind: "sandbox",
  base: "freesurfer/freesurfer:8.2.0",
  base_digest: `sha256:${"8f".repeat(32)}`,
  matches: [],
  registered: false,
};

/** A SIF without readable labels, registered already: said so, nothing offered. */
export const STRAY_SIF: SoftwareFound = {
  path: "/srv/shared/software/segcsvd/segcsvd_rc03.sif",
  kind: "sif",
  base: null,
  base_digest: null,
  matches: [],
  registered: true,
};

/** The shared place declared, with what the walk found in it. */
export const SHARED_PLACE: SoftwarePlace = {
  ...PLACE,
  place: { path: "/srv/shared/software", declared: "tools", read_only: false, shared: true, writes_into: "/srv/shared/software/nils" },
  found: [SYNTHSEG_COPY, FREESURFER_COPY, STRAY_SIF],
  found_errors: 0,
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

/* ------------------------------------------------ the tools a fresh install lists, grouped by the image they pin */

const pin = (hex: string) => `sha256:${hex.repeat(32)}`;
const FS_PIN = pin("56");
const FS_SOURCE = `docker.io/freesurfer/freesurfer@${FS_PIN}`;

/** A tool a catalog pipeline pins and nothing installs yet, as the engine lists it: no kind, no install, the pinned digest and the pipeline's image. */
function pinned(app: string, version: string, digest: string, source: string, cached = false): SoftwarePackage {
  return {
    app,
    version,
    spec: `${app}@${version}`,
    kind: null as unknown as string,
    how: null,
    managed: null as unknown as boolean,
    status: "missing",
    image_cached: cached,
    source,
    digest: null,
    pinned: [digest],
    pipelines: [`${app}@1`],
    licence: { spdx: null, redistributable: null, terms: null, accept: false, accepted: null, site_file: null, file: { present: false, name: null } },
    needs: [{ check: "image", ok: cached, state: cached ? "ok" : "missing", said: cached ? "the image is in the runtime's store" : "the image is not on this machine yet" }],
    install: { door: "POST /api/software/install", command: `nils software install ${app}@${version}`, grant: "install:work" },
  };
}

/** The seven pipelines that run the one FreeSurfer image. */
export const FS_APPS = ["synthstrip", "synthseg", "samseg-lesions", "registration-robust", "registration-synthmorph", "freesurfer-recon-all", "freesurfer-recon-all-clinical"];
const FS_PACKAGES = FS_APPS.map((a) => pinned(a, "freesurfer-8.2.0", FS_PIN, FS_SOURCE));

/** The converter older than the one pipelines pin, found on the machine's path. */
export const DCM2NIIX_OLD: SoftwarePackage = {
  ...DCM2NIIX,
  how: "registered",
  managed: false,
  status: "update available",
  path: "/usr/bin/dcm2niix",
  by: null,
  at: null,
  verified_at: null,
  tool: { name: "dcm2niix", present: true, path: "/usr/bin/dcm2niix", found_by: "path", version: "v1.0.20241211", pinned: "v1.0.20260724", current: false },
};

/** A fresh install before anything is installed: 16 packages of 10 tools, three images fetched already by runs, an older converter, the default place. */
export const PRODUCTION: SoftwarePlace = {
  place: { path: "/srv/nils/working/software", declared: null, read_only: false, shared: false, writes_into: "/srv/nils/working/software" },
  packages: [
    ...FS_PACKAGES,
    pinned("n4-bias-correction", "2.6.5.dev1-gfdce4d2", pin("59"), `docker.io/antsx/ants@${pin("59")}`, true),
    pinned("registration-ants", "ants-2.6.2", pin("d5"), `docker.io/antsx/ants@${pin("d5")}`),
    pinned("mriqc", "24.0.2", pin("da"), `docker.io/nipreps/mriqc@${pin("da")}`, true),
    pinned("lst-ai", "1.2.0", pin("85"), `ghcr.io/kineuro/nils-lst-ai@${pin("85")}`, true),
    pinned("segcsvd", "rc03", pin("a4"), `docker.io/frheault/sf-lesionflow-segcsvd@${pin("a4")}`),
    pinned("nils-bodypart", "1.0.0", pin("b0"), `ghcr.io/kineuro/nils-bodypart@${pin("b0")}`),
    pinned("nils-postcontrast", "1.0.0", pin("c0"), `ghcr.io/kineuro/nils-postcontrast@${pin("c0")}`),
    pinned("nils-system1", "1.0.0", pin("e0"), `ghcr.io/kineuro/nils-system1@${pin("e0")}`),
    DCM2NIIX_OLD,
  ],
  runtime: { name: "apptainer", version: "1.4.1" },
  found: [],
  found_errors: 0,
};

/** A FreeSurfer 8.2.0 sandbox folder in a shared folder, built from the image the seven pipelines pin. */
export const FS_SANDBOX: SoftwareFound = {
  path: "/srv/shared/tools/freesurfer/8.2.0",
  kind: "sandbox",
  base: "freesurfer/freesurfer:8.2.0",
  base_digest: FS_PIN,
  matches: FS_APPS.map((a) => `${a}@freesurfer-8.2.0`).sort(),
  registered: false,
};

/** An older FreeSurfer the site keeps beside it, which no pipeline pins. */
export const FS_OLD_SANDBOX: SoftwareFound = {
  path: "/srv/shared/tools/freesurfer/7.4.1",
  kind: "sandbox",
  base: "freesurfer/freesurfer:7.4.1",
  base_digest: pin("74"),
  matches: [],
  registered: false,
};

/** The shared folder of tools chosen, with FreeSurfer 8.2.0 and 7.4.1 found in it. */
export const SHARED_TOOLS: SoftwarePlace = {
  ...PRODUCTION,
  place: { path: "/srv/shared/tools", declared: "software", read_only: false, shared: true, writes_into: "/srv/shared/tools/nils" },
  found: [FS_SANDBOX, FS_OLD_SANDBOX],
  found_errors: 1,
};

/** The same folder after Use this copy: the engine lists one registered install for the seven pipelines, the site's copy. */
export const FS_TAKEN: SoftwarePackage = {
  app: "synthstrip",
  version: "freesurfer-8.2.0",
  spec: "synthstrip@freesurfer-8.2.0",
  kind: "sandbox",
  how: "registered",
  managed: false,
  status: "registered",
  path: FS_SANDBOX.path,
  image: FS_SANDBOX.path,
  source: FS_SOURCE,
  digest: FS_PIN,
  pinned: [FS_PIN],
  by: "astrid@site",
  at: at(5),
  fingerprint: PRINT,
  verified_at: at(5),
  verification: { probe: ok("freesurfer 8.2.0"), fingerprint: ok("key files as recorded"), test: { ran: false, passed: null, said: "the pack names no test" } },
  pipelines: FS_APPS.map((a) => `${a}@1`),
  licence: { spdx: "LicenseRef-FreeSurfer", redistributable: false, terms: null, accept: false, accepted: null, site_file: null, file: { present: false, name: null } },
  needs: [{ check: "runtime", ok: true, state: "ok", said: "apptainer 1.4.1" }],
};

export const SHARED_TAKEN: SoftwarePlace = {
  ...SHARED_TOOLS,
  packages: [FS_TAKEN, ...PRODUCTION.packages.slice(FS_APPS.length)],
  found: [{ ...FS_SANDBOX, registered: true }, FS_OLD_SANDBOX],
};

/** The places doors the place card's Change folder asks. */
export const PLACE_DOORS = ["GET /api/places", "POST /api/places", "PUT /api/places/{id}"];
