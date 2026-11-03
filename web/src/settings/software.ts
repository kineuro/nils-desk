// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Software (record 57 P5, Wave 7b spec 6.7): the software place as
// a person reads it. The packages are grouped into tools by the image they
// pin, each tool named as people know it (FreeSurfer 8.2.0) with the
// pipelines that use it and its state in plain words, in an order of
// precedence: a check failed, a licence waits, an older converter, ready, a
// copy in the folder, fetched already, not here yet. Each package keeps its
// install (the version, how it came, the kind, a short fingerprint), whether
// it was verified and what failed, and its licence. The acts follow the grant
// and the doors the engine serves.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { href } from "../routes";
import type { PackFrom, SoftwareCheck, SoftwareFound, SoftwarePackage, SoftwarePlace } from "../ops/client";

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

/** The dependency checks of a package that are not ok, warn first-class: a person sees what keeps a run from it. */
export function needsAmiss(p: Pick<SoftwarePackage, "needs">): { check: string; state: string; said: string }[] {
  return (p.needs ?? []).filter((c) => (c.state ? c.state !== "ok" : c.ok !== true)).map((c) => ({ check: c.check, state: c.state || "missing", said: c.said }));
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
  if (!name) return "";
  return tag ? clean(`${name}-${tag}`) : clean(name);
}

/**
 * The app suggested from a candidate's base image, `freesurfer/freesurfer:7.4.1` to `freesurfer`: the repository's
 * last name, with any character a package name cannot hold made a dash.
 */
export function suggestedApp(base: string | null | undefined): string {
  if (!base) return "";
  const last = base.split("@")[0].split("/").pop() ?? "";
  return clean(last.split(":")[0] ?? "");
}

/** The tag of a candidate's base image as a version, `freesurfer/freesurfer:7.4.1` to `7.4.1`; empty where the base names no tag. */
export function suggestedTag(base: string | null | undefined): string {
  if (!base) return "";
  const last = base.split("@")[0].split("/").pop() ?? "";
  return clean(last.split(":")[1] ?? "");
}

/** The name a candidate is added under, `app@version` from its base image; empty where the base names no app. */
export function suggestedSpec(base: string | null | undefined): string {
  const app = suggestedApp(base);
  const tag = suggestedTag(base);
  return app === "" ? "" : `${app}@${tag || "1"}`;
}

const clean = (s: string) => s.replace(/[^A-Za-z0-9._+-]/gu, "-").replace(/^[^A-Za-z0-9_+-]+/u, "");

/** What a path a person gave is, read from its shape: an image pinned by its digest, a `.sif` file, else a folder. */
export function inferKind(path: string): "sif" | "sandbox" | "image" {
  const s = path.trim();
  if (/@sha256:/u.test(s)) return "image";
  if (/\.sif$/iu.test(s)) return "sif";
  return "sandbox";
}

/* ------------------------------------------------ tools: the packages grouped by the image they pin */

/** One tool as a person installs it: the packages that pin one image (FreeSurfer is one tool for seven pipelines), or the converter. */
export interface ToolGroup {
  key: string;
  /** The friendly name: "FreeSurfer", "dcm2niix (the converter)". */
  name: string;
  /** The version with the tool's name in front stripped: "8.2.0". */
  version: string;
  /** The pipelines that use it, by name, without the label's @N. */
  pipelines: string[];
  packages: SoftwarePackage[];
  converter: boolean;
}

/** The friendly names of the tools the catalog pins, by repository (or its last name). */
const TOOL_NAMES: Record<string, string> = {
  "freesurfer/freesurfer": "FreeSurfer",
  "antsx/ants": "ANTs",
  "nipreps/mriqc": "MRIQC",
  "kineuro/nils-lst-ai": "LST-AI",
  "sf-lesionflow-segcsvd": "segcsvd",
  "kineuro/nils-bodypart": "NILS body part model",
  "kineuro/nils-postcontrast": "NILS post-contrast model",
  "kineuro/nils-postcontrast-full": "NILS post-contrast model (full)",
  "kineuro/nils-system1": "NILS System 1 model",
};

