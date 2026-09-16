// SPDX-License-Identifier: AGPL-3.0-only
// The dialogs behind a dataset's originals (record 26): Vault it with what
// moves, the places the engine takes for it and what it leaves untouched;
// Purge it with what the engine answered the act would reach, the reason,
// the dataset's name typed out, and the engine's own words where it says it
// is not ready; and Change, which declares nothing of where the originals
// stand and sends a person to the act that decides it. What a dialog was
// told is the page's, so drawing it again keeps every answer. The numbers
// and names here are made up.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import answer from "../../test/fixtures/sources_record26.json";
import type { Capabilities } from "../capabilities";
import { GRANTS, type Detail, type Grant } from "../grants";
import type { SourcesAnswer } from "./datasets";
import { PurgeBody, VaultBody, VaultDialog } from "./Originals";
import { ChangeDialog } from "./PseudonymsPage";
import { NOTHING_ASKED, NOTHING_TYPED, vaultAsked, type OriginalsActs, type OriginalsLook, type PlaceRow, type PurgeAsk, type VaultAsk } from "./pseudonyms";

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

// the dataset is the fixture's incoming, at /srv/imaging/incoming with both trees under it
const places: PlaceRow[] = [
  { id: 1, name: "incoming", role: "source", path: "/srv/imaging/incoming", retired_at: null },
  { id: 6, name: "cold-store", role: "backup", path: "/vault/cold", retired_at: null },
  { id: 7, name: "exports", role: "export", path: "/srv/exports", retired_at: null },
  { id: 8, name: "old-vault", role: "backup", path: "/vault/old", retired_at: "2026-01-04T09:00:00Z" },
  { id: 9, name: "hole", role: "backup", path: "/srv/imaging/incoming/derivatives/dcm-original/hole", retired_at: null },
  { id: 10, name: "unsaid", path: "/vault/unsaid", retired_at: null },
];

const vault = (ask: Partial<VaultAsk> = {}, over: Partial<Parameters<typeof VaultBody>[0]> = {}) =>
  renderToStaticMarkup(<VaultBody caps={caps()} dataset={incoming} look={look} places={places} ask={{ ...NOTHING_ASKED, ...ask }} onAsk={none} onClose={none} onVault={none} {...over} />);

const purge = (ask: Partial<PurgeAsk> = {}, over: Partial<Parameters<typeof PurgeBody>[0]> = {}) =>
  renderToStaticMarkup(<PurgeBody caps={caps()} dataset={incoming} look={look} ask={{ ...NOTHING_TYPED, ...ask }} onAsk={none} onClose={none} onPurge={none} {...over} />);

