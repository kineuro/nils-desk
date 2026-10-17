// SPDX-License-Identifier: AGPL-3.0-only
// The pseudonymise step's pure parts (Wave 7a, the design of 2026-10-09):
// the held IDs and a rehearsal's codes as the engine answers them, where the
// step is and its one next action in words that say exactly what it will do,
// the rail's words while it waits on a person, a map of ID and subject code
// read into its two columns, with its header or without one, the four rules
// and what Save sends, and what every file got. Every ID, code and name here
// is made up, and no value of an ID ever passes through: rows carry shapes.

import { describe, expect, it } from "vitest";
import servedPolicy from "../../test/fixtures/pseudonymize_tags.json";
import type { TagPolicy } from "./policy";
import { parseCsv, type Dataset } from "./pseudonyms";
import {
  chipOf,
  codeColumnsOf,
  codePairs,
  codesBody,
  codesWords,
  countingWords,
  countsOf,
  everyFile,
  goWords,
  heldIdsOf,
  idsBox,
  idTypeOf,
  isStandard,
  matchedOf,
  outcomeWords,
  primaryOf,
  railWords,
  readsPersonnummer,
  revealedOf,
  rulesLine,
  holdsOf,
  holdsPatch,
  rulesOf,
  rulesPatch,
  STANDARD,
  stepView,
  waitingLine,
  waitWords,
  type HeldIds,
} from "./pseudoStep";
import type { SummaryStep } from "./summary";

const policy = servedPolicy as unknown as TagPolicy;

/** An identified dataset of 7,544 files whose study IDs need codes. */
const base = {
  id: 9,
  name: "study-identified",
  path: "/data/study-identified",
  guarantees: {},
  probed: null,
  handling: { arrives: "identified" as const, on_release: { uids: "remap" as const, deface: false } },
  handling_declared: false,
  roots: 1,
  arrives: "identified" as const,
  state: "identified" as const,
  patient_id: "subject-code",
  identity: { id_type: "study-id", from: [{ field: "PatientID" }] },
  unmapped: "hold" as const,
  tags: null,
  held: { files: 7544, identifiers: 8 },
  trees: { originals: { path: "/data/study-identified/derivatives/dcm-original", files: 7544, bytes: 1_900_000_000 }, anon: { path: "/data/study-identified/derivatives/dcm-anon", files: 0, last_written: null } },
  digests: { count: 0, first: null, last: null, recent: [] },
  totals: { subjects: 0, studies: 0, sessions: 0, stacks: 0, refused_files: 0, to_sort: 0 },
};
const d = base as unknown as Dataset;

const step = (over: Partial<SummaryStep> = {}): SummaryStep => ({ step: "pseudonymised", state: "waiting", job: null, started_at: null, finished_at: null, progress: null, files: 0, waiting: 7544, held: 7544, ...over });

/** The engine's eight held IDs, by shape, most files first; none has a code. */
const FILES = [3115, 2834, 652, 480, 183, 158, 80, 42];
const raw = {
  place: "study-identified",
  files: 7544,
  identifiers: 8,
  ids: FILES.map((files, i) => ({ id: 100 + i, shape: i === 0 ? "AAA999999" : "aAAA9999", id_type: "study-id", files, first_seen: "2026-10-09T19:12:00Z", batch: 3, state: "held", code: null, also_in: [], waits_for: null })),
  subjects: { coded: 0, generated: 0 },
};
const heldIds = heldIdsOf(raw);
/** A map that gives six of the eight a code, two of them subjects study-big holds already. */
const matched = matchedOf({ held_ids: [100, 101, 102, 103, 104, 106].map((id, i) => ({ id, code: `code${i}aaaaaaaa`, also_in: i === 0 || i === 3 ? ["study-big"] : [] })) });

describe("the held IDs, as the engine answers them", () => {
  it("are rows of shapes and counts, whatever an engine left out", () => {
    expect(heldIds.ids).toHaveLength(8);
    expect(heldIds.ids[0]).toEqual({ id: 100, shape: "AAA999999", id_type: "study-id", files: 3115, first_seen: "2026-10-09T19:12:00Z", state: "held", code: null, also_in: [], waits_for: null });
    expect(heldIdsOf(null)).toEqual({ files: 0, identifiers: 0, ids: [], subjects: { coded: 0, generated: 0 } });
    expect(heldIdsOf({ ids: [{ id: 1, state: "strange" }, { shape: "no id" }] }).ids).toEqual([{ id: 1, shape: null, id_type: null, files: 0, first_seen: null, state: "held", code: null, also_in: [], waits_for: null }]);
  });

  it("fill with the codes a rehearsal gives them, and the values a reveal shows, each by its row", () => {
    expect(matched).toHaveLength(6);
    expect(matched[0]).toEqual({ id: 100, code: "code0aaaaaaaa", also_in: ["study-big"] });
    expect(matchedOf({})).toEqual([]);
    expect(matchedOf({ held_ids: [{ id: 1 }, { code: "x" }] })).toEqual([]);
    const shown = revealedOf([{ shape: "AAA999999", identifiers: [{ id: 100, value: "ABC123456", files: 3115 }] }, { identifiers: [{ value: "no row" }] }]);
    expect([...shown.entries()]).toEqual([[100, "ABC123456"]]);
    expect(revealedOf({ error: "no" }).size).toBe(0);
  });
});

