// SPDX-License-Identifier: AGPL-3.0-only
// A person's own page as it draws, kept terse: how they sign in with their
// subject only on hover, their groups, the pages they hold in the Identity
// page's few words with the rest hidden together, how much of a record they
// see as one tag, and one line pointing to the Kvasir page for a subscription
// of their own, or the install's when nobody signs in.

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
  it("says how they sign in with their subject on hover, their groups, and what they may open in a few words", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(erik, "quasi")} />);
    expect(html).toContain("<h1>Erik Lund</h1>");
    expect(html).toContain("How you sign in and what you may open.");
    expect(html).toMatch(/<span class="signin-item" title="erik"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Local accounts<span class="sr-only">, as erik<\/span><\/span>/u);
    expect(html).not.toContain("signed in as");
    expect(html).toContain('<span class="tag">Reviewers</span>');
    expect(html).toContain("<h2>Access</h2>");
    expect(html).not.toContain("set by whoever");
    expect(html).toMatch(/<b>Assistant<\/b><span class="state"><span class="amark do">use<\/span><\/span><span class="what">Chat with the assistant<\/span>/u);
    expect(html).toMatch(/<b>Query<\/b><span class="state"><span class="amark do">work<\/span><\/span><span class="what">Ask, run and chart questions · keep cards, queue ask jobs<\/span>/u);
    expect(html).toMatch(/<b>Data<\/b><span class="state"><span class="amark">see<\/span><\/span><span class="what">Sources and batches<\/span>/u);
    expect(html).toMatch(/<div class="arow deep"><b>Kvasir<\/b>/u);
    expect(html).toContain('<div class="arow hidden" title="Whoever may change people and groups can open them.">');
    expect(html).toContain('<b>Release, Pipelines, Models and Campaigns</b><span class="state meta">hidden</span></div>');
    expect(html).not.toContain("admin");
    expect(html).toMatch(/<b>Records<\/b><span class="state"><span class="tag records" title="Dates, subject codes, sex and age, scanner names and series and protocol descriptions\."><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Identifying/u);
  });

  it("points to the Kvasir page in one line for a subscription of their own, and keeps none itself", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(erik, "quasi")} />);
    expect(html).toMatch(/<\/svg>Your ChatGPT subscription: (?:<a href="[^"]*">Kvasir page<\/a>|Kvasir page)<\/p>/u);
    expect(html).not.toContain("<h2>Subscription</h2>");
    expect(html).not.toContain("Sign out");
    const pointer = "ChatGPT subscription:";
    expect(renderToStaticMarkup(<ProfilePage caps={caps(["kvasir:see", "query:work"], "plain")} />)).not.toContain(pointer);
    expect(renderToStaticMarkup(<ProfilePage caps={caps(["assistant:use", "query:work"], "plain")} />)).not.toContain(pointer);
    expect(renderToStaticMarkup(<ProfilePage caps={caps(erik, "quasi", { kvasir: null })} />)).not.toContain(pointer);
  });

  it("hides Settings with the pages when none under it is open", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(["query:see"], "plain", { groups: [] })} />);
    expect(html).toContain("<b>Assistant, Data, Review, Release, Pipelines, Models, Campaigns and Settings</b>");
    expect(html).toContain('<span class="meta">No groups</span>');
    expect(html).toMatch(/title="No dates, subject codes, sex or age, scanner names or series descriptions\."><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Non-identifying/u);
  });

  it("reads a grant for a page not built yet as a line, never a link, and never names that page hidden", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps(["query:see", "models:see"], "plain", { groups: [] })} />);
    expect(html).toMatch(/<div class="arow"><b>Models<\/b><span class="state"><span class="amark">see<\/span><\/span><span class="what">Registered classifier models<\/span><\/div>/u);
    expect(html).not.toMatch(/href="[^"]*(models|campaigns)/u);
    // Models is not built yet and is never named hidden; Campaigns is built, and is
    expect(html).toContain("<b>Assistant, Data, Review, Release, Pipelines, Campaigns and Settings</b>");
  });

  it("on a desk that signs nobody in, holds every page and says the subscription is the install's", () => {
    const html = renderToStaticMarkup(<ProfilePage caps={caps([...GRANTS], "sensitive", { mode: "off", groups: [] })} />);
    expect(html).toContain("Nobody signs in, so every page is open.");
    expect(html).toMatch(/<\/svg>No sign-in<span class="sr-only">/u);
    expect(html).not.toContain("No groups");
    expect(html).not.toContain('<span class="state meta">hidden</span>');
    expect(html).toContain("<b>Settings</b>");
    expect(html).toMatch(/<\/svg>Everything<span class="sr-only"> records<\/span>/u);
    expect(html).toContain("The install&#x27;s ChatGPT subscription:");
    expect(html).toContain("Kvasir page");
  });
});
