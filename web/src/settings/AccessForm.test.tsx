// SPDX-License-Identifier: AGPL-3.0-only
// The access form as it opens: adding a person with the groups on top and
// nothing to add before a username and a password; changing one, with each
// line naming the group that gave it, the levels below it locked, a page of
// their own on top and the note saying what it comes to; under oidc the
// groups the provider's groups reach, fixed among the chips and counted as
// groups; a door that refused to show the groups; and a group made or
// changed.

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
    expect(html).toMatch(/<button type="button" class="opt" aria-pressed="false">Reviewers<\/button>/u);
    expect(html).toContain("Make a group");
    expect(html).toContain("This person will see Home only.");
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

  it("picks their groups and names the group that gave each line", () => {
    expect(html).toContain("Change Erik Lund");
    expect(html).toMatch(/<button type="button" class="opt on" aria-pressed="true"><svg[^>]*>.*?<\/svg>Reviewers<\/button>/u);
    expect(html).toMatch(/<button type="button" class="opt" aria-pressed="false">Data team<\/button>/u);
    expect(html).not.toContain("followed");
    expect(lineOf(html, "Query")).toContain("from Reviewers");
    expect(lineOf(html, "Kvasir")).toContain("for Erik Lund only");
    expect(lineOf(html, "Release")).not.toContain("from");
  });

  it("locks the levels below what a group gives, and leaves a page of their own free", () => {
    expect(lineOf(html, "Query")).toContain(
      '<button type="button" class="locked" aria-pressed="false" disabled="">Hidden</button><button type="button" class="locked" aria-pressed="false" disabled="">See</button><button type="button" class="on" aria-pressed="true">Work</button>',
    );
    expect(lineOf(html, "Assistant")).toContain('<button type="button" class="locked" aria-pressed="false" disabled="">Hidden</button><button type="button" class="on" aria-pressed="true">Use</button>');
    expect(lineOf(html, "Kvasir")).toContain('<button type="button" aria-pressed="false">Hidden</button><button type="button" class="on" aria-pressed="true">See</button>');
    expect(lineOf(html, "Release")).toContain('<button type="button" class="on off" aria-pressed="true">Hidden</button>');
    expect(lineOf(html, "What they see in records")).toContain('class="locked" aria-pressed="false" disabled="">Without sex and age</button><button type="button" class="on" aria-pressed="true">With sex and age</button>');
    expect(lineOf(html, "Audit")).not.toContain(">Work<");
  });

  it("says what it comes to", () => {
    expect(html).toContain("Erik Lund will see Home, Assistant, Query, Data and Review, and Kvasir under Settings.");
    expect(html).toContain("Erik Lund may use the assistant, and work in Query and Review.");
    expect(html).toContain("which is Erik Lund");
    expect(html).toMatch(/<button type="button" class="button">Save<\/button>/u);
  });

  it("under oidc, fixes the groups the provider's groups reach among the chips and counts them as groups", () => {
    const reached: Person = { ...erik, subject: "erik@id.example.org", groups: [], followed: [1] };
    const oidc = renderToStaticMarkup(<PersonForm mode="oidc" groups={[reviewers, dataTeam]} person={reached} taken={[]} onClose={none} onDone={none} />);
    expect(oidc).toMatch(/<span class="opt on followed"><svg[^>]*>(?:(?!<\/svg>).)*<\/svg>Reviewers<span class="sr-only">, through the provider&#x27;s groups<\/span><\/span>/u);
    expect(oidc).not.toMatch(/<button[^>]*>(?:<svg[^>]*>(?:(?!<\/svg>).)*<\/svg>)?Reviewers<\/button>/u);
    expect(oidc).toMatch(/<button type="button" class="opt" aria-pressed="false">Data team<\/button>/u);
    expect(oidc).toContain("A group with the globe takes them in through the provider");
    expect(lineOf(oidc, "Query")).toContain("from Reviewers");
    expect(lineOf(oidc, "Query")).toContain('class="locked" aria-pressed="false" disabled="">See</button>');
    expect(lineOf(oidc, "Kvasir")).toContain("for Erik Lund only");
    expect(oidc).toContain("Reviewers gives all of it but Kvasir");
  });

  it("names every group that gives a line's level", () => {
    const lines = renderToStaticMarkup(<AccessLines kind="person" name="Sara" levels={levelsOf(["query:work", "data:work"])} detail="quasi" groups={[reviewers, dataTeam]} onLevel={none} onDetail={none} />);
    expect(lineOf(lines, "Query")).toContain("from Reviewers and Data team");
    expect(lineOf(lines, "Data")).toContain("from Data team");
  });
});

describe("a group", () => {
  it("is made with a name and, under oidc, the provider's groups it follows, and no line names a group", () => {
    const html = renderToStaticMarkup(<GroupForm mode="oidc" group={null} groups={[reviewers]} members={0} onClose={none} onDone={none} />);
    expect(html).toContain("Make a group");
    expect(html).toContain("The provider&#x27;s groups it follows");
    expect(html).not.toContain("from ");
    expect(html).toContain("People in this group will see Home only.");
    expect(html).toContain("It follows no group at the provider yet, so nobody joins it by signing in.");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Make the group<\/button>/u);
    expect(html).not.toContain("Remove the group");
  });

  it("is changed with its lines as it gives them, and can be removed", () => {
    const html = renderToStaticMarkup(<GroupForm mode="local" group={dataTeam} groups={[reviewers, dataTeam]} members={2} onClose={none} onDone={none} />);
    expect(html).toContain("Change Data team");
    expect(html).toContain('value="Data team"');
    expect(html).not.toContain("follows");
    expect(lineOf(html, "Data")).toContain('<button type="button" class="on" aria-pressed="true">Work</button>');
    expect(lineOf(html, "Data")).not.toContain("locked");
    expect(html).toContain("People in Data team may work in Query, Data and Release.");
    expect(html).toContain("2 people are in it now");
    expect(html).toMatch(/<button type="button" class="button">Save<\/button>/u);
    expect(html).toContain("Remove the group");
  });
});
