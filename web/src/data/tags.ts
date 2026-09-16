// SPDX-License-Identifier: AGPL-3.0-only
// The hundred tags the pseudonymiser removes, and what one dataset may do
// about them (record 27, R3). The list is the engine's own, tag for tag and
// group for group, carried from engine/crates/nils-release/src/tags.rs: no
// door serves it, it is fixed in the engine's code, and the counts it adds up
// to are the ones the Tags card has always shown (patient 34, provider 38,
// trial 23, institution 5). Five of them are in no standard dictionary, so
// they carry their tag and no name rather than a name someone made up.
//
// What happens to a tag is the order of engine/crates/nils-release/src/scrub.rs:
// the age is computed and written before anything is removed; the identifier
// is replaced by the subject's code; the two tags that make a file a file are
// never removed; a tag this dataset keeps wins over every removal; and the
// tags it names itself are removed beside the hundred.

import type { Tags } from "./datasets";

export type TagGroup = "patient" | "provider" | "trial" | "institution";

/** One of the hundred: the tag, its name in the standard, and the group it falls in. */
export interface StandardTag {
  tag: string;
  /** Null for a tag the standard's dictionary does not name. */
  name: string | null;
  group: TagGroup;
}

/** What each group is, in the few words a filter and a row can carry. */
export const GROUPS: { group: TagGroup; what: string }[] = [
  { group: "patient", what: "who the patient is" },
  { group: "provider", what: "who performed, referred, read and reported" },
  { group: "trial", what: "which trial, arm, site and protocol" },
  { group: "institution", what: "where it was done" },
];

