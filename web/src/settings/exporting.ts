// SPDX-License-Identifier: AGPL-3.0-only
// Who may export a table from this desk, in words (record 25): the desk's
// `export` setting names a grant, a ladder name standing for the group made
// from it, or off.

import { PAGE_LINES } from "./identity";

const GROUPS: Record<string, string> = { reader: "Readers", reviewer: "Reviewers", operator: "Operators", admin: "Admins" };

/** The desk's export setting as the Desk page says it. */
export function exportWords(setting: string): string {
  if (setting === "off") return "nobody";
  if (GROUPS[setting]) return `whoever holds all that the ${GROUPS[setting]} group gives`;
  if (setting === "assist" || setting === "assistant:use") return "whoever may use the assistant";
  const [page, level] = setting.split(":");
  const line = PAGE_LINES.find((l) => l.id === page);
  if (!line || (level !== "see" && level !== "work")) return setting;
  const where = /^[A-Z]/.test(line.named) ? `the ${line.named} page` : line.named;
  return level === "work" ? `whoever may work on ${where}` : `whoever may see ${where}`;
}
