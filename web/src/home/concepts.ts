// SPDX-License-Identifier: AGPL-3.0-only
// What each word of NILS means, beside the steps of setup: a few lines for
// each, and how many of it an install has. The words are the ones every page
// of the desk and the documentation use.

import type { IconName } from "../ui/Icon";

export interface Concept {
  term: string;
  /** How many of it an install has. */
  count: string;
  icon: IconName;
  words: string;
}

export const CONCEPTS: Concept[] = [
  {
    term: "Registry",
    count: "one per install",
    icon: "data",
    words: "What NILS learned from your scans: subjects, sessions and series, each person under a code. It points at your files where they are and never copies them.",
  },
  { term: "Source", count: "as many as you need", icon: "folder", words: "A folder of original DICOM. NILS reads it and never writes to it." },
  { term: "Digest", count: "one batch per folder read", icon: "layers", words: "Reading a source into the registry. Each run is a batch, which can be looked at and run again." },
  { term: "Rule pack", count: "one per modality", icon: "branch", words: "How a scan is recognised: a T1, a FLAIR, a diffusion series. MRI has one today." },
  { term: "Key", count: "one per registry", icon: "key", words: "The secret each subject's code is made from, so the code is the same every time. It is in no backup; keep its passphrase apart." },
  { term: "Place", count: "one per folder", icon: "disk", words: "Any folder NILS uses, with its role: a source, the registry, a backup place, an export." },
  { term: "Backup place", count: "one per registry", icon: "shield", words: "Where the registry's archives go, best on storage other than the registry's." },
  { term: "People", count: "four roles", icon: "users", words: "A reader reads, a reviewer judges, an operator runs the install, an admin changes it. Each role includes the ones before it." },
  { term: "Assistant", count: "optional", icon: "assistant", words: "Answers and plans in words. Kvasir decides which model a prompt may reach, and what may leave." },
];
