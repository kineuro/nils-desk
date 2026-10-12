// SPDX-License-Identifier: AGPL-3.0-only
// Failures as the engine answers them since its failure slice (2026-10-12):
// `failure` {kind, cause, advice, fix} beside the error, and the checks of
// what a run needs of this machine, each {check, ok, said, failure}. Every
// sentence here is made up in the engine's manner.

/** The install the engine offers for a missing dcm2niix. */
export const DCM2NIIX_FIX = { tool: "dcm2niix", door: "POST /api/tools/dcm2niix/install", command: "nils tools install dcm2niix", grant: "install:work" };

export const ADVICE = "Install dcm2niix where the engine runs: an admin can from Settings, Parts, or with nils tools install dcm2niix.";

/** An answer with the failure the engine names beside its error. */
export function failed<T extends object>(answer: T, kind: string, cause: string, advice: string, fix: unknown = null): T {
  return { ...answer, failure: { kind, cause, advice, fix } };
}

/** The converter's check where no dcm2niix is found, and the runtime's that holds. */
export const NO_CONVERTER = {
  check: "converter",
  ok: false,
  said: "dcm2niix is not on the engine's search path, beside nils, where the setup record names one, or in the registry's tools folder",
  failure: { kind: "dependency", cause: "dcm2niix", advice: ADVICE, fix: DCM2NIIX_FIX },
  path: null,
  found_by: null,
};
export const RUNTIME_OK = { check: "runtime", ok: true, said: "podman 5.4.2", failure: null, runtime: "podman", version: "5.4.2" };
export const IMAGE_LATER = { check: "image", ok: true, said: "the image is not here yet; it is pulled when the run starts", failure: null, present: false };
