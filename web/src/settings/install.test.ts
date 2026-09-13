// SPDX-License-Identifier: AGPL-3.0-only
// The install in a person's words: how it runs, and what a new folder asks of it.

import { describe, expect, it } from "vitest";
import { addFolderWords, keptRunning, reapplyByHand, where } from "./install";
import type { Install } from "./supervise";

function install(runtime: string, service: string): Install {
  return {
    record: "",
    dir: "/home/x/nils",
    runtime,
    service,
    reach: "loopback",
    backend: "sqlite",
    mode: "off",
    at: "",
    ports: {},
    parts: {},
    places: [],
    oidc: null,
    addresses: [],
    services: [],
    unfinished: false,
    release: { installed: null, newest: null, newer: null, error: null, command: "nils update --all" },
    machine: { card: null, advice: [] },
  };
}

describe("the install in words", () => {
  it("says how it runs and whether it comes back after a restart", () => {
    expect(where(install("docker", "a compose file"))).toBe("docker on this machine");
    expect(where(install("podman", "podman quadlets"))).toBe("podman on this machine");
    expect(where(install("machine", "systemd user units"))).toBe("on this machine");
    expect(keptRunning(install("machine", "systemd user units"))).toBe(true);
    expect(keptRunning(install("machine", "none"))).toBe(false);
  });

  it("names what makes the engine read a new folder, by how the install runs", () => {
    expect(reapplyByHand(install("docker", "a compose file"))).toBe("cd /home/x/nils && docker compose up -d --force-recreate engine");
    expect(reapplyByHand(install("podman", "podman quadlets"))).toBe("nils supervise reapply --part engine");
    expect(reapplyByHand(install("machine", "none"))).toBe("nils setup");
    expect(addFolderWords(install("docker", "a compose file")).detail).toContain("makes its container again");
    expect(addFolderWords(install("machine", "none")).lead).toBe("The engine reads a new folder once it starts again.");
  });
});
