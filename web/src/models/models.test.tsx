// SPDX-License-Identifier: AGPL-3.0-only
// Models under Pipelines (record 45 S6; record 55 D4, spec section 10.2):
// each task's models side by side with the chosen one marked and why, the
// card's tested claims, speeds, GPU need and equivalence, the choice and the
// way back to the default after a panel, one model's card, encoders, label
// set and history, the acts its state and the person's grants leave open, a
// check whose passed its rows decide, and a refusal in the engine's words.
// Record 55 ruling 22 (b): the certificate that names a model, and a
// certificate that cites its graded run recorded by a person.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { capsWith } from "../review/caps.fixture";
import { moved, parse } from "../routes";
import { byTask, certifiedWords, certifyAct, checkOf, choosable, chosenOf, chosenWords, citeBody, EMPTY_FORM, textOf, encodersOf, equivalenceWords, fittedBy, gpuOf, missingWords, modelActs, openActs, percentWords, rateWords, refusedModels, speedOf, tasksOf, testedOf, trainedOn, type Certificate, type Model, type TaskEntry } from "./client";
import { CertificateFacts, CertifyDialog, ChooseDialog, claimWords, engineWords, ModelBody, ModelCard, ModelsBody, MoveDialog, RunsFitted } from "./ModelsPage";

const D = (c: string) => `sha256:${c.repeat(64)}`;

function model(id: number, name: string, state: Model["state"], over: Partial<Model> = {}): Model {
  return {
    id,
    name,
    version: "1",
    kind: "head",
    digest: D(String(id % 10)),
    task: "axis:body_part",
    slot: "site",
    state,
    card: { name, version: "1", kind: "head", digest: D(String(id % 10)), task: "axis:body_part", encoders: [{ digest: D("a"), name: "biomedclip", version: "1" }], trained_on: { label_set: D("b"), name: "body_part", rows: 412 } },
    encoder_model_ids: [1],
    threshold: 0.7,
    registered_by: "astrid",
    registered_at: "2026-09-24T09:00:00Z",
    ...over,
  };
}

const LIST = [
  model(1, "biomedclip", "promoted", { kind: "encoder", task: "embed:image", card: { name: "biomedclip" }, encoder_model_ids: [] }),
  model(2, "bodypart-head", "retired"),
  model(3, "bodypart-head", "promoted", { version: "2" }),
  model(4, "bodypart-head", "registered", { version: "3", events: [{ transition: "registered", by: "run 12", at: "2026-09-24T09:00:00Z" }] }),
  model(5, "bodypart-head", "admitted", { version: "4", slot: "cohort:north" }),
];

const WORK = ["models:see", "models:work", "review:see", "pipelines:see"] as const;
const DOORS = ["GET /api/models", "GET /api/models/tasks", "POST /api/models/choose", "POST /api/models", "POST /api/models/{id}/admit", "POST /api/models/{id}/promote", "POST /api/models/{id}/retire", "GET /api/review", "GET /api/pipeline-runs"];

describe("models by task", () => {
  it("group by task and slot, the promoted one first, then by state", () => {
    const t = byTask(LIST);
    expect(t.map((x) => [x.task, x.slot, x.promoted?.id ?? null, x.others.map((m) => m.id)])).toEqual([
      ["axis:body_part", "site", 3, [4, 2]],
      ["axis:body_part", "cohort:north", null, [5]],
      ["embed:image", "site", 1, []],
    ]);
  });
  it("draw each task with what answers it and a link to each model under Pipelines", () => {
    const html = renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS, [...WORK])} list={LIST} onChanged={() => undefined} />);
    expect(html).toContain("<h2>axis:body_part</h2>");
    expect(html).toContain("bodypart-head@2 answers · promoted last");
    expect(html).toContain("slot cohort:north · bodypart-head@4 answers · newest admitted");
    expect(html).toContain('href="#pipelines/models/4"');
    expect(html).toContain(">Register</button>");
    expect(renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS, ["models:see"])} list={LIST} onChanged={() => undefined} />)).not.toContain(">Register</button>");
  });
});

