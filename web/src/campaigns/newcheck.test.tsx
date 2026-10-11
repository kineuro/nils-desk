// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// New check, the run page and the campaign page of a check (job type 3,
// record 55 H3; the build spec of 2026-10-11, sections 9.1 and 9.2, D2):
// the make body from each choice of the dialog; one press on the run page
// opens it filled, and Start checking makes the check and opens its reader;
// the preview's counts on the foot, what it leaves out in tags with their
// why; the engine's refusals in the dialog's words; from Campaigns, New, the
// run chooser first; the run page's Check column; and the campaign page's
// one next action.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_CAMPAIGNS_CAPS, checkDoorsOf, checkEngine, checkPreview, REASONS, RUN_ID, SAMSEG } from "../../test/layout/check.fixture";
import { CAMPAIGN_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Capabilities } from "../capabilities";
import { RunPage } from "../ops/RunPage";
import { CampaignPage } from "./CampaignPage";
import { CampaignsPage } from "./CampaignsPage";
import { checkBody, checkNameOf, leftOutTags, maskOutputs, previewLine, previewOf, refusalWords, sourceOf } from "./check";
import { draftFor, NewCheck, principalFor, runChoiceOf, type RunChoice } from "./NewCheck";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[], grants = ["campaigns:see", "campaigns:work", "pipelines:see", "review:work"], principal = "rater@site", subject = "rater@site"): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.80" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal, roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.13.0" }], campaigns: CHECK_CAMPAIGNS_CAPS },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject, display_name: "rater", grants, detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

const RUN: RunChoice = runChoiceOf({ id: RUN_ID, pipeline: "samseg-lesions", pipeline_id: 12 }, [SAMSEG as never])!;

describe("the body New check makes", () => {
  const caps = capsWith(checkDoorsOf());
  it("opens filled for a run: its mask output, lesions, results not yet checked, made-on, T1w and FLAIR, the preset, me once", () => {
    expect(maskOutputs(SAMSEG.outputs).map((o) => [o.id, o.sets.map((s) => s.key)])).toEqual([["labels", ["lesions", "structures"]]]);
    expect(maskOutputs([{ id: "brain", kind: "mask" }])[0].sets).toEqual([{ key: "whole", words: "Whole result", kind: "whole" }]);
    const b = checkBody(draftFor(caps, RUN));
    expect(b).toEqual({
      ok: true,
      body: {
        name: "SAMSEG lesions, run 77",
        question: { kind: "check", part_set: "lesions", grain: "result", reasons: REASONS },
        source: { run: RUN_ID, output: "labels", which: "unchecked" },
        panels: ["made_on", "t1w", "flair"],
        raters: ["rater@site"],
        raters_per_item: 1,
        closes_into: "check",
      },
    });
  });

  it("follows each choice: which results, a sample, the set, one item per lesion, the scans beside, the answers, who reads", () => {
    const d = draftFor(caps, RUN);
    expect(sourceOf({ ...d, which: "all" })).toEqual({ run: RUN_ID, output: "labels", which: "all" });
    expect(sourceOf({ ...d, which: "breached" })).toEqual({ run: RUN_ID, output: "labels", which: "breached" });
    expect(sourceOf({ ...d, which: "sample", sample: 25 })).toEqual({ run: RUN_ID, output: "labels", which: "unchecked", sample: 25 });
    const part = checkBody({ ...d, grain: "part" });
    expect(part.ok && (part.body.question as { grain: string }).grain).toBe("part");
    expect(checkBody({ ...d, setKey: "structures", setKind: "labels", grain: "part" })).toMatchObject({ ok: false });
    const roles = checkBody({ ...d, roles: ["t2w"] });
    expect(roles.ok && roles.body.panels).toEqual(["made_on", "t2w"]);
    expect(checkBody({ ...d, roles: ["a", "b", "c", "d", "e", "f", "g", "h"] })).toMatchObject({ ok: false, needs: "at most 8 scans" });
    expect(checkBody({ ...d, reasons: [] })).toMatchObject({ ok: false });
    expect(checkBody({ ...d, reasons: [...REASONS, { id: "eighth", words: "Eighth", needs: "none" }] as never })).toMatchObject({ ok: false });
    const two = checkBody({ ...d, raters: ["rater@site", "adithya@site"], perItem: 2 });
    expect(two.ok && [two.body.raters, two.body.raters_per_item]).toEqual([["rater@site", "adithya@site"], 2]);
    // two readers each asked of one person is one
    const one = checkBody({ ...d, perItem: 2 });
    expect(one.ok && one.body.raters_per_item).toBe(1);
    expect(checkNameOf("synthseg", "Structures", 12)).toBe("SYNTHSEG structures, run 12");
    expect(checkNameOf("segcsvd", "WMH", 9)).toBe("SEGCSVD wmh, run 9");
  });

  it("says the preview's counts on the foot and what it leaves out, each with its why", () => {
    const p = previewOf(checkPreview(checkBody(draftFor(caps, RUN)).ok ? (checkBody(draftFor(caps, RUN)) as { body: Record<string, unknown> }).body : {}) as never);
    expect(previewLine(p, "components", "result")).toBe("336 results · 2,128 lesions · 2 to 3 scans each");
    expect(leftOutTags(p).map((t) => [t.words, t.why])).toEqual([
      ["2 can't be drawn", "2: no scan is known whose grid it is on"],
      ["FLAIR missing for 4", "a visit without that main scan shows one panel fewer"],
    ]);
  });

  it("puts the engine's refusals in the dialog's words, by the row they are about", () => {
    expect(refusalWords("question.reasons: one to 7 reasons, the keys 3 to 9; 0 given")).toBe("Answers: one to 7 reasons, the keys 3 to 9; 0 given");
    expect(refusalWords("panels: flair2 is not a role of the pack's picks: flair, t1w")).toBe("Beside it: flair2 is not a role of the pack's picks: flair, t1w");
    expect(refusalWords("question.grain: part is for a set of components; structures is labels")).toBe("One item per: part is for a set of components; structures is labels");
    expect(refusalWords("source.output: labels is a table; a check is of a mask")).toBe("Look at: labels is a table; a check is of a mask");
    expect(refusalWords("2 result(s) are still being read into their parts")).toBe("2 result(s) are still being read into their parts");
  });

  it("names another desk person as the engine knows them", () => {
    expect(principalFor(capsWith([], undefined, "abc@id.example.org", "abc"), "def")).toBe("def@id.example.org");
    expect(principalFor(capsWith([]), "adithya")).toBe("adithya");
  });
});

