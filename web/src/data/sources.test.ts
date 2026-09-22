// SPDX-License-Identifier: AGPL-3.0-only
// The marks and words the Data page draws from the sources door.

import { describe, expect, it } from "vitest";
import { DATES_KEPT, datesWord, digestMarks, fileWords, handlingWords, sourceState, whenWords, type Digest, type Source } from "./sources";

const digest = (over: Partial<Digest> = {}): Digest => ({
  id: 1,
  name: "mri-3t-summer",
  state: "done",
  started_at: "2026-08-20T21:04:00Z",
  finished_at: "2026-08-20T22:10:00Z",
  job_id: 7,
  files: { seen: 11324, new: 2208, changed: 14, unchanged: 9102, refused: 0 },
  subjects_added: 38,
  stacks_added: 486,
  classified: 486,
  to_sort: 12,
  ...over,
});

const source = (recent: Digest[], toSort = 0): Source => ({
  id: 1,
  name: "incoming",
  path: "/srv/imaging/incoming",
  guarantees: {},
  probed: null,
  handling: { arrives: "identified", on_release: { dates: "keep", uids: "remap", deface: false } },
  handling_declared: false,
  roots: 1,
  digests: { count: recent.length, first: null, last: null, recent },
  totals: { subjects: 212, studies: 240, sessions: 240, stacks: 3106, refused_files: 0, to_sort: toSort },
});

describe("a digest's marks", () => {
  it("say what is done and what waits for a person", () => {
    expect(digestMarks(digest()).map((m) => m.mark)).toEqual(["done", "done", "done", "wait"]);
    expect(digestMarks(digest({ to_sort: 0 })).map((m) => m.mark)).toEqual(["done", "done", "done", "done"]);
    expect(digestMarks(digest({ classified: 100 }))[2]).toEqual({ name: "classified", mark: "wait", words: "100 of 486" });
  });
  it("show a digest still reading, and one that added nothing new", () => {
    expect(digestMarks(digest({ state: "running" })).map((m) => m.mark)).toEqual(["now", "now", "none", "none"]);
    expect(digestMarks(digest({ stacks_added: 0, classified: 0, to_sort: 0 }))[2].words).toBe("nothing new");
  });
});

describe("a source's card", () => {
  it("leads with reading, then what waits, then up to date", () => {
    expect(sourceState(source([digest({ state: "running" })], 12)).words).toBe("reading now");
    expect(sourceState(source([digest()], 57))).toEqual({ words: "57 to sort", tone: "caution" });
    expect(sourceState(source([digest({ to_sort: 0 })])).tone).toBe("ok");
    expect(sourceState(source([])).words).toBe("not read yet");
  });
  it("says how the source is handled", () => {
    expect(handlingWords({ arrives: "identified", on_release: { uids: "remap", deface: true } })).toEqual({
      arrives: "arrives identified",
      release: "on release: UIDs remapped, faces removed",
    });
    expect(handlingWords({ arrives: "deidentified", on_release: { uids: "preserve", deface: false } }).release).toBe("released as it is");
    // a caller from before may still send keep, which says nothing
    expect(handlingWords({ arrives: "deidentified", on_release: { dates: "keep", uids: "preserve", deface: false } }).release).toBe("released as it is");
    // an engine from before may still answer a stored policy: it is said as it stands, not crashed on
    expect(handlingWords({ arrives: "identified", on_release: { dates: "shift", uids: "remap", deface: false } }).release).toBe("on release: dates shifted, UIDs remapped");
  });
  it("says a stored date policy in a word, every release since keeping the date", () => {
    expect(datesWord(undefined)).toBe("kept");
    expect(datesWord(null)).toBe("kept");
    expect(datesWord("keep")).toBe("kept");
    expect(datesWord("shift")).toBe("shifted");
    expect(datesWord("year")).toBe("cut to the year");
    expect(DATES_KEPT).toContain("(M00, M06)");
  });
  it("counts a digest's files and says when briefly", () => {
    expect(fileWords(digest())).toBe("2,208 new · 14 changed · 9,102 unchanged");
    const now = new Date("2026-09-13T12:00:00Z");
    expect(whenWords("2026-08-20T21:04:00Z", now)).toBe("20 Aug");
    expect(whenWords("2025-08-20T21:04:00Z", now)).toBe("20 Aug 2025");
    expect(whenWords(null, now)).toBe("");
  });
});
