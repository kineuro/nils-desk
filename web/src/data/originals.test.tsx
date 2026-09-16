// SPDX-License-Identifier: AGPL-3.0-only
// The two dialogs behind a dataset's originals (record 26): Vault it with
// what moves, the places it may go to and what it leaves untouched, narrowed
// to the role the engine named when it refused one; and Purge it with what
// the engine answered the act would reach, the reason, the dataset's name
// typed out, and the engine's own words where it says it is not ready. The
// numbers and names here are made up.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Detail, type Grant } from "../grants";
import type { SourcesAnswer } from "./datasets";
import { PurgeBody, VaultBody } from "./Originals";
import type { OriginalsLook, PlaceRow } from "./pseudonyms";

const [incoming] = (answer as SourcesAnswer).sources;
const none = () => undefined;

const caps = (detail: Detail = "sensitive", grants: readonly Grant[] = GRANTS): Capabilities =>
  ({
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.29" },
      contracts: { openapi: "5" },
      doors: ["GET /api/places", "GET /api/places/{id}/originals", "POST /api/places/{id}/originals"],
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

const look: OriginalsLook = { files: 18420, bytes: 2449860000, verified: 18402, unverified: 18, held: 4, ready: true };

const places: PlaceRow[] = [
  { id: 1, name: "incoming", role: "source", path: "/srv/imaging/incoming", retired_at: null },
  { id: 6, name: "cold-store", role: "backup", path: "/vault/cold", retired_at: null },
  { id: 7, name: "old-share", role: "share", path: "/srv/share", retired_at: "2026-01-04T09:00:00Z" },
];

const vault = (over: Partial<Parameters<typeof VaultBody>[0]> = {}) =>
  renderToStaticMarkup(
    <VaultBody
      caps={caps()}
      dataset={incoming}
      look={look}
      places={places}
      into=""
      why=""
      sending={false}
      refusal={null}
      role={null}
      onInto={none}
      onWhy={none}
      onClose={none}
      onVault={none}
      {...over}
    />,
  );

const purge = (over: Partial<Parameters<typeof PurgeBody>[0]> = {}) =>
  renderToStaticMarkup(
    <PurgeBody caps={caps()} dataset={incoming} look={look} typed="" why="" sending={false} refusal={null} onTyped={none} onWhy={none} onClose={none} onPurge={none} {...over} />,
  );

describe("Vault it", () => {
  it("says what moves, where it may go, and that the tree, the registry and the codes are untouched", () => {
    const html = vault();
    expect(html).toContain("Vault the originals of incoming</h2>");
    expect(html).toContain("18,420 files · 2.4 GB");
    expect(html).toContain("4 held until mapped move with them");
    expect(html).toContain("/srv/imaging/incoming/derivatives/dcm-original");
    expect(html).toContain('<option value="cold-store">cold-store · backup · /vault/cold</option>');
    // the dataset's own place and a retired one are not places to vault into
    expect(html).not.toContain('value="incoming"');
    expect(html).not.toContain("old-share");
    expect(html).toContain("The pseudonymised tree, the registry and every person&#x27;s code are untouched");
    expect(html).toContain('disabled="">Vault it</button>');
  });

  it("offers the act once a place and a reason are given", () => {
    expect(vault({ into: "cold-store", why: "the scanner copy is kept on tape" })).toContain('class="button">Vault it</button>');
    expect(vault({ into: "cold-store" })).toContain('disabled="">Vault it</button>');
    expect(vault({ why: "a reason alone is not a place" })).toContain('disabled="">Vault it</button>');
  });

  it("keeps to the role the engine named when it refused, in the engine's own words", () => {
    const refused = vault({ refusal: "the originals of a source go to a place with the backup role", role: "backup" });
    expect(refused).toContain("the originals of a source go to a place with the backup role");
    expect(refused).toContain("The engine takes a place with the backup role for this");
    expect(refused).toContain("cold-store · backup");
    const noPlace = vault({ refusal: "the originals go to a place with the export role", role: "export" });
    expect(noPlace).toContain("No place with the export role is declared here");
    expect(noPlace).not.toContain("cold-store");
  });

  it("says the detail the engine reads these acts at", () => {
    expect(vault()).toContain("Run under your detail, sensitive.");
    expect(vault({ caps: caps("quasi") })).toContain("needs detail sensitive; this account sees less");
  });
});

describe("Purge it", () => {
  it("says what the engine answered, that it cannot be undone, and what a held file's original is", () => {
    const html = purge();
    expect(html).toContain("Purge the originals of incoming</h2>");
    expect(html).toContain("<dt>files</dt>");
    expect(html).toContain("18,420 files · 2.4 GB");
    expect(html).toContain("18,402 files have a pseudonymised copy the engine checked");
    expect(html).toContain("18 files have no checked copy in dcm-anon");
    expect(html).toContain("4 files are held until mapped: their originals are what a map would still release");
    expect(html).toContain("This cannot be undone");
    expect(html).toContain("Purging removes the only identified copy of those scans");
    expect(html).toContain("once it is purged, a map releases nothing for it");
    expect(html).toContain("Type incoming to confirm");
  });

  it("waits for the dataset's name typed out and a reason", () => {
    expect(purge()).toContain('disabled="">Purge it</button>');
    expect(purge({ why: "the originals live on tape now" })).toContain('disabled="">Purge it</button>');
    expect(purge({ typed: "incoming" })).toContain('disabled="">Purge it</button>');
    expect(purge({ typed: "incomin", why: "the originals live on tape now" })).toContain('disabled="">Purge it</button>');
    expect(purge({ typed: " incoming ", why: "the originals live on tape now" })).toContain('class="button">Purge it</button>');
  });

  it("is refused in the engine's own words where the engine says it is not ready", () => {
    const why = "3,204 files have no verified copy in dcm-anon; bring incoming in again first";
    const refused = purge({ look: { ...look, ready: false, why }, typed: "incoming", why: "the originals live on tape now" });
    expect(refused).toContain(why);
    expect(refused).toContain('disabled="">Purge it</button>');
    // a refusal with no words of the engine's still stops the act, and an unread door says only that
    expect(purge({ look: { ...look, ready: false }, typed: "incoming", why: "why" })).toContain("The engine refuses to purge these originals and gives no reason.");
    expect(purge({ look: null, typed: "incoming", why: "why" })).toContain("The engine has not said what purging would do here.");
    expect(purge({ look: null })).toContain("This engine has not said what is there to purge.");
  });

  it("shows what the engine refused the act itself with", () => {
    expect(purge({ refusal: "the door answered 409: a release of this dataset is still running" })).toContain("a release of this dataset is still running");
  });
});
