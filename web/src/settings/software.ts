// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Software (record 57 P5, Wave 7b spec 6.7): the software place as
// a person reads it. Each package with its install (the version, how it came,
// the kind, a short fingerprint), whether it was verified and what the probe
// or the test said where it failed, and its licence: accepted by whom and
// when, or waiting for an administrator. The acts follow the grant and the
// doors the engine serves; each row offers the one act it needs next. The
// desk counts nothing itself: every word is the engine's or read from it.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import type { PackFrom, SoftwareCheck, SoftwareFound, SoftwarePackage, SoftwarePlace } from "../ops/client";

/** The page's address: where a refusal for software points. */
export const SOFTWARE_HREF = href("settings", "software");

/** The Places page, where a software place is chosen. */
export const PLACES_HREF = href("settings", "places");

/**
 * The line under the head that says which place this is: the default under
 * the working place, with the way to choose one in Places; a shared folder,
 * with the subfolder the engine writes into (spec 6.8); or the declared
 * place by name.
 */
export function placeLine(place: SoftwarePlace["place"]): { kind: "default" | "shared" | "declared"; words: string; into: string | null } | null {
  if (!place) return null;
  if (place.declared === null || place.declared === undefined) return { kind: "default", words: "the default place under the working place; choose one in Places", into: null };
  if (place.shared === true) {
    const into = place.writes_into ?? null;
    return { kind: "shared", words: `shared, the engine writes into ${into ?? "its own subfolder"}`, into };
  }
  return { kind: "declared", words: `the place ${place.declared}`, into: null };
}

/** What a person may do on the page, by grant and door; a door the engine lacks offers nothing. */
export function softwareActs(caps: Capabilities): { see: boolean; install: boolean; register: boolean; verify: boolean; accept: boolean; forget: boolean; remove: boolean } {
  const see = (may(caps, "install:see") || may(caps, "pipelines:see")) && served(caps, "GET /api/software");
  const work = see && may(caps, "install:work");
  return {
    see,
    install: work && served(caps, "POST /api/software/install"),
    register: work && served(caps, "POST /api/software/register"),
    verify: work && served(caps, "POST /api/software/{app}/{version}/verify"),
    accept: work && served(caps, "POST /api/software/{app}/{version}/accept"),
    forget: work && served(caps, "POST /api/software/{app}/{version}/forget"),
    remove: work && served(caps, "DELETE /api/software/{app}/{version}"),
  };
}

const KIND: Record<string, string> = { sif: "SIF", sandbox: "sandbox", image: "image", binary: "program" };

/** How the package came and what it is: "image", "registered SIF", "program". */
export function kindWords(p: Pick<SoftwarePackage, "kind" | "managed" | "how">): string {
  const k = KIND[p.kind] ?? p.kind;
  return p.managed === false || p.how === "registered" ? `registered ${k}` : k;
}

export type Tone = "ok" | "caution" | "brand" | "neutral";

/** The status as a tag: its words and its tone; a missing package whose image is in the runtime's cache says so, since a run adopts it. */
export function statusTag(p: Pick<SoftwarePackage, "status" | "image_cached">): { words: string; tone: Tone; note?: string } {
  switch (p.status) {
    case "installed":
    case "registered":
      return { words: p.status, tone: "ok" };
    case "missing":
      return p.image_cached === true ? { words: "image cached", tone: "ok", note: "adopted at the next run" } : { words: "not installed", tone: "caution" };
    case "failed verification":
      return { words: "failed verification", tone: "caution" };
    case "update available":
      return { words: "update available", tone: "brand" };
    default:
      return { words: p.status || "unknown", tone: "neutral" };
  }
}

/** The checks of a verification that failed, each with what it said. */
export function failedChecks(p: Pick<SoftwarePackage, "verification">): { check: string; said: string }[] {
  const v = p.verification ?? {};
  const out: { check: string; said: string }[] = [];
  for (const [check, c] of [
    ["probe", v.probe],
    ["fingerprint", v.fingerprint],
    ["test", v.test],
  ] as [string, SoftwareCheck | null | undefined][]) {
    if (c && c.ran && c.passed === false) out.push({ check, said: c.said ?? `the ${check} did not pass` });
  }
  return out;
}

/** Whether it was verified, and when, or which check failed. */
export function verifiedWords(p: Pick<SoftwarePackage, "verified_at" | "verification" | "status">, when: (iso: string) => string): { words: string; failed: boolean } {
  const failed = failedChecks(p);
  if (failed.length > 0) return { words: `${failed.map((f) => f.check).join(" and ")} failed`, failed: true };
  if (p.status === "failed verification") return { words: "failed", failed: true };
  if (!p.verified_at) return { words: p.status === "missing" ? "" : "not verified", failed: false };
  return { words: when(p.verified_at), failed: false };
}

