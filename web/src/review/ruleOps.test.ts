// SPDX-License-Identifier: AGPL-3.0-only
// The typed rule operations as forms (record 56, 5.5): every operation of the
// patch contract has a form, read from the contract's own schema; a form
// builds the operation as the contract writes it, with its scope, its reason
// and its evidence, or says what it still lacks; a word keeps its spaces when
// quoted; the pick operations are pack edits only; and every operation reads
// as one line, as a card says it.

import { describe, expect, it } from "vitest";
import schema from "./patch.schema.json";
import {
  OP_SPECS,
  buildOp,
  conditionOf,
  emptyForm,
  frontAndMore,
  opWords,
  opsOf,
  scopeText,
  scopeWords,
  specOf,
  wordsOf,
  type ConditionRow,
  type OpForm,
} from "./ruleOps";

const PACK = { kind: "pack", value: "" } as const;

/** A condition row with what the test sets. */
const row = (r: Partial<ConditionRow>): ConditionRow => ({ not: false, kind: "tag", words: "", field: "", tag: "", cmp: "ge", value: "", value2: "", flag: "", axis: "", is: "", ...r });

/** A form for an operation with its values set. */
function form(op: string, values: Record<string, unknown>, place?: OpForm["place"]): OpForm {
  const f = emptyForm(op);
  return { ...f, values: { ...f.values, ...(values as OpForm["values"]) }, place: place ?? f.place };
}

describe("the operations, read from the patch contract's schema", () => {
  it("are the fourteen the contract names, each with a title and a family, in the contract's order", () => {
    expect(OP_SPECS.map((s) => s.op)).toEqual([
      "add_words",
      "remove_words",
      "move_rule",
      "move_set",
      "set_priority",
      "add_value",
      "add_rule",
      "silence",
      "by_model",
      "map_name",
      "set_candidates",
      "remove_border",
      "set_near_tie",
      "set_runner_up_within",
    ]);
    for (const s of OP_SPECS) {
      expect(s.title, s.op).not.toBe(s.op.replace(/_/gu, " "));
      expect(s.help.length, s.op).toBeGreaterThan(10);
      expect(s.fields.every((f) => !["op", "scope", "reason", "evidence", "before", "after", "position"].includes(f.name)), s.op).toBe(true);
    }
  });

  it("types each field as the schema does, and folds before, after and position into one place", () => {
    const words = specOf("add_words")!;
    expect(words.fields.find((f) => f.name === "words")).toMatchObject({ kind: "words", required: true });
    expect(words.fields.find((f) => f.name === "axis")).toMatchObject({ kind: "text", required: false, suggest: "axis" });
    expect(specOf("set_priority")!.fields.find((f) => f.name === "priority")).toMatchObject({ kind: "integer", required: true });
    expect(specOf("add_rule")!.fields.find((f) => f.name === "when")).toMatchObject({ kind: "conditions", required: true });
    expect(specOf("add_rule")!.fields.find((f) => f.name === "nothing")).toMatchObject({ kind: "boolean" });
    expect(specOf("add_rule")!.fields.find((f) => f.name === "confidence")).toMatchObject({ kind: "number", min: 0, max: 1 });
    expect(specOf("add_value")!.fields.find((f) => f.name === "bids")).toMatchObject({ kind: "bids" });
    expect(specOf("add_value")!.fields.find((f) => f.name === "terms")).toMatchObject({ kind: "strings" });
    expect(specOf("set_candidates")!.fields.find((f) => f.name === "unless")).toMatchObject({ kind: "candidates" });
    expect(specOf("set_near_tie")!.fields.find((f) => f.name === "order")).toMatchObject({ kind: "order", required: true });
    expect(specOf("set_runner_up_within")!.fields.find((f) => f.name === "within")).toMatchObject({ kind: "number", min: 0, max: 1 });
    expect(["move_rule", "move_set", "add_value", "add_rule"].every((op) => specOf(op)!.place)).toBe(true);
    expect(specOf("set_priority")!.place).toBe(false);
  });

  it("scopes the four main-scan operations to the pack alone, as the schema says", () => {
    expect(OP_SPECS.filter((s) => s.packOnly).map((s) => s.op)).toEqual(["set_candidates", "remove_border", "set_near_tie", "set_runner_up_within"]);
  });

  it("puts a required field first, whatever the presentation says, and folds the rest", () => {
    const { front, more } = frontAndMore(specOf("add_value")!);
    expect(front.map((f) => f.name)).toEqual(["axis", "value", "label", "family", "words", "bids"]);
    expect(more.map((f) => f.name)).toEqual(["description", "terms", "aliases", "group", "priority"]);
    expect(frontAndMore(specOf("add_words")!).more.map((f) => f.name)).toEqual(["bucket", "rule"]);
  });

  it("reads an operation it has no words for all the same, titled by its name", () => {
    const more = structuredClone(schema) as { $defs: { operation: { oneOf: unknown[] } } };
    more.$defs.operation.oneOf.push({ type: "object", required: ["op", "axis"], description: "Something new. And more.", properties: { op: { const: "rename_axis" }, axis: { type: "string" }, to: { type: "string" } } });
    const spec = opsOf(more as unknown as Record<string, unknown>).find((s) => s.op === "rename_axis")!;
    expect(spec).toMatchObject({ title: "rename axis", help: "Something new.", front: ["axis"] });
    expect(spec.fields.map((f) => f.name)).toEqual(["axis", "to"]);
  });
});