describe("where the step is", () => {
  it("is never run, then IDs without a subject code, then ready, running and done", () => {
    const fresh = stepView({ ...d, held: { files: 0, identifiers: 0 } } as Dataset, step({ held: 0 }), { files: 0, identifiers: 0, ids: [], subjects: { coded: 0, generated: 0 } }, [], false);
    expect(fresh.phase).toBe("fresh");
    expect(fresh.go).toBe(7544);
    const codes = stepView(d, step(), heldIds, [], false);
    expect(codes.phase).toBe("codes");
    expect(codes.without).toEqual({ ids: 8, files: 7544 });
    expect(codes.go).toBe(0);
    const some = stepView(d, step(), heldIds, matched, false);
    expect(some.phase).toBe("codes");
    expect(some.coded).toBe(6);
    expect(some.without).toEqual({ ids: 2, files: 200 });
    expect(some.go).toBe(7344);
    // the rows read their map's code where they have none of their own, most files first
    expect(some.rows.map((r) => r.files)).toEqual(FILES);
    expect(some.rows.filter((r) => r.from_map).map((r) => r.code)).toHaveLength(6);
    const all: HeldIds = { ...heldIds, ids: heldIds.ids.map((h, i) => ({ ...h, state: i % 2 === 0 ? "mapped" : "generated", code: i % 2 === 0 ? `c${i}` : null })) };
    expect(stepView(d, step(), all, [], false).phase).toBe("ready");
    expect(stepView(d, step(), all, [], true).phase).toBe("running");
    const copied = { ...d, held: { files: 0, identifiers: 0 }, trees: { ...base.trees, anon: { ...base.trees.anon, files: 7544 } } } as Dataset;
    expect(stepView(copied, step({ state: "done", files: 7544, waiting: 0, held: 0 }), { ...heldIds, files: 0, ids: [] }, [], false).phase).toBe("done");
    // new files arriving in a done dataset make it ready again
    expect(stepView(copied, step({ state: "done", files: 7000, waiting: 544, held: 0 }), { ...heldIds, files: 0, ids: [] }, [], false)).toMatchObject({ phase: "ready", go: 544 });
  });

  it("holds IDs without a subject code where the engine counts them and does not list them", () => {
    const v = stepView(d, step(), null, [], false);
    expect(v.phase).toBe("codes");
    expect(v.without).toEqual({ ids: 8, files: 7544 });
  });

  it("offers one next action, in words that say exactly what it will do", () => {
    const fresh = stepView({ ...d, held: { files: 0, identifiers: 0 } } as Dataset, step({ held: 0 }), { ...heldIds, files: 0, ids: [] }, [], false);
    expect(primaryOf(fresh, false, false)).toEqual({ label: "Find the IDs", act: "find" });
    expect(primaryOf(fresh, true, false)).toEqual({ label: "Pseudonymise and sort 7,544 files", act: "run" });
    const pn = stepView({ ...d, held: { files: 0, identifiers: 0 }, identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } } as Dataset, step({ held: 0 }), null, [], false);
    expect(pn.personnummer).toBe(true);
    expect(primaryOf(pn, false, false)?.label).toBe("Pseudonymise and sort 7,544 files");
    const codes = stepView(d, step(), heldIds, [], false);
    expect(primaryOf(codes, false, false)).toEqual({ label: "Give the 8 IDs a subject code", act: "codes" });
    // opened, nothing can go yet: no primary until a code is given
    expect(primaryOf(codes, false, true)).toBeNull();
    const some = stepView(d, step(), heldIds, matched, false);
    expect(primaryOf(some, false, true)).toEqual({ label: "Pseudonymise and sort 7,344 files", act: "run" });
    expect(primaryOf(stepView(d, step(), heldIds, [], true), false, false)).toBeNull();
  });

  it("says what waits on a person on its chip, its middle box, the rail and its foot", () => {
    const codes = stepView(d, step(), heldIds, [], false);
    expect(chipOf(codes, false)).toEqual({ words: "8 IDs need a subject code", tone: "caution" });
    expect(idsBox(codes)).toEqual({ big: "8", words: "IDs · none has a subject code yet", caution: true });
    expect(railWords(codes)).toEqual({ what: "8 IDs need a subject code", when: "next step", next: true });
    expect(waitWords(codes)).toBe("7,544 files of 8 IDs wait for a subject code");
    const some = stepView(d, step(), heldIds, matched, false);
    expect(chipOf(some, true)).toEqual({ words: "2 IDs without a subject code", tone: "caution" });
    expect(idsBox(some)).toEqual({ big: "6 of 8", words: "have a subject code", caution: false });
    expect(railWords(some)?.what).toBe("6 of 8 IDs have a subject code");
    expect(waitWords(some)).toBe("200 files of 2 IDs wait for a subject code");
    // the waiting step's one line: the next step, and why (2026-10-10)
    expect(waitingLine(codes)).toBe("Next: 8 IDs have no subject code yet, so their 7,544 files wait. Generate the subject codes from the IDs, or give them from a map.");
    expect(waitingLine({ ...codes, without: { ids: 1, files: 1 } })).toBe("Next: One ID has no subject code yet, so its file waits. Generate the subject codes from the IDs, or give them from a map.");
    expect(waitingLine({ ...codes, phase: "ready" })).toBeNull();
    const fresh = stepView({ ...d, held: { files: 0, identifiers: 0 } } as Dataset, step({ held: 0 }), { ...heldIds, files: 0, ids: [] }, [], false);
    expect(railWords(fresh)).toEqual({ what: "not yet", when: "next step", next: true });
    expect(idsBox(fresh).words).toBe("found at the first run");
    expect(railWords(stepView(d, step(), heldIds, [], true))).toBeNull();
    expect(readsPersonnummer(d)).toBe(false);
  });
});

