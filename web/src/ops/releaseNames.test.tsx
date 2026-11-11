// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// New release's "name subjects by": the subject code alone until a person
// adds an ID type, the types tried in the order they stand, the rehearsal's
// counts, an ID chosen for each subject that holds several, the names two
// subjects would share, and no release until the engine's plan is ready. An
// engine without the rehearsal's door gets the form it had.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle, type Call } from "../../test/safeWayIn";
import type { NamesPlan, Release } from "../data/cohorts";
import type { IdType } from "../data/pseudonyms";
import { placesKept } from "../objects/kept";
import { ReleasePage } from "./ReleasePage";
import { REHEARSE_AFTER_MS } from "./ReleaseNames";
import { asked, moved, namedWords, nameTypes, planNeeds, planWords } from "./releaseNames";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

/** The form rests long enough for its names to be rehearsed, and the answer is drawn. */
const rest = async () => {
  await act(async () => {
    await new Promise((done) => setTimeout(done, REHEARSE_AFTER_MS + 40));
  });
  await settle();
};

const OLD = ["GET /api/releases", "POST /api/releases", "GET /api/places", "GET /api/cohorts"];
const DOORS = [...OLD, "POST /api/releases/names", "GET /api/linkage/types"];
const EXPORTS = { places: [{ id: 9, name: "exports", role: "export", path: "/exports", guarantees: {}, probed: null, probed_at: null, retired_at: null }] };
const COHORTS = { cohorts: [{ name: "north", subjects: 16, sessions: 30, stacks: 400, waiting: 0, retired_at: null }] };
const TYPES: IdType[] = [
  { name: "personnummer", description: "", identifying: true, identifiers: 40, kept: 0 },
  { name: "study-id", description: "", identifying: false, identifiers: 15, kept: 15 },
  { name: "pacs-id", description: "", identifying: false, identifiers: 4, kept: 4 },
  { name: "ward-id", description: "", identifying: false, identifiers: 6, kept: 0 },
  { name: "study-instance-uid", description: "", identifying: false, identifiers: 3, kept: 3 },
];
const ONE = "7c1d0e5a93b2f468";
const TWO = "e40b6a1f8d3c2957";

const plan = (over: Partial<NamesPlan> = {}): NamesPlan => ({
  by: ["study-id", "pacs-id"],
  subjects: 16,
  types: [
    { type: "study-id", identifying: false, subjects: 12 },
    { type: "pacs-id", identifying: false, subjects: 3 },
  ],
  code: 1,
  chosen: 0,
  passed_over: 0,
  needs_choice: [],
  collisions: [],
  values: "shown",
  ready: true,
  ...over,
});

type Answer = { status: number; body?: unknown } | undefined;

async function open(o: { doors?: string[]; types?: IdType[]; names?: (c: Call, nth: number) => Answer; release?: (c: Call, nth: number) => Answer } = {}) {
  const e = engine((c, nth) => {
    if (c.method === "GET" && c.url.startsWith("/api/releases")) return { status: 200, body: { count: 0, releases: [] } };
    if (c.method === "GET" && c.url === "/api/places") return { status: 200, body: EXPORTS };
    if (c.method === "GET" && c.url === "/api/cohorts") return { status: 200, body: COHORTS };
    if (c.method === "GET" && c.url === "/api/linkage/types") return { status: 200, body: { types: o.types ?? TYPES } };
    if (c.method === "POST" && c.url === "/api/releases/names") return o.names?.(c, nth) ?? { status: 200, body: { names: plan({ by: c.body?.name_by as string[] }) } };
    if (c.method === "POST" && c.url === "/api/releases") return o.release?.(c, nth) ?? { status: 202, body: { job: 88, state: "queued" } };
    return undefined;
  });
  await placesKept.refresh().catch(() => undefined);
  act(() => root.render(<ReleasePage caps={caps7a(o.doors ?? DOORS)} page="new" arg="north" />));
  await settle();
  return e;
}