describe("the dialog and the pages", () => {
  let host: HTMLDivElement;
  let root: Root;
  let log: Asked[];
  beforeEach(() => {
    log = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    host.remove();
    vi.unstubAllGlobals();
    location.hash = "";
  });
  async function until<T>(what: () => T | null | undefined | false, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = what();
      if (v) return v;
      if (Date.now() > end) throw new Error("waited in vain");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
  }
  const click = async (el: Element | null) => {
    if (!el) throw new Error("nothing to click");
    await act(async () => (el as HTMLElement).click());
  };
  const button = (words: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(words)) ?? null;
  const previews = () => log.filter((a) => a.path === "/api/campaigns/preview");

  it("one press on the run page opens New check filled for the run; Start checking makes it and opens its reader", async () => {
    vi.stubGlobal("fetch", checkEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<RunPage caps={capsWith(checkDoorsOf())} id={RUN_ID} />));
    // the run made masks, one of them not yet checked: Check results is the page's primary act
    const go = await until(() => button("Check results"));
    expect(go.className).toBe("button small");
    expect([...host.querySelectorAll("td .tag")].map((t) => t.textContent)).toEqual(["accepted", "not checked", "not checked"]);
    expect(host.querySelector("td .tag.ok")?.textContent).toBe("accepted");
    await click(go);
    const dialog = await until(() => document.querySelector("dialog.new-check"));
    expect(dialog.querySelector(".eyebrow")?.textContent).toBe("Check results");
    expect(dialog.querySelector("h2")?.textContent).toBe("SAMSEG · lesions");
    expect(dialog.querySelector<HTMLInputElement>(".check-name input")?.value).toBe("SAMSEG lesions, run 77");
    // the counts on the Results keys, the preview's on the foot
    await until(() => dialog.querySelector(".opt-count"));
    expect([...dialog.querySelectorAll('[aria-label="results"] .opt')].map((o) => o.textContent)).toEqual(["Not yet checked338", "All340", "Flagged by the run's checks6", "A sample"]);
    await until(() => dialog.querySelector(".check-preview")?.textContent?.includes("results"));
    expect(dialog.querySelector(".check-preview")?.textContent).toBe("336 results · 2,128 lesions · 2 to 3 scans each");
    const caution = [...dialog.querySelectorAll(".check-foot-line .tag.caution")];
    expect(caution.map((t) => t.textContent)).toEqual(["2 can't be drawn", "FLAIR missing for 4"]);
    expect(caution[0].getAttribute("title")).toBe("2: no scan is known whose grid it is on");
    // only the chosen keys in colour
    expect([...dialog.querySelectorAll('[aria-label="beside it"] .opt.on')].map((o) => o.textContent)).toEqual(["made on", "T1w", "FLAIR"]);
    await click(button("Start checking"));
    await until(() => log.some((a) => a.method === "POST" && a.path === "/api/campaigns"));
    expect(log.find((a) => a.method === "POST" && a.path === "/api/campaigns")?.body).toMatchObject({ source: { run: RUN_ID, output: "labels", which: "unchecked" }, panels: ["made_on", "t1w", "flair"], closes_into: "check" });
    await until(() => location.hash === "#campaigns/52/check");
  });

  it("asks the preview again after a change, and says a refusal in the dialog's words", async () => {
    vi.stubGlobal("fetch", checkEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<NewCheck caps={capsWith(checkDoorsOf())} run={RUN} onClose={() => undefined} />));
    await until(() => document.querySelector(".check-preview")?.textContent?.includes("results"));
    const before = previews().length;
    await click(button("Structures"));
    // a labels set: the structures' preset, one item per result only
    await until(() => previews().length > before);
    const last = previews().at(-1)!.body as { question: { part_set: string; reasons: { id: string }[] } };
    expect(last.question.part_set).toBe("structures");
    expect(last.question.reasons.map((r) => r.id)).toEqual(["boundary_off", "wrong_label", "other"]);
    expect([...document.querySelectorAll('[aria-label="one item per"] .opt')].map((o) => o.textContent)).toEqual(["Result"]);
    expect(document.querySelector("dialog.new-check h2")?.textContent).toBe("SAMSEG · structures");
    // every answer removed but one, then the engine's refusal of a body
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://desk.test");
      if (url.pathname === "/api/campaigns/preview") return new Response(JSON.stringify({ error: "panels: t1w is not a role of the pack's picks: flair" }), { status: 400 });
      return checkEngine({ log })(input, init);
    });
    await click(button("T2w"));
    await until(() => document.querySelector(".check-foot .warn"));
    expect(document.querySelector(".check-foot .warn")?.textContent).toBe("Beside it: t1w is not a role of the pack's picks: flair");
  });

  it("from Campaigns, New: Check results asks which run first, each with its results not yet checked", async () => {
    vi.stubGlobal("fetch", checkEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<CampaignsPage caps={capsWith(checkDoorsOf())} page={null} arg={null} />));
    await click(await until(() => button("Make a campaign")));
    await click(await until(() => button("Check results")));
    const dialog = await until(() => document.querySelector("dialog.new-check"));
    expect(dialog.querySelector("h2")?.textContent).toBe("Which run");
    const run = await until(() => dialog.querySelector(".check-run"));
    // only the run that made masks
    expect(dialog.querySelectorAll(".check-run")).toHaveLength(1);
    expect(run.textContent).toContain("SAMSEG");
    expect(run.textContent).toContain("2 not yet checked");
    await click(run);
    await until(() => document.querySelector("dialog.new-check h2")?.textContent === "SAMSEG · lesions");
  });

  it("the campaign page's items of a check: each answer and outcome by its verdict and the flagged structures by name (T33)", async () => {
    vi.stubGlobal("fetch", checkEngine({ log, items: 4, set: "structures", read: true, status: "closed" }));
    root = createRoot(host);
    await act(async () => root.render(<CampaignPage caps={capsWith(checkDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector("table.campaign-items")?.textContent?.includes("Right-Hippocampus"));
    const rows = [...host.querySelectorAll("table.campaign-items tbody tr")].map((r) => ({ answers: [...r.querySelectorAll(".answer-chip")].map((c) => c.textContent), outcome: r.querySelectorAll("td")[4].textContent }));
    expect(rows[0]).toEqual({ answers: ["rater accepted", "other accepted"], outcome: "accepted · decision 3000" });
    expect(rows[1]).toEqual({ answers: ["rater flagged · Boundary off: Left-Hippocampus, Right-Hippocampus", "other flagged · Boundary off: Left-Hippocampus"], outcome: "flagged · Boundary off: Left-Hippocampus, Right-Hippocampus · decision 3001 · 2 part decisions" });
    expect(rows[2]).toEqual({ answers: ["rater rejected", "other accepted"], outcome: "" });
    const table = host.querySelector("table.campaign-items")?.textContent ?? "";
    for (const bad of ["[object Object]", "null", "reasons", "seen", "shown"]) expect(table).not.toContain(bad);
    // the names are read once per result whose answers flag a part
    expect(log.filter((a) => a.path.startsWith("/api/derivatives/") && a.path.includes("/parts")).map((a) => a.path)).toEqual(["/api/derivatives/9002/parts?set=structures&per_page=500"]);
  });

  it("the campaign page of a check: its counts by verdict and reason, and one next action", async () => {
    vi.stubGlobal("fetch", checkEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<CampaignPage caps={capsWith(checkDoorsOf())} id={String(CAMPAIGN_ID)} />));
    const go = await until(() => [...host.querySelectorAll("a.button")].find((a) => a.textContent === "Continue checking"));
    expect(go.getAttribute("href")).toBe(`#campaigns/${CAMPAIGN_ID}/check`);
    await until(() => host.querySelector(".check-line"));
    expect(host.querySelector(".check-line b")?.textContent).toBe("30 accepted · 1 rejected · 7 flagged");
    expect([...host.querySelectorAll(".check-counts > *")].map((t) => t.textContent)).toEqual(["accepted 30", "rejected 1", "flagged 7", "Under-segmented 3", "Not a lesion 4", "Missed lesion 2"]);
    expect(host.querySelector(".check-counts .tag.blocked")?.textContent).toBe("rejected 1");
    expect(button("Close and write the checks")).toBeNull();
    // none open: the close is the one next action
    await act(async () => root.unmount());
    vi.stubGlobal("fetch", checkEngine({ log, open: 0 }));
    root = createRoot(host);
    await act(async () => root.render(<CampaignPage caps={capsWith(checkDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => button("Close and write the checks"));
    expect([...host.querySelectorAll("a.button")].find((a) => a.textContent === "Continue checking")).toBeUndefined();
  });
});