describe("a form builds the operation as the contract writes it", () => {
  it("add_words, with its scope, its reason and its evidence", () => {
    const built = buildOp(form("add_words", { axis: "post_contrast", value: "given", words: "mdc", field: "series_description" }), { kind: "site", value: "partner" }, "the partner writes mdc", { proposal: 12 });
    expect(built).toEqual({
      op: { op: "add_words", axis: "post_contrast", value: "given", words: ["mdc"], field: "series_description", scope: "site:partner", reason: "the partner writes mdc", evidence: { proposal: 12 } },
      missing: [],
    });
  });

  it("says what a form still lacks rather than build half an operation", () => {
    expect(buildOp(emptyForm("add_words"), PACK, "", null)).toEqual({ op: null, missing: ["words", "an axis and a value, or a bucket", "why"] });
    expect(buildOp(form("set_priority", { axis: "modifier", value: "IR" }), PACK, "why", null).missing).toEqual(["priority"]);
    expect(buildOp(form("add_rule", { axis: "base" }), PACK, "why", null).missing).toEqual(["when", "a value, or Sets nothing"]);
    expect(buildOp(form("move_set", { set: "symri" }, { at: "before", ref: "" }), PACK, "why", null).missing).toEqual(["what it goes before"]);
    expect(buildOp(form("add_words", { axis: "a", value: "b", words: "w" }), { kind: "dataset", value: "" }, "why", null).missing).toEqual(["name the dataset"]);
  });

  it("writes the place as the contract does: before or after a name, or first or last", () => {
    expect(buildOp(form("move_set", { set: "symri" }, { at: "before", ref: "technique" }), PACK, "why", null).op).toMatchObject({ op: "move_set", set: "symri", before: "technique", scope: "pack" });
    expect(buildOp(form("add_value", { axis: "technique", value: "ZZ-GRE", label: "ZZGRE", family: "GRE", words: "zzgre" }, { at: "after", ref: "MPRAGE" }), PACK, "why", null).op).toMatchObject({ after: "MPRAGE", words: ["zzgre"], label: "ZZGRE" });
    expect(buildOp(form("add_rule", { axis: "role", nothing: true, when: [row({ kind: "axis", axis: "technique", is: "TOF-MRA" })] }, { at: "first", ref: "" }), PACK, "why", null).op).toMatchObject({
      op: "add_rule",
      axis: "role",
      nothing: true,
      when: { axis: "technique", is: "TOF-MRA" },
      position: "first",
    });
  });

  it("writes a rule's conditions: a physics range, an axis among several values, words in a field, and a not", () => {
    expect(conditionOf(row({ tag: "te", cmp: "ge", value: "200" }))).toEqual({ tag: "te", ge: 200 });
    expect(conditionOf(row({ tag: "ti", cmp: "between", value: "1800", value2: "2800" }))).toEqual({ tag: "ti", between: [1800, 2800] });
    expect(conditionOf(row({ tag: "ti", cmp: "present" }))).toEqual({ tag: "ti", present: true });
    expect(conditionOf(row({ kind: "axis", axis: "body_part", is: "spine, neck" }))).toEqual({ axis: "body_part", is: ["spine", "neck"] });
    expect(conditionOf(row({ kind: "words", words: "dark fluid", field: "series_description" }))).toEqual({ words: ["dark fluid"], field: "series_description" });
    expect(conditionOf(row({ kind: "axis", axis: "directory_type", is: "localizer", not: true }))).toEqual({ not: { axis: "directory_type", is: "localizer" } });
    expect(conditionOf(row({ tag: "te", cmp: "ge" }))).toBeNull();
    const two = buildOp(form("add_rule", { axis: "base", value: "T2w", when: [row({ tag: "te", value: "200" }), row({ tag: "tr", value: "4000" })] }), PACK, "long echo", null).op;
    expect(two?.when).toEqual([
      { tag: "te", ge: 200 },
      { tag: "tr", ge: 4000 },
    ]);
  });

  it("writes the main-scan operations: a role's candidates, a near tie's order, a border and a margin", () => {
    const unless = [{ kind: "axis" as const, axis: "body_part", is: "spine, neck, chest, other", tag: "", cmp: "is" as const, value: "" }];
    expect(buildOp(form("set_candidates", { role: "t1w", unless }), { kind: "dataset", value: "x" }, "brain roles", null).op).toEqual({
      op: "set_candidates",
      role: "t1w",
      unless: [{ axis: "body_part", is: ["spine", "neck", "chest", "other"] }],
      // a pick operation is a pack edit, whatever scope the chooser held
      scope: "pack",
      reason: "brain roles",
      evidence: "written on the Rules page",
    });
    const order = [
      { of: "mr_acquisition_type", how: "prefer" as const, values: "3D", roles: "" },
      { of: "series_number", how: "lowest" as const, values: "", roles: "t1w, flair" },
    ];
    expect(buildOp(form("set_near_tie", { order }), PACK, "R8", null).op?.order).toEqual([{ of: "mr_acquisition_type", prefer: ["3D"] }, { of: "series_number", lowest: true, roles: ["t1w", "flair"] }]);
    expect(buildOp(form("set_runner_up_within", { within: "0.02" }), PACK, "margin", null).op).toMatchObject({ within: 0.02, scope: "pack" });
    expect(buildOp(form("remove_border", { border: "rare" }), PACK, "asked about no more", null).op).toMatchObject({ border: "rare" });
  });

  it("writes a BIDS name in each of its shapes", () => {
    const bids = (b: Record<string, string>) => buildOp(form("map_name", { axis: "technique", value: "MPRAGE", bids: { kind: "token", token: "", suffix: "", datatype: "", acq: "", entity: "rec", ...b } }), PACK, "why", null).op?.bids;
    expect(bids({ kind: "token", token: "MPR" })).toBe("MPR");
    expect(bids({ kind: "acq", acq: "ZZGRE" })).toEqual({ acq: "ZZGRE" });
    expect(bids({ kind: "suffix", suffix: "T2w", datatype: "anat" })).toEqual({ suffix: "T2w", datatype: "anat" });
    expect(bids({ kind: "entity", entity: "part", token: "mag" })).toEqual({ entity: "part", token: "mag" });
  });

  it("keeps a quoted word's spaces, and trims the rest", () => {
    expect(wordsOf('mdc, gd\n "-k", " -k"')).toEqual(["mdc", "gd", "-k", " -k"]);
    expect(wordsOf(" , ,")).toEqual([]);
  });
});

