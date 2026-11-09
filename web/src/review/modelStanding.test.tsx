// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Review / Proposals per model and axis (UX round 1, 2026-11-05): the door's
// counts read evenly; one card per model and axis with its two acts, each
// where the grants and the doors allow it; the commit's confirm counts what
// it puts in force and says the scans re-sort, commits by the model and the
// axis alone, and the page shows what is left; the campaign of the rest asks
// only its name, prefilled, and lands on the new campaign; an engine without
// the counts keeps the change matrix; and arriving at Review's page shows its
// head and tabs.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, settle } from "../../test/safeWayIn";
import { GRANTS, type Grant } from "../grants";
import { capsWith } from "./caps.fixture";
import { fakeEngine, type FakeCall } from "./mainScans.fixture";
import { commitStandingBody, standingActs, standingOf, type Standing } from "./modelFamily";
import { ReviewPage } from "./ReviewPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/review", "GET /api/review/summary", "GET /api/review/proposals", "POST /api/review/proposals/campaign", "POST /api/decisions/commit", "POST /api/decisions/{id}/commit", "POST /api/decisions/{id}/withdraw"];
const ALL = capsWith(DOORS, [...GRANTS] as Grant[]);

const row = (over: Record<string, unknown> = {}) => ({
  model: { id: 7, name: "bp-head", version: "1", digest: "sha256:aa", state: "admitted" },
  label: "bp-head@1",
  axis: "body_part",
  threshold: 0.9,
  thresholds: [0.9],
  staged: { groups: 9, stacks: 1250 },
  held: { groups: 1, stacks: 46 },
  commit: { groups: 8, stacks: 1204 },
  drifted: 3,
  below: { groups: 30, stacks: 4838 },
  asked: { groups: 0, stacks: 0 },
  campaigns: [],
  runs: [162],
  name: "bp-head-body_part-unsure",
  ...over,
});

