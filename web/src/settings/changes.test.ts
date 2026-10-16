// SPDX-License-Identifier: AGPL-3.0-only
// Gate T31 (record 55 ruling 35 (c)): which setup steps the supervisor makes
// for this person, the one line said where a step stays at the machine, and
// what each form must hold before it is sent, as the engine holds it again.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Grant } from "../grants";
import { atTheMachine, firstRefusal, folderRefusal, modelBody, modelRefusal, NO_SIGNIN, serves, signinBody, signinRefusal } from "./changes";
import type { Change, Install } from "./supervise";

const caps = (grants: readonly Grant[] = GRANTS) => ({ person: { grants: [...grants] } }) as unknown as Capabilities;
const install = (served: Change[], over: Partial<Install> = {}) => ({ service: "systemd user units", changes: { served, wait: null }, ...over }) as unknown as Install;

describe("which steps the supervisor makes", () => {
  it("makes a step it serves, for a person with work on the install", () => {
    expect(serves(caps(), install(["restore"]), "restore")).toBe(true);
    expect(serves(caps(), install(["restore"]), "signin")).toBe(false);
    expect(serves(caps(["install:see"]), install(["restore"]), "restore")).toBe(false);
    expect(serves(caps(), null, "restore")).toBe(false);
    // a supervisor older than the doors sends no list
    expect(serves(caps(), { service: "systemd user units" } as unknown as Install, "restore")).toBe(false);
  });

  it("says in one line why a step stays at the machine, and nothing where it does not", () => {
    expect(atTheMachine(caps(), install(["backups"]), "backups")).toBeNull();
    expect(atTheMachine(caps(), null, "backups")).toBe("This desk reaches no supervisor, so at the machine:");
    expect(atTheMachine(caps(["install:see"]), install(["backups"]), "backups")).toBe("Changed by an administrator, at the machine:");
    expect(atTheMachine(caps(), install([], { service: "none" }), "backups")).toBe("This install runs no services, so at the machine:");
    expect(atTheMachine(caps(), { service: "systemd" } as unknown as Install, "backups")).toBe("This supervisor is older than the button, so at the machine:");
    const waits = { service: "systemd", changes: { served: [], wait: "the helper on this machine was written before it could change the setup: update this install" } } as unknown as Install;
    expect(atTheMachine(caps(), waits, "signin")).toBe("The helper on this machine was written before it could change the setup: update this install. Until then, at the machine:");
  });
});

describe("what a form holds before it is sent", () => {
  it("holds a first person to the desk's rules", () => {
    expect(firstRefusal("astrid", "correct horse")).toBeNull();
    expect(firstRefusal("as trid", "correct horse")).not.toBeNull();
    expect(firstRefusal("astrid", "short")).toBe("A password is at least eight characters.");
  });

  it("asks a first person going to passwords, and a provider's issuer, client and secret", () => {
    const local = { ...NO_SIGNIN, mode: "local" as const };
    expect(signinRefusal(local, "off")).not.toBeNull();
    expect(signinRefusal({ ...local, name: "astrid", password: "correct horse" }, "off")).toBeNull();
    expect(signinRefusal(local, "local")).toBe("People sign in with a password here already.");
    const oidc = { ...NO_SIGNIN, mode: "oidc" as const, issuer: "https://id.example.org/o/nils/", clientId: "desk", secret: "s" };
    expect(signinRefusal(oidc, "local")).toBeNull();
    expect(signinRefusal({ ...oidc, issuer: "http://id.example.org/" }, "local")).toBe("The issuer is an address starting with https://.");
    expect(signinRefusal({ ...oidc, issuer: "http://127.0.0.1:9000/" }, "local")).toBeNull();
    expect(signinRefusal({ ...oidc, secret: " " }, "local")).not.toBeNull();
    expect(signinRefusal({ ...oidc, roles: "two words" }, "local")).not.toBeNull();
    expect(signinBody({ ...oidc, issuer: " https://id.example.org/o/nils/ " })).toEqual({ mode: "oidc", oidc: { issuer: "https://id.example.org/o/nils/", client_id: "desk", client_secret: "s", roles_claim: "roles" } });
    expect(signinBody({ ...local, name: " astrid ", password: "correct horse" })).toEqual({ mode: "local", first: { name: "astrid", password: "correct horse" } });
  });

  it("takes a backup folder's whole path, outside the registry", () => {
    expect(folderRefusal("/data/archives", "/opt/nils/registry")).toBeNull();
    expect(folderRefusal("archives", null)).not.toBeNull();
    expect(folderRefusal("/data/../etc", null)).not.toBeNull();
    expect(folderRefusal("/opt/nils/registry/b", "/opt/nils/registry")).toBe("A folder beside the registry, not inside it.");
    expect(folderRefusal("/opt/nils/registry-backups", "/opt/nils/registry")).toBeNull();
  });

  it("takes a model server's address and key, and the model only where named", () => {
    expect(modelRefusal({ server: "models.example.org", key: "k", model: "" })).not.toBeNull();
    expect(modelRefusal({ server: "https://models.example.org/v1", key: " ", model: "" })).not.toBeNull();
    expect(modelRefusal({ server: "https://models.example.org/v1", key: "k", model: "" })).toBeNull();
    expect(modelBody({ server: "https://models.example.org/v1 ", key: "k", model: " " })).toEqual({ server: "https://models.example.org/v1", key: "k" });
    expect(modelBody({ server: "https://m/v1", key: "k", model: "qwen" })).toEqual({ server: "https://m/v1", key: "k", model: "qwen" });
  });
});
