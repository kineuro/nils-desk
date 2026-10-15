// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Main scans' layers (record 55, decision 6: "The data map (v0's heatmap,
// for datasets and cohorts, with layers such as body part and
// post-contrast) is where the trade-off is seen"), against an engine whose
// map doors answer a `layer`: the layer keys, only the chosen one in colour;
// the map, its subjects and its strips asked with the layer; its values
// over the visits, faint the visits that hold one and solid those that take
// one; the cards and the strips coloured by the value of the scan taken,
// filled, or by what most of a visit's scans are, outlined; each candidate's
// value in a visit's pick; whether the step that answers the layer has run
// over the cohort or dataset, with its Run where it has not; and the same
// words as the rest of the page.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine, MAIN_SCANS_DOORS, mainScansDoors, rulesAnswer, type FakeAnswer, type FakeCall } from "./mainScans.fixture";
import { layerDoors, RUN_DOORS, stepOf } from "./mapLayers.fixture";
import { ReviewPage } from "./ReviewPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ALL = capsWith([...MAIN_SCANS_DOORS, ...RUN_DOORS, "GET /api/picks/layer-step"], [...GRANTS] as Grant[]);

async function open(query: Record<string, string>, over: (c: FakeCall) => FakeAnswer = layerDoors(), caps = ALL) {
  const engine = fakeEngine(mainScansDoors(over));
  act(() => root.render(<ReviewPage caps={caps} page="picks" query={query} />));
  await settle();
  return engine;
}

const box = () => host.querySelector<HTMLElement>(".ms-layer")!;
const pressed = () => [...box().querySelectorAll('[role="group"][aria-label="Layer"] .opt')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);

async function choose(words: string) {
  act(() => button(box(), words)!.click());
  await settle();
}

