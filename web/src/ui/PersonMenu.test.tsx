// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The person's menu and signing out: the name opens a menu whose items are
// reached from the keyboard and which Escape closes; signing out ends the
// desk's session and follows its answer to the provider's end-session page;
// signing in as someone else goes to the login that asks the provider to sign
// in afresh; and the login page offers that too.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Login } from "../App";
import { afterSignOut, signInAsSomeoneElse, signOut } from "../signout";
import { PersonMenu } from "./PersonMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

describe("the person's menu", () => {
  it("opens from the name, focuses its first item, offers the three ways, and closes on Escape", () => {
    act(() => root.render(<PersonMenu who="Nima" initials="N" profile="#/profile" current={false} choose="/desk/login?prompt=login" />));
    const button = host.querySelector("button.person") as HTMLButtonElement;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".person-pop")).toBeNull();
    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const items = [...host.querySelectorAll(".person-pop a, .person-pop button")].map((e) => e.textContent);
    expect(items).toEqual(["Your profile", "Sign in as someone else", "Sign out"]);
    expect(document.activeElement?.textContent).toBe("Your profile");
    act(() => {
      host.querySelector(".person-menu")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(host.querySelector(".person-pop")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("offers no other account where no provider signs people in", () => {
    act(() => root.render(<PersonMenu who="Erik" initials="E" profile="#/profile" current={false} choose={null} />));
    act(() => (host.querySelector("button.person") as HTMLButtonElement).click());
    const items = [...host.querySelectorAll(".person-pop a, .person-pop button")].map((e) => e.textContent);
    expect(items).toEqual(["Your profile", "Sign out"]);
  });
});

describe("signing out", () => {
  it("follows the desk's answer to the provider's end-session page", async () => {
    const post = vi.fn(async () => answer(200, { then: "https://auth.example.org/application/o/nils/end-session/?id_token_hint=x" }));
    const go = vi.fn();
    await signOut(go, post as unknown as typeof fetch);
    expect(post).toHaveBeenCalledWith("/desk/logout", { method: "POST", headers: { "X-Nils-Desk": "1" } });
    expect(go).toHaveBeenCalledWith("https://auth.example.org/application/o/nils/end-session/?id_token_hint=x");
  });

  it("goes to the front page where the desk ends only its own session", async () => {
    const go = vi.fn();
    await signOut(go, (async () => answer(204)) as unknown as typeof fetch);
    expect(go).toHaveBeenCalledWith("/");
    expect(afterSignOut(200, { then: "javascript:alert(1)" })).toBe("/");
  });

  it("stays put and says why when the desk refuses", async () => {
    const go = vi.fn();
    await expect(signOut(go, (async () => answer(403, { error: "no" })) as unknown as typeof fetch)).rejects.toThrow("403");
    expect(go).not.toHaveBeenCalled();
  });

  it("signs in as someone else through the login that asks the provider to sign in afresh", async () => {
    const go = vi.fn();
    await signInAsSomeoneElse("/desk/login?prompt=login", go, (async () => answer(200, { then: "https://auth.example.org/end" })) as unknown as typeof fetch);
    expect(go).toHaveBeenCalledWith("/desk/login?prompt=login");
  });

  it("the login page offers another account where a provider signs people in", () => {
    const html = renderToStaticMarkup(<Login how="redirect" url="/desk/login" choose="/desk/login?prompt=login" nobody={false} onDone={() => undefined} />);
    expect(html).toContain('href="/desk/login"');
    expect(html).toContain('href="/desk/login?prompt=login"');
    expect(html).toContain("Sign in as someone else");
    const plain = renderToStaticMarkup(<Login how="redirect" url="/desk/login" choose={null} nobody={false} onDone={() => undefined} />);
    expect(plain).not.toContain("someone else");
  });
});
