// SPDX-License-Identifier: AGPL-3.0-only
// Uninstall NILS from the desk (gate T31, walkthrough step 1.9), through the
// supervisor, only where one keeps this install: NILS alone with the data
// kept for the next setup, or everything, the registry's key with it. The
// person types the install directory's name either way, as `nils uninstall`
// asks before a purge; the supervisor checks it again.

import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import type { Install, UninstallPreview } from "./supervise";

export type Leave = "nils" | "everything";

/** Whether Uninstall is offered: a supervisor keeps this install, and the person holds install work. */
export function uninstallOffered(caps: Capabilities, install: Install | null): boolean {
  return install !== null && may(caps, "install:work");
}

/** Whether what was typed is the directory's name. */
export function typedRight(p: UninstallPreview, typed: string): boolean {
  return p.name.length > 0 && typed.trim() === p.name;
}

/** The lines of what goes and what stays, the plan's own words, for one way. */
export function planLines(p: UninstallPreview, leave: Leave): string[] {
  return leave === "nils" ? p.keep_data : p.everything;
}

/** Why the chosen way cannot go ahead whatever is typed, or null. */
export function uninstallRefusal(p: UninstallPreview, leave: Leave): string | null {
  return leave === "everything" && p.everything_refused ? `${p.dir} will not be removed: ${p.everything_refused}.` : null;
}

/** What the desk says once the uninstall started; the desk goes with it. */
export function goneWords(p: UninstallPreview, leave: Leave): string {
  return leave === "nils"
    ? `NILS is being removed. This desk stops answering when its service goes; your data stays in ${p.dir} for the next setup.`
    : `NILS and everything it made are being removed, ${p.dir} with them. This desk stops answering when its service goes.`;
}
