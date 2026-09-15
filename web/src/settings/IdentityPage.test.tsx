// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page as it draws: nobody signing in, with the facts card only
// and the command that lets people sign in; the desk keeping the people, with
// the facts, the groups as cards, the people with what they add up to and
// what is theirs alone; an identity provider, with the groups it follows and
// the people who have signed in; what a person who may only look is offered;
// the page while it reads, when a door refuses, and with nobody in it yet;
// and Add a person as Setup opens it.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Grant } from "../grants";
import type { Access, Group, Person } from "./identity";
import { AddPerson, IdentityBody } from "./IdentityPage";

const reviewers: Group = { id: 1, name: "Reviewers", grants: ["assistant:use", "data:see", "query:work", "review:work"], detail: "quasi", follows: ["lab-review"] };
const admins: Group = { id: 2, name: "Admins", grants: [...GRANTS], detail: "sensitive", follows: [] };

const person = (over: Partial<Person>): Person => ({ subject: "someone", display: "", groups: [], grants: [], detail: null, access: { grants: [], detail: "plain" }, last_seen_at: null, sessions_open: 0, ...over });

const access: Access = {
  mode: "local",
  sessions_open: 2,
  people: [
    person({ subject: "astrid", display: "Astrid Berg", groups: [2], access: { grants: [...GRANTS], detail: "sensitive" }, sessions_open: 1 }),
    person({ subject: "erik", display: "Erik Lund", groups: [1], grants: ["kvasir:see"], access: { grants: [...reviewers.grants, "kvasir:see"], detail: "quasi" }, sessions_open: 1 }),
    person({ subject: "guest01", display: "Visiting student" }),
  ],
};

const caps = (mode: "off" | "local" | "oidc", grants: Grant[] = [...GRANTS], settings: Record<string, unknown> = {}) =>
  ({
    engine: null,
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid Berg", grants, detail: "sensitive", groups: ["Admins"] },
    desk: {
      version: "1.0.0",
      mode,
      contracts: {},
      engine_reachable: true,
      contract_mismatch: null,
      login: null,
      signed_in: true,
      settings: {
        origin: "http://127.0.0.1:7203",
        engine_url: "http://127.0.0.1:7200",
        kvasir_url: null,
        assistant_url: null,
        session_hours: 12,
        token_minutes: 5,
        cli_token_hours: 24,
        export: "",
        store: "",
        retention: "",
        engine_flags: null,
        signing: mode === "local" ? { key: "/srv/nils/desk/signing.key", audience: "nils" } : mode === "oidc" ? { issuer: "https://id.example.org/o/nils/", client_id: "nils-desk", groups_claim: "groups" } : null,
        ...settings,
      },
    },
  }) as Capabilities;

const none = () => undefined;
const NOW = Date.parse("2026-09-15T12:00:00Z");
const draw = (c: Capabilities, groups: Group[] | null = [reviewers, admins], a: Access | null = access, why: string | null = null) =>
  renderToStaticMarkup(<IdentityBody caps={c} groups={groups} access={a} why={why} now={NOW} onOpen={none} />);

describe("the Identity page when nobody signs in", () => {
  const html = draw(caps("off"), null, null);

  it("is the facts card only, with the command that lets people sign in", () => {
    expect(html).toContain("<dt>Sign-in</dt><dd>No sign-in</dd>");
    expect(html).not.toContain("<dt>People</dt>");
    expect(html).toContain('class="facts-row two"');
    expect(html).toContain("Nobody signs in");
    expect(html).toContain("Whoever opens the desk sees every page and may do everything.");
    expect(html).toContain("Only this machine");
    expect(html).toContain("To let people sign in, each seeing only what an admin gives them");
    expect(html).toContain("<code>nils setup</code>");
    expect(html).toContain("It restarts the desk and the engine.");
    expect(html).not.toContain("<h2>Groups</h2>");
    expect(html).not.toContain("<h2>People</h2>");
    expect(html).not.toContain("A session lasts");
    expect(html).not.toContain('class="radio');
  });

  it("warns when it answers on the network", () => {
    const open = draw(caps("off", [...GRANTS], { origin: "https://desk.example.org", also_origins: ["https://nils.example.org"] }), null, null);
    expect(open).toContain('<div class="stat caution"><dt>The desk answers</dt><dd>The network</dd></div>');
    expect(open).toContain("This network");
    expect(open).toContain(', and also at <span class="path">https://nils.example.org</span>');
  });
});

