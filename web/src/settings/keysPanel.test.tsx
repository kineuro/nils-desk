// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Record 55, ruling 35 (c), gate T31 steps 8.6, 8.7 and 13.4: the key store
// on Backups and a handover's password in the Hand over dialog. A passphrase
// goes only in the body of the one call that makes the key, is cleared from
// its field as it goes, and is never in an address, the page or the
// browser's storage; a password is shown once and gone once the person says
// it is copied. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Release } from "../data/cohorts";
import { placesKept } from "../objects/kept";
import { PasswordOnce } from "../ops/HandoverPassword";
import { HandoverDialog } from "../ops/ReleaseActs";
import { KeysPanel } from "./KeysPanel";
import { keyNameRefusal, passphraseRefusal } from "./keys";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET = "correct horse battery staple 77";
const PASSWORD = "9f".repeat(32);

let host: HTMLDivElement;
let root: Root;
let stored: { mock: { calls: unknown[][] } };
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  stored = vi.spyOn(Storage.prototype, "setItem");
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};
const input = (label: string) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  expect(l, label).toBeDefined();
  return document.getElementById(l!.htmlFor) as HTMLInputElement;
};
/** Nothing of a secret anywhere it must not be: the page, the addresses called, the browser's storage. */
const nowhere = (e: ReturnType<typeof engine>, secret: string) => {
  expect(document.body.innerHTML).not.toContain(secret);
  for (const c of e.calls) {
    expect(c.url).not.toContain(secret);
    expect(c.url).not.toContain(encodeURIComponent(secret));
  }
  for (const call of stored.mock.calls) expect(JSON.stringify(call)).not.toContain(secret);
};

const KEY_DOORS = ["GET /api/keys", "POST /api/keys", "POST /api/keys/{name}/remove"];
const ADMIN = ["database:see", "database:work", "install:see", "install:work"];
const STORE = (present: boolean) => ({
  pseudonym_key: "nils",
  present,
  max_bytes: 64,
  keys: [...(present ? [{ name: "nils", bytes: 15, fingerprint: "1a2b3c4d", in_use: true }] : []), { name: "partner-2026", bytes: 31, fingerprint: "5e6f7a8b", in_use: false }],
});

describe("the keys on Backups", () => {
  it("makes the pseudonym key again from its passphrase, which goes in one body and nowhere else", async () => {
    let present = false;
    const e = engine((c) => {
      if (c.url === "/api/keys" && c.method === "GET") return { status: 200, body: STORE(present) };
      if (c.url === "/api/keys" && c.method === "POST") {
        present = true;
        return { status: 201, body: { name: "nils", bytes: SECRET.length, fingerprint: "1a2b3c4d", in_use: true, checked: "it opens the identifiers the linkage store keeps" } };
      }
      return undefined;
    });
    act(() => root.render(<KeysPanel caps={caps7a(KEY_DOORS, ADMIN)} pseudonymKey="nils" />));
    await settle();
    expect(host.textContent).toContain("pseudonym key missing");
    expect(host.textContent).not.toContain("nils key add");
    click(button(host, "Make the pseudonym key"));
    expect(input("Name").value).toBe("nils");
    const pass = input("Passphrase");
    expect(pass.type).toBe("password");
    expect(pass.autocomplete).toBe("off");
    await typeInto(pass, SECRET);
    click(button(document.querySelector("dialog[open]")!, "Make it"));
    // cleared as it goes, before the engine answers
    expect(pass.value).toBe("");
    await settle();
    expect(e.of("POST", "/api/keys")).toHaveLength(1);
    expect(e.of("POST", "/api/keys")[0].body).toEqual({ name: "nils", passphrase: SECRET });
    expect(host.textContent).toContain("nils made: 31 bytes, fingerprint 1a2b3c4d. It opens the identifiers the linkage store keeps.");
    expect(host.textContent).toContain("pseudonym key here");
    nowhere(e, SECRET);
  });

  it("says the engine's refusal and keeps nothing of the passphrase", async () => {
    const e = engine((c) => {
      if (c.url === "/api/keys" && c.method === "GET") return { status: 200, body: STORE(false) };
      if (c.url === "/api/keys" && c.method === "POST") return { status: 409, body: { error: "that passphrase does not open the identifiers the linkage store keeps under nils; nothing was kept" } };
      return undefined;
    });
    act(() => root.render(<KeysPanel caps={caps7a(KEY_DOORS, ADMIN)} pseudonymKey="nils" />));
    await settle();
    click(button(host, "Make the pseudonym key"));
    await typeInto(input("Passphrase"), SECRET);
    click(button(document.querySelector("dialog[open]")!, "Make it"));
    await settle();
    expect(document.body.textContent).toContain("does not open the identifiers");
    expect(input("Passphrase").value).toBe("");
    nowhere(e, SECRET);
  });

  it("takes a key away only with its name typed, and never the pseudonym key", async () => {
    const e = engine((c) => {
      if (c.url === "/api/keys" && c.method === "GET") return { status: 200, body: STORE(true) };
      if (c.url === "/api/keys/partner-2026/remove") return { status: 200, body: { name: "partner-2026", removed: true } };
      return undefined;
    });
    act(() => root.render(<KeysPanel caps={caps7a(KEY_DOORS, ADMIN)} pseudonymKey="nils" />));
    await settle();
    expect(button(host, "Remove nils")).toBeNull();
    click(button(host, "Remove partner-2026"));
    const d = document.querySelector("dialog[open]")!;
    expect(button(d, "Remove")!.disabled).toBe(true);
    await typeInto(input("Type its name"), "partner");
    expect(button(d, "Remove")!.disabled).toBe(true);
    await typeInto(input("Type its name"), "partner-2026");
    click(button(d, "Remove"));
    await settle();
    expect(e.of("POST", "/api/keys/partner-2026/remove")[0].body).toEqual({ confirm: "partner-2026" });
    expect(host.textContent).toContain("partner-2026 removed.");
  });

  it("lists the keys to whoever reads Backups, and offers a change to an admin alone", async () => {
    engine((c) => (c.url === "/api/keys" ? { status: 200, body: STORE(true) } : undefined));
    act(() => root.render(<KeysPanel caps={caps7a(KEY_DOORS, ["database:see", "database:work"])} pseudonymKey="nils" />));
    await settle();
    expect(host.textContent).toContain("partner-2026");
    expect(host.textContent).toContain("5e6f7a8b");
    expect(button(host, "Make a key")).toBeNull();
    expect(button(host, "Remove partner-2026")).toBeNull();
    expect(host.textContent).toContain("Making or removing a key is an admin's.");
  });

  it("prints the command where the engine has no key doors", async () => {
    engine(() => undefined);
    act(() => root.render(<KeysPanel caps={caps7a([], ADMIN)} pseudonymKey="nils" />));
    await settle();
    expect(host.textContent).toContain("nils key add nils");
  });

  it("refuses a name or a passphrase the store would refuse, before sending", () => {
    expect(keyNameRefusal("")).not.toBeNull();
    expect(keyNameRefusal("bad key")).not.toBeNull();
    expect(keyNameRefusal("partner-2026")).toBeNull();
    expect(passphraseRefusal("")).not.toBeNull();
    expect(passphraseRefusal("x".repeat(65))).not.toBeNull();
    expect(passphraseRefusal("å".repeat(33))).not.toBeNull();
    expect(passphraseRefusal(`${SECRET}\n`)).toBeNull();
  });
});

