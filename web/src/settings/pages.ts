// SPDX-License-Identifier: AGPL-3.0-only
// Settings' pages (Wave 5 section 10), as the chosen design lays them out:
// the parts, with the engine, the desk, the gateway and the assistant under
// them, then the places, the database, identity and the audit log. A page is
// offered only once it is built back, where the deployment has what it
// shows, and to a person who may read it.

import type { Capabilities } from "../capabilities";
import { door, holds } from "../deployment";

export interface SettingsPage {
  id: string;
  title: string;
  /** Drawn under the parts, set in. */
  sub: boolean;
}

/** The pages down the settings nav, in order, for this document and person. */
export function settingsPages(caps: Capabilities): SettingsPage[] {
  if (!holds(caps, "operator")) return [];
  const admin = holds(caps, "admin");
  const out: SettingsPage[] = [
    // how the install stands, a card for each page
    { id: "overview", title: "Overview", sub: false },
    { id: "parts", title: "Parts", sub: false },
    { id: "engine", title: "Engine", sub: true },
    { id: "desk", title: "Desk", sub: true },
  ];
  // the gateway, where it answered the desk
  if (caps.kvasir !== null) out.push({ id: "gateway", title: "Gateway and models", sub: true });
  if (caps.assistant !== null) out.push({ id: "assistant", title: "Assistant", sub: true });
  // the places, where the engine serves them
  if (door(caps, "GET /api/places")) out.push({ id: "places", title: "Places", sub: false });
  // the database is an admin's, where the engine serves its doors
  if (admin && (door(caps, "GET /api/backups") || door(caps, "GET /api/settings"))) out.push({ id: "database", title: "Database", sub: false });
  // who signs in is the desk's, and an admin's
  if (admin) out.push({ id: "identity", title: "Identity", sub: false });
  if (admin && door(caps, "GET /api/audit")) out.push({ id: "audit", title: "Audit", sub: false });
  return out;
}

/** The page an address opens: the one it names when that one is offered, else the first. */
export function settingsPage(pages: SettingsPage[], id: string | null): SettingsPage | null {
  return pages.find((p) => p.id === id) ?? pages[0] ?? null;
}
