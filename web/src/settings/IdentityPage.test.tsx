// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page as it draws, kept terse: nobody signing in, with the
// sign-in row and the command only; the desk keeping the people, with the row
// of values, the signing facts under Details, the groups as cards with one
// records tag, the people with their subject only on hover, what they add up
// to and a one-word legend; an identity provider, with the provider's host,
// the groups each follows, one line on who appears, and the groups the
// provider's groups reach; what a person who may only look is offered; the
// page while it reads, when a door refuses, and with nobody in it yet; and
// Add a person as Setup opens it.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Grant } from "../grants";
import type { Access, Group, Person } from "./identity";
import { AddPerson, IdentityBody } from "./IdentityPage";

const reviewers: Group = { id: 1, name: "Reviewers", grants: ["assistant:use", "data:see", "query:work", "review:work"], detail: "quasi", follows: ["lab-review"], members: ["erik"] };
const admins: Group = { id: 2, name: "Admins", grants: [...GRANTS], detail: "sensitive", follows: [], members: ["astrid"] };

const person = (over: Partial<Person>): Person => ({ subject: "someone", display: "", groups: [], followed: [], grants: [], detail: null, access: { grants: [], detail: "plain" }, last_seen_at: null, sessions_open: 0, ...over });

const access: Access = {
  mode: "local",
  sessions_open: 2,
  people: [
    person({ subject: "astrid", display: "Astrid Berg", groups: [2], access: { grants: [...GRANTS], detail: "sensitive" }, sessions_open: 1 }),
    person({ subject: "erik", display: "Erik Lund", groups: [1], grants: ["kvasir:see"], access: { grants: [...reviewers.grants, "kvasir:see"], detail: "quasi" }, sessions_open: 1 }),
    person({ subject: "guest01", display: "Visiting student", grants: ["query:see"], detail: "quasi", access: { grants: ["query:see"], detail: "quasi" } }),
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

  it("is the sign-in row and the command only", () => {
    expect(html).toContain("<dt>Sign-in</dt><dd>No sign-in</dd>");
    expect(html).not.toContain("<dt>People</dt>");
    expect(html).toContain("Nobody signs in: whoever opens the desk may do everything.");
    expect(html).toMatch(/<span class="signin-item"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>No sign-in<\/span>/u);
    expect(html).toContain('title="Only this machine"');
    expect(html).toContain('<span class="path">http://127.0.0.1:7203</span>');
    expect(html).not.toContain("h sessions");
    expect(html).not.toContain("<summary>Details</summary>");
    expect(html).toContain("<span>Change with</span>");
    expect(html).toContain("<code>nils setup</code>");
    expect(html).not.toContain("To let people sign in");
    expect(html).not.toContain("chosen in setup");
    expect(html).not.toContain("<h2>Groups</h2>");
    expect(html).not.toContain("<h2>People</h2>");
    expect(html).not.toContain('class="radio');
  });

  it("warns when it answers on the network, and keeps the other addresses under Details", () => {
    const open = draw(caps("off", [...GRANTS], { origin: "https://desk.example.org", also_origins: ["https://nils.example.org"] }), null, null);
    expect(open).toContain('<div class="stat caution"><dt>The desk answers</dt><dd>The network</dd></div>');
    expect(open).toContain('title="This network"');
    expect(open).not.toContain("The desk answers at");
    expect(open).toContain("<summary>Details</summary>");
    expect(open).toContain('<dt>also at</dt><dd><span class="path">https://nils.example.org</span></dd>');
  });
});