const release = { id: 2, name: "ms-cohort-2026-10-01", version: "2", root: "/exports/x", started_at: "2026-10-01T10:00:00Z", files: 10, subjects: 4, layout: "bids" } as unknown as Release;
const PLACES = { places: [{ id: 7, name: "outbox", role: "exchange", path: "/exchange/outbox", guarantees: {}, probed: null, probed_at: null, retired_at: null }] };

describe("a handover's password", () => {
  it("is shown once in its own dialog, stays until the copy is confirmed, and is gone after", async () => {
    const e = engine((c) => {
      if (c.url === "/api/places") return { status: 200, body: PLACES };
      if (c.url === "/api/handovers/password") return { status: 200, body: { key: "partner-2026", password: PASSWORD } };
      return undefined;
    });
    await placesKept.refresh().catch(() => undefined);
    act(() => root.render(<HandoverDialog caps={caps7a(["POST /api/handovers", "GET /api/places", "POST /api/handovers/password"], ["release:see", "release:work", "places:see"])} release={release} onClose={() => undefined} onDone={() => undefined} />));
    await settle();
    await typeInto(input("Key"), "partner-2026");
    expect(host.textContent).not.toContain("nils handover password");
    expect(e.of("POST", "/api/handovers/password")).toHaveLength(0);
    click(button(host, "Show the password"));
    await settle();
    expect(e.of("POST", "/api/handovers/password")[0].body).toEqual({ key: "partner-2026" });
    const shown = [...document.querySelectorAll("dialog[open]")].at(-1)!;
    expect(shown.textContent).toContain(PASSWORD);
    expect(button(shown, "Done")!.disabled).toBe(true);
    // Escape or the close button does not let it go unconfirmed
    act(() => shown.dispatchEvent(new Event("cancel", { cancelable: true })));
    await settle();
    expect(document.body.textContent).toContain(PASSWORD);
    const copied = shown.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    act(() => copied.click());
    click(button(shown, "Done"));
    await settle();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    for (const call of stored.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
    for (const c of e.calls) expect(c.url).not.toContain(PASSWORD);
  });

  it("says the engine's refusal and closes as any dialog", async () => {
    engine((c) => (c.url === "/api/handovers/password" ? { status: 404, body: { error: "no key named nobody" } } : undefined));
    const closed = vi.fn();
    act(() => root.render(<PasswordOnce keyName="nobody" onClose={closed} />));
    await settle();
    expect(host.ownerDocument.body.textContent).toContain("no key named nobody");
    click(button(document, "Done"));
    expect(closed).toHaveBeenCalled();
  });

  it("keeps the printed command for a person without release work at every detail", async () => {
    engine((c) => (c.url === "/api/places" ? { status: 200, body: PLACES } : undefined));
    const caps = caps7a(["POST /api/handovers", "GET /api/places", "POST /api/handovers/password"], ["release:see", "release:work"]);
    caps.person.detail = "quasi";
    act(() => root.render(<HandoverDialog caps={caps} release={release} onClose={() => undefined} onDone={() => undefined} />));
    await settle();
    await typeInto(input("Key"), "partner-2026");
    expect(button(host, "Show the password")).toBeNull();
    expect(document.body.textContent).toContain("nils handover password --key partner-2026");
  });
});
