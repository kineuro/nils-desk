// SPDX-License-Identifier: AGPL-3.0-only
// A question's answer as a CSV file (2026-10-12): the cells as `nils ask
// handles export` writes them, the file named after the question and its
// version, every page of the answer read for an export, and what the card
// says of it.

import { describe, expect, it } from "vitest";
import { DoorError, type Run } from "../ask/client";
import { type AnswerDoors, answerFile, csvName, csvOf, refusalWords, savedWords } from "./csv";

/** A run door and a rows door over pages of rows, keeping what was asked of them. */
function doorsOver(pages: unknown[][][], withheld: number[] = [], asked: string[] = []): AnswerDoors {
  const run = { handle: 7, pages: pages.length, row_count: pages.flat().length, truncated: false, columns: [{ name: "code", type: "text" }, "n_sessions"], rows: pages[0] ?? [] } as unknown as Run;
  return {
    run: async (id: number) => {
      asked.push(`run ${id}`);
      return run;
    },
    rows: async (handle: number, page: number, purpose?: "export") => {
      asked.push(`rows ${handle} ${page} ${purpose ?? ""}`);
      return { columns: [], rows: pages[page] ?? [], page, pages: pages.length, ...(withheld[page] ? { withheld_sealed: withheld[page] } : {}) };
    },
  };
}

describe("an answer as a CSV file", () => {
  it("writes the cells as the command does: nothing for a null, text as it is, the rest as JSON, quoted where needed", () => {
    expect(csvOf(["code", "note", "n", "tags"], [["S-1", null, 3, ["a", "b"]], ["S-2", 'said "no", then\nyes', 1.5, { k: 1 }]])).toBe(
      'code,note,n,tags\nS-1,,3,"[""a"",""b""]"\nS-2,"said ""no"", then\nyes",1.5,"{""k"":1}"\n',
    );
    // a record of one empty field is quoted, so it is not read as no record
    expect(csvOf(["code"], [[""], ["S-3"]])).toBe('code\n""\nS-3\n');
    // an answer with no rows is its header
    expect(csvOf(["code"], [])).toBe("code\n");
  });

  it("is named after the question and its version, or its document where no version is known", () => {
    expect(csvName("T1 scans of cohort A", "v3", 12)).toBe("t1-scans-of-cohort-a-v3.csv");
    expect(csvName("Kohorter över tid", null, 12)).toBe("kohorter-over-tid-document-12.csv");
    expect(csvName("???", "v1", 12)).toBe("query-v1.csv");
    expect(csvName("x".repeat(80), "v2", 12)).toBe(`${"x".repeat(60)}-v2.csv`);
  });

  it("reads every page of the answer for an export, in order, and counts its rows and what was withheld", async () => {
    const asked: string[] = [];
    const f = await answerFile(12, "Sessions per subject", "v2", doorsOver([[["S-1", 4], ["S-2", 1]], [["S-3", 2]]], [0, 1], asked));
    expect(asked).toEqual(["run 12", "rows 7 0 export", "rows 7 1 export"]);
    expect(f).toEqual({ name: "sessions-per-subject-v2.csv", text: "code,n_sessions\nS-1,4\nS-2,1\nS-3,2\n", rows: 3, withheld: 1 });
    expect(savedWords(f)).toBe("Saved sessions-per-subject-v2.csv: 3 rows. 1 stack of a sealed sample left out.");
    const none = await answerFile(12, "Nothing", "v1", doorsOver([]));
    expect(none).toMatchObject({ text: "code,n_sessions\n", rows: 0 });
    expect(savedWords({ ...none, rows: 1 })).toBe("Saved nothing-v1.csv: 1 row.");
  });

  it("says why the file could not be made, in the engine's words", () => {
    expect(refusalWords(new DoorError(409, { error: "the answer is truncated" }))).toBe(
      "The file could not be made: the answer no longer reproduces (the answer is truncated). Open the question and run it again, or narrow it.",
    );
    expect(refusalWords(new DoorError(403, { error: "beyond your detail" }))).toMatch(/cannot see every column/u);
    expect(refusalWords(new Error("the engine went away"))).toBe("The file could not be made: the engine went away.");
  });
});
