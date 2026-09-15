// SPDX-License-Identifier: AGPL-3.0-only
// The subscription's card among the models, as it draws (record 25): the code,
// its copy button, the link and the minutes left while a sign-in waits; whose
// it is, the model, the stations it answers and a sign-out once signed in;
// the error and a way to try again; no button for a person who may not act.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Subscription } from "./kvasir";
import { SubscriptionCard } from "./SubscriptionCard";

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

describe("the subscription's card", () => {
  it("draws the code with its copy button, the link opening apart, and the minutes left, across two columns", () => {
    const html = renderToStaticMarkup(
      <SubscriptionCard row={sub({ state: "waiting", user_code: "WXYZ-1234", verification_uri: "https://example.org/device", expires_at: Date.now() + 10.5 * 60_000 })} />,
    );
    expect(html).toContain('<div class="mcard mine wide">');
    expect(html).toContain("WXYZ-1234");
    expect(html).toContain("Copy the code");
    expect(html).toContain('href="https://example.org/device"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Enter it at example.org/device");
    expect(html).toContain("10 minutes left");
    expect(html).toContain("waiting for you");
  });

  it("offers a sign-in, and to a person who may not act on it no button and no code", () => {
    const html = renderToStaticMarkup(<SubscriptionCard row={sub()} />);
    expect(html).toContain("<b>Your ChatGPT subscription</b>");
    expect(html).toContain("not signed in");
    expect(html).toContain("Until you sign in, the stations an admin lets go to ChatGPT answer you with the default model in your systems.");
    expect(html).toContain(">Sign in</button>");
    const theirs = renderToStaticMarkup(<SubscriptionCard row={sub({ for: "system", state: "waiting", user_code: "WXYZ-1234" })} may={false} />);
    expect(theirs).not.toContain("<button");
    expect(theirs).not.toContain("WXYZ-1234");
    expect(theirs).toContain("An admin signs the install in.");
  });

  it("says whose it is, the model, since when and the stations it answers once signed in, with another model and a sign-out", () => {
    const models = [
      { id: "gpt-5", name: "GPT-5", context_window: 272000 },
      { id: "gpt-5-mini", name: "GPT-5 mini", context_window: 128000 },
    ];
    const html = renderToStaticMarkup(<SubscriptionCard row={sub({ state: "signed_in", since: Date.now(), model: "gpt-5", models })} stations={["concierge"]} />);
    expect(html).toContain("Yours alone · GPT-5, 272,000 tokens");
    expect(html).toContain("signed in</span>");
    expect(html).toContain("answers concierge, in your conversations");
    expect(html).toContain(">Sign out</button>");
    expect(html).toContain('aria-label="More for Your ChatGPT subscription"');
    expect(html).toContain(">Choose another model</button>");
    expect(html).not.toContain("<select");
    const choosing = renderToStaticMarkup(<SubscriptionCard row={sub({ for: "system", state: "signed_in", models })} />);
    expect(choosing).toContain("The whole install&#x27;s · no model chosen yet");
    expect(choosing).toContain("choose a model");
    expect(choosing).toContain("GPT-5 mini, 128,000 tokens");
  });

  it("says the error, with a way to try again", () => {
    const failed = renderToStaticMarkup(<SubscriptionCard row={sub({ state: "failed", error: "the code was not approved" })} />);
    expect(failed).toContain("did not finish</span>");
    expect(failed).toContain("The sign-in did not finish: the code was not approved.");
    expect(failed).toContain(">Try again</button>");
  });
});
