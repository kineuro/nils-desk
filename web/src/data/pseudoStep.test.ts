// SPDX-License-Identifier: AGPL-3.0-only
// The pseudonymise step's pure parts (Wave 7a, the design of 2026-10-09):
// the held IDs and a rehearsal's codes as the engine answers them, where the
// step is and its one next action in words that say exactly what it will do,
// the rail's words while it waits on a person, a map of ID and subject code
// read into its two columns, the four rules and what Save sends, and what
// every file got. Every ID, code and name here is made up, and no value of an
// ID ever passes through: rows carry shapes.

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
  everyFile,
  heldIdsOf,
  idsBox,
  idTypeOf,
  isStandard,
  matchedOf,
  primaryOf,
  railWords,
  readsPersonnummer,
  revealedOf,
  rulesLine,
  rulesOf,
  rulesPatch,
  STANDARD,
  stepView,
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
  it("is never run, then IDs without a code, then ready, running and done", () => {
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

  it("holds IDs without a code where the engine counts them and does not list them", () => {
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
    expect(primaryOf(codes, false, false)).toEqual({ label: "Give the 8 IDs a code", act: "codes" });
    // opened, nothing can go yet: no primary until a code is given
    expect(primaryOf(codes, false, true)).toBeNull();
    const some = stepView(d, step(), heldIds, matched, false);
    expect(primaryOf(some, false, true)).toEqual({ label: "Pseudonymise and sort 7,344 files", act: "run" });
    expect(primaryOf(stepView(d, step(), heldIds, [], true), false, false)).toBeNull();
  });

  it("says what waits on a person on its chip, its middle box, the rail and its foot", () => {
    const codes = stepView(d, step(), heldIds, [], false);
    expect(chipOf(codes, false)).toEqual({ words: "8 IDs need a code", tone: "caution" });
    expect(idsBox(codes)).toEqual({ big: "8", words: "IDs · none has a code yet", caution: true });
    expect(railWords(codes)).toEqual({ what: "8 IDs need a code", when: "next step", next: true });
    expect(waitWords(codes)).toBe("7,544 files of 8 IDs wait for a code");
    const some = stepView(d, step(), heldIds, matched, false);
    expect(chipOf(some, true)).toEqual({ words: "2 IDs without a code", tone: "caution" });
    expect(idsBox(some)).toEqual({ big: "6 of 8", words: "have a code", caution: false });
    expect(railWords(some)?.what).toBe("6 of 8 IDs have a code");
    expect(waitWords(some)).toBe("200 files of 2 IDs wait for a code");
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
    expect(codeColumnsOf(csv, shapes)).toEqual({ id: 0, code: 1 });
    expect(codePairs(csv, { id: 0, code: 1 })).toEqual([
      ["ABC123456", "code0aaaaaaaa"],
      ["aBCD1234", "code1aaaaaaaa"],
    ]);
    // the ID by its header where no value has a held shape, the other of two by elimination
    expect(codeColumnsOf(parseCsv("code;PatientID\nc1;X-1\n"), shapes)).toEqual({ id: 1, code: 0 });
    expect(codeColumnsOf(parseCsv("first,second\nABC123456,c1\n"), shapes)).toEqual({ id: 0, code: 1 });
  });

  it("refuses in words a file that is not two columns of ID and code, before a row is posted", () => {
    expect(codeColumnsOf(parseCsv("a,b,c\n1,2,3\n"), shapes)).toEqual({ refusal: "A map here is two columns: the ID and its subject code." });
    // a row with no code gives nothing
    expect(codePairs(parseCsv("id,code\nABC123456,\n,c2\n"), { id: 0, code: 1 })).toEqual([]);
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
    expect(rulesLine(own)).toBe("PatientID gets the study-id · generated codes · own tags · originals vaulted");
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
    expect(codesWords(null, false)).toBe("none yet");
  });
});
