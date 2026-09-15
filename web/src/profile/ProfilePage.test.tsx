// SPDX-License-Identifier: AGPL-3.0-only
// A person's own page as it draws: who the desk knows them as and their
// groups, the pages they hold in the Identity page's words with the rest
// hidden together, how much of a record they see, and the line pointing to
// the Kvasir page for a subscription of their own, or the install's when
// nobody signs in. No subscription is kept here any more.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Detail, type Grant } from "../grants";
import { ProfilePage } from "./ProfilePage";

const caps = (grants: Grant[], detail: Detail, over: { mode?: "off" | "local" | "oidc"; groups?: string[]; kvasir?: Record<string, unknown> | null } = {}) =>
  ({
    engine: null,
    kvasir: over.kvasir === undefined ? {} : over.kvasir,
    assistant: null,
    apps: [],
    person: { subject: "erik", display_name: "Erik Lund", grants, detail, groups: over.groups ?? ["Reviewers"] },
    desk: { version: "1.0.0", mode: over.mode ?? "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as Capabilities;

const erik: Grant[] = ["assistant:use", "data:see", "kvasir:see", "query:work", "review:work"];

describe("a person's own page", () => {
  it("says who the desk knows them as, their groups, and what they may see and do", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(erik, "quasi")} />);
    expect(html).toContain("<h1>Erik Lund</h1>");
    expect(html).toContain("signed in as");
    expect(html).toContain("The desk keeps the people");
    expect(html).toContain('<span class="tag">Reviewers</span>');
    expect(html).toMatch(/<b>Assistant<\/b><span class="state"><span class="amark do">use<\/span><\/span>/u);
    expect(html).toMatch(/<b>Query<\/b><span class="state"><span class="amark do">work<\/span><\/span><span class="what">Ask, run and chart questions, and open the cards people share, keep cards and selections, and queue ask jobs\.<\/span>/u);
    expect(html).toMatch(/<b>Data<\/b><span class="state"><span class="amark">see<\/span><\/span>/u);
    expect(html).toMatch(/<div class="arow deep"><b>Kvasir<\/b>/u);
    expect(html).toContain("<b>Release and Pipelines</b>");
    expect(html).toContain("not shown to you");
    expect(html).toContain("Whoever may change people and groups can open them for you.");
    expect(html).toContain("set by whoever may change people and groups");
    expect(html).not.toContain("admin");
    expect(html).toContain('<span class="amark">with identifying details</span>');
    expect(html).toContain('<span class="what">Dates, subject codes, sex and age, scanner names and series and protocol descriptions.</span>');
  });

  it("points to the Kvasir page for a subscription of their own, and keeps none itself", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(erik, "quasi")} />);
    expect(html).toContain("A ChatGPT subscription of your own, which serves only your conversations, is added and signed in on the Kvasir page.");
    expect(html).not.toContain("<h2>Subscription</h2>");
    expect(html).not.toContain("Sign out");
    const pointer = "is added and signed in on the Kvasir page";
    expect(renderToStaticMarkup(<ProfilePage caps={caps(["kvasir:see", "query:work"], "plain")} />)).not.toContain(pointer);
    expect(renderToStaticMarkup(<ProfilePage caps={caps(["assistant:use", "query:work"], "plain")} />)).not.toContain(pointer);
    expect(renderToStaticMarkup(<ProfilePage caps={caps(erik, "quasi", { kvasir: null })} />)).not.toContain(pointer);
  });

  it("hides Settings with the pages when none under it is open", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(["query:see"], "plain", { groups: [] })} />);
    expect(html).toContain("<b>Assistant, Data, Review, Release, Pipelines and Settings</b>");
    expect(html).toMatch(/<dt>your groups<\/dt><dd>none<\/dd>/u);
    expect(html).toContain('<span class="amark">without identifying details</span>');
    expect(html).toContain("No dates, subject codes, sex or age, scanner names or series descriptions.");
  });

  it("on a desk that signs nobody in, holds every page and says the subscription is the install's", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps([...GRANTS], "sensitive", { mode: "off", groups: [] })} />);
    expect(html).toContain("the desk knows you as");
    expect(html).toContain("Nobody signs in");
    expect(html).not.toContain("your groups");
    expect(html).not.toContain("not shown to you");
    expect(html).toContain("<b>Settings</b>");
    expect(html).toContain('<span class="amark">everything</span>');
    expect(html).toContain("the ChatGPT subscription is the install&#x27;s");
  });
});
