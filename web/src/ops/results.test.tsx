// SPDX-License-Identifier: AGPL-3.0-only
// A finished run and what it made (2026-10-13): a pipeline run's job opens
// its run, a catalog row says its newest run and opens it, a run's whole row
// opens it, and on a run's page each unit with a mask offers View, which
// draws the mask over the scan its grid is on, with the unit's files by name,
// kind and size. The shapes are the engine's answers to `GET
// /api/derivatives?run=` for a SAMSEG run (a label map with a lesions set
// and a structures set, and a table, per session); every name is made up.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { capsWith } from "../review/caps.fixture";
import type { Pipeline, Run } from "./catalog";
import { CatalogBody } from "./Catalog";
import { Card } from "./PipelinesPage";
import { cardOf } from "./pipelines";
import { RunView } from "./RunPage";
import { maskOf, ResultView, resultHref } from "./RunResult";
import { drawable, fileName, filesByUnit, lastRunOf, lastRunWords, layersOf, layerWords, runOfJob, shortName, sizeWords, unitOfFile, viewableUnits, viewActs } from "./results";
import type { Derivative, RunDetail } from "./runs";
import { DEFAULT_LOOK } from "../viewer/maskLook";
import { PLAN_STARTER, Starters } from "../assistant/Starters";

const LAYER = "GET /api/derivatives/{id}/layers/{stack}/{set}/manifest";
const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "GET /api/derivatives", LAYER, "GET /api/jobs", "POST /api/jobs"];
const SEE = capsWith(DOORS, ["pipelines:see"]);

const UNITS = ["sub-7a8b_ses-1", "sub-9c0d_ses-2", "sub-1e2f_ses-1"];
const NAMES = { "2": "Left-Cerebral-White-Matter", "3": "Left-Cerebral-Cortex", "41": "Right-Cerebral-White-Matter", "259": "Skull" };
const dir = (u: string) => `derivatives/samseg-lesions/9/${u}/${u.split("_")[0]}/${u.split("_")[1]}/anat`;
const mask = (id: number, u: string, stack: number): Derivative => ({
  id,
  kind: "mask",
  scope: "session",
  bytes: 101_426,
  sha256: "a".repeat(64),
  media_type: "application/x-nifti+gzip",
  path: `${dir(u)}/${u}_acq-T1w_desc-samseg_dseg.nii.gz`,
  check: null,
  grid_link: "same",
  grid_stack_id: stack,
  part_sets: [
    { key: "lesions", words: "Lesions", kind: "components", count: 8 },
    { key: "structures", words: "Structures", kind: "labels", count: 36, names: NAMES },
  ],
});
const table = (id: number, u: string): Derivative => ({ id, kind: "table", scope: "session", bytes: 1457, sha256: "b".repeat(64), media_type: "application/json", path: `${dir(u)}/${u}_acq-T1w_desc-samseg_volumes.json` });
// the third session made its table alone; a run's own file names no unit
const FILES: Derivative[] = [mask(11, UNITS[0], 18), table(12, UNITS[0]), mask(13, UNITS[1], 23), table(14, UNITS[1]), table(15, UNITS[2]), { ...table(16, "x"), path: "derivatives/samseg-lesions/9/summary.json" }];

const unit = (u: string) => ({ unit: u, state: "over", status: "succeeded", attempts: 1, device: "cpu", exit_code: 0, started_at: "2026-10-12T10:00:00Z", finished_at: "2026-10-12T10:20:00Z" });
const RUN: RunDetail = {
  id: 9,
  pipeline_id: 3,
  pipeline: "samseg-lesions@3",
  job_id: 73,
  selection: "main@dataset:study-anon",
  status: "done",
  started_at: "2026-10-12T10:00:00Z",
  finished_at: "2026-10-12T10:40:00Z",
  summary: { units: { total: 3, succeeded: 3 } },
  made: { units: 3, made: 3, failed: 0, skipped: 0, left: 0, nothing: false, line: "3 of 3 made", why: [] },
  units_run: UNITS.map(unit),
};

