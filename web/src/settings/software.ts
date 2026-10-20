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
import type { SoftwareCheck, SoftwarePackage } from "../ops/client";

/** The page's address: where a refusal for software points. */
export const SOFTWARE_HREF = href("settings", "software");

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

/** The status as a tag: its words and its tone. */
export function statusTag(p: Pick<SoftwarePackage, "status">): { words: string; tone: Tone } {
  switch (p.status) {
    case "installed":
    case "registered":
      return { words: p.status, tone: "ok" };
    case "missing":
      return { words: "not installed", tone: "caution" };
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

/** A fingerprint as a person compares it: its first 12 hex digits. */
export function shortPrint(fingerprint: string | null | undefined): string {
  if (!fingerprint) return "";
  const hex = fingerprint.replace(/^sha256:/u, "");
  return hex.slice(0, 12);
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

export type Act = "install" | "accept" | "verify";

/** The one act a package needs next, where the person may do it; null where it needs none. */
export function nextAct(p: SoftwarePackage, acts: ReturnType<typeof softwareActs>): Act | null {
  if (p.status === "missing") return acts.install && p.kind !== "binary" ? "install" : null;
  if (licenceState(p, (s) => s, (s) => s).accept) return acts.accept ? "accept" : null;
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

/** The most bytes the accept door takes of a licence file. */
export const LICENCE_MAX = 64 * 1024;

/** Where a refusal for software links: the page, for a person who may open it; null otherwise. */
export function softwareHrefFor(caps: Capabilities): string | null {
  return softwareActs(caps).see ? SOFTWARE_HREF : null;
}
