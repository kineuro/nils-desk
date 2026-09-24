// SPDX-License-Identifier: AGPL-3.0-only
// The Models section (record 45 S6): models by task and slot with the
// promoted one first, one model's card, encoders, label set and history, the
// acts its state and the person's grants leave open, a check whose passed
// its rows decide, and a refusal shown in the engine's own words.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { capsWith } from "../review/caps.fixture";
import { byTask, checkOf, encodersOf, fittedBy, modelActs, openActs, promotedBeside, refusedModels, trainedOn, type Model } from "./client";
import { engineWords, ModelBody, ModelsBody, MoveDialog, RunsFitted } from "./ModelsPage";

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
const DOORS = ["GET /api/models", "POST /api/models", "POST /api/models/{id}/admit", "POST /api/models/{id}/promote", "POST /api/models/{id}/retire", "GET /api/review", "GET /api/pipeline-runs"];

describe("models by task", () => {
  it("group by task and slot, the promoted one first, then by state", () => {
    const t = byTask(LIST);
    expect(t.map((x) => [x.task, x.slot, x.promoted?.id ?? null, x.others.map((m) => m.id)])).toEqual([
      ["axis:body_part", "site", 3, [4, 2]],
      ["axis:body_part", "cohort:north", null, [5]],
      ["embed:image", "site", 1, []],
    ]);
  });
  it("draw each task with what answers it and a link to each model", () => {
    const html = renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS, [...WORK])} list={LIST} onChanged={() => undefined} />);
    expect(html).toContain("<h2>axis:body_part</h2>");
    expect(html).toContain("slot site · bodypart-head@2 answers");
    expect(html).toContain("slot cohort:north · nothing promoted");
    expect(html).toContain('href="#models/model/4"');
    expect(html).toContain(">Register</button>");
    expect(renderToStaticMarkup(<ModelsBody caps={capsWith(DOORS, ["models:see"])} list={LIST} onChanged={() => undefined} />)).not.toContain(">Register</button>");
  });
});

describe("one model", () => {
  it("reads its label set and encoders from the card", () => {
    const m = LIST[3];
    expect(trainedOn(m)).toEqual({ digest: D("b"), name: "body_part", rows: 412, sealed: null });
    expect(encodersOf(m)).toEqual([{ id: 1, words: "biomedclip@1" }]);
    expect(promotedBeside(m, LIST)?.id).toBe(3);
  });
  it("offers admit and promote on a registered model, promote on an admitted one, nothing on a retired one", () => {
    expect(openActs({ state: "registered" })).toEqual({ admit: true, promote: true, retire: true });
    expect(openActs({ state: "admitted" })).toEqual({ admit: false, promote: true, retire: true });
    expect(openActs({ state: "retired" })).toEqual({ admit: false, promote: false, retire: false });
    expect(modelActs(capsWith(DOORS, ["models:see"]))).toMatchObject({ register: false, admit: false, promote: false, retire: false });
  });
  it("draws the card, the history and the acts, and links its proposals only where Review is served", () => {
    const html = renderToStaticMarkup(<ModelBody caps={capsWith(DOORS, [...WORK])} m={LIST[3]} list={LIST} onChanged={() => undefined} />);
    expect(html).toContain("<h1>bodypart-head@3</h1>");
    expect(html).toContain("body_part · sha256:bbbbbbbbbbbb · 412 rows");
    expect(html).toContain('<a href="#models/model/1">biomedclip@1</a>');
    expect(html).toContain("registered by run 12");
    expect(html).toContain(">Admit</button>");
    expect(html).toContain(">Promote</button>");
    expect(html).toContain('href="#review/proposals"');
    const noReview = renderToStaticMarkup(<ModelBody caps={capsWith(DOORS.filter((d) => d !== "GET /api/review"), [...WORK])} m={LIST[3]} list={LIST} onChanged={() => undefined} />);
    expect(noReview).not.toContain("#review");
  });
  it("says in the promotion's panel which model it retires, and that the model is not admitted yet", () => {
    const html = renderToStaticMarkup(<MoveDialog act="promote" m={LIST[3]} list={LIST} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("bodypart-head@3 answers axis:body_part in slot site. bodypart-head@2, promoted there now, is retired. It is not admitted yet.");
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