/** The hundred, in the engine's own order. */
export const STANDARD: StandardTag[] = [
  /* patient: 34 */
  { tag: "0010,0010", name: "PatientName", group: "patient" },
  { tag: "0010,0021", name: "IssuerOfPatientID", group: "patient" },
  { tag: "0010,0030", name: "PatientBirthDate", group: "patient" },
  { tag: "0010,0032", name: "PatientBirthTime", group: "patient" },
  { tag: "0010,0040", name: "PatientSex", group: "patient" },
  { tag: "0010,0050", name: "PatientInsurancePlanCodeSequence", group: "patient" },
  { tag: "0010,0101", name: "PatientPrimaryLanguageCodeSequence", group: "patient" },
  { tag: "0010,0102", name: "PatientPrimaryLanguageModifierCodeSequence", group: "patient" },
  { tag: "0010,1000", name: "OtherPatientIDs", group: "patient" },
  { tag: "0010,1001", name: "OtherPatientNames", group: "patient" },
  { tag: "0010,1002", name: "OtherPatientIDsSequence", group: "patient" },
  { tag: "0010,1010", name: "PatientAge", group: "patient" },
  { tag: "0010,1020", name: "PatientSize", group: "patient" },
  { tag: "0010,1030", name: "PatientWeight", group: "patient" },
  { tag: "0010,1040", name: "PatientAddress", group: "patient" },
  { tag: "0010,1060", name: "PatientMotherBirthName", group: "patient" },
  { tag: "0010,1080", name: "MilitaryRank", group: "patient" },
  { tag: "0010,1081", name: "BranchOfService", group: "patient" },
  { tag: "0010,1090", name: "MedicalRecordLocator", group: "patient" },
  { tag: "0010,2000", name: "MedicalAlerts", group: "patient" },
  { tag: "0010,2110", name: "Allergies", group: "patient" },
  { tag: "0010,2150", name: "CountryOfResidence", group: "patient" },
  { tag: "0010,2152", name: "RegionOfResidence", group: "patient" },
  { tag: "0010,2154", name: "PatientTelephoneNumbers", group: "patient" },
  { tag: "0010,2160", name: "EthnicGroup", group: "patient" },
  { tag: "0010,2180", name: "Occupation", group: "patient" },
  { tag: "0010,21A0", name: "SmokingStatus", group: "patient" },
  { tag: "0010,21B0", name: "AdditionalPatientHistory", group: "patient" },
  { tag: "0010,21C0", name: "PregnancyStatus", group: "patient" },
  { tag: "0010,21D0", name: "LastMenstrualDate", group: "patient" },
  { tag: "0010,21F0", name: "PatientReligiousPreference", group: "patient" },
  { tag: "0010,2297", name: "ResponsiblePerson", group: "patient" },
  { tag: "0010,2298", name: "ResponsiblePersonRole", group: "patient" },
  { tag: "0010,4000", name: "PatientComments", group: "patient" },
  /* provider: 38 */
  { tag: "0008,0090", name: "ReferringPhysicianName", group: "provider" },
  { tag: "0008,0092", name: "ReferringPhysicianAddress", group: "provider" },
  { tag: "0008,0094", name: "ReferringPhysicianTelephoneNumbers", group: "provider" },
  { tag: "0008,0096", name: "ReferringPhysicianIdentificationSequence", group: "provider" },
  { tag: "0008,1048", name: "PhysiciansOfRecord", group: "provider" },
  { tag: "0008,1049", name: "PhysiciansOfRecordIdentificationSequence", group: "provider" },
  { tag: "0008,1050", name: "PerformingPhysicianName", group: "provider" },
  { tag: "0008,1052", name: "PerformingPhysicianIdentificationSequence", group: "provider" },
  { tag: "0008,1060", name: "NameOfPhysiciansReadingStudy", group: "provider" },
  { tag: "0008,1062", name: "PhysiciansReadingStudyIdentificationSequence", group: "provider" },
  { tag: "0008,106E", name: null, group: "provider" },
  { tag: "0008,1070", name: "OperatorsName", group: "provider" },
  { tag: "0008,1072", name: "OperatorIdentificationSequence", group: "provider" },
  { tag: "0008,1080", name: "AdmittingDiagnosesDescription", group: "provider" },
  { tag: "0008,2111", name: "DerivationDescription", group: "provider" },
  { tag: "0032,1032", name: "RequestingPhysician", group: "provider" },
  { tag: "0032,1033", name: "RequestingService", group: "provider" },
  { tag: "0032,1060", name: "RequestedProcedureDescription", group: "provider" },
  { tag: "0040,0006", name: "ScheduledPerformingPhysicianName", group: "provider" },
  { tag: "0040,0007", name: "ScheduledProcedureStepDescription", group: "provider" },
  { tag: "0040,0009", name: "ScheduledProcedureStepID", group: "provider" },
  { tag: "0040,000B", name: "ScheduledPerformingPhysicianIdentificationSequence", group: "provider" },
  { tag: "0040,0253", name: "PerformedProcedureStepID", group: "provider" },
  { tag: "0040,0254", name: "PerformedProcedureStepDescription", group: "provider" },
  { tag: "0040,0260", name: "PerformedProtocolCodeSequence", group: "provider" },
  { tag: "0040,0275", name: "RequestAttributesSequence", group: "provider" },
  { tag: "0040,1001", name: "RequestedProcedureID", group: "provider" },
  { tag: "0040,1002", name: "ReasonForTheRequestedProcedure", group: "provider" },
  { tag: "0040,1102", name: "PersonAddress", group: "provider" },
  { tag: "0040,1103", name: "PersonTelephoneNumbers", group: "provider" },
  { tag: "0040,1104", name: "PersonTelecomInformation", group: "provider" },
  { tag: "0040,1400", name: "RequestedProcedureComments", group: "provider" },
  { tag: "0040,A073", name: "VerifyingObserverSequence", group: "provider" },
  { tag: "0040,A075", name: "VerifyingObserverName", group: "provider" },
  { tag: "0040,A730", name: "ContentSequence", group: "provider" },
  { tag: "0070,0084", name: "ContentCreatorName", group: "provider" },
  { tag: "0070,0086", name: "ContentCreatorIdentificationCodeSequence", group: "provider" },
  { tag: "0400,0561", name: "OriginalAttributesSequence", group: "provider" },
  /* trial: 23 */
  { tag: "0012,0010", name: "ClinicalTrialSponsorName", group: "trial" },
  { tag: "0012,0020", name: "ClinicalTrialProtocolID", group: "trial" },
  { tag: "0012,0021", name: "ClinicalTrialProtocolName", group: "trial" },
  { tag: "0012,0030", name: "ClinicalTrialSiteID", group: "trial" },
  { tag: "0012,0031", name: "ClinicalTrialSiteName", group: "trial" },
  { tag: "0012,0040", name: "ClinicalTrialSubjectID", group: "trial" },
  { tag: "0012,0042", name: "ClinicalTrialSubjectReadingID", group: "trial" },
  { tag: "0012,0050", name: "ClinicalTrialTimePointID", group: "trial" },
  { tag: "0012,0051", name: "ClinicalTrialTimePointDescription", group: "trial" },
  { tag: "0012,0060", name: "ClinicalTrialCoordinatingCenterName", group: "trial" },
  { tag: "0012,0071", name: "ClinicalTrialSeriesID", group: "trial" },
  { tag: "0012,0072", name: "ClinicalTrialSeriesDescription", group: "trial" },
  { tag: "0012,0081", name: "ClinicalTrialProtocolEthicsCommitteeName", group: "trial" },
  { tag: "0012,0082", name: "ClinicalTrialProtocolEthicsCommitteeApprovalNumber", group: "trial" },
  { tag: "0012,0083", name: "ConsentForClinicalTrialUseSequence", group: "trial" },
  { tag: "0012,0084", name: "DistributionType", group: "trial" },
  { tag: "0012,0085", name: "ConsentForDistributionFlag", group: "trial" },
  { tag: "0012,0086", name: "EthicsCommitteeApprovalEffectivenessStartDate", group: "trial" },
  { tag: "0012,0087", name: "EthicsCommitteeApprovalEffectivenessEndDate", group: "trial" },
  { tag: "0012,0088", name: null, group: "trial" },
  { tag: "0012,0089", name: null, group: "trial" },
  { tag: "0012,0090", name: null, group: "trial" },
  { tag: "0012,0091", name: null, group: "trial" },
  /* institution: 5 */
  { tag: "0008,0080", name: "InstitutionName", group: "institution" },
  { tag: "0008,0081", name: "InstitutionAddress", group: "institution" },
  { tag: "0008,1010", name: "StationName", group: "institution" },
  { tag: "0008,1040", name: "InstitutionalDepartmentName", group: "institution" },
  { tag: "0008,1041", name: "InstitutionalDepartmentTypeCodeSequence", group: "institution" },
];

