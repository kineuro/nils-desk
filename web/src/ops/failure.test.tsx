// SPDX-License-Identifier: AGPL-3.0-only
// A failed run says why (2026-10-12): the line under a failed run's row, the
// whole of it on the run's page and in the run form's pre-flight, with the
// failure slice's kind and what to do where the engine says them, and the
// error's first sentence where it does not (the engine before the slice).
// The answers are built through SLICE's names, so the tests hold when the
// slice reports other names.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { capsWith } from "../review/caps.fixture";
import { CatalogBody } from "./Catalog";
import type { Run } from "./catalog";
import { failureOf, firstSentence, refusalOf } from "./failure";
import { withSlice } from "./failure.fixture";
import { PreflightPanel } from "./Preflight";
import { RunView } from "./RunPage";
import { blockedOf, type Preflight, type RunDetail } from "./runs";

const DCM2NIIX =
  "the release of the input failed: /usr/local/bin/dcm2niix is not runnable (No such file or directory (os error 2)). dcm2niix is a prerequisite of a deployment: install a current build from rordenlab/dcm2niix, which a distribution's package lags, and pass --dcm2niix if it is not on the path.";
const TODO = "Install dcm2niix where the engine runs; an admin can do it from Settings, Parts.";

const FAILED: Run = {
  id: 12,
  pipeline_id: 3,
  pipeline: "samseg-lesions@1",
  job_id: 40,
  selection: "selection:t1-3d-stacks@1",
  status: "failed",
  started_at: "2026-10-12T08:00:00Z",
  finished_at: "2026-10-12T08:00:05Z",
  summary: { units: { total: 0 } },
  error: DCM2NIIX,
};
const DONE: Run = { ...FAILED, id: 11, status: "done", error: null, summary: { units: { total: 4, succeeded: 4 } } };

const DOORS = ["GET /api/pipelines", "GET /api/pipeline-runs", "GET /api/pipeline-runs/{id}", "POST /api/jobs", "POST /api/pipelines/{name}/preflight"];
const caps = capsWith(DOORS, ["pipelines:see", "pipelines:work"]);
const ON = { enabled: true, runtime: { name: "podman" } };

describe("the reason a run failed", () => {
  it("is the error's first sentence where the engine says no kind (today's engine)", () => {
    const f = failureOf(FAILED)!;
    expect(f.kind).toBeNull();
    expect(f.todo).toBeNull();
    expect(f.line).toBe("the release of the input failed: /usr/local/bin/dcm2niix is not runnable (No such file or directory (os error 2)).");
    expect(f.error).toBe(DCM2NIIX);
    expect(failureOf(DONE)).toBeNull();
  });
  it("is what to do, with the kind beside it, where the engine says them", () => {
    const f = failureOf(withSlice(FAILED, { kind: "dependency", todo: TODO }))!;
    expect(f.kind).toBe("dependency");
    expect(f.line).toBe(TODO);
    expect(f.error).toBe(DCM2NIIX);
  });
  it("reads a sentence to its first stop followed by a space, never inside a version or a path", () => {
    expect(firstSentence("out of memory at 31.5 GB. The lane allows 32 GB.")).toBe("out of memory at 31.5 GB.");
    expect(firstSentence("no FLAIR picked")).toBe("no FLAIR picked");
    expect(firstSentence("  the container exited 137!  It was killed. ")).toBe("the container exited 137!");
  });
  it("reads a refused door's answer, and its words where the answer holds none", () => {
    const f = refusalOf(new DoorError(400, withSlice({ error: "no selection t1-3d" }, { kind: "input", todo: "Pick a selection the engine holds." })));
    expect(f).toMatchObject({ kind: "input", line: "Pick a selection the engine holds.", error: "no selection t1-3d" });
    expect(refusalOf(new DoorError(502, {}))).toMatchObject({ kind: null, line: "the engine answered 502" });
    expect(refusalOf(new Error("Failed to fetch")).line).toBe("Failed to fetch");
  });
});

