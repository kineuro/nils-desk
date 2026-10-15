// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The proposals on the Rules page (record 56, 5.3, 5.6, 6.4 and 6.5), against
// an engine that keeps them as the contract has it: the page opens on them
// while one waits; each is an approval card that says its effect in a line,
// where it lands, and every answer it breaks with its scans, before any
// button; Adopt is one press on the decide door, and one line follows the
// re-sort until it ends and says what it did; a stale one is rehearsed again
// first; Reject asks why; Details opens the stored report; a refusal is
// said; Propose it after an effect opens the new proposal; Change it puts
// the one operation back in the form; a dataset narrows the page; and a
// person who may only see adopts nothing.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine, type FakeAnswer, type FakeCall } from "./mainScans.fixture";
import { ReviewPage } from "./ReviewPage";
import { FOLLOW } from "./RuleApproval";
import { BATCHES, EFFECT_RAW, PACK_RAW, PROPOSAL_ADOPTED, PROPOSAL_DOORS, PROPOSAL_FULL, PROPOSAL_SCOPED, PROPOSALS_LIST, QUALITY_RAW, SOURCES, listed } from "./rules.fixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  location.hash = "";
  FOLLOW.ms = 5;
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

const ALL = capsWith(PROPOSAL_DOORS, [...GRANTS] as Grant[], [{ name: "mri", version: "1.2.0" }]);
const P = "/api/packs/mri/proposals";

function engine(over: (c: FakeCall) => FakeAnswer = () => undefined) {
  return fakeEngine((c) => {
    const mine = over(c);
    if (mine) return mine;
    if (c.method === "GET" && c.path === "/api/packs/mri") return { status: 200, body: PACK_RAW };
    if (c.method === "GET" && c.path === "/api/packs/mri/quality") return { status: 200, body: QUALITY_RAW };
    if (c.method === "POST" && c.path === "/api/packs/mri/rehearse") return { status: 200, body: EFFECT_RAW };
    if (c.method === "GET" && c.path === P) {
      const dataset = c.query.get("dataset");
      const status = c.query.get("status");
      const all = PROPOSALS_LIST.proposals.filter((p) => (!dataset || (p.datasets as string[]).includes(dataset)) && (!status || p.status === status));
      return { status: 200, body: { ...PROPOSALS_LIST, count: all.length, proposals: all.slice(0, Number(c.query.get("limit") ?? 100)) } };
    }
    if (c.method === "GET" && c.path === `${P}/12`) return { status: 200, body: PROPOSAL_FULL };
    if (c.method === "GET" && c.path === `${P}/13`) return { status: 200, body: PROPOSAL_SCOPED };
    if (c.method === "GET" && c.path === `${P}/9`) return { status: 200, body: PROPOSAL_ADOPTED };
    if (c.method === "GET" && c.path === "/api/review") return { status: 200, body: { count: 0, items: [] } };
    if (c.method === "GET" && c.path === "/api/review/summary") return { status: 200, body: { by_kind: {}, cohorts: [], none: 0 } };
    if (c.method === "GET" && c.path === "/api/sources") return { status: 200, body: SOURCES };
    if (c.method === "GET" && c.path === "/api/batches") return { status: 200, body: BATCHES };
    if (c.method === "GET" && c.path === "/api/overlays") return { status: 200, body: { overlays: [] } };
    return undefined;
  });
}

async function open(tab: string | null = null, opts: { sub?: string | null; query?: Record<string, string>; caps?: typeof ALL } = {}) {
  act(() => root.render(<ReviewPage caps={opts.caps ?? ALL} page="rules" arg={tab} sub={opts.sub ?? null} query={opts.query} />));
  await settle(8);
}