describe("a map of ID and subject code, read here", () => {
  const shapes = ["AAA999999", "aAAA9999"];
  it("finds the code by its header and the ID by the shapes its values have", () => {
    const csv = parseCsv("study,subject_code,note\nABC123456,code0aaaaaaaa,x\naBCD1234,code1aaaaaaaa,\n");
    expect(codeColumnsOf(csv, shapes)).toEqual({ id: 0, code: 1, headerless: false });
    expect(codePairs(csv, { id: 0, code: 1, headerless: false })).toEqual([
      ["ABC123456", "code0aaaaaaaa"],
      ["aBCD1234", "code1aaaaaaaa"],
    ]);
    // the ID by its header where no value has a held shape, the other of two by elimination
    expect(codeColumnsOf(parseCsv("code;PatientID\nc1;X-1\n"), shapes)).toEqual({ id: 1, code: 0, headerless: false });
    expect(codeColumnsOf(parseCsv("first,second\nABC123456,c1\n"), shapes)).toEqual({ id: 0, code: 1, headerless: false });
  });

  it("reads a map with no header from its first row: two columns pasted, the ID first", () => {
    // a spreadsheet's two columns copied without their header: tab between them
    const pasted = parseCsv("ABC123456\t5a9f30c6e8b21d41\naBCD1234\t5a9f30c6e8b21d42\naBCE1234\t5a9f30c6e8b21d43\n");
    const cols = codeColumnsOf(pasted, shapes);
    expect(cols).toEqual({ id: 0, code: 1, headerless: true });
    expect(codePairs(pasted, { id: 0, code: 1, headerless: true })).toEqual([
      ["ABC123456", "5a9f30c6e8b21d41"],
      ["aBCD1234", "5a9f30c6e8b21d42"],
      ["aBCE1234", "5a9f30c6e8b21d43"],
    ]);
  });

  it("reads a file with no header and the ID second, its first row kept", () => {
    const file = parseCsv("5a9f30c6e8b21d41,ABC123456\n5a9f30c6e8b21d42,aBCD1234\n");
    expect(codeColumnsOf(file, shapes)).toEqual({ id: 1, code: 0, headerless: true });
    expect(codePairs(file, { id: 1, code: 0, headerless: true })).toEqual([
      ["ABC123456", "5a9f30c6e8b21d41"],
      ["aBCD1234", "5a9f30c6e8b21d42"],
    ]);
  });

  it("reads a first row that is an ID and a code like the rows under it as a row, though its ID is not held here", () => {
    const file = parseCsv("QX-40017,5a9f30c6e8b21d40\nABC123456,5a9f30c6e8b21d41\nQX-40018,5a9f30c6e8b21d42\n");
    expect(codeColumnsOf(file, shapes)).toEqual({ id: 0, code: 1, headerless: true });
    expect(codePairs(file, { id: 0, code: 1, headerless: true })).toHaveLength(3);
  });

  it("reads a map of one row and no header", () => {
    for (const text of ["ABC123456,5a9f30c6e8b21d41", "ABC123456,5a9f30c6e8b21d41\n", "5a9f30c6e8b21d41;aBCD1234\r\n"]) {
      const one = parseCsv(text);
      const cols = codeColumnsOf(one, shapes);
      expect(cols).toMatchObject({ headerless: true });
      expect(codePairs(one, cols as { id: number; code: number; headerless: boolean })).toHaveLength(1);
    }
    expect(codePairs(parseCsv("ABC123456,5a9f30c6e8b21d41"), { id: 0, code: 1, headerless: true })).toEqual([["ABC123456", "5a9f30c6e8b21d41"]]);
  });

  it("keeps a real header a header, its names never read as a row", () => {
    const rows = "\nABC123456,5a9f30c6e8b21d41\naBCD1234,5a9f30c6e8b21d42\n";
    for (const header of ["study ID,subject code", "ID,Code", "PatientID;Pseudonym", "Löpnummer,Kod", "first,second", "Column1,Column2", "0,1"]) {
      const csv = parseCsv(`${header}${header.includes(";") ? rows.replaceAll(",", ";") : rows}`);
      const cols = codeColumnsOf(csv, shapes);
      expect(cols, header).toEqual({ id: 0, code: 1, headerless: false });
      expect(codePairs(csv, cols as { id: number; code: number; headerless: boolean }), header).toEqual([
        ["ABC123456", "5a9f30c6e8b21d41"],
        ["aBCD1234", "5a9f30c6e8b21d42"],
      ]);
    }
    // a header and no row under it gives nothing
    expect(codePairs(parseCsv("study ID,subject code\n"), { id: 0, code: 1, headerless: false })).toEqual([]);
  });

  it("refuses in words a file that is not two columns of ID and code, before a row is posted", () => {
    expect(codeColumnsOf(parseCsv("a,b,c\n1,2,3\n"), shapes)).toEqual({ refusal: "A map here is two columns: the ID and its subject code." });
    // a row with no code gives nothing
    expect(codePairs(parseCsv("id,code\nABC123456,\n,c2\n"), { id: 0, code: 1, headerless: false })).toEqual([]);
  });

  it("is rehearsed and filed as two columns, the ID under the type the dataset reads it as", () => {
    expect(idTypeOf(d, [])).toBe("study-id");
    expect(idTypeOf(d, [{ id_type: "site-id" }])).toBe("site-id");
    expect(idTypeOf({ identity: null }, [])).toBe("patient-id");
    expect(codesBody("study-identified", "study-id", [["ABC123456", "c1"]], true)).toEqual({
      place: "study-identified",
      columns: [
        { header: "id", role: "identifier", id_type: "study-id" },
        { header: "code", role: "code" },
      ],
      rows: [["ABC123456", "c1"]],
      dry_run: true,
      make_types: true,
    });
  });
});

