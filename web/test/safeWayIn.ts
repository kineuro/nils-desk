// SPDX-License-Identifier: AGPL-3.0-only
// What the tests of the one safe way in for data share (Wave 7a, H2 round 1):
// an engine that asks first, as its capabilities say it, a folder with loose
// entries and no tree as its look answers it, the engine's question when a
// declaration would move them, and a fetch that answers by door and keeps
// every call it was asked.

import { act } from "react";
import { vi } from "vitest";
import type { Capabilities } from "../src/capabilities";
import type { Layout } from "../src/data/datasets";
import { GRANTS } from "../src/grants";

export const ASKS_FIRST = {
  enforced: true,
  count: 1,
  roles: ["source", "registry", "working", "export", "share", "exchange", "backup"],
  dataset: {
    grant: "data:work",
    fields: ["arrives", "identity", "unmapped", "patient_id", "cohort", "tags", "confirm_move", "move_into_anon"],
    arrives: ["undeclared", "identified", "deidentified", "coded"],
    trees: { originals: "derivatives/dcm-original", anon: "derivatives/dcm-anon" },
    patient_id: ["subject-code", "id-type:<name>"],
  },
};

export function caps7a(doors: string[], grants: readonly string[] = GRANTS): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.80" },
      contracts: { openapi: "7", suite: "2" },
      doors,
      policy: [],
      auth: "off",
      principal: "astrid",
      roles: ["reader", "reviewer", "operator", "admin"],
      registry: { epoch: 1 },
      packs: [{ name: "mri", version: "0.25.0" }],
      places: ASKS_FIRST,
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: [...grants] as Capabilities["person"]["grants"], detail: "sensitive", groups: [] },
    desk: { version: "1", mode: "off", contracts: { openapi: "7", suite: "2" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

const ORIGINALS = "derivatives/dcm-original";
const ANON = "derivatives/dcm-anon";

/** A folder of loose DICOM with neither tree, as the engine's look answers it. */
export const LOOSE: Layout = {
  v0: null,
  originals: false,
  anon: false,
  raw: false,
  loose: 3,
  loose_entries: ["notes.txt", "sub-1", "sub-2"],
  question: true,
  declarations: {
    identified: { reads: ORIGINALS, tree_there: false, moves: 3, into: ORIGINALS, needed: true },
    deidentified: { reads: ANON, tree_there: false, moves: 3, into: ANON, needed: true },
    coded: { reads: ANON, tree_there: false, moves: 3, into: ANON, needed: true },
  },
  moved: null,
  renamed: false,
};

/** The engine's answer to a declaration that would move entries nobody confirmed: 409, nothing written. */
export const ASKED = {
  error: "/srv/in/ward-a holds 3 loose entries and no derivatives/dcm-original: declared identified, they would be moved into derivatives/dcm-original, and nothing is moved without a confirmation. Nothing was written. Confirm the move (--confirm-move, or confirm_move: true), or leave the folder undeclared",
  disclosure: "safe",
  layout: LOOSE,
  confirm: "confirm_move",
};

export interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

type Route = (call: Call, nth: number) => { status: number; body?: unknown } | undefined;

/** A fetch that answers by door, in order of the routes, and keeps every call. */
export function engine(route: Route) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(input), body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null };
    calls.push(call);
    const nth = calls.filter((c) => c.method === call.method && c.url === call.url).length;
    const a = route(call, nth) ?? { status: 404, body: { error: `no door ${call.method} ${call.url}` } };
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status });
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, of: (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url) };
}

/** jsdom draws a dialog but does not open one modally. */
export function dialogs() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal: () => void; close: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

/** Every promise the last act started, settled. */
export async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
  }
}

/** A button by its words, or null. */
export function button(host: ParentNode, words: string | RegExp): HTMLButtonElement | null {
  return ([...host.querySelectorAll("button")].find((b) => (typeof words === "string" ? b.textContent?.trim() === words : words.test(b.textContent ?? ""))) as HTMLButtonElement | undefined) ?? null;
}

/** A radio by the words of its label. */
export function radio(host: ParentNode, words: string): HTMLInputElement {
  const label = [...host.querySelectorAll("label")].find((l) => l.textContent?.includes(words));
  const input = label?.querySelector("input");
  if (!input) throw new Error(`no choice "${words}"`);
  return input as HTMLInputElement;
}
