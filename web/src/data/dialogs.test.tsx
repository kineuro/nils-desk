// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's dialogs as they open (record 26, D1): Add a dataset with
// what arrives, who a file is about and the map, or as the v0 folder variant
// when the look found one; Bring in what is new with its steps, its chain and
// its estimate, or the digest alone on an engine that queues nothing after a
// job; and the Datasets page as it opens, with the dataset the address names.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, SETS, type Grant } from "../grants";
import { AddDataset } from "./AddDataset";
import { BringInNew } from "./BringInNew";
import { DataPage } from "./DataPage";
import type { SourcesAnswer } from "./datasets";

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

describe("Add a dataset", () => {
  it("asks what arrives, who a file is about, for the map and the cohort, and offers Add and Add and bring in", () => {
    const html = renderToStaticMarkup(<AddDataset caps={caps()} install={null} places={[]} cohorts={["exchange-ct"]} onClose={none} onDone={none} />);
    expect(html).toContain("Add a dataset</h2>");
    expect(html).toContain("Identified, from the scanners");
    expect(html).toContain("De-identified by someone else");
    expect(html).toContain("Our own codes already in PatientID");
    expect(html).toContain("Who a file is about");
    expect(html).toContain("Probe the shapes</button>");
    expect(html).toContain("Upload a CSV</button>");
    expect(html).toContain("Hold files whose identifier the map does not know");
    expect(html).toContain("Its subjects join");
    expect(html).toContain("the cohort exchange-ct");
    expect(html).toContain(">Add</button>");
    expect(html).toContain("Add and bring in</button>");
    expect(html).not.toContain("v0 cohort folder");
  });

  it("shows the v0 folder variant when the look found one: dcm-raw renamed, v0's map filed, the originals kept", () => {
    const html = renderToStaticMarkup(
      <AddDataset caps={caps()} install={null} places={[]} cohorts={[]} initial={{ path: "/srv/imaging/ms-2019", layout: { v0: { original_files: 41806, raw_files: 41790, renamed: false } } }} onClose={none} onDone={none} />,
    );
    expect(html).toContain("This is a NILS v0 cohort folder");
    expect(html).toContain("41,806 files as they came from the scanners");
    expect(html).toContain("dcm-raw is renamed dcm-anon</b>");
    expect(html).toContain("v0&#x27;s map is filed</b>");
    expect(html).toContain("The originals stay</b>");
    expect(html).toContain("Choose the file</button>");
    expect(html).toContain("The 16 files v0 skipped are in dcm-original only");
    expect(html).toContain("a cohort named after the dataset: ms-2019");
    expect(html).not.toContain("What arrives");
    expect(html).not.toContain(">Add</button>");
    expect(html).toContain("Add and bring in</button>");
  });

  it("keeps to the folder and the old handling on an engine before record 26, in one line", () => {
    const html = renderToStaticMarkup(<AddDataset caps={caps(GRANTS, "4", ["GET /api/sources", "GET /api/jobs", "POST /api/jobs"])} install={null} places={[]} cohorts={[]} onClose={none} onDone={none} />);
    expect(html).toContain("This engine keeps no dataset fields yet");
    expect(html).not.toContain("Who a file is about");
    expect(html).not.toContain("Upload a CSV");
  });

  it("says which page's work adding a folder needs when a person lacks it", () => {
    const html = renderToStaticMarkup(<AddDataset caps={caps(["data:work"])} install={null} places={[]} cohorts={[]} onClose={none} onDone={none} />);
    expect(html).toContain("needs work on the Data page and on the Places page; this account has no work on the Places page.");
    expect(html).toContain("Upload a CSV</button>");
    const noData = renderToStaticMarkup(<AddDataset caps={caps(["places:work", "data:see"])} install={null} places={[]} cohorts={[]} onClose={none} onDone={none} />);
    expect(noData).toContain("this account has no work on the Data page.");
    expect(noData).toContain("Filing a map needs work on the Data page");
    expect(noData).not.toContain("Upload a CSV");
  });
});

describe("Bring in what is new", () => {
  it("lays out pseudonymise, digest and sort as one chain for an identified dataset, with the note about grants and the estimate", () => {
    const html = renderToStaticMarkup(<BringInNew caps={caps()} dataset={incoming} rates={{ pseudonymize: 1400 }} onClose={none} onDone={none} />);
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
    expect(html).toContain("About 2,212 files at 1,400 a second on this machine");
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
    expect(page()).toContain("Add a dataset</button>");
    expect(page("incoming")).toContain("reading the datasets");
  });
});