describe("the rules", () => {
  it("read where the dataset stands, and the standard ones say so in one line", () => {
    expect(rulesOf(d)).toEqual(STANDARD);
    expect(isStandard(rulesOf(d))).toBe(true);
    expect(rulesLine(d)).toBe("Standard rules");
    const own = { ...d, patient_id: "id-type:study-id", unmapped: "code", tags: { keep_demographics: true, remove: ["0008,1030"], keep: [] }, originals_kept: "vaulted" } as Dataset;
    expect(rulesOf(own)).toEqual({ pid: "type", pidType: "study-id", unknown: "generate", tags: "choose", originals: "vault" });
    expect(rulesLine(own)).toBe("PatientID gets the study-id · generated subject codes · own tags · originals vaulted");
  });

  it("send only what changed, never where the originals stand, and standard tags clear the dataset's own", () => {
    expect(rulesPatch(d, STANDARD)).toEqual({});
    expect(rulesPatch(d, { ...STANDARD, unknown: "generate" })).toEqual({ unmapped: "code" });
    expect(rulesPatch(d, { ...STANDARD, pid: "type", pidType: "study-id" })).toEqual({ patient_id: "id-type:study-id" });
    // an ID type with no name is no change
    expect(rulesPatch(d, { ...STANDARD, pid: "type", pidType: " " })).toEqual({});
    expect(rulesPatch(d, { ...STANDARD, originals: "purge" })).toEqual({});
    const own = { ...d, tags: { keep_demographics: false, remove: [], keep: [] } } as Dataset;
    expect(rulesPatch(own, STANDARD)).toEqual({ tags: { keep_demographics: true, remove: [], keep: [] } });
  });
});

describe("what every file got", () => {
  it("says PatientID, what was removed with a few by name, what was kept and the mark, from the engine's policy", () => {
    const lines = everyFile({ ...policy, examination: [{ tag: "0008,0050" }, { tag: "0020,0010" }], marks: { tags: [] } } as TagPolicy, d);
    expect(lines).toEqual([
      { label: "PatientID", value: "the subject code" },
      { label: "Removed", value: "names, birth date, address, accession number, study ID and 93 more", all: "See all 100" },
      { label: "Kept", value: "dates, UIDs, sex, weight, size, age" },
      { label: "Marked", value: "de-identified, and how, in the file’s own header" },
    ]);
    // without the policy, only what is always so
    expect(everyFile(null, { ...d, patient_id: "id-type:study-id", tags: { keep_demographics: false, remove: [], keep: ["0010,2160"] } })).toEqual([
      { label: "PatientID", value: "the subject's study-id" },
      { label: "Kept", value: "dates, UIDs, age, 1 of its own" },
    ]);
  });

  it("says where the codes came from", () => {
    expect(codesWords({ coded: 8, generated: 2 }, false)).toBe("6 from a map · 2 generated");
    expect(codesWords({ coded: 8, generated: 0 }, false)).toBe("8 from a map");
    expect(codesWords({ coded: 8, generated: 0 }, true)).toBe("coded by the key");
    expect(codesWords({ coded: 0, generated: 0 }, false)).toBe("none yet");
    // the held IDs not read yet: nothing is said of the codes, never "none yet" (2026-10-17)
    expect(codesWords(null, false)).toBe("subjects");
  });
});

