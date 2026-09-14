// SPDX-License-Identifier: AGPL-3.0-only
// The subscription's card as it draws: the code, its copy button, the link and
// the minutes left while a sign-in waits; the models and a sign-out once
// signed in; the error and a way to try again; no button for a person who may
// not act on it.

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
  it("draws the code with its copy button, the link opening apart, and the minutes left", () => {
    const html = renderToStaticMarkup(
      <SubscriptionCard row={sub({ state: "waiting", user_code: "WXYZ-1234", verification_uri: "https://example.org/device", expires_at: Date.now() + 10.5 * 60_000 })} />,
    );
    expect(html).toContain("WXYZ-1234");
    expect(html).toContain("Copy the code");
    expect(html).toContain('href="https://example.org/device"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Enter it at example.org/device");
    expect(html).toContain("10 minutes left");
    expect(html).toContain("waiting for you");
  });

  it("offers a sign-in, and to a person who may not act on it no button and no code", () => {
    expect(renderToStaticMarkup(<SubscriptionCard row={sub()} />)).toContain("Sign in with ChatGPT");
    const theirs = renderToStaticMarkup(<SubscriptionCard row={sub({ for: "system", state: "waiting", user_code: "WXYZ-1234" })} may={false} />);
    expect(theirs).not.toContain("<button");
    expect(theirs).not.toContain("WXYZ-1234");
    expect(theirs).toContain("An admin signs the install in.");
  });

  it("offers the models and a sign-out once signed in, and the error with a way to try again", () => {
    const html = renderToStaticMarkup(<SubscriptionCard row={sub({ state: "signed_in", since: Date.now(), model: "gpt-5", models: [{ id: "gpt-5", name: "GPT-5", context_window: 272000 }] })} />);
    expect(html).toContain("GPT-5, 272,000 tokens");
    expect(html).toContain("Sign out");
    const failed = renderToStaticMarkup(<SubscriptionCard row={sub({ state: "failed", error: "the code was not approved" })} />);
    expect(failed).toContain("The sign-in did not finish: the code was not approved.");
    expect(failed).toContain("Try again");
  });
});
