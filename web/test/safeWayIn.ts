// SPDX-License-Identifier: AGPL-3.0-only
// What the tests of the one safe way in for data share (Wave 7a, H2 round 1):
// an engine that reads a dataset from its structure, as its capabilities say
// it, a root it explored into datasets of each state, the engine's question
// when an unknown dataset's entries would move, and a fetch that answers by
// door and keeps every call it was asked.

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
    fields: ["arrives", "move_into", "identity", "unmapped", "patient_id", "subjects", "folder", "cohort", "tags", "confirm_move", "move_into_anon"],
    arrives: ["undeclared", "identified", "deidentified", "coded"],
    states: ["identified", "anonymised", "both", "unknown"],
    kinds: ["dataset", "root", "legacy"],
    move_into: ["originals", "anon"],
    trees: { originals: "derivatives/dcm-original", anon: "derivatives/dcm-anon" },
    patient_id: ["subject-code", "id-type:<name>"],
    subjects: ["map", "generated"],
    folder: ["subject-code", "id-type"],
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

const SETTINGS = (anonymised: boolean) => ({
  patient_id: { choices: ["subject-code", "id-type:<name>"], required: anonymised, default: anonymised ? null : "subject-code" },
  subjects: anonymised
    ? {
        choices: ["map", "generated"],
        required: true,
        map: "a map of subject codes to the dataset's ids, given or already in the registry; a file whose id no map names is held",
        generated: "the subject code generator makes each code from the id, as from a personnummer; every subject is a subject, never provisional",
      }
    : null,
  folder: { choices: ["subject-code", "id-type"], default: "subject-code" },
});

/** A dataset of loose DICOM beside derivatives/ and no tree: its structure says nothing, and a person says where its entries go. */
export const UNKNOWN: Layout = {
  v0: null,
  derivatives: false,
  originals: false,
  anon: false,
  raw: false,
  state: "unknown",
  reads: null,
  pseudonymises: false,
  loose: 3,
  loose_entries: ["notes.txt", "sub-1", "sub-2"],
  loose_dicom: ["sub-1", "sub-2"],
  question: true,
  move_into: {
    choices: ["originals", "anon"],
    trees: { originals: ORIGINALS, anon: ANON },
    entries: 2,
    originals: "identified data: the pseudonymiser reads it and writes the anonymised copy",
    anon: "already anonymised: the registry reads it",
  },
  settings: SETTINGS(false) as Layout["settings"],
  moved: null,
  renamed: false,
};

/** A dataset with only dcm-anon: already anonymised, read once it says what PatientID holds and how subjects are found. */
export const ANONYMISED: Layout = { ...UNKNOWN, derivatives: true, anon: true, state: "anonymised", reads: ANON, loose: 0, loose_entries: [], loose_dicom: [], question: false, move_into: null, settings: SETTINGS(true) as Layout["settings"] };

/** A dataset with only dcm-original: identified, pseudonymised before it is read. */
export const IDENTIFIED: Layout = { ...ANONYMISED, originals: true, anon: true, state: "identified", pseudonymises: true, settings: SETTINGS(false) as Layout["settings"] };

/** The engine's answer to a move nobody confirmed: 409, nothing written. */
export const ASKED = {
  error: "/srv/in/ward-c holds 2 entries with DICOM beside derivatives/: they would be moved into derivatives/dcm-original, and nothing is moved without a confirmation. Nothing was written. Confirm the move (--confirm-move, or confirm_move: true)",
  disclosure: "safe",
  layout: UNKNOWN,
  confirm: "confirm_move",
};

const at = (id: number, name: string, dataset: Record<string, unknown>) => ({ id, name, role: "source", path: `/srv/in/${name}`, guarantees: {}, probed: null, probed_at: null, retired_at: null, dataset: { kind: "dataset", root: "incoming", folder: "subject-code", ...dataset } });

export const WARD_A = at(2, "ward-a", { state: "identified", arrives: "identified", patient_id: "subject-code", subjects: null });
export const WARD_B = at(3, "ward-b", { state: "anonymised", arrives: "deidentified", patient_id: null, subjects: null });
export const WARD_C = at(4, "ward-c", { state: "unknown", arrives: "undeclared", patient_id: null, subjects: null });

/** The places door's answer to the root added: the root, and the datasets it found under it, one it could not settle among them. */
export const EXPLORED = {
  id: 1,
  name: "incoming",
  role: "source",
  path: "/srv/in",
  guarantees: {},
  probed: null,
  probed_at: null,
  retired_at: null,
  dataset: { kind: "root", state: "unknown", arrives: "undeclared", root: null },
  layout: { root: true, datasets: 3, loose: 1 },
  datasets: [
    { ...WARD_A, layout: IDENTIFIED, new: true },
    { ...WARD_B, layout: ANONYMISED, new: true },
    { ...WARD_C, layout: UNKNOWN, new: true },
    { name: "broken", path: "/srv/in/broken", layout: { error: "/srv/in/broken holds both derivatives/dcm-raw and derivatives/dcm-anon; keep one" }, new: false },
  ],
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

/** A button by its words, or by the name it is read out by, or null. */
export function button(host: ParentNode, words: string | RegExp): HTMLButtonElement | null {
  const says = (t: string | null | undefined) => (typeof words === "string" ? t?.trim() === words : words.test(t ?? ""));
  return ([...host.querySelectorAll("button")].find((b) => says(b.textContent) || says(b.getAttribute("aria-label"))) as HTMLButtonElement | undefined) ?? null;
}

/** A radio by the words of its label. */
export function radio(host: ParentNode, words: string): HTMLInputElement {
  const label = [...host.querySelectorAll("label")].find((l) => l.textContent?.includes(words));
  const input = label?.querySelector("input");
  if (!input) throw new Error(`no choice "${words}"`);
  return input as HTMLInputElement;
}
