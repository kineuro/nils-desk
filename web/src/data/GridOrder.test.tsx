// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The order of the grid's subjects (2026-11-12): the order of what they are
// shown by comes first and is the default, worded as the shown type is (the
// subject code, or an ID type's own name); an engine before `order=id`
// refuses the word once and is asked the code's order in its place; and an
// order kept before the change does not hold a person on the old default.

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { parse } from "../routes";

vi.mock("./ScanViewer", () => ({ markOpen: () => undefined, ScanViewer: () => <div data-testid="viewer" /> }));

const { Viewer } = await import("./Viewer");
const { forgetHeld, ID_ORDER_REFUSED_FOR, KEPT } = await import("./viewer");
const { forgetOrigins } = await import("./origins");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/datasets/{name}/scans", "GET /api/datasets/{name}/subjects", "GET /api/datasets/{name}/subjects/{subject}/visits"];
const caps = {
  engine: { engine: { name: "nils", version: "1" }, contracts: { openapi: "7" }, doors: DOORS, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "astrid", display_name: "Astrid", grants: ["data:see"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

function Harness() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  if (route.sub !== "view" || !route.arg) return <div data-testid="away" />;
  return <Viewer key={route.arg} caps={caps} scope={{ kind: "dataset", name: route.arg }} query={route.query} onSections={() => undefined} />;
}

const subject = (id: number, code: string, label = code) => ({ id, code, label, visits: 1, scans: 5, look: 0, regions: ["brain"], makers: ["GE"], main: ["t1w"] });
// as an engine with `order=id` answers them shown by Study ID: S2 before S10, the subject without one last
const BY_STUDY_ID = [subject(3, "sub-c3", "S2"), subject(1, "sub-a1", "S10"), subject(2, "sub-b2")];
const BY_CODE = [subject(1, "sub-a1"), subject(2, "sub-b2"), subject(3, "sub-c3")];
const VISITS = {
  scope: { kind: "dataset", name: "ms-a", id: 7 },
  detail: "quasi",
  name: "date",
  subject: { id: 2, code: "sub-b2", label: "sub-b2" },
  totals: { visits: 1, scans: 5, look: 0, span: "0" },
  matched: 1,
  visits: [{ session: 40, studies: [9], label: "ses-20210101", first: "2021-01-01", day: "0", number: 1, scans: 5, look: 0, regions: ["brain"], kinds: [{ kind: "T1w", scans: 1 }], contrast: false, symri: 0, main: [] }],
};

const AT = "/api/datasets/ms-a/subjects";

describe("the order of the grid's subjects", () => {
  let root: Root;
  let el: HTMLDivElement;
  let calls: string[];
  /** Whether the engine reads `order=id`; one before it refuses the word as it refuses any it does not know. */
  let reads: boolean;

  beforeEach(() => {
    calls = [];
    reads = true;
    forgetHeld();
    forgetOrigins();
    localStorage.clear();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      const u = new URL(url, "http://desk");
      const q = u.searchParams;
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
      if (u.pathname === AT) {
        const order = q.get("order") ?? "look";
        if (order === "id" && !reads) return json({ error: "order: id is not look, code, visits or scans" }, 400);
        if (q.get("show") === "gone") return json({ error: "show: gone is no ID type" }, 400);
        const show = q.get("show") ?? "code";
        const subjects = show === "study-id" && order === "id" ? BY_STUDY_ID : BY_CODE;
        return json({ scope: { kind: "dataset", name: "ms-a", id: 7 }, detail: "quasi", show, order, totals: { subjects: 3, visits: 3, scans: 15, look: 0 }, matched: 3, count: 3, subjects, next: null, facets: { makers: [], regions: [], roles: [], id_types: [{ name: "study-id", subjects: 2 }] } });
      }
      if (u.pathname === `${AT}/2/visits`) return json(VISITS);
      return json({}, 404);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const settle = async () => {
    for (let k = 0; k < 4; k++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
  };
  const open = async (hash = "#data/datasets/ms-a/view") => {
    location.hash = hash;
    await settle();
    act(() => root.render(<Harness />));
    await settle();
  };
  const close = () => act(() => root.render(<div />));
  const pick = async (id: string, value: string) => {
    const select = el.querySelector<HTMLSelectElement>(`#${id}`)!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  };
  const asked = () => calls.filter((c) => c.startsWith(`${AT}?`)).map((c) => c.slice(AT.length + 1));
  const orders = () => [...el.querySelectorAll("#vw-order option")].map((o) => o.textContent);
  const names = () => [...el.querySelectorAll(".vw-card .vw-card-name")].map((x) => x.textContent);

  it("asks the order of what subjects are shown by first, worded Subject code where they are shown by it", async () => {
    await open();
    expect(asked()).toEqual(["limit=60&order=id&show=code"]);
    expect(el.querySelector<HTMLSelectElement>("#vw-order")!.value).toBe("id");
    expect(orders()).toEqual(["Subject code", "Most to look at first", "Most visits", "Most scans"]);
    expect(names()).toEqual(["sub-a1", "sub-b2", "sub-c3"]);
    // the other orders stay, and are asked as they were
    await pick("vw-order", "visits");
    expect(asked().pop()).toBe("limit=60&order=visits&show=code");
  });

  it("words that order as the ID type subjects are shown by, and asks the same word", async () => {
    await open();
    await pick("vw-show", "study-id");
    expect(asked().pop()).toBe("limit=60&order=id&show=study-id");
    expect(orders()).toEqual(["Study ID", "Most to look at first", "Most visits", "Most scans"]);
    expect(el.querySelector<HTMLSelectElement>("#vw-order")!.value).toBe("id");
    // the engine's order as it comes: S2 before S10, the subject without a Study ID last
    expect(names()).toEqual(["S2", "S10", "sub-b2"]);
    // never the bare word
    expect(orders()).not.toContain("Code");
    await pick("vw-show", "code");
    expect(orders()[0]).toBe("Subject code");
  });

  it("asks an engine before it the code's order in its place, after one refusal and not again for a while", async () => {
    reads = false;
    await open();
    expect(asked()).toEqual(["limit=60&order=id&show=code", "limit=60&order=code&show=code"]);
    // the select works as with any engine: the same entry chosen, the subjects there, nothing said to have failed
    expect(el.querySelector<HTMLSelectElement>("#vw-order")!.value).toBe("id");
    expect(orders()[0]).toBe("Subject code");
    expect(names()).toEqual(["sub-a1", "sub-b2", "sub-c3"]);
    expect(el.querySelector(".note.blocked, .vw-failed")).toBeNull();
    expect(el.textContent).not.toContain("order: id");
    // every ask after it goes straight to the code's order, shown by a type too
    await pick("vw-show", "study-id");
    expect(asked().slice(2)).toEqual(["limit=60&order=code&show=study-id"]);
    expect(el.querySelector<HTMLSelectElement>("#vw-show")!.value).toBe("study-id");
    await pick("vw-order", "look");
    await pick("vw-order", "id");
    expect(asked().slice(3)).toEqual(["limit=60&order=look&show=study-id"]);
    // an engine updated under the open page is asked the word again once the refusal is old
    reads = true;
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + ID_ORDER_REFUSED_FOR + 1);
    await pick("vw-show", "code");
    expect(asked().pop()).toBe("limit=60&order=id&show=code");
  });

  it("still turns back to the subject codes where the engine refuses the ID type, not the order", async () => {
    localStorage.setItem(KEPT.show, "gone");
    await open();
    expect(asked()).toEqual(["limit=60&order=id&show=gone", "limit=60&order=id&show=code"]);
    expect(names()).toEqual(["sub-a1", "sub-b2", "sub-c3"]);
  });

  it("does not hold a person on an order kept before the change, and keeps the one they choose now", async () => {
    // what the desk kept before 2026-11-12, under the first key: the old default, or a choice
    localStorage.setItem("nils.viewer.order", "look");
    expect(KEPT.order).not.toBe("nils.viewer.order");
    await open();
    expect(asked()).toEqual(["limit=60&order=id&show=code"]);
    expect(el.querySelector<HTMLSelectElement>("#vw-order")!.value).toBe("id");
    // a choice made now is kept, under the key of now
    await pick("vw-order", "scans");
    expect(localStorage.getItem(KEPT.order)).toBe("scans");
    close();
    calls = [];
    forgetHeld();
    await open();
    expect(asked()).toEqual(["limit=60&order=scans&show=code"]);
    // the old word for the code's order, were it ever kept under the new key, is no choice either
    close();
    localStorage.setItem(KEPT.order, "code");
    calls = [];
    forgetHeld();
    await open();
    expect(asked()).toEqual(["limit=60&order=id&show=code"]);
  });

  it("walks to the subjects around one in the same order", async () => {
    await open("#data/datasets/ms-a/view?mode=grid&subject=2");
    expect(asked()).toEqual(["limit=60&order=id&show=code"]);
  });
});
