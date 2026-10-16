// SPDX-License-Identifier: AGPL-3.0-only
// The key store, at the engine's doors (record 55, ruling 35 (c); gate T31,
// steps 8.6 and 8.7). A passphrase goes only in the body of one call over the
// desk's own door: never in an address, never kept in the browser, never in a
// log, and it is let go of as soon as the call is sent.

import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";

export interface Key {
  name: string;
  bytes: number;
  fingerprint: string;
  in_use: boolean;
}

export interface KeyStore {
  pseudonym_key: string;
  present: boolean;
  max_bytes: number;
  keys: Key[];
}

export interface KeyAdded {
  name: string;
  bytes: number;
  fingerprint: string;
  in_use: boolean;
  checked: string;
}

export const keys = {
  list: () => door<KeyStore>("GET", "/api/keys"),
  add: (name: string, passphrase: string) => door<KeyAdded>("POST", "/api/keys", { name, passphrase }),
  remove: (name: string, confirm: string) => door<{ name: string; removed: boolean }>("POST", `/api/keys/${encodeURIComponent(name)}/remove`, { confirm }),
};

/** Whether the person may change the key store: an admin's, at every detail. */
export function keysWork(caps: Capabilities): boolean {
  return served(caps, "POST /api/keys") && may(caps, "database:work") && may(caps, "install:work") && sees(caps, "sensitive");
}

/** Whether the person may read the key store. */
export function keysSee(caps: Capabilities): boolean {
  return served(caps, "GET /api/keys") && may(caps, "database:see");
}

/** A key's name as the store takes it. */
export function keyNameRefusal(name: string): string | null {
  const k = name.trim();
  if (!k) return "a name";
  if (k.length > 64 || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u.test(k)) return "a name of letters, digits, dots, dashes and underscores";
  return null;
}

/** Why a passphrase cannot be sent yet, or null; counted in bytes, as the store counts. */
export function passphraseRefusal(passphrase: string, most = 64): string | null {
  const bytes = new TextEncoder().encode(passphrase.replace(/\r?\n$/u, "")).length;
  if (bytes === 0) return "the passphrase";
  if (bytes > most) return `a passphrase of at most ${most} bytes`;
  return null;
}
