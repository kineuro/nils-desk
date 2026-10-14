// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Add a model as it opens (record 25): it asks first where the model comes
// from and offers only what the person may add, the first chosen; a model
// server at this machine's address with nothing to admit before its models
// are listed, and once listed every model ticked where it lists a handful
// (2026-10-11), none where it lists more, with Tick all and Untick all; a
// provider with its key; and a subscription that says how signing in goes,
// what it carries, and when it is done.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import offered from "../../test/fixtures/kvasir_servers_models.json";
import { AddModel } from "./AddModel";
import type { Offer, Subscription } from "./kvasir";
import type { Choice } from "./models";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  provider: "chatgpt",
  name: "ChatGPT",
  for: "person",
  state: "signed_out",
  user_code: null,
  verification_uri: null,
  expires_at: null,
  since: null,
  model: null,
  models: [],
  error: null,
  ...over,
});

const dialog = (choices: Choice[], subscription: Subscription | null = null, stations: string[] = []) =>
  renderToStaticMarkup(
    <AddModel
      choices={choices}
      local={{ location: "/srv/models", free_bytes: null, token: false, models: [], runtime: null }}
      subscription={subscription}
      stations={stations}
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );

describe("adding a model", () => {
  it("offers a person with every choice all four, where the model comes from first, and opens on the download", () => {
    const html = dialog(["download", "server", "provider", "subscription"], sub());
    expect(html).toContain("Where it comes from");
    expect(html).toContain("<b>Download it to this machine</b>");
    expect(html).toContain("<b>A model server</b>");
    expect(html).toContain("<b>A provider</b>");
    expect(html).toContain("<b>Your own ChatGPT subscription</b>");
    expect(html.match(/class="pick on"/gu)).toHaveLength(1);
    expect(html).toMatch(/<label class="pick on"><span class="sq brand">.*?<b>Download it to this machine<\/b>/u);
    expect(html).toContain("Its name on the Hugging Face Hub");
    expect(html).not.toContain("How you sign in");
  });

  it("shows a person who may only sign a subscription of their own in that one choice, chosen, with how it goes and what it carries", () => {
    const html = dialog(["subscription"], sub(), ["concierge"]);
    expect(html.match(/class="pick/gu)).toHaveLength(1);
    expect(html).toContain('class="pick on"');
    expect(html).not.toContain("Download it to this machine");
    expect(html).not.toContain("A provider");
    expect(html).toContain("How you sign in");
    expect(html).toContain("Kvasir asks OpenAI for a code; enter it at the link and approve.");
    expect(html).toContain("Answers concierge. Identifiers never reach it.");
    expect(html).toContain('<button type="button" class="button">Sign in to ChatGPT</button>');
    expect(html).toContain(">Cancel</button>");
  });

  it("signs the install in where nobody signs in, and says so once a subscription is signed in already", () => {
    const install = dialog(["subscription"], sub({ for: "system" }));
    expect(install).toContain("<b>The install&#x27;s ChatGPT subscription</b>");
    expect(install).toContain("How the install signs in");
    const signed = dialog(["subscription"], sub({ state: "signed_in", model: "gpt-5" }));
    expect(signed).toContain("You are signed in to ChatGPT.");
    expect(signed).toContain(">Done</button>");
    expect(signed).not.toContain("Sign in to ChatGPT");
  });

  it("asks a model server for its address, on this machine's port as it opens, and an optional key, with Admit held back until it lists its models", () => {
    const html = dialog(["server", "provider"]);
    expect(html).toMatch(/<label class="pick on"><span class="sq">.*?<b>A model server<\/b>/u);
    expect(html).toContain('value="http://127.0.0.1:30000/v1"');
    expect(html).toContain("Most often ends in /v1.");
    expect(html).toContain("List its models");
    expect(html).toContain('type="password"');
    expect(html).toContain("Optional. Sealed in Kvasir; the desk keeps nothing.");
    expect(html).not.toContain("Find its models");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Admit<\/button>/u);
  });

  it("asks a provider for its key", () => {
    const html = dialog(["provider"]);
    expect(html).toContain("The provider");
    expect(html).toContain('value="https://api.openai.com/v1"');
    expect(html).toContain('type="password"');
    expect(html).toContain("Your key for it");
  });
});

describe("a model server's models, once listed", () => {
  const offer = offered as unknown as Offer;
  let host: HTMLDivElement;
  let root: Root;
  let asked: string[];
  let admitted: unknown[];
  beforeEach(() => {
    dialogs();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    asked = [];
    admitted = [];
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  // a Kvasir that lists these models for the server, and nothing else
  const listing = async (models: Offer["models"]) => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      asked.push(`${init?.method ?? "GET"} ${url}`);
      if (String(url).includes("/v1/servers/models")) return new Response(JSON.stringify({ ...offer, models }), { status: 200 });
      if (String(url).endsWith("/v1/servers") && init?.method === "POST") {
        const sent = JSON.parse(String(init.body)) as { models: string[] };
        admitted.push(sent.models);
        const results = sent.models.map((id) => ({ id, answered: true, admitted: true, record: 1, error: null }));
        return new Response(JSON.stringify({ backend: { id: "card0", models: sent.models }, results }), { status: 201 });
      }
      return new Response("{}", { status: 404 });
    });
    act(() => root.render(<AddModel choices={["server"]} onClose={() => undefined} onDone={() => undefined} />));
    act(() => button(host, "List its models")?.click());
    await settle();
  };
  const ticks = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((c) => c.checked);

  it("ticks every model where it lists a handful, and Untick all and Tick all turn them all", async () => {
    await listing(offer.models);
    expect(asked.some((a) => a.startsWith("GET /kvasir/v1/servers/models"))).toBe(true);
    expect(ticks()).toEqual([true, true]);
    expect(button(host, "Admit 2")?.disabled).toBe(false);
    act(() => button(host, "Untick all")?.click());
    expect(ticks()).toEqual([false, false]);
    expect(button(host, "Admit")?.disabled).toBe(true);
    act(() => button(host, "Tick all")?.click());
    expect(ticks()).toEqual([true, true]);
    // ticked by hand, the one loaded now first: it is still asked last
    act(() => button(host, "Untick all")?.click());
    act(() => host.querySelector<HTMLInputElement>('input[aria-label="Tick qwen38-27b"]')?.click());
    act(() => host.querySelector<HTMLInputElement>('input[aria-label="Tick qwen3.8-flash-next"]')?.click());
    expect(button(host, "Untick all")).not.toBeNull();
    // the cold one is said before Admit
    expect(host.textContent).toContain("qwen3.8-flash-next is cold");
    act(() => button(host, "Admit 2")?.click());
    await settle();
    expect(admitted).toEqual([["qwen3.8-flash-next", "qwen38-27b"]]);
  });

  it("leaves a model held here already out of the ticks and the toggle", async () => {
    await listing([...offer.models, { ...offer.models[1], id: "held-here", aliases: [], held_by: "card0" }, { ...offer.models[1], id: "third", aliases: [] }]);
    expect(ticks()).toEqual([true, true, true, true]);
    expect(button(host, "Admit 3")).not.toBeNull();
    act(() => button(host, "Untick all")?.click());
    // a held model stays shown as held, and is not one of the ticks
    expect(ticks()).toEqual([false, false, true, false]);
  });

  it("ticks none where it lists more than eight, and Tick all ticks them all", async () => {
    const many = Array.from({ length: 9 }, (_, n) => ({ ...offer.models[1], id: `provider-model-${n}`, aliases: [], status: "unknown" as const, default: false }));
    await listing(many);
    expect(ticks()).toEqual(Array(9).fill(false));
    expect(button(host, "Admit")?.disabled).toBe(true);
    act(() => button(host, "Tick all")?.click());
    expect(ticks()).toEqual(Array(9).fill(true));
    expect(button(host, "Admit 9")?.disabled).toBe(false);
  });
});