describe("what the last run did", () => {
  it("says in one line what was written, the codes made, what the read found in the registry already and what is not an image", () => {
    // a run of 2026-10-10 on a test install, whose scans another dataset held already
    const pseudonymise = { result: { files: { seen: 7544, written: 7544, unchanged: 0, held: 0 }, subjects: { new: 8 } } };
    const read = { result: null, progress: { ingested: 0, duplicate: 7328, changed: 0, held: 0, gone: 0 } };
    expect(outcomeWords(pseudonymise, read, 216, 216)).toBe("7,544 files pseudonymised · 8 new subject codes · 7,328 files already in the registry · 216 files set aside: not scans");
    // record 56: what was set aside is not scans; the rest the read refused
    expect(outcomeWords(null, read, 217, 216)).toBe("7,328 files already in the registry · 216 files set aside: not scans · 1 file refused");
  });

  it("says a run that found everything done already, and a read that left the sort out", () => {
    const pseudonymise = { result: { files: { seen: 7544, written: 0, unchanged: 7544, held: 0 }, subjects: { new: 0 } } };
    const read = { result: { chain_ended: { why: "nothing new", skipped: [["fingerprint"]] } }, progress: { ingested: 0, duplicate: 0, changed: 0, held: 0 } };
    expect(outcomeWords(pseudonymise, read, 0)).toBe("7,544 files pseudonymised already · nothing new to sort");
  });

  it("tells copies of another dataset's scans from this dataset's own, and says what a scan filed elsewhere holds (the duplicate policy)", () => {
    const read = { result: null, progress: { ingested: 12, duplicate: 9, known: 7, twice: 2, same_instance: 3, changed: 0, held: 0 } };
    expect(outcomeWords(null, read, 4)).toBe(
      "12 new files · 7 files already in another dataset · 2 files twice in this dataset · 3 files held: their scan is filed under another subject or visit · 4 files refused",
    );
    // a read that found none of them says none of them
    expect(outcomeWords(null, { result: null, progress: { ingested: 5, duplicate: 0, known: 0, twice: 0, same_instance: 0 } }, 0)).toBe("5 new files");
  });

  it("says what was read and what was held, and nothing where no job is known", () => {
    const pseudonymise = { result: { files: { written: 6, unchanged: 0, held: 2 }, subjects: { new: 1 } } };
    expect(outcomeWords(pseudonymise, { result: null, progress: { ingested: 6, duplicate: 0, held: 1 } }, 0)).toBe("6 files pseudonymised · 2 files held for a subject code · 1 new subject code · 6 new files · 1 file held at the read");
    expect(outcomeWords(null, null, 5)).toBeNull();
    expect(outcomeWords({ result: null }, { result: null, progress: null }, 0)).toBeNull();
  });
});

describe("what the originals' PatientID holds (2026-10-10)", () => {
  const rule = (id_type: string) => ({ identity: { id_type, from: [{ field: "PatientID" }], fallback: "StudyInstanceUID" } });

  it("reads the kind from the dataset's rule, and none where no rule names one", () => {
    expect(holdsOf(rule("personnummer"))).toEqual({ holds: "same", type: "" });
    expect(holdsOf(rule("patient-id"))).toEqual({ holds: "type", type: "patient-id" });
    expect(holdsOf({ identity: null })).toBeNull();
    expect(holdsOf({})).toBeNull();
  });

  it("sends the rule with the new type and where it reads the ID kept, and nothing when nothing changed", () => {
    expect(holdsPatch(rule("personnummer"), { holds: "type", type: "patient-id" })).toEqual({ identity: { id_type: "patient-id", from: [{ field: "PatientID" }], fallback: "StudyInstanceUID" } });
    expect(holdsPatch(rule("patient-id"), { holds: "same", type: "" })).toEqual({ identity: { id_type: "personnummer", from: [{ field: "PatientID" }], fallback: "StudyInstanceUID" } });
    expect(holdsPatch(rule("patient-id"), { holds: "type", type: "patient-id" })).toEqual({});
    expect(holdsPatch(rule("patient-id"), { holds: "type", type: " " })).toEqual({});
    expect(holdsPatch({}, { holds: "same", type: "" })).toEqual({});
    // a subject code taken as written is no part of a rule for an identifying ID
    expect(holdsPatch({ identity: { id_type: "study-id", code: "verbatim", from: [{ field: "PatientID" }] } }, { holds: "same", type: "" })).toEqual({ identity: { id_type: "personnummer", from: [{ field: "PatientID" }] } });
  });
});

describe("a count that stopped short of a large tree (2026-10-16)", () => {
  const none: HeldIds = { files: 0, identifiers: 0, ids: [], subjects: { coded: 0, generated: 0 } };
  const pn = { identity: { id_type: "personnummer", from: [{ field: "PatientID" }] }, held: { files: 0, identifiers: 0 } };
  const at = (originals: Partial<typeof base.trees.originals> & { partial?: boolean }, anon: Partial<typeof base.trees.anon> & { partial?: boolean } = {}) =>
    ({ ...d, ...pn, trees: { originals: { ...base.trees.originals, ...originals }, anon: { ...base.trees.anon, ...anon } } }) as unknown as Dataset;

  it("says at least where the originals' count stopped short, on the button and the rail", () => {
    const v = stepView(at({ partial: true }), step({ held: 0 }), none, [], false);
    expect(v).toMatchObject({ phase: "fresh", originals: 7544, originalsPartial: true, go: 7544, goPartial: true });
    expect(goWords(v)).toBe("at least 7,544 files");
    expect(primaryOf(v, false, false)?.label).toBe("Pseudonymise and sort at least 7,544 files");
  });

  it("says the count as it is where it is whole", () => {
    const v = stepView(at({ partial: false }), step({ held: 0 }), none, [], false);
    expect(v).toMatchObject({ originalsPartial: false, goPartial: false });
    expect(primaryOf(v, false, false)?.label).toBe("Pseudonymise and sort 7,544 files");
    // an engine that says nothing of where its count stopped is read as whole
    expect(stepView(d, step(), heldIds, matched, false).goPartial).toBe(false);
  });

  it("counts the new files at least where only the originals' count stopped short, and none it cannot know where the copy's did", () => {
    const copied = (partial: boolean) => step({ state: "done", files: 7000, waiting: 544, held: 0, partial, waiting_partial: true });
    const some = stepView(at({ partial: true }, { files: 7000 }), copied(false), none, [], false);
    expect(some).toMatchObject({ phase: "ready", go: 544, goPartial: true });
    expect(railWords(some)?.what).toBe("at least 544 files to go");
    expect(primaryOf(some, false, false)?.label).toBe("Pseudonymise and sort at least 544 files");
    // the copy's count stopped short too: how many it lacks is not known, so the run is offered on what is known, at least
    const unknown = stepView(at({ partial: true }, { files: 7000, partial: true }), copied(true), none, [], false);
    expect(unknown.go).toBe(0);
    expect(unknown.goPartial).toBe(true);
  });
});