describe("the Identity page when the desk keeps the people", () => {
  const html = draw(caps("local"));

  it("counts the people, the groups and who is signed in, and says sign-in as a row of values", () => {
    expect(html).toContain("<dt>People</dt><dd>3</dd>");
    expect(html).toContain("<dt>Groups</dt><dd>2</dd>");
    expect(html).toContain("<dt>Signed in now</dt><dd>2</dd>");
    expect(html).toContain("People, groups and what each may open.");
    expect(html).toContain("<h2>Sign-in</h2>");
    expect(html).toMatch(/<\/svg>Local accounts<\/span>/u);
    expect(html).toMatch(/<\/svg>12 h sessions, 2 open<\/span>/u);
    expect(html).toContain('<details class="signin-details"><summary>Details</summary>');
    expect(html).toContain('<dt>signing key</dt><dd><span class="path">/srv/nils/desk/signing.key</span></dd>');
    expect(html).toContain("<dt>audience</dt>");
    expect(html).not.toContain("<dt>provider</dt>");
    expect(html).not.toContain("nowhere else");
    expect(html).not.toContain("Signed with the desk");
    expect(html).not.toContain("chosen in setup");
  });

  it("draws the groups as cards with their marks and one records tag, and nothing more", () => {
    expect(html).toContain('<h3 class="grow">Reviewers</h3><span class="meta">1 person</span>');
    expect(html).toMatch(
      /<span class="amark do">Assistant<\/span><span class="amark do">Query<\/span><span class="amark">Data<\/span><span class="amark do">Review<\/span><span class="tag records" title="Dates, subject codes, sex and age, scanner names and series and protocol descriptions\."><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Identifying<span class="sr-only"> records<\/span><\/span>/u,
    );
    expect(html).toMatch(/<span class="amark do">Every page<\/span><span class="amark do">Every setting<\/span><span class="tag records" title="[^"]*"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Everything</u);
    expect(html).not.toContain("the desk always keeps at least one");
    expect(html).not.toContain("the pages a group sees");
    expect(html).not.toContain("In records:");
    expect(html).not.toContain("Provider groups it follows");
    expect(html).toContain("Make a group");
    expect(html).toContain('aria-label="Change Reviewers"');
  });

  it("lists the people with their subject only on hover, their groups, what they add up to and when they were last seen", () => {
    expect(html).toContain("Add a person");
    expect(html).toContain('<b title="erik">Erik Lund</b>');
    expect(html).not.toContain(">erik<");
    expect(html).toContain("<th>Access</th><th>Last seen</th>");
    expect(html).toContain('<span class="tag brand">Admins</span>');
    expect(html).toContain('<td><span class="amarks"><span class="tag">Reviewers</span></span></td>');
    expect(html).not.toContain("of their own");
    expect(html).toContain('<span class="amark own">Kvasir</span>');
    expect(html).toContain('<span class="amark own">Query</span><span class="tag records own"');
    expect(html).toContain('<td class="meta">now</td>');
    expect(html).toContain('<td class="meta">never</td>');
    expect(html).toContain('aria-label="Change Erik Lund"');
    expect(html).toContain('<div class="amark-legend"><span class="amark">Data</span><span>see</span><span class="amark do">Data</span><span>work</span><span class="amark own">Kvasir</span><span>own</span></div>');
    expect(html).not.toContain("via provider");
    expect(html).not.toContain("A person in two groups");
  });

  it("offers no change to a person who may only look", () => {
    const look = draw(caps("local", ["identity:see", "query:see"]));
    expect(look).toContain("Erik Lund</b>");
    expect(look).not.toContain("Make a group");
    expect(look).not.toContain("Add a person");
    expect(look).not.toContain(">Change</button>");
  });

  it("says it reads, why it could not, and that there is nobody yet", () => {
    const reading = draw(caps("local"), null, null);
    expect(reading).toContain("Reading the groups.");
    expect(reading).toContain("Reading the people.");
    const refused = draw(caps("local"), null, null, "You may not see people and groups.");
    expect(refused).toContain('<p class="warn">You may not see people and groups.</p>');
    expect(refused).not.toContain("Reading the");
    const empty = draw(caps("local"), [], { mode: "local", sessions_open: 0, people: [] });
    expect(empty).toContain('<p class="meta">No groups yet.</p>');
    expect(empty).toContain('<p class="meta">Nobody yet.</p>');
    expect(empty).not.toContain("amark-legend");
  });

  it("says a change in a word, in the section it changed", () => {
    const said = renderToStaticMarkup(<IdentityBody caps={caps("local")} groups={[reviewers]} access={access} why={null} said={{ where: "groups", words: "Saved: Guests" }} now={NOW} onOpen={none} />);
    expect(said).toContain('<p class="ok-words">Saved: Guests</p>');
    expect(said.indexOf("Saved: Guests")).toBeGreaterThan(said.indexOf("<h2>Groups</h2>"));
    expect(said.indexOf("Saved: Guests")).toBeLessThan(said.indexOf("<h2>People</h2>"));
  });
});

