// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The A/B view (record 48, the reference read by judges): the sheet read as
// the engine serves it, the agreed axes filled in, a letter settling the lit
// split axis and moving on, neither and can't tell, a cause once decided,
// a localizer's unasked axes, and the answer and its causes sent on Enter.
// Nothing on the page names a voter.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AB_CAMPAIGN, abDoorsOf, abEngine, LOCALIZER_SHEET, SHEET, SUMMARY } from "../../test/layout/ab.fixture";
import { CAMPAIGN_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { abKey, abProblem, answerOf, choose, isAb, reset, sendsWords, shareWords, sheetOf, startOf, summaryOf, toggleCause, unsettled } from "./ab";
import { AbReader } from "./AbReader";
import { QUESTION } from "../../test/layout/reader.fixture";
import { Workspace } from "./Workspace";
import { forgetReadings } from "./readerDoors";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[]): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.57" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.10.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

describe("the sheet and the choices", () => {
  const sheet = sheetOf(SHEET as unknown as Json);

  it("reads the sheet and fills in what the voters agree on, the keys on the first split axis", () => {
    expect(sheet.rows.map((r) => [r.axis, r.split, r.candidates.map((c) => c.label).join("")])).toEqual([
      ["provenance", false, "A"],
      ["technique", true, "AB"],
      ["modifier", false, "A"],
      ["construct", false, "A"],
      ["base", false, "A"],
      ["body_part", true, "AB"],
      ["post_contrast", false, "A"],
    ]);
    const st = startOf(sheet);
    expect(unsettled(sheet, st)).toEqual(["technique", "body_part"]);
    expect(st.active).toBe(1);
    expect(answerOf(sheet, st)).toBeNull();
  });

  it("settles the lit axis by a letter and moves on; neither and can't tell; the answer names every axis", () => {
    let st = startOf(sheet);
    st = choose(sheet, st, { kind: "candidate", label: "B" });
    expect(st.active).toBe(5);
    expect(st.last).toBe("technique");
    st = choose(sheet, st, { kind: "cant_tell" });
    expect(unsettled(sheet, st)).toEqual([]);
    expect(answerOf(sheet, st)).toEqual({ provenance: "RawRecon", technique: "TSE", modifier: ["FLAIR"], construct: [], base: "T2w", body_part: "cant_tell", post_contrast: "not_given" });
    // neither: a value of one's own on an agreed axis, which is then a decision
    st = choose(sheet, st, { kind: "free", value: "PDw" }, 4);
    expect(answerOf(sheet, st)?.base).toBe("PDw");
    expect(st.last).toBe("base");
    expect(sendsWords(sheet, st)).toContain("technique B");
    expect(sendsWords(sheet, st)).toContain("base neither");
    // back to the agreed value: no longer a decision, its cause gone
    st = toggleCause(st, "base", "rater_error");
    st = reset(sheet, st, 4);
    expect(answerOf(sheet, st)?.base).toBe("T2w");
    expect(st.causes.base).toBeUndefined();
  });

  it("gives the last decided axis a cause, and takes it away again", () => {
    let st = choose(sheet, startOf(sheet), { kind: "candidate", label: "A" });
    st = toggleCause(st, st.last!, "convention_gap");
    expect(st.causes).toEqual({ technique: "convention_gap" });
    st = toggleCause(st, "technique", "convention_gap");
    expect(st.causes).toEqual({});
  });

  it("asks a localizer its provenance and body part, the rest not asked", () => {
    const loc = sheetOf(LOCALIZER_SHEET as unknown as Json);
    const st = startOf(loc);
    expect(unsettled(loc, st)).toEqual([]);
    expect(answerOf(loc, st)).toEqual({ provenance: "Localizer", technique: "not_asked", modifier: "not_asked", construct: "not_asked", base: "not_asked", body_part: "brain", post_contrast: "not_asked" });
  });

  it("holds the answer to the pack while it is chosen", () => {
    let st = choose(sheet, startOf(sheet), { kind: "candidate", label: "B" });
    st = choose(sheet, st, { kind: "candidate", label: "B" });
    expect(abProblem(QUESTION, sheet, st)).toBeNull();
    st = choose(sheet, st, { kind: "free", value: ["FLAIR", "STIR"] }, 2);
    expect(abProblem(QUESTION, sheet, st)).toContain("IR_CONTRAST");
  });

  it("maps the keys: letters, neither, can't tell, the rows, a cause, the answer; nothing from a field", () => {
    const o = { inField: false, candidates: 2, causes: 5, header: true };
    expect(abKey("b", o)).toEqual({ kind: "letter", index: 1 });
    expect(abKey("c", o)).toBeNull();
    expect(abKey("n", o)).toEqual({ kind: "neither" });
    expect(abKey("x", o)).toEqual({ kind: "cant_tell" });
    expect(abKey("Tab", { ...o, shift: true })).toEqual({ kind: "move", by: -1 });
    expect(abKey("3", o)).toEqual({ kind: "cause", index: 2 });
    expect(abKey("3", { ...o, causes: 0 })).toBeNull();
    expect(abKey("Enter", o)).toEqual({ kind: "answer" });
    expect(abKey("h", { ...o, header: false })).toBeNull();
    expect(abKey("b", { ...o, inField: true })).toBeNull();
    expect(abKey("Enter", { ...o, inField: true, ctrl: true })).toEqual({ kind: "answer" });
    // the pictures' keys stay theirs
    for (const k of [" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown"]) expect(abKey(k, o)).toBeNull();
  });

  it("reads the summary: the share of each choice on the split axes", () => {
    const s = summaryOf(SUMMARY as unknown as Json);
    expect(s.median).toBe(6.4);
    expect(shareWords(s)).toBe("A 47% · B 40% · can't tell 7% · neither 7%");
    expect(isAb(AB_CAMPAIGN)).toBe(true);
    expect(isAb({ source: { selection: "x@1" } })).toBe(false);
  });
});