/** The hundred by tag, for a lookup that does not walk the list. */
const BY_TAG = new Map(STANDARD.map((t) => [t.tag, t]));

/** How many of the hundred fall in each group, counted from the list itself. */
export const GROUP_TAGS: { group: TagGroup; tags: number }[] = GROUPS.map((g) => ({ group: g.group, tags: STANDARD.filter((t) => t.group === g.group).length }));

export const STANDARD_TOTAL = STANDARD.length;

/** The identifier itself: replaced by the subject's code, never removed. */
export const PATIENT_ID = "0010,0020";
/** Computed from the birth date and the study date before anything is removed, then written. */
export const PATIENT_AGE = "0010,1010";
/** The two that make a file a file: remapped when the scans leave, never gone. */
export const MANDATORY = ["0008,0016", "0008,0018"];
/** Sex, weight and size: covariates, not identifiers, kept unless the dataset says otherwise. */
export const DEMOGRAPHICS = ["0010,0040", "0010,1030", "0010,1020"];

/** The names of the tags that are never removed and are not among the hundred. */
export const FIXED_NAMES: Record<string, string> = {
  [PATIENT_ID]: "PatientID",
  "0008,0016": "SOPClassUID",
  "0008,0018": "SOPInstanceUID",
};

/** A tag as the engine writes it: `gggg,eeee`, upper-cased; null for anything else. */
export function normaliseTag(text: string): string | null {
  const t = text.trim().toUpperCase();
  return /^[0-9A-F]{4},[0-9A-F]{4}$/.test(t) ? t : null;
}

