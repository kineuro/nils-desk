// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Record 55, ruling 35 (c), Nima 2026-10-16, gate T31 step 13.4: each
// handover has a password of its own. The Hand over dialog encrypts by
// default, asks why before it goes unencrypted, and lets the release's maker
// or a holder of handover-password:work type a password, which goes in one
// body and nowhere else; a version's handovers say how each is kept closed,
// and the password is shown once, to whom the engine allows, until the copy
// is confirmed. The grant is a line of the group editor. Every name here is
// made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Release } from "../data/cohorts";
import { placesKept } from "../objects/kept";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupForm } from "../settings/AccessForm";
import { PAGE_LINES, grantsAt, levelsOf } from "../settings/identity";
import { HandoversDialog } from "./HandoverPassword";
import { closedWords, typedRefusal } from "./handovers";
import { HandoverDialog } from "./ReleaseActs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TYPED = "a typed handover password 31";
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

const DOORS = ["POST /api/handovers", "GET /api/places", "GET /api/handovers", "POST /api/handovers/{id}/password"];
const PLACES = { places: [{ id: 7, name: "outbox", role: "exchange", path: "/exchange/outbox", guarantees: {}, probed: null, probed_at: null, retired_at: null }] };
const release = (actor: string) => ({ id: 2, name: "ms-cohort", version: "2", root: "/exports/x", started_at: "2026-10-01T10:00:00Z", files: 10, subjects: 4, layout: "bids", actor }) as unknown as Release;
const caps = (grants: string[], principal = "astrid@lab") => {
  const c = caps7a(DOORS, grants);
  c.engine!.principal = principal;
  return c;
};
const open = async (c: ReturnType<typeof caps>, actor: string) => {
  const e = engine((call) => {
    if (call.url === "/api/places") return { status: 200, body: PLACES };
    if (call.url === "/api/handovers" && call.method === "POST") return { status: 202, body: { job: 41, state: "queued" } };
    return undefined;
  });
  await placesKept.refresh().catch(() => undefined);
  act(() => root.render(<HandoverDialog caps={c} release={release(actor)} onClose={() => undefined} onDone={() => undefined} />));
  await settle();
  return e;
};

describe("the Hand over dialog", () => {
  it("encrypts by default with a password NILS makes, and asks no key", async () => {
    const e = await open(caps(["release:see", "release:work"]), "astrid@lab");
    expect(input("Encrypt the archives").checked).toBe(true);
    expect(document.body.textContent).not.toContain("nils handover password");
    click(button(document.querySelector("dialog[open]")!, /^Hand over$/u));
    await settle();
    expect(e.of("POST", "/api/handovers")[0].body).toEqual({ release: "ms-cohort", out: "/exchange/outbox/ms-cohort-v2", encrypt: true, password: "made" });
  });

  it("asks why before it goes unencrypted", async () => {
    const e = await open(caps(["release:see", "release:work"]), "astrid@lab");
    act(() => input("Encrypt the archives").click());
    const d = document.querySelector("dialog[open]")!;
    expect(button(d, /^Hand over$/u)!.disabled).toBe(true);
    await typeInto(input("Why unencrypted"), "the partner's own encrypted drive");
    click(button(d, /^Hand over$/u));
    await settle();
    expect(e.of("POST", "/api/handovers")[0].body).toEqual({ release: "ms-cohort", out: "/exchange/outbox/ms-cohort-v2", encrypt: false, why: "the partner's own encrypted drive" });
  });

  it("lets the release's maker type a password, twice, which goes in one body and is cleared", async () => {
    const e = await open(caps(["release:see", "release:work"], "anna@ward-3"), "anna@ward-3");
    act(() => input("I type one").click());
    const d = document.querySelector("dialog[open]")!;
    await typeInto(input("Its password"), TYPED);
    await typeInto(input("Again"), "something else entirely");
    expect(button(d, /^Hand over$/u)!.disabled).toBe(true);
    await typeInto(input("Again"), TYPED);
    click(button(d, /^Hand over$/u));
    expect(input("Its password").value).toBe("");
    await settle();
    expect(e.of("POST", "/api/handovers")[0].body).toEqual({ release: "ms-cohort", out: "/exchange/outbox/ms-cohort-v2", encrypt: true, password: "typed", typed: TYPED });
    expect(document.body.innerHTML).not.toContain(TYPED);
    for (const c of e.calls) expect(c.url).not.toContain(encodeURIComponent(TYPED));
    for (const call of stored.mock.calls) expect(JSON.stringify(call)).not.toContain(TYPED);
  });

  it("offers typing to a holder of the grant, and to nobody else", async () => {
    await open(caps(["release:see", "release:work"], "olle@lab"), "anna@ward-3");
    expect(input("I type one").disabled).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    await open(caps(["release:see", "release:work", "handover-password:see", "handover-password:work"], "olle@lab"), "anna@ward-3");
    expect(input("I type one").disabled).toBe(false);
  });

  it("keeps the key and the printed command for an engine without its own passwords", async () => {
    engine((c) => (c.url === "/api/places" ? { status: 200, body: PLACES } : undefined));
    await placesKept.refresh().catch(() => undefined);
    act(() => root.render(<HandoverDialog caps={caps7a(["POST /api/handovers", "GET /api/places"], ["release:see", "release:work"])} release={release("x")} onClose={() => undefined} onDone={() => undefined} />));
    await settle();
    await typeInto(input("Key"), "partner-2026");
    expect(document.body.textContent).toContain("nils handover password --key partner-2026");
  });
});