describe("a run that ran is never read as never run (2026-10-17)", () => {
  // a dataset whose originals are read as an ID that is the same everywhere, so no ID waits for a code
  const none: HeldIds = { files: 0, identifiers: 0, ids: [], subjects: { coded: 4399, generated: 0 } };
  const pn = { identity: { id_type: "personnummer", from: [{ field: "PatientID" }] }, held: { files: 0, identifiers: 0 } };
  const at = (originals: Partial<typeof base.trees.originals> & { partial?: boolean }, anon: Partial<typeof base.trees.anon> & { partial?: boolean } = {}) =>
    ({ ...d, ...pn, trees: { originals: { ...base.trees.originals, ...originals }, anon: { ...base.trees.anon, ...anon } } }) as unknown as Dataset;
  // the probe of each tree is bounded (2 s or 200,000 entries): on a large dataset it stops short of both
  const probed = at({ files: 78570, bytes: 12_299_736_493, partial: true }, { files: 0, partial: true });
  // the run walked every original: the summary's found step counts them whole
  const found: SummaryStep = { step: "found", state: "done", job: null, started_at: null, finished_at: null, progress: null, files: 30_689_981, bytes: null, partial: false, counted_by: "pseudonymise", tree: "originals" };
  const ran = { job: 69, started_at: "2026-10-16T18:44:00Z", finished_at: "2026-10-17T01:51:34Z" };

  it("is done once the newest whole run wrote every copy it could: no button, the rail its own, the originals counted by the run", () => {
    // engine 1.0.0-alpha.89: 30,689,981 seen, 30,654,432 written, 35,549 refused (not DICOM), none held
    const s = step({ ...ran, state: "done", files: 30_654_432, waiting: 0, held: 0, partial: false, waiting_partial: false });
    const v = stepView(probed, s, none, [], false, found);
    expect(v).toMatchObject({ phase: "done", originals: 30_689_981, originalsPartial: false, bytes: null, copy: 30_654_432, copyPartial: false, go: 0 });
    expect(primaryOf(v, false, false)).toBeNull();
    expect(railWords(v)).toBeNull();
    // where the found step says the bytes of every file, they are the run's, never the part the probe measured
    expect(stepView(probed, s, none, [], false, { ...found, bytes: 4_915_477_070_489 }).bytes).toBe(4_915_477_070_489);
  });

  it("is never a dataset never run against an engine whose counts are the probe's, and offers the rest, never the probe's count as if nothing had run", () => {
    // engine 1.0.0-alpha.88: the step counts the trees as the probe left them, but names the run
    const old = step({ ...ran, state: "waiting", files: 0, waiting: 78570, held: 0, partial: true, waiting_partial: true });
    const v = stepView(probed, old, none, [], false, found);
    expect(v.phase).not.toBe("fresh");
    expect(v).toMatchObject({ phase: "ready", originals: 30_689_981, originalsPartial: false, copy: 0, copyPartial: true, go: 0, goPartial: true });
    expect(primaryOf(v, false, false)).toEqual({ label: "Pseudonymise and sort the rest", act: "run" });
    expect(railWords(v)).toEqual({ what: "the rest to go", when: "next step", next: true });
    expect(idsBox(v).words).not.toBe("found at the first run");
    // with no whole count of the originals from the summary, the box keeps the probe's lower bound and none of its bytes
    const bare = stepView(probed, old, none, [], false);
    expect(bare).toMatchObject({ phase: "ready", originals: 78570, originalsPartial: true, bytes: null });
    expect(primaryOf(bare, false, false)?.label).toBe("Pseudonymise and sort the rest");
    for (const w of [primaryOf(v, false, false)?.label, primaryOf(bare, false, false)?.label, railWords(bare)?.what]) expect(w).not.toContain("78,570");
  });

  it("offers nothing for refused files where the counts are whole: no run ever writes them", () => {
    // 7,544 originals, 7,444 written, 100 not DICOM; the originals less the copy would offer those 100 again
    const s = step({ ...ran, state: "waiting", files: 7444, waiting: 0, held: 0, partial: false, waiting_partial: false });
    const v = stepView(at({ partial: false }, { files: 7444 }), s, none, [], false);
    expect(v).toMatchObject({ phase: "done", go: 0 });
    expect(primaryOf(v, false, false)).toBeNull();
    expect(railWords(v)).toBeNull();
    // every file refused: nothing was written and nothing is left, never "not yet"
    const refused = stepView(at({ partial: false }), step({ ...ran, state: "waiting", files: 0, waiting: 0, held: 0, partial: false, waiting_partial: false }), none, [], false);
    expect(refused).toMatchObject({ phase: "done", copy: 0, go: 0 });
    expect(primaryOf(refused, true, false)).toBeNull();
  });

  it("takes the engine's count of what no run has decided, never the originals less the copy and the held files", () => {
    // 544 new files since the run, 30 refused by it: the engine counts the 544 alone
    const s = step({ ...ran, state: "waiting", files: 6970, waiting: 544, held: 0, partial: false, waiting_partial: false });
    const v = stepView(at({ partial: false }), s, none, [], false);
    expect(v).toMatchObject({ phase: "ready", go: 544, goPartial: false });
    expect(primaryOf(v, false, false)?.label).toBe("Pseudonymise and sort 544 files");
  });

  it("offers the rest of a run that was cut short, whose originals no run has decided are not known", () => {
    // an update cancelled the run part way: the copy holds what it wrote, the originals' count is a lower bound
    const s = step({ ...ran, state: "waiting", files: 120_000, waiting: 0, held: 0, partial: false, waiting_partial: true });
    const v = stepView(at({ files: 200_000, partial: true }, { files: 120_000, partial: true }), s, none, [], false);
    expect(v).toMatchObject({ phase: "ready", go: 0, goPartial: true });
    expect(goWords(v)).toBe("the rest");
    expect(primaryOf(v, false, false)).toEqual({ label: "Pseudonymise and sort the rest", act: "run" });
    expect(railWords(v)?.what).toBe("the rest to go");
    for (const w of [goWords(v), railWords(v)?.what]) expect(w).not.toContain("at least 0");
  });

  it("offers a run that stopped again, never as done", () => {
    const s = step({ job: 154, state: "failed", files: 7544, waiting: 0, held: 0, partial: false, waiting_partial: false });
    const v = stepView(at({ partial: false }, { files: 7544 }), s, none, [], false);
    expect(v).toMatchObject({ phase: "ready", go: 0, goPartial: true });
    expect(primaryOf(v, false, false)?.label).toBe("Pseudonymise and sort the rest");
  });

  it("leaves a dataset never run as it was: every original to go, the probe's count where the run has none", () => {
    const fresh = stepView(at({ partial: false }), step({ held: 0 }), none, [], false);
    expect(fresh).toMatchObject({ phase: "fresh", originals: 7544, go: 7544, goPartial: false });
    expect(primaryOf(fresh, false, false)?.label).toBe("Pseudonymise and sort 7,544 files");
    expect(railWords(fresh)).toEqual({ what: "not yet", when: "next step", next: true });
    // a found step only the probe counted changes nothing
    const probe: SummaryStep = { ...found, files: 7544, partial: true, counted_by: "probe" };
    expect(stepView(at({ partial: true }), step({ held: 0 }), none, [], false, probe)).toMatchObject({ phase: "fresh", originals: 7544, originalsPartial: true, goPartial: true });
    // a probe that counted nothing at all: every file, never "at least 0 files"
    const nothing = stepView(at({ files: 0, partial: true }), step({ held: 0, waiting: 0 }), none, [], false);
    expect(primaryOf(nothing, false, false)?.label).toBe("Pseudonymise and sort every file");
  });

  it("keeps the probe's count where it found more than an older run walked", () => {
    // the run walked 1,000 originals; files came since, and the probe found at least 200,000
    const older: SummaryStep = { ...found, files: 1000 };
    const v = stepView(at({ files: 200_000, partial: true }), step({ ...ran, state: "waiting", files: 1000, waiting: 199_000, held: 0, partial: false, waiting_partial: true }), none, [], false, older);
    expect(v).toMatchObject({ originals: 200_000, originalsPartial: true, phase: "ready", go: 199_000, goPartial: true });
  });
});