describe("the Identity page with an identity provider", () => {
  const groups: Group[] = [{ ...reviewers, members: ["sam@id.example.org"] }, admins];
  const signedIn: Access = {
    mode: "oidc",
    sessions_open: 1,
    people: [
      person({ subject: "astrid@id.example.org", display: "Astrid Berg", groups: [2], access: { grants: [...GRANTS], detail: "sensitive" }, sessions_open: 1 }),
      person({ subject: "sam@id.example.org", display: "Sam Ek", groups: [1], access: { grants: reviewers.grants, detail: "quasi" } }),
      person({ subject: "erik@id.example.org", display: "Erik Lund", followed: [1], grants: ["kvasir:see"], access: { grants: [...reviewers.grants, "kvasir:see"], detail: "quasi" } }),
    ],
  };
  const html = draw(caps("oidc"), groups, signedIn);

  it("names the provider's host, folds its facts under Details, and says once who appears", () => {
    expect(html).toContain("<dt>Sign-in</dt><dd>Single sign-on</dd>");
    expect(html).toMatch(/<\/svg>Single sign-on<span class="path">id\.example\.org<\/span><\/span>/u);
    expect(html).toMatch(/<\/svg>12 h sessions, 1 open<\/span>/u);
    expect(html).toContain('<dt>provider</dt><dd><span class="path">https://id.example.org/o/nils/</span></dd>');
    expect(html).toContain("<dt>client</dt>");
    expect(html).toContain("<dt>groups claim</dt>");
    expect(html).not.toContain("<dt>signing key</dt>");
    expect(html).not.toContain("The provider says who");
    expect(html).toContain('<p class="meta">People appear once they have signed in.</p>');
    expect(html).not.toContain("those who have signed in");
    expect(html).not.toContain("Add a person");
    expect(html).toContain('aria-label="Change Erik Lund"');
    expect(html).toContain('<b title="erik@id.example.org">Erik Lund</b>');
    expect(html).not.toContain(">erik@id.example.org<");
  });

  it("shows the provider groups a group follows only when it follows some", () => {
    expect(html.split('title="Provider groups it follows"')).toHaveLength(2);
    expect(html).toContain('<span class="path">lab-review</span>');
    expect(html).not.toContain("Follows no group");
  });

  it("shows the groups the provider's groups reach beside the ones a person was put in, and counts them as groups", () => {
    expect(html).toContain('<h3 class="grow">Reviewers</h3><span class="meta">2 people</span>');
    expect(html).toMatch(
      /<td><span class="amarks"><span class="tag followed" title="via provider"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Reviewers<span class="sr-only">, through the provider&#x27;s groups<\/span><\/span><\/span><\/td>/u,
    );
    expect(html).toContain('<td><span class="amarks"><span class="tag">Reviewers</span></span></td>');
    expect(html).toContain('<span class="amark own">Kvasir</span>');
    expect(html).not.toContain('<span class="amark do own">Query</span>');
    expect(html).toMatch(/<\/svg>Reviewers<\/span><span>via provider<\/span><\/div>/u);
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
