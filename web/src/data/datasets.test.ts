// SPDX-License-Identifier: AGPL-3.0-only
// The Data page's words and bodies (record 26, D1): a dataset's state and its
// lines, the five marks of a batch, the chain that brings new files in, the
// v0 folder, the map's columns and report, and the doors' bodies, against
// fixtures shaped as the record's contract.

import { afterEach, describe, expect, it, vi } from "vitest";
import stagesFixture from "../../test/fixtures/batch_stages.json";
import report from "../../test/fixtures/linkage_import_report.json";
import answer from "../../test/fixtures/sources_record26.json";
import type { Capabilities } from "../capabilities";
import { GRANTS } from "../grants";
import {
  arrivesOf,
  arrivesWords,
  batchLine,
  batchTail,
  bringInBody,
  bringInSteps,
  chainWords,
  cohortChoices,
  cohortOf,
  columnsRefusal,
  datasetState,
  estimateWords,
  guessColumns,
  identityOf,
  identityWords,
  jobs,
  lastLine,
  locationOf,
  look,
  newInOriginals,
  parseCsv,
  places,
  probeWords,
  record26,
  reportLines,
  stripMarks,
  treeLines,
  v0Words,
  type Batch,
  type BatchStages,
  type Dataset,
  type ImportReport,
  type SourcesAnswer,
} from "./datasets";

const sources = (answer as SourcesAnswer).sources;
const [incoming, exchange, exports] = sources;
// the same day as the newest batch in every timezone the tests run in
const now = new Date("2026-09-15T21:30:00Z");

