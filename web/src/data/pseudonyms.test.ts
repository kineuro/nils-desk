// SPDX-License-Identifier: AGPL-3.0-only
// Pseudonymisation's pure parts: a CSV read in the browser, each column's
// shape and its guessed meaning, the import's columns and its report in
// words, the acts on the originals, and the words each fact takes. The
// numbers and names here are made up.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import {
  arrivesWords,
  bytesWords,
  confirmsName,
  csvRefusal,
  MAX_MAP_ROWS,
  reportOf,
  guessRole,
  identityWords,
  importColumns,
  leavingWords,
  lookAt,
  mapRefusal,
  movingWords,
  NOTHING_ASKED,
  NOTHING_TYPED,
  originalsActs,
  originalsWords,
  parseCsv,
  purgeAsked,
  purgeReady,
  purgeRefusal,
  purgeRefused,
  reportLines,
  roleNamed,
  shapeOf,
  shapeWords,
  subjectsWords,
  typeName,
  vaultAsked,
  vaultChoices,
  vaultedInto,
  vaultReady,
  vaultRefused,
  type Dataset,
  type IdType,
  type ImportReport,
  type OriginalsLook,
  type PlaceRow,
  type PurgeAsk,
  type VaultAsk,
} from "./pseudonyms";

const types: IdType[] = [
  { name: "personnummer", description: "the national number" },
  { name: "lake-id", description: "the lake study's id" },
];

