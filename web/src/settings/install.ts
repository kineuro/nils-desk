// SPDX-License-Identifier: AGPL-3.0-only
// The install as a person reads it: how it runs, whether it comes back after
// a restart, what adding a folder does to the running parts, and the command
// a person runs by hand for what a button does (Wave 5 section 10.4).

import type { Install } from "./supervise";

/** How the install runs, as the top bar says it. */
export function where(i: Install): string {
  if (i.runtime === "docker") return "docker on this machine";
  if (i.runtime === "podman") return "podman on this machine";
  return "on this machine";
}

/** Whether a service manager brings the parts back after the machine restarts. */
export function keptRunning(i: Install): boolean {
  return i.service !== "" && i.service !== "none";
}

/** What adding a folder does to the running parts, in two sentences. */
export function addFolderWords(i: Install): { lead: string; detail: string } {
  if (!keptRunning(i)) {
    return {
      lead: "The engine reads a new folder once it starts again.",
      detail: "This install runs no services, so start the engine again yourself once the folder is added. nils setup prints the command, with every folder the registry names.",
    };
  }
  const rest = "The desk, the gateway and the assistant keep running.";
  if (i.runtime === "docker") {
    return {
      lead: "Adding a folder restarts the engine.",
      detail: `In docker the engine sees only the folders mounted when it starts, so NILS adds the mount and makes its container again. ${rest}`,
    };
  }
  if (i.runtime === "podman") {
    return {
      lead: "Adding a folder restarts the engine.",
      detail: `In podman the engine sees only the folders mounted when it starts, so NILS adds the mount and starts its container again. ${rest}`,
    };
  }
  return {
    lead: "Adding a folder restarts the engine.",
    detail: `The engine reads a folder a digest names only once it knows it at start, so NILS starts it again with the new folder. ${rest}`,
  };
}

/** The hand command that makes the engine read the folders the registry holds. */
export function reapplyByHand(i: Install): string {
  if (!keptRunning(i)) return "nils setup";
  return i.runtime === "docker" ? `cd ${i.dir} && docker compose up -d --force-recreate engine` : "nils supervise reapply --part engine";
}
