// SPDX-License-Identifier: AGPL-3.0-only
// The access form as it opens, kept terse: adding a person with the groups on
// top and nothing to add before a username and a password; changing one, with
// each line in a few words naming the group that gave it, the levels below it
// locked and saying on hover which group gives them, a page of their own on
// top and one sentence saying what it comes to; under oidc the groups the
// provider's groups reach, fixed among the chips and counted as groups; a
// door that refused to show the groups; and a group made or changed.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessLines, GroupForm, PersonForm } from "./AccessForm";
import { levelsOf, type Group, type Person } from "./identity";

const reviewers: Group = { id: 1, name: "Reviewers", grants: ["assistant:use", "data:see", "query:work", "review:work"], detail: "quasi", follows: [], members: ["erik"] };
const dataTeam: Group = { id: 2, name: "Data team", grants: ["query:work", "data:work", "release:work"], detail: "plain", follows: ["lab-data"], members: [] };

const erik: Person = {
  subject: "erik",
  display: "Erik Lund",
  groups: [1],
  followed: [],
  grants: ["kvasir:see"],
  detail: null,
  access: { grants: ["assistant:use", "data:see", "kvasir:see", "query:work", "review:work"], detail: "quasi" },
  last_seen_at: null,
  sessions_open: 0,
};

const none = () => undefined;

/** One line of the form, from its title to the end of its words. */
function lineOf(html: string, title: string): string {
  const at = html.indexOf(`<b>${title}</b>`);
  return html.slice(at, html.indexOf("</div>", at));
}

describe("adding a person", () => {
  it("opens with the fields, the groups to pick and Make a group, and holds Add back", () => {
    const html = renderToStaticMarkup(<PersonForm mode="local" groups={[reviewers, dataTeam]} person={null} taken={["astrid"]} onClose={none} onDone={none} />);
    expect(html).toContain("Add a person");
    expect(html).toContain("Username");
    expect(html).toContain("Name shown");
    expect(html).toContain('type="password"');
    expect(html).not.toContain("The person changes it");
    expect(html).toMatch(/<button type="button" class="opt" aria-pressed="false">Reviewers<\/button>/u);
    expect(html).toContain("Make a group");
    expect(html).not.toContain("A person may be in more than one");
    expect(html).toContain("<p>This person sees no page yet.</p>");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Add the person<\/button>/u);
  });

  it("waits for the groups before anything can be added, and says in plain words when they could not be read", () => {
    const html = renderToStaticMarkup(<PersonForm mode="local" groups={null} person={null} taken={[]} onClose={none} onDone={none} />);
    expect(html).toContain("Reading the groups.");
    expect(html).not.toContain("Make a group");
    const refused = renderToStaticMarkup(<PersonForm mode="local" groups={null} why="You may not see people and groups." person={null} taken={[]} onClose={none} onDone={none} />);
    expect(refused).toContain('<p class="warn">You may not see people and groups.</p>');
    expect(refused).not.toContain("Reading the groups.");
    expect(refused).toMatch(/<button type="button" class="button" disabled="">Add the person<\/button>/u);
  });
});

