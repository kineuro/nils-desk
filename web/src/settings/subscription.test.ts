// SPDX-License-Identifier: AGPL-3.0-only
// The ChatGPT subscription's words: whose it is, each state, the minutes a
// sign-in code has left and when the card asks Kvasir again, the card's lines
// among the models (record 25), and what Add a model says of signing in.

import { describe, expect, it } from "vitest";
import type { Subscription } from "./kvasir";
import {
  answeredWords,
  cardMeta,
  cardTitle,
  expired,
  howWords,
  leadWords,
  leftWords,
  linkText,
  minutesLeft,
  modelWords,
  placeOf,
  polling,
  signedInWords,
  sinceWords,
  stateTag,
  stationsNote,
} from "./subscription";

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

describe("whose the subscription is", () => {
  it("reads the install's where nobody signs in, and a person's own otherwise", () => {
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
  it("tag each state", () => {
    expect(stateTag(sub(), now)).toEqual({ tone: "neutral", words: "not signed in" });
    expect(stateTag(sub({ state: "waiting", expires_at: now + 60_000 }), now)).toEqual({ tone: "caution", words: "waiting for you" });
    expect(stateTag(sub({ state: "waiting", expires_at: now - 1 }), now)).toEqual({ tone: "caution", words: "the code expired" });
    expect(stateTag(sub({ state: "signed_in" }), now)).toEqual({ tone: "ok", words: "signed in" });
    expect(stateTag(sub({ state: "failed" }), now)).toEqual({ tone: "blocked", words: "did not finish" });
  });

  it("say what to do now, and the error in words", () => {
    const since = Date.parse("2026-09-14T09:00:00Z");
    const day = new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    expect(leadWords(sub())).toBe("Until you sign in, the stations an admin lets go to ChatGPT answer you with the default model in your systems.");
    expect(leadWords(sub({ for: "system" }))).toBe("Until it is signed in, the stations an admin lets go to ChatGPT answer with the default model in your systems.");
    expect(leadWords(sub({ state: "waiting" }))).toBe("Open the link, enter the code, and approve. This card follows the sign-in and says when it is done.");
    expect(leadWords(sub({ state: "waiting" }), "dialog")).toBe("Open the link, enter the code, and approve. This dialog follows the sign-in and says when it is done.");
    expect(leadWords(sub({ state: "signed_in", since }))).toBe(`Signed in since ${day}.`);
    expect(leadWords(sub({ state: "signed_in" }))).toBe("Signed in.");
    expect(leadWords(sub({ state: "failed", error: "the code expired before it was approved." }))).toBe("The sign-in did not finish: the code expired before it was approved.");
    expect(leadWords(sub({ state: "failed" }))).toBe("The sign-in did not finish.");
  });

  it("say whose it is, the model it answers with, since when, and the stations it answers", () => {
    const models = [{ id: "gpt-5.5", name: "GPT-5.5", context_window: 272000 }];
    const since = Date.parse("2026-09-12T09:00:00Z");
    const short = new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    expect(cardMeta(sub({ state: "signed_in", model: "gpt-5.5", models }))).toBe("Yours alone · GPT-5.5, 272,000 tokens");
    expect(cardMeta(sub({ for: "system", state: "signed_in", model: "gpt-5.5", models: [] }))).toBe("The whole install's · gpt-5.5");
    expect(cardMeta(sub({ state: "signed_in" }))).toBe("Yours alone · no model chosen yet");
    expect(sinceWords(sub({ state: "signed_in", since }))).toBe(`since ${short}`);
    expect(sinceWords(sub({ since }))).toBeNull();
    expect(answeredWords(sub(), ["concierge"])).toBe("answers concierge, in your conversations");
    expect(answeredWords(sub({ for: "system" }), ["concierge", "operator"])).toBe("answers concierge and operator");
    expect(answeredWords(sub(), [])).toBe("answers no station until an admin lets one go to ChatGPT");
    expect(modelWords({ id: "gpt-5", name: "GPT-5", context_window: 272000 })).toBe("GPT-5, 272,000 tokens");
    expect(modelWords({ id: "gpt-5-mini", name: " ", context_window: 0 })).toBe("gpt-5-mini");
  });
});

describe("signing in from Add a model", () => {
  it("says how it goes, what it answers today and what reaches it, and when it is done", () => {
    expect(howWords(sub())).toBe(
      "Kvasir asks OpenAI for a code. You open the link, enter the code and approve; this dialog follows along and says when you are signed in. You choose the model it answers with afterwards.",
    );
    expect(howWords(sub({ for: "system" }))).toMatch(/says when the install is signed in\./u);
    expect(stationsNote(sub(), ["concierge"])).toBe("It answers concierge for you today. Rows of the registry reach it only where an admin wrote down why, and identifiers never do.");
    expect(stationsNote(sub({ for: "system" }), ["concierge"])).toMatch(/^It answers concierge today\./u);
    expect(stationsNote(sub(), [])).toMatch(/^No station goes to ChatGPT yet; an admin lets one go there under Where each station goes\./u);
    expect(signedInWords(sub({ state: "signed_in" }))).toBe("You are signed in to ChatGPT. Choose the model it answers with on its card under Models.");
    expect(signedInWords(sub({ for: "system", state: "signed_in", model: "gpt-5.5" }))).toBe("The install is signed in to ChatGPT. Its card under Models says the model it answers with.");
  });
});
