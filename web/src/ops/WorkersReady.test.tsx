// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The standing workers' line: ready apart from the jobs, each with its kind and last heartbeat, a silent one marked.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { JobRow } from "../ask/client";
import { WorkersReady } from "./WorkersReady";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = Date.parse("2026-10-15T12:00:00Z");
const w = (id: number, kind: string, secs: number): JobRow => ({ id, kind, name: null, state: "running", started_at: "2026-10-15T08:00:00Z", heartbeat_at: new Date(now - secs * 1000).toISOString(), finished_at: null, progress: null, error: null, args: {}, result: null });

function draw(jobs: JobRow[]): HTMLElement {
  const el = document.createElement("div");
  act(() => createRoot(el).render(<WorkersReady jobs={jobs} now={now} />));
  return el;
}

describe("WorkersReady", () => {
  it("says the workers ready in one line with each kind and heartbeat", () => {
    const container = draw([w(1, "worker", 4), w(2, "picture-worker", 9), w(3, "pipeline-worker", 20)]);
    expect(container.querySelector("summary")?.textContent).toBe("Workers: 3 ready");
    expect(container.querySelectorAll("li.ready")).toHaveLength(3);
    expect(container.textContent).toContain("picture-worker");
    expect(container.textContent).toContain("last heartbeat 9 s ago");
    expect(container.querySelector(".silent")).toBeNull();
  });

  it("marks a worker silent for over two minutes as not answering", () => {
    const container = draw([w(1, "worker", 4), w(2, "pipeline-worker", 300)]);
    expect(container.querySelector("summary")?.textContent).toBe("Workers: 1 ready, 1 not answering");
    expect(container.querySelector("li.silent")?.textContent).toContain("not answering · last heartbeat 5 min ago");
  });

  it("draws nothing where no worker stands", () => {
    const container = draw([]);
    expect(container.innerHTML).toBe("");
  });
});