describe("the Identity page when the desk keeps the people", () => {
  const html = draw(caps("local"));

  it("counts the people, the groups and who is signed in, and says how people sign in as facts", () => {
    expect(html).toContain("<dt>People</dt><dd>3</dd>");
    expect(html).toContain("<dt>Groups</dt><dd>2</dd>");
    expect(html).toContain("<dt>Signed in now</dt><dd>2</dd>");
    expect(html).toContain("The desk keeps the people");
    expect(html).toContain(" and nowhere else");
    expect(html).toContain("A session lasts 12 hours");
    expect(html).toContain("2 sessions are open now.");
    expect(html).toContain('<dt>signing key</dt><dd><span class="path">/srv/nils/desk/signing.key</span></dd>');
    expect(html).toContain("<dt>audience</dt>");
    expect(html).not.toContain("<dt>provider</dt>");
    expect(html).toContain("To change how people sign in, or where the desk answers, run");
    expect(html).not.toContain('class="radio');
  });

  it("draws the groups as cards, collapsing a group that holds every page and setting", () => {
    expect(html).toContain('<h3 class="grow">Reviewers</h3><span class="meta">1 person</span>');
    expect(html).toContain('<span class="amark do">Assistant</span><span class="amark do">Query</span><span class="amark">Data</span><span class="amark do">Review</span>');
    expect(html).toContain('<span class="amark do">Every page</span><span class="amark do">Every setting</span>');
    expect(html).toContain("the desk always keeps at least one");
    expect(html).toContain("In records: with sex and age");
    expect(html).not.toContain("Follows ");
    expect(html).toContain("Make a group");
    expect(html).toContain('aria-label="Change Reviewers"');
  });

  it("lists the people with their groups, what they add up to, what is theirs alone, and when they signed in", () => {
    expect(html).toContain("Add a person");
    expect(html).toContain("<b>Erik Lund</b>");
    expect(html).toContain('<div class="meta path">erik</div>');
    expect(html).toContain('<span class="tag brand">Admins</span>');
    expect(html).toContain('<span class="tag">Reviewers</span><span class="meta">and 1 page of their own</span>');
    expect(html).toContain('<span class="amark own">Kvasir</span>');
    expect(html).toContain('<td class="meta">signed in now</td>');
    expect(html).toContain('<td class="meta">never</td>');
    expect(html).toContain('aria-label="Change Erik Lund"');
    expect(html).toContain("given to this person alone, on top of their groups");
    expect(html).toContain("each group follows one of the provider");
  });

  it("offers no change to a person who may only look", () => {
    const look = draw(caps("local", ["identity:see", "query:see"]));
    expect(look).toContain("<b>Erik Lund</b>");
    expect(look).not.toContain("Make a group");
    expect(look).not.toContain("Add a person");
    expect(look).not.toContain(">Change</button>");
  });

  it("says it reads, why it could not, and that there is nobody yet", () => {
    const reading = draw(caps("local"), null, null);
    expect(reading).toContain("Reading the groups.");
    expect(reading).toContain("Reading the people.");
    const refused = draw(caps("local"), null, null, "the door answered 403");
    expect(refused).toContain('<p class="warn">the door answered 403</p>');
    expect(refused).not.toContain("Reading the");
    const empty = draw(caps("local"), [], { mode: "local", sessions_open: 0, people: [] });
    expect(empty).toContain("No group yet.");
    expect(empty).toContain("The desk keeps nobody yet.");
    expect(empty).not.toContain("sees it and works there");
  });

  it("says what a change came to in the section it changed", () => {
    const said = renderToStaticMarkup(<IdentityBody caps={caps("local")} groups={[reviewers]} access={access} why={null} said={{ where: "groups", words: "Guests is made." }} now={NOW} onOpen={none} />);
    expect(said.indexOf("Guests is made.")).toBeGreaterThan(said.indexOf("<h2>Groups</h2>"));
    expect(said.indexOf("Guests is made.")).toBeLessThan(said.indexOf("<h2>People</h2>"));
  });
});

describe("the Identity page with an identity provider", () => {
  const html = draw(caps("oidc"), [reviewers, admins], { ...access, mode: "oidc" });

  it("names the provider and the groups each group follows, and lists who has signed in", () => {
    expect(html).toContain("<dt>Sign-in</dt><dd>Single sign-on</dd>");
    expect(html).toContain("An identity provider");
    expect(html).toContain("The provider says who each person is, and the desk signs for the parts.");
    expect(html).toContain('<dt>provider</dt><dd><span class="path">https://id.example.org/o/nils/</span></dd>');
    expect(html).toContain("<dt>client</dt>");
    expect(html).toContain("<dt>groups claim</dt>");
    expect(html).not.toContain("<dt>signing key</dt>");
    expect(html).toContain('Follows <span class="path">lab-review</span>');
    expect(html).toContain("Follows no group at the provider yet.");
    expect(html).toContain("those who have signed in");
    expect(html).not.toContain("Add a person");
    expect(html).toContain('aria-label="Change Erik Lund"');
    expect(html).toContain("groups are set once, there");
  });
});

describe("adding a person from Setup", () => {
  it("opens the same form, with the groups given or read", () => {
    const given = renderToStaticMarkup(<AddPerson users={[{ username: "astrid" }]} groups={[reviewers]} onClose={none} onDone={none} />);
    expect(given).toContain("Add a person");
    expect(given).toContain('<button type="button" class="opt" aria-pressed="false">Reviewers</button>');
    expect(renderToStaticMarkup(<AddPerson users={[]} onClose={none} onDone={none} />)).toContain("Reading the groups.");
  });
});