// the card of record 55 D4 as the engine answers it, with what it lacks and what an admission measured
const CASCADE = model(7, "bodypart-cascade", "admitted", {
  version: "r7-fast",
  kind: "pass",
  complete: true,
  missing: [],
  chosen: true,
  equivalence_measured: { class: "I", tolerance: 0.001, n: 2453, changes: 0, flips: 0, max_difference: 0, set: "block-1" },
  card: {
    name: "bodypart-cascade",
    tested: [
      { claim: "fine E1 against the certified model", value: 0.99746, bound: 0.99674, n: 17709, evidence: "ims-a522a-bp" },
      { claim: "coarse E1 against the certified model", value: 0.99836, bound: 0.99777, n: 17709, evidence: "ims-a522a-bp" },
    ],
    speed: { cpu: { stacks_per_second: 34.3, hardware: "64 cores", evidence: "ims-a523e-bp" }, gpu: { stacks_per_second: 117.2, hardware: "one 96 GB card", evidence: "ims-a523e-bp" } },
    gpu: "optional",
    equivalence: { class: "I", tolerance: 0.001, set: "four blocks", evidence: "ims-a523e-bp" },
    trained_on: { label_set: D("c"), name: "bodypart-gold-r7", rows: 3659 },
  },
});
const HEAD = model(8, "bodypart-fusion", "promoted", { version: "r7", complete: false, missing: ["speed", "equivalence"], chosen: false, card: { gpu: "none", trained_on: { label_set: D("c"), name: "bodypart-gold-r7" } } });
const ENTRY: TaskEntry = { task: "axis:body_part", slot: "site", chosen: { model_id: 7, by: "site", chosen_by: "astrid", chosen_at: "2026-10-13T10:00:00Z", why: "the fast path" }, models: [HEAD, CASCADE] };

