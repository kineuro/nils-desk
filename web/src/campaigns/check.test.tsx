// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Job type 3, check a result (record 55 H3; the build spec of 2026-10-11,
// section 16, D2): the item door read as E2 serves it; an answer held to
// section 6.2 before it is sent; the check's keys, which meet no key of the
// comparison reader, the mask or the pictures; the grid by the count of
// panels; and the reader drawn: one key accepts and the next result comes,
// n opens a lesion on every panel, a reason flags it and Backspace clears
// it, a point reason waits for a click, the note, "+ scan", the linked
// point paged by the wheel, b corrects, part grain, and the items ahead
// warmed with their layers.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_CAMPAIGNS_CAPS, CHECK_ITEM, checkDoorsOf, checkEngine, checkSheet, LESIONS, MORE_STACK, RESULT_ID, stackOf, type KeptCheck } from "../../test/layout/check.fixture";
import { CAMPAIGN_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Manifest } from "../viewer/doors";
import { maskKey } from "../viewer/maskLook";
import { viewerKey } from "../viewer/keys";
import type { ViewerProps } from "../viewer/Viewer";
import {
  accept,
  answerKeys,
  buildAnswer,
  checkKey,
  checkProgress,
  checkSheetOf,
  checkStatsOf,
  clearLast,
  flag,
  gridOf,
  isCheck,
  marksOf,
  NO_MARKS,
  partAt,
  partOrder,
  placePoint,
  pointOnSlice,
  presetFor,
  PRESETS,
  reject,
  stepPart,
  stripWords,
  verdictOf,
  type Reason,
} from "./check";
import { checkAhead, CheckReader, forgetCheckSheets } from "./CheckReader";
import { compareKey } from "./compare";