const tabs = () => [...host.querySelectorAll<HTMLAnchorElement>(".rules-tabs .opt")].map((a) => `${a.textContent}${a.classList.contains("on") ? " *" : ""}`);
const cardOf = (id: number) => host.querySelector<HTMLElement>(`#rule-change-${id} .rule-card`)!;
const press = (words: string | RegExp, within: ParentNode = host) => act(() => button(within, words)!.click());
const foot = (card: HTMLElement) => [...card.querySelectorAll(".approval-foot button")].map((b) => b.textContent);

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the proposals", () => {
  it("open the page while one waits, each on its approval card: its effect in a line, where it lands, and every answer it breaks with its scans before any button", async () => {
    engine();
    await open();
    expect(tabs()).toEqual(["Proposals2 *", "Quality", "Change a rule", "Words"]);
    const scoped = cardOf(13);
    expect(scoped.querySelector(".approval-kind")?.textContent).toBe("Rule changewaits for you");
    expect(scoped.querySelector(".approval-title")?.textContent).toBe('Add "mdc" to post_contrast given, for dataset ward-c');
    expect(scoped.querySelector(".rule-line")?.textContent).toBe("Moves 12 scans · post_contrast not_given → given, 12 · fixes 4, breaks 0");
    expect(scoped.querySelector(".rule-lands")?.textContent).toBe("Only dataset ward-c · ward-c writes mdc for contrast given");
    expect(scoped.querySelector(".rx-breaks")).toBeNull();
    // no card names who made it
    expect(scoped.textContent).not.toContain("nils");
    const pack = cardOf(12);
    expect(pack.querySelector(".rule-line")?.textContent).toBe("Moves 50 scans · base T2w → FLAIR, 47 · base nothing → FLAIR, 3 · fixes 47, breaks 3");
    expect(pack.querySelector(".rule-lands")?.textContent).toBe("For everyone: mri 1.2.1 · dark fluid is FLAIR");
    const breaks = pack.querySelector(".rx-breaks")!;
    expect(breaks.querySelector(".rx-breaks-head")?.textContent).toBe("Breaks 3 answers people settled");
    expect([...breaks.querySelectorAll(".rx-scan img")].map((i) => i.getAttribute("src"))).toEqual(["/api/instances/3301/thumb", "/api/instances/3302/thumb", "/api/instances/3303/thumb"]);
    // the breaks come before the buttons
    expect(breaks.compareDocumentPosition(pack.querySelector(".approval-foot")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(foot(pack)).toEqual(["Adopt", "Reject", "Details"]);
    // the decided ones folded, the adopted one with what its re-sort did
    const decided = host.querySelector<HTMLDetailsElement>(".rp-decided")!;
    expect(decided.open).toBe(false);
    expect(decided.querySelector("summary")?.textContent).toBe("Decided1 adopted · 0 not adopted");
    expect(cardOf(9).querySelector(".rule-applied")?.textContent).toBe("Written as mri 1.2.0, to release · Re-sorted 1,003 scans: 51 moved (technique 51)");
    // the values that changed most first, a tie by name
    expect(cardOf(9).querySelector(".rule-measured")?.textContent).toBe("technique MDME 30 → 81 · SE 120 → 69");
  });

  it("are adopted with one press on the decide door; one line follows the re-sort until it ends, and says what it did", async () => {
    let reads = 0;
    const e = engine((c) => {
      if (c.method === "POST" && c.path === `${P}/12/decide`) return { status: 202, body: { proposal: 12, status: "adopted", job: 812, version: { pack: "mri", version: "1.2.1" }, scopes: ["pack"] } };
      if (c.method === "GET" && c.path === `${P}/12` && e.of("POST", `${P}/12/decide`).length > 0) {
        reads += 1;
        const version = { pack: "mri", version: "1.2.1", from: "1.2.0", tag: "pack-mri-v1.2.1", state: "to_release", kept: "k", files: ["axes/base.yml"] };
        if (reads < 2) return { status: 200, body: { ...PROPOSAL_FULL, status: "adopted", version, job: { id: 812, state: "running" }, applied: { state: "running", expected: { moved: 50 }, measured: null } } };
        return {
          status: 200,
          body: {
            ...PROPOSAL_FULL,
            status: "adopted",
            version,
            job: { id: 812, state: "done" },
            applied: { state: "done", expected: { moved: 50 }, measured: { scope: ["pack"], stacks: 1003, moved: { stacks: 50, axes: { base: 50 } }, before: { base: { T2w: 300, FLAIR: 120 } }, after: { base: { T2w: 253, FLAIR: 170 } }, job: 812, at: "x" } },
          },
        };
      }
      return undefined;
    });
    await open();
    press("Adopt", cardOf(12));
    await settle(4);
    expect(e.of("POST", `${P}/12/decide`)[0].body).toEqual({ decision: "adopt" });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 40));
    });
    await settle(8);
    const card = cardOf(12);
    expect(card.querySelector(".approval-kind .tag")?.textContent).toBe("adopted");
    expect(card.querySelector(".rule-applied")?.textContent).toBe("Written as mri 1.2.1, to release · Re-sorted 1,003 scans: 50 moved (base 50)");
    expect(card.querySelector(".rule-measured")?.textContent).toBe("base FLAIR 120 → 170 · T2w 300 → 253");
    expect(foot(card)).toEqual(["Details"]);
    // the card stays where it was, and the tab's count says one less waits
    expect(host.querySelector("#rule-change-12")?.closest(".rp-decided")).toBeNull();
    expect(tabs()[0]).toBe("Proposals1 *");
    expect(host.querySelector(".said")?.textContent).toContain("Re-sorted 1,003 scans: 50 moved (base 50)");
  });

  it("are rehearsed again first where the pack moved on since", async () => {
    const stale = { ...PROPOSAL_FULL, stale: true, on: "1.1.0" };
    const e = engine((c) => {
      if (c.method === "GET" && c.path === P) return { status: 200, body: { ...PROPOSALS_LIST, counts: { proposed: 1, adopted: 0, rejected: 0, retired: 0 }, proposals: [listed(stale)] } };
      if (c.method === "POST" && c.path === `${P}/12/rehearse`) return { status: 200, body: PROPOSAL_FULL };
      return undefined;
    });
    await open();
    const card = cardOf(12);
    expect([...card.querySelectorAll(".approval-kind .tag")].map((t) => t.textContent)).toEqual(["rehearse again"]);
    // one action: no Adopt, no Change, no Reject on a rehearsal that is out of date
    expect(foot(card)).toEqual(["Rehearse again", "Details"]);
    press("Rehearse again", card);
    await settle(4);
    expect(e.of("POST", `${P}/12/rehearse`)).toHaveLength(1);
    expect(foot(cardOf(12))).toEqual(["Adopt", "Change it", "Reject", "Details"]);
  });

  it("show a retired scoped change as retired, from its overlay, with why and no action", async () => {
    const retired = {
      ...PROPOSAL_SCOPED,
      status: "retired",
      evidence: { overlay: 5, made_by: "overlay.adopt", name: "ward-words", version: "1.0.0" },
      applied: { state: "done", expected: null, measured: null, retired: { by: { proposal: 20 }, at: "2026-10-15T09:00:00Z", why: "the overlay ward-words 1.1.0 was adopted after it" } },
    };
    engine((c) => (c.method === "GET" && c.path === P ? { status: 200, body: { ...PROPOSALS_LIST, counts: { proposed: 0, adopted: 1, rejected: 0, retired: 1 }, proposals: [listed(retired), listed(PROPOSAL_ADOPTED)] } } : undefined));
    await open("proposals");
    const card = cardOf(13);
    expect(card.querySelector(".approval-kind .tag")?.textContent).toBe("retired");
    expect(card.querySelector(".rule-overlay")?.textContent).toBe("From the overlay ward-words 1.0.0");
    expect(card.querySelector(".rule-applied")?.textContent).toBe("Retired: the overlay ward-words 1.1.0 was adopted after it");
    expect(foot(card)).toEqual(["Details"]);
    expect(host.querySelector(".rp-decided summary")?.textContent).toBe("Decided1 adopted · 0 not adopted · 1 retired");
  });

  it("shows the card's counts as the engine states them, not the length of the list", async () => {
    const said = { ...PROPOSAL_FULL, card: { ...PROPOSAL_FULL.card, breaks: 5 } };
    engine((c) => (c.method === "GET" && c.path === P ? { status: 200, body: { ...PROPOSALS_LIST, proposals: [listed(said)] } } : undefined));
    await open();
    expect(cardOf(12).querySelector(".rule-line")?.textContent).toContain("fixes 47, breaks 5");
    expect(cardOf(12).querySelector(".rx-breaks-head")?.textContent).toBe("Breaks 5 answers people settled · the first 3 shown");
  });

  it("shows a proposal as to rehearse again where an adoption is refused because the changes in force moved", async () => {
    let refused = false;
    const e = engine((c) => {
      if (c.method === "POST" && c.path === `${P}/12/decide`) {
        refused = true;
        return { status: 409, body: { error: "rehearsed before another change was adopted: rehearse it again" } };
      }
      if (c.method === "GET" && c.path === `${P}/12`) return { status: 200, body: refused ? { ...PROPOSAL_FULL, stale: true } : PROPOSAL_FULL };
      return undefined;
    });
    await open();
    press("Adopt", cardOf(12));
    await settle(6);
    expect(e.of("POST", `${P}/12/decide`)).toHaveLength(1);
    expect(foot(cardOf(12))).toEqual(["Rehearse again", "Details"]);
  });

  it("send an overlay to its proposal's card and never adopt it at the overlays door", async () => {
    const made = {
      ...PROPOSAL_SCOPED,
      id: 21,
      evidence: { overlay: 5, made_by: "overlay.adopt", name: "ward-words", version: "1.0.0" },
    };
    const e = engine((c) => {
      if (c.method === "GET" && c.path === "/api/overlays") return { status: 200, body: { overlays: [{ id: 5, name: "ward-words", version: "1.0.0", status: "proposed", scope: "dataset ward-c" }] } };
      if (c.method === "GET" && c.path === "/api/overlays/5") return { status: 200, body: { id: 5, name: "ward-words", version: "1.0.0", status: "proposed", scope: "dataset ward-c", document: {} } };
      if (c.method === "GET" && c.path === P) return { status: 200, body: { ...PROPOSALS_LIST, proposals: [listed(PROPOSAL_FULL), listed(made)] } };
      if (c.method === "POST" && c.path === "/api/overlays/5/adopt") return { status: 202, body: { job: 1, overlay: 5, status: "adopted" } };
      return undefined;
    });
    await open("words");
    press("Review", host.querySelector(".proposals")!);
    await settle(6);
    expect(e.of("POST", "/api/overlays/5/adopt")).toHaveLength(0);
    expect(location.hash).toBe("#review/rules/proposals/21");
  });

  it("are rejected with a why", async () => {
    const e = engine((c) => (c.method === "POST" && c.path === `${P}/13/decide` ? { status: 200, body: { proposal: 13, status: "rejected" } } : undefined));
    await open();
    press("Reject", cardOf(13));
    type(cardOf(13).querySelector<HTMLInputElement>('input[aria-label="Why not"]')!, "mdc is not ours");
    press("Reject it", cardOf(13));
    await settle(4);
    expect(e.of("POST", `${P}/13/decide`)[0].body).toEqual({ decision: "reject", why: "mdc is not ours" });
    expect(cardOf(13).querySelector(".approval-kind .tag")?.textContent).toBe("not adopted");
    expect(cardOf(13).textContent).toContain("Not adopted: mdc is not ours");
  });

  it("open their stored report in Details, and say a refusal plainly", async () => {
    engine((c) => (c.method === "POST" && c.path === `${P}/12/decide` ? { status: 409, body: { error: "the pack directory cannot take a new version" } } : undefined));
    await open();
    press("Details", cardOf(12));
    await settle(4);
    expect([...cardOf(12).querySelectorAll(".rx-sec > summary .eyebrow")].map((s) => s.textContent)).toEqual(["Moves", "Answers we know", "Names", "Main scans", "Review", "Checks"]);
    // the breaks are said once, on the card itself
    expect(cardOf(12).querySelectorAll(".rx-breaks")).toHaveLength(1);
    press("Adopt", cardOf(12));
    await settle(4);
    expect(cardOf(12).querySelector(".approval-foot .warn")?.textContent).toBe("Refused: the pack directory cannot take a new version");
    expect(cardOf(12).querySelector(".approval-kind .tag")?.textContent).toBe("waits for you");
  });

  it("open one by its address, its report shown", async () => {
    engine();
    await open("proposals", { sub: "12" });
    expect(host.querySelector("#rule-change-12")?.classList.contains("opened")).toBe(true);
    expect(cardOf(12).querySelector(".rx")).not.toBeNull();
    expect(cardOf(13).querySelector(".rx")).toBeNull();
  });

  it("are made from Change a rule once its effect is shown, and the new one opens", async () => {
    const e = engine((c) => (c.method === "POST" && c.path === P ? { status: 201, body: { ...PROPOSAL_FULL, id: 14 } } : undefined));
    await open("change");
    const field = (label: string) => host.querySelector<HTMLInputElement>(`.rf input[aria-label="${label}"]`)!;
    type(field("Axis"), "base");
    type(field("Value"), "FLAIR");
    type(field("Words"), "dark fluid");
    type(field("Why"), "dark fluid is FLAIR");
    expect(button(host, "Propose it")).toBeNull();
    press("Show the effect");
    await settle(4);
    press("Propose it");
    await settle(4);
    expect(e.of("POST", P)[0].body).toEqual({ operations: [{ op: "add_words", axis: "base", value: "FLAIR", words: ["dark fluid"], scope: "pack", reason: "dark fluid is FLAIR", evidence: "written on the Rules page" }], examples: 5 });
    expect(location.hash).toBe("#review/rules/proposals/14");
    expect(host.querySelector(".said")?.textContent).toContain('Proposed: Add "dark fluid" to base FLAIR. It waits for a person to adopt it.');
  });

  it("are changed by putting their one operation back in the form, the proposal as its evidence", async () => {
    const e = engine();
    await open();
    // Change it shows once the proposal is read whole, which says it holds one operation
    expect(foot(cardOf(13))).toEqual(["Adopt", "Reject", "Details"]);
    press("Details", cardOf(13));
    await settle(4);
    press("Change it", cardOf(13));
    expect(location.hash).toBe("#review/rules/change");
    await open("change");
    const field = (label: string) => host.querySelector<HTMLInputElement>(`.rf input[aria-label="${label}"]`)!;
    expect(field("Axis").value).toBe("post_contrast");
    expect(field("Value").value).toBe("given");
    expect(field("Words").value).toBe("mdc");
    expect(field("Which dataset").value).toBe("ward-c");
    expect(field("Why").value).toBe("ward-c writes mdc for contrast given");
    press("Show the effect");
    await settle(4);
    expect((e.of("POST", "/api/packs/mri/rehearse")[0].body?.operations as Record<string, unknown>[])[0]).toEqual({
      op: "add_words",
      axis: "post_contrast",
      value: "given",
      words: ["mdc"],
      scope: "dataset:ward-c",
      reason: "ward-c writes mdc for contrast given",
      evidence: { proposal: 13 },
    });
  });

  it("are a dataset's alone where the page was opened for it, and so is the quality", async () => {
    const e = engine();
    await open(null, { query: { dataset: "ward-c" } });
    expect(e.of("GET", P).map((c) => c.query.get("dataset"))).toEqual(["ward-c", "ward-c"]);
    expect(tabs()).toEqual(["Proposals2 *", "Quality", "Change a rule", "Words"]);
    expect([...host.querySelectorAll(".rules-tabs a")].map((a) => a.getAttribute("href"))).toEqual(["#review/rules/proposals?dataset=ward-c", "#review/rules/quality?dataset=ward-c", "#review/rules/change?dataset=ward-c", "#review/rules/words?dataset=ward-c"]);
    expect(host.querySelector(".review-dataset .tag")?.textContent).toBe("ward-c");
    await open("quality", { query: { dataset: "ward-c" } });
    expect(e.of("GET", "/api/packs/mri/quality").map((c) => c.query.get("dataset"))).toEqual(["ward-c"]);
  });

  it("open on the quality when none waits", async () => {
    engine((c) => (c.method === "GET" && c.path === P ? { status: 200, body: { pack: "mri", count: 0, counts: { proposed: 0, adopted: 0, rejected: 0 }, proposals: [] } } : undefined));
    await open();
    expect(tabs()).toEqual(["Proposals0", "Quality *", "Change a rule", "Words"]);
    await open("proposals");
    expect(host.querySelector(".rp-none")?.textContent).toBe("No change waits for you.Change a rule");
  });

  it("are read, and adopted by nobody, by a person who may only see", async () => {
    engine();
    await open(null, { caps: capsWith(PROPOSAL_DOORS, ["review:see", "data:see"], [{ name: "mri", version: "1.2.0" }]) });
    expect(tabs()).toEqual(["Proposals2 *", "Quality", "Words"]);
    expect(foot(cardOf(12))).toEqual(["Details"]);
    expect(cardOf(12).querySelector(".approval-foot .meta")?.textContent).toBe("Adopting needs work on Review and on Data.");
    expect(cardOf(12).querySelector(".rx-breaks")).not.toBeNull();
  });
});