describe("the Runs table", () => {
  const draw = (runs: Run[]) => renderToStaticMarkup(<CatalogBody caps={caps} pipelines={[]} capability={ON} runs={runs} onRun={() => undefined} />);
  it("says a failed run's reason on one line under its row, its first sentence today", () => {
    const html = draw([FAILED, DONE]);
    expect(html.match(/class="fail-row"/gu)).toHaveLength(1);
    expect(html).toContain('<tr class="has-fail">');
    expect(html).toContain("is not runnable (No such file or directory (os error 2)).</span>");
    // the whole error a hover away, never the second sentence on the line
    expect(html).toContain(`title="${DCM2NIIX.replace(/'/gu, "&#x27;")}"`);
    expect(html).not.toMatch(/>[^<]*a prerequisite of a deployment[^<]*<\/span>/u);
  });
  it("says what to do, the kind as a value tag, where the engine says them", () => {
    const html = draw([withSlice(FAILED, { kind: "dependency", todo: TODO })]);
    expect(html).toContain('<div class="fail-line"><span class="tag">dependency</span><span class="fail-words"');
    expect(html).toContain(`${TODO}</span>`);
  });
});

const DETAIL: RunDetail = { ...(FAILED as unknown as RunDetail), units_run: [] };

describe("a run's page", () => {
  const view = (run: RunDetail) =>
    renderToStaticMarkup(<RunView caps={caps} run={run} pipeline={null} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} />);
  it("shows the reason in full: its first sentence as the lead, the whole error under it", () => {
    const html = view(DETAIL);
    expect(html).toContain('class="note caution fail-note"');
    expect(html).toContain('<p class="note-lead fail-said"><span>the release of the input failed:');
    expect(html).toContain(`<p class="note-detail">${DCM2NIIX.replace(/'/gu, "&#x27;")}</p>`);
  });
  it("leads with what to do and the kind where the engine says them", () => {
    const html = view(withSlice(DETAIL, { kind: "dependency", todo: TODO }));
    expect(html).toContain(`<p class="note-lead fail-said"><span class="tag">dependency</span><span>${TODO}</span></p>`);
  });
  it("says each failed unit's reason under its row", () => {
    const unit = (u: string, status: string, error: string | null) => ({ unit: u, state: "over", status, attempts: 1, started_at: null, finished_at: null, error });
    const run: RunDetail = { ...DETAIL, error: null, status: "partial", units_run: [unit("sub-a", "succeeded", null), withSlice(unit("sub-b", "failed", "the container was killed: out of memory. It held 31 GB."), { kind: "resource", todo: "Give the lane more memory, or run fewer units at once." })] };
    const html = view(run);
    expect(html.match(/class="fail-row"/gu)).toHaveLength(1);
    expect(html).toContain('<span class="tag">resource</span><span class="fail-words" title="the container was killed: out of memory. It held 31 GB.">Give the lane more memory, or run fewer units at once.</span>');
  });
});

const PRE: Preflight = { pipeline: "n4-bias-correction@1", units: { total: 6, ready: 0, missing: 0 }, ready: false, blockers: ["dcm2niix is not runnable here. A bids input is released with it."] };

describe("the run form's pre-flight", () => {
  it("says a refusal the same way: the kind and what to do, the error under them", () => {
    const why = refusalOf(new DoorError(400, withSlice({ error: DCM2NIIX }, { kind: "dependency", todo: TODO })));
    const html = renderToStaticMarkup(<PreflightPanel p={null} why={why} />);
    expect(html).toContain('<p class="note-lead">The pre-flight refused</p>');
    expect(html).toContain(`<p class="fail-said"><span class="tag">dependency</span><span>${TODO}</span></p>`);
    expect(html).toContain("is a prerequisite of a deployment");
  });
  it("says a refusal from today's engine by its first sentence", () => {
    const html = renderToStaticMarkup(<PreflightPanel p={null} why="no selection t1-3d. Saved selections are listed in Query." />);
    expect(html).toContain('<p class="fail-said"><span>no selection t1-3d.</span></p>');
    expect(html).toContain('<p class="note-detail">no selection t1-3d. Saved selections are listed in Query.</p>');
  });
  it("says why it is not ready by its blockers, and by what to do where the engine says it", () => {
    expect(blockedOf(PRE)).toMatchObject({ kind: null, line: "dcm2niix is not runnable here." });
    expect(blockedOf({ ...PRE, ready: true })).toBeNull();
    const html = renderToStaticMarkup(<PreflightPanel p={withSlice(PRE, { kind: "dependency", todo: TODO })} />);
    expect(html).toContain('<p class="note-lead">Not ready</p>');
    expect(html).toContain(`<span class="tag">dependency</span><span>${TODO}</span>`);
    expect(html).toContain("A bids input is released with it.");
  });
});