describe("several models per task, one chosen", () => {
  it("read the tasks from the engine where it serves them, newest first, the site slot first", () => {
    const t = tasksOf([], [{ ...ENTRY, slot: "cohort:north" }, ENTRY]);
    expect(t.map((x) => [x.slot, x.models.map((m) => m.id)])).toEqual([
      ["site", [8, 7]],
      ["cohort:north", [8, 7]],
    ]);
    expect(chosenOf(ENTRY)?.id).toBe(7);
  });
  it("fall back to the list where the engine has no tasks door, the model it marks chosen answering", () => {
    const t = tasksOf([HEAD, CASCADE]);
    expect(t).toHaveLength(1);
    expect(t[0].chosen).toEqual({ model_id: 7, by: "admitted" });
  });
  it("say why the chosen model answers", () => {
    expect(chosenWords(ENTRY.chosen)).toBe("chosen by astrid");
    expect(chosenWords({ model_id: 7, by: "certificate", certificate_id: 3 })).toBe("certificate 3");
    expect(chosenWords({ model_id: 7, by: "promoted" })).toBe("promoted last");
    expect(chosenWords({ model_id: 7, by: "admitted" })).toBe("newest admitted");
    expect(chosenWords(null)).toBe("nothing answers");
    expect([choosable({ state: "admitted" }), choosable({ state: "promoted" }), choosable({ state: "registered" }), choosable({ state: "retired" })]).toEqual([true, true, false, false]);
  });
  it("read the card's claims, speeds, GPU need and equivalence, and what it lacks", () => {
    expect(testedOf(CASCADE)[0]).toEqual({ claim: "fine E1 against the certified model", value: "0.99746", bound: "0.99674", n: 17709, evidence: "ims-a522a-bp" });
    expect(claimWords(testedOf(CASCADE)[0])).toBe("fine E1 against the certified model 0.99746 (bound 0.99674) · ims-a522a-bp");
    expect(speedOf(CASCADE).gpu).toEqual({ rate: 117.2, hardware: "one 96 GB card", evidence: "ims-a523e-bp" });
    expect(rateWords(speedOf(CASCADE).cpu)).toBe("34.3 stacks/s");
    expect(rateWords(speedOf(HEAD).cpu)).toBe("not stated");
    expect(gpuOf(CASCADE)).toBe("optional");
    expect(equivalenceWords(CASCADE)).toBe("class I stated · I measured");
    expect(equivalenceWords(HEAD)).toBe("CPU only");
    expect(missingWords(CASCADE)).toBeNull();
    expect(missingWords(HEAD)).toBe("missing speed, equivalence");
  });
  it("draw the chosen model by its border and the only coloured key, and offer Choose on another that answers", () => {
    const on = renderToStaticMarkup(<ModelCard m={CASCADE} chosen={true} />);
    expect(on).toContain('class="model-card on"');
    expect(on).toContain('<span class="tag brand">answers</span>');
    expect(on).toContain("34.3 stacks/s");
    expect(on).toContain("117.2 stacks/s · optional");
    expect(on).toContain("card complete");
    const other = renderToStaticMarkup(<ModelCard m={HEAD} chosen={false} onChoose={() => undefined} />);
    expect(other).toContain('class="model-card"');
    expect(other).not.toContain("tag brand");
    expect(other).toContain("missing speed, equivalence");
    expect(other).toContain(">Choose</button>");
  });
  it("offer the choice and the way back to the default only to an admin where the engine serves the door", () => {
    const admin = renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS, [...WORK])} list={[]} tasks={[ENTRY]} onChanged={() => undefined} />);
    expect(admin).toContain("bodypart-cascade@r7-fast answers · chosen by astrid");
    expect(admin).toContain(">Back to default</button>");
    expect(admin).toContain(">Choose</button>");
    const seeing = renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS, ["models:see"])} list={[]} tasks={[ENTRY]} onChanged={() => undefined} />);
    expect(seeing).not.toContain(">Choose</button>");
    expect(seeing).not.toContain("Back to default");
    const older = renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS.filter((d) => d !== "POST /api/models/choose"), [...WORK])} list={[]} tasks={[ENTRY]} onChanged={() => undefined} />);
    expect(older).not.toContain(">Choose</button>");
  });
  it("say in the panel what a choice changes, and what the default is", () => {
    const html = renderToStaticMarkup(<ChooseDialog t={ENTRY} m={HEAD} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("bodypart-fusion@r7 answers axis:body_part, instead of bodypart-cascade@r7-fast. Past answers keep naming their model.");
    const back = renderToStaticMarkup(<ChooseDialog t={ENTRY} m={null} onClose={() => undefined} onDone={() => undefined} />);
    expect(back).toContain("The certified model answers axis:body_part, else the one promoted last, else the newest admitted.");
    expect(back).toContain(">Use the default</button>");
  });
  it("lead an old Models address to its page under Pipelines", () => {
    expect(moved(parse("#models"))).toBe("#pipelines/models");
    expect(moved(parse("#models/model/3"))).toBe("#pipelines/models/3");
    expect(moved(parse("#models/by-task"))).toBe("#pipelines/models");
    expect(moved(parse("#pipelines/models/3"))).toBeNull();
  });
});

