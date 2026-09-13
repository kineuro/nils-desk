// SPDX-License-Identifier: AGPL-3.0-only
// What the shell offers (Wave 5 sections 6.2 and 6.4), each a predicate on the
// capabilities document and the person. A section that is not built back yet
// is not offered: the desk shows what the deployment has and nothing else.

import type { Capabilities } from "./capabilities";
import { stationOf, stationsServed } from "./assistant/stations";
import { holds, state } from "./deployment";
import { settingsPages } from "./settings/pages";
import type { IconName } from "./ui/Icon";

export interface Section {
  id: string;
  title: string;
  icon: IconName;
}

/** Whether the desk can be worked in: ready, or ready with the model backend still warming, which only the assistant waits for. */
export function usable(caps: Capabilities): boolean {
  const kind = state(caps).kind;
  return kind === "ready" || kind === "warming";
}

/** The sections down the side, in order, for this document and person. */
export function sections(caps: Capabilities): Section[] {
  if (!usable(caps)) return [];
  const out: Section[] = [];
  if (holds(caps, "reader")) out.push({ id: "home", title: "Home", icon: "home" });
  return out;
}

/** The sections kept at the foot of the side, apart from the work: Settings, for a person who may open one of its pages. */
export function foot(caps: Capabilities): Section[] {
  if (!usable(caps) || settingsPages(caps).length === 0) return [];
  return [{ id: "settings", title: "Settings", icon: "settings" }];
}

/** Whether the rail renders beside a section: the assistant answered and the person holds assist (section 6.4). The chosen design draws Settings without it. While the model warms the rail is there and waits. */
export function railPresent(caps: Capabilities, section: string): boolean {
  return usable(caps) && caps.assistant !== null && holds(caps, "assist") && section !== "assistant" && section !== "settings";
}

/** The station the rail speaks to: on Home the operator plans, where the assistant serves it (section 9.3); elsewhere the concierge. */
export function railStation(caps: Capabilities, section: string): string {
  if (section === "home" && stationsServed(caps).includes("operator")) return "operator";
  return stationOf(caps);
}

/** The model the gateway lists first, and whether its prompts stay on this machine. */
export function railModel(caps: Capabilities): string | null {
  const models = (caps.kvasir?.["models"] as { id?: unknown; locality?: unknown }[] | undefined) ?? [];
  const first = models.find((m) => typeof m.id === "string");
  if (!first) return null;
  return `${first.id as string} · ${first.locality === "remote" ? "provider" : "this machine"}`;
}

/** The two letters of a person's avatar: the first two words' initials, or a single word's first two letters. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0 && !["the", "a", "an"].includes(w.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