describe("a CSV read on this machine", () => {
  it("splits on the delimiter the header uses, honours quotes, and drops empty lines", () => {
    const csv = parseCsv('pn,canonical_pn,note\n"199001019999",199001019999,"a, quoted"\n199002029999,199001019999,\n\n');
    expect(csv.delimiter).toBe(",");
    expect(csv.header).toEqual(["pn", "canonical_pn", "note"]);
    expect(csv.rows).toEqual([
      ["199001019999", "199001019999", "a, quoted"],
      ["199002029999", "199001019999", ""],
    ]);
    expect(parseCsv("a;b\r\n1;2\r\n").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
    expect(parseCsv("").rows).toEqual([]);
  });
});

describe("what a column looks like", () => {
  it("is its shape: digits as 9, capitals as A, and how many rows hold it", () => {
    expect(shapeOf("REG1234")).toBe("AAA9999");
    expect(shapeOf("19900101-9999")).toBe("99999999-9999");
    expect(shapeWords("999999999999")).toBe("12 digits");
    expect(shapeWords("AAA999")).toBe("AAA999");
    const look = lookAt("pn", ["199001019999", "199002029999", "199001019999", ""]);
    expect(look.words).toBe("12 digits, 3 rows, rest empty, 2 distinct");
    expect(lookAt("blank", ["", ""]).words).toBe("empty");
    expect(lookAt("mixed", ["REG1234", "199001019999", "REG9999", "AB12"]).words).toBe("3 shapes: AAA9999, 12 digits, 4 rows");
  });
  it("means the person's number, the code, a type of the registry's, or a new type named after the header", () => {
    const look = lookAt("x", ["1"]);
    // the column that stands for the person files under a type like any other, since the engine takes canonical:<type> and refuses it without one
    expect(guessRole("canonical_pn", look, types)).toEqual({ role: "canonical", id_type: "personnummer", new_type: null });
    expect(guessRole("subject_code", look, types)).toEqual({ role: "code", id_type: null, new_type: null });
    expect(guessRole("Personnummer", look, types)).toEqual({ role: "identifier", id_type: "personnummer", new_type: null });
    expect(guessRole("lake id", look, types)).toEqual({ role: "identifier", id_type: "lake-id", new_type: null });
    expect(guessRole("PatientID", look, types)).toEqual({ role: "identifier", id_type: null, new_type: "patientid" });
    expect(guessRole("empty", lookAt("empty", ["", ""]), types)).toEqual({ role: "ignore", id_type: null, new_type: null });
    expect(typeName("KI PRO / site")).toBe("ki-pro-site");
  });
  it("becomes the import's columns, a new type named as its type", () => {
    const guesses = [guessRole("pn", lookAt("pn", ["1"]), types), guessRole("canonical_pn", lookAt("c", ["1"]), types), guessRole("Orchard", lookAt("o", ["1"]), types), guessRole("note", lookAt("n", [""]), types)];
    expect(importColumns(["pn", "canonical_pn", "Orchard", "note"], guesses)).toEqual([
      { header: "pn", role: "identifier", id_type: "personnummer" },
      { header: "canonical_pn", role: "canonical", id_type: "personnummer" },
      { header: "Orchard", role: "identifier", id_type: "orchard" },
      { header: "note", role: "ignore" },
    ]);
    expect(mapRefusal(guesses)).toBeNull();
    expect(mapRefusal([guesses[3]])).toBe("At least one column is an identifier, or the number that stands for the person.");
    expect(mapRefusal([guesses[1], guesses[1]])).toBe("One column stands for the person; two are chosen.");
    // the engine takes a map of the person's numbers alone: each row resolves a subject, derives its code and releases what was held under it
    expect(mapRefusal([guesses[1]])).toBeNull();
    // two code columns, and an identifier column naming no type, are the engine's own refusals
    const code = guessRole("subject_code", lookAt("s", ["1"]), types);
    expect(mapRefusal([guesses[0], code, code])).toBe("One column is the code; two are chosen.");
    expect(mapRefusal([{ role: "identifier", id_type: null, new_type: null }])).toBe("Every identifier column names its type: pick one of the site's, or make a new one.");
    // several identifier columns of one type are several identifiers of one person, and are refused by nothing
    expect(mapRefusal([guesses[0], guesses[0], code])).toBeNull();
  });
});

describe("what the map's file must be, and what its report says in every branch", () => {
  it("takes a file with a header and rows under it, whatever separates its columns", () => {
    expect(csvRefusal(parseCsv("pn,code\n1,S-1\n"))).toBeNull();
    // what a spreadsheet writes in a Swedish locale: the columns are read here and the rows are posted as values, so the file's own
    // separator reaches the engine in nothing, and a file the desk once sent a person away to save again imports as it is
    const semicolons = parseCsv("pn;code\n199001019999;S-1\n199002029999;S-2\n");
    expect(csvRefusal(semicolons)).toBeNull();
    expect(semicolons.header).toEqual(["pn", "code"]);
    expect(semicolons.rows).toEqual([
      ["199001019999", "S-1"],
      ["199002029999", "S-2"],
    ]);
    // and the columns of such a file are read for what they are, exactly as a comma-separated one's are
    expect(guessRole(semicolons.header[0], lookAt(semicolons.header[0], semicolons.rows.map((r) => r[0])), types)).toEqual({ role: "identifier", id_type: "personnummer", new_type: null });
    expect(guessRole(semicolons.header[1], lookAt(semicolons.header[1], semicolons.rows.map((r) => r[1])), types).role).toBe("code");
    expect(csvRefusal(parseCsv("pn\tcode\n1\tS-1\n"))).toBeNull();
    expect(csvRefusal(parseCsv("pn,code\n"))).toBe("The file has a header and no rows under it.");
    expect(csvRefusal({ header: [], rows: [], delimiter: "," })).toBe("The first line names the columns, and this file has no such line.");
    // the door takes a hundred thousand rows in one call and answers the rest with a refusal, so the file is stopped here instead
    const many = { header: ["pn"], rows: Array.from({ length: MAX_MAP_ROWS + 1 }, () => ["199001019999"]), delimiter: "," };
    expect(csvRefusal(many)).toBe("100,001 rows: the engine takes 100,000 in one go. Split the file, or leave it where the engine can read it and file it as a job.");
    expect(csvRefusal({ ...many, rows: many.rows.slice(0, MAX_MAP_ROWS) })).toBeNull();
  });

  it("reads the report with the same keys whatever the engine left out, so a refused run renders no undefined number", () => {
    const empty = reportOf({});
    expect(empty).toEqual({
      subjects: { named: 0, known: 0, new: 0 },
      identifiers: { filed: 0, known: 0, new: 0, types_new: 0 },
      held_released: 0,
      held_released_by: [],
      merges: [],
      conflicts: [],
    });
    expect(reportLines(empty).map((l) => l.words.includes("undefined"))).toEqual([false, false, false, false, false]);
    expect(reportLines(reportOf(null))[0].words).toBe("0 named · 0 known · 0 new, with codes derived from their number");
    // what the engine does say is kept, the rows it read among it
    const said = reportOf({ rows: 12, subjects: { named: 12, known: 10, new: 2 }, identifiers: { filed: 12, known: 10, new: 2, types_new: ["site-id"] }, held_released: { released: 3, of: 4 }, conflicts: [{ row: 4, why: "on another subject" }] });
    expect(said.rows).toBe(12);
    expect(said.identifiers.types_new).toEqual(["site-id"]);
    expect(said.held_released).toEqual({ released: 3, of: 4 });
    expect(said.conflicts).toEqual([{ row: 4, why: "on another subject" }]);
    // and nonsense in place of a list is no list at all, never a crash
    expect(reportOf({ merges: "several", conflicts: 3 })).toMatchObject({ merges: [], conflicts: [] });
  });
});

describe("the import's report", () => {
  const report: ImportReport = { subjects: { named: 212, known: 209, new: 3 }, identifiers: { filed: 1296, known: 1240, new: 56, types_new: 1 }, held_released: { released: 4, of: 4 }, merges: [{ alias: "a", canonical: "b" }, { alias: "c", canonical: "d" }], conflicts: [] };
  it("says what it will do, line by line, and marks conflicts", () => {
    const lines = reportLines(report);
    expect(lines.map((l) => l.label)).toEqual(["subjects", "identifiers", "held files", "merges", "conflicts"]);
    expect(lines[0].words).toBe("212 named · 209 known · 3 new, with codes derived from their number");
    expect(lines[1].words).toBe("1,296 filed · 1,240 already known · 56 new · 1 new type");
    expect(lines[2].words).toBe("4 of 4 released");
    // record 26: which type released them, and the type they were held under where it is another
    const byType = reportLines({ ...report, held_released_by: [{ type: "site-id", held_as: "personnummer", files: 3 }, { type: "personnummer", held_as: "personnummer", files: 1 }] });
    expect(byType[2].words).toBe("4 of 4 released: 3 by site-id, held as personnummer · 1 by personnummer");
    expect(lines[3].words).toBe("2: provisional subjects become their canonical ones · the old codes stay as identifiers");
    expect(lines[4].tone).toBe("ok");
    const refused = reportLines({ ...report, held_released: 0, merges: [], conflicts: [{ row: 12, why: "already on another subject" }] });
    expect(refused[2].words).toBe("none");
    expect(refused[3].words).toBe("none");
    expect(refused[4]).toEqual({ label: "conflicts", words: "1: nothing is written until they are resolved", tone: "caution" });
  });
});

describe("the words of a dataset", () => {
  const base = { id: 1, name: "lake", path: "/scans/lake", guarantees: {}, probed: null, handling: { arrives: "identified" as const, on_release: { uids: "remap" as const, deface: false } }, handling_declared: true, roots: 1, digests: { count: 0, first: null, last: null, recent: [] }, totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 } };
  it("say how it arrives, where the codes come from, the rule and what leaves", () => {
    const d: Dataset = { ...base, arrives: "identified", identity: { id_type: "personnummer", from: [{ field: "PatientID" }] }, unmapped: "hold" };
    expect(arrivesWords(d)).toBe("identified; pseudonymised into dcm-anon before anything reads it");
    expect(subjectsWords(d)).toBe("codes from the map and the key");
    expect(identityWords(d)).toBe("PatientID, through the map");
    expect(identityWords({ ...d, unmapped: "code" })).toBe("PatientID, through the map or hashed");
    expect(identityWords({ ...d, arrives: "coded", identity: { id_type: "subject-code", code: "verbatim", from: [{ path: { segment: 2 } }] } })).toBe("folder 2 of the path, taken verbatim as the code");
    expect(arrivesWords({ ...base })).toBe("identified; pseudonymised into dcm-anon before anything reads it");
    expect(arrivesWords({ ...base, arrives: "deidentified" })).toBe("de-identified; moved into dcm-anon as sent, identifiers mapped when read");
    expect(leavingWords(d.handling.on_release)).toBe("dates kept · UIDs remapped · faces kept");
    expect(leavingWords(undefined)).toBe("as the tree stands");
    // an engine from before may still answer a stored policy: said as it stands
    expect(leavingWords({ dates: "year", uids: "remap", deface: true })).toBe("dates cut to the year · UIDs remapped · faces removed");
    expect(bytesWords(2.4e12)).toBe("2.4 TB");
    expect(bytesWords(5e8)).toBe("500 MB");
  });
});