describe("one model", () => {
  it("reads its label set and encoders from the card", () => {
    const m = LIST[3];
    expect(trainedOn(m)).toEqual({ digest: D("b"), name: "body_part", rows: 412, sealed: null });
    expect(encodersOf(m)).toEqual([{ id: 1, words: "biomedclip@1" }]);
  });
  it("offers admit and promote on a registered model, promote on an admitted one, nothing on a retired one", () => {
    expect(openActs({ state: "registered" })).toEqual({ admit: true, promote: true, retire: true });
    expect(openActs({ state: "admitted" })).toEqual({ admit: false, promote: true, retire: true });
    expect(openActs({ state: "retired" })).toEqual({ admit: false, promote: false, retire: false });
    expect(modelActs(capsWith(DOORS, ["models:see"]))).toMatchObject({ register: false, admit: false, promote: false, retire: false });
  });
  it("draws the card, the history and the acts, and links its proposals only where Review is served", () => {
    const html = renderToStaticMarkup(<ModelBody caps={capsWith(DOORS, [...WORK])} m={LIST[3]} onChanged={() => undefined} />);
    expect(html).toContain("<h1>bodypart-head@3</h1>");
    expect(html).toContain("body_part · sha256:bbbbbbbbbbbb · 412 rows");
    expect(html).toContain('<a href="#pipelines/models/1">biomedclip@1</a>');
    expect(html).toContain("registered by run 12");
    expect(html).toContain(">Admit</button>");
    expect(html).toContain(">Promote</button>");
    expect(html).toContain('href="#review/proposals"');
    const noReview = renderToStaticMarkup(<ModelBody caps={capsWith(DOORS.filter((d) => d !== "GET /api/review"), [...WORK])} m={LIST[3]} onChanged={() => undefined} />);
    expect(noReview).not.toContain("#review");
  });
  it("says in the promotion's panel that it retires nothing, and that the model is not admitted yet", () => {
    const html = renderToStaticMarkup(<MoveDialog act="promote" m={LIST[3]} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("bodypart-head@3 is promoted in axis:body_part. Nothing is retired; the model chosen there keeps answering. It is not admitted yet.");
  });
  it("draws the card's new fields on the model's own page", () => {
    const html = renderToStaticMarkup(<ModelBody caps={capsWith(DOORS, [...WORK])} m={CASCADE} onChanged={() => undefined} />);
    expect(html).toContain("answers its task");
    expect(html).toContain("CPU 34.3 stacks/s on 64 cores · GPU 117.2 stacks/s on one 96 GB card");
    expect(html).toContain("class I stated · I measured");
    expect(html).toContain("<h2>Tested</h2>");
    expect(html).toContain("ims-a522a-bp");
    expect(html).toContain("bodypart-gold-r7");
  });
});

describe("the lifecycle's words", () => {
  it("builds a check whose passed its rows decide", () => {
    expect(checkOf(" heldout ", [{ name: "ece", passed: true, value: "0.04", threshold: "0.05" }, { name: "", passed: false, value: "", threshold: "" }])).toEqual({ suite: "heldout", passed: true, checks: [{ name: "ece", passed: true, value: 0.04, threshold: 0.05 }] });
    expect(checkOf("heldout", [{ name: "ece", passed: false, value: "0.2", threshold: "0.05" }]).passed).toBe(false);
    expect(checkOf("heldout", []).passed).toBe(false);
  });
  it("shows a refusal as the engine said it", () => {
    const said = "model 4 (bodypart-head@3) is registered and not admitted: a promotion needs a recorded check that passed (nils model admit)";
    expect(engineWords(new DoorError(409, { error: said }))).toBe(said);
    expect(engineWords(new DoorError(500, {}))).toBe("the engine answered 500");
  });
  it("lists what runs fitted, registered by the run or refused in the engine's words", () => {
    const run = { id: 12, pipeline: "bodypart-train@1", status: "done", started_at: null, finished_at: null, summary: { models: [{ output: "head", model: "bodypart-head@3", derivative: 88, encoders: [1], trained_on: D("b") }], refused_files: [{ output: "extra", why: "the run wrote no model" }, { unit: "stack-9", why: "outside the output folder" }] } };
    expect(fittedBy(run).map((f) => f.model)).toEqual(["bodypart-head@3"]);
    expect(refusedModels(run)).toEqual(["extra: the run wrote no model"]);
    const html = renderToStaticMarkup(<RunsFitted runs={[run]} />);
    expect(html).toContain("run 12 · bodypart-train@1");
    expect(html).toContain("bodypart-head@3 registered");
    expect(html).toContain("extra: the run wrote no model");
  });
});

// record 55 ruling 22 (b): a certificate that cites the graded run, as the engine answers it
const CITED: Certificate = {
  id: 4,
  sample: "evidence:s1-grade-7",
  model_ids: [9],
  result: { bar: 0.01, n: 5482, errors: 1, confidence: 0.95, bound: 0.0008650574506395371, method: "exact one-sided Clopper-Pearson", passes: true, coverage: 0.892, test: "T19" },
  created_by: "astrid",
  created_at: "2026-10-14T18:00:00Z",
  cites: "evidence",
  evidence: { run: "s1-grade-7", manifest_sha256: D("7"), plan_commit: "83a75e5875ce", model_digest: D("9"), equivalence: { run: "s1-serve-2", manifest_sha256: D("6"), class: "I" } },
  unseals: false,
  words: "certificate 4 cites the graded run s1-grade-7 (manifest sha256:777777777777, plan 83a75e5875ce): 1 of 5482 wrong, bound 0.087 % at bar 1.00 %",
};
const S1 = model(9, "s1c", "admitted", { version: "allow-2", kind: "pass", task: "system1", digest: D("9"), certificate: CITED, card: { name: "s1c", gpu: "none" } });
const S1_NEXT = model(10, "s1c", "admitted", { version: "allow-3", kind: "pass", task: "system1", digest: D("a"), card: { name: "s1c", gpu: "none" } });
const CERT_DOORS = [...DOORS, "POST /api/certificates", "GET /api/models/{id}"];

describe("a certificate that cites its graded run", () => {
  it("builds the door's body from the fields, the digest the model's own, and names the fields still wrong", () => {
    const f = { ...EMPTY_FORM, run: " s1-grade-7 ", manifest: `SHA256:${"7".repeat(64)}`, commit: "83A75E5", bar: "0.01", n: "5482", errors: "1", bound: "0.000865", coverage: "0.892", test: " T19 ", claim: "" };
    expect(citeBody(S1_NEXT, f)).toEqual({
      body: {
        models: [10],
        evidence: { run: "s1-grade-7", manifest_sha256: D("7"), plan_commit: "83a75e5", model_digest: D("a") },
        result: { bar: 0.01, n: 5482, errors: 1, bound: 0.000865, coverage: 0.892, test: "T19" },
      },
    });
    expect(citeBody(S1_NEXT, EMPTY_FORM)).toEqual({ wrong: ["run", "manifest sha256", "plan commit", "graded", "wrong"] });
    expect(citeBody(S1_NEXT, { ...f, errors: "6000", coverage: "1.5", commit: "abc" })).toEqual({ wrong: ["plan commit", "wrong", "coverage"] });
    // a repackaged artifact cites the run that showed it answers the same
    const served = citeBody(S1_NEXT, { ...f, eqRun: "s1-serve-2", eqManifest: "6".repeat(64), eqClass: "I" });
    expect("body" in served && served.body.evidence).toEqual({ run: "s1-grade-7", manifest_sha256: D("7"), plan_commit: "83a75e5", model_digest: D("a"), equivalence: { run: "s1-serve-2", manifest_sha256: D("6"), class: "I" } });
    expect(citeBody(S1_NEXT, { ...f, eqRun: "s1-serve-2" })).toEqual({ wrong: ["served as sha256", "class"] });
  });
  it("says what a certificate certified, the graded run or the sealed sample", () => {
    expect(certifiedWords(CITED)).toBe("s1-grade-7 · 1 of 5,482 wrong · bound 0.087 %");
    expect(certifiedWords({ ...CITED, cites: "sample", evidence: null, sample: "selection:sealed@1", result: { sample: "selection:sealed@1", risk: 0.05, n: 300, errors: 0 } })).toBe("selection:sealed@1 · 0 of 300 wrong · risk 5 %");
    expect(percentWords(0.01)).toBe("1 %");
    expect(percentWords(undefined)).toBe("?");
  });
  it("shows a model as certified on its card, with the run it cites, and says where none names it", () => {
    const on = renderToStaticMarkup(<ModelCard m={S1} chosen={true} />);
    expect(on).toContain("<dt>certified</dt>");
    expect(on).toContain("s1-grade-7 · 1 of 5,482 wrong · bound 0.087 %");
    expect(renderToStaticMarkup(<ModelCard m={{ ...S1_NEXT, certificate: null }} chosen={false} />)).toContain("no certificate");
    // an engine that does not say: no line at all
    expect(renderToStaticMarkup(<ModelCard m={S1_NEXT} chosen={false} />)).not.toContain("<dt>certified</dt>");
  });
  it("draws the citation on the model's page: the run, its manifest, the plan's commit, the artifact and what it found", () => {
    const html = renderToStaticMarkup(<ModelBody caps={capsWith(CERT_DOORS, [...WORK])} m={S1} onChanged={() => undefined} />);
    expect(html).toContain("<h2>Certified</h2>");
    expect(html).toContain("certificate 4 · astrid");
    expect(html).toContain("<dd>s1-grade-7</dd>");
    expect(html).toContain("sha256:777777777777");
    expect(html).toContain("83a75e5875ce");
    expect(html).toContain("s1-serve-2 · class I");
    expect(html).toContain("1 of 5,482 wrong · bound 0.087 % · bar 1 % · coverage 89.2 %");
    expect(html).toContain(">Record a certificate</button>");
    expect(renderToStaticMarkup(<ModelBody caps={capsWith(CERT_DOORS, [...WORK])} m={S1_NEXT} onChanged={() => undefined} />)).not.toContain("<h2>Certified</h2>");
  });
  it("offers Record a certificate under models:work where the engine serves the door, never on a retired model", () => {
    expect(certifyAct(capsWith(CERT_DOORS, [...WORK]))).toBe(true);
    expect(certifyAct(capsWith(CERT_DOORS, ["models:see"]))).toBe(false);
    expect(certifyAct(capsWith(DOORS, [...WORK]))).toBe(false);
    expect(renderToStaticMarkup(<ModelBody caps={capsWith(CERT_DOORS, ["models:see"])} m={S1} onChanged={() => undefined} />)).not.toContain("Record a certificate");
    expect(renderToStaticMarkup(<ModelBody caps={capsWith(CERT_DOORS, [...WORK])} m={{ ...S1, state: "retired" }} onChanged={() => undefined} />)).not.toContain("Record a certificate");
  });
  it("asks for the graded run's fields and says the person rule, recording nothing until they are right", () => {
    const html = renderToStaticMarkup(<CertifyDialog m={S1_NEXT} onClose={() => undefined} onDone={() => undefined} />);
    for (const field of ["Graded run", "Manifest sha256", "Plan commit", "Bar", "Graded", "Wrong", "Bound", "Coverage", "Test", "Claim", "Served as run", "Served as sha256", "Class"]) expect(html).toContain(`aria-label="${field}"`);
    expect(html).toContain("for artifact sha256:aaaaaaaaaaaa");
    expect(html).toContain("Yours alone, under your sign-in: it unseals nothing, so no second person is needed.");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Record<\/button>/u);
  });
});