function caps(over: Partial<Capabilities["engine"] & object> = {}): Capabilities {
  return {
    engine: {
      engine: { name: "nils", version: "1.0.0-alpha.29" },
      contracts: { openapi: "5", suite: "2" },
      doors: ["GET /api/sources", "POST /api/jobs", "GET /api/events"],
      policy: [],
      auth: "off",
      principal: "the operator",
      roles: ["reader", "reviewer", "operator", "admin"],
      registry: { epoch: 412 },
      packs: [{ name: "mri", version: "0.1.1" }],
      ...over,
    },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
    desk: { version: "1", mode: "off", contracts: { openapi: "5", suite: "2" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  };
}

/** A dataset as an engine before record 26 lists it: none of the new fields. */
function older(d: Dataset): Dataset {
  const { arrives, trees, identity, unmapped, cohort, tags, held, originals_kept, ...rest } = d;
  void [arrives, trees, identity, unmapped, cohort, tags, held, originals_kept];
  return { ...rest, digests: { ...rest.digests, recent: rest.digests.recent.map((b) => ({ ...b, pseudonymised: undefined, chain: undefined })) } };
}

afterEach(() => vi.unstubAllGlobals());

describe("a dataset's card", () => {
  it("leads with reading, then what is held, what waits, not read, not sorted, then up to date", () => {
    expect(datasetState(incoming)).toEqual({ words: "4 held", tone: "caution" });
    expect(datasetState({ ...incoming, held: { files: 0, identifiers: 0 } })).toEqual({ words: "12 to sort", tone: "caution" });
    expect(datasetState({ ...incoming, digests: { ...incoming.digests, recent: [{ ...incoming.digests.recent[0], state: "running" }] } })).toEqual({ words: "reading now", tone: "brand" });
    expect(datasetState(exchange)).toEqual({ words: "not sorted", tone: "neutral" });
    expect(datasetState({ ...exports, digests: { count: 0, first: null, last: null, recent: [] } })).toEqual({ words: "not read yet", tone: "neutral" });
    expect(datasetState({ ...exports, digests: { ...exports.digests, recent: [{ ...exports.digests.recent[0], classified: 1433 }] } })).toEqual({ words: "up to date", tone: "ok" });
    // an older engine says nothing of held files, and the card reads as before
    expect(datasetState(older(incoming))).toEqual({ words: "12 to sort", tone: "caution" });
  });

  it("says what arrives, from the dataset's own field or the handling an older engine declared", () => {
    expect(arrivesOf(incoming)).toBe("identified");
    expect(arrivesOf(exports)).toBe("coded");
    expect(arrivesOf(older(exchange))).toBe("deidentified");
    expect(arrivesWords("identified")).toEqual({ words: "arrives identified", tone: "gated", icon: "lock" });
    expect(arrivesWords("coded")).toEqual({ words: "our codes in PatientID", tone: "ok", icon: "shield" });
  });

  it("draws the two trees, and none for an engine that names no trees", () => {
    expect(treeLines(incoming)).toEqual([
      { icon: "lock", path: "dcm-original", words: "18,420 · locked" },
      { icon: "shield", path: "dcm-anon", words: "16,208 · the source" },
    ]);
    expect(treeLines(exchange)).toEqual([{ icon: "shield", path: "dcm-anon", words: "6,112 · moved in, files as sent" }]);
    expect(treeLines(exports)[0].words).toBe("1,433 · codes taken verbatim");
    expect(treeLines(older(incoming))).toEqual([]);
    expect(newInOriginals(incoming)).toBe(2212);
    expect(newInOriginals(exchange)).toBeNull();
    // a place the engine has not probed since the update that gave it trees counts nothing yet
    const unprobed = { ...exchange, trees: { originals: null, anon: { path: exchange.trees!.anon.path, files: null, last_written: null } } };
    expect(treeLines(unprobed)).toEqual([{ icon: "shield", path: "dcm-anon", words: "not counted yet · moved in, files as sent" }]);
    expect(newInOriginals({ ...incoming, trees: { ...incoming.trees!, anon: { ...incoming.trees!.anon, files: null } } })).toBeNull();
  });

  it("ends with its newest batch: what was pseudonymised, the new subjects, what is held", () => {
    // the newest batch started today, at a time the browser's own clock draws
    expect(lastLine(incoming, now)).toMatch(/^today \d\d:\d\d: 2,208 files pseudonymised · 38 new subjects · 4 files held until mapped$/u);
    expect(batchLine(incoming.digests.recent[1], now)).toBe("20 Aug: 2,208 files pseudonymised · 41 new subjects");
    expect(batchLine({ ...incoming.digests.recent[1], pseudonymised: { files: 0, changed: 14, held: 0, job: 76 } }, now)).toBe("20 Aug: 14 files changed, pseudonymised again · 41 new subjects");
    // an older engine's batch counts its files as before
    expect(lastLine(older(incoming), now)).toMatch(/^today \d\d:\d\d: 2,208 new · 38 new subjects$/u);
    expect(lastLine({ ...exports, digests: { count: 0, first: null, last: null, recent: [] } }, now)).toBe("not read yet");
  });
});

describe("the five marks of a batch", () => {
  const [newest, earlier] = incoming.digests.recent;
  it("read the batch's stages when the engine gives them", () => {
    const stages = (stagesFixture as { stages: BatchStages }).stages;
    expect(stripMarks(newest, stages).map((m) => [m.name, m.mark, m.words])).toEqual([
      ["pseudonymised", "wait", "4 held"],
      ["walked", "done", "2,208 files"],
      ["digested", "done", "412 stacks"],
      ["classified", "wait", "400 of 412"],
      ["reviewed", "wait", "12 to sort"],
    ]);
    expect(stripMarks(newest, { ...stages, pseudonymised: null, reviewed: { done: 12, of: 12, since: null } }).map((m) => m.mark)).toEqual(["none", "done", "done", "wait", "done"]);
  });
  it("else take the first mark from what the sources door says, before the four a digest always had", () => {
    // 4 held, walked and digested, 0 of 412 classified, nothing waits on review yet
    expect(stripMarks(newest).map((m) => m.mark)).toEqual(["wait", "done", "done", "wait", "none"]);
    expect(stripMarks(earlier).map((m) => [m.name, m.mark])).toEqual([
      ["pseudonymised", "done"],
      ["walked", "done"],
      ["digested", "done"],
      ["classified", "done"],
      ["reviewed", "wait"],
    ]);
    expect(stripMarks(earlier)[0].words).toBe("2,222 files");
  });
  it("leave the first mark absent where the engine says nothing of it", () => {
    const old = older(incoming).digests.recent[1];
    expect(stripMarks(old).map((m) => m.mark)).toEqual(["none", "done", "done", "done", "wait"]);
    expect(stripMarks(exchange.digests.recent[0])[0]).toEqual({ name: "pseudonymised", mark: "none", words: "not said" });
  });
  it("offer the held files, what to sort, a read again, or say it is sorted", () => {
    expect(batchTail(newest)).toEqual({ kind: "held", words: "4 held: map them", count: 4 });
    expect(batchTail(earlier)).toEqual({ kind: "sort", words: "Sort 12", count: 12 });
    expect(batchTail({ ...earlier, to_sort: 0 }).kind).toBe("sorted");
    expect(batchTail({ ...earlier, state: "failed", pseudonymised: null } as Batch).words).toBe("Read again");
    expect(batchTail({ ...earlier, state: "running" }).kind).toBe("reading");
  });
});

describe("bringing in what is new", () => {
  it("is one job with the rest queued after it: pseudonymise, then digest, then fingerprint and classify with the pack", () => {
    expect(bringInBody(incoming, "incoming-2026-09-15", "mri")).toEqual({
      command: ["pseudonymize", "@incoming"],
      name: "incoming-2026-09-15",
      then: [["digest", "@incoming"], ["fingerprint"], ["classify", "--pack", "mri"]],
    });
  });
  it("stops after the first step when asked, starts at the digest for a de-identified or coded dataset, and ends at the fingerprint without a pack", () => {
    expect(bringInBody(incoming, "b", "mri", true)).toEqual({ command: ["pseudonymize", "@incoming"], name: "b", then: [] });
    expect(bringInBody(exchange, "b", "mri")).toEqual({ command: ["digest", "@exchange-ct"], name: "b", then: [["fingerprint"], ["classify", "--pack", "mri"]] });
    expect(bringInBody(exports, "b", null)).toEqual({ command: ["digest", "@exports-2019"], name: "b", then: [["fingerprint"]] });
    expect(bringInSteps(incoming, "mri", "0.1.1").map((s) => s.title)).toEqual(["Pseudonymise", "Digest", "Sort"]);
    expect(bringInSteps(exchange, null).map((s) => s.title)).toEqual(["Digest", "Sort"]);
    expect(bringInSteps(incoming, "mri", "0.1.1")[1].words).toContain("join the cohort incoming");
  });
  it("names the queued rest in a few words", () => {
    expect(chainWords([["digest", "@incoming"], ["fingerprint"], ["classify", "--pack", "mri"]])).toBe("then digest, then sort");
    expect(chainWords([["fingerprint"]])).toBe("then sort");
    expect(chainWords([])).toBe("");
  });
  it("posts the job with `then`, and without it where nothing is queued after", async () => {
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
        return { ok: true, status: 202, text: async () => JSON.stringify({ job: 120, state: "queued" }) } as Response;
      }),
    );
    const body = bringInBody(incoming, "incoming-2026-09-15", "mri");
    await jobs.enqueue(body.command, body.name, body.then);
    expect(calls[0]).toEqual({ path: "/api/jobs", body: { command: ["pseudonymize", "@incoming"], name: "incoming-2026-09-15", then: [["digest", "@incoming"], ["fingerprint"], ["classify", "--pack", "mri"]] } });
    await jobs.enqueue(["digest", "@incoming"], "b", []);
    expect(calls[1].body).toEqual({ command: ["digest", "@incoming"], name: "b" });
  });
  it("estimates the first step from the machine's last measured rate, and says nothing without one", () => {
    expect(estimateWords(2208, 1400, "the digest")).toBe("About 2,208 files at 1,400 a second on this machine: 2 seconds, then the digest.");
    expect(estimateWords(120000, 1400, "the digest")).toBe("About 120,000 files at 1,400 a second on this machine: 1 minute, then the digest.");
    expect(estimateWords(2208, null)).toBeNull();
    expect(estimateWords(null, 1400)).toBeNull();
    expect((answer as SourcesAnswer).rates?.pseudonymize).toBe(1400);
  });
  it("knows an engine at record 26 by its contract or by the trees its sources carry", () => {
    expect(record26(caps())).toBe(true);
    expect(record26(caps({ contracts: { openapi: "4" } }))).toBe(false);
    expect(record26(caps({ contracts: { openapi: "4" } }), incoming)).toBe(true);
    expect(record26(caps({ contracts: { openapi: "4" } }), older(incoming))).toBe(false);
  });
});

