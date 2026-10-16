// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Uninstall NILS from the desk (gate T31, walkthrough step 1.9): offered at
// the foot of Settings > Setup only where a supervisor keeps this install
// and the person holds install work; the dialog says what goes and what
// stays, asks the directory's name typed either way, and hands the
// uninstall to the supervisor.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Install } from "./supervise";
import { UninstallSection } from "./Uninstall";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const INSTALL = { dir: "/data/site", service: "systemd" } as unknown as Install;
const PREVIEW = { dir: "/data/site", name: "site", install: "engine 1.0.0 in /data/site", helper: false, keep_data: ["Removing", "  programs     /usr/local/bin/nils", "Keeping", "  data         /data/site"], everything: ["Removing", "  data         /data/site and everything in it", "Keeping", "  nothing      that this setup made"], everything_refused: null };
const AT = "/supervise/api/supervise/uninstall";

const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

async function opened(preview: { status: number; body: unknown } = { status: 200, body: PREVIEW }) {
  const e = engine((c) => {
    if (c.method === "GET" && c.url === AT) return preview;
    if (c.method === "POST" && c.url === AT) return { status: 202, body: { id: "r1", what: "uninstall", state: "running" } };
    return undefined;
  });
  act(() => root.render(<UninstallSection caps={caps7a([])} install={INSTALL} />));
  act(() => button(host, /^Uninstall NILS$/u)!.click());
  await settle();
  return { e, dialog: host.querySelector("dialog[open]")! };
}

describe("Uninstall", () => {
  it("is offered only where a supervisor keeps the install, to a person with install work", () => {
    act(() => root.render(<UninstallSection caps={caps7a([])} install={null} />));
    expect(button(host, /Uninstall NILS/u)).toBeFalsy();
    act(() => root.render(<UninstallSection caps={caps7a([], ["install:see"])} install={INSTALL} />));
    expect(button(host, /Uninstall NILS/u)).toBeFalsy();
    act(() => root.render(<UninstallSection caps={caps7a([])} install={INSTALL} />));
    expect(button(host, /Uninstall NILS/u)).toBeTruthy();
  });

  it("keeps the data unless asked, and goes only once the directory's name is typed", async () => {
    const { e, dialog } = await opened();
    expect(dialog.textContent).toContain("Type site to uninstall");
    expect(dialog.querySelector("pre")?.textContent).toContain("Keeping");
    const go = () => button(dialog, /^Uninstall$/u)!;
    expect(go().disabled).toBe(true);
    await type(dialog.querySelector('input[aria-label="The install\'s directory name"]')!, "sit");
    expect(go().disabled).toBe(true);
    await type(dialog.querySelector('input[aria-label="The install\'s directory name"]')!, "site");
    expect(go().disabled).toBe(false);
    act(() => go().click());
    await settle();
    expect(e.of("POST", AT).map((c) => c.body)).toEqual([{ leave: "nils", confirm: "site" }]);
    expect(dialog.textContent).toContain("your data stays in /data/site");
  });

  it("warns before everything goes, and sends everything", async () => {
    const { e, dialog } = await opened();
    act(() => (dialog.querySelectorAll('input[name="leave"]')[1] as HTMLInputElement).click());
    expect(dialog.textContent).toContain("This cannot be undone");
    expect(dialog.querySelector("pre")?.textContent).toContain("and everything in it");
    await type(dialog.querySelector('input[aria-label="The install\'s directory name"]')!, "site");
    act(() => button(dialog, /^Uninstall$/u)!.click());
    await settle();
    expect(e.of("POST", AT).map((c) => c.body)).toEqual([{ leave: "everything", confirm: "site" }]);
  });

  it("says when the supervisor is older than the uninstall, and when a purge would be refused", async () => {
    const older = await opened({ status: 404, body: { error: "GET /api/supervise/uninstall is not a door" } });
    expect(older.dialog.textContent).toContain("This supervisor cannot uninstall yet");
    act(() => root.unmount());
    root = createRoot(host);
    const { dialog } = await opened({ status: 200, body: { ...PREVIEW, everything_refused: "it is the home directory, or holds it" } });
    act(() => (dialog.querySelectorAll('input[name="leave"]')[1] as HTMLInputElement).click());
    await type(dialog.querySelector('input[aria-label="The install\'s directory name"]')!, "site");
    expect(dialog.textContent).toContain("will not be removed: it is the home directory");
    expect(button(dialog, /^Uninstall$/u)!.disabled).toBe(true);
  });
});
