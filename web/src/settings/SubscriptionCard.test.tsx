// SPDX-License-Identifier: AGPL-3.0-only
// The subscription's card among the models, as it draws (record 25): its title,
// its tag and Sign in while it is not signed in, and nothing more; the code,
// its copy button, the link and the minutes left while a sign-in waits; the
// model with whose it is and since when as a hover title, its tag and the
// stations it answers once signed in, with a sign-out; the error as the tag's
// title and a way to try again; no button for a person who may not act on it.

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

  it("says only its title, its tag and Sign in while it is not signed in, and to a person who may not act on it no button and no code", () => {
    const html = renderToStaticMarkup(<SubscriptionCard row={sub()} />);
    expect(html).toContain('<b class="card-name">Your ChatGPT subscription</b>');
    expect(html).toContain("not signed in</span>");
    expect(html).toContain(">Sign in</button>");
    expect(html).not.toContain("<p");
    expect(html).not.toContain("Until you sign in");
    const theirs = renderToStaticMarkup(<SubscriptionCard row={sub({ for: "system", state: "waiting", user_code: "WXYZ-1234" })} may={false} />);
    expect(theirs).not.toContain("<button");
    expect(theirs).not.toContain("WXYZ-1234");
    expect(theirs).toContain("Needs the assistant and Kvasir: See.");
  });

  it("names the model once signed in, with whose it is, its context and since when as a hover title, the stations it answers, another model and a sign-out", () => {
    const models = [
      { id: "gpt-5", name: "GPT-5", context_window: 272000 },
      { id: "gpt-5-mini", name: "GPT-5 mini", context_window: 128000 },
    ];
    const html = renderToStaticMarkup(<SubscriptionCard row={sub({ state: "signed_in", since: Date.parse("2026-09-12T09:00:00Z"), model: "gpt-5", models })} stations={["concierge"]} />);
    expect(html).toMatch(/<span class="meta" title="yours alone · 272,000 tokens · since 12 Sept?">GPT-5<\/span>/u);
    expect(html).toContain("signed in</span>");
    expect(html).toContain('<span class="meta" title="concierge">answers 1 station</span>');
    expect(html).toContain(">Sign out</button>");
    expect(html).toContain('aria-label="More for Your ChatGPT subscription"');
    expect(html).toContain(">Choose another model</button>");
    expect(html).not.toContain("<select");
    const choosing = renderToStaticMarkup(<SubscriptionCard row={sub({ for: "system", state: "signed_in", models })} />);
    expect(choosing).toContain("no model chosen yet");
    expect(choosing).toContain("choose a model");
    expect(choosing).toContain("GPT-5 mini, 128,000 tokens");
  });

  it("puts the error in the tag's title, with a way to try again", () => {
    const failed = renderToStaticMarkup(<SubscriptionCard row={sub({ state: "failed", error: "the code was not approved" })} />);
    expect(failed).toContain('title="The sign-in did not finish: the code was not approved."');
    expect(failed).toContain("did not finish</span>");
    expect(failed).toContain(">Try again</button>");
  });
});