const HANDOVERS = [
  { id: 5, release: "ms-cohort", version: "2", maker: "anna@ward-3", root: "/exchange/outbox/a", started_at: "", finished_at: "", archives: 1, encrypted: true, password: "typed", password_words: "", key: null, unencrypted_why: null, may_show: true },
  { id: 4, release: "ms-cohort", version: "2", maker: "anna@ward-3", root: "/exchange/outbox/b", started_at: "", finished_at: "", archives: 1, encrypted: false, password: "none", password_words: "", key: null, unencrypted_why: "the partner's own encrypted drive", may_show: false },
  { id: 3, release: "ms-cohort", version: "1", maker: "anna@ward-3", root: "/exchange/outbox/c", started_at: "", finished_at: "", archives: 1, encrypted: true, password: "made", password_words: "", key: "k", unencrypted_why: null, may_show: true },
];

describe("a version's handovers", () => {
  it("say how each is kept closed, and show a password once, until the copy is confirmed", async () => {
    const e = engine((c) => {
      if (c.url === "/api/handovers?release=ms-cohort") return { status: 200, body: { count: 3, handovers: HANDOVERS } };
      if (c.url === "/api/handovers/5/password") return { status: 200, body: { handover: 5, password: PASSWORD, kind: "typed" } };
      return undefined;
    });
    act(() => root.render(<HandoversDialog release={{ name: "ms-cohort", version: "2" }} onClose={() => undefined} />));
    await settle();
    expect(document.body.textContent).toContain("not encrypted: the partner's own encrypted drive");
    expect(document.body.textContent).not.toContain("/exchange/outbox/c");
    expect(button(document, "Show the password of handover 4")).toBeNull();
    click(button(document, "Show the password of handover 5"));
    await settle();
    expect(e.of("POST", "/api/handovers/5/password")).toHaveLength(1);
    const shown = [...document.querySelectorAll("dialog[open]")].at(-1)!;
    expect(shown.textContent).toContain(PASSWORD);
    expect(button(shown, "Done")!.disabled).toBe(true);
    act(() => shown.dispatchEvent(new Event("cancel", { cancelable: true })));
    await settle();
    expect(document.body.textContent).toContain(PASSWORD);
    act(() => shown.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    click(button(shown, "Done"));
    await settle();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    for (const call of stored.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
    for (const c of e.calls) expect(c.url).not.toContain(PASSWORD);
  });

  it("words each way a handover is kept closed", () => {
    expect(closedWords({ password: "key", unencrypted_why: null })).toContain("before each had its own");
    expect(closedWords({ password: "none", unencrypted_why: "why" })).toBe("not encrypted: why");
    expect(typedRefusal("short", "short")).not.toBeNull();
    expect(typedRefusal(TYPED, TYPED)).toBeNull();
    expect(typedRefusal("two\nlines here", "two\nlines here")).not.toBeNull();
  });
});

describe("the group editor", () => {
  it("has a line for handover passwords, see and work, which a group is given like any other", () => {
    const line = PAGE_LINES.find((l) => l.id === "handover-password")!;
    expect(line).toBeDefined();
    expect(line.title).toBe("Handover passwords");
    expect(grantsAt(line, "see")).toEqual(["handover-password:see"]);
    expect(grantsAt(line, "work")).toEqual(["handover-password:work"]);
    expect(levelsOf(["handover-password:see"])["handover-password"]).toBe("see");
    const html = renderToStaticMarkup(<GroupForm mode="local" group={null} groups={[]} members={0} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("Handover passwords");
    expect(html).toContain("Show any handover&#x27;s password");
  });
});