describe("Main scans' layers", () => {
  it("offers the layer keys with the kinds chosen, and asks no door for a layer until one is chosen", async () => {
    const engine = await open({ cohort: "ms-followup" });
    expect([...box().querySelectorAll(".opt")].map((b) => b.textContent)).toEqual(["Kinds", "Body region", "Body part", "Post-contrast"]);
    expect(pressed()).toEqual(["Kinds"]);
    for (const c of [...engine.of("POST", "/api/picks/map"), ...engine.of("POST", "/api/picks/map/subjects")]) expect(c.body).not.toHaveProperty("layer");
    expect(box().querySelector(".ms-kind-row")).toBeNull();
  });

  it("asks the map and its subjects for the layer chosen, and only the chosen key is in colour", async () => {
    const engine = await open({ cohort: "ms-followup" });
    await choose("Body region");
    expect(engine.of("POST", "/api/picks/map").at(-1)?.body).toMatchObject({ scope: { cohort: "ms-followup" }, role: "t1w", layer: "body_region" });
    expect(engine.of("POST", "/api/picks/map/subjects").at(-1)?.body).toMatchObject({ layer: "body_region" });
    expect(pressed()).toEqual(["Body region"]);
    const keys = [...box().querySelectorAll('[role="group"][aria-label="Layer"] .opt')];
    expect(keys.filter((k) => k.classList.contains("on")).map((k) => k.textContent)).toEqual(["Body region"]);
    // the layer is kept in the tab
    expect(sessionStorage.getItem("nils.mainScans.layer")).toBe("body_region");
    await choose("Kinds");
    expect(sessionStorage.getItem("nils.mainScans.layer")).toBeNull();
    expect(engine.of("POST", "/api/picks/map").at(-1)?.body).not.toHaveProperty("layer");
  });

  it("draws each value over the visits as the kinds are drawn: a framed tag in its colour, faint those that hold it, solid those that take it", async () => {
    await open({ cohort: "ms-followup" });
    await choose("Body region");
    const rows = [...box().querySelectorAll(".ms-kind-row")];
    expect(rows.map((r) => r.querySelector(".ms-kind")?.textContent)).toEqual(["head", "spine"]);
    expect(rows.map((r) => r.querySelector(".ms-kind")?.getAttribute("data-slot"))).toEqual(["1", "3"]);
    expect(rows.map((r) => r.querySelector(".ms-count")?.textContent)).toEqual(["1,040 taken of 1,080", "2 taken of 30"]);
    expect(rows[0].querySelector(".ms-bar")?.getAttribute("data-slot")).toBe("1");
    expect(box().textContent).toContain("400 scans carry no body region · 8 visits have none at all · 8 scans taken without one.");
  });

  it("says the layer's step has not run on the cohort, and its Run asks the cohort's door and says it is queued", async () => {
    const engine = await open({ cohort: "ms-followup" }, (c) => (c.method === "POST" && c.path === "/api/cohorts/ms-followup/steps/body_part/run" ? { status: 202, body: { job: 41, state: "queued", step: "body_part", for: "cohort:ms-followup", scans: 1300, handle: 9, command: [] } } : layerDoors()(c)));
    await choose("Body part");
    expect(box().querySelector(".ms-layer-said")?.textContent).toBe("Body part has not run on this cohort.");
    expect(box().querySelector(".ms-layer-said")?.classList.contains("not-run")).toBe(true);
    const asked = engine.of("POST", "/api/picks/map").length;
    act(() => button(box(), "Run")!.click());
    await settle();
    expect(engine.of("POST", "/api/cohorts/ms-followup/steps/body_part/run")).toHaveLength(1);
    expect(box().querySelector(".ms-said")?.textContent).toBe("ms-followup: body part queued.");
    // the map is read again, so the step says it waits its turn
    expect(engine.of("POST", "/api/picks/map").length).toBeGreaterThan(asked);
  });

  it("offers no Run once the step has run, and says how much it answered", async () => {
    await open({ cohort: "ms-followup" }, layerDoors({ post_contrast: stepOf("post_contrast", { state: "done", answered: 1200, finished_at: "2026-10-14T09:00:00Z" }) }));
    await choose("Post-contrast");
    expect(box().querySelector(".ms-layer-said")?.textContent).toBe("Post-contrast has run on this cohort · 1,200 of 1,300 answered.");
    expect(button(box(), "Run")).toBeNull();
    expect(button(box(), "Run again")).toBeNull();
    // the 72-hour flag of the cohort's visits, in words, in the caution colour
    expect(box().querySelector(".ms-layer-flag")?.textContent).toBe("72 h 3 visits follow contrast given in the 72 hours before.");
    expect(box().querySelector(".ms-layer-flag .tag.caution")).not.toBeNull();
  });

  it("holds the Run where the engine would refuse it, saying why, and offers none to a person without work on Pipelines", async () => {
    await open({ cohort: "ms-followup" }, layerDoors({ body_part: stepOf("body_part", { state: "off", served: false, refusal: { reason: "no_model", error: "no body-part model is installed" } }) }));
    await choose("Body region");
    expect(box().querySelector(".ms-layer-said")?.textContent).toBe("Body part is not available here, so it has not run on this cohort.");
    expect(button(box(), "Run")?.disabled).toBe(true);
    expect(box().querySelector('.ms-layer-step .hint')?.getAttribute("title")).toBe("no body-part model is installed");
    act(() => root.unmount());
    root = createRoot(host);
    sessionStorage.clear();
    const seer = capsWith([...MAIN_SCANS_DOORS, ...RUN_DOORS], (GRANTS as readonly Grant[]).filter((g) => g !== "pipelines:work"));
    await open({ cohort: "ms-followup" }, layerDoors(), seer);
    await choose("Body region");
    expect(box().querySelector(".ms-layer-said")?.textContent).toBe("Body part has not run on this cohort.");
    expect(button(box(), "Run")).toBeNull();
  });

  it("runs the step on a dataset's own door for a dataset's page, by the name the engine gave it", async () => {
    const engine = await open({ dataset: "@study-big" }, (c) => {
      if (c.method === "GET" && c.path === "/api/picks/rules") return { status: 200, body: { ...rulesAnswer(), scope: { kind: "dataset", id: 3, name: "study-big" } } };
      if (c.method === "POST" && c.path.endsWith("/steps/post_contrast/run")) return { status: 202, body: { job: 42, state: "queued", step: "post_contrast", for: "dataset:study-big", scans: 10, handle: 3, command: [] } };
      return layerDoors()(c);
    });
    await choose("Post-contrast");
    expect(engine.of("POST", "/api/picks/map").at(-1)?.body).toMatchObject({ scope: { dataset: "@study-big" }, layer: "post_contrast" });
    expect(box().querySelector(".ms-layer-said")?.textContent).toBe("Post-contrast has not run on this dataset.");
    act(() => button(box(), "Run")!.click());
    await settle();
    expect(engine.calls.filter((c) => c.path.endsWith("/steps/post_contrast/run")).map((c) => c.path)).toEqual(["/api/datasets/study-big/steps/post_contrast/run"]);
    expect(box().querySelector(".ms-said")?.textContent).toBe("study-big: post-contrast queued.");
  });

  it("says why a Run was not started", async () => {
    await open({ cohort: "ms-followup" }, (c) => (c.method === "POST" && c.path.endsWith("/run") ? { status: 409, body: { error: "body part runs already over these scans, as job 40", reason: "running" } } : layerDoors()(c)));
    await choose("Body part");
    act(() => button(box(), "Run")!.click());
    await settle();
    expect(box().querySelector(".ms-said")?.textContent).toContain("Not started: body part runs already over these scans, as job 40");
  });

  it("marks each card's visit with the value of the scan taken, filled, else what most of its scans are, outlined, its scans on hover", async () => {
    await open({ cohort: "ms-followup" });
    await choose("Body region");
    const marks = [...host.querySelectorAll(".ms-card .ms-visit-layer .ms-kind")];
    expect(marks.map((m) => [m.textContent, m.getAttribute("data-slot"), m.classList.contains("held")])).toEqual([
      ["head", "1", false],
      ["spine", "3", false],
      ["spine", "3", true],
    ]);
    const visits = [...host.querySelectorAll<HTMLButtonElement>(".ms-card .ms-visit:not(.blank)")];
    expect(visits.map((v) => v.title)).toEqual(["5 scans: head 3; 2 with no answer", "3 scans: head 1, spine 2", "5 scans: spine 4; 1 with no answer"]);
    expect(visits[2].getAttribute("aria-label")).toContain("body region none taken, its scans mostly spine");
    // the kinds keep their own colours above the layer
    expect(visits[0].querySelector(".ms-kind:not(.ms-layer-tag)")?.textContent).toBe("2D SE");
  });

  it("flags a visit the subject had contrast in the 72 hours before", async () => {
    await open({ cohort: "ms-followup" });
    await choose("Post-contrast");
    const flagged = [...host.querySelectorAll(".ms-card .ms-visit")].filter((v) => v.querySelector(".tag.caution"));
    expect(flagged).toHaveLength(1);
    expect(flagged[0].querySelector(".tag.caution")?.textContent).toBe("72 h");
    expect(flagged[0].querySelector(".ms-layer-tag")?.textContent).toBe("post");
    expect(flagged[0].getAttribute("title")).toBe("4 scans: pre 2, post 2; contrast in the 72 hours before");
  });

  it("colours every subject's strip by the layer, filled for the scan taken and outlined for what most scans are, with no kind's change marked", async () => {
    const engine = await open({ cohort: "ms-followup" });
    await choose("Body region");
    act(() => button(host, "All subjects")!.click());
    await settle();
    expect(engine.of("POST", "/api/picks/map/strips").at(-1)?.body).toMatchObject({ layer: "body_region" });
    const cells = (subject: number) => {
      const strips = [...host.querySelectorAll(".ms-strip")];
      const labels = ["head; spine", "spine, none taken", "head; head; no answer"];
      return strips.find((s) => s.getAttribute("aria-label") === labels[subject])!;
    };
    const look = (s: Element) => [...s.querySelectorAll("i:not(.blank)")].map((i) => [i.getAttribute("data-slot"), i.className || null]);
    expect(look(cells(0))).toEqual([
      ["1", null],
      ["3", null],
    ]);
    expect(look(cells(1))).toEqual([["3", "held"]]);
    expect(look(cells(2))).toEqual([
      ["1", null],
      ["1", null],
      [null, "none"],
    ]);
    expect(host.querySelectorAll(".ms-strip i.changed")).toHaveLength(0);
    // back to the kinds, the change of kind is marked again
    await choose("Kinds");
    expect(host.querySelectorAll(".ms-strip i.changed")).toHaveLength(1);
  });

  it("shows each candidate's value beside its kind in a visit's pick", async () => {
    await open({ cohort: "ms-followup" });
    await choose("Body region");
    act(() => button(host, /^Subject 5a9f30c6e8b21d41, visit 2: 3D MPRAGE/)!.click());
    const d = host.querySelector("dialog")!;
    const tags = [...d.querySelectorAll(".bundle")].map((b) => [...b.querySelectorAll(".value-tag")].map((t) => [t.textContent, t.getAttribute("data-slot")]));
    expect(tags).toEqual([
      [
        ["3D MPRAGE", "1"],
        ["spine", "3"],
      ],
      [
        ["3D MPRAGE", "1"],
        ["no answer", null],
      ],
    ]);
  });

  it("says under a draft how many take each value under the saved rules beside it", async () => {
    await open({ cohort: "ms-followup" });
    await choose("Body region");
    act(() => button(host.querySelector(".ms-keys")!, "Across the data")!.click());
    await act(async () => {
      await new Promise((done) => setTimeout(done, 350));
    });
    await settle();
    const counts = [...box().querySelectorAll(".ms-kind-row .ms-count")].map((c) => c.textContent);
    expect(counts).toEqual(["1,040 taken of 1,080 (was 1,028)", "2 taken of 30"]);
  });

  /** The step polled alone while it runs, then the map once it is over, for a cohort's page and a dataset's. */
  async function polled(query: Record<string, string>, scope: string) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const reads: string[] = [];
      const engine = await open(query, (c) => {
        if (c.method === "GET" && c.path === "/api/picks/layer-step") {
          reads.push(c.query.toString());
          const st = reads.length === 1 ? stepOf("body_part", { state: "running", progress: { done: 50, total: 100 } }) : stepOf("body_part", { state: "done", answered: 1300, staged: 12 });
          return { status: 200, body: { layer: c.query.get("layer"), operation: "body_part", step: st } };
        }
        if (c.method === "GET" && c.path === "/api/picks/rules" && query.dataset) return { status: 200, body: { ...rulesAnswer(), scope: { kind: "dataset", id: 3, name: query.dataset } } };
        return layerDoors({ body_part: stepOf("body_part", { state: "running", progress: { done: 10, total: 100 } }) })(c);
      });
      await choose("Body region");
      const maps = engine.of("POST", "/api/picks/map").length;
      const subjects = engine.of("POST", "/api/picks/map/subjects").length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      await settle();
      // the step alone, from its own door, not the map, its subjects or its strips, nor the scope's summary
      expect(reads).toEqual([`${scope}&layer=body_region`]);
      expect(engine.calls.some((c) => c.path.startsWith("/api/datasets/") || c.path.startsWith("/api/cohorts/"))).toBe(false);
      expect(engine.of("POST", "/api/picks/map")).toHaveLength(maps);
      expect(engine.of("POST", "/api/picks/map/subjects")).toHaveLength(subjects);
      // over: the map is read again, once
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      await settle();
      expect(reads).toHaveLength(2);
      expect(engine.of("POST", "/api/picks/map").length).toBe(maps + 1);
    } finally {
      vi.useRealTimers();
    }
  }

  it("reads a cohort's step alone again while it runs, from the light door, and the map once it is over", async () => {
    await polled({ cohort: "ms-followup" }, "cohort=ms-followup");
  });

  it("reads a dataset's step alone again while it runs, from the light door, and the map once it is over", async () => {
    await polled({ dataset: "study-big" }, "dataset=study-big");
  });

  it("stops asking for the step and says so where the engine refuses it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let reads = 0;
      const engine2 = await open({ cohort: "ms-followup" }, (c) => {
        if (c.method === "GET" && c.path === "/api/picks/layer-step") {
          reads += 1;
          return { status: 403, body: { error: "this account may not read it" } };
        }
        return layerDoors({ body_part: stepOf("body_part", { state: "running" }) })(c);
      });
      await choose("Body region");
      for (let i = 0; i < 3; i++)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(15_000);
        });
      await settle();
      expect(reads).toBe(1);
      expect(box().textContent).toContain("The step could not be read again: this account may not read it.");
      // Reload reads the map again, and the asking resumes without the note
      const maps = engine2.of("POST", "/api/picks/map").length;
      act(() => button(box(), "Reload")!.click());
      await settle();
      expect(engine2.of("POST", "/api/picks/map").length).toBe(maps + 1);
      expect(box().textContent).not.toContain("could not be read again");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says once on an engine without the step's door that progress is not shown, and offers a Reload, never asking", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const caps = capsWith([...MAIN_SCANS_DOORS, ...RUN_DOORS], [...GRANTS] as Grant[]);
      const engine = await open({ cohort: "ms-followup" }, layerDoors({ body_part: stepOf("body_part", { state: "running" }) }), caps);
      await choose("Body region");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(45_000);
      });
      await settle();
      expect(engine.calls.some((c) => c.path === "/api/picks/layer-step")).toBe(false);
      expect(box().textContent).toContain("This engine does not show the step's progress here.");
      const maps = engine.of("POST", "/api/picks/map").length;
      act(() => button(box(), "Reload")!.click());
      await settle();
      expect(engine.of("POST", "/api/picks/map").length).toBe(maps + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says how many answers wait to be committed once the step has run", async () => {
    await open({ cohort: "ms-followup" }, layerDoors({ body_part: stepOf("body_part", { state: "done", answered: 1300, staged: 12 }) }));
    await choose("Body region");
    expect(box().querySelector(".ms-layer-said")?.textContent).toBe("Body part has run on this cohort · 1,300 of 1,300 answered · 12 answers wait to be committed.");
  });

  it("draws no card's mark from an answer of another layer", async () => {
    await open({ cohort: "ms-followup" }, (c) => {
      // the subjects door still answers the body region while post-contrast is chosen
      if (c.method === "POST" && c.path === "/api/picks/map/subjects" && c.body?.layer === "post_contrast") return layerDoors()({ ...c, body: { ...c.body, layer: "body_region" } });
      return layerDoors()(c);
    });
    await choose("Post-contrast");
    expect(host.querySelectorAll(".ms-card .ms-visit-layer")).toHaveLength(0);
  });

  it("says so where an engine from before answers the map without the layer, and draws no layer", async () => {
    await open({ cohort: "ms-followup" }, () => undefined);
    act(() => button(box(), "Body region")!.click());
    await settle();
    expect(box().textContent).toContain("This engine does not draw layers on the map yet.");
    expect(box().querySelector(".wait")).toBeNull();
    expect(host.querySelectorAll(".ms-visit-layer")).toHaveLength(0);
  });

  it("says subjects, visits, scans and values, never the engine's words, with a layer on", async () => {
    await open({ cohort: "ms-followup" });
    for (const layer of ["Body region", "Body part", "Post-contrast"]) {
      await choose(layer);
      const words = (host.textContent ?? "").toLowerCase();
      for (const w of ["session", "stack", "occasion", "border", "profile", "operation"]) expect(words).not.toContain(w);
    }
  });
});