describe("a v0 cohort folder", () => {
  it("is named as one, with what its two trees hold and what v0 skipped", () => {
    const words = v0Words({ v0: { original_files: 41806, raw_files: 41790, renamed: false } });
    expect(words?.lead).toBe("This is a NILS v0 cohort folder");
    expect(words?.detail).toBe("derivatives/dcm-original holds 41,806 files as they came from the scanners, and derivatives/dcm-raw holds 41,790 files v0 pseudonymised, with v0's codes in PatientID.");
    expect(words?.skipped).toBe(16);
    expect(v0Words({ v0: null })).toBeNull();
    expect(v0Words(null)).toBeNull();
  });
  it("is looked for by the folder's path before it is declared, or by its location where one holds it", async () => {
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
        return { ok: true, status: 200, text: async () => JSON.stringify({ layout: { v0: { original_files: 3, raw_files: 3, renamed: false } } }) } as Response;
      }),
    );
    const l = await look.layout("/srv/imaging/ms-2019");
    expect(l.layout?.v0?.raw_files).toBe(3);
    expect(calls[0]).toEqual({ path: "/api/ingest/look", body: { path: "/srv/imaging/ms-2019", names: [] } });
    await look.layout("@archive/ms-2019");
    expect(calls[1].body).toEqual({ at: "@archive/ms-2019", names: [] });
  });
  it("is declared with the dataset fields on the place", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(init.body as string) : undefined });
        return { ok: true, status: 201, text: async () => JSON.stringify({ id: 4, name: "ms-2019", layout: { v0: { original_files: 3, raw_files: 3, renamed: true } } }) } as Response;
      }),
    );
    const p = await places.add({ name: "ms-2019", role: "source", path: "/srv/imaging/ms-2019", guarantees: {}, arrives: "identified", identity: { id_type: "personal-number", from: [{ field: "PatientID" }] }, unmapped: "hold", cohort: "ms-2019" });
    expect(p.layout?.v0?.renamed).toBe(true);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({ arrives: "identified", unmapped: "hold", cohort: "ms-2019", identity: { id_type: "personal-number", from: [{ field: "PatientID" }] } });
    await places.set(4, { cohort: null, move_into_anon: true });
    expect(calls[1]).toEqual({ method: "PUT", path: "/api/places/4", body: { cohort: null, move_into_anon: true } });
  });
});

