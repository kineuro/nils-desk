// SPDX-License-Identifier: AGPL-3.0-only
// Models under Pipelines (record 45 S6; record 55 D4, spec section 10.2):
// each task's models side by side with the chosen one marked and why, the
// card's tested claims, speeds, GPU need and equivalence, the choice and the
// way back to the default after a panel, one model's card, encoders, label
// set and history, the acts its state and the person's grants leave open, a
// check whose passed its rows decide, and a refusal in the engine's words.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { capsWith } from "../review/caps.fixture";
import { moved, parse } from "../routes";
import { byTask, checkOf, choosable, chosenOf, chosenWords, encodersOf, equivalenceWords, fittedBy, gpuOf, missingWords, modelActs, openActs, rateWords, refusedModels, speedOf, tasksOf, testedOf, trainedOn, type Model, type TaskEntry } from "./client";
import { ChooseDialog, claimWords, engineWords, ModelBody, ModelCard, ModelsBody, MoveDialog, RunsFitted } from "./ModelsPage";

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