describe("where a change applies", () => {
  it("is the contract's scope, or says what it lacks", () => {
    expect(scopeText({ kind: "pack", value: "x" })).toEqual({ text: "pack", why: null });
    expect(scopeText({ kind: "dataset", value: " study-big " })).toEqual({ text: "dataset:study-big", why: null });
    expect(scopeText({ kind: "scanner", value: "model=Prisma, station=MR1" })).toEqual({ text: "scanner:model=Prisma,station=MR1", why: null });
    expect(scopeText({ kind: "scanner", value: "Prisma" }).why).toBe("A scanner is named as manufacturer=, model= or station=.");
    expect(scopeText({ kind: "batch", value: "12" })).toEqual({ text: "batch:12", why: null });
    expect(scopeText({ kind: "batch", value: "twelve" }).why).toBe("A batch is named by its number.");
  });

  it("reads as words on a card", () => {
    expect(scopeWords("pack")).toBe("for everyone");
    expect(scopeWords(undefined)).toBe("for everyone");
    expect(scopeWords("dataset:a,b")).toBe("for datasets a, b");
    expect(scopeWords("site:partner")).toBe("for site partner");
    expect(scopeWords("scanner:model=Prisma")).toBe("for scanner model=Prisma");
  });
});

describe("an operation in a line", () => {
  it("says what each of the contract's example operations does", () => {
    expect(opWords({ op: "add_words", axis: "post_contrast", value: "given", words: ["mdc"], field: "series_description" })).toBe('Add "mdc" to post_contrast given in series_description');
    expect(opWords({ op: "remove_words", bucket: "localizer_words", words: ["loc"] })).toBe('Remove "loc" from localizer_words');
    expect(opWords({ op: "move_set", set: "symri", before: "technique" })).toBe("Move rule set symri before technique");
    expect(opWords({ op: "move_rule", rule: "technique/MS-EPI", position: "first" })).toBe("Move rule technique/MS-EPI, first");
    expect(opWords({ op: "set_priority", axis: "modifier", value: "IR", priority: 5 })).toBe("Give modifier IR priority 5");
    expect(opWords({ op: "add_value", axis: "technique", value: "ZZ-GRE", after: "MPRAGE" })).toBe("Add the value ZZ-GRE to technique after MPRAGE");
    expect(opWords({ op: "add_rule", axis: "base", value: "T2w", when: [{ tag: "te", ge: 200 }, { tag: "tr", ge: 4000 }, { not: { axis: "directory_type", is: "localizer" } }] })).toBe(
      "base is T2w when te at least 200 and tr at least 4000 and not directory_type is localizer",
    );
    expect(opWords({ op: "add_rule", axis: "role", nothing: true, when: { axis: "technique", is: "TOF-MRA" } })).toBe("role is nothing when technique is TOF-MRA");
    expect(opWords({ op: "silence", axis: "base", when: { axis: "provenance", is: "Calibration" } })).toBe("base says nothing when provenance is Calibration");
    expect(opWords({ op: "by_model", axis: "post_contrast" })).toBe("post_contrast is left to its model");
    expect(opWords({ op: "map_name", axis: "technique", value: "MPRAGE", bids: "MPR" })).toBe("technique MPRAGE is named MPR in BIDS");
    expect(opWords({ op: "set_candidates", role: "t1w", unless: [{ axis: "body_part", is: ["spine", "neck", "chest", "other"] }] })).toBe("t1w candidates unless body_part is spine, neck, chest or other");
    expect(opWords({ op: "remove_border", border: "rare" })).toBe("The pick raises no rare border");
    expect(opWords({ op: "set_near_tie", order: [{ of: "mr_acquisition_type", prefer: ["3D"] }, { of: "orientation", prefer: ["Axial", "Coronal"] }] })).toBe("A near tie goes to mr_acquisition_type 3D first, then orientation Axial, Coronal first");
    expect(opWords({ op: "set_runner_up_within", within: 0.02 })).toBe("A near tie is within 2 %");
  });
});