/** One of the hundred, or undefined. */
export function standardTag(tag: string): StandardTag | undefined {
  return BY_TAG.get(tag);
}

/** Why a tag can never be removed, in words, or null when it can. */
export function neverRemoved(tag: string): string | null {
  if (tag === PATIENT_ID) return "the identifier itself, replaced by the subject's code";
  if (tag === PATIENT_AGE) return "computed from the birth date before it goes, and written";
  if (MANDATORY.includes(tag)) return "without it the file is not a file; it is remapped, never removed";
  return null;
}

/** What becomes of one tag under this dataset. */
export type Fate = "removed" | "added" | "kept" | "covariate" | "written" | "coded" | "mandatory";

export interface TagRow {
  tag: string;
  name: string | null;
  /** Null for a tag that is not one of the hundred. */
  group: TagGroup | null;
  fate: Fate;
  /** What happens to it, as the row says it. */
  words: string;
  /** A row that can never be toggled: the fate is the engine's, not the dataset's. */
  fixed: boolean;
  /** Whether the row is ticked: the dataset keeps it. */
  kept: boolean;
}

/** Whether this dataset keeps a tag out of every removal. */
function keptBy(tags: Tags, tag: string): boolean {
  return tags.keep.includes(tag) || (tags.keep_demographics && DEMOGRAPHICS.includes(tag));
}

/** What happens to one of the hundred under this dataset. */
export function fateOf(tags: Tags, t: StandardTag): TagRow {
  const never = neverRemoved(t.tag);
  if (never !== null) return { ...t, fate: "written", words: never, fixed: true, kept: true };
  if (tags.keep.includes(t.tag)) return { ...t, fate: "kept", words: "kept: this dataset's own exception", fixed: false, kept: true };
  if (tags.keep_demographics && DEMOGRAPHICS.includes(t.tag)) return { ...t, fate: "covariate", words: "kept: a covariate, not an identifier", fixed: false, kept: true };
  return { ...t, fate: "removed", words: `removed with the ${t.group} group`, fixed: false, kept: false };
}

/**
 * Every row the chooser shows: the three the engine settles whatever anyone
 * says, the hundred under this dataset, and the tags this dataset removes on
 * top of them. A tag this dataset names that is already one of the hundred is
 * not a row of its own; it is the same tag, removed once.
 */
export function tagRows(tags: Tags): TagRow[] {
  const fixed: TagRow[] = [
    { tag: PATIENT_ID, name: FIXED_NAMES[PATIENT_ID], group: null, fate: "coded", words: "replaced by the subject's code", fixed: true, kept: true },
    ...MANDATORY.map((tag): TagRow => ({ tag, name: FIXED_NAMES[tag] ?? null, group: null, fate: "mandatory", words: "never removed; remapped when the scans leave", fixed: true, kept: true })),
  ];
  const hundred = STANDARD.map((t) => fateOf(tags, t));
  const extras = extraTags(tags).map(
    (tag): TagRow => ({ tag, name: null, group: null, fate: "added", words: "removed: this dataset asked for it", fixed: false, kept: false }),
  );
  return [...fixed, ...hundred, ...extras];
}

/** The tags this dataset removes beside the hundred: its own list, less what the hundred already take and less what nothing can remove. */
export function extraTags(tags: Tags): string[] {
  return tags.remove.filter((t) => !BY_TAG.has(t) && neverRemoved(t) === null && !keptBy(tags, t));
}

/** What the summary counts: how many leave the file, how many of the hundred stay, and how many this dataset added. */
export interface TagCounts {
  removed: number;
  kept: number;
  extra: number;
}

/**
 * The counts, computed the way the engine applies them rather than by
 * subtracting from a hundred: a tag the dataset keeps stays, sex, weight and
 * size stay unless the dataset says otherwise, the age is written rather than
 * removed, and what the dataset names itself leaves beside the rest. The
 * hundred's removed and kept always add up to a hundred.
 */