const drawn = new Map<number, ViewerProps>();
const manifests = new Map<number, Manifest>();
vi.mock("../viewer/Viewer", async () => {
  const { useEffect } = await import("react");
  return {
    Viewer: (p: ViewerProps) => {
      drawn.set(p.stack, p);
      useEffect(() => {
        const m = manifests.get(p.stack);
        if (m) p.onManifest?.(m);
        p.onReady?.("full");
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [p.stack]);
      return null;
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[], grants = ["campaigns:see", "campaigns:work", "pipelines:see"]): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.80" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.13.0" }], campaigns: CHECK_CAMPAIGNS_CAPS },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants, detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

const REASONS: Reason[] = PRESETS.components;

describe("the item door, the answer and the words", () => {
  it("reads an item as E2 serves it: the result, the set, the panels made-on first, the lesions, no stack in the item", () => {
    const s = checkSheetOf(checkSheet(CHECK_ITEM, { panels: 4 }) as Json)!;
    expect(s.result).toMatchObject({ id: RESULT_ID, pipeline: "samseg-lesions", run: 77, check: null });
    expect(s.set).toMatchObject({ key: "lesions", kind: "components", grain: "result", count: 4 });
    expect(s.panels.map((p) => [p.shows, p.madeOn, p.link, p.layer])).toEqual([
      ["FLAIR", true, "same", "ready"],
      ["T1w", false, "world", "ready"],
      ["FLAIR", false, "world", "ready"],
      ["T2w", false, "world", "ready"],
    ]);
    expect(s.position).toBe(12);
    expect(s.parts.map((p) => p.label)).toEqual([1, 2, 3, 4]);
    expect(s.parts[0].anchor).toEqual([-20.5, 11, 30]);
    expect(s.more).toEqual([{ stack: MORE_STACK, shows: "T2w" }]);
    expect(s.reasons.map((r) => r.id)).toEqual(REASONS.map((r) => r.id));
    expect(checkSheetOf({ item: 3, result: { id: 1 }, set: {}, panels: [] })).toBeNull();
    expect(isCheck({ question: { kind: "check" } } as never)).toBe(true);
  });

  it("holds an answer to section 6.2 before it is sent", () => {
    const o = { reasons: REASONS, grain: "result" as const, part: null };
    expect(buildAnswer(NO_MARKS, o)).toMatchObject({ ok: false });
    // accepted carries nothing but what was seen
    const a = buildAnswer({ ...accept(NO_MARKS), seen: [3, 1] }, o);
    expect(a).toMatchObject({ ok: true, value: "accepted", body: { value: "accepted", form: { reasons: [], parts: [], points: [], seen: [1, 3], shown: [] } } });
    // a flag on a part, a point for a missed lesion: flagged
    let m = flag(NO_MARKS, "under", 2);
    m = placePoint(m, "missed", [-12.5, 30, 44]);
    const f = buildAnswer(m, o);
    expect(f).toMatchObject({ ok: true, value: "flagged", body: { form: { parts: [{ label: 2, reason: "under" }], points: [{ reason: "missed", mm: [-12.5, 30, 44] }] } } });
    // a reason that needs a note is held until the note is written
    const other = flag(NO_MARKS, "other", null);
    expect(buildAnswer(other, o)).toMatchObject({ ok: false, note: true });
    expect(buildAnswer({ ...other, note: "touches the ventricle" }, o)).toMatchObject({ ok: true, value: "flagged", body: { why: "touches the ventricle", form: { reasons: ["other"] } } });
    // rejected keeps the result's reasons and drops the parts and points
    const r = buildAnswer(reject(flag(flag(NO_MARKS, "over", null), "under", 1)), o);
    expect(r).toMatchObject({ ok: true, value: "rejected", body: { form: { reasons: ["over"], parts: [], points: [] } } });
    // at part grain rejected (not a lesion) carries no reason, and a flag is on the item's own part
    const p = { reasons: REASONS, grain: "part" as const, part: 3 };
    expect(buildAnswer(reject(flag(NO_MARKS, "over", null)), p)).toMatchObject({ ok: true, value: "rejected", body: { form: { reasons: [] } } });
    expect(buildAnswer(flag(NO_MARKS, "joined", 3), p)).toMatchObject({ ok: true, body: { form: { parts: [{ label: 3, reason: "joined" }] } } });
    expect(buildAnswer({ ...accept(NO_MARKS), note: "x".repeat(2001) }, o)).toMatchObject({ ok: false });
  });

  it("flags toggle, take the place of 1 and 2, and Backspace takes the last mark back", () => {
    let m = accept(NO_MARKS);
    m = flag(m, "under", 2);
    expect(verdictOf(m)).toBe("flagged");
    m = flag(m, "over", 2);
    expect(m.parts).toEqual([{ label: 2, reason: "over" }]);
    expect(flag(m, "over", 2).parts).toEqual([]);
    m = placePoint(m, "missed", [1, 2, 3]);
    m = flag(m, "joined", null);
    expect(clearLast(m, 2).parts).toEqual([]);
    expect(clearLast(m, null).points).toEqual([]);
    expect(clearLast(clearLast(m, null), null).reasons).toEqual([]);
    expect(verdictOf(clearLast(accept(NO_MARKS), null))).toBeNull();
    // one's own answer opened again
    expect(marksOf({ answer: 3, value: "flagged", form: { reasons: [], parts: [{ label: 4, reason: "under" }], points: [], seen: [4], shown: [] }, why: null }).parts).toEqual([{ label: 4, reason: "under" }]);
  });

  it("lays out 1 to 8 panels as 1 by 2, 1 by 3, 2 by 2, 2 by 3 and 2 by 4", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => { const g = gridOf(n); return `${g.rows}x${g.cols}`; })).toEqual(["1x1", "1x2", "1x3", "2x2", "2x3", "2x3", "2x4", "2x4"]);
  });

  it("names the part in focus: a lesion by its place and volume, or the whole result", () => {
    const s = checkSheetOf(checkSheet(CHECK_ITEM) as Json)!;
    expect(stripWords(s, null)).toBe("Whole result · 4 lesions");
    expect(stripWords(s, s.parts[2])).toBe("Lesion 3 of 4 · 0.001 ml");
    expect(stripWords(s, s.parts[0])).toBe("Lesion 1 of 4 · 0.21 ml");
    expect(partOrder(s.parts, "size")).toEqual([4, 1, 2, 3]);
    expect(stepPart([1, 2, 3], null, 1)).toBe(1);
    expect(stepPart([1, 2, 3], 3, 1)).toBe(3);
    expect(stepPart([1, 2, 3], null, -1)).toBe(3);
    expect(partAt(s.parts, [-20, 10, 29])?.label).toBe(1);
    expect(partAt(s.parts, [80, 80, 80])).toBeNull();
  });

  it("pages the linked point along a panel's own normal", () => {
    const m = { codec: "htj2k", tile: 256, levels: 1, shape: [40, 256, 256], spacing: [3, 1, 1], dtype: "uint16", window: { center: 400, width: 800 }, orientation: [1, 0, 0, 0, 1, 0], origin: [0, 0, 0] } as unknown as Manifest;
    expect(pointOnSlice(m, [10, 20, 5], 4)).toEqual([10, 20, 12]);
    expect(pointOnSlice(m, null, 0)).toEqual([127.5, 127.5, 0]);
  });

  it("reads the stats' counts by verdict and reason, every rater's where the caller reads them", () => {
    const s = checkStatsOf({ all: { answers: 38, median_seconds: 6.4, verdicts: { accepted: 30, flagged: 7 }, reasons: { under: 3 } }, raters: [] });
    expect(s).toMatchObject({ answers: 38, median: 6.4, own: false, verdicts: { accepted: 30, flagged: 7 }, reasons: { under: 3 } });
    expect(checkStatsOf({ raters: [{ principal: "me", answers: 4, verdicts: { accepted: 4 } }], blind: true }, "me")).toMatchObject({ answers: 4, own: true });
    // the reader's band: one's own row, never every rater's, never another's row
    const two = { all: { answers: 8, median_seconds: 5.3 }, raters: [{ principal: "a", answers: 4, median_seconds: 5.3 }, { principal: "b", answers: 1, median_seconds: 7 }] };
    expect(checkStatsOf(two, "b", true)).toMatchObject({ answers: 1, median: 7, own: true });
    expect(checkStatsOf({ ...two, raters: [two.raters[0]] }, "b", true)).toMatchObject({ answers: 0, median: null });
  });

  it("counts a reader's own reads against the items given to them, never every rater's (T33)", () => {
    const a = (item: number, principal: string, state: string, role = "rater") => ({ item_id: item, principal, role, state });
    const open = [1, 2, 3, 4].map((id) => ({ id, state: "open" }));
    // two raters to each of four results: a read all four, b holds the first
    const two = { raters_per_item: 2, items: open, assignments: [...[1, 2, 3, 4].map((i) => a(i, "a", "submitted")), a(1, "b", "leased")] } as never;
    expect(checkProgress(two, "b")).toEqual({ answered: 0, items: 4 });
    expect(checkProgress(two, "a")).toEqual({ answered: 4, items: 4 });
    const read = { raters_per_item: 2, items: open.map((i) => ({ ...i, state: "agreed" })), assignments: [1, 2, 3, 4].flatMap((i) => [a(i, "a", "submitted"), a(i, "b", "submitted")]) } as never;
    expect(checkProgress(read, "b")).toEqual({ answered: 4, items: 4 });
    // a result given back is not offered again
    const back = { raters_per_item: 2, items: open, assignments: [...[1, 2, 3, 4].map((i) => a(i, "a", "submitted")), a(1, "b", "released")] } as never;
    expect(checkProgress(back, "b")).toEqual({ answered: 0, items: 3 });
    // one rater to a result among two: the other's answers and leases are not given to me
    const split = { raters_per_item: 1, items: [{ id: 1, state: "agreed" }, ...open.slice(1)], assignments: [a(1, "a", "submitted"), a(2, "a", "leased"), a(3, "b", "leased")] } as never;
    expect(checkProgress(split, "b")).toEqual({ answered: 0, items: 2 });
    expect(checkProgress(split, "a")).toEqual({ answered: 1, items: 3 });
    // an adjudicator: what they settled and what waits for one they did not rate
    const settle = { raters_per_item: 2, items: [{ id: 1, state: "needs_adjudication" }, { id: 2, state: "adjudicated" }, { id: 3, state: "needs_adjudication" }, { id: 4, state: "agreed" }], assignments: [a(2, "x", "submitted", "adjudicator"), a(3, "x", "submitted")] } as never;
    expect(checkProgress(settle, "x", "adjudicator")).toEqual({ answered: 1, items: 2 });
  });

  it("takes the presets from the engine, and the build spec's where it names none", () => {
    expect(presetFor(capsWith([]), "labels").map((r) => r.id)).toEqual(["boundary_off", "wrong_label", "other"]);
    const bare = { ...capsWith([]), engine: { ...capsWith([]).engine!, campaigns: undefined } } as unknown as Capabilities;
    expect(presetFor(bare, "labels").map((r) => r.id)).toEqual(["boundary_off", "wrong_label", "part_missing", "extra_part", "other"]);
    expect(answerKeys(REASONS, "result").map((k) => `${k.key} ${k.words}`)).toEqual(["1 Accept", "2 Reject", "3 Under-segmented", "4 Over-segmented", "5 Under and over", "6 Two or more joined", "7 Not a lesion", "8 Missed lesion", "9 Other"]);
    expect(answerKeys(REASONS, "part").slice(0, 2).map((k) => k.words)).toEqual(["Good lesion", "Not a lesion"]);
  });
});