describe("the quality report", () => {
  it("adds the overrides by rule pair, each with the change that would turn it round, and says System 1 is not served yet", async () => {
    engine((c) => (c.method === "GET" && c.path === P ? { status: 200, body: { pack: "mri", count: 0, counts: { proposed: 0, adopted: 0, rejected: 0 }, proposals: [] } } : undefined));
    await open("quality");
    const rows = [...host.querySelectorAll(".rq-over")];
    expect(rows.map((r) => [r.querySelector(".rq-axis")?.textContent, r.querySelector(".rq-count")?.textContent, r.querySelector(".rq-why")?.textContent])).toEqual([
      ["technique", "51", "its rule set runs first"],
      ["base", "47", "it comes first in its set"],
      ["base", "2", "a person's answer"],
    ]);
    expect([...rows[0].querySelectorAll(".value-tag")].map((t) => t.textContent)).toEqual(["MDME", "SE"]);
    expect(button(rows[2], "Turn it round")).toBeNull();
    expect(host.textContent).toContain("One rule over another3 pairs · 100 scans");
    expect(host.textContent).toContain("System 1 disagreesNot served yet.");
    press("Turn it round", rows[0]);
    expect(location.hash).toBe("#review/rules/change");
    await open("change");
    expect(host.querySelector(".rf-ops .opt.on")?.textContent).toBe("Move a rule set");
    expect(host.querySelector<HTMLInputElement>('.rf input[aria-label="Rule set"]')!.value).toBe("technique");
    expect(host.querySelector<HTMLInputElement>('.rf input[aria-label="Before what"]')!.value).toBe("symri");
  });
});