const dialog = () => host.querySelector("dialog[open]")!;
const adder = () => dialog().querySelector<HTMLSelectElement>('select[aria-label="Add an ID type to name subjects by"]');
const order = () => [...dialog().querySelectorAll(".name-by-order .tag")].map((t) => t.textContent);
const releaseButton = () => button(dialog(), /^Release$/u)!;
const rehearsed = (e: Awaited<ReturnType<typeof open>>) => e.of("POST", "/api/releases/names").map((c) => c.body);
const released = (e: Awaited<ReturnType<typeof open>>) => e.of("POST", "/api/releases").map((c) => c.body);
const foot = () => dialog().querySelector(".dialog-foot .meta")!.textContent;

describe("name subjects by, in the release form", () => {
  it("is the subject code alone until a type is added, and offers only the types that keep a value", async () => {
    const e = await open();
    expect(dialog().textContent).toContain("name subjects by");
    expect(order()).toEqual(["Subject code"]);
    // spelled as the Data grid's "Show subjects by" spells them; never the ID that is the same everywhere, a type that keeps nothing, or the study UID
    expect([...adder()!.options].map((o) => o.textContent)).toEqual(["Add an ID type", "Study ID", "Pacs id"]);
    await rest();
    expect(rehearsed(e)).toHaveLength(0);
    act(() => releaseButton().click());
    await settle();
    expect(released(e)[0]).toMatchObject({ layout: "bids", cohorts: ["north"] });
    expect(released(e)[0]).not.toHaveProperty("name_by");
    expect(released(e)[0]).not.toHaveProperty("name_choices");
  });

  it("tries the types in the order they stand: added last, moved and removed by their buttons, which keep the focus", async () => {
    const e = await open();
    await choose(adder()!, "pacs-id");
    await choose(adder()!, "study-id");
    expect(order()).toEqual(["Pacs id", "Study ID", "Subject code"]);
    expect(adder()).toBeNull();
    expect(button(dialog(), "Try Pacs id earlier")!.disabled).toBe(true);
    expect(button(dialog(), "Try Study ID later")!.disabled).toBe(true);
    // by the keyboard: the button holds the focus, and a press of it is its click
    const later = button(dialog(), "Try Pacs id later")!;
    later.focus();
    act(() => later.click());
    expect(order()).toEqual(["Study ID", "Pacs id", "Subject code"]);
    // at the end of the list its later button is off, so its other one takes the focus
    expect(document.activeElement).toBe(button(dialog(), "Try Pacs id earlier"));
    act(() => button(dialog(), "Try Pacs id earlier")!.click());
    expect(order()).toEqual(["Pacs id", "Study ID", "Subject code"]);
    expect(document.activeElement).toBe(button(dialog(), "Try Pacs id later"));
    act(() => button(dialog(), "Try Study ID earlier")!.click());
    await rest();
    expect(rehearsed(e).at(-1)).toMatchObject({ name_by: ["study-id", "pacs-id"], cohorts: ["north"], layout: "bids" });
    act(() => button(dialog(), "Remove Study ID")!.click());
    expect(order()).toEqual(["Pacs id", "Subject code"]);
    expect([...adder()!.options].map((o) => o.textContent)).toEqual(["Add another", "Study ID"]);
    act(() => button(dialog(), "Remove Pacs id")!.click());
    expect(order()).toEqual(["Subject code"]);
  });

  it("says how many subjects each type names and how many keep their subject code, and releases what it rehearsed", async () => {
    const e = await open();
    await choose(adder()!, "study-id");
    await choose(adder()!, "pacs-id");
    // nothing is released while the names are still being read
    expect(releaseButton().disabled).toBe(true);
    expect(foot()).toBe("Reading the names.");
    await rest();
    expect(dialog().querySelector(".name-plan")!.textContent).toBe("12 by Study ID · 3 by Pacs id · 1 by subject code");
    expect(dialog().textContent).toContain("A name keeps letters and digits only: AB_01 is written sub-AB01.");
    expect(dialog().querySelector(".name-choices")).toBeNull();
    expect(dialog().querySelector(".name-shared")).toBeNull();
    expect(releaseButton().disabled).toBe(false);
    act(() => releaseButton().click());
    await settle();
    const [body] = released(e);
    expect(body).toMatchObject({ name_by: ["study-id", "pacs-id"], cohorts: ["north"], out: "/exports/" + String(body?.name) });
    expect(body).not.toHaveProperty("name_choices");
    // the rehearsal read the body the release sent
    expect(rehearsed(e).at(-1)).toEqual(body);
    expect(host.textContent).toContain("is queued as job 88");
  });

  it("asks which ID names a subject that holds several, sends the choice, and releases only once the plan is ready", async () => {
    const needs = [
      { subject: ONE, type: "study-id", count: 2, values: ["AB_01", "AB_02"] },
      { subject: TWO, type: "study-id", count: 3, values: ["CD-7", "CD-8", "CD-9"] },
    ];
    const e = await open({
      names: (c) => {
        const chosen = ((c.body?.name_choices ?? []) as { subject: string }[]).map((x) => x.subject);
        const left = needs.filter((x) => !chosen.includes(x.subject));
        return { status: 200, body: { names: plan({ by: ["study-id"], types: [{ type: "study-id", subjects: 14 - left.length }], code: 2, chosen: chosen.length, needs_choice: left, ready: left.length === 0 }) } };
      },
    });
    await choose(adder()!, "study-id");
    await rest();
    expect(dialog().textContent).toContain("2 subjects hold several IDs. Choose the one that names each.");
    const rows = () => [...dialog().querySelectorAll(".name-choices li")];
    expect(rows().map((r) => r.querySelector(".path")!.textContent)).toEqual([ONE, TWO]);
    expect(rows()[0].textContent).toContain("2 of Study ID");
    const pick = (code: string) => dialog().querySelector<HTMLSelectElement>(`select[aria-label="ID that names ${code}"]`)!;
    expect([...pick(ONE).options].map((o) => o.textContent)).toEqual(["choose", "AB_01", "AB_02"]);
    expect(releaseButton().disabled).toBe(true);
    expect(foot()).toBe("Needs an ID chosen for 2 subjects.");

    await choose(pick(ONE), "AB_02");
    await rest();
    expect(rehearsed(e).at(-1)).toMatchObject({ name_by: ["study-id"], name_choices: [{ subject: ONE, value: "AB_02" }] });
    // the subject chosen for keeps its row, so the choice can still be changed
    expect(rows()).toHaveLength(2);
    expect(pick(ONE).value).toBe("AB_02");
    expect(dialog().textContent).toContain("1 subject holds several IDs.");
    expect(releaseButton().disabled).toBe(true);
    expect(foot()).toBe("Needs an ID chosen for 1 subject.");

    await choose(pick(TWO), "CD-7");
    await rest();
    expect(dialog().textContent).not.toContain("several IDs");
    expect(releaseButton().disabled).toBe(false);
    act(() => releaseButton().click());
    await settle();
    expect(released(e)[0]).toMatchObject({
      name_by: ["study-id"],
      name_choices: [
        { subject: ONE, value: "AB_02" },
        { subject: TWO, value: "CD-7" },
      ],
    });
  });

  it("shows no ID to a person who may not see them: the subjects, that someone else has to choose, and no release", async () => {
    await open({ names: () => ({ status: 200, body: { names: plan({ by: ["study-id"], needs_choice: [{ subject: ONE, type: "study-id", count: 2 }], values: "withheld", ready: false }) } }) });
    await choose(adder()!, "study-id");
    await rest();
    expect(dialog().textContent).toContain("1 subject holds several IDs. Someone who may see IDs has to choose.");
    expect(dialog().querySelector(".name-choices li")!.textContent).toBe(`${ONE}2 of Study ID`);
    expect(dialog().querySelector(".name-choices select")).toBeNull();
    expect(releaseButton().disabled).toBe(true);
    expect(foot()).toBe("Needs someone who may see IDs to choose the names.");
  });

  it("lists the names two subjects would share, and does not release", async () => {
    const collisions = [
      { name: "AB01", subjects: [{ subject: ONE, type: "study-id" }, { subject: TWO, type: null }] },
    ];
    const e = await open({ names: () => ({ status: 200, body: { names: plan({ by: ["study-id"], collisions, ready: false }) } }) });
    await choose(adder()!, "study-id");
    await rest();
    expect(dialog().textContent).toContain("1 name is shared by several subjects.");
    expect(dialog().querySelector(".name-shared li")!.textContent).toBe(`sub-AB01${ONE} (Study ID), ${TWO} (subject code)`);
    expect(releaseButton().disabled).toBe(true);
    expect(foot()).toBe("Needs names that differ.");
    act(() => releaseButton().click());
    await settle();
    expect(released(e)).toHaveLength(0);
  });

  it("says a refusal of the rehearsal in one line, the engine's words behind the ?, and does not release", async () => {
    const error = "name by study-id: no subject holds a kept value of study-id, so it would name nobody and every subject would keep its code. Import the IDs first (nils linkage import), or take the type out of the list. Nothing was written.";
    await open({ names: () => ({ status: 400, body: { error, disclosure: "safe" } }) });
    await choose(adder()!, "study-id");
    await rest();
    const warn = dialog().querySelector(".name-subjects .warn")!;
    expect(warn.textContent).toBe("No subject holds an ID of this type.?");
    expect(warn.querySelector(".hint")!.getAttribute("title")).toBe(error);
    expect(releaseButton().disabled).toBe(true);
    expect(foot()).toBe("The names were refused.");
  });

  it("takes the release door's 409 as the plan: its line, the engine's words behind the ?, and the choices it asks for", async () => {
    const error = `the release names its subjects by study-id and cannot name them all. 1 subject holds several values of the type that would name them: ${ONE} (2 of study-id). Say which value names each (--name-choice CODE=VALUE or a --name-choices file on the command line, name_choices in a request); the plan lists the values (nils release --name-plan, POST /api/releases/names). Nothing was written.`;
    const stopped = plan({ by: ["study-id"], needs_choice: [{ subject: ONE, type: "study-id", count: 2, values: ["AB_01", "AB_02"] }], ready: false });
    const e = await open({
      // the registry moved between the rehearsal and the release: the rehearsal was ready, the door is not
      names: (c) => ({ status: 200, body: { names: c.body?.name_choices ? plan({ by: ["study-id"], chosen: 1 }) : plan({ by: ["study-id"] }) } }),
      release: (_c, nth) => (nth === 1 ? { status: 409, body: { error, disclosure: "gated", names: stopped } } : { status: 202, body: { job: 89, state: "queued" } }),
    });
    await choose(adder()!, "study-id");
    await rest();
    expect(releaseButton().disabled).toBe(false);
    act(() => releaseButton().click());
    await settle();
    const warn = [...dialog().querySelectorAll("p.warn")].at(-1)!;
    expect(warn.textContent).toBe("Some subjects cannot be named yet.?");
    expect(warn.querySelector(".hint")!.getAttribute("title")).toBe(error);
    expect(host.textContent).not.toContain("is queued as job");
    expect(dialog().querySelector(".name-choices .path")!.textContent).toBe(ONE);
    expect(releaseButton().disabled).toBe(true);
    await choose(dialog().querySelector<HTMLSelectElement>(`select[aria-label="ID that names ${ONE}"]`)!, "AB_01");
    await rest();
    expect(releaseButton().disabled).toBe(false);
    act(() => releaseButton().click());
    await settle();
    expect(released(e).at(-1)).toMatchObject({ name_by: ["study-id"], name_choices: [{ subject: ONE, value: "AB_01" }] });
    expect(host.textContent).toContain("is queued as job 89");
  });

  it("asks a choice again once the types or their order change", async () => {
    const e = await open({
      names: (c) => ({ status: 200, body: { names: c.body?.name_choices ? plan({ by: c.body.name_by as string[] }) : plan({ by: c.body?.name_by as string[], needs_choice: [{ subject: ONE, type: "study-id", count: 2, values: ["AB_01", "AB_02"] }], ready: false }) } }),
    });
    await choose(adder()!, "study-id");
    await rest();
    await choose(dialog().querySelector<HTMLSelectElement>(`select[aria-label="ID that names ${ONE}"]`)!, "AB_01");
    await rest();
    expect(rehearsed(e).at(-1)).toHaveProperty("name_choices");
    await choose(adder()!, "pacs-id");
    await rest();
    expect(rehearsed(e).at(-1)).toMatchObject({ name_by: ["study-id", "pacs-id"] });
    expect(rehearsed(e).at(-1)).not.toHaveProperty("name_choices");
    expect(dialog().querySelector<HTMLSelectElement>(`select[aria-label="ID that names ${ONE}"]`)!.value).toBe("");
  });
});

