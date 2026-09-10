// SPDX-License-Identifier: AGPL-3.0-only
// The supervisor through the desk's proxy (Wave 5 section 10.4), admin only.

import { door } from "../ask/client";
import type { Installed } from "./console";

export const supervise = {
  capabilities: () => door<{ parts: Installed[]; channel?: string | null; trust?: string | null }>("GET", "/supervise/api/supervise/capabilities"),
  update: (part: string, version: string) => door<{ part: string; version: string; applied: boolean; reason?: string }>("POST", "/supervise/api/supervise/update", { part, version }),
  log: () => door<{ entries: { at: string; part: string; version: string; digest: string; outcome: string }[] }>("GET", "/supervise/api/supervise/log"),
};

/** The command a person runs by hand, always beside the button. */
export function byHand(part: string, version: string, channel: string | null): string[] {
  const base = channel ?? "<channel>";
  return [
    `curl -fsSLO ${base}/${part}/${part}-${version}-$(uname -m)-linux.json`,
    `curl -fsSLO ${base}/${part}/${part}-${version}-$(uname -m)-linux.sig`,
    `curl -fsSLO ${base}/${part}/${part}-${version}-$(uname -m)-linux.tar.zst`,
    `nils supervise verify --trust /etc/nils/trust.pub ${part}-${version}-$(uname -m)-linux.json`,
    `nils supervise apply --install <where ${part} lives> ${part}-${version}-$(uname -m)-linux.json`,
  ];
}
