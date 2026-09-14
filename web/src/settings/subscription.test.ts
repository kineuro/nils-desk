// SPDX-License-Identifier: AGPL-3.0-only
// The ChatGPT subscription's words: where its card is drawn, each state, the
// minutes a sign-in code has left, and when the card asks Kvasir again.

import { describe, expect, it } from "vitest";
import type { Subscription } from "./kvasir";
import { cardTitle, expired, leadWords, leftWords, linkText, minutesLeft, modelWords, placeOf, polling, servesWords, stateTag } from "./subscription";

const now = Date.parse("2026-09-15T12:00:00Z");
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

describe("where the card is drawn", () => {
  it("puts the install's subscription on the Kvasir page, and a person's own on their profile", () => {
    expect(placeOf([sub({ for: "system" })])).toEqual({ kvasir: sub({ for: "system" }), profile: null });
    expect(placeOf([sub()])).toEqual({ kvasir: null, profile: sub() });
    expect(placeOf(null)).toEqual({ kvasir: null, profile: null });
    expect(placeOf([sub({ provider: "another" })])).toEqual({ kvasir: null, profile: null });
    expect(cardTitle(sub({ for: "system" }))).toBe("The install's ChatGPT subscription");
    expect(cardTitle(sub())).toBe("Your ChatGPT subscription");
  });
});

describe("a sign-in", () => {
  it("counts the whole minutes its code has left", () => {
    expect(minutesLeft(now + 14.9 * 60_000, now)).toBe(14);
    expect(minutesLeft(null, now)).toBeNull();
    expect(leftWords(now + 14.9 * 60_000, now)).toBe("14 minutes left");
    expect(leftWords(now + 90_000, now)).toBe("a minute left");
    expect(leftWords(now + 30_000, now)).toBe("less than a minute left");
    expect(leftWords(now, now)).toBe("the code has expired");
    expect(leftWords(null, now)).toBeNull();
    expect(expired(now - 1, now)).toBe(true);
    expect(expired(null, now)).toBe(false);
  });

  it("asks Kvasir again while it waits, until a minute after its code expired", () => {
    const waiting = sub({ state: "waiting", user_code: "WXYZ-1234", verification_uri: "https://example.org/device", expires_at: now + 600_000 });
    expect(polling(waiting, now)).toBe(true);
    expect(polling(waiting, now + 630_000)).toBe(true);
    expect(polling(waiting, now + 700_000)).toBe(false);
    expect(polling({ ...waiting, expires_at: null }, now)).toBe(true);
    expect(polling(sub({ state: "signed_in" }), now)).toBe(false);
    expect(linkText("https://example.org/device")).toBe("example.org/device");
  });
});

describe("the card's words", () => {
  it("say each state at the card's head", () => {
    expect(stateTag(sub(), now)).toEqual({ tone: "neutral", words: "signed out" });
    expect(stateTag(sub({ state: "waiting", expires_at: now + 60_000 }), now)).toEqual({ tone: "caution", words: "waiting for you" });
    expect(stateTag(sub({ state: "waiting", expires_at: now - 1 }), now)).toEqual({ tone: "caution", words: "the code expired" });
    expect(stateTag(sub({ state: "signed_in" }), now)).toEqual({ tone: "ok", words: "signed in" });
    expect(stateTag(sub({ state: "failed" }), now)).toEqual({ tone: "blocked", words: "not signed in" });
  });

  it("say what to do now, and the error in words", () => {
    const since = Date.parse("2026-09-14T09:00:00Z");
    const day = new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    expect(leadWords(sub())).toBe("Until you sign in, the stations an admin lets go to ChatGPT answer you with the default model in your systems.");
    expect(leadWords(sub({ for: "system" }))).toBe("Until it is signed in, the stations an admin lets go to ChatGPT answer with the default model in your systems.");
    expect(leadWords(sub({ state: "waiting" }))).toBe("Open the link, enter the code, and approve. This card follows the sign-in and says when it is done.");
    expect(leadWords(sub({ state: "signed_in", since }))).toBe(`Signed in since ${day}.`);
    expect(leadWords(sub({ state: "signed_in" }))).toBe("Signed in.");
    expect(leadWords(sub({ state: "failed", error: "the code expired before it was approved." }))).toBe("The sign-in did not finish: the code expired before it was approved.");
    expect(leadWords(sub({ state: "failed" }))).toBe("The sign-in did not finish.");
  });

  it("say what the subscription serves, and each model it offers", () => {
    expect(servesWords(sub())).toBe(
      "Your subscription serves only your conversations, for the stations an admin lets go to ChatGPT. Rows of the registry go to it only where an admin wrote down why, and identifiers never do.",
    );
    expect(servesWords(sub({ for: "system" }))).toMatch(/^The install's subscription serves every conversation on this desk, for the stations an admin lets go to ChatGPT\./u);
    expect(modelWords({ id: "gpt-5", name: "GPT-5", context_window: 272000 })).toBe("GPT-5, 272,000 tokens");
    expect(modelWords({ id: "gpt-5-mini", name: " ", context_window: 0 })).toBe("gpt-5-mini");
  });
});
