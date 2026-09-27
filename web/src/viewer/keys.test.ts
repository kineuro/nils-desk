// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { ROW_KEYS, CANDIDATE_KEYS, CANT_TELL_KEYS, UNSURE_KEY } from "../campaigns/client";
import { viewerKey } from "./keys";

const body = { tagName: "BODY", closest: () => null };

describe("the pictures' keys", () => {
  it("Space enlarges a plane and gives the three back; Escape gives them back", () => {
    expect(viewerKey(" ", { view: "planes", enlarged: false, target: body })).toEqual({ kind: "enlarge" });
    expect(viewerKey(" ", { view: "planes", enlarged: true, target: body })).toEqual({ kind: "restore" });
    expect(viewerKey("Escape", { view: "planes", enlarged: true, target: body })).toEqual({ kind: "restore" });
    // nothing to give back, and the stack view has one picture already
    expect(viewerKey("Escape", { view: "planes", enlarged: false, target: body })).toBeNull();
    expect(viewerKey(" ", { view: "stack", enlarged: false, target: body })).toBeNull();
  });

  it("the arrows page a plane at a time, Page Up and Down ten", () => {
    expect(viewerKey("ArrowDown", { view: "stack", enlarged: false, target: body })).toEqual({ kind: "page", delta: 1 });
    expect(viewerKey("ArrowUp", { view: "planes", enlarged: false, target: body })).toEqual({ kind: "page", delta: -1 });
    expect(viewerKey("PageDown", { view: "planes", enlarged: true, target: body })).toEqual({ kind: "page", delta: 10 });
    expect(viewerKey("PageUp", { view: "stack", enlarged: false, target: body })).toEqual({ kind: "page", delta: -10 });
  });

  it("is never a field's, a drawer's, a button's Space, or a key with a modifier", () => {
    expect(viewerKey("ArrowDown", { view: "stack", enlarged: false, target: { tagName: "INPUT" } })).toBeNull();
    expect(viewerKey("ArrowDown", { view: "stack", enlarged: false, target: { tagName: "DIV", closest: (s) => (s.includes(".drawer") ? {} : null) } })).toBeNull();
    expect(viewerKey(" ", { view: "planes", enlarged: false, target: { tagName: "BUTTON", closest: () => null } })).toBeNull();
    expect(viewerKey("ArrowDown", { view: "stack", enlarged: false, target: body, modifier: true })).toBeNull();
  });

  it("takes no key an answer uses", () => {
    const answers = [...ROW_KEYS.join(""), ...CANDIDATE_KEYS, ...CANT_TELL_KEYS, UNSURE_KEY, "s", "u", "h", "H", "b", "/", "?", "Enter", "Backspace"];
    for (const k of answers) for (const view of ["stack", "planes"] as const) expect(viewerKey(k, { view, enlarged: true, target: body }), k).toBeNull();
  });
});
