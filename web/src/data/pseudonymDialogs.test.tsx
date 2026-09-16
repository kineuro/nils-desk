// SPDX-License-Identifier: AGPL-3.0-only
// The three dialogs of the Pseudonymisation page as they open (record 27, R3
// and R4): the tag chooser with all hundred, what becomes of each and what
// this dataset keeps; the map's columns with a role and a type written out as
// options rather than looped into a fragment; and the held files with their
// banner, their shapes and the three ways out, the reveal refused in words
// that name no grant. The datasets, numbers and names here are made up.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Detail, type Grant } from "../grants";
import type { Dataset, SourcesAnswer } from "./datasets";
import { HeldDialog, MapColumns, MapDialog } from "./PseudonymsPage";
import { guessRole, lookAt, type HeldRow, type IdType } from "./pseudonyms";
import { TagsDialog } from "./Tags";

const DOORS = ["PUT /api/places/{id}", "POST /api/linkage/imports", "POST /api/linkage/types", "GET /api/linkage/held", "POST /api/linkage/held/code", "POST /api/linkage/held/reveal"];

const caps = (grants: readonly Grant[] = GRANTS, detail: Detail = "sensitive", doors: string[] = DOORS): Capabilities =>
  ({
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.29" },
      contracts: { openapi: "5" },
      doors,
      policy: [],
      auth: "off",
      principal: "astrid",
      roles: [],
      registry: { epoch: 412 },
      packs: [],
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: [...grants], detail, groups: [] },
    desk: { version: "1", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const { sources } = answer as SourcesAnswer;
const dataset: Dataset = { ...sources[0], tags: { keep_demographics: true, remove: [], keep: [] }, held: { files: 1240, identifiers: 18 } };
const types: IdType[] = [
  { name: "personnummer", description: "the national number" },
  { name: "lake-id", description: "the lake study's id" },
];
const none = () => undefined;

const chooser = (over: Partial<Parameters<typeof TagsDialog>[0]> = {}) => renderToStaticMarkup(<TagsDialog caps={caps()} dataset={dataset} onClose={none} onSaved={none} {...over} />);

describe("the tag chooser", () => {
  it("shows every one of the hundred with its name, its group and what becomes of it", () => {
    const html = chooser();
    expect(html).toContain("Tags of incoming</h2>");
    // one row a tag, the hundred and the three the engine settles itself
    expect(html.match(/<tr/gu) ?? []).toHaveLength(1 + 3 + 100);
    expect(html).toContain("0010,0010");
    expect(html).toContain("PatientName");
    expect(html).toContain("removed with the patient group");
    expect(html).toContain("0400,0561");
    expect(html).toContain("OriginalAttributesSequence");
    // a tag the standard does not name says so rather than carrying an invented one
    expect(html).toContain("no name in the standard");
  });

  it("counts what leaves and what stays by the same rules, so a hundred are never removed while four are kept", () => {
    const html = chooser();
    expect(html).toContain('<span class="k">removed</span><span class="v">96</span>');
    expect(html).toContain('<span class="k">kept</span><span class="v">4</span>');
    expect(html).toContain("this dataset&#x27;s own</span><span class=\"v\">none</span>");
    // a dataset that keeps one more moves both counts, and its own removals are counted apart
    const own = chooser({ dataset: { ...dataset, tags: { keep_demographics: true, remove: ["0008,1030"], keep: ["0008,1010"] } } });
    expect(own).toContain('<span class="k">removed</span><span class="v">96</span>');
    expect(own).toContain('<span class="k">kept</span><span class="v">5</span>');
    expect(own).toContain('<span class="k">this dataset&#x27;s own</span><span class="v">1</span>');
  });

  it("says of the rows nothing can remove why, and gives them no tick", () => {
    const html = chooser();
    expect(html).toContain("replaced by the subject&#x27;s code");
    expect(html).toContain("computed from the birth date before it goes, and written");
    expect(html).toContain("never removed; remapped when the scans leave");
    expect(html).toContain("kept: a covariate, not an identifier");
    // the three the engine settles carry a lock rather than a checkbox, and no checkbox is ticked for them
    expect(html).not.toContain('aria-label="Keep it 0010,0020"');
    expect(html).toContain('aria-label="Keep it 0010,0010"');
  });

  it("offers Save and the tag box to a person who may change them, and words in their place to one who may not", () => {
    expect(chooser()).toContain(">Save</button>");
    expect(chooser()).toContain("A tag the hundred do not hold");
    const reader = chooser({ caps: caps(["data:see"]) });
    expect(reader).not.toContain(">Save</button>");
    expect(reader).toContain("Choosing which tags go needs work on the Data page and on the Places page");
    expect(reader).toContain("0010,0010");
    // an engine that does not take the change says so instead of offering Save
    const old = chooser({ caps: caps(GRANTS, "sensitive", []) });
    expect(old).not.toContain(">Save</button>");
    expect(old).toContain("This engine does not take a change to a dataset here.");
  });
});

describe("the map's columns", () => {
  const column = (header: string, values: string[]) => {
    const look = lookAt(header, values);
    return { header, look, guess: guessRole(header, look, types), first: values.slice(0, 3), description: "" };
  };
  it("writes every role and every type out as an option, and shows the first values under each header", () => {
    const columns = [column("personnummer", ["199001019999", "199002029999"]), column("radiology_accession", ["REG1234", "REG1235"]), column("subject_code", ["S-0001", "S-0002"])];
    const html = renderToStaticMarkup(<MapColumns columns={columns} types={types} working={false} onRole={none} onType={none} onDescription={none} />);
    for (const role of ['value="identifier"', 'value="canonical"', 'value="code"', 'value="ignore"']) expect(html).toContain(role);
    expect(html).toContain('<option value="type:personnummer">of type personnummer</option>');
    expect(html).toContain('<option value="type:lake-id">of type lake-id</option>');
    // a header no type answers to is offered as a new type, named after the header, with a description beside it
    expect(html).toContain("a new type: radiology-accession</option>");
    expect(html).toContain('<option value="new"');
    expect(html).toContain('aria-label="Describe the type radiology-accession"');
    expect(html).toContain("199001019999, 199002029999");
    // the code column files under no type, so it is offered none
    expect(html.match(/<select/gu) ?? []).toHaveLength(3 + 2);
  });
});

describe("provide a map", () => {
  it("asks for a comma-separated file with a header, says where the identifiers go, and will not file before it has rehearsed", () => {
    const html = renderToStaticMarkup(<MapDialog caps={caps()} dataset={dataset} types={types} onClose={none} onFiled={none} />);
    expect(html).toContain("Provide a map for incoming</h2>");
    expect(html).toContain("A CSV: commas, one header row naming the columns");
    expect(html).toContain("Up to 100,000 rows at once");
    expect(html).toContain("sealed store beside the registry, never into the registry itself");
    expect(html).toContain("recorded against you");
    expect(html).toContain("See what it will do</button>");
    expect(html).not.toContain("File the map</button>");
    // the refusal for a person who may not read identifiers names no grant and no level
    const reader = renderToStaticMarkup(<MapDialog caps={caps(GRANTS, "quasi")} dataset={dataset} types={types} onClose={none} onFiled={none} />);
    expect(reader).toContain("Filing a map means reading identifiers, and you are not cleared to");
    expect(reader).not.toContain("sensitive");
  });
});

describe("held until mapped", () => {
  const rows: HeldRow[] = [
    { shape: "999999999999", files: 980, first_seen: "2026-09-01T08:00:00Z", batch: "incoming-2026-09-01" },
    { shape: "AAA9999", files: 260, first_seen: "2026-09-04T08:00:00Z", batch: "incoming-2026-09-04" },
  ];
  it("says how many wait and what that means, lists the shapes with their files, and offers three ways out", () => {
    const html = renderToStaticMarkup(<HeldDialog caps={caps()} dataset={dataset} rows={rows} onClose={none} onMap={none} onCode={none} />);
    expect(html).toContain("1,240 files, 18 identifiers the map does not know");
    expect(html).toContain("They reach neither");
    expect(html).toContain("999999999999");
    expect(html).toContain("12 digits");
    expect(html).toContain("980");
    expect(html).toContain("A shape, never a value: every digit shows as 9 and every letter as A.");
    expect(html).toContain("Provide a map</b>");
    expect(html).toContain("Code them anyway</b>");
    expect(html).toContain("Reveal them to me</b>");
    expect(html).toContain("The identifiers themselves, shown once");
  });

  it("refuses the reveal to someone not cleared to see identifiers, in plain words", () => {
    const html = renderToStaticMarkup(<HeldDialog caps={caps(GRANTS, "quasi")} dataset={dataset} rows={rows} onClose={none} onMap={none} onCode={none} />);
    expect(html).toContain("Only someone cleared to see identifiers may ask for this, and you are not.");
    expect(html).not.toContain("sensitive");
    expect(html).not.toContain("data:work");
    expect(html).toContain('<input type="radio" disabled="" name="held-way"/>');
  });

  it("offers only the ways this engine serves", () => {
    const html = renderToStaticMarkup(<HeldDialog caps={caps(GRANTS, "sensitive", ["GET /api/linkage/held"])} dataset={dataset} rows={rows} onClose={none} onMap={none} onCode={none} />);
    expect(html).toContain("radio-row off");
    expect(html).toContain("Provide a map</b>");
  });
});