describe("a pipeline run's job opens its run", () => {
  const job = (more: Partial<JobRow>): JobRow => ({ id: 73, kind: "pipeline", name: "samseg-lesions@3", state: "done", started_at: "2026-10-12T10:00:00Z", finished_at: "2026-10-12T10:40:00Z", heartbeat_at: null, progress: null, error: null, args: {}, result: null, ...more }) as JobRow;

  it("finds the run in the job's result, its arguments or its progress, and none for another verb", () => {
    expect(runOfJob(job({ result: { run: 4 } }))).toBe(4);
    expect(runOfJob(job({ args: { run: 5 } }))).toBe(5);
    expect(runOfJob(job({ state: "running", progress: { run: 6, units: 4, over: 1 } }))).toBe(6);
    expect(runOfJob(job({}))).toBeNull();
    expect(runOfJob(job({ kind: "digest", name: "spring", args: { run: 7 } }))).toBeNull();
  });
  it("draws Open run on the card, in Now and in All jobs alike, beside Dismiss", () => {
    const j = job({ result: { run: 4, status: "done", summary: { units: { total: 4, succeeded: 4 } } }, made: { units: 4, made: 4, failed: 0, skipped: 0, left: 0, nothing: false, line: "4 of 4 made", why: [] } } as Partial<JobRow>);
    const html = renderToStaticMarkup(<Card card={cardOf(j)} reason={null} open="#pipelines/runs/4" onCancel={null} onNext={null} onDismiss={() => undefined} />);
    expect(html).toContain("samseg-lesions@3: 4 of 4 made");
    expect(html).toMatch(/<a class="button secondary small" href="#pipelines\/runs\/4">Open run<\/a><button type="button" class="button quiet small">Dismiss<\/button>/u);
    // the whole card opens the run, Open run its way by the keyboard
    expect(html).toMatch(/^<div class="job done openable">/u);
    const plain = renderToStaticMarkup(<Card card={cardOf(j)} reason={null} onCancel={null} onNext={null} onDismiss={null} />);
    expect(plain).not.toContain("Open run");
    expect(plain).toMatch(/^<div class="job done">/u);
  });
});