export function tagCounts(tags: Tags): TagCounts {
  const rows = STANDARD.map((t) => fateOf(tags, t));
  const removed = rows.filter((r) => r.fate === "removed").length;
  const extra = extraTags(tags).length;
  return { removed: removed + extra, kept: rows.length - removed, extra };
}

/** The summary in words: "96 removed · 4 kept · 1 this dataset's own". */
export function countWords(c: TagCounts): string {
  const parts = [`${c.removed} removed`, `${c.kept} kept`];
  parts.push(c.extra === 0 ? "none added" : `${c.extra} added by this dataset`);
  return parts.join(" · ");
}

/**
 * Keeping a tag, or letting it go again. Sex, weight and size are kept by one
 * switch, so letting one of them go turns that switch off and writes the
 * other two into the dataset's own kept list: one tag changes, and the other
 * two stay exactly as they were.
 */
export function keepTag(tags: Tags, tag: string, keep: boolean): Tags {
  const remove = tags.remove.filter((t) => t !== tag);
  if (keep) {
    const already = keptBy(tags, tag);
    return { ...tags, remove, keep: already ? tags.keep : [...tags.keep, tag] };
  }
  const kept = tags.keep.filter((t) => t !== tag);
  if (tags.keep_demographics && DEMOGRAPHICS.includes(tag)) {
    const others = DEMOGRAPHICS.filter((t) => t !== tag && !kept.includes(t));
    return { keep_demographics: false, remove, keep: [...kept, ...others] };
  }
  return { ...tags, remove, keep: kept };
}

/** Whether every one of sex, weight and size is kept, by the switch or one by one. */
export function demographicsKept(tags: Tags): boolean {
  return DEMOGRAPHICS.every((t) => keptBy(tags, t));
}

/** A tag added to this dataset's own removals, or the refusal in words. */
export function addRemoved(tags: Tags, text: string): { tags: Tags } | { refusal: string } {
  const tag = normaliseTag(text);
  if (tag === null) return { refusal: "A tag is four hexadecimal digits, a comma, four more: 0008,1030." };
  const never = neverRemoved(tag);
  if (never !== null) return { refusal: `${tag} is ${never}. It cannot be removed.` };
  const standard = BY_TAG.get(tag);
  if (standard && !keptBy(tags, tag)) return { refusal: `${tag} is already removed: it is one of the hundred, in the ${standard.group} group.` };
  if (keptBy(tags, tag)) return { refusal: `${tag} is kept by this dataset. Keeping beats removing, so a tag on both lists is refused: let it go first.` };
  if (tags.remove.includes(tag)) return { refusal: `${tag} is on this dataset's list already.` };
  return { tags: { ...tags, remove: [...tags.remove, tag] } };
}

/** A tag taken off this dataset's own removals. */
export function dropRemoved(tags: Tags, tag: string): Tags {
  return { ...tags, remove: tags.remove.filter((t) => t !== tag) };
}

/** Whether the dataset's lists are as they were read, so Save has nothing to send. */
export function sameTags(a: Tags, b: Tags): boolean {
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return a.keep_demographics === b.keep_demographics && same(a.remove, b.remove) && same(a.keep, b.keep);
}

/** The lists a dataset carries before anyone has changed them. */
export const NO_TAGS: Tags = { keep_demographics: true, remove: [], keep: [] };

/** A dataset's lists as the chooser reads them, whatever an older engine left out. */
export function tagsOf(tags: Tags | null | undefined): Tags {
  if (!tags) return NO_TAGS;
  return {
    keep_demographics: tags.keep_demographics !== false,
    remove: (tags.remove ?? []).map((t) => normaliseTag(t) ?? t.trim().toUpperCase()),
    keep: (tags.keep ?? []).map((t) => normaliseTag(t) ?? t.trim().toUpperCase()),
  };
}

/** Whether a row answers what was typed in the search box: its tag or its name. */
export function matches(row: TagRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === "") return true;
  return row.tag.toLowerCase().includes(q) || (row.name ?? "").toLowerCase().includes(q);
}
