// SPDX-License-Identifier: AGPL-3.0-only
// What the shell offers (Wave 5 sections 6.2 and 6.4), each a predicate on the
// capabilities document and the person. Until an operator's install is set
// up, the side holds its first page and Settings; once it is, the sections
// being built back join them, each where the engine serves its door.

import type { Capabilities } from "./capabilities";
import { door, holds, state } from "./deployment";
import { PLACEHOLDERS } from "./home/placeholders";
import { settingsPages } from "./settings/pages";
import type { IconName } from "./ui/Icon";

/** A page of a section, unfolded under it in the side while the section is open. */
export interface SidePage {
  id: string;
  title: string;
  /** 2 sets it in under the page before it. */
  depth: 1 | 2;
}

export interface Section {
  id: string;
  title: string;
  icon: IconName;
  pages?: SidePage[];
}

/** Whether the desk can be worked in: ready, or ready with the model backend still warming, which only the assistant waits for. */
export function usable(caps: Capabilities): boolean {
  const kind = state(caps).kind;
  return kind === "ready" || kind === "warming";
}

/**
 * The sections down the side, in order, for this document and person. `ready`
 * says whether the install is set up: false keeps an operator on its first
 * page, named for it, and null holds the rest back while it is not known yet.
 */
export function sections(caps: Capabilities, ready: boolean | null = true, conversations: SidePage[] = []): Section[] {
  if (!usable(caps)) return [];
  const out: Section[] = [];
  if (holds(caps, "reader")) out.push({ id: "home", title: ready === false ? "Get started" : "Home", icon: "home" });
  // the assistant helps set an install up as well, so it does not wait for it
  if (assistantOffered(caps)) out.push({ id: "assistant", title: "Assistant", icon: "assistant", pages: [{ id: "new", title: "New conversation", depth: 1 }, ...conversations, { id: "all", title: "All conversations", depth: 1 }] });
  if (ready !== true) return out;
  for (const p of PLACEHOLDERS) if (holds(caps, p.entitlement) && door(caps, p.door)) out.push({ id: p.id, title: p.title, icon: p.icon });
  return out;
}

/** Whether the Assistant has its page: the assistant answered and the person holds assist. While the model warms the page is there and waits. */
export function assistantOffered(caps: Capabilities): boolean {
  return usable(caps) && caps.assistant !== null && holds(caps, "assist");
}

/** The sections kept at the foot of the side, apart from the work: Settings, with its pages, for a person who may open one of them. */
export function foot(caps: Capabilities): Section[] {
  const pages = usable(caps) ? settingsPages(caps) : [];
  if (pages.length === 0) return [];
  return [{ id: "settings", title: "Settings", icon: "settings", pages: pages.map((p) => ({ id: p.id, title: p.title, depth: p.sub ? 2 : 1 })) }];
}

/** The model the gateway lists first, and whether its prompts stay on this machine. */
export function assistantModel(caps: Capabilities): string | null {
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
