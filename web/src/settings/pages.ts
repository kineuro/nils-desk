// SPDX-License-Identifier: AGPL-3.0-only
// Settings' pages (Wave 5 section 10), as the chosen design lays them out:
// the parts, with the engine, the desk and the assistant under them. A page
// is offered only once it is built back, where the deployment has what it
// shows, and to a person who may read it.

import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";

export interface SettingsPage {
  id: string;
  title: string;
  /** Drawn under the parts, set in. */
  sub: boolean;
}

/** The pages down the settings nav, in order, for this document and person. */
export function settingsPages(caps: Capabilities): SettingsPage[] {
  if (!holds(caps, "operator")) return [];
  const out: SettingsPage[] = [
    { id: "parts", title: "Parts", sub: false },
    { id: "engine", title: "Engine", sub: true },
    { id: "desk", title: "Desk", sub: true },
  ];
  if (caps.assistant !== null) out.push({ id: "assistant", title: "Assistant", sub: true });
  return out;
}

/** The page an address opens: the one it names when that one is offered, else the first. */
export function settingsPage(pages: SettingsPage[], id: string | null): SettingsPage | null {
  return pages.find((p) => p.id === id) ?? pages[0] ?? null;
}