/** The repository of an image reference, its registry host, tag and digest left out: `docker.io/antsx/ants@sha256:…` to `antsx/ants`. */
export function repositoryOf(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const parts = ref.split("@")[0].split("/");
  // a first part with a dot or a port, or localhost, is the registry's host
  if (parts.length > 1 && (/[.:]/u.test(parts[0]) || parts[0] === "localhost")) parts.shift();
  const last = parts.pop()?.split(":")[0] ?? "";
  const repo = [...parts, last].join("/");
  return repo === "" ? null : repo;
}

/** A tool's friendly name from its package: the converter by its role, else the table's name for its repository, else the repository's last name, else the app. */
export function toolName(p: Pick<SoftwarePackage, "kind" | "app" | "source" | "image" | "pinned">): string {
  if (p.kind === "binary") return `${p.app} (the converter)`;
  const ref = p.source ?? p.image ?? (p.pinned ?? []).find((x) => x.includes("/")) ?? null;
  const repo = repositoryOf(ref);
  if (repo === null) return p.app;
  const last = repo.split("/").pop() ?? repo;
  return TOOL_NAMES[repo] ?? TOOL_NAMES[last] ?? last;
}

/** A version with the tool's name in front stripped, `freesurfer-8.2.0` to `8.2.0`; one that starts with its number stays as it is. */
export function bareVersion(v: string): string {
  return v.replace(/^[A-Za-z][A-Za-z0-9_.+-]*?-(?=v?\d)/u, "");
}

/** The version of a group: its packages' versions, each bare; where they disagree, the shortest. */
export function toolVersion(packages: Pick<SoftwarePackage, "version">[]): string {
  const vs = [...new Set(packages.map((p) => bareVersion(p.version)))];
  return vs.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? "";
}

/** The digest an image reference pins, where it pins one. */
const digestOf = (ref: string | null | undefined) => (ref && ref.includes("@") ? ref.slice(ref.indexOf("@") + 1) : null);

/** The packages grouped by the image they pin, in the order the engine lists them; the converter is its own group. */
export function groupTools(packages: SoftwarePackage[]): ToolGroup[] {
  const groups = new Map<string, SoftwarePackage[]>();
  for (const p of packages) {
    const key = p.kind === "binary" ? `binary:${p.app}` : (p.pinned?.[0] ?? p.digest ?? digestOf(p.source) ?? p.spec);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([key, ps]) => {
    const names = ps.flatMap((p) => ((p.pipelines ?? []).length > 0 ? (p.pipelines ?? []).map((l) => l.replace(/@[^@]*$/u, "")) : [p.app]));
    return { key, name: toolName(ps[0]), version: toolVersion(ps), pipelines: [...new Set(names)], packages: ps, converter: ps[0].kind === "binary" };
  });
}

/** A tool's title: "FreeSurfer 8.2.0". */
export function toolTitle(g: Pick<ToolGroup, "name" | "version" | "converter">): string {
  return g.converter ? g.name : `${g.name} ${g.version}`.trim();
}

/** The line under a tool's name: the pipelines that use it, counted and named; the converter serves every pipeline that reads DICOM. */
export function pipelinesLine(g: Pick<ToolGroup, "pipelines" | "converter">): string {
  if (g.converter) return "every pipeline that reads DICOM";
  const n = g.pipelines.length;
  return `${n} ${n === 1 ? "pipeline" : "pipelines"}: ${g.pipelines.join(", ")}`;
}

export type ToolStateKind = "failed" | "licence" | "licence-file" | "update" | "ready" | "copy" | "cached" | "missing";

/** How a tool stands, in plain words, with the package its one act is for and, for a copy in the folder, that copy. */
export interface ToolState {
  kind: ToolStateKind;
  tone: Tone;
  words: string;
  /** The package the act is for: the failed one, the one whose licence waits, the first one the copy matches. */
  p: SoftwarePackage;
  copy: SoftwareFound | null;
}

const ready = (p: Pick<SoftwarePackage, "status">) => p.status === "installed" || p.status === "registered";

/**
 * How a tool stands, by precedence: a check failed, a licence waits (its terms, or only its file), an older
 * converter is here, all ready, a copy is in the folder, the image fetched already, or not here yet.
 */
