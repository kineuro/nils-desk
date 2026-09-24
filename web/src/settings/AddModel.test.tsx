// SPDX-License-Identifier: AGPL-3.0-only
// Add a model as it opens (record 25): it asks first where the model comes
// from and offers only what the person may add, the first chosen; a model
// server at this machine's address with nothing to admit before its models
// are listed; a provider with its key; and a subscription
// that says how signing in goes, what it carries, and when it is done.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddModel } from "./AddModel";
import type { Subscription } from "./kvasir";
import type { Choice } from "./models";

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
