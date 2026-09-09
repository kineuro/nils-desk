// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import type { DeskRecord, HandleRow, JobRow } from "../ask/client";
import { age, running, stateOf, surface } from "./state";

const handle = (over: Partial<HandleRow> = {}): HandleRow => ({
  id: 77, name: "fixture run", grain: "session", row_count: 175, content_hash: "fcfe", principal: "nima@g14", actor: { kind: "absent" },
  created_at: "2026-09-09T01:35:43Z", epoch: 1, pack_version: "0.1.1", disclosure: "local", truncated: false, limit: null, kept: true,
  last_read_at: null, withdrawn_at: null, ask_hash: "56f5", columns: ["rows", "subjects"], ...over,
});
const record = (over: Partial<DeskRecord> = {}): DeskRecord => ({ results: [{ handle: 77, document: 2, subject: "nima", made_at: "" }], lineage: [], export: "reader", ...over });
const all = ["reader", "reviewer", "operator", "admin"];

describe("the three named states", () => {
  it("running: the ask run jobs not over, with the document they run", () => {
    const jobs: JobRow[] = [
      { id: 9, kind: "ask", name: "nightly", state: "running", started_at: "2026-09-09T02:00:00Z", heartbeat_at: "2026-09-09T02:00:30Z", finished_at: null, progress: { rows: 40 }, error: null, args: { argv: ["ask", "run", "--document", "2", "--keep"] }, result: null },
      { id: 8, kind: "ask", name: null, state: "done", started_at: "", heartbeat_at: null, finished_at: "", progress: null, error: null, args: { argv: ["ask", "run", "--document", "2"] }, result: { handle: 77 } },
      { id: 7, kind: "digest", name: null, state: "running", started_at: "", heartbeat_at: null, finished_at: null, progress: null, error: null, args: { argv: ["digest"] }, result: null },
    ];
    expect(running(jobs)).toEqual([{ job: 9, name: "nightly", state: "running", document: 2, since: "2026-09-09T02:00:00Z", heartbeat: "2026-09-09T02:00:30Z", progress: { rows: 40 } }]);
    expect(age("2026-09-09T02:00:00Z", Date.parse("2026-09-09T02:00:31Z"))).toBe(31);
  });
  it("stale: the document moved on, by the desk's lineage, else the registry moved", () => {
    const fresh = stateOf(handle(), record(), 1, all, true);
    expect(fresh.stale).toBeNull();
    const moved = stateOf(handle(), record({ lineage: [{ document: 3, parent: 2 }, { document: 4, parent: 3 }] }), 1, all, true);
    expect(moved.stale).toEqual({ overlay: "document 2 moved on to 4", document: 2, moved_to: 4 });
    const epoch = stateOf(handle(), record(), 2, all, true);
    expect(epoch.stale?.overlay).toBe("the registry moved: epoch 1 then, 2 now");
    expect(epoch.release.enabled).toBe(true);
  });
  it("truncated: your limit is told apart from our truncation, and release and promote carry the reason", () => {
    const yours = stateOf(handle({ truncated: true, limit: 175, grain: "subject" }), record(), 1, all, true);
    expect(yours.truncated).toEqual({ by: "you", limit: 175 });
    expect(yours.release.enabled).toBe(false);
    expect(yours.release.reason).toMatch(/raise your limit in the out step/);
    expect(yours.promote.reason).toMatch(/not promoted/);
    const ours = stateOf(handle({ truncated: true, limit: null }), record(), 1, all, true);
    expect(ours.truncated).toEqual({ by: "us", limit: null });
    expect(ours.release.reason).toMatch(/narrow the question or run it as a job/);
    expect(ours.export.enabled).toBe(true);
  });
});

describe("the controls", () => {
  it("are gated by the entitlement the door wants, with the reason on the control", () => {
    const reader = stateOf(handle({ grain: "subject" }), record(), 1, ["reader"], true);
    expect(reader.release).toEqual({ enabled: false, reason: "released needs the operator entitlement" });
    expect(reader.promote.enabled).toBe(false);
    expect(reader.export.enabled).toBe(true);
    const noExport = stateOf(handle(), record(), 1, ["reader"], false);
    expect(noExport.export.reason).toBe("export is not open to you on this desk");
  });
  it("name dropped and withdrawn rows before anything else", () => {
    const dropped = stateOf(handle({ kept: false }), record(), 1, all, true);
    expect(dropped.rows).toBe("dropped");
    expect(dropped.export.reason).toBe("the rows were dropped by retention");
    const withdrawn = stateOf(handle({ withdrawn_at: "2026-09-09T03:00:00Z" }), record(), 1, all, true);
    expect(withdrawn.rows).toBe("withdrawn");
    expect(withdrawn.release.reason).toBe("the handle was withdrawn");
  });
  it("a session handle is not promoted, a subject handle is", () => {
    expect(stateOf(handle(), record(), 1, all, true).promote.reason).toBe("only a subject handle is promoted into a cohort");
    expect(stateOf(handle({ grain: "subject" }), record(), 1, all, true).promote.enabled).toBe(true);
  });
  it("the surface is newest first", () => {
    expect(surface([handle({ id: 3 }), handle({ id: 9 }), handle({ id: 5 })], record(), 1, all, true).map((s) => s.handle.id)).toEqual([9, 5, 3]);
  });
});