describe("who a file is about", () => {
  it("is a keyword or a folder of the path, with the identifier's type", () => {
    expect(identityOf({ kind: "field", field: "PatientID" }, "personal-number")).toEqual({ id_type: "personal-number", from: [{ field: "PatientID" }] });
    expect(identityOf({ kind: "path", segment: 3 }, "study-id")).toEqual({ id_type: "study-id", from: [{ path: { segment: 3 } }] });
    expect(identityOf({ kind: "field", field: "" }, "x")).toBeNull();
    expect(identityOf({ kind: "field", field: "PatientID" }, "")).toBeNull();
    expect(identityWords(incoming.identity)).toBe("PatientID as personal-number");
    expect(identityWords({ id_type: "study-id", from: [{ path: { segment: 3 } }] })).toBe("folder 3 of the path as study-id");
    expect(identityWords(null)).toBeNull();
  });
  it("is probed by the folder's location under a source, and the shapes read back", () => {
    const placesList = [
      { id: 1, name: "incoming", role: "source" as const, path: "/srv/imaging/incoming", guarantees: {}, probed: null, probed_at: null, retired_at: null },
      { id: 2, name: "old", role: "source" as const, path: "/srv/imaging/old", guarantees: {}, probed: null, probed_at: null, retired_at: "2026-01-01" },
    ];
    expect(locationOf("/srv/imaging/incoming/2026/09", placesList)).toBe("@incoming/2026/09");
    expect(locationOf("/srv/imaging/incoming/", placesList)).toBe("@incoming");
    expect(locationOf("/srv/imaging/old/x", placesList)).toBeNull();
    expect(locationOf("/srv/imaging/incoming-2", placesList)).toBeNull();
    const result = {
      candidates: [{ rule: { id_type: "personal-number", sources: ["PatientID"] }, files: 2000, sources: [{ source: "PatientID", answered: 2000, shapes: { "999999999999": 2000 } }], identity_constant: { constant: false }, subjects: 38 }],
    };
    expect(probeWords(result)).toBe("2,000 files sampled · PatientID: one shape, 999999999999, on 2,000 files · 38 subjects.");
    expect(probeWords({})).toBe("The probe answered nothing it could say in shapes.");
  });
});

