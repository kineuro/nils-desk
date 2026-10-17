// SPDX-License-Identifier: AGPL-3.0-only
// What the walk of the side expects it to hold for a person who holds every
// grant (spec 13.1's map; gate T31, every section reachable from the side):
// the sections in their order and the pages under each. side-walk.pw.ts opens
// each in a browser; src/sideWalk.test.tsx checks the side against it.

export const MAP: Record<string, string[]> = {
  Home: [],
  Assistant: ["New conversation", "All conversations", "Shared", "Memory"],
  Query: ["Cards", "Selections", "Exports"],
  Data: ["Datasets and cohorts", "Browse", "Pseudonyms", "Clinical"],
  Review: ["Work", "Main scans", "Subjects", "Rules", "Rounds", "Label sets"],
  Release: ["Releases", "New release", "Session schemes"],
  Pipelines: ["Jobs", "Catalog", "Runs", "Logs", "Models"],
  Settings: ["Overview", "Parts", "Engine", "Desk", "Language models", "Assistant", "Teaching", "Places", "Backups", "People", "Audit", "Setup"],
};