/** The licence as a line: what it is, and whether a run may use it yet. */
export function licenceState(p: Pick<SoftwarePackage, "licence">, name: (principal: string) => string, when: (iso: string) => string): { words: string; tone: Tone; accept: boolean; file: boolean } {
  const l = p.licence;
  if (!l) return { words: "", tone: "neutral", accept: false, file: false };
  const spdx = l.spdx ?? "licence";
  const needsFile = l.site_file !== null && l.site_file !== undefined && l.file?.present !== true;
  if (l.accept && !l.accepted) return { words: `${spdx}: terms not accepted`, tone: "caution", accept: true, file: needsFile };
  // the terms are accepted and only the file is missing: the accept door records an acceptance on every call, so the desk offers no second one and names the command line
  if (needsFile) return { words: `${spdx}: accepted; licence file missing`, tone: "caution", accept: false, file: true };
  if (l.accepted) return { words: `${spdx}: accepted by ${name(l.accepted.by)}, ${when(l.accepted.at)}`, tone: "ok", accept: false, file: false };
  return { words: spdx, tone: "neutral", accept: false, file: false };
}

/** The command line that places the missing site file, for a package whose terms are accepted already. */
export function placeFileCommand(p: Pick<SoftwarePackage, "spec">): string {
  return `nils software accept ${p.spec} --file PATH`;
}

export type Act = "install" | "accept" | "place" | "verify";

/** The one act a package needs next, where the person may do it; null where it needs none. */
export function nextAct(p: SoftwarePackage, acts: ReturnType<typeof softwareActs>): Act | null {
  if (p.status === "missing") return acts.install && p.kind !== "binary" ? "install" : null;
  const lic = licenceState(p, (s) => s, (s) => s);
  if (lic.accept) return acts.accept ? "accept" : null;
  // the terms are accepted and only the site file is missing: the dialog places the file alone
  if (lic.file) return acts.accept ? "place" : null;
  if (p.status === "failed verification") return acts.verify ? "verify" : null;
  return null;
}

/** The dependency checks of a package that are not ok, warn first-class: a person sees what keeps a run from it. */
export function needsAmiss(p: Pick<SoftwarePackage, "needs">): { check: string; state: string; said: string }[] {
  return (p.needs ?? []).filter((c) => (c.state ? c.state !== "ok" : c.ok !== true)).map((c) => ({ check: c.check, state: c.state || "missing", said: c.said }));
}

/** The page's few numbers: the packages, those ready, those needing a look. */
export function softwareCounts(packages: SoftwarePackage[]): { packages: number; ready: number; look: number } {
  let ready = 0;
  let look = 0;
  for (const p of packages) {
    const t = statusTag(p).tone;
    const lic = licenceState(p, (s) => s, (s) => s);
    if (t === "ok" && !lic.accept && !lic.file) ready++;
    else look++;
  }
  return { packages: packages.length, ready, look };
}

/** A package spec a person typed: app@version, each a package name (letters, digits, '.', '-', '_' and '+'). */
export function specError(spec: string): string | null {
  const s = spec.trim();
  if (s === "") return null;
  const m = /^([A-Za-z0-9_+-][A-Za-z0-9._+-]*)@([A-Za-z0-9_+-][A-Za-z0-9._+-]*)$/u.exec(s);
  return m ? null : "name it as app@version";
}

/** A reference pinned by its digest, as the engine takes one: repository@sha256:<64 hex>. */
export function pinnedError(ref: string): string | null {
  const s = ref.trim();
  if (s === "") return null;
  return /^[^\s@]+@sha256:[0-9a-f]{64}$/u.test(s) ? null : "pin it by its digest: repository@sha256:…";
}

/** The candidate in the declared place that carries a missing package's pinned image, where one does and no install names it yet: the row offers its copy before an install. */
export function copyFor(p: Pick<SoftwarePackage, "spec" | "status">, found: SoftwareFound[] | null | undefined): SoftwareFound | null {
  if (p.status !== "missing") return null;
  return (found ?? []).find((f) => !f.registered && f.matches.includes(p.spec)) ?? null;
}

/** The catalog pipeline whose pack the register door reads for a package (`pack_from`), where the package names one; undefined where none does. */
export function packFrom(p: Pick<SoftwarePackage, "pipelines">): PackFrom | undefined {
  const first = (p.pipelines ?? [])[0];
  return first ?? undefined;
}

/** The candidates no package of the catalog matches: the Found section lists them, each to register under a name of the person's, or said as registered already. */
export function unmatched(found: SoftwareFound[] | null | undefined): SoftwareFound[] {
  return (found ?? []).filter((f) => f.matches.length === 0);
}

/**
 * A version suggested from a candidate's base image, `freesurfer/freesurfer:8.2.0` to `freesurfer-8.2.0`: the
 * image's last name and its tag, so the site's copy is told from an install of the engine's at the bare version.
 * The app is the person's to name.
 */
export function suggestedVersion(base: string | null | undefined): string {
  if (!base) return "";
  const noDigest = base.split("@")[0];
  const last = noDigest.split("/").pop() ?? "";
  const [name, tag] = last.split(":");
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._+-]/gu, "-").replace(/^[^A-Za-z0-9_+-]+/u, "");
  if (!name) return "";
  return tag ? clean(`${name}-${tag}`) : clean(name);
}

/** The most bytes the accept door takes of a licence file. */
export const LICENCE_MAX = 64 * 1024;

/** Where a refusal for software links: the page, for a person who may open it; null otherwise. */
export function softwareHrefFor(caps: Capabilities): string | null {
  return softwareActs(caps).see ? SOFTWARE_HREF : null;
}
