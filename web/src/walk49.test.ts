// SPDX-License-Identifier: AGPL-3.0-only
// Record 49 A7's headless walk, with the desk's own client code, from a
// question's plan to a run's table: skipped unless an engine is named, so CI
// never runs it. Against a throwaway engine only (a scratch registry, a
// stand-in runtime, free ports), never an install that holds work.
//
//   WALK49=http://127.0.0.1:<engine port> WALK49_TOKEN=<a token at detail quasi or above>
//   WALK49_PLAIN=<a token at detail plain with pipelines:see and query:work>
//   WALK49_PIPELINE=slow-volumes WALK49_SELECTION=every
//     the plan the analysis-plan station would write, read as the desk reads
//     it; its pre-flight; the one press that starts it; the run cancelled
//     mid-way and resumed, its finished units kept; its table per scan at
//     quasi and as group totals below it; its breach and its review item;
//     the files it made.
//
//   npx vitest run src/walk49.test.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { RunView } from "./ops/RunPage";
import type { DoorError } from "./ask/client";
import { catalog, runCommand, type Run } from "./ops/catalog";
import { ops } from "./ops/client";
import { ofRun } from "./review/Queue";
import { breachesByCheck, checksOf, measureColumns, pipelineOf, preflightCells, preflightGate, resumable, resumeCommand, runDocumentOf, runs, shownColumns, tableAsk, unitCounts, type RunDetail } from "./ops/runs";

const ENGINE = process.env.WALK49 ?? "";
const TOKEN = process.env.WALK49_TOKEN ?? "";
const PLAIN = process.env.WALK49_PLAIN ?? "";
const PIPELINE = process.env.WALK49_PIPELINE ?? "slow-volumes";
const SELECTION = process.env.WALK49_SELECTION ?? "every";

/** The desk's client speaks relative paths; here they go to the engine, with the bearer the desk's proxy would add. */
let bearer = TOKEN;
const real = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" && input.startsWith("/") ? `${ENGINE}${input}` : input;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${bearer}`);
    return real(url, { ...init, headers });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = real;
});

