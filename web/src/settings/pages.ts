// SPDX-License-Identifier: AGPL-3.0-only
// Settings' pages (Wave 5 section 10), as the chosen design lays them out:
// the parts, with the engine, the desk, Kvasir and the assistant under
// them, then the places, the database, identity and the audit log. A page is
// offered only once it is built back, where the deployment has what it
// shows, and to a person holding the grant that opens it (record 25).

import type { Capabilities } from "../capabilities";
import { door } from "../deployment";
import { may } from "../grants";

export interface SettingsPage {
  id: string;
  title: string;
  /** Drawn under the parts, set in. */
  sub: boolean;
}

/** The pages down the settings nav, in order, for this document and person. */
export function settingsPages(caps: Capabilities): SettingsPage[] {
  const install = may(caps, "install:see");
  const out: SettingsPage[] = [];
  // how the install stands, a card for each page
  if (install) {
    out.push(
      { id: "overview", title: "Overview", sub: false },
      { id: "parts", title: "Parts", sub: false },
      { id: "engine", title: "Engine", sub: true },
      { id: "desk", title: "Desk", sub: true },
    );
  }
  // Kvasir, where it answered the desk; its page keeps the id the links name.
  // A part's page is set in under the parts only where the parts are drawn
  if (caps.kvasir !== null && may(caps, "kvasir:see")) out.push({ id: "gateway", title: "Kvasir", sub: install });
  if (caps.assistant !== null && may(caps, "assistant-settings:see")) out.push({ id: "assistant", title: "Assistant", sub: install });
  // the places, where the engine serves them
  if (may(caps, "places:see") && door(caps, "GET /api/places")) out.push({ id: "places", title: "Places", sub: false });
  // the database, where the engine serves its doors
  if (may(caps, "database:see") && (door(caps, "GET /api/backups") || door(caps, "GET /api/settings"))) out.push({ id: "database", title: "Database", sub: false });
  // who signs in is the desk's
  if (may(caps, "identity:see")) out.push({ id: "identity", title: "Identity", sub: false });
  if (may(caps, "audit:see") && door(caps, "GET /api/audit")) out.push({ id: "audit", title: "Audit", sub: false });
  // the steps that make the install ready, kept once they are done
  if (install) out.push({ id: "setup", title: "Setup", sub: false });
  return out;
}

/** The page an address opens: the one it names when that one is offered, else the first. */
export function settingsPage(pages: SettingsPage[], id: string | null): SettingsPage | null {
  return pages.find((p) => p.id === id) ?? pages[0] ?? null;
}
