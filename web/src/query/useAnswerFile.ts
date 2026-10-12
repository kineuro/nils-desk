// SPDX-License-Identifier: AGPL-3.0-only
// Download CSV (2026-10-12): a question's answer saved as a file at the
// person's own detail, read through csv.ts as `nils ask handles export`
// reads it, named after the question and its version, saying how many rows
// it holds or why it could not be made. The chat's answer card and the Query
// page's card both offer it.

import { useState } from "react";
import { saveText } from "../assistant/download";
import { answerFile, refusalWords, savedWords } from "./csv";

/** The answer's rows saved as a CSV file: reading while it runs, then what was saved, or why it could not be. */
export function useAnswerFile(document: number, title: string, version: string | null) {
  const [file, setFile] = useState<{ busy: boolean; said: string | null; warn: boolean }>({ busy: false, said: null, warn: false });
  const download = () => {
    setFile({ busy: true, said: "Reading the answer for the file", warn: false });
    answerFile(document, title, version).then(
      (f) => {
        saveText(f.name, f.text, "text/csv");
        setFile({ busy: false, said: savedWords(f), warn: false });
      },
      (e: unknown) => setFile({ busy: false, said: refusalWords(e), warn: true }),
    );
  };
  return { ...file, download };
}