const until = async <T>(what: string, read: () => Promise<T>, done: (v: T) => boolean, seconds = 90): Promise<T> => {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    const v = await read();
    if (done(v)) return v;
    if (Date.now() > end) throw new Error(`waited ${seconds} s for ${what}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

describe.skipIf(ENGINE === "" || TOKEN === "")("a question's plan to a run's table", () => {
  it("plans, checks, starts, cancels, resumes and reads the run", async () => {
    bearer = TOKEN;
    const c = await catalog.list();
    expect(c.capability?.enabled).toBe(true);
    const sel = await catalog.selection(SELECTION);
    const stacks = await runs.preflight(PIPELINE, { selection: sel.name, version: sel.version }, {});
    // the plan as the analysis-plan station would write it, with the pre-flight it saw
    const low = 3;
    const read = runDocumentOf({
      station: "analysis-plan",
      result: {
        run_document: { pipeline: PIPELINE, select: `selection:${sel.name}@${sel.version}`, params: { sleep: 1, low }, preflight: stacks, why: "A volume per scan answers the question; SNR is checked on each." },
        question: "brain volume in every scan",
      },
    });
    if ("refused" in read) throw new Error(read.refused);
    const doc = read.doc;
    const pipeline = pipelineOf(c.pipelines, doc.pipeline)!;
    expect(pipeline.label).toBe(`${PIPELINE}@1`);

    // the pre-flight, again, as the plan's page asks it
    const pre = await runs.preflight(pipeline.id, doc.over, doc.params);
    expect(preflightGate(pre).go).toBe(true);
    expect(pre.units.ready).toBe(pre.units.total);
    console.log(`pre-flight: ${preflightCells(pre).map((x) => `${x.k} ${x.v}`).join(" · ")}`);

    // the one press
    const job = await ops.enqueue(runCommand({ pipeline, over: doc.over, params: doc.params, models: [], labels: null }));
    const row = await until<Run | undefined>("the run's row", async () => (await catalog.runs(20)).runs.find((r) => r.job_id === job.job), (r) => r !== undefined);
    const id = row!.id;

    // cancelled once a unit is over; the finished ones are kept
    await until<RunDetail>("a unit over", () => runs.get(id), (r) => (r.unit_states?.over ?? 0) >= 1);
    await ops.cancel(job.job);
    const stopped = await until<RunDetail>("the cancel", () => runs.get(id), (r) => r.status === "cancelled");
    expect(resumable(stopped, false)).toBe(true);
    const keptBefore = stopped.unit_states?.over ?? 0;
    expect(keptBefore).toBeGreaterThanOrEqual(1);
    expect(keptBefore).toBeLessThan(pre.units.total);

    // resumed from the run's page
    const again = await ops.enqueue(resumeCommand(stopped));
    const done = await until<RunDetail>("the resumed run", () => runs.get(id), (r) => r.status === "done" || r.status === "partial" || r.status === "failed", 120);
    expect(done.status).toBe("done");
    expect(done.resumes).toBe(1);
    const resumedJob = await runs.job(done.job_id ?? again.job);
    const counts = unitCounts(done.units_run ?? [], resumedJob.started_at);
    expect(counts.kept + counts.done).toBe(pre.units.total);
    expect(counts.kept).toBeGreaterThanOrEqual(1);
    console.log(`run ${id}: ${counts.kept} kept on resume, ${counts.done} run after it`);

    // the table per scan at quasi: one row a stack, each value this run's
    const cols = measureColumns(pipeline as never);
    expect(cols.map((x) => x.name)).toEqual(["brain_volume", "snr"]);
    const perScan = await runs.ask(tableAsk({ pipeline: pipeline.name, level: pipeline.level, run: id, columns: cols, perScan: true, by: "subject.sex" }));
    const names = perScan.columns;
    expect(shownColumns(names).map((x) => x.name)).toEqual(["id", "measure.slow-volumes.brain_volume", "measure.slow-volumes.snr"]);
    expect(perScan.rows).toHaveLength(pre.units.total);
    for (const r of perScan.rows) expect(r[names.indexOf("measure.slow-volumes.brain_volume")]).toBe(1000 * Number(r[names.indexOf("id")]));

    // the run's page draws it: the table, the units kept, the breach and the way to its item
    const caps = {
      engine: { doors: ["GET /api/pipeline-runs/{id}", "GET /api/review", "POST /api/ask/run", "POST /api/jobs", "POST /api/jobs/{id}/cancel", "GET /api/derivatives"] },
      person: { subject: "ops@lab", display_name: "ops", grants: ["pipelines:see", "pipelines:work", "query:work", "review:see"], detail: "sensitive", groups: [] },
    } as unknown as Capabilities;
    const page = renderToStaticMarkup(
      createElement(RunView, { caps, run: done, pipeline, resumedAt: resumedJob.started_at, jobAlive: false, table: { kind: "ready", perScan: true, columns: perScan.columns, rows: perScan.rows, truncated: perScan.truncated }, files: null, by: "subject.sex", onBy: () => undefined, said: null, onCancel: null, onResume: null }),
    );
    expect(page.match(/<tr>/gu)?.length).toBeGreaterThanOrEqual(2 * pre.units.total);
    expect(page).toContain("<th>brain volume</th>");
    expect(page).toContain("kept on resume");
    expect(page).toContain(`href="#review?run=${id}"`);

    // the breach, and its review item
    expect(checksOf(done)).toMatchObject({ declared: 1, breaches: 1 });
    expect(breachesByCheck(done)).toEqual([{ check: "snr >= 8", units: 1 }]);
    const items = ofRun((await ops.review(undefined, "pipeline:qc", 500)).items, id);
    expect(items).toHaveLength(1);
    expect((items[0].evidence as { status?: string }).status).toBe("breach");

    // the files it made
    const files = (await runs.derivatives(id)).derivatives;
    expect(files.filter((f) => f.kind === "table")).toHaveLength(pre.units.total);

    // below detail quasi: no scan's value, the totals of groups of 5 or more
    if (PLAIN !== "") {
      bearer = PLAIN;
      const refused = await runs.ask(tableAsk({ pipeline: pipeline.name, level: pipeline.level, run: id, columns: cols, perScan: true, by: "subject.sex" })).then(
        () => null,
        (e: unknown) => JSON.stringify((e as DoorError).body),
      );
      expect(refused).toMatch(/read per row only at detail quasi/u);
      const totals = await runs.ask(tableAsk({ pipeline: pipeline.name, level: pipeline.level, run: id, columns: cols, perScan: false, by: "subject.sex" }));
      const t = totals.columns;
      expect(shownColumns(t).map((x) => x.name)).toEqual(["subject.sex", "scans", "mean_brain_volume", "mean_snr"]);
      const scans = totals.rows.map((r) => r[t.indexOf("scans")]);
      expect(scans.reduce((a: number, s) => a + (typeof s === "number" ? s : 0), 0)).toBe(pre.units.total);
      for (const s of scans) expect(s === null || (typeof s === "number" && s >= 5)).toBe(true);
      console.log(`below quasi: ${totals.rows.map((r) => `${String(r[t.indexOf("subject.sex")])} ${String(r[t.indexOf("scans")])} scans, mean ${String(r[t.indexOf("mean_brain_volume")])}`).join("; ")}`);
      bearer = TOKEN;
    }
  }, 240_000);
});
