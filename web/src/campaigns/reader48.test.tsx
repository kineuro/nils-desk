// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The reader after the first real read (record 48): blind hides NILS's
// answers, never the file, so a blind item shows the header's text and the
// physics, and the whole header one key away; the rater answers the seven
// asked axes and the pack derives five, shown live and never as rows; one
// screen. The workspace is drawn in jsdom against a fake engine, keys and
// all; an engine before the new doors falls back to what the reader did.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASKED, CAMPAIGN_ID, DERIVED, doorsOf, fakeEngine, HEADER_DOC, ITEM_ID, QUESTION, WHY_BLIND, type Asked } from "../../test/layout/reader.fixture";
import type { Json } from "../ask/client";
import { DoorError } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { answerBody, answeredAxes, type Given } from "./client";
import { deriveValue, derivedOf, derivedWords, headerLines, readingOf, suggestionOf } from "./reader";
import { Deriver, forgetReadings, headerDoorOf } from "./readerDoors";
import { Workspace } from "./Workspace";
import { findMatches, keyAct, rowsOf } from "./workspace";

vi.mock("../viewer/Viewer", () => ({ Viewer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[]): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.43" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.9.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

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

async function open(opts: { derive?: boolean; header?: boolean; texts?: boolean } = {}) {
  vi.stubGlobal("fetch", fakeEngine({ ...opts, log }));
  root = createRoot(host);
  await act(async () => root.render(<Workspace caps={capsWith(doorsOf(opts))} id={String(CAMPAIGN_ID)} role="rater" />));
  await until(() => host.querySelector("[data-reader-panel]"));
}

async function press(key: string, target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const derivedLine = () => host.querySelector(".derived-line")?.textContent ?? null;

describe("a blind item shows the file", () => {
  it("reads the why door's text, physics and header door, and keeps them blind", () => {
    const r = readingOf(WHY_BLIND as unknown as Json);
    expect(r.blind).toBe(true);
    expect(r.texts?.series_description).toContain("t1_mprage_sag");
    expect(r.texts?.sequence_variant).toBe("SK\\SP\\MP");
    // an empty text is not the file saying something
    expect(r.texts && "contrast_bolus_agent" in r.texts).toBe(false);
    expect(r.physics?.repetition_time).toBe(2300);
    expect(r.headerDoor).toBe(`/api/campaigns/${CAMPAIGN_ID}/items/${ITEM_ID}/header`);
    expect([r.lines, r.candidates, r.suggested]).toEqual([[], [], null]);
    expect(suggestionOf(QUESTION, r)).toBeNull();
    // a door somewhere else is never followed
    expect(readingOf({ ...(WHY_BLIND as unknown as Json), header_door: "https://elsewhere/x" }).headerDoor).toBeUndefined();
  });

  it("puts the key fields first, a sequence with its variant, the physics on two lines", () => {
    const lines = headerLines(readingOf(WHY_BLIND as unknown as Json).texts, readingOf(WHY_BLIND as unknown as Json).physics);
    expect(lines.map((l) => l.label)).toEqual(["series", "protocol", "sequence", "scanning", "image type", "more", "physics", "scanner", "more"]);
    expect(lines[2].value).toBe("*tfl3d1_16ns · SK\\SP\\MP");
    expect(lines[3].value).toBe("GR\\IR · 3D · options IR\\PFP\\FS\\SAT1\\SAT2\\SAT3");
    expect(lines[6].value).toBe("TR 2300  TE 2.98  TI 900  flip 9  ETL 1  bw 240  3T");
    expect(lines[7].value).toBe("SIEMENS Prisma_fit · 1/1 mm · 240x256 · matrix 0/256/240/0 · px 1/1 · sagittal · 176 slices");
    expect(lines[8].value).toBe("number of averages 1 · imaged nucleus 1H");
    expect(headerLines({}, {})).toEqual([]);
  });

  it("draws the header block on a blind item, and no suggestion, lines or candidates", async () => {
    await open();
    const block = await until(() => host.querySelector(".header-block"));
    expect(block.textContent).toContain("t1_mprage_sag_p2_iso_1.0mm_ND_research_protocol_repeat_after_motion");
    expect(block.textContent).toContain("TR 2300");
    expect(block.querySelector(".hb-line")?.getAttribute("title")).toContain("second_attempt_with_prescan_normalize");
    expect(host.querySelector(".tag.gated")?.textContent).toBe("blind");
    expect(host.querySelector(".suggest")).toBeNull();
    expect(host.querySelector(".evidence-lines, .evidence-drawer")).toBeNull();
    expect(host.querySelector(".candidate")).toBeNull();
    expect(host.textContent).not.toMatch(/System 1|agreed|differ/u);
  });
});

describe("the whole header, one key away", () => {
  it("opens on h from the header door, filters as one types, and closes on Escape", async () => {
    await open();
    await until(() => host.querySelector(".header-block"));
    await press("h");
    const drawer = await until(() => host.querySelector(".header-drawer table") && host.querySelector(".header-drawer"));
    expect(log.some((a) => a.method === "GET" && a.path === `/api/campaigns/${CAMPAIGN_ID}/items/${ITEM_ID}/header`)).toBe(true);
    expect(drawer.querySelectorAll("tr").length).toBe(HEADER_DOC.fields.length);
    expect(drawer.textContent).toContain("Left out: 7 identifying, 3 below your detail level.");
    const input = drawer.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "flip");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(drawer.querySelectorAll("tr").length).toBe(1);
    // a key typed into the filter is the filter's, not the reader's
    expect(host.querySelector(".axis-row .opt.on")).toBeNull();
    await press("Escape", input);
    expect(host.querySelector(".header-drawer")).toBeNull();
  });

  it("names the door from the why door, else the engine's own path, else none", () => {
    const caps = capsWith(doorsOf());
    expect(headerDoorOf(caps, 5, 9, { headerDoor: "/api/x" } as never)).toBe("/api/x");
    expect(headerDoorOf(caps, 5, 9, null)).toBe("/api/campaigns/5/items/9/header");
    expect(headerDoorOf(capsWith(doorsOf({ header: false })), 5, 9, null)).toBeNull();
    // h opens it where it is served, the evidence where it is not; H is the evidence
    const rows = rowsOf(QUESTION, null);
    expect(keyAct("h", { ctrl: false, inField: false, q: QUESTION, rows, header: true })).toEqual({ kind: "header" });
    expect(keyAct("h", { ctrl: false, inField: false, q: QUESTION, rows })).toEqual({ kind: "evidence" });
    expect(keyAct("H", { ctrl: false, inField: false, q: QUESTION, rows, header: true })).toEqual({ kind: "evidence" });
  });
});

describe("the rater answers seven axes; the pack derives five", () => {
  it("never draws a derived axis as a row", async () => {
    expect(rowsOf(QUESTION, null).map((r) => r.axis)).toEqual(ASKED);
    // even where an engine lists a derived axis among the asked
    expect(answeredAxes({ ...QUESTION, axes: [...ASKED, "role"] })).toEqual(ASKED);
    await open();
    const rows = [...host.querySelectorAll(".axis-row")].map((r) => r.getAttribute("aria-label"));
    expect(rows).toEqual(ASKED);
    for (const d of DERIVED) expect(rows).not.toContain(d);
  });

  it("sends only the asked axes", () => {
    const values = Object.fromEntries(ASKED.map((a) => [a, "cant_tell"])) as Record<string, string>;
    const g: Given = { kind: "values", values: { ...values, base: "T1w", role: ["t1w"], directory_type: "anat" } };
    const b = answerBody(QUESTION, g);
    expect(b.ok).toBe(true);
    if (b.ok) expect(Object.keys(b.body.value as Json).sort()).toEqual([...ASKED].sort());
    // a partial answer asks the derive door with what is chosen, and nothing derived
    expect(deriveValue(QUESTION, { kind: "values", values: { base: "T1w", modifier: [], role: ["t1w"], technique: "" } })).toEqual({ base: "T1w" });
  });

  it("updates the derived line from the derive door after a key press", async () => {
    await open();
    await until(() => derivedLine()?.startsWith("derived: dir ?"));
    expect(derivedLine()).toBe("derived: dir ? · disposition ? · convertible yes · role ? · quality none");
    // can't tell on the provenance (a), then base found by its number and answered by its first letters
    await press("a");
    await press("5");
    const find = host.querySelector<HTMLInputElement>('[data-find="base"]')!;
    expect(document.activeElement).toBe(find);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(find, "t1w");
      find.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press("Enter", find);
    // Enter took the value and went on to the next row
    expect(document.activeElement).toBe(host.querySelector('[data-find="body_part"]'));
    await until(() => derivedLine()?.includes("dir anat"));
    expect(derivedLine()).toBe("derived: dir anat · disposition ? · convertible yes · role t1w · quality none");
    const asked = log.filter((a) => a.path.endsWith("/derive"));
    expect(asked.at(-1)?.body).toEqual({ value: { provenance: "cant_tell", base: "T1w" } });
    // the answer sends the asked axes, can't tell on the rest, and nothing derived
    for (const k of ["d", "f", "g", "j", "k", "l"]) await press(k);
    await act(async () => (document.activeElement as HTMLElement | null)?.blur());
    await press("Enter");
    const sent = await until(() => log.find((a) => a.path.endsWith("/answer")));
    expect(Object.keys((sent.body as { value: Json }).value).sort()).toEqual([...ASKED].sort());
  });

  it("asks once the answer is still, and shows only the latest", async () => {
    vi.useFakeTimers();
    try {
      const calls: Json[] = [];
      let answer: (d: Json) => void = () => undefined;
      const shown: (string | null)[] = [];
      const d = new Deriver(
        (v) => {
          calls.push(v);
          return new Promise((r) => (answer = (x) => r(derivedOf({ derived: x }))));
        },
        (x) => shown.push(x ? derivedWords(x, QUESTION) : null),
      );
      d.want({ base: "T1w" });
      d.want({ base: "T2w" });
      await vi.advanceTimersByTimeAsync(100);
      expect(calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(60);
      expect(calls).toEqual([{ base: "T2w" }]);
      const first = answer;
      d.want({ base: "DWI" });
      await vi.advanceTimersByTimeAsync(160);
      // the earlier answer arrives late and is dropped
      first({ directory_type: "anat" });
      answer({ directory_type: "dwi", quality: [], role: "cant_tell" });
      await vi.advanceTimersByTimeAsync(0);
      expect(shown).toEqual(["derived: dir dwi · role ? · quality none"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds a value by its first letters, the ones it begins before the ones it holds", () => {
    const technique = rowsOf(QUESTION, null)[1];
    const values = (t: string) => findMatches(technique, t, { none: true, cantTell: true }).map((f) => (f.kind === "value" ? f.value : f.kind));
    expect(values("se")[0]).toBe("SE");
    expect(values("se")).toContain("SE-EPI");
    expect(values("se")).toContain("3D-TSE");
    expect(values("mpr")).toEqual(["MPRAGE", "MEMPRAGE"]);
    expect(values("?")).toEqual(["cant_tell"]);
    expect(values("no")).toEqual(["none"]);
    expect(keyAct("3", { ctrl: false, inField: false, q: QUESTION, rows: rowsOf(QUESTION, null) })).toMatchObject({ kind: "find", row: { axis: "modifier" } });
  });
});

describe("an engine before the new doors", () => {
  it("hides the derived line on a 404, shows the flat header, and h stays the evidence's", async () => {
    await open({ derive: false, header: false, texts: false });
    await until(() => log.some((a) => a.path.endsWith("/derive")));
    await until(() => !host.querySelector(".derived-line"));
    const block = await until(() => host.querySelector(".header-block"));
    expect(block.textContent).toContain("TR 2300");
    expect(host.textContent).not.toContain("whole header");
    await press("h");
    expect(host.querySelector(".header-drawer")).toBeNull();
    expect(log.some((a) => a.path.endsWith("/header"))).toBe(false);
    // after the 404 the door is not asked again
    const n = log.filter((a) => a.path.endsWith("/derive")).length;
    await press("a");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(log.filter((a) => a.path.endsWith("/derive")).length).toBe(n);
  });

  it("asks no derive door where the question derives nothing and the engine lists none", async () => {
    const caps = capsWith(doorsOf({ derive: false }));
    const { deriveAsked } = await import("./readerDoors");
    expect(deriveAsked(caps, { ...QUESTION, derive: undefined })).toBe(false);
    expect(deriveAsked(caps, QUESTION)).toBe(true);
    expect(new DoorError(404, {}).status).toBe(404);
  });
});
