// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The Rules page (record 56, 6.4) against an engine whose doors answer as
// the contract has them: it opens on the pack's quality, the pairs the pack
// cannot rank with their counts, pictures and a Mend that fills in the
// change on Change a rule; Change a rule has a form for each of the
// contract's fourteen operations, and Show the effect posts the operation as
// the contract writes it and draws the report, the answers it breaks first
// with their scans; an edit after the effect clears it; a refused change
// says why; the words tab is record 27's page; and a person who may only see
// gets no form and no Mend.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine, type FakeAnswer, type FakeCall } from "./mainScans.fixture";
import { ReviewPage } from "./ReviewPage";
import { FAMILIES, OP_SPECS } from "./ruleOps";
import { BATCHES, EFFECT_RAW, PACK_RAW, RULES_DOORS, SOURCES, TIES } from "./rules.fixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  location.hash = "";
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

const ALL = capsWith(RULES_DOORS, [...GRANTS] as Grant[], [{ name: "mri", version: "1.2.0" }]);

function rulesEngine(over: (c: FakeCall) => FakeAnswer = () => undefined) {
  return fakeEngine((c) => {
    const mine = over(c);
    if (mine) return mine;
    if (c.method === "GET" && c.path === "/api/packs/mri") return { status: 200, body: PACK_RAW };
    if (c.method === "GET" && c.path === "/api/packs/mri/disagreements") return { status: 200, body: TIES };
    if (c.method === "POST" && c.path === "/api/packs/mri/rehearse") return { status: 200, body: EFFECT_RAW };
    if (c.method === "GET" && c.path === "/api/review") return { status: 200, body: { count: 0, items: [] } };
    if (c.method === "GET" && c.path === "/api/review/summary") return { status: 200, body: { by_kind: {}, cohorts: [], none: 0 } };
    if (c.method === "GET" && c.path === "/api/sources") return { status: 200, body: SOURCES };
    if (c.method === "GET" && c.path === "/api/batches") return { status: 200, body: BATCHES };
    if (c.method === "GET" && c.path === "/api/overlays") return { status: 200, body: { overlays: [] } };
    return undefined;
  });
}

async function open(tab: string | null = null, caps = ALL) {
  act(() => root.render(<ReviewPage caps={caps} page="rules" arg={tab} />));
  await settle();
}

const tabs = () => [...host.querySelectorAll<HTMLAnchorElement>(".rules-tabs .opt")].map((a) => `${a.textContent}${a.classList.contains("on") ? " *" : ""}`);
const press = (words: string | RegExp, within: ParentNode = host) => act(() => button(within, words)!.click());

/** A value typed, as a person types it. */
function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const field = (label: string) => host.querySelector<HTMLInputElement>(`.rf input[aria-label="${label}"]`)!;