export function toolState(g: Pick<ToolGroup, "packages" | "converter">, found: SoftwareFound[] | null | undefined): ToolState {
  const ps = g.packages;
  const failed = ps.find((p) => p.status === "failed verification");
  if (failed) return { kind: "failed", tone: "caution", words: "Did not pass its check", p: failed, copy: null };
  const lic = (p: SoftwarePackage) => licenceState(p, (s) => s, (s) => s);
  const terms = ps.find((p) => lic(p).accept);
  if (terms) return { kind: "licence", tone: "caution", words: "Needs its licence", p: terms, copy: null };
  const file = ps.find((p) => lic(p).file);
  if (file) return { kind: "licence-file", tone: "caution", words: "Needs its licence file", p: file, copy: null };
  const old = ps.find((p) => p.status === "update available");
  if (old) {
    const v = (old.tool as { version?: unknown } | null | undefined)?.version;
    const here = typeof v === "string" && v !== "" ? v : null;
    return { kind: "update", tone: "brand", words: `Older version on this machine${here ? `: ${here}` : ""}; pipelines pin ${old.version}`, p: old, copy: null };
  }
  if (ps.every(ready)) return { kind: "ready", tone: "ok", words: "Ready", p: ps[0], copy: null };
  for (const p of ps) {
    const copy = copyFor(p, found);
    if (copy) return { kind: "copy", tone: "neutral", words: "A copy is in the folder", p, copy };
  }
  const waiting = ps.filter((p) => !ready(p));
  if (!g.converter && waiting.every((p) => p.image_cached === true)) return { kind: "cached", tone: "ok", words: "Ready, fetched already", p: ps[0], copy: null };
  return { kind: "missing", tone: "neutral", words: g.converter ? "Not here yet" : "Not here yet; a first run fetches it", p: waiting[0] ?? ps[0], copy: null };
}

/** The line under a ready tool: the site's copy where NILS never changes it, else who installed it and when. */
export function readyMeta(p: SoftwarePackage, name: (principal: string) => string, when: (iso: string) => string): string {
  if (p.managed === false) return p.path ? `the site's copy at ${p.path}` : "the site's copy";
  if (p.by && p.at) return `installed by ${name(p.by)}, ${when(p.at)}`;
  return "";
}

/** The page's few numbers, by tool: the tools, those ready, those needing a look (a check, a licence, an older converter). */
export function toolCounts(groups: ToolGroup[], found: SoftwareFound[] | null | undefined): { tools: number; ready: number; look: number } {
  let ok = 0;
  let look = 0;
  for (const g of groups) {
    const s = toolState(g, found);
    if (s.tone === "ok") ok++;
    else if (s.tone === "caution" || s.tone === "brand") look++;
  }
  return { tools: groups.length, ready: ok, look };
}

/** What a folder holds that NILS recognises, said after the folder is chosen: each tool with a copy there and its pipelines. */
export function foundWords(place: Pick<SoftwarePlace, "packages" | "found">): string {
  const hits = groupTools(place.packages)
    .map((g) => ({ g, s: toolState(g, place.found) }))
    .filter((x) => x.s.kind === "copy")
    .map(({ g }) => `${toolTitle(g)} for ${g.pipelines.length} ${g.pipelines.length === 1 ? "pipeline" : "pipelines"}`);
  if (hits.length === 0) return "Nothing NILS recognises there yet.";
  return `Found ${hits.length === 1 ? hits[0] : `${hits.slice(0, -1).join(", ")} and ${hits[hits.length - 1]}`}.`;
}

/**
 * The software place as the page's card says it: the default under the working place, a folder the site shares
 * (where NILS writes only its own subfolder), or a declared folder; read only where the engine cannot install there.
 */
export function placeCard(place: SoftwarePlace["place"]): { kind: "default" | "shared" | "declared"; path: string | null; into: string | null; readOnly: boolean } | null {
  if (!place) return null;
  const readOnly = place.read_only === true;
  if (place.declared === null || place.declared === undefined) return { kind: "default", path: place.path, into: place.writes_into ?? place.path, readOnly };
  return { kind: place.shared === true ? "shared" : "declared", path: place.path, into: place.writes_into ?? place.path, readOnly };
}

/** The most bytes the accept door takes of a licence file. */
export const LICENCE_MAX = 64 * 1024;

/** Where a refusal for software links: the page, for a person who may open it; null otherwise. */
export function softwareHrefFor(caps: Capabilities): string | null {
  return softwareActs(caps).see ? SOFTWARE_HREF : null;
}