describe("an operation back in its form", () => {
  it("rebuilds every operation of the contract's example as it was written", async () => {
    const { formOfOp } = await import("./ruleOps");
    const ops: Record<string, unknown>[] = [
      { op: "add_words", axis: "post_contrast", value: "given", words: ["mdc", " gd"], field: "series_description", scope: "site:partner" },
      { op: "remove_words", bucket: "localizer_words", words: ["loc"], scope: "dataset:a,b" },
      { op: "move_set", set: "symri", before: "technique", scope: "pack" },
      { op: "move_rule", rule: "technique/MS-EPI", position: "first", scope: "pack" },
      { op: "set_priority", axis: "modifier", value: "IR", priority: 5, scope: "scanner:model=Prisma" },
      { op: "add_value", axis: "technique", value: "ZZ-GRE", label: "ZZGRE", family: "GRE", words: ["zzgre"], after: "MPRAGE", bids: { acq: "ZZGRE" }, scope: "pack" },
      { op: "add_rule", axis: "base", value: "T2w", when: [{ tag: "te", ge: 200 }, { tag: "tr", ge: 4000 }, { not: { axis: "directory_type", is: "localizer" } }], position: "last", scope: "pack" },
      { op: "add_rule", axis: "role", nothing: true, when: { axis: "technique", is: "TOF-MRA" }, scope: "pack" },
      { op: "silence", axis: "base", when: { axis: "provenance", is: "Calibration" }, scope: "batch:12" },
      { op: "by_model", axis: "post_contrast", scope: "pack" },
      { op: "map_name", axis: "technique", value: "MPRAGE", bids: "MPR", scope: "pack" },
      { op: "set_candidates", role: "t1w", unless: [{ axis: "body_part", is: ["spine", "neck", "chest", "other"] }], scope: "pack" },
      { op: "remove_border", border: "rare", scope: "pack" },
      { op: "set_near_tie", order: [{ of: "mr_acquisition_type", prefer: ["3D"] }, { of: "series_number", lowest: true, roles: ["t1w"] }], scope: "pack" },
      { op: "set_runner_up_within", within: 0.02, scope: "pack" },
    ];
    for (const op of ops) {
      const back = formOfOp(op)!;
      const built = buildOp(back.form, back.scope, "why", "e");
      expect(built.missing, String(op.op)).toEqual([]);
      expect(built.op, String(op.op)).toEqual({ ...op, reason: "why", evidence: "e" });
    }
    expect(formOfOp({ op: "rename_axis" })).toBeNull();
  });
});