describe("a certificate as the engine may send it", () => {
  it("draws a citation that lacks a field, or holds one that is not text, without failing", () => {
    const odd = { ...CITED, evidence: { run: 7, manifest_sha256: null, model_digest: D("9") } as unknown as Certificate["evidence"] };
    const html = renderToStaticMarkup(<CertificateFacts m={{ ...S1, certificate: odd }} />);
    expect(html).toContain("<h2>Certified</h2>");
    expect(html).toContain("<dt>plan</dt><dd>?</dd>");
    expect(html).toContain("<dt>graded run</dt><dd>?</dd>");
    expect(certifiedWords(odd)).toBe("1 of 5,482 wrong · bound 0.087 %");
    expect([textOf("a"), textOf(""), textOf(3), textOf(null)]).toEqual(["a", null, null, null]);
  });
  it("takes counts as digits only, and a bound between 0 and 1", () => {
    const f = { ...EMPTY_FORM, run: "r1", manifest: "7".repeat(64), commit: "83a75e5", n: "5482", errors: "1" };
    expect("body" in citeBody(S1_NEXT, f)).toBe(true);
    for (const [n, errors] of [["0x10", "1"], ["1e3", "1"], ["5482", "-1"], ["5482", "1.0"], [" 54 82", "1"]]) {
      expect(citeBody(S1_NEXT, { ...f, n, errors })).toHaveProperty("wrong");
    }
    expect(citeBody(S1_NEXT, { ...f, bound: "1.5" })).toEqual({ wrong: ["bound"] });
    expect(citeBody(S1_NEXT, { ...f, bound: "-0.1" })).toEqual({ wrong: ["bound"] });
    // shares are plain decimals: no exponent, hex, sign or Infinity
    for (const v of ["8.65e-4", "0x1", "+0.5", "Infinity", "1.2.3"]) {
      expect(citeBody(S1_NEXT, { ...f, bound: v, coverage: v })).toEqual({ wrong: ["bound", "coverage"] });
    }
    expect(citeBody(S1_NEXT, { ...f, bar: "1e-2" })).toEqual({ wrong: ["bar"] });
    expect("body" in citeBody(S1_NEXT, { ...f, bound: ".000865", coverage: "0.892" })).toBe(true);
  });
});