describe("a dataset whose summary is not read yet (2026-10-17)", () => {
  // production: two datasets whose run had finished offered "Pseudonymise and sort" for exactly the files their run refused as not DICOM,
  // read off the sources door's trees while their summaries, which took tens of seconds, were not read yet
  const SHAPES = [
    { originals: 30_689_981, copy: 30_654_432, refused: 35_549 },
    { originals: 3_173_424, copy: 3_172_225, refused: 1_199 },
  ];
  const pn = { identity: { id_type: "personnummer", from: [{ field: "PatientID" }] }, held: { files: 0, identifiers: 0 } };
  const batch = { id: 9, name: "study-identified-2026-10-16", state: "done", started_at: null, finished_at: null, job_id: 70, files: { seen: 0, new: 0, changed: 0, unchanged: 0, refused: 0 }, subjects_added: 0, stacks_added: 0, classified: 0, to_sort: 0, pseudonymised: { files: 0, changed: 0, held: 0, job: 69 }, chain: { pseudonymize: 69, digest: 70, classify: [] } };
  const at = (originals: number, copy: number, over: Partial<Dataset> = {}) =>
    ({ ...d, ...pn, trees: { originals: { ...base.trees.originals, files: originals, bytes: null }, anon: { ...base.trees.anon, files: copy } }, digests: { count: 1, first: null, last: null, recent: [batch] }, ...over }) as unknown as Dataset;
  const subjects = (coded: number): HeldIds => ({ files: 0, identifiers: 0, ids: [], subjects: { coded, generated: 0 } });

  it("counts what a run left as not known, never the originals less the copy, which are the files it refused", () => {
    for (const { originals, copy, refused } of SHAPES) {
      const c = countsOf(at(originals, copy), null, null, 0);
      expect(c.ran).toBe(true);
      expect(c.unseen).toBeNull();
      expect(c.unseen).not.toBe(refused);
      // a dataset never run still counts every original as to go
      expect(countsOf(at(originals, 0, { digests: { count: 0, first: null, last: null, recent: [] } } as Partial<Dataset>), null, null, 0)).toMatchObject({ ran: false, unseen: originals });
    }
  });

  it("draws the counts it has and offers nothing while the summary is on its way: no button, no next step, no waiting", () => {
    for (const { originals, copy, refused } of SHAPES) {
      const v = stepView(at(originals, copy), null, subjects(4399), [], false, null, { summary: "reading", ids: false });
      expect(v).toMatchObject({ phase: "counting", originals, copy, counting: "reading" });
      for (const generates of [false, true]) for (const open of [false, true]) expect(primaryOf(v, generates, open)).toBeNull();
      expect(chipOf(v, false)).toBeNull();
      expect(railWords(v)).toBeNull();
      expect(waitingLine(v)).toBeNull();
      expect(waitWords(v)).toBeNull();
      expect(countingWords(v)).toBe("Counting what is left…");
      expect(goWords(v)).not.toContain(refused.toLocaleString("en-US"));
      // the summary's read failed: still nothing guessed, and said so
      const failed = stepView(at(originals, copy), null, subjects(4399), [], false, null, { summary: "failed" });
      expect(failed.phase).toBe("counting");
      expect(primaryOf(failed, true, false)).toBeNull();
      expect(countingWords(failed)).toBe("What is left could not be counted.");
    }
  });

  it("keeps the done view once the summary says the run left nothing", () => {
    for (const { originals, copy } of SHAPES) {
      const found: SummaryStep = { step: "found", state: "done", job: null, started_at: null, finished_at: null, progress: null, files: originals, bytes: null, partial: false, counted_by: "pseudonymise", tree: "originals" };
      const s = step({ job: 69, state: "done", files: copy, waiting: 0, held: 0, partial: false, waiting_partial: false });
      const v = stepView(at(originals, copy), s, subjects(4399), [], false, found);
      expect(v).toMatchObject({ phase: "done", originals, copy, go: 0, counting: null });
      expect(primaryOf(v, true, false)).toBeNull();
      expect(railWords(v)).toBeNull();
      expect(countingWords(v)).toBeNull();
      expect(idsBox(v).big).toBe("4,399");
    }
  });

  it("says the IDs box is on its way until the held IDs door answers, never 0", () => {
    const s = step({ job: 69, state: "done", files: 30_654_432, waiting: 0, held: 0, partial: false, waiting_partial: false });
    const reading = stepView(at(30_689_981, 30_654_432), s, null, [], false, null, { ids: true });
    expect(reading.subjects).toBeNull();
    expect(idsBox(reading)).toEqual({ big: "…", words: "subjects · coded by the key from an ID that is the same everywhere", caution: false });
    // IDs of a type: their count on its way too, never "0 · none held"
    const typed = stepView(at(3_173_424, 3_172_225, { identity: { id_type: "study-id", from: [{ field: "PatientID" }] } } as Partial<Dataset>), s, null, [], false, null, { ids: true });
    expect(idsBox(typed)).toEqual({ big: "…", words: "IDs", caution: false });
    // answered, the count
    expect(idsBox(stepView(at(3_173_424, 3_172_225), s, subjects(388), [], false)).big).toBe("388");
    // a door that does not answer here: not known, never 0
    expect(idsBox(stepView(at(30_689_981, 30_654_432), s, null, [], false)).big).toBe("?");
  });

  it("leaves a dataset never run as it was while its summary is on its way", () => {
    const never = at(7544, 0, { digests: { count: 0, first: null, last: null, recent: [] } } as Partial<Dataset>);
    const v = stepView(never, null, subjects(0), [], false, null, { summary: "reading", ids: false });
    expect(v).toMatchObject({ phase: "fresh", go: 7544, counting: null });
    expect(primaryOf(v, false, false)?.label).toBe("Pseudonymise and sort 7,544 files");
    expect(railWords(v)).toEqual({ what: "not yet", when: "next step", next: true });
    expect(countingWords(v)).toBeNull();
  });

  it("keeps what an engine with no summary door gives, without the refused files as work", () => {
    // no summary will come: the step offers the rest, as where a count stopped short, never the files the run refused
    const v = stepView(at(30_689_981, 30_654_432), null, subjects(4399), [], false);
    expect(v.phase).toBe("ready");
    expect(primaryOf(v, false, false)?.label).toBe("Pseudonymise and sort the rest");
    // whole counts that leave no file without its copy are done
    expect(stepView(at(7544, 7544), null, subjects(10), [], false).phase).toBe("done");
  });
});
