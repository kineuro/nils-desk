// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's dialogs as they open (record 26, D1, and Wave 7a): Add a
// source with the folder alone, browsed in the engine's picker or typed, and
// refused on an engine that does not read structure; Bring in what is new
// with its steps, its chain and its estimate, or the digest alone on an engine
// that queues nothing after a job; and the Datasets page as it opens, with the
// dataset the address names. With them, the folder a picker hands on, which
// is the folder a person picked and never the pseudonymised tree of a dataset
// declared on it already.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, SETS, type Grant } from "../grants";
import { caps7a } from "../../test/safeWayIn";
import { RootForm } from "./AddRoot";
import { BringInNew } from "./BringInNew";
import type { FolderPage, IngestRoot } from "./browse";
import { DataPage } from "./DataPage";
import type { SourcesAnswer } from "./datasets";
import { openChosen, rootChosen } from "./picker";

const sources = (answer as SourcesAnswer).sources;
const [incoming, , exports] = sources;

const caps = (grants: readonly Grant[] = GRANTS, openapi = "5", doors = ["GET /api/sources", "GET /api/jobs", "GET /api/events", "POST /api/jobs", "POST /api/ingest/look", "GET /api/linkage/types", "POST /api/linkage/imports", "POST /api/ingest/probe"]): Capabilities => ({
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.29" },
    contracts: { openapi, suite: "2" },
    doors,
    policy: [],
    auth: "off",
    principal: "astrid",
    roles: ["reader", "reviewer", "operator", "admin"],
    registry: { epoch: 412 },
    packs: [{ name: "mri", version: "0.1.1" }],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid", display_name: "Astrid", grants: [...grants], detail: "sensitive", groups: [] },
  desk: { version: "1", mode: "off", contracts: { openapi, suite: "2" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
});

const none = () => undefined;

describe("Add a root folder", () => {
  it("is a folder field and one button: nothing about what is under it", () => {
    const html = renderToStaticMarkup(<RootForm caps={caps7a(["GET /api/places", "POST /api/places"])} install={null} places={[]} onAdded={none} />);
    expect(html).toContain('id="root-path"');
    expect(html).toContain("The folder your dataset folders are in.");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Add<\/button>/);
    expect(html).not.toContain('type="radio"');
    expect(html).not.toMatch(/source|digest|dcm-anon/i);
  });

  it("on an engine that does not read structure, says to update it and adds nothing", () => {
    const html = renderToStaticMarkup(<RootForm caps={caps()} install={null} places={[]} onAdded={none} />);
    expect(html).toContain("Update the engine on the Parts page first.");
    expect(html).not.toContain(">Add</button>");
  });

  it("browses the engine's own folders for anyone who may add one, with no grant on the install", () => {
    const folders = ["GET /api/sources", "POST /api/jobs", "POST /api/ingest/folders", "POST /api/ingest/look", "GET /api/linkage/types", "POST /api/linkage/imports"];
    const html = renderToStaticMarkup(<RootForm caps={caps7a(folders, ["data:work", "data:see", "places:work"])} install={null} places={[]} onAdded={none} />);
    expect(html).toContain('aria-label="the folders above this one"');
    expect(html).toContain("Type a folder");
    expect(html).not.toContain('id="root-path"');
  });

  it("says which page's work adding a folder needs when a person lacks it", () => {
    const html = renderToStaticMarkup(<RootForm caps={caps7a([], ["data:work"])} install={null} places={[]} onAdded={none} />);
    expect(html).toContain("needs work on the Data page and on the Places page; this account has no work on the Places page.");
  });
});

describe("the folder a dataset is declared on", () => {
  // since contract 5 the folders door answers `path` as @name resolves it, which for a location a dataset is declared on is that dataset's pseudonymised tree, and `given` as the folder itself
  const declared: IngestRoot = {
    name: "incoming",
    path: "/srv/imaging/incoming/derivatives/dcm-anon",
    given: "/srv/imaging/incoming",
    originals: "/srv/imaging/incoming/derivatives/dcm-original",
    place: { name: "incoming", role: "source" },
  };
  const bare: IngestRoot = { name: "archive", path: "/srv/archive", given: "/srv/archive", place: null };

  it("is the location's own folder, never the pseudonymised tree of the dataset declared on it already", () => {
    expect(rootChosen(declared)).toEqual({ at: "@incoming", path: "/srv/imaging/incoming", place: { name: "incoming", role: "source" } });
    expect(rootChosen(declared).path).not.toContain("dcm-anon");
    expect(rootChosen(bare).path).toBe("/srv/archive");
    // an engine that says nothing of the folder it was given has the folder and the tree as one
    expect(rootChosen({ name: "old", path: "/srv/old", place: null }).path).toBe("/srv/old");
  });

  it("is that folder again where the location itself is open, and the engine's own path for a folder below it", () => {
    const page = (at: string, rel: string, path: string): FolderPage => ({
      at,
      root: "incoming",
      rel,
      path,
      parent: rel === "" ? null : "@incoming",
      exists: true,
      directory: true,
      readable: true,
      place: null,
      folders: [],
      next: null,
      total: 0,
      files: { count: 0, more: false },
      partial: false,
      timed_out: false,
    });
    expect(openChosen(page("@incoming", "", "/srv/imaging/incoming/derivatives/dcm-anon"), [declared])?.path).toBe("/srv/imaging/incoming");
    expect(openChosen(page("@incoming/sub-001", "sub-001", "/srv/imaging/incoming/derivatives/dcm-anon/sub-001"), [declared])?.path).toBe("/srv/imaging/incoming/derivatives/dcm-anon/sub-001");
    expect(openChosen({ ...page("@incoming", "", "/srv/imaging/incoming"), readable: false }, [declared])).toBeNull();
  });
});

describe("Do all steps", () => {
  it("names the steps in one line for an identified dataset, with the new files and the estimate", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps()} dataset={incoming} rates={{ pseudonymize: { files_per_s: 1400, files: 4430 } }} onClose={none} onDone={none} />);
    expect(html).toContain("Do all steps: incoming</h2>");
    expect(html).toContain("Pseudonymise → Read → Sort");
    expect(html).toContain("2,212 new files");
    expect(html).toContain("About 2,212 files at 1,400 a second on this machine, measured over 4,430 files");
    expect(html).toContain("Start</button>");
    // no engine words and no paragraphs
    expect(html).not.toMatch(/digest|batch|thread|dcm-anon/i);
  });

  it("starts at reading for a dataset already anonymised, and omits the estimate where the engine measured no rate", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps()} dataset={exports} rates={null} onClose={none} onDone={none} />);
    expect(html).toContain("Read → Sort");
    expect(html).not.toContain("Pseudonymise");
    expect(html).not.toContain("on this machine");
  });

  it("stops after reading for a person without work on Pipelines", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps(["data:work", "data:see"])} dataset={incoming} rates={null} onClose={none} onDone={none} />);
    expect(html).toContain("Pseudonymise → Read</p>");
  });

  it("reads alone on an engine that queues nothing after a job", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps(GRANTS, "4")} dataset={{ ...incoming, trees: undefined }} rates={null} onClose={none} onDone={none} />);
    expect(html).toContain(">Read</p>");
  });
});

describe("the Datasets and cohorts page", () => {
  const page = (dataset: string | null = null) => renderToStaticMarkup(<DataPage caps={caps(SETS.operator.grants)} install={null} onChanged={none} dataset={dataset} />);
  it("opens on the datasets, reading them, whether or not the address names one", () => {
    expect(page()).toContain("<h1>Datasets and cohorts</h1>");
    expect(page()).toContain("Add a dataset</button>");
    expect(page("incoming")).toContain("reading the datasets");
  });
});