describe("Vault it", () => {
  it("says what moves, where it may go, and that the tree, the registry and the codes are untouched", () => {
    const html = vault();
    expect(html).toContain("Vault the originals of incoming</h2>");
    expect(html).toContain("18,420 files · 2.4 GB");
    expect(html).toContain("4 held until mapped move with them");
    expect(html).toContain("/srv/imaging/incoming/derivatives/dcm-original");
    expect(html).toContain('<option value="cold-store">cold-store · backup · /vault/cold</option>');
    expect(html).toContain("The pseudonymised tree, the registry and every person's code are untouched".replace("'", "&#x27;"));
    expect(html).toContain('disabled="">Vault it</button>');
  });

  it("offers only the places the engine takes, and never one the act would be refused for", () => {
    const html = vault();
    // the backup role alone, before any refusal: a source, an export place and the dataset's own are not offered
    expect(html).not.toContain('value="incoming"');
    expect(html).not.toContain("exports");
    // a retired place is not in force, a place declared inside the dataset is under a source place, and a place whose role the door does not say is left out
    expect(html).not.toContain("old-vault");
    expect(html).not.toContain("hole");
    expect(html).not.toContain("unsaid");
    expect(html).toContain("The engine takes a place with the backup role for this, and never one inside the dataset itself.");
    // no backup place outside the dataset: the dialog says so rather than offering what would be refused
    const bare = vault({}, { places: [places[0], places[4]] });
    expect(bare).toContain("No place with the backup role stands outside incoming");
    expect(bare).not.toContain("<select");
  });

  it("offers the act once a place and a reason are given", () => {
    expect(vault({ into: "cold-store", why: "the scanner copy is kept on tape" })).toContain('class="button">Vault it</button>');
    expect(vault({ into: "cold-store" })).toContain('disabled="">Vault it</button>');
    expect(vault({ why: "a reason alone is not a place" })).toContain('disabled="">Vault it</button>');
    expect(vault({ into: "cold-store", why: "on tape", sending: true })).toContain('disabled="">Vault it</button>');
  });

  it("keeps to the role the engine named when it refused, in the engine's own words", () => {
    const refused = vault({ refusal: "the originals of a source go to a place with the backup role", role: "backup" });
    expect(refused).toContain("the originals of a source go to a place with the backup role");
    expect(refused).toContain("The engine takes a place with the backup role for this, as it said when it refused.");
    expect(refused).toContain("cold-store · backup");
    // another role named: the places of that role stand in the backup ones' place
    const other = vault({ refusal: "the originals go to a place with the export role", role: "export" });
    expect(other).toContain("exports · export · /srv/exports");
    expect(other).not.toContain("cold-store");
    // a role no place here carries: the dialog says so rather than offering what the engine would refuse
    const noPlace = vault({ refusal: "the originals go to a place with the exchange role", role: "exchange" });
    expect(noPlace).toContain("No place with the exchange role stands outside incoming");
    expect(noPlace).not.toContain("cold-store");
  });

  it("says the detail the engine reads these acts at", () => {
    expect(vault()).toContain("Run under your detail, sensitive.");
    expect(vault({}, { caps: caps("quasi") })).toContain("needs detail sensitive; this account sees less");
  });

  it("keeps the place a person chose when the dialog is drawn again between choosing and asking", () => {
    // what the dialog was told is the page's own: a re-render is a fresh draw of the same answers, and the dialog keeps none of its own
    let ask: VaultAsk = NOTHING_ASKED;
    const onAsk = (next: VaultAsk) => {
      ask = next;
    };
    const draw = () => renderToStaticMarkup(<VaultDialog caps={caps()} dataset={incoming} look={look} places={places} ask={ask} onAsk={onAsk} onClose={none} onQueued={none} />);
    expect(draw()).toContain('disabled="">Vault it</button>');
    // the person chooses the place, and gives the reason a few seconds later
    onAsk({ ...ask, into: "cold-store" });
    onAsk({ ...ask, why: "the scanner copy is kept on tape" });
    // the page read the dataset again in between and drew the dialog once more
    const again = draw();
    expect(again).toMatch(/<option[^>]*selected[^>]*>cold-store · backup/u);
    expect(again).toContain("the scanner copy is kept on tape");
    expect(again).toContain('class="button">Vault it</button>');
    // and what the act sends is still the place that was chosen
    expect(vaultAsked(ask)).toEqual({ do: "vault", into: "cold-store", why: "the scanner copy is kept on tape" });
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
    const refused = purge({ typed: "incoming", why: "the originals live on tape now" }, { look: { ...look, ready: false, why } });
    expect(refused).toContain(why);
    expect(refused).toContain('disabled="">Purge it</button>');
    // a refusal with no words of the engine's still stops the act, and an unread door says only that
    expect(purge({ typed: "incoming", why: "why" }, { look: { ...look, ready: false } })).toContain("The engine refuses to purge these originals and gives no reason.");
    expect(purge({ typed: "incoming", why: "why" }, { look: null })).toContain("The engine has not said what purging would do here.");
    expect(purge({}, { look: null })).toContain("This engine has not said what is there to purge.");
  });

  it("shows what the engine refused the act itself with", () => {
    expect(purge({ refusal: "the door answered 409: a release of this dataset is still running" })).toContain("a release of this dataset is still running");
  });
});

describe("Change", () => {
  const acts: OriginalsActs = { vault: true, purge: true, refusal: null };
  const change = (over: Partial<Parameters<typeof ChangeDialog>[0]> = {}) =>
    renderToStaticMarkup(<ChangeDialog dataset={incoming} acts={acts} onAct={none} onClose={none} onSaved={none} {...over} />);

  it("declares nothing of where the originals stand, and puts the act that decides it one click away", () => {
    const html = change();
    expect(html).toContain(">The originals</span>");
    expect(html).toContain("kept here");
    expect(html).toContain("They are vaulted into another place or purged");
    expect(html).toContain("never say purged while the files are still on disk");
    expect(html).toContain(">Vault it</button>");
    expect(html).toContain(">Purge it</button>");
    // the three choices are gone: this form cannot set the word the card reads
    expect(html).not.toContain('name="originals"');
    expect(html).not.toContain("Kept: read by the pseudonymiser only");
    expect(html).not.toContain("Purged: the pseudonymised tree is all that is left");
  });

  it("keeps every other field it sends", () => {
    const html = change();
    expect(html).toContain("What arrives</span>");
    expect(html).toContain("An identifier the map does not know</span>");
    expect(html).toContain("Feeds a cohort");
    expect(html).toContain("Keep sex, weight and size: covariates, not identifiers");
    expect(html).toContain("Also remove");
    expect(html).toContain("Also keep");
    expect(html).toContain("Dates, when it leaves</span>");
    expect(html).toContain("UIDs, when it leaves</span>");
    expect(html).toContain("Faces removed before it leaves");
  });

  it("says why the acts are not offered where a person may not ask for them", () => {
    const html = change({ acts: { vault: false, purge: false, refusal: "Vaulting or purging the originals needs work on the Data page." } });
    expect(html).toContain("Vaulting or purging the originals needs work on the Data page.");
    expect(html).not.toContain(">Vault it</button>");
  });
});