describe("the keys", () => {
  const keys = [..."abcdefghijklmnopqrstuvwxyz0123456789[]?,./;'-=", "Enter", "Backspace", "Escape", " ", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Tab"];
  it("never meet a key of the comparison reader, the mask or the pictures", () => {
    for (const k of keys) {
      const own = checkKey(k, { inField: false, placing: true });
      if (!own) continue;
      expect(compareKey(k, { inField: false, answers: 9 }), k).toBeNull();
      expect(maskKey(k, { inField: false }), k).toBeNull();
      if (k !== "Escape") expect(viewerKey(k, { view: "planes", enlarged: false, target: null }), k).toBeNull();
    }
    expect(["n", "p", "r", "Backspace", "e", "Escape"].map((k) => checkKey(k, { inField: false, placing: true })?.kind)).toEqual(["next", "previous", "whole", "clear", "note", "cancel"]);
    // Escape is the check's only while a point is being placed
    expect(checkKey("Escape", { inField: false })).toBeNull();
    expect(checkKey("n", { inField: true })).toBeNull();
    // 1 to 9 are the answers with seven reasons: no jump among them
    for (let i = 1; i <= 9; i++) expect(compareKey(String(i), { inField: false, answers: 9 })).toEqual({ kind: "answer", index: i - 1 });
    // the mask's keys are none of the comparison's
    for (const k of ["o", "f", "[", "]"]) expect(compareKey(k, { inField: false, answers: 9 }), k).toBeNull();
  });
});

describe("the check reader drawn", () => {
  let host: HTMLDivElement;
  let root: Root;
  let log: Asked[];
  let kept: KeptCheck[];
  beforeEach(() => {
    log = [];
    kept = [];
    drawn.clear();
    manifests.clear();
    forgetCheckSheets();
    localStorage.clear();
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
  async function press(key: string, target: EventTarget = document.body) {
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }
  async function open(o: Parameters<typeof checkEngine>[0] = {}) {
    vi.stubGlobal("fetch", checkEngine({ log, kept, ...o }));
    root = createRoot(host);
    await act(async () => root.render(<CheckReader caps={capsWith(checkDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => host.querySelector(".check-answers"));
    await until(() => drawn.has(stackOf(CHECK_ITEM, 0)));
  }
  const answers = () => log.filter((a) => a.path.endsWith("/answer"));
  const text = () => host.textContent ?? "";

  it("shows the result on each panel, the made-on scan framed, the lesions beside them, and nothing of the scans or the day", async () => {
    await open({ panels: 3 });
    const panels = [...host.querySelectorAll(".compare-panel")];
    expect(panels).toHaveLength(3);
    expect(panels.map((p) => p.querySelector(".compare-name")?.textContent)).toEqual(["FLAIR", "T1w", "FLAIR"]);
    expect(panels[0].classList.contains("is-made-on")).toBe(true);
    expect(host.querySelector(".check-reader")?.getAttribute("data-panels")).toBe("3");
    expect(host.querySelector(".compare-grid")?.getAttribute("data-cols")).toBe("3");
    // the mask on every panel: the result's layer on that scan
    for (let p = 0; p < 3; p++) expect(drawn.get(stackOf(CHECK_ITEM, p))?.mask?.layer).toEqual({ derivative: RESULT_ID, set: "lesions" });
    expect(host.querySelectorAll(".check-part-row")).toHaveLength(4);
    expect(host.querySelector(".check-part")?.textContent).toBe("Whole result · 4 lesions");
    expect(host.querySelector(".act-answer")?.textContent).toContain("Send");
    for (const n of [String(stackOf(CHECK_ITEM, 0)), String(RESULT_ID), "a3f1c2", "2026"]) expect(text()).not.toContain(n);
    // no window, no difference, no jumps
    expect(host.querySelector(".compare-window, .compare-diff, .compare-region")).toBeNull();
  });

  it("1 accepts and the next result comes with auto-advance on; the answer names what was seen", async () => {
    await open();
    await press("1");
    await until(() => answers().length === 1);
    expect(answers()[0].body).toEqual({ value: "accepted", form: { reasons: [], parts: [], points: [], seen: [], shown: [] } });
    await until(() => host.querySelector(".rate-item > b")?.textContent === "result 13");
    await until(() => drawn.has(stackOf(CHECK_ITEM + 1, 0)));
  });

  it("the band counts the reader's own reads against the results given to them, with a second rater ahead (T33)", async () => {
    await open({ items: 3, others: 3 });
    const band = () => host.querySelector(".compare-progress")?.textContent ?? "";
    await until(() => band().includes("0 of 3 read · 3 left"));
    await press("1");
    await until(() => answers().length === 1);
    await until(() => band().includes("1 of 3 read · 2 left"));
    expect(log.some((a) => a.path.endsWith("/stats"))).toBe(true);
  });

  it("n opens a lesion on every panel, a reason flags it, Backspace clears it, Enter sends flagged", async () => {
    await open();
    await press("n");
    await until(() => host.querySelector(".check-part")?.textContent === "Lesion 1 of 4 · 0.21 ml");
    for (let p = 0; p < 3; p++) {
      const v = drawn.get(stackOf(CHECK_ITEM, p))!;
      expect(v.focus).toMatchObject({ anchor: LESIONS[0].anchor_mm, box: LESIONS[0].box_mm });
      expect(v.point).toEqual(LESIONS[0].anchor_mm);
      expect(v.mask?.tones?.get(1)).toBe("focus");
    }
    await press("3");
    expect(host.querySelector(".check-part-row.on .check-flag")?.textContent).toBe("Under-segmented");
    expect(host.querySelector(".act-answer")?.textContent).toContain("Send · flagged");
    expect(answers()).toHaveLength(0);
    await press("Backspace");
    expect(host.querySelector(".check-part-row.on .check-flag")).toBeNull();
    await press("4");
    // seen after half a second in focus
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    await press("n");
    expect(drawn.get(stackOf(CHECK_ITEM, 1))?.mask?.tones?.get(1)).toBe("flagged");
    await press("Enter");
    await until(() => answers().length === 1);
    expect(answers()[0].body).toMatchObject({ value: "flagged", form: { parts: [{ label: 1, reason: "over" }], seen: [1] } });
    await until(() => (host.querySelector(".said")?.textContent ?? "").includes("flagged · 1 lesion"));
  });

  it("a point reason waits for a click on a picture; Escape calls it off", async () => {
    await open();
    await press("8");
    expect(host.querySelector(".check-placing")?.textContent).toContain("Missed lesion");
    await press("Escape");
    expect(host.querySelector(".check-placing")).toBeNull();
    await press("8");
    await press("Enter");
    expect(host.querySelector(".compare-refused .warn")?.textContent).toContain("Choose first");
    await act(async () => drawn.get(stackOf(CHECK_ITEM, 1))!.onPoint!([40, -40, 20]));
    expect(host.querySelector(".check-placing")).toBeNull();
    expect(host.querySelectorAll(".check-points li")).toHaveLength(1);
    expect(drawn.get(stackOf(CHECK_ITEM, 2))?.point).toEqual([40, -40, 20]);
    await press("Enter");
    await until(() => answers().length === 1);
    expect(answers()[0].body).toMatchObject({ value: "flagged", form: { points: [{ reason: "missed", mm: [40, -40, 20] }], parts: [] } });
  });

  it("a click on a lesion opens it; the wheel on one panel pages the linked point for all", async () => {
    manifests.set(stackOf(CHECK_ITEM, 1), { codec: "htj2k", tile: 256, levels: 1, shape: [60, 256, 256], spacing: [3, 1, 1], dtype: "uint16", window: { center: 1, width: 2 }, orientation: [1, 0, 0, 0, 1, 0], origin: [-120, -120, -60] } as unknown as Manifest);
    await open();
    await act(async () => drawn.get(stackOf(CHECK_ITEM, 0))!.onPoint!([12, -30, 38.4]));
    await until(() => host.querySelector(".check-part")?.textContent?.startsWith("Lesion 2 of 4"));
    await act(async () => drawn.get(stackOf(CHECK_ITEM, 1))!.onSlice!(30));
    expect(drawn.get(stackOf(CHECK_ITEM, 0))?.point).toEqual([12, -30, 30]);
    expect(drawn.get(stackOf(CHECK_ITEM, 2))?.point).toEqual([12, -30, 30]);
    // l lets each move alone
    await press("l");
    expect(drawn.get(stackOf(CHECK_ITEM, 2))?.point).toBeNull();
    expect(drawn.get(stackOf(CHECK_ITEM, 2))?.onSlice).toBeUndefined();
  });

  it("e opens the note; a reason that needs one opens it, and Enter in it sends", async () => {
    await open();
    await press("9");
    const input = await until(() => host.querySelector<HTMLInputElement>(".check-note input"));
    expect(document.activeElement).toBe(input);
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "touches the ventricle");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await until(() => answers().length === 1);
    expect(answers()[0].body).toMatchObject({ value: "flagged", why: "touches the ventricle", form: { reasons: ["other"] } });
  });

  it("+ scan shows another scan of the visit for this result alone, and the answer says it was shown", async () => {
    await open();
    const select = host.querySelector<HTMLSelectElement>(".check-add select")!;
    await act(async () => {
      select.value = String(MORE_STACK);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await until(() => drawn.has(MORE_STACK));
    expect(host.querySelectorAll(".compare-panel")).toHaveLength(4);
    expect(host.querySelector(".compare-panel.is-added .compare-name")?.textContent).toBe("T2w");
    await press("1");
    await until(() => answers().length === 1);
    expect(answers()[0].body).toMatchObject({ value: "accepted", form: { shown: [MORE_STACK] } });
  });

  it("o, f, [ and ] change the mask's look on every panel without a read", async () => {
    await open();
    const before = log.length;
    await press("o");
    expect(drawn.get(stackOf(CHECK_ITEM, 2))?.mask?.look?.shown).toBe(false);
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "o", bubbles: true }));
    });
    await press("o");
    await press("f");
    expect(drawn.get(stackOf(CHECK_ITEM, 1))?.mask?.look).toMatchObject({ shown: true, fill: true, outline: false });
    await press("]");
    expect(drawn.get(stackOf(CHECK_ITEM, 0))?.mask?.look?.opacity).toBe(0.6);
    expect(log.slice(before).filter((a) => a.path.includes("/layers/"))).toEqual([]);
  });

  it("b opens the last answer with its flags, and a correction goes through the amend door", async () => {
    await open();
    await press("n");
    await press("5");
    await press("Enter");
    await until(() => answers().length === 1);
    await until(() => host.querySelector(".rate-item > b")?.textContent === "result 13");
    await press("b");
    await until(() => host.querySelector(".rate-item > b")?.textContent === "result 12");
    await until(() => host.querySelector(".act-answer")?.textContent?.includes("Correct · flagged"));
    // the flag given is back on its lesion
    expect([...host.querySelectorAll(".check-flag")].map((e) => e.textContent)).toEqual(["Under and over"]);
    await press("2");
    await until(() => log.some((a) => a.path.endsWith("/amend")));
    expect(log.find((a) => a.path.endsWith("/amend"))?.body).toMatchObject({ value: "rejected", form: { parts: [] } });
  });

  it("at part grain the item opens on its lesion, the others dimmer, and one key sends", async () => {
    await open({ grain: "part" });
    await until(() => host.querySelector(".check-part")?.textContent === "Lesion 1 of 4 · 0.21 ml");
    const v = drawn.get(stackOf(CHECK_ITEM, 0))!;
    expect(v.focus).toMatchObject({ anchor: LESIONS[0].anchor_mm });
    expect(v.mask?.tones?.get(1)).toBe("focus");
    expect(v.mask?.tones?.get(2)).toBe("dim");
    expect([...host.querySelectorAll(".check-verdict .answer-words")].map((e) => e.textContent)).toEqual(["Good lesion", "Not a lesion"]);
    await press("6");
    await until(() => answers().length === 1);
    expect(answers()[0].body).toMatchObject({ value: "flagged", form: { parts: [{ label: 1, reason: "joined" }] } });
    await until(() => host.querySelector(".check-part")?.textContent?.startsWith("Lesion 2 of 4"));
    await press("2");
    await until(() => answers().length === 2);
    expect(answers()[1].body).toMatchObject({ value: "rejected", form: { reasons: [], parts: [] } });
  });

  it("the keys overlay lists the check's keys by what they do", async () => {
    await open();
    await press("?");
    const d = await until(() => host.querySelector("dialog.keys-overlay"));
    expect([...d.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Answer", "Parts", "Mask", "View", "Pictures"]);
    expect(d.textContent).toContain("Missed lesion, then a click on a picture");
  });
});

describe("the items ahead", () => {
  beforeEach(() => forgetCheckSheets());
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetCheckSheets();
  });
  it("are warmed with their layers, read from their item doors since the claim names only the stacks", async () => {
    const log: Asked[] = [];
    vi.stubGlobal("fetch", checkEngine({ log, items: 5 }));
    const out = await checkAhead(String(CAMPAIGN_ID), [
      { item: CHECK_ITEM + 1, stacks: [stackOf(CHECK_ITEM + 1, 0), stackOf(CHECK_ITEM + 1, 1)] },
      { item: CHECK_ITEM + 2, stacks: [stackOf(CHECK_ITEM + 2, 0)] },
    ]);
    expect(out[0].layers?.[stackOf(CHECK_ITEM + 1, 0)]).toEqual({ derivative: RESULT_ID + 1, set: "lesions" });
    expect(out[1].layers?.[stackOf(CHECK_ITEM + 2, 2)]).toEqual({ derivative: RESULT_ID + 2, set: "lesions" });
    expect(log.filter((a) => a.path.endsWith("/check"))).toHaveLength(2);
  });
});
