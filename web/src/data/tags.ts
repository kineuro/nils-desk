// SPDX-License-Identifier: AGPL-3.0-only
// The words for a DICOM tag, and only the words (record 28). What becomes of
// a tag is the engine's policy, served by `GET /api/pseudonymize/tags` and
// read in `./policy`; the engine has never held a tag name and states none.
// A name is presentation, which is the desk's, so it is kept here: a number
// to the name the DICOM standard gives it.
//
// A tag the standard's dictionary names nothing is written `null` rather than
// left out, so a row can say that the standard names it nothing, which is a
// fact about the standard. A tag this dictionary has never heard of is
// absent, and a row for it carries its number, its category and its fate with
// no name at all: the door is the authority on what is removed, and a missing
// word here is a gap in the words, never a reason to leave the row out.

/** A tag's name in the DICOM standard; `null` where the standard's dictionary names it nothing. */
export const NAMES: Record<string, string | null> = {
  // the element the subject's code is written into, and the two that make a file a file
  "0010,0020": "PatientID",
  "0008,0016": "SOPClassUID",
  "0008,0018": "SOPInstanceUID",
  // who the patient is
  "0010,0010": "PatientName",
  "0010,0021": "IssuerOfPatientID",
  "0010,0030": "PatientBirthDate",
  "0010,0032": "PatientBirthTime",
  "0010,0040": "PatientSex",
  "0010,0050": "PatientInsurancePlanCodeSequence",
  "0010,0101": "PatientPrimaryLanguageCodeSequence",
  "0010,0102": "PatientPrimaryLanguageModifierCodeSequence",
  "0010,1000": "OtherPatientIDs",
  "0010,1001": "OtherPatientNames",
  "0010,1002": "OtherPatientIDsSequence",
  "0010,1010": "PatientAge",
  "0010,1020": "PatientSize",
  "0010,1030": "PatientWeight",
  "0010,1040": "PatientAddress",
  "0010,1060": "PatientMotherBirthName",
  "0010,1080": "MilitaryRank",
  "0010,1081": "BranchOfService",
  "0010,1090": "MedicalRecordLocator",
  "0010,2000": "MedicalAlerts",
  "0010,2110": "Allergies",
  "0010,2150": "CountryOfResidence",
  "0010,2152": "RegionOfResidence",
  "0010,2154": "PatientTelephoneNumbers",
  "0010,2160": "EthnicGroup",
  "0010,2180": "Occupation",
  "0010,21A0": "SmokingStatus",
  "0010,21B0": "AdditionalPatientHistory",
  "0010,21C0": "PregnancyStatus",
  "0010,21D0": "LastMenstrualDate",
  "0010,21F0": "PatientReligiousPreference",
  "0010,2297": "ResponsiblePerson",
  "0010,2298": "ResponsiblePersonRole",
  "0010,4000": "PatientComments",
  // who performed, referred, read and reported
  "0008,0090": "ReferringPhysicianName",
  "0008,0092": "ReferringPhysicianAddress",
  "0008,0094": "ReferringPhysicianTelephoneNumbers",
  "0008,0096": "ReferringPhysicianIdentificationSequence",
  "0008,1048": "PhysiciansOfRecord",
  "0008,1049": "PhysiciansOfRecordIdentificationSequence",
  "0008,1050": "PerformingPhysicianName",
  "0008,1052": "PerformingPhysicianIdentificationSequence",
  "0008,1060": "NameOfPhysiciansReadingStudy",
  "0008,1062": "PhysiciansReadingStudyIdentificationSequence",
  "0008,106E": null,
  "0008,1070": "OperatorsName",
  "0008,1072": "OperatorIdentificationSequence",
  "0008,1080": "AdmittingDiagnosesDescription",
  "0008,2111": "DerivationDescription",
  "0032,1032": "RequestingPhysician",
  "0032,1033": "RequestingService",
  "0032,1060": "RequestedProcedureDescription",
  "0040,0006": "ScheduledPerformingPhysicianName",
  "0040,0007": "ScheduledProcedureStepDescription",
  "0040,0009": "ScheduledProcedureStepID",
  "0040,000B": "ScheduledPerformingPhysicianIdentificationSequence",
  "0040,0253": "PerformedProcedureStepID",
  "0040,0254": "PerformedProcedureStepDescription",
  "0040,0260": "PerformedProtocolCodeSequence",
  "0040,0275": "RequestAttributesSequence",
  "0040,1001": "RequestedProcedureID",
  "0040,1002": "ReasonForTheRequestedProcedure",
  "0040,1102": "PersonAddress",
  "0040,1103": "PersonTelephoneNumbers",
  "0040,1104": "PersonTelecomInformation",
  "0040,1400": "RequestedProcedureComments",
  "0040,A073": "VerifyingObserverSequence",
  "0040,A075": "VerifyingObserverName",
  "0040,A730": "ContentSequence",
  "0070,0084": "ContentCreatorName",
  "0070,0086": "ContentCreatorIdentificationCodeSequence",
  "0400,0561": "OriginalAttributesSequence",
  // which trial, arm, site and protocol
  "0012,0010": "ClinicalTrialSponsorName",
  "0012,0020": "ClinicalTrialProtocolID",
  "0012,0021": "ClinicalTrialProtocolName",
  "0012,0030": "ClinicalTrialSiteID",
  "0012,0031": "ClinicalTrialSiteName",
  "0012,0040": "ClinicalTrialSubjectID",
  "0012,0042": "ClinicalTrialSubjectReadingID",
  "0012,0050": "ClinicalTrialTimePointID",
  "0012,0051": "ClinicalTrialTimePointDescription",
  "0012,0060": "ClinicalTrialCoordinatingCenterName",
  "0012,0071": "ClinicalTrialSeriesID",
  "0012,0072": "ClinicalTrialSeriesDescription",
  "0012,0081": "ClinicalTrialProtocolEthicsCommitteeName",
  "0012,0082": "ClinicalTrialProtocolEthicsCommitteeApprovalNumber",
  "0012,0083": "ConsentForClinicalTrialUseSequence",
  "0012,0084": "DistributionType",
  "0012,0085": "ConsentForDistributionFlag",
  "0012,0086": "EthicsCommitteeApprovalEffectivenessStartDate",
  "0012,0087": "EthicsCommitteeApprovalEffectivenessEndDate",
  "0012,0088": null,
  "0012,0089": null,
  "0012,0090": null,
  "0012,0091": null,
  // where it was done
  "0008,0080": "InstitutionName",
  "0008,0081": "InstitutionAddress",
  "0008,1010": "StationName",
  "0008,1040": "InstitutionalDepartmentName",
  "0008,1041": "InstitutionalDepartmentTypeCodeSequence",
};

/**
 * What to call a tag: its name, `null` where the standard names it nothing,
 * and `undefined` where this dictionary has never heard of it.
 */
export function nameOf(tag: string): string | null | undefined {
  return Object.prototype.hasOwnProperty.call(NAMES, tag) ? NAMES[tag] : undefined;
}

/** A tag as the engine writes it: `gggg,eeee`, upper-cased; null for anything else. */
export function normaliseTag(text: string): string | null {
  const t = text.trim().toUpperCase();
  return /^[0-9A-F]{4},[0-9A-F]{4}$/u.test(t) ? t : null;
}