describe("acting on the originals of a dataset", () => {
  const anon = { path: "/scans/lake/derivatives/dcm-anon", files: 18416, last_written: null };
  const base = {
    id: 4,
    name: "lake",
    path: "/scans/lake",
    guarantees: {},
    probed: null,
    handling: { arrives: "identified" as const, on_release: { dates: "keep" as const, uids: "remap" as const, deface: false } },
    handling_declared: true,
    roots: 1,
    digests: { count: 0, first: null, last: null, recent: [] },
    totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
    trees: { originals: { path: "/scans/lake/derivatives/dcm-original", files: 18420, bytes: 2449860000 }, anon },
  };
  const d: Dataset = { ...base, originals_kept: "kept" };
  const caps = (grants: string[], doors: string[]) => ({ engine: { doors }, person: { grants, detail: "sensitive" }, desk: {} }) as unknown as Capabilities;
  const both = caps(["data:work", "data:see"], ["GET /api/places/{id}/originals", "POST /api/places/{id}/originals"]);
  const look: OriginalsLook = { files: 18420, bytes: 2449860000, verified: 18402, unverified: 18, held: 4, ready: true };

  it("says where they stand, with the place where one is known", () => {
    expect(originalsWords(undefined)).toBe("kept here");
    expect(originalsWords("kept")).toBe("kept here");
    expect(originalsWords("vaulted", "cold-store")).toBe("vaulted into cold-store");
    expect(originalsWords("vaulted")).toBe("vaulted: moved out of the way, not read");
    expect(originalsWords("vaulted", "  ")).toBe("vaulted: moved out of the way, not read");
    expect(originalsWords("purged")).toBe("purged: the pseudonymised tree is all that is left");
    expect(vaultedInto({ ...d, originals_vault: "cold-store" } as Dataset)).toBe("cold-store");
    expect(vaultedInto(d)).toBeNull();
  });

  it("offers the acts only where the engine serves the door, the dataset has originals and the person works on Data", () => {
    expect(originalsActs(both, d)).toEqual({ vault: true, purge: true, refusal: null });
    // vaulted: only the purge is left; purged: the card says so and offers nothing
    expect(originalsActs(both, { ...d, originals_kept: "vaulted" })).toEqual({ vault: false, purge: true, refusal: null });
    expect(originalsActs(both, { ...d, originals_kept: "purged" })).toEqual({ vault: false, purge: false, refusal: null });
    // an engine without the door, and a dataset with no originals, leave the card exactly as it reads today
    expect(originalsActs(caps(["data:work"], []), d)).toEqual({ vault: false, purge: false, refusal: null });
    expect(originalsActs(both, { ...d, trees: { originals: null, anon } })).toEqual({ vault: false, purge: false, refusal: null });
    expect(originalsActs(caps(["data:see"], ["POST /api/places/{id}/originals"]), d)).toEqual({
      vault: false,
      purge: false,
      refusal: "Vaulting or purging the originals needs work on the Data page.",
    });
  });

  it("says what the act would move, in files and in what they weigh", () => {
    expect(movingWords(look)).toBe("18,420 files · 2.4 GB");
    expect(movingWords(null)).toBe("the engine has not said");
  });

  it("refuses a purge in the engine's own words, never in the desk's", () => {
    expect(purgeRefusal(look)).toBeNull();
    expect(purgeRefusal({ ...look, ready: false, why: "3,204 files have no verified copy in dcm-anon" })).toBe("3,204 files have no verified copy in dcm-anon");
    expect(purgeRefusal({ ...look, ready: false, why: "  " })).toBe("The engine refuses to purge these originals and gives no reason.");
    expect(purgeRefusal({ ...look, ready: false })).toBe("The engine refuses to purge these originals and gives no reason.");
    expect(purgeRefusal(null)).toBe("The engine has not said what purging would do here.");
  });

  it("reads the role the engine named in a refusal, and keeps the places to it", () => {
    const roles = ["source", "backup", "export", "share"];
    expect(roleNamed("the originals of a source go to a place with the backup role", roles)).toBe("backup");
    expect(roleNamed("a vault is an export place", roles)).toBe("export");
    // the dataset's own role is passed over, unless it is the only one named
    expect(roleNamed("only a source place holds originals", roles)).toBe("source");
    expect(roleNamed("the engine will not move these", roles)).toBeNull();
    const places: PlaceRow[] = [
      { id: 4, name: "lake", role: "source", path: "/scans/lake", retired_at: null },
      { id: 6, name: "cold-store", role: "backup", path: "/vault/cold", retired_at: null },
      { id: 2, name: "attic", role: "backup", path: "/vault/attic", retired_at: null },
      { id: 7, name: "gone", role: "backup", path: "/vault/gone", retired_at: "2026-01-04T09:00:00Z" },
      { id: 8, name: "exports", role: "export", path: "/exports", retired_at: null },
      { id: 9, name: "hole", role: "backup", path: "/scans/lake/derivatives/dcm-original/hole", retired_at: null },
      { id: 10, name: "anon-hole", role: "backup", path: "/scans/lake/derivatives/dcm-anon/hole", retired_at: null },
      { id: 11, name: "on-itself", role: "backup", path: "/scans/lake/", retired_at: null },
      { id: 12, name: "unsaid", path: "/vault/unsaid", retired_at: null },
    ];
    // the backup role before any refusal: the source, the export place, a retired place, the three declared inside the dataset and the one whose role the door does not say are all left out
    expect(vaultChoices(places, d, null, [d]).map((p) => p.name)).toEqual(["attic", "cold-store"]);
    expect(vaultChoices(places, d, "backup", [d]).map((p) => p.name)).toEqual(["attic", "cold-store"]);
    // the role the engine named in a refusal stands in the backup role's place
    expect(vaultChoices(places, d, "export", [d]).map((p) => p.name)).toEqual(["exports"]);
    expect(vaultChoices(places, d, "share", [d])).toEqual([]);
    // the dataset's own place is out by its id, whatever role it carries
    expect(vaultChoices(places, { ...d, id: 2 }, null, [d]).map((p) => p.name)).toEqual(["cold-store"]);
  });

  it("leaves out a place inside another dataset, since the engine writes outside no dataset's own trees", () => {
    const orchard: Dataset = {
      ...base,
      id: 21,
      name: "orchard",
      path: "/scans/orchard",
      trees: { originals: { path: "/scans/orchard/derivatives/dcm-original", files: 640, bytes: 82000000 }, anon: { path: "/scans/orchard/derivatives/dcm-anon", files: 640, last_written: null } },
      originals_kept: "kept",
    };
    const places: PlaceRow[] = [
      { id: 6, name: "cold-store", role: "backup", path: "/vault/cold", retired_at: null },
      { id: 22, name: "orchard-attic", role: "backup", path: "/scans/orchard/attic", retired_at: null },
      { id: 23, name: "lake-attic", role: "backup", path: "/scans/lake/attic", retired_at: null },
    ];
    // vaulting the lake: a backup place declared inside the orchard is refused as surely as one inside the lake, so neither is offered
    expect(vaultChoices(places, d, null, [d, orchard]).map((p) => p.name)).toEqual(["cold-store"]);
    // and the same the other way round, since no dataset's folders are a place for another's originals
    expect(vaultChoices(places, orchard, null, [d, orchard]).map((p) => p.name)).toEqual(["cold-store"]);
  });


  it("keeps what a dialog was told outside the dialog, so drawing it again loses no answer", () => {
    expect(vaultReady(NOTHING_ASKED)).toBe(false);
    const chose: VaultAsk = { ...NOTHING_ASKED, into: " cold-store ", why: " on tape " };
    expect(vaultReady(chose)).toBe(true);
    expect(vaultReady({ ...chose, sending: true })).toBe(false);
    expect(vaultAsked(chose)).toEqual({ do: "vault", into: "cold-store", why: "on tape" });
    expect(purgeReady(NOTHING_TYPED, "lake", look)).toBe(false);
    const typed: PurgeAsk = { ...NOTHING_TYPED, typed: "lake", why: "on tape" };
    expect(purgeReady(typed, "lake", look)).toBe(true);
    expect(purgeReady(typed, "lake", { ...look, ready: false, why: "18 files have no verified copy" })).toBe(false);
    expect(purgeReady({ ...typed, sending: true }, "lake", look)).toBe(false);
    expect(purgeAsked(typed)).toEqual({ do: "purge", why: "on tape" });
  });

  it("keeps the engine's refusal, and asks for the place again only where it named another role", () => {
    const roles = ["source", "backup", "export"];
    const chose: VaultAsk = { ...NOTHING_ASKED, into: "exports", why: "on tape", sending: true };
    expect(vaultRefused(chose, "the originals of a source go to a place with the backup role", roles)).toEqual({
      into: "",
      why: "on tape",
      sending: false,
      refusal: "the originals of a source go to a place with the backup role",
      role: "backup",
    });
    // a refusal that names no role leaves the choice as it was: the person reads it and decides
    const mute = vaultRefused(chose, "a release of this dataset is still running", roles);
    expect(mute.into).toBe("exports");
    expect(mute.role).toBeNull();
    expect(mute.sending).toBe(false);
    expect(purgeRefused({ ...NOTHING_TYPED, typed: "lake", sending: true }, "409: a release is still running")).toEqual({ typed: "lake", why: "", sending: false, refusal: "409: a release is still running" });
  });

  it("takes the dataset's own name as the purge's confirmation", () => {
    expect(confirmsName("lake", "lake")).toBe(true);
    expect(confirmsName(" lake ", "lake")).toBe(true);
    expect(confirmsName("Lake", "lake")).toBe(false);
    expect(confirmsName("", "lake")).toBe(false);
    expect(confirmsName("", "")).toBe(false);
  });
});
