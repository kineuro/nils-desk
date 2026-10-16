// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Start a query (gate T31, walkthrough step 14.7): the dialog started from
// everyone or typed cohorts only, and its text promised a saved selection, a
// kept result and a list of IDs that it did not offer. It offers them now,
// each chosen from a list, and asks the engine's start door in its words.
// A list of IDs is uploaded first, kept nowhere on the page, and the dialog
// says how many matched no subject. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { StartDialog } from "./StartDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  location.hash = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  location.hash = "";
});

const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};

const DOORS = ["POST /api/ask/start", "POST /api/ask/documents", "GET /api/ask/selections", "GET /api/ask/handles", "POST /api/ask/values", "GET /api/linkage/types"];
const dialog = () => host.querySelector("dialog[open]")!;
const radios = () => [...dialog().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const pick = (words: string) => radios().find((r) => r.closest("label")?.textContent?.startsWith(words))!;
const select = (label: string) => dialog().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
const lede = () => dialog().querySelector(".lede")?.textContent;

const SELECTIONS = {
  count: 2,
  total: 2,
  matching: 2,
  next: null,
  selections: [
    { id: 3, name: "high-field", spec: "selection:high-field@2", description: null, versions: 2, grain: "stack", owner: "astrid", created_at: "2026-10-01T10:00:00Z", updated_at: null, updated_by: null, note: null, cohort: null, size: { rows: 1204, grain: "stack", version: 2, handle: 71, at: "2026-10-02T10:00:00Z", truncated: false } },
    { id: 4, name: "flair-only", spec: "selection:flair-only@1", description: null, versions: 1, grain: "subject", owner: "erik", created_at: "2026-10-01T10:00:00Z", updated_at: null, updated_by: null, note: null, cohort: null, size: null },
  ],
};
const handleRow = (over: Record<string, unknown>) => ({ id: 71, name: "north T1w", grain: "stack", row_count: 250, content_hash: "x", principal: "astrid", actor: {}, created_at: "", epoch: 4, pack_version: "0.1.1", disclosure: "local", truncated: false, limit: null, kept: true, last_read_at: null, withdrawn_at: null, ask_hash: "h", columns: ["_key"], ...over });
const HANDLES = { count: 4, handles: [handleRow({ id: 71 }), handleRow({ id: 72, name: "cut off", truncated: true }), handleRow({ id: 73, name: "dropped", kept: false }), handleRow({ id: 74, name: null, grain: "subject", row_count: 12 })] };
const TYPES = { types: [{ name: "study-id", label: "the study's own number", description: null }, { name: "site-id", description: "a hospital's record number", identifying: true }] };
const OPENING = { document: { ast_version: 1, sets: { start: { grain: "stack", from: "selection:high-field@2" } }, out: { set: "start", level: "count" } }, set: "start", grain: "stack", count: 1204, subjects: 48, sessions: 172, epoch: 4 };

/** The engine's doors with an answer each; what a test passes answers first. */
function routes(extra: Parameters<typeof engine>[0] = () => undefined) {
  return engine((c, nth) => {
    const own = extra(c, nth);
    if (own) return own;
    if (c.method === "GET" && c.url === "/api/ask/selections?limit=200") return { status: 200, body: SELECTIONS };
    if (c.method === "GET" && c.url === "/api/ask/handles?limit=200") return { status: 200, body: HANDLES };
    if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: TYPES };
    if (c.method === "POST" && c.url === "/api/ask/start") return { status: 200, body: OPENING };
    if (c.method === "POST" && c.url === "/api/ask/documents") return { status: 200, body: { document: 12, hash: "h", ask: OPENING.document } };
    return undefined;
  });
}

async function open(caps: Capabilities = caps7a(DOORS)) {
  act(() => root.render(<StartDialog caps={caps} onClose={() => undefined} />));
  await settle();
}