describe("the map", () => {
  it("is read in the browser, quotes honoured, and its columns guessed from their headers", () => {
    const { header, rows } = parseCsv('PatientID,subject_code\r\n"19 01",S-0001\n1902,"S-0002"\n\n');
    expect(header).toEqual(["PatientID", "subject_code"]);
    expect(rows).toEqual([
      ["19 01", "S-0001"],
      ["1902", "S-0002"],
    ]);
    expect(guessColumns(header, "personal-number")).toEqual([
      { header: "PatientID", role: "identifier", id_type: "personal-number" },
      { header: "subject_code", role: "code" },
    ]);
    expect(guessColumns(["personnummer", "study id", "note"], null)).toEqual([
      { header: "personnummer", role: "canonical" },
      { header: "study id", role: "identifier" },
      { header: "note", role: "ignore" },
    ]);
  });
  it("refuses columns that name no identifier, no type, or nobody who stands for the person", () => {
    expect(columnsRefusal([{ header: "a", role: "code" }])).toContain("at least one column");
    expect(columnsRefusal([{ header: "a", role: "identifier" }, { header: "b", role: "code" }])).toBe("a: an identifier column names its type");
    expect(columnsRefusal([{ header: "a", role: "identifier", id_type: "x" }])).toContain("stands for the person");
    expect(columnsRefusal([{ header: "a", role: "identifier", id_type: "x" }, { header: "b", role: "code" }])).toBeNull();
    expect(columnsRefusal([{ header: "a", role: "canonical", id_type: "x" }])).toBeNull();
  });
  it("says what an import will do, from the dry run's report", () => {
    expect(reportLines(report as ImportReport).map((l) => l.words)).toEqual([
      "38 subjects named: 30 known, 8 new",
      "42 identifiers filed: 30 known, 12 new; new types: site-id",
      "4 held files are released",
      "1 subject merges into another: S-0412 into S-0007",
    ]);
    const conflicts = reportLines({ ...(report as ImportReport), merges: [], conflicts: [{ row: 12, why: "the identifier is on another subject" }] });
    expect(conflicts[conflicts.length - 1]).toEqual({ tone: "caution", words: "1 conflict, on which nothing is written: row 12, the identifier is on another subject" });
  });
  it("offers the cohort named after the dataset, one that exists, or none", () => {
    expect(cohortChoices("incoming", ["exchange-ct", "incoming"]).map((c) => c.value)).toEqual(["new:incoming", "is:exchange-ct", "none"]);
    expect(cohortChoices("", []).map((c) => c.value)).toEqual(["none"]);
    expect(cohortOf("new:incoming")).toBe("incoming");
    expect(cohortOf("is:exchange-ct")).toBe("exchange-ct");
    expect(cohortOf("none")).toBeNull();
  });
});
