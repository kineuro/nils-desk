// SPDX-License-Identifier: AGPL-3.0-only
// Small words shared by the pages of ops and settings.

/** A sha256 as a person compares it: its first 12 hex digits. */
export function shortPrint(fingerprint: string | null | undefined): string {
  if (!fingerprint) return "";
  const hex = fingerprint.replace(/^sha256:/u, "");
  return hex.slice(0, 12);
}