describe("Start a query", () => {
  it("offers a saved selection, a kept result and a list of IDs beside everyone and cohorts, and promises nothing it does not do", async () => {
    const e = routes();
    await open();
    expect(radios().map((r) => r.closest("label")?.textContent)).toEqual(["Everyone the registry holds", "One or more cohorts", "A saved selection", "A kept result", "A list of IDs"]);
    expect(dialog().textContent).not.toContain("New card from here");
    expect(dialog().textContent).not.toContain("Start a new card");
    // nothing is read until a choice is opened
    expect(e.calls).toEqual([]);
  });

  it("starts from a saved selection chosen from the list, by its name and the version listed, then opens the card", async () => {
    const e = routes();
    await open();
    click(pick("A saved selection"));
    await settle();
    expect(e.of("GET", "/api/ask/selections?limit=200")).toHaveLength(1);
    expect([...select("Which selection").options].map((o) => o.textContent)).toEqual(["choose a selection", "high-field · v2 · 1,204 stacks", "flair-only · v1 · not run yet"]);
    expect(button(dialog(), "Count it")!.disabled).toBe(true);
    await choose(select("Which selection"), "high-field@2");
    click(button(dialog(), "Count it"));
    await settle();
    expect(e.of("POST", "/api/ask/start").map((c) => c.body)).toEqual([{ from: { selection: "high-field@2" } }]);
    expect(lede()).toBe("1,204 stacks, 48 subjects, 172 sessions");
    click(button(dialog(), "Open as a card"));
    await settle();
    expect(e.of("POST", "/api/ask/documents")[0].body).toEqual({ document: OPENING.document });
    expect(location.hash).toBe("#query/12");
  });

  it("starts from a kept result chosen from the list, never one cut off, dropped or withdrawn", async () => {
    const e = routes();
    await open();
    click(pick("A kept result"));
    await settle();
    expect([...select("Which result").options].map((o) => o.textContent)).toEqual(["choose a result", "Result 74 · subject · 12 rows", "north T1w · stack · 250 rows"]);
    await choose(select("Which result"), "71");
    click(button(dialog(), "Count it"));
    await settle();
    expect(e.of("POST", "/api/ask/start").map((c) => c.body)).toEqual([{ from: { handle: 71 } }]);
  });

  it("says when there is nothing to choose from yet", async () => {
    routes((c) => (c.url === "/api/ask/selections?limit=200" ? { status: 200, body: { count: 0, total: 0, matching: 0, next: null, selections: [] } } : c.url === "/api/ask/handles?limit=200" ? { status: 200, body: { count: 0, handles: [] } } : undefined));
    await open();
    click(pick("A saved selection"));
    await settle();
    expect(select("Which selection").options[0].textContent).toBe("no selection saved yet");
    click(pick("A kept result"));
    await settle();
    expect(select("Which result").options[0].textContent).toBe("no kept result yet");
  });

  it("starts from a list of IDs: uploaded with its type first, counted, and it says how many matched no subject", async () => {
    const e = routes((c) => (c.method === "POST" && c.url === "/api/ask/values" ? { status: 200, body: { upload_id: "u-0123456789abcdef", source_id: 5, namespace: "study-id", digest: "d", n: 5, unresolved: [1, 4], subjects: 3 } } : undefined));
    await open();
    click(pick("A list of IDs"));
    await settle();
    expect([...select("What kind of ID").options].map((o) => o.textContent)).toEqual(["the study's own number", "site-id · leads to a person"]);
    // the first type is the one shown, so the one sent
    expect(select("What kind of ID").value).toBe("study-id");
    expect(button(dialog(), "Count it")!.disabled).toBe(true);
    await typeInto(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="The IDs"]')!, "s-001\ns-002, s-003\ns-001\n s-004;s-005");
    click(button(dialog(), "Count it"));
    await settle();
    expect(e.of("POST", "/api/ask/values").map((c) => c.body)).toEqual([{ values: ["s-001", "s-002", "s-003", "s-004", "s-005"], namespace: "study-id" }]);
    expect(e.of("POST", "/api/ask/start").map((c) => c.body)).toEqual([{ from: { values: "u-0123456789abcdef" } }]);
    expect(lede()).toBe("1,204 stacks, 48 subjects, 172 sessions");
    expect(dialog().textContent).toContain("2 of 5 IDs matched no subject.");
    // the IDs live in the dialog alone: in no address, and in no call but the upload's body
    expect(location.hash).toBe("");
    expect(e.calls.filter((c) => c.url.includes("s-00"))).toEqual([]);
  });

  it("says the engine's own words where it refuses the opening document, as it does for a list it does not know yet", async () => {
    routes((c) => {
      if (c.method === "POST" && c.url === "/api/ask/values") return { status: 200, body: { upload_id: "u-0123456789abcdef", source_id: 5, namespace: "study-id", digest: "d", n: 2, unresolved: [], subjects: 2 } };
      if (c.method === "POST" && c.url === "/api/ask/start") return { status: 400, body: { error: "the opening document", issues: [{ code: "unknown_set", path: "sets.people.from", message: "upload u-0123456789abcdef is not known; uploads live only until resolved", next: "POST /api/ask/values again" }] } };
      return undefined;
    });
    await open();
    click(pick("A list of IDs"));
    await settle();
    await typeInto(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="The IDs"]')!, "s-001\ns-002");
    click(button(dialog(), "Count it"));
    await settle();
    expect(dialog().textContent).toContain("the opening document: upload u-0123456789abcdef is not known; uploads live only until resolved");
    expect(button(dialog(), "Count it")!.disabled).toBe(false);
  });

  it("sends the type chosen, not only the first", async () => {
    const e = routes((c) => (c.method === "POST" && c.url === "/api/ask/values" ? { status: 200, body: { upload_id: "u-aaaaaaaaaaaaaaaa", source_id: 6, namespace: "site-id", digest: "d", n: 1, unresolved: [], subjects: 1 } } : undefined));
    await open();
    click(pick("A list of IDs"));
    await settle();
    await choose(select("What kind of ID"), "site-id");
    await typeInto(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="The IDs"]')!, "r-17");
    click(button(dialog(), "Count it"));
    await settle();
    expect(e.of("POST", "/api/ask/values")[0].body).toEqual({ values: ["r-17"], namespace: "site-id" });
    expect(dialog().textContent).not.toContain("matched no subject");
  });

  it("says the engine's refusal of a list, and keeps what was pasted", async () => {
    routes((c) => (c.method === "POST" && c.url === "/api/ask/values" ? { status: 400, body: { error: "the linkage store has no identifier type named study-id" } } : undefined));
    await open();
    click(pick("A list of IDs"));
    await settle();
    await typeInto(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="The IDs"]')!, "s-001");
    click(button(dialog(), "Count it"));
    await settle();
    expect(dialog().textContent).toContain("the linkage store has no identifier type named study-id");
    expect(dialog().querySelector<HTMLTextAreaElement>('textarea[aria-label="The IDs"]')!.value).toBe("s-001");
    expect(button(dialog(), "Count it")!.disabled).toBe(false);
  });

  it("counts again after a change: a count belongs to what it was asked of", async () => {
    routes();
    await open();
    click(pick("A saved selection"));
    await settle();
    await choose(select("Which selection"), "high-field@2");
    click(button(dialog(), "Count it"));
    await settle();
    expect(button(dialog(), "Open as a card")).not.toBeNull();
    await choose(select("Which selection"), "flair-only@1");
    expect(button(dialog(), "Open as a card")).toBeNull();
    expect(lede()).toBeUndefined();
    expect(button(dialog(), "Count it")!.disabled).toBe(false);
  });

  it("leaves out a choice the engine has no door for", async () => {
    routes();
    await open(caps7a(["POST /api/ask/start", "POST /api/ask/documents"]));
    expect(radios().map((r) => r.closest("label")?.textContent)).toEqual(["Everyone the registry holds", "One or more cohorts"]);
  });

  it("shows a list of IDs to a person who may not use it, disabled, and says what it needs", async () => {
    routes();
    // the door is there, the person lacks work on the Query page
    const reader: Grant[] = ["query:see", "data:see"];
    await open(caps7a(DOORS, reader));
    expect(pick("A list of IDs").disabled).toBe(true);
    expect(dialog().querySelector('[role="note"]')?.getAttribute("aria-label")).toBe("A list of IDs needs work on the Query page.");
    // work on the Query page, at plain detail: the upload asks to see sex and age in records
    const plain = caps7a(DOORS, ["query:see", "query:work", "data:see"]);
    plain.person.detail = "plain";
    await open(plain);
    expect(pick("A list of IDs").disabled).toBe(true);
    expect(dialog().querySelector('[role="note"]')?.getAttribute("aria-label")).toBe("A list of IDs asks to see sex and age in records.");
  });
});