describe("the Rules page", () => {
  it("opens on the pack's quality: the pairs it cannot rank, their counts and pictures, each with a Mend", async () => {
    rulesEngine();
    await open();
    expect(host.querySelector("h1")?.textContent).toBe("Rules");
    expect(tabs()).toEqual(["Quality *", "Change a rule", "Words"]);
    expect(host.querySelector(".rules-pack")?.textContent).toBe("mri 1.2.0");
    const rows = [...host.querySelectorAll(".rq-tie")];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".rq-axis")?.textContent).toBe("base");
    expect([...rows[0].querySelectorAll(".value-tag")].map((t) => t.textContent)).toEqual(["FLAIR", "T2w"]);
    expect(rows[0].querySelector(".rq-count")?.textContent).toBe("9");
    expect(rows[0].querySelector(".rq-why")?.textContent).toBe("one rule writes both");
    // four pictures and the rest counted
    expect(rows[0].querySelectorAll(".rx-scan img")).toHaveLength(4);
    expect(rows[0].querySelector(".rx-scans .meta")?.textContent).toBe("+5");
    expect(rows[0].querySelector(".rx-scan img")?.getAttribute("src")).toBe("/api/instances/4101/thumb");
    expect(button(rows[0], "Mend")).not.toBeNull();
    // the overrides wait for the engine, and System 1 for being served
    const text = host.textContent ?? "";
    expect(text).toContain("Two rules, no rank2 pairs · 14 scans");
    expect(text).toContain("Counted by the engine's next release.");
    expect(text).toContain("System 1 disagreesNot served yet.");
  });

  it("colours a value by its place among the axis's values, a frame and a bar, never a glyph", async () => {
    rulesEngine();
    await open();
    const tags = [...host.querySelectorAll(".rq-tie")[0].querySelectorAll(".value-tag")];
    // base's values in the pack's order: T1w, T2w, FLAIR, PDw
    expect(tags.map((t) => t.getAttribute("data-slot"))).toEqual(["3", "2"]);
  });

  it("mends a pair from its row: Change a rule opens with the change filled in, and asks what is the person's to give", async () => {
    rulesEngine();
    await open();
    press("Mend", host.querySelectorAll(".rq-tie")[1]);
    expect(location.hash).toBe("#review/rules/change");
    await open("change");
    expect(tabs()).toEqual(["Quality", "Change a rule *", "Words"]);
    expect(host.querySelector(".rf-ops .opt.on")?.textContent).toBe("Change a priority");
    expect(field("Axis").value).toBe("body_part");
    expect(field("Value").value).toBe("neck");
    expect(field("Why").value).toBe("neck over spine on body_part: the pack ranks neither");
    expect(button(host, "Show the effect")!.disabled).toBe(true);
    expect(host.querySelector(".rf-act .meta")?.textContent).toBe("Needs priority.");
    type(field("Priority"), "2");
    expect(button(host, "Show the effect")!.disabled).toBe(false);
    expect(host.querySelector(".rf-says")?.textContent).toBe("Give body_part neck priority 2, for everyone");
  });

  it("has a form for each of the contract's operations", async () => {
    rulesEngine();
    await open("change");
    // grouped by family: words, order, values and names, rules, main scans
    expect([...host.querySelectorAll(".rf-ops .opt")].map((b) => b.textContent)).toEqual(FAMILIES.flatMap((f) => OP_SPECS.filter((s) => s.family === f.family).map((s) => s.title)));
    expect([...host.querySelectorAll(".rf-family-name")].map((b) => b.textContent)).toEqual(["Words", "Order", "Values and names", "Rules", "Main scans"]);
    for (const s of OP_SPECS) {
      press(s.title, host.querySelector(".rf-ops")!);
      expect(host.querySelector(".rf-legend .eyebrow")?.textContent).toBe(s.title);
      expect(host.querySelectorAll(".rf-body .rf-row").length, s.op).toBeGreaterThan(1);
      // a pick operation is for everyone, and says so rather than offer a scope
      expect(host.querySelector('.rf-body [aria-label="For"]') === null, s.op).toBe(s.packOnly);
    }
  });

  it("shows a change's effect before anything is proposed: the operation as the contract writes it, then the report, the answers it breaks first with their scans", async () => {
    const engine = rulesEngine();
    await open("change");
    type(field("Axis"), "base");
    type(field("Value"), "FLAIR");
    type(field("Words"), "dark fluid");
    type(field("Why"), "dark fluid is FLAIR");
    press("Show the effect");
    await settle();
    const asked = engine.of("POST", "/api/packs/mri/rehearse");
    expect(asked).toHaveLength(1);
    expect(asked[0].body).toEqual({ operations: [{ op: "add_words", axis: "base", value: "FLAIR", words: ["dark fluid"], scope: "pack", reason: "dark fluid is FLAIR", evidence: "written on the Rules page" }], examples: 5 });
    expect(host.querySelector(".rx-line")?.textContent).toBe("Moves 50 scans · base T2w → FLAIR, 47 scans · base nothing → FLAIR, 3 scans · 17 main scans change · fixes 47, breaks 3");
    expect(host.querySelector(".rx-reach")?.textContent).toBe("A new rules version, mri 1.2.1 (from 1.2.0), for everyone · replayed over 1,003 scans, 4 sealed left out in 0.9 s");
    const breaks = host.querySelector(".rx-breaks")!;
    expect(breaks.querySelector(".rx-breaks-head")?.textContent).toBe("Breaks 3 answers people settled");
    // the answers that changed alike in one row, each scan named and pictured
    expect([...breaks.querySelectorAll(".rx-cases li")].map((l) => l.getAttribute("aria-label"))).toEqual(["base T2w → FLAIR, settled T2w"]);
    expect(breaks.querySelector(".rx-case")?.textContent).toBe("baseT2w→FLAIRsettled T2w · 3 scans");
    expect([...breaks.querySelectorAll(".rx-scan .rx-id")].map((e) => e.textContent)).toEqual(["3301", "3302", "3303"]);
    expect([...breaks.querySelectorAll(".rx-case .value-tag")].map((t) => t.getAttribute("data-slot"))).toEqual(["2", "3"]);
    // the moves per axis, from what to what, with their datasets and pictures
    const move = host.querySelector(".rx-move")!;
    expect([...move.querySelectorAll(".value-tag")].map((t) => t.textContent)).toEqual(["T2w", "FLAIR"]);
    expect(move.querySelector(".rx-count")?.textContent).toBe("47");
    expect(move.querySelector(".rx-where")?.textContent).toBe("study-big 40, ward-c 7 · SIEMENS 29, GE 18");
    expect(move.querySelectorAll(".rx-scan")).toHaveLength(5);
    expect(move.querySelector(".rx-scan")?.getAttribute("title")).toBe("T2w_TSE → FLAIR_TSE");
    // each part behind its line
    const sums = [...host.querySelectorAll(".rx-sec > summary")].map((s) => s.textContent);
    expect(sums).toEqual([
      "Moves50 scans move on 1 axis",
      "Answers we knowfixes 47, breaks 3, net +44, on 1,200 settled answers",
      "Names50 names and 50 BIDS names change",
      "Main scans17 picks move of 412 · 2 borders raised · 4 settled",
      "ReviewScans asked: 7 → 4",
      "ChecksThe pack's own cases hold",
    ]);
    // nothing proposes here until the engine keeps proposals; the next action is said
    expect(button(host, "Propose it")).toBeNull();
    expect(host.querySelector(".rf-act")?.textContent).toContain("Proposing a change waits for the engine to keep proposals.");
  });

  it("clears the effect at any edit, so what is proposed is what was shown", async () => {
    rulesEngine();
    await open("change");
    type(field("Axis"), "base");
    type(field("Value"), "FLAIR");
    type(field("Words"), "dark fluid");
    type(field("Why"), "dark fluid is FLAIR");
    press("Show the effect");
    await settle();
    expect(host.querySelector(".rx")).not.toBeNull();
    type(field("Words"), "dark fluid, darkfluid");
    expect(host.querySelector(".rx")).toBeNull();
    expect(button(host, "Show the effect")!.disabled).toBe(false);
  });

  it("says why the engine refused a change", async () => {
    rulesEngine((c) => (c.method === "POST" && c.path === "/api/packs/mri/rehearse" ? { status: 400, body: { error: "base has no value FLAIRX" } } : undefined));
    await open("change");
    type(field("Axis"), "base");
    type(field("Value"), "FLAIRX");
    type(field("Words"), "x");
    type(field("Why"), "a test");
    press("Show the effect");
    await settle();
    expect(host.querySelector(".rf-refused")?.textContent).toBe("The change was refused: base has no value FLAIRX");
    expect(host.querySelector(".rx")).toBeNull();
  });

  it("scopes a change to a dataset the sources door lists, a site its root, or a batch", async () => {
    const engine = rulesEngine();
    await open("change");
    press("A dataset", host.querySelector('.rf-body [aria-label="For"]')!);
    const which = field("Which dataset");
    expect([...host.querySelectorAll(`#${which.getAttribute("list")} option`)].map((o) => o.getAttribute("value"))).toEqual(["study-big", "ward-c"]);
    press("A site", host.querySelector('.rf-body [aria-label="For"]')!);
    expect([...host.querySelectorAll(`#${field("Which site").getAttribute("list")} option`)].map((o) => o.getAttribute("value"))).toEqual(["archive"]);
    press("A batch", host.querySelector('.rf-body [aria-label="For"]')!);
    // the pseudonymise batch of a thread is left out: its digest carries the name
    expect([...host.querySelectorAll(`#${field("Which batch").getAttribute("list")} option`)].map((o) => o.getAttribute("value"))).toEqual(["12"]);
    press("A dataset", host.querySelector('.rf-body [aria-label="For"]')!);
    type(field("Which dataset"), "study-big");
    type(field("Axis"), "base");
    type(field("Value"), "FLAIR");
    type(field("Words"), "dark fluid");
    type(field("Why"), "study-big's word");
    press("Show the effect");
    await settle();
    expect((engine.of("POST", "/api/packs/mri/rehearse")[0].body?.operations as { scope: string }[])[0].scope).toBe("dataset:study-big");
  });

  it("keeps record 27's words as a tab of its own", async () => {
    rulesEngine();
    await open("words");
    expect(tabs()).toEqual(["Quality", "Change a rule", "Words *"]);
    expect(host.querySelector(".rail")).not.toBeNull();
    expect([...host.querySelectorAll(".rail [role=tab] span:first-child")].map((s) => s.textContent)).toEqual(["technique", "base", "body_part", "post_contrast"]);
  });

  it("offers a person who may only see no form and no Mend", async () => {
    rulesEngine();
    await open(null, capsWith(RULES_DOORS, ["review:see", "data:see"], [{ name: "mri", version: "1.2.0" }]));
    expect(tabs()).toEqual(["Quality *", "Words"]);
    expect(host.querySelectorAll(".rq-tie")).toHaveLength(2);
    expect(button(host, "Mend")).toBeNull();
    // an address that names the form opens the quality instead
    await open("change", capsWith(RULES_DOORS, ["review:see", "data:see"], [{ name: "mri", version: "1.2.0" }]));
    expect(tabs()).toEqual(["Quality *", "Words"]);
  });

  it("says the pack's ties plainly when there are none, and when this engine does not gather them", async () => {
    rulesEngine((c) => (c.path === "/api/packs/mri/disagreements" ? { status: 200, body: { pack: "mri", stacks: 0, pairs: [] } } : undefined));
    await open();
    expect(host.textContent).toContain("The pack ranks every answer it gives.");
    act(() => root.unmount());
    root = createRoot(host);
    rulesEngine();
    await open("quality", capsWith(RULES_DOORS.filter((d) => d !== "GET /api/packs/{name}/disagreements"), [...GRANTS] as Grant[], [{ name: "mri", version: "1.2.0" }]));
    expect(host.textContent).toContain("This engine does not gather the pack's quality.");
  });
});