describe("the A/B view drawn", () => {
  let host: HTMLDivElement;
  let root: Root;
  let log: Asked[];
  beforeEach(() => {
    forgetReadings();
    log = [];
    host = document.createElement("div");
    document.body.appendChild(host);
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
  async function press(key: string, opts: KeyboardEventInit = {}) {
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
    });
  }

  it("settles an item by keys: a letter per split axis, a cause, Enter; the causes follow the answer", async () => {
    vi.stubGlobal("fetch", abEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<AbReader caps={capsWith(abDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".ab-rows"));
    const text = host.textContent ?? "";
    // the file shows, and nothing names a voter
    expect(text).toContain("t1_mprage_sag");
    for (const v of ["judge-27b", "judge-flash", "rules"]) expect(text).not.toContain(v);
    expect(host.querySelectorAll(".ab-row.split").length).toBe(2);
    expect(host.querySelector(".ab-row.active")?.getAttribute("aria-label")).toBe("technique");
    // each candidate with its reason; framed in its value's colour where the value has one (the first ten of an axis, as on every page)
    const cands = [...host.querySelectorAll(".ab-row.active .ab-cand")];
    expect(cands[0].textContent).toContain("inversion-recovery");
    const parts = [...host.querySelectorAll('.ab-row[aria-label="body_part"] .ab-cand')];
    expect(parts.map((c) => c.getAttribute("data-slot"))).toEqual(["4", "3"]);
    // Enter before every split axis is settled is refused, and lights the first open one
    await press("Enter");
    expect(host.querySelector(".warn")?.textContent).toContain("Settle technique, body_part first");
    await press("b");
    expect(host.querySelector(".ab-row.active")?.getAttribute("aria-label")).toBe("body_part");
    await press("2");
    expect(host.querySelector('[aria-label="cause of technique"] .opt.on')?.textContent).toContain("convention gap");
    await press("a");
    await press("Enter");
    await until(() => log.some((a) => a.path.endsWith("/cause")));
    const answer = log.find((a) => a.path.endsWith("/answer"));
    expect((answer?.body as { value: Json }).value).toEqual({ provenance: "RawRecon", technique: "TSE", modifier: ["FLAIR"], construct: [], base: "T2w", body_part: "brain-neck", post_contrast: "not_given" });
    const cause = log.find((a) => a.path.endsWith("/cause"));
    expect(cause?.path).toBe(`/api/campaigns/${CAMPAIGN_ID}/answers/501/cause`);
    expect(cause?.body).toEqual({ axis: "technique", cause: "convention_gap" });
    await until(() => host.querySelector(".said")?.textContent?.includes("technique B (convention gap)"));
  });

  it("answers a localizer with one key", async () => {
    vi.stubGlobal("fetch", abEngine({ log, localizer: true }));
    root = createRoot(host);
    await act(async () => root.render(<AbReader caps={capsWith(abDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".ab-rows"));
    expect([...host.querySelectorAll(".ab-row")].map((r) => r.getAttribute("aria-label"))).toEqual(["provenance", "body_part"]);
    await press("Enter");
    await until(() => log.some((a) => a.path.endsWith("/answer")));
    expect((log.find((a) => a.path.endsWith("/answer"))?.body as { value: Json }).value.technique).toBe("not_asked");
  });

  it("neither opens a free choice found by any name", async () => {
    vi.stubGlobal("fetch", abEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<AbReader caps={capsWith(abDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".ab-rows"));
    await press("n");
    const box = await until(() => host.querySelector<HTMLInputElement>(".ab-free input"));
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(box, "SPACE");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector(".ab-found .opt.lit")?.textContent).toBe("3D-TSE");
    await act(async () => {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('.ab-row[aria-label="technique"] .ab-neither')?.textContent).toContain("3D-TSE");
  });

  it("the rating workspace sends an A/B campaign to its own page", async () => {
    vi.stubGlobal("fetch", abEngine({ log }));
    root = createRoot(host);
    await act(async () => root.render(<Workspace caps={capsWith(abDoorsOf())} id={String(CAMPAIGN_ID)} role="rater" />));
    await until(() => location.hash.endsWith("/settle"));
    expect(log.some((a) => a.path.endsWith("/claim"))).toBe(false);
  });
});