describe("changing a person", () => {
  const html = renderToStaticMarkup(<PersonForm mode="local" groups={[reviewers, dataTeam]} person={erik} taken={[]} onClose={none} onDone={none} />);

  it("picks their groups and names in a few words the group that gave each line", () => {
    expect(html).toContain("Change Erik Lund");
    expect(html).not.toContain("signed in as");
    expect(html).toMatch(/<button type="button" class="opt on" aria-pressed="true"><svg[^>]*>.*?<\/svg>Reviewers<\/button>/u);
    expect(html).toMatch(/<button type="button" class="opt" aria-pressed="false">Data team<\/button>/u);
    expect(html).not.toContain("followed");
    expect(lineOf(html, "Query")).toContain('<span class="what">Ask, run and chart questions · work: keep cards, queue ask jobs · <span class="from">from Reviewers</span></span>');
    expect(lineOf(html, "Kvasir")).toContain('<span class="what">Stations and models · work: models, keys, stations · <span class="from own">own</span></span>');
    expect(lineOf(html, "Release")).toContain('<span class="what">Releases made · work: make and hand over</span>');
    expect(html).toContain('<b>Settings</b></div>');
  });

  it("locks the levels below what a group gives, and says on hover which group gives them", () => {
    expect(lineOf(html, "Query")).toContain(
      '<button type="button" class="locked" aria-pressed="false" disabled="" title="from Reviewers">Hidden</button><button type="button" class="locked" aria-pressed="false" disabled="" title="from Reviewers">See</button><button type="button" class="on" aria-pressed="true">Work</button>',
    );
    expect(lineOf(html, "Assistant")).toContain('<button type="button" class="locked" aria-pressed="false" disabled="" title="from Reviewers">Hidden</button><button type="button" class="on" aria-pressed="true">Use</button>');
    expect(lineOf(html, "Kvasir")).toContain('<button type="button" aria-pressed="false">Hidden</button><button type="button" class="on" aria-pressed="true">See</button>');
    expect(lineOf(html, "Release")).toContain('<button type="button" class="on off" aria-pressed="true">Hidden</button>');
    expect(lineOf(html, "Records")).toContain(
      'class="locked" aria-pressed="false" disabled="" title="No dates, subject codes, sex or age, scanner names or series descriptions.">Without identifying details</button><button type="button" class="on" aria-pressed="true" title="Dates, subject codes, sex and age, scanner names and series and protocol descriptions.">With identifying details</button>',
    );
    expect(lineOf(html, "Records")).toContain('<span class="from">from Reviewers</span>');
    expect(lineOf(html, "Audit")).not.toContain(">Work<");
  });

  it("says what it comes to in one sentence", () => {
    expect(html).toContain("<p>Erik Lund sees Assistant, Query, Data, Review and Kvasir, works in Query and Review, with identifying details.</p>");
    expect(html).not.toContain("A page a group gives cannot go lower");
    expect(html).toMatch(/<button type="button" class="button">Save<\/button>/u);
  });

  it("under oidc, fixes the groups the provider's groups reach among the chips and counts them as groups", () => {
    const reached: Person = { ...erik, subject: "erik@id.example.org", groups: [], followed: [1] };
    const oidc = renderToStaticMarkup(<PersonForm mode="oidc" groups={[reviewers, dataTeam]} person={reached} taken={[]} onClose={none} onDone={none} />);
    expect(oidc).toMatch(/<span class="opt on followed" title="via provider"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Reviewers<span class="sr-only">, through the provider&#x27;s groups<\/span><\/span>/u);
    expect(oidc).not.toMatch(/<button[^>]*>(?:<svg[^>]*>(?:(?!<\/svg>).)*<\/svg>)?Reviewers<\/button>/u);
    expect(oidc).toMatch(/<button type="button" class="opt" aria-pressed="false">Data team<\/button>/u);
    expect(oidc).not.toContain("A group with the globe");
    expect(lineOf(oidc, "Query")).toContain('<span class="from">from Reviewers</span>');
    expect(lineOf(oidc, "Query")).toContain('class="locked" aria-pressed="false" disabled="" title="from Reviewers">See</button>');
    expect(lineOf(oidc, "Kvasir")).toContain('<span class="from own">own</span>');
    expect(oidc).toContain("Erik Lund sees Assistant, Query, Data, Review and Kvasir");
  });

  it("names every group that gives a line's level", () => {
    const lines = renderToStaticMarkup(<AccessLines kind="person" levels={levelsOf(["query:work", "data:work"])} detail="quasi" groups={[reviewers, dataTeam]} onLevel={none} onDetail={none} />);
    expect(lineOf(lines, "Query")).toContain("from Reviewers and Data team");
    expect(lineOf(lines, "Data")).toContain("from Data team");
  });
});

describe("a group", () => {
  it("is made with a name and, under oidc, the provider groups it follows, and no line names a group", () => {
    const html = renderToStaticMarkup(<GroupForm mode="oidc" group={null} groups={[reviewers]} members={0} onClose={none} onDone={none} />);
    expect(html).toContain("Make a group");
    expect(html).toContain(">Provider groups</label>");
    expect(html).toContain('placeholder="group-a, group-b"');
    expect(html).not.toContain("Names as the provider sends them");
    expect(html).not.toContain("from ");
    expect(html).toContain("<p>People in this group see no page yet.</p>");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Make the group<\/button>/u);
    expect(html).not.toContain("Remove the group");
  });

  it("is changed with its lines as it gives them, and can be removed", () => {
    const html = renderToStaticMarkup(<GroupForm mode="local" group={dataTeam} groups={[reviewers, dataTeam]} members={2} onClose={none} onDone={none} />);
    expect(html).toContain("Change Data team");
    expect(html).toContain('value="Data team"');
    expect(html).not.toContain("Provider groups");
    expect(html).not.toContain("A name people will know it by");
    expect(lineOf(html, "Data")).toContain('<button type="button" class="on" aria-pressed="true">Work</button>');
    expect(lineOf(html, "Data")).not.toContain("locked");
    expect(html).toContain("<p>People in Data team see Query, Data and Release, work in Query, Data and Release, without identifying details.</p>");
    expect(html).toMatch(/<button type="button" class="button">Save<\/button>/u);
    expect(html).toContain("Remove the group");
  });
});
