// SPDX-License-Identifier: AGPL-3.0-only
// Bringing a folder in, from Home's third step: what a look inside it found,
// made into rows a person ticks, the name the new source place takes, and
// the digest each ticked folder becomes, one batch of its own.

import type { Look, LookFolder } from "../settings/supervise";

export interface Pack {
  name: string;
  version: string;
  modality: string;
}

export type Rules = { kind: "pack"; text: string } | { kind: "digest-only"; text: string } | { kind: "none"; text: string };

export interface FolderRow {
  /** The folder inside, or empty for DICOM right in the folder itself. */
  name: string;
  files: number;
  capped: boolean;
  looksLike: string;
  rules: Rules;
  dicom: boolean;
}

function row(f: LookFolder, packs: Pack[]): FolderRow {
  const dicom = f.dicom > 0;
  const modalities = Object.entries(f.modalities)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m)
    .filter((m) => m !== "unknown");
  if (!dicom) return { name: f.name, files: f.files, capped: f.capped, looksLike: "not DICOM", rules: { kind: "none", text: "left out" }, dicom };
  const scanners = f.scanners > 0 ? `${f.scanners} ${f.scanners === 1 ? "scanner" : "scanners"}` : null;
  const looksLike = [modalities.join(", ") || "DICOM", scanners].filter(Boolean).join(", ");
  const matching = packs.filter((p) => modalities.some((m) => m.toUpperCase() === p.modality.toUpperCase()));
  const rules: Rules =
    matching.length > 0
      ? { kind: "pack", text: matching.map((p) => `${p.name} ${p.version}`).join(", ") }
      : { kind: "digest-only", text: `no ${modalities[0] ?? "matching"} pack: digest only` };
  return { name: f.name, files: f.files, capped: f.capped, looksLike, rules, dicom };
}

/** The rows of a look: DICOM in the folder itself first, then each folder inside. */
export function rows(look: Look, packs: Pack[]): FolderRow[] {
  const out = look.folders.map((f) => row(f, packs));
  if (look.here && look.here.dicom > 0) out.unshift(row({ ...look.here, name: "" }, packs));
  return out;
}

/** A name made plain for a place or a digest: lower case, words joined by one dash, at most 40 characters. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** The name a new source place takes: the folder's own, made plain, and not one a place has already. */
export function placeName(path: string, taken: string[]): string {
  const base = slug(path.replace(/\/+$/, "").split("/").pop() ?? "") || "source";
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
}

/** The digest job of each ticked folder: a batch named after the place and the folder, reading the folder by the place's name. */
export function digests(place: string, ticked: FolderRow[]): { command: string[]; name: string }[] {
  return ticked
    .filter((r) => r.dicom)
    .map((r) => {
      const name = r.name ? `${place}-${slug(r.name) || "folder"}` : place;
      return { name, command: ["digest", "--name", name, r.name ? `@${place}/${r.name}` : `@${place}`] };
    });
}