describe("a model's proposals per model and axis", () => {
  it("reads the door's rows evenly", () => {
    const s = standingOf(row()) as Standing;
    expect(s).toMatchObject({ label: "bp-head@1", axis: "body_part", threshold: 0.9, commit: { stacks: 1204 }, below: { stacks: 4838 }, drifted: 3, name: "bp-head-body_part-unsure" });
    // an older row without commit counts staged less held
    const older = standingOf({ ...row(), commit: undefined, label: undefined, name: undefined }) as Standing;
    expect(older.commit).toEqual({ groups: 8, stacks: 1204 });
    expect(older.label).toBe("bp-head@1");
    expect(older.name).toBe("bp-head-body_part-unsure");
    expect(standingOf({ axis: "body_part" })).toBeNull();
  });
  it("offers each act by grant and door", () => {
    expect(standingActs(ALL)).toEqual({ reads: true, commit: true, campaign: true });
    expect(standingActs(capsWith(DOORS, ["review:see", "review:work"]))).toEqual({ reads: true, commit: true, campaign: false });
    expect(standingActs(capsWith(DOORS, ["review:see"]))).toEqual({ reads: true, commit: false, campaign: false });
    expect(standingActs(capsWith(["GET /api/review"], [...GRANTS] as Grant[])).reads).toBe(false);
  });
  it("commits by the model and the axis alone, anyway only where some were staged before the registry moved", () => {
    expect(commitStandingBody(standingOf(row()) as Standing)).toEqual({ model: "7", axis: "body_part", anyway: true });
    expect(commitStandingBody(standingOf(row({ drifted: 0 })) as Standing)).toEqual({ model: "7", axis: "body_part" });
  });
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  location.hash = "#review/proposals";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function engine(rows: () => unknown[], more: (c: FakeCall) => { status: number; body?: unknown } | undefined = () => undefined) {
  return fakeEngine((c) => {
    const mine = more(c);
    if (mine) return mine;
    if (c.method === "GET" && c.path === "/api/review/proposals") return { status: 200, body: { count: rows().length, proposals: rows() } };
    if (c.method === "GET" && c.path === "/api/review") return { status: 200, body: { count: 0, items: [] } };
    if (c.method === "GET" && c.path === "/api/review/summary") return { status: 200, body: { by_kind: {}, cohorts: [], none: 0 } };
    return undefined;
  });
}

async function open(caps = ALL) {
  act(() => root.render(<ReviewPage caps={caps} page="proposals" />));
  await settle(8);
}

const press = (words: string | RegExp, within: ParentNode = host) => act(() => button(within, words)!.click());
const dialog = () => host.querySelector<HTMLDialogElement>("dialog[open]");

describe("the Proposals page", () => {
  it("draws a card per model and axis with its two acts", async () => {
    engine(() => [row(), row({ model: { id: 8, name: "region", version: "2" }, label: "region@2", axis: "body_region", commit: { groups: 0, stacks: 0 }, staged: { groups: 0, stacks: 0 }, held: { groups: 0, stacks: 0 }, below: { groups: 0, stacks: 0 }, asked: { groups: 2, stacks: 60 }, campaigns: [{ id: 4, name: "region-r1" }] })]);
    await open();
    const cards = [...host.querySelectorAll<HTMLElement>(".proposal-card")];
    expect(cards.map((c) => c.querySelector("h2")?.textContent)).toEqual(["body_part", "body_region"]);
    expect([...cards[0].querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Commit the 1,204 at or above the threshold", "Make a campaign of the other 4,838 for me"]);
    expect(cards[0].textContent).toContain("threshold 0.90");
    expect(cards[0].textContent).toContain("46 staged wait for an open campaign to close.");
    // nothing to act on: where they are asked, with the way there
    expect(cards[1].querySelectorAll("button")).toHaveLength(0);
    expect(cards[1].querySelector("a")?.getAttribute("href")).toBe("#review/campaigns/4");
    expect(cards[1].textContent).toContain("60 asked in region-r1.");
    // the matrix is one open away, read only when opened
    expect(host.querySelector("details.proposal-groups summary")?.textContent).toBe("Value by value");
    expect(host.textContent).not.toContain("body_part now");
  });

  it("commits after a one-paragraph confirm whose button goes quiet while the call is out; the dialog closes on the answer, the page follows the re-sort and shows what is left", async () => {
    // the follow reads the job every few seconds: the clock is moved by hand
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let committed = false;
    let answer: (() => void) | null = null;
    let jobReads = 0;
    const e = engine(
      () => [committed ? row({ staged: { groups: 1, stacks: 46 }, commit: { groups: 0, stacks: 0 }, drifted: 0 }) : row()],
      (c) => {
        if (c.method === "POST" && c.path === "/api/decisions/commit") {
          committed = true;
          return { status: 200, body: { committed: [1, 2, 3, 4, 5, 6, 7, 8], items: 8, left: 1, split: [], resort: { state: "queued", job: 356, stacks: 1204, words: "1,204 scan(s) to sort again, queued as job 356" } } };
        }
        if (c.method === "GET" && c.path === "/api/jobs/356") {
          jobReads += 1;
          const done = jobReads === 1 ? 700 : 1204;
          return { status: 200, body: { id: 356, kind: "resort", name: "re-sort after astrid committed 8 decision(s)", state: done < 1204 ? "running" : "done", progress: { done, of: 1204, what: "scans" }, error: null, result: null } };
        }
        return undefined;
      },
    );
    await open();
    press("Commit the 1,204 at or above the threshold");
    const d = dialog()!;
    expect(d.querySelector("h2")?.textContent).toBe("Commit at or above the threshold");
    // finding 3: the person's words, and nothing else
    expect(d.querySelector(".lede")?.textContent).toBe("1,204 scans get body part = what the model proposed, at 0.90 or above, in your name. Every page shows it once they are sorted again.");
    expect(d.querySelectorAll(".dialog-body p")).toHaveLength(1);
    expect(d.textContent).not.toContain("In force under your name");
    expect(d.textContent).not.toContain("proposed before the data changed");
    // finding 1: the button is quiet while the call is out
    const hold = new Promise<void>((r) => (answer = r));
    const fetched = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = await fetched(input, init);
      if (init?.method === "POST") await hold;
      return r;
    });
    press("Commit 1,204", d);
    await settle(2);
    const commit = button(d, /Committing/u) as HTMLButtonElement;
    expect(commit.disabled).toBe(true);
    expect(dialog()).not.toBeNull();
    act(() => answer!());
    await settle(8);
    expect(e.of("POST", "/api/decisions/commit").map((c) => c.body)).toEqual([{ model: "7", axis: "body_part", anyway: true }]);
    // the dialog closes the moment the engine answers; the page says what happened and follows the job
    expect(dialog()).toBeNull();
    expect(host.querySelector(".said")?.textContent).toMatch(/^Committed 1,204 body part answers · (sorting them again \(job 356\)|700 of 1,204 sorted again \(job 356\))$/u);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    await settle(8);
    expect(host.querySelector(".said")?.textContent).toBe("Committed 1,204 body part answers · 1,204 of 1,204 sorted again");
    expect(jobReads).toBe(2);
    // what is left: the campaign of the rest alone
    expect([...host.querySelectorAll(".proposal-card button")].map((b) => b.textContent)).toEqual(["Make a campaign of the 4,838 for me"]);
  });

  it("says an older engine's re-sort words as they come", async () => {
    engine(
      () => [row()],
      (c) => (c.method === "POST" && c.path === "/api/decisions/commit" ? { status: 200, body: { committed: [1], items: 1, left: 0, split: [], resort: { state: "done", stacks: 1204, sorted: 1204, words: "re-sorted 1,204 scans" } } } : undefined),
    );
    await open();
    press("Commit the 1,204 at or above the threshold");
    press("Commit 1,204", dialog()!);
    await settle(8);
    expect(dialog()).toBeNull();
    expect(host.querySelector(".said")?.textContent).toBe("Committed 1,204 body part answers. Re-sorted 1,204 scans.");
  });

  it("makes the rest a campaign for the person: its name, how many, which first and what it would take, then lands on it", async () => {
    const e = engine(
      () => [row({ below: { groups: 30, stacks: 4838, pace_s: 10.2 } })],
      (c) => (c.method === "POST" && c.path === "/api/review/proposals/campaign" ? { status: 201, body: { campaign: { id: 12, name: String(c.body?.name) }, adopted: 4, suggestions: { suggestions: 500 }, counts: {}, left: 4338, limit: 500, order: "most_sure", seed: null } } : undefined),
    );
    await open();
    press("Make a campaign of the other 4,838 for me");
    const d = dialog()!;
    expect(d.querySelector(".lede")?.textContent).toBe("4,838 scans bp-head is unsure of, below 0.90: its answer filled in, for you to accept or correct.");
    const name = d.querySelector<HTMLInputElement>("input")!;
    expect(name.value).toBe("bp-head-body_part-unsure");
    // finding 9: a cap, 500 by default with the whole lot as the second choice, an order, and the estimate at the axis's pace
    const radios = (group: string) => [...d.querySelectorAll<HTMLButtonElement>(`[role=radiogroup][aria-label="${group}"] [role=radio]`)];
    expect(radios("How many").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["500", "true"],
      ["All 4,838", "false"],
    ]);
    expect(radios("Which first").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["Least sure first", "true"],
      ["Most sure first", "false"],
      ["Random", "false"],
    ]);
    expect(d.querySelector(".rest-estimate")?.textContent).toBe("You alone read them: about 1 h 25 min at 10 s a scan.");
    expect(button(d, /^Make a campaign of/u)?.textContent).toBe("Make a campaign of 500");
    act(() => radios("How many")[1].click());
    expect(d.querySelector(".rest-estimate")?.textContent).toBe("You alone read them: about 13 h 42 min at 10 s a scan.");
    expect(button(d, /^Make a campaign of/u)?.textContent).toBe("Make a campaign of 4,838");
    act(() => radios("How many")[0].click());
    act(() => radios("Which first")[1].click());
    press("Make a campaign of 500", d);
    await settle(8);
    expect(e.of("POST", "/api/review/proposals/campaign").map((c) => c.body)).toEqual([{ model: "7", axis: "body_part", name: "bp-head-body_part-unsure", limit: 500, order: "most_sure" }]);
    expect(location.hash).toBe("#review/campaigns/12");
  });

  it("offers the whole lot alone where it is under the cap, and no estimate where the engine knows no pace", async () => {
    engine(() => [row({ below: { groups: 3, stacks: 190 } })]);
    await open();
    press("Make a campaign of the other 190 for me");
    const d = dialog()!;
    expect([...d.querySelectorAll('[role=radiogroup][aria-label="How many"] [role=radio]')].map((r) => r.textContent)).toEqual(["All 190"]);
    expect(d.querySelector(".rest-estimate")?.textContent).toBe("You alone read them.");
    expect(button(d, /^Make a campaign of/u)?.textContent).toBe("Make a campaign of 190");
  });

  it("says a refusal and stays open", async () => {
    engine(
      () => [row()],
      (c) => (c.method === "POST" && c.path === "/api/review/proposals/campaign" ? { status: 409, body: { error: "a campaign named bp-head-body_part-unsure exists" } } : undefined),
    );
    await open();
    press("Make a campaign of the other 4,838 for me");
    press(/^Make a campaign of/u, dialog()!);
    await settle(8);
    expect(dialog()?.querySelector(".warn")?.textContent).toBe("Refused: a campaign named bp-head-body_part-unsure exists");
    expect(location.hash).toBe("#review/proposals");
  });

  it("leaves the acts shut to a person who may only see", async () => {
    engine(() => [row()]);
    await open(capsWith(DOORS, ["review:see"]));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".proposal-card button")];
    expect(buttons.map((b) => b.disabled)).toEqual([true, true]);
  });

  it("keeps the change matrix on an engine without the counts", async () => {
    engine(() => []);
    await open(capsWith(DOORS.filter((d) => d !== "GET /api/review/proposals"), [...GRANTS] as Grant[]));
    expect(host.querySelector(".proposal-card")).toBeNull();
    expect(host.textContent).toContain("Nothing proposed. A model run from Pipelines proposes its values here.");
  });

  it("shows its head and tabs on arrival, whatever the last page's scroll", async () => {
    const seen: { el: Element; how: unknown }[] = [];
    Element.prototype.scrollIntoView = function (this: Element, how?: unknown) {
      seen.push({ el: this, how });
    } as typeof Element.prototype.scrollIntoView;
    engine(() => [row()]);
    await open();
    const head = host.querySelector("section.data.review");
    expect(seen.some((s) => s.el === head && JSON.stringify(s.how) === JSON.stringify({ block: "start" }))).toBe(true);
    expect(head?.querySelector(".chips.pages .opt.on")?.textContent).toMatch(/^Proposals/u);
  });
});
