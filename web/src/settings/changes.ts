// SPDX-License-Identifier: AGPL-3.0-only
// The setup steps the supervisor makes (record 55 ruling 35 (c), gate T31):
// how people sign in, the engine's backup folder, the stations' model server,
// and an archive put back. Whether this install's supervisor makes one for
// this person, what a form must hold before it is sent, and what stands where
// the button does not: who makes the step, or the one line said where it
// stays at the machine.

import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import type { Change, Install, ModelBody, SigninBody } from "./supervise";

/** Whether the supervisor of this install makes a change, for a person who may work on the install. */
export function serves(caps: Capabilities, install: Install | null, change: Change): boolean {
  return install !== null && may(caps, "install:work") && (install.changes?.served ?? []).includes(change);
}

/** What a person reads where a button does not stand for them: one line, and whether a command follows it. */
export interface Said {
  line: string;
  /** Only for a person who may work on the install, where the step stays at the machine. */
  command: boolean;
}

/** Who makes each step, said to a person who may not: no command, and no place (gate T31, G2). */
const WHO: Record<Change, string> = {
  signin: "An administrator changes how people sign in.",
  backups: "An administrator gives the engine a folder.",
  model: "An administrator starts Kvasir again or names a model server.",
  restore: "An administrator puts an archive back.",
};

/**
 * What stands where a step's button does not, or null where the button
 * stands (gate T31, G2). A person who may not work on the install reads who
 * makes the step, wherever it is made. One who may reads why it stays at the
 * machine, above its command.
 */
export function instead(caps: Capabilities, install: Install | null, change: Change): Said | null {
  if (serves(caps, install, change)) return null;
  if (!may(caps, "install:work")) return { line: WHO[change], command: false };
  return { line: whyAtTheMachine(caps, install), command: true };
}

/**
 * Why a step stays at the machine: no supervisor configured, or one that did
 * not answer; its helper waiting to be written again; an install that runs
 * no services; or a supervisor older than the button.
 */
function whyAtTheMachine(caps: Capabilities, install: Install | null): string {
  if (!install) return caps.desk.settings?.supervisor_url ? "The supervisor did not answer, so at the machine:" : "This desk reaches no supervisor, so at the machine:";
  if (install.changes?.wait) return `${capital(install.changes.wait)}. Until then, at the machine:`;
  if (install.service === "" || install.service === "none") return "This install runs no services, so at the machine:";
  return "This supervisor is older than the button, so at the machine:";
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The desk's rules for a first person, as nils-desk and the engine hold them. */
export function firstRefusal(name: string, password: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name.trim())) return "A username is letters, digits, dots, dashes and underscores.";
  if (new TextEncoder().encode(password).length < 8) return "A password is at least eight characters.";
  return null;
}

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

export interface SigninDraft {
  mode: "local" | "oidc";
  name: string;
  password: string;
  issuer: string;
  clientId: string;
  secret: string;
  roles: string;
}

export const NO_SIGNIN: SigninDraft = { mode: "local", name: "", password: "", issuer: "", clientId: "", secret: "", roles: "roles" };

/**
 * What a sign-in form must hold before it is sent: a first person where the
 * desk goes to passwords from a mode that kept none (the run checks whether
 * the desk keeps someone already), or a provider's issuer, client and secret.
 */
export function signinRefusal(d: SigninDraft, current: string): string | null {
  if (d.mode === current && d.mode === "local") return "People sign in with a password here already.";
  if (d.mode === "local") return current === "local" ? null : firstRefusal(d.name, d.password);
  const issuer = d.issuer.trim();
  if (!(issuer.startsWith("https://") || LOOPBACK.test(issuer))) return "The issuer is an address starting with https://.";
  if (!d.clientId.trim() || !d.secret.trim()) return "The desk's client id and its secret are both needed.";
  if (!d.roles.trim() || /\s/.test(d.roles.trim())) return "The claim is one name, as roles.";
  return null;
}

/** The body the supervisor's door takes. */
export function signinBody(d: SigninDraft): SigninBody {
  if (d.mode === "local") return { mode: "local", first: { name: d.name.trim(), password: d.password } };
  return { mode: "oidc", oidc: { issuer: d.issuer.trim(), client_id: d.clientId.trim(), client_secret: d.secret.trim(), roles_claim: d.roles.trim() } };
}

/** A backup folder's path, before it is sent. */
export function folderRefusal(path: string, home: string | null): string | null {
  const p = path.trim();
  if (!p.startsWith("/")) return "A folder's whole path, as /data/archives.";
  if (p.split("/").includes("..")) return "A path with no .. in it.";
  if (home && (p === home || p.startsWith(`${home.replace(/\/+$/u, "")}/`))) return "A folder beside the registry, not inside it.";
  return null;
}

export interface ModelDraft {
  server: string;
  key: string;
  model: string;
}

export function modelRefusal(d: ModelDraft): string | null {
  if (!/^https?:\/\//.test(d.server.trim())) return "The server's address starts with http:// or https://.";
  if (!d.key.trim() || d.key.trim().includes("\n")) return "The server's key is needed.";
  return null;
}

export function modelBody(d: ModelDraft): ModelBody {
  const model = d.model.trim();
  return { server: d.server.trim(), key: d.key.trim(), ...(model ? { model } : {}) };
}

/** What a restore does, in the words the dialog says before it is pressed. */
export function restoreWords(archive: string): string[] {
  return [
    `Puts ${archive} back over the registry.`,
    "The registry as it stands is archived first, beside it. The engine stops until it is done.",
    "The key store is in no archive and stays as it is.",
  ];
}
