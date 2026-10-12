// SPDX-License-Identifier: AGPL-3.0-only
// A question's answer as a CSV file (2026-10-12), read the way `nils ask
// handles export` reads it: the answer's handle from the run door (at the
// same epoch the engine answers the same handle again), then every page of
// its rows from the rows door with the purpose export, at the person's own
// detail. The engine refuses an export of an answer that no longer
// reproduces (cut at the run's bound, stale or incomplete) and writes the
// purpose on the read's audit row. The cells are written as the command
// writes them: nothing for a null, text as it is, anything else as JSON, and
// a cell that holds a comma, a quote or a line break quoted. The file is
// named after the question and its version.

import { ask, columnName, DoorError } from "../ask/client";

/** The doors an answer's file is read through: the run door and the rows door. */
export type AnswerDoors = Pick<typeof ask, "run" | "rows">;

/** An answer as a file: its name, its text, how many rows it holds, and how many stacks of a sealed sample the engine left out. */
export interface AnswerFile {
  name: string;
  text: string;
  rows: number;
  withheld: number;
}

const cell = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** One cell as a field of the file: quoted where it holds the comma, a quote or a line break, and where it is a record's only field and empty. */
function field(s: string, only: boolean): string {
  return /[",\r\n]/u.test(s) || (only && s === "") ? `"${s.replace(/"/gu, '""')}"` : s;
}

/** The answer's columns and rows as CSV, a line each, the column names first. */
export function csvOf(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [columns, ...rows.map((r) => r.map(cell))].map((r) => `${r.map((c) => field(String(c), r.length === 1)).join(",")}\n`).join("");
}

/** The file's name: the question's title in plain lowercase words, and its version (`v3`), or its document where no version is known. */
export function csvName(title: string, version: string | null, document: number): string {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/u, "");
  return `${words || "query"}-${version ?? `document-${document}`}.csv`;
}

/** An answer read whole for its file: the run's handle, every page of its rows for an export, in order. */
export async function answerFile(document: number, title: string, version: string | null, doors: AnswerDoors = ask): Promise<AnswerFile> {
  const run = await doors.run(document);
  const rows: unknown[][] = [];
  let withheld = 0;
  for (let page = 0; page < run.pages; page++) {
    const p = await doors.rows(run.handle, page, "export");
    rows.push(...p.rows);
    withheld += p.withheld_sealed ?? 0;
  }
  return { name: csvName(title, version, document), text: csvOf(run.columns.map(columnName), rows), rows: rows.length, withheld };
}

/** What the card says once the file is saved: its name and how many rows it holds. */
export function savedWords(f: AnswerFile): string {
  const rows = `${f.rows.toLocaleString("en-US")} ${f.rows === 1 ? "row" : "rows"}`;
  const sealed = f.withheld > 0 ? ` ${f.withheld.toLocaleString("en-US")} ${f.withheld === 1 ? "stack" : "stacks"} of a sealed sample left out.` : "";
  return `Saved ${f.name}: ${rows}.${sealed}`;
}

/** Why the file could not be made, in the engine's words where it gave some. */
export function refusalWords(e: unknown): string {
  const why = e instanceof Error ? e.message : String(e);
  if (e instanceof DoorError && e.status === 409) return `The file could not be made: the answer no longer reproduces (${why}). Open the question and run it again, or narrow it.`;
  if (e instanceof DoorError && e.status === 403) return `The file could not be made: ${why}. Your account cannot see every column of this answer.`;
  return `The file could not be made: ${why}.`;
}
