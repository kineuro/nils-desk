// SPDX-License-Identifier: AGPL-3.0-only
// A table for the map dialog's tests and its screenshots, made up whole: no
// value in it belongs to a person, a site or a study. The tests search every
// rendered dialog for each value of it, so the values are chosen to be told
// from the dialog's own words and numbers: a made-up personnummer has a month
// that does not exist, codes and names are nonsense, and the numbers the
// dialog prints (rows, characters, distinct) are never a value of a column.

/** What the dialog is to say of a column, worked out here from the rows and by hand, not by the code under test. */
export interface Fact {
  name: string;
  /** The kind the generator made the column of. */
  kind: "identifier-like" | "date" | "decimal" | "text" | "integer" | "empty";
  /** The word before the length when the column is not wholly of its kind. */
  mostly: boolean;
  filled: number;
  distinct: number;
  shortest: number;
  longest: number;
}

export interface MapTable {
  header: string[];
  rows: string[][];
  csv: string;
  /** Every different value in the table, trimmed. */
  values: string[];
  facts: Fact[];
}

/** A small deterministic generator, so the table is the same wherever it is drawn. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const pad = (v: number, width: number) => String(v).padStart(width, "0");
const quoted = (v: string) => (/[",\n]/u.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** The columns, in the order of the file. */
export const MAP_HEADER = ["personnummer", "subject_code", "study_id", "scan_date", "edss", "ward", "note", "labno", "comment"];

/**
 * A table of visits: `rowCount` rows over `subjectCount` subjects, so the
 * subject's own columns repeat. The personnummer has 12 digits and a month
 * from 13 to 19; the subject code is 16 hexadecimal digits; the study id is
 * KQ- and four digits; edss is a number of two decimals, blank in one row of
 * six; ward is two letters and a digit; the note is blank in three rows of
 * five; labno is a number with "n/a" in one row of twenty-five; the comment is
 * never filled. No short value is left to chance: a value of four characters
 * or more is not one the page's own words or its icons' numbers can spell.
 */
export function mapTable(rowCount = 1300, subjectCount = 420): MapTable {
  const next = lcg(20261018);
  const hex = "0123456789abcdef";
  const subjects = Array.from({ length: subjectCount }, (_, s) => ({
    personnummer: `${1940 + Math.floor(next() * 60)}${13 + Math.floor(next() * 7)}${pad(1 + Math.floor(next() * 28), 2)}${pad(s, 4)}`,
    code: Array.from({ length: 16 }, () => hex[Math.floor(next() * 16)]).join(""),
    study: `KQ-${1000 + s}`,
  }));
  const wards = ["Q7", "Q9", "Z3"];
  const notes = ["Zephyr", "Quill ward, transferred", "Oakmere outpatient review 2nd"];
  const rows: string[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const subject = subjects[i % subjectCount];
    rows.push([
      subject.personnummer,
      subject.code,
      subject.study,
      `${2015 + Math.floor(next() * 11)}-${pad(1 + Math.floor(next() * 12), 2)}-${pad(1 + Math.floor(next() * 28), 2)}`,
      next() < 1 / 6 ? "" : (Math.floor(next() * 19) / 2).toFixed(2),
      wards[Math.floor(next() * wards.length)],
      next() < 0.6 ? "" : notes[Math.floor(next() * notes.length)],
      next() < 1 / 25 ? "n/a" : String(40000 + Math.floor(next() * 50000)),
      "",
    ]);
  }
  const values = [...new Set(rows.flat().map((v) => v.trim()).filter((v) => v !== ""))];
  const kinds: Fact["kind"][] = ["identifier-like", "identifier-like", "identifier-like", "date", "decimal", "text", "text", "integer", "empty"];
  const facts = MAP_HEADER.map((name, c): Fact => {
    const column = rows.map((r) => r[c].trim()).filter((v) => v !== "");
    const lengths = column.map((v) => [...v].length);
    return {
      name,
      kind: kinds[c],
      mostly: name === "labno",
      filled: column.length,
      distinct: new Set(column).size,
      shortest: column.length === 0 ? 0 : Math.min(...lengths),
      longest: column.length === 0 ? 0 : Math.max(...lengths),
    };
  });
  const csv = `${[MAP_HEADER, ...rows].map((r) => r.map(quoted).join(",")).join("\n")}\n`;
  return { header: MAP_HEADER, rows, csv, values, facts };
}