describe("the catalog says each pipeline's newest run", () => {
  const P: Pipeline = { id: 3, name: "samseg-lesions", version: "3", label: "samseg-lesions@3", image: `ghcr.io/kineuro/samseg@sha256:${"4b".repeat(32)}`, layout: "bids", level: "session", state: "active", standing: "current", outputs: [{ id: "lesions", kind: "mask" }] };
  const OLD: Pipeline = { ...P, id: 2, version: "2", label: "samseg-lesions@2", standing: "replaced" };
  const run = (id: number, pipeline: Pipeline, more: Partial<Run> = {}): Run => ({ id, pipeline_id: pipeline.id, pipeline: pipeline.label, job_id: id + 60, status: "done", started_at: "2026-10-12T10:00:00Z", finished_at: null, summary: { units: { total: 4, succeeded: 4 } }, ...more });
  const RUNS = [run(4, P, { made: { units: 4, made: 4, failed: 0, skipped: 0, left: 0, nothing: false, why: [] } } as Partial<Run>), run(3, OLD), run(2, OLD, { status: "failed" })];

  it("is the newest run of the name, any version, in one line with its state's colour", () => {
    expect(lastRunOf("samseg-lesions", RUNS, [P, OLD])?.id).toBe(4);
    expect(lastRunOf("samseg-lesions", [RUNS[2], RUNS[1]], [P, OLD])?.id).toBe(3);
    // a run of a version the catalog no longer lists is matched by its label
    expect(lastRunOf("samseg-lesions", [run(8, { ...P, id: 99 })], [P])?.id).toBe(8);
    expect(lastRunOf("n4", RUNS, [P, OLD])).toBeNull();
    expect(lastRunWords(RUNS[0], new Date("2026-10-13T09:00:00Z"))).toEqual({ words: "last run 4 · 4 of 4 made · 12 Oct", tone: "ok" });
    expect(lastRunWords(RUNS[2], new Date("2026-10-13T09:00:00Z")).tone).toBe("caution");
  });
  it("links the line to the run, and the Runs table's whole row opens it", () => {
    const html = renderToStaticMarkup(<CatalogBody caps={SEE} pipelines={[P, OLD]} capability={{ enabled: true }} runs={RUNS} onRun={() => undefined} />);
    expect(html).toMatch(/<a class="catalog-last ok" href="#pipelines\/runs\/4">last run 4 · 4 of 4 made · [^<]+<\/a>/u);
    expect(html.match(/<tr class="[^"]*openable" tabindex="0">/gu)?.length).toBe(3);
    // a person who cannot open a run reads the line, unlinked, and no row opens
    const plain = renderToStaticMarkup(<CatalogBody caps={capsWith(DOORS.filter((d) => d !== "GET /api/pipeline-runs/{id}"), ["pipelines:see"])} pipelines={[P]} capability={{ enabled: true }} runs={RUNS} onRun={() => undefined} />);
    expect(plain).toMatch(/<span class="catalog-last ok">last run 4/u);
    expect(plain).not.toContain("openable");
  });
});

describe("the assistant's plan is asked on the Assistant page (2026-10-13)", () => {
  it("is gone from the Catalog, which keeps Run on a selection, and begins from a starter where the station is served", () => {
    const P: Pipeline = { id: 3, name: "samseg-lesions", version: "3", label: "samseg-lesions@3", image: "x", layout: "bids", level: "session", state: "active" };
    const caps = { ...capsWith(DOORS, ["pipelines:see", "pipelines:work"]), assistant: { stations: [{ id: "analysis-plan" }] } } as unknown as typeof SEE;
    const html = renderToStaticMarkup(<CatalogBody caps={caps} pipelines={[P]} capability={{ enabled: true }} runs={[]} onRun={() => undefined} />);
    expect(html).not.toContain("Plan with the assistant");
    expect(html).toContain(">Run on a selection</button>");
    expect(renderToStaticMarkup(<Starters plan onPick={() => undefined} />)).toContain(`>${PLAN_STARTER.words}</button>`);
    expect(PLAN_STARTER.text).toBe("/plan ");
    expect(renderToStaticMarkup(<Starters onPick={() => undefined} />)).not.toContain(PLAN_STARTER.words);
  });
});

describe("a run's files by unit", () => {
  it("are a unit's where the path holds its folder, else its name begins the file's, and the run's own apart", () => {
    expect(unitOfFile(FILES[0], UNITS)).toBe(UNITS[0]);
    expect(unitOfFile({ path: `out/${UNITS[1]}_volumes.csv` }, UNITS)).toBe(UNITS[1]);
    // the longest name first: sub-7a8b_ses-10 is not sub-7a8b_ses-1's
    expect(unitOfFile({ path: "out/sub-7a8b_ses-10/a.nii.gz" }, ["sub-7a8b_ses-1", "sub-7a8b_ses-10"])).toBe("sub-7a8b_ses-10");
    const by = filesByUnit(FILES, UNITS);
    expect([...by.units.entries()].map(([u, fs]) => [u, fs.map((f) => f.id)])).toEqual([
      [UNITS[0], [11, 12]],
      [UNITS[1], [13, 14]],
      [UNITS[2], [15]],
    ]);
    expect(by.own.map((f) => f.id)).toEqual([16]);
  });
  it("name each file shortly, by the unit's words taken off its front, and say its size", () => {
    expect(fileName(FILES[0])).toBe("sub-7a8b_ses-1_acq-T1w_desc-samseg_dseg.nii.gz");
    expect(shortName(fileName(FILES[0]), UNITS[0])).toBe("acq-T1w_desc-samseg_dseg.nii.gz");
    expect(shortName("summary.json", null)).toBe("summary.json");
    expect(fileName({ id: 5, path: null })).toBe("file 5");
    expect([sizeWords(812), sizeWords(101_426), sizeWords(2_450_000), sizeWords(3_100_000_000)]).toEqual(["812 B", "101 KB", "2.5 MB", "3.1 GB"]);
  });
});

describe("View draws a unit's mask over its scan", () => {
  it("offers each part set of each mask on the scan its grid is on, a label map with its values", () => {
    const layers = layersOf(filesByUnit(FILES, UNITS).units.get(UNITS[0])!, UNITS[0]);
    expect(layers.map((l) => [l.derivative, l.stack, l.set, l.kind, l.count, l.max])).toEqual([
      [11, 18, "lesions", "components", 8, 8],
      [11, 18, "structures", "labels", 36, 259],
    ]);
    expect(layers[1].labels).toEqual([2, 3, 41, 259]);
    expect(layers.map((l) => layerWords(l, false))).toEqual(["Lesions 8", "Structures 36"]);
    expect(layerWords(layers[0], true)).toBe("Lesions 8 · acq-T1w_desc-samseg_dseg.nii.gz");
    // a mask read whole, and one whose scan is not known, which is never drawn
    expect(layersOf([{ ...FILES[0], part_sets: null }]).map((l) => [l.set, l.kind, l.max])).toEqual([["whole", "whole", 1]]);
    expect(drawable({ ...FILES[0], grid_link: "none" })).toBe(false);
    expect(drawable({ ...FILES[0], grid_stack_id: null })).toBe(false);
    expect(viewableUnits(FILES, UNITS)).toEqual([UNITS[0], UNITS[1]]);
  });
  it("is the check reader's mask: the layer on the scan, the look, each value's colour", () => {
    const [lesions, structures] = layersOf([FILES[0]]);
    expect(maskOf(lesions, DEFAULT_LOOK, null)).toEqual({ layer: { derivative: 11, set: "lesions" }, look: DEFAULT_LOOK, max: 8, labels: undefined });
    expect(maskOf(structures, DEFAULT_LOOK, null)).toMatchObject({ layer: { derivative: 11, set: "structures" }, max: 259, labels: [2, 3, 41, 259] });
    // a label map whose names the file does not carry takes the values its parts door lists
    const bare = layersOf([{ ...FILES[0], part_sets: [{ key: "structures", words: "Structures", kind: "labels", count: 3 }] }])[0];
    expect(bare.labels).toBeNull();
    expect(maskOf(bare, DEFAULT_LOOK, [4, 17, 53])).toMatchObject({ max: 53, labels: [4, 17, 53] });
  });
  it("is offered on the run's page by unit, with the files by unit, to a person who reads at detail quasi", () => {
    const draw = (caps = SEE, files: Derivative[] | null = FILES) => renderToStaticMarkup(<RunView caps={caps} run={RUN} pipeline={null} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={files} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} />);
    const html = draw();
    expect(viewActs(SEE)).toBe(true);
    expect(html.match(/>View<\/a>/gu)).toHaveLength(2);
    expect(html).toContain(`href="${resultHref(9, UNITS[0])}"`);
    expect(resultHref(9, UNITS[0])).toBe("#pipelines/runs/9?view=sub-7a8b_ses-1");
    // the files by unit: the unit once, each file by its short name, kind and size
    expect(html).toContain("<th>Unit</th><th>File</th><th>Kind</th><th class=\"num\">Size</th><th>Check</th>");
    expect(html.match(/>sub-7a8b_ses-1<\/td>/gu)).toHaveLength(2);
    expect(html).toContain(">acq-T1w_desc-samseg_volumes.json</td><td>table</td><td class=\"num\">1 KB</td>");
    expect(html).toContain(">the run</td>");
    // no View without the layer door, below detail quasi, or before the files are read
    expect(draw(capsWith(DOORS.filter((d) => d !== LAYER), ["pipelines:see"]))).not.toContain(">View<");
    const plain = capsWith(DOORS, ["pipelines:see"]);
    plain.person.detail = "plain";
    expect(viewActs(plain)).toBe(false);
    expect(draw(SEE, null)).not.toContain(">View<");
  });
  it("draws one unit: its part sets as chips, the mask's switch, the way through the units and back, and its files", () => {
    const html = renderToStaticMarkup(<ResultView run={RUN} files={FILES} unit={UNITS[1]} />);
    expect(html).toContain('<b class="path result-unit">sub-9c0d_ses-2</b><span class="meta">on scan 23</span>');
    expect(html).toMatch(/<button type="button" class="tag brand" aria-pressed="true">Lesions 8<\/button><button type="button" class="tag" aria-pressed="false">Structures 36<\/button>/u);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Mask <kbd>o</kbd>");
    expect(html).toContain('<span class="meta num">2 of 2</span>');
    expect(html).toContain(`<a class="button quiet small" href="#pipelines/runs/9?view=sub-7a8b_ses-1">Previous</a>`);
    expect(html).not.toContain(">Next<");
    expect(html).toContain('<a class="button secondary small" href="#pipelines/runs/9">Back to run 9</a>');
    expect(html).toContain(">acq-T1w_desc-samseg_dseg.nii.gz</td><td>mask</td><td class=\"num\">101 KB</td>");
    // a unit that made no mask says so, and still lists what it made
    const none = renderToStaticMarkup(<ResultView run={RUN} files={FILES} unit={UNITS[2]} />);
    expect(none).toContain("This unit made no mask to draw.");
    expect(none).toContain(">acq-T1w_desc-samseg_volumes.json</td>");
  });
});
