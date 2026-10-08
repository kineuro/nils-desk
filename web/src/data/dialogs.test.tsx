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
import { AddSource } from "./AddSource";
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

describe("Add a source", () => {
  it("on an engine before Wave 7a, says the engine must read structure first, and adds nothing", () => {
    const html = renderToStaticMarkup(<AddSource caps={caps()} install={null} places={[]} onClose={none} onDone={none} />);
    expect(html).toContain("Add a source</h2>");
    expect(html).toContain("This engine does not explore a source by its structure.");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Add and explore<\/button>/);
    // no choice of how the files arrive is offered anywhere
    expect(html).not.toContain("How the files arrive");
    expect(html).not.toContain('name="arrives"');
  });

  it("browses the engine's own folders for anyone who may add a source, with no grant on the install", () => {
    // work on Data and the folders door is all it takes: no install grant, and the supervisor is never asked
    const folders = ["GET /api/sources", "POST /api/jobs", "POST /api/ingest/folders", "POST /api/ingest/look", "GET /api/linkage/types", "POST /api/linkage/imports"];
    const html = renderToStaticMarkup(<AddSource caps={caps(["data:work", "data:see", "places:work"], "5", folders)} install={null} places={[]} onClose={none} onDone={none} />);
    expect(html).toContain('class="field pick-folder"');
    expect(html).toContain('aria-label="the folders above this one"');
    expect(html).toContain('aria-current="location">locations<');
    // and a folder outside the engine's locations is still typed, from the same place
    expect(html).toContain("A folder outside these");
    expect(html).not.toContain('id="source-path"');
    // without the folders door, or without work on Data, the path field stands where the picker would
    const noDoor = renderToStaticMarkup(<AddSource caps={caps()} install={null} places={[]} onClose={none} onDone={none} />);
    expect(noDoor).toContain('id="source-path"');
    expect(noDoor).not.toContain("A folder outside these");
    const noWork = renderToStaticMarkup(<AddSource caps={caps(["data:see", "places:work"], "5", folders)} install={null} places={[]} onClose={none} onDone={none} />);
    expect(noWork).toContain('id="source-path"');
  });

  it("says which page's work adding a folder needs when a person lacks it", () => {
    const html = renderToStaticMarkup(<AddSource caps={caps(["data:work"])} install={null} places={[]} onClose={none} onDone={none} />);
    expect(html).toContain("needs work on the Data page and on the Places page; this account has no work on the Places page.");
    const noData = renderToStaticMarkup(<AddSource caps={caps(["places:work", "data:see"])} install={null} places={[]} onClose={none} onDone={none} />);
    expect(noData).toContain("this account has no work on the Data page.");
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

describe("Bring in what is new", () => {
  it("lays out pseudonymise, digest and sort as one chain for an identified dataset, with the note about grants and the estimate", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps()} dataset={incoming} rates={{ pseudonymize: { files_per_s: 1400, files: 4430 } }} onClose={none} onDone={none} />);
    expect(html).toContain("Bring in what is new</h2>");
    expect(html).toContain("<dt>new in the originals</dt>");
    expect(html).toContain("2,212 files");
    expect(html).toContain("4 held until mapped");
    expect(html).toContain("Pseudonymise</b>");
    expect(html).toContain("Digest</b>");
    expect(html).toContain("Sort</b>");
    expect(html).toContain("classify with mri 0.1.1");
    expect(html).toContain("All three, as one thread</b>");
    expect(html).toContain("Pseudonymise only</b>");
    expect(html).toContain("sorting needs work on the Pipelines page");
    expect(html).toContain("About 2,212 files at 1,400 a second on this machine, measured over 4,430 files");
    expect(html).toContain("Bring in</button>");
  });

  it("starts at the digest for a coded dataset, and omits the estimate where the engine measured no rate", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps()} dataset={exports} rates={null} onClose={none} onDone={none} />);
    expect(html).not.toContain("Pseudonymise</b>");
    expect(html).toContain("Both, as one thread</b>");
    expect(html).toContain("Digest only</b>");
    expect(html).not.toContain("on this machine");
  });

  it("says the chain stops after the digest for a person without work on Pipelines", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps(["data:work", "data:see"])} dataset={incoming} rates={null} onClose={none} onDone={none} />);
    expect(html).toContain("the chain stops after the digest");
  });

  it("queues the digest alone on an engine that queues nothing after a job, and says so in one line", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps(GRANTS, "4")} dataset={{ ...incoming, trees: undefined }} rates={null} onClose={none} onDone={none} />);
    expect(html).toContain("This engine queues one job at a time");
    expect(html).not.toContain("All three, as one chain");
  });
});

describe("the Datasets page", () => {
  const page = (dataset: string | null = null) => renderToStaticMarkup(<DataPage caps={caps(SETS.operator.grants)} install={null} onChanged={none} dataset={dataset} />);
  it("opens on the datasets, reading them, whether or not the address names one", () => {
    expect(page()).toContain("<h1>Datasets</h1>");
    expect(page()).toContain("Add a source</button>");
    expect(page("incoming")).toContain("reading the datasets");
  });
});