describe("an engine without the setting", () => {
  const untouched = async (o: Parameters<typeof open>[0]) => {
    const e = await open(o);
    expect(dialog().textContent).not.toContain("name subjects by");
    expect(dialog().querySelector(".name-by")).toBeNull();
    expect([...dialog().querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["datasets", "sessions", "names", "override", "written to"]);
    await rest();
    expect(rehearsed(e)).toHaveLength(0);
    expect(foot()).toBe("Select first says what it reaches without writing anything.");
    act(() => releaseButton().click());
    await settle();
    expect(Object.keys(released(e)[0] ?? {}).sort()).toEqual(["cohorts", "layout", "name", "out"]);
    return e;
  };

  it("leaves the form as it was where the engine has no rehearsal door, and does not read the ID types for it", async () => {
    const e = await untouched({ doors: [...OLD, "GET /api/linkage/types"] });
    expect(e.of("GET", "/api/linkage/types")).toHaveLength(0);
  });

  it("leaves the form as it was where no type keeps a value, or the engine counts none kept", async () => {
    await untouched({ types: TYPES.map((t) => ({ ...t, kept: 0 })) });
  });

  it("offers no type the engine counts no kept values for", () => {
    expect(nameTypes(TYPES.map(({ kept: _kept, ...t }) => t))).toEqual([]);
    expect(nameTypes(TYPES)).toEqual([
      { name: "study-id", label: "Study ID" },
      { name: "pacs-id", label: "Pacs id" },
    ]);
  });
});

describe("the names in words", () => {
  it("moves a type one place, and not past either end", () => {
    expect(moved(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moved(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moved(["a"], "z", 1)).toEqual(["a"]);
  });

  it("counts by type in the order tried, the subject code last, and says what a plan still needs", () => {
    expect(planWords(plan({ types: [{ type: "study-id", subjects: 1200 }, { type: "pacs-id", subjects: 0 }], code: 4 }))).toBe("1,200 by Study ID · 0 by Pacs id · 4 by subject code");
    expect(planNeeds(plan())).toBeNull();
    expect(planNeeds(plan({ ready: false, needs_choice: [{ subject: ONE, type: "study-id", count: 2 }], values: "withheld" }))).toBe("someone who may see IDs to choose the names");
    expect(planNeeds(plan({ ready: false, needs_choice: [{ subject: ONE, type: "study-id", count: 2, values: ["a", "b"] }] }))).toBe("an ID chosen for 1 subject");
    expect(planNeeds(plan({ ready: false, collisions: [{ subjects: [] }] }))).toBe("names that differ");
  });

  it("keeps a chosen subject's row beside those the plan still asks for", () => {
    const one = { subject: ONE, type: "study-id", count: 2, values: ["a", "b"] };
    const two = { subject: TWO, type: "study-id", count: 2, values: ["c", "d"] };
    expect(asked([], {}, { needs_choice: [two, one] })).toEqual([one, two]);
    expect(asked([one, two], { [ONE]: "a" }, { needs_choice: [two] })).toEqual([one, two]);
    // a subject neither asked for nor chosen for is let go
    expect(asked([one, two], { [ONE]: "" }, { needs_choice: [two] })).toEqual([two]);
  });

  it("says what a release named its subjects by, and nothing of one that kept the subject codes", () => {
    const named: Pick<Release, "name_by" | "names"> = { name_by: ["study-id", "pacs-id"], names: { types: [{ type: "study-id", subjects: 12 }, { type: "pacs-id", subjects: 3 }], code: 1, chosen: 2 } };
    expect(namedWords(named)).toBe("Study ID 12 · Pacs id 3 · subject code 1");
    expect(namedWords({ name_by: ["study-id"], names: { types: [{ type: "study-id", subjects: 16 }], code: 0 } })).toBe("Study ID 16");
    expect(namedWords({ name_by: ["study-id"], names: null })).toBe("Study ID");
    for (const r of [{}, { name_by: null, names: null }, { name_by: [] }]) expect(namedWords(r)).toBeNull();
  });
});
